import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { 
  ShieldAlert, 
  ShieldCheck, 
  Zap, 
  Activity, 
  UserX, 
  RefreshCw, 
  Save, 
  Loader2, 
  Search, 
  Ban, 
  Clock, 
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Users
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { io } from "socket.io-client";

interface TrackedUser {
  id: number;
  telegramId: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  balance: number;
  isBanned?: boolean;
  bannedUntil?: string;
  isTempBanned?: boolean;
  spamViolations: number;
  lastRequestAt?: string;
  reqPerMin: number;
}

interface SpamStatsResponse {
  autoBanEnabled: boolean;
  maxReqPerMin: number;
  tempBanDurationMins: number;
  totalMonitoredUsers: number;
  totalBannedUsers: number;
  users: TrackedUser[];
}

export default function SpamProtectorPage() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | "high_risk" | "banned">("all");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  // Main Anti-Spam Data Query (Bypass memory cache, always fetch fresh DB values!)
  const { data, isLoading, refetch, isFetching } = useQuery<SpamStatsResponse>({
    queryKey: ["/api/spam-protector/stats"],
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
  });

  // Local Form Controls for Configuration
  const [autoBanEnabled, setAutoBanEnabled] = useState<boolean>(true);
  const [maxReqInput, setMaxReqInput] = useState<string>("");
  const [tempBanInput, setTempBanInput] = useState<string>("");

  // Sync Form inputs with server data whenever fresh data arrives
  useEffect(() => {
    if (data) {
      setAutoBanEnabled(Boolean(data.autoBanEnabled));
      setMaxReqInput(String(data.maxReqPerMin ?? 15));
      setTempBanInput(String(data.tempBanDurationMins ?? 15));
    }
  }, [data?.maxReqPerMin, data?.tempBanDurationMins, data?.autoBanEnabled]);

  // Setup WebSocket real-time updates listener
  useEffect(() => {
    const socket = io();
    socket.on("spam_stats_update", () => {
      refetch();
    });
    socket.on("admin_notification", () => {
      refetch();
    });
    return () => {
      socket.disconnect();
    };
  }, [refetch]);

  // Configuration Save Mutation
  const configMutation = useMutation({
    mutationFn: async (config: { autoBanEnabled: boolean; maxReqPerMin: number; tempBanDurationMins: number }) => {
      const res = await apiRequest("POST", "/api/spam-protector/config", config);
      return res.json();
    },
    onSuccess: (resData) => {
      if (resData) {
        const newAutoBan = Boolean(resData.autoBanEnabled);
        const newMaxReq = Number(resData.maxReqPerMin) || 15;
        const newTempMins = Number(resData.tempBanDurationMins) || 15;

        setAutoBanEnabled(newAutoBan);
        setMaxReqInput(String(newMaxReq));
        setTempBanInput(String(newTempMins));

        queryClient.setQueryData<SpamStatsResponse>(["/api/spam-protector/stats"], (old) => {
          if (!old) return old;
          return {
            ...old,
            autoBanEnabled: newAutoBan,
            maxReqPerMin: newMaxReq,
            tempBanDurationMins: newTempMins,
          };
        });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/spam-protector/stats"] });
      refetch();
      toast({
        title: "🛡️ Anti-Spam Rules Saved",
        description: `Max requests per min set to ${maxReqInput} and penalty to ${tempBanInput} mins.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Save Failed",
        description: error.message || "Failed to update anti-spam rules.",
        variant: "destructive",
      });
    }
  });

  const handleConfigSave = () => {
    const rawMaxReq = parseInt(maxReqInput.trim(), 10);
    const rawTempMins = parseInt(tempBanInput.trim(), 10);

    const maxReqNum = !isNaN(rawMaxReq) && rawMaxReq > 0 ? rawMaxReq : 15;
    const tempMinsNum = !isNaN(rawTempMins) && rawTempMins > 0 ? rawTempMins : 15;

    setMaxReqInput(String(maxReqNum));
    setTempBanInput(String(tempMinsNum));

    configMutation.mutate({
      autoBanEnabled,
      maxReqPerMin: maxReqNum,
      tempBanDurationMins: tempMinsNum,
    });
  };

  // Ban/Unban Action Mutation
  const banMutation = useMutation({
    mutationFn: async ({ userId, action }: { userId: number; action: string }) => {
      const res = await apiRequest("POST", "/api/spam-protector/ban", { userId, action });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/spam-protector/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/telegram-users"] });
      refetch();
      toast({
        title: "User Restrictions Updated",
        description: "User ban status has been updated successfully.",
      });
    },
  });

  // Filter & Pagination Logic
  const maxLimit = data?.maxReqPerMin ?? 15;
  const users = data?.users || [];

  const filteredUsers = users.filter((u) => {
    // Tab Filter
    if (activeTab === "banned" && !(u.isBanned || u.isTempBanned)) return false;
    if (activeTab === "high_risk" && u.reqPerMin < maxLimit * 0.7) return false;

    // Search Filter
    const searchLower = search.toLowerCase();
    const fullName = `${u.firstName || ""} ${u.lastName || ""}`.toLowerCase();
    const username = u.username?.toLowerCase() || "";
    const telegramId = String(u.telegramId || "").toLowerCase();
    return fullName.includes(searchLower) || username.includes(searchLower) || telegramId.includes(searchLower);
  });

  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage) || 1;
  const paginatedUsers = filteredUsers.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const highRiskCount = users.filter(u => u.reqPerMin >= maxLimit * 0.7 || u.reqPerMin > maxLimit).length;
  const bannedCount = data?.totalBannedUsers ?? 0;

  return (
    <div className="space-y-8 animate-in pb-12">
      {/* Top Banner Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-purple-900/40 via-red-950/30 to-black/60 p-6 rounded-3xl border border-white/10 shadow-2xl backdrop-blur-xl">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-red-500/20 border border-red-500/30 rounded-2xl text-red-400">
              <ShieldAlert className="w-8 h-8 animate-pulse" />
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-black tracking-tight text-white">
                Spam Protector & Security Hub
              </h1>
              <p className="text-white/60 text-sm font-medium mt-0.5">
                Sliding-window request rate limiter, automated spam prevention, & user access enforcement.
              </p>
            </div>
          </div>
        </div>

        <Button
          onClick={() => refetch()}
          disabled={isFetching}
          variant="outline"
          className="glass-panel border-white/20 text-white hover:bg-white/10 h-11 px-5 rounded-xl font-bold text-sm"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? "animate-spin text-purple-400" : ""}`} />
          {isFetching ? "Refreshing..." : "Live Refresh"}
        </Button>
      </div>

      {/* Key Metric Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
        <Card className="glass-card border-0 bg-gradient-to-br from-purple-950/40 to-black/60 shadow-xl">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-white/50">Monitored Users</p>
                <h2 className="text-3xl font-black text-white mt-1">{data?.totalMonitoredUsers ?? 0}</h2>
              </div>
              <Users className="w-9 h-9 text-purple-400 opacity-80" />
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card border-0 bg-gradient-to-br from-red-950/40 to-black/60 shadow-xl">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-white/50">Banned / Suspended</p>
                <h2 className="text-3xl font-black text-red-400 mt-1">{bannedCount}</h2>
              </div>
              <UserX className="w-9 h-9 text-red-400 opacity-80" />
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card border-0 bg-gradient-to-br from-amber-950/40 to-black/60 shadow-xl">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-white/50">Max Rate Limit</p>
                <h2 className="text-3xl font-black text-amber-400 mt-1">
                  {isLoading ? <Loader2 className="w-6 h-6 animate-spin inline" /> : (data?.maxReqPerMin ?? 15)}{" "}
                  <span className="text-xs font-normal text-white/50">req / min</span>
                </h2>
              </div>
              <Zap className="w-9 h-9 text-amber-400 opacity-80" />
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card border-0 bg-gradient-to-br from-emerald-950/40 to-black/60 shadow-xl">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-white/50">Auto-Ban Engine</p>
                <h2 className="text-xl font-black mt-2">
                  {isLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : data?.autoBanEnabled ? (
                    <span className="text-emerald-400 flex items-center gap-1.5"><ShieldCheck className="w-5 h-5" /> ACTIVE</span>
                  ) : (
                    <span className="text-red-400 flex items-center gap-1.5"><AlertTriangle className="w-5 h-5" /> DISABLED</span>
                  )}
                </h2>
              </div>
              <ShieldCheck className="w-9 h-9 text-emerald-400 opacity-80" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Anti-Spam Configuration Card */}
      <Card className="glass-card border-0 border-white/10 bg-[#130d24]/90 shadow-2xl">
        <CardHeader className="border-b border-white/10 pb-5">
          <CardTitle className="text-white text-xl font-bold flex items-center gap-2.5">
            <Zap className="w-5 h-5 text-amber-400" /> Rate Limiter & Auto-Ban Configuration
          </CardTitle>
          <CardDescription className="text-white/60 text-xs">
            Set maximum allowed requests per minute. Users exceeding this limit will be automatically suspended.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Auto Ban Switch */}
            <div className="glass-panel p-5 rounded-2xl border-white/10 flex items-center justify-between bg-black/30">
              <div>
                <Label className="text-white font-bold text-sm">Automatic Auto-Ban</Label>
                <p className="text-xs text-white/50 mt-1">Auto-suspend spammers exceeding rate limit.</p>
              </div>
              <Switch
                disabled={isLoading}
                checked={autoBanEnabled}
                onCheckedChange={setAutoBanEnabled}
                className="data-[state=checked]:bg-emerald-500"
              />
            </div>

            {/* Max Req per Min */}
            <div className="glass-panel p-5 rounded-2xl border-white/10 space-y-2 bg-black/30">
              <Label className="text-white font-bold text-sm">Max Requests Per Minute</Label>
              <Input
                type="number"
                min="1"
                max="500"
                disabled={isLoading}
                value={maxReqInput}
                onChange={(e) => setMaxReqInput(e.target.value)}
                placeholder={isLoading ? "Loading..." : "15"}
                className="glass-panel border-white/10 text-white font-bold h-11 text-base bg-black/40"
              />
            </div>

            {/* Temp Ban Duration */}
            <div className="glass-panel p-5 rounded-2xl border-white/10 space-y-2 bg-black/30">
              <Label className="text-white font-bold text-sm">Auto-Ban Penalty Duration (Mins)</Label>
              <Input
                type="number"
                min="1"
                max="1440"
                disabled={isLoading}
                value={tempBanInput}
                onChange={(e) => setTempBanInput(e.target.value)}
                placeholder={isLoading ? "Loading..." : "15"}
                className="glass-panel border-white/10 text-white font-bold h-11 text-base bg-black/40"
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button
              onClick={handleConfigSave}
              disabled={configMutation.isPending || isLoading}
              className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-bold px-8 h-12 rounded-xl shadow-lg transition-all"
            >
              {configMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Save className="w-5 h-5 mr-2" />}
              Save Anti-Spam Rules
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* User Activity & Risk Monitor Card */}
      <Card className="glass-card border-0 border-white/10 bg-[#130d24]/90 shadow-2xl">
        <CardHeader className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-white text-xl font-bold flex items-center gap-2.5">
                <Activity className="w-5 h-5 text-purple-400" /> Live Request Rate & User Tracker
              </CardTitle>
              <CardDescription className="text-white/60 text-xs">
                Real-time request frequency & security status monitoring across all bot users.
              </CardDescription>
            </div>

            {/* Search Input */}
            <div className="relative max-w-xs w-full">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
              <Input
                placeholder="Filter users..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setCurrentPage(1);
                }}
                className="glass-panel pl-9 border-white/10 text-white text-sm h-10 bg-black/30"
              />
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/10">
            <Button
              variant={activeTab === "all" ? "default" : "ghost"}
              onClick={() => { setActiveTab("all"); setCurrentPage(1); }}
              className={`rounded-xl text-xs font-bold h-9 px-4 ${
                activeTab === "all" ? "bg-purple-600 text-white" : "text-white/60 hover:text-white hover:bg-white/5"
              }`}
            >
              All Users ({users.length})
            </Button>
            <Button
              variant={activeTab === "high_risk" ? "default" : "ghost"}
              onClick={() => { setActiveTab("high_risk"); setCurrentPage(1); }}
              className={`rounded-xl text-xs font-bold h-9 px-4 ${
                activeTab === "high_risk" ? "bg-amber-600 text-white" : "text-white/60 hover:text-white hover:bg-white/5"
              }`}
            >
              ⚠️ High Risk / Violations ({highRiskCount})
            </Button>
            <Button
              variant={activeTab === "banned" ? "default" : "ghost"}
              onClick={() => { setActiveTab("banned"); setCurrentPage(1); }}
              className={`rounded-xl text-xs font-bold h-9 px-4 ${
                activeTab === "banned" ? "bg-red-600 text-white" : "text-white/60 hover:text-white hover:bg-white/5"
              }`}
            >
              🚫 Banned Users ({bannedCount})
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          <div className="space-y-3">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-12 space-y-3">
                <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
                <p className="text-white/50 text-sm font-medium">Loading user activity tracker...</p>
              </div>
            ) : paginatedUsers.length === 0 ? (
              <div className="text-center text-white/40 py-12 glass-panel rounded-2xl border-white/10">
                <Users className="w-10 h-10 mx-auto opacity-30 mb-2" />
                <p className="font-bold text-white/60">No user activity matches the criteria.</p>
              </div>
            ) : (
              paginatedUsers.map((user) => {
                const isHighRisk = user.reqPerMin >= maxLimit * 0.7;
                const isViolation = user.reqPerMin > maxLimit;

                return (
                  <div
                    key={user.id}
                    className={`glass-panel p-4 rounded-2xl border border-white/10 flex flex-wrap items-center justify-between gap-4 transition-all duration-200 bg-black/20 hover:bg-black/40 ${
                      user.isBanned
                        ? "border-red-500/40 bg-red-950/20"
                        : user.isTempBanned
                        ? "border-amber-500/40 bg-amber-950/20"
                        : isViolation
                        ? "border-purple-500/40 bg-purple-950/20"
                        : ""
                    }`}
                  >
                    {/* User Info */}
                    <div className="space-y-1">
                      <div className="flex items-center gap-3">
                        <p className="font-bold text-white text-base">
                          {user.firstName || ""} {user.lastName || ""}
                        </p>

                        {user.isBanned ? (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-red-500/20 text-red-400 border border-red-500/30 flex items-center gap-1">
                            <Ban className="w-3 h-3" /> PERM BANNED
                          </span>
                        ) : user.isTempBanned ? (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                            <Clock className="w-3 h-3" /> TEMP SUSPENDED
                          </span>
                        ) : isViolation ? (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-purple-500/20 text-purple-400 border border-purple-500/30 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> HIGH SPAM RATE
                          </span>
                        ) : isHighRisk ? (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 flex items-center gap-1">
                            <Activity className="w-3 h-3" /> WARNING
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> NORMAL
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-white/60 font-mono">
                        ID: {user.telegramId} {user.username && `(@${user.username})`}
                      </p>

                      <div className="flex items-center gap-4 text-xs text-white/40 pt-1">
                        <span>Violations: <b className="text-amber-400">{user.spamViolations}</b></span>
                        <span>
                          Last Active:{" "}
                          <b>
                            {user.lastRequestAt
                              ? new Date(user.lastRequestAt).toLocaleTimeString()
                              : "Never"}
                          </b>
                        </span>
                      </div>
                    </div>

                    {/* Rate Metric Badge & Ban Controls */}
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-[10px] text-white/40 font-bold uppercase">Req / 60s</p>
                        <p
                          className={`text-xl font-black ${
                            user.reqPerMin > maxLimit
                              ? "text-red-400 animate-pulse"
                              : isHighRisk
                              ? "text-amber-400"
                              : "text-emerald-400"
                          }`}
                        >
                          {user.reqPerMin} <span className="text-[10px] font-normal text-white/40">reqs</span>
                        </p>
                      </div>

                      {/* Dropdown for Temp / Permanent Ban Actions */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="glass-panel border-white/20 text-white font-bold h-9 px-3 text-xs"
                          >
                            <ShieldAlert className="w-3.5 h-3.5 mr-1.5 text-purple-400" /> Actions
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="glass-card border-white/20 text-white bg-[#130d24] shadow-2xl">
                          <DropdownMenuItem
                            onClick={() => banMutation.mutate({ userId: user.id, action: "temp_15m" })}
                            className="hover:bg-amber-500/20 text-amber-300 font-bold cursor-pointer text-xs"
                          >
                            <Clock className="w-3.5 h-3.5 mr-2" /> Temp Ban (15 Mins)
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => banMutation.mutate({ userId: user.id, action: "temp_1h" })}
                            className="hover:bg-amber-500/20 text-amber-300 font-bold cursor-pointer text-xs"
                          >
                            <Clock className="w-3.5 h-3.5 mr-2" /> Temp Ban (1 Hour)
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => banMutation.mutate({ userId: user.id, action: "temp_24h" })}
                            className="hover:bg-amber-500/20 text-amber-300 font-bold cursor-pointer text-xs"
                          >
                            <Clock className="w-3.5 h-3.5 mr-2" /> Temp Ban (24 Hours)
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => banMutation.mutate({ userId: user.id, action: "perm_ban" })}
                            className="hover:bg-red-500/20 text-red-400 font-bold cursor-pointer text-xs"
                          >
                            <Ban className="w-3.5 h-3.5 mr-2" /> Permanent Ban
                          </DropdownMenuItem>
                          {(user.isBanned || user.isTempBanned) && (
                            <DropdownMenuItem
                              onClick={() => banMutation.mutate({ userId: user.id, action: "unban" })}
                              className="hover:bg-emerald-500/20 text-emerald-400 font-bold cursor-pointer text-xs"
                            >
                              <ShieldCheck className="w-3.5 h-3.5 mr-2" /> Unban User
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-6 border-t border-white/10 mt-6">
              <p className="text-xs text-white/50">
                Page <span className="font-bold text-white">{currentPage}</span> of{" "}
                <span className="font-bold text-white">{totalPages}</span> ({filteredUsers.length} total users)
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="glass-panel border-white/20 text-white font-bold h-9 px-3 text-xs"
                >
                  <ChevronLeft className="w-4 h-4 mr-1" /> Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="glass-panel border-white/20 text-white font-bold h-9 px-3 text-xs"
                >
                  Next <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
