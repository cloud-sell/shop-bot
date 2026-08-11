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
  CheckCircle2
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

  const { data, isLoading, refetch } = useQuery<SpamStatsResponse>({
    queryKey: ["/api/spam-protector/stats"],
    refetchInterval: 1500, // Live fast polling every 1.5s for real-time request tracking
    refetchIntervalInBackground: true,
  });

  const [autoBanEnabled, setAutoBanEnabled] = useState<boolean>(true);
  const [maxReqInput, setMaxReqInput] = useState<string>("");
  const [tempBanInput, setTempBanInput] = useState<string>("");
  const [isUserEditing, setIsUserEditing] = useState<boolean>(false);

  // Sync state whenever fresh data arrives from backend (unless user is actively editing inputs)
  useEffect(() => {
    if (data && !isUserEditing) {
      setAutoBanEnabled(Boolean(data.autoBanEnabled));
      setMaxReqInput(String(data.maxReqPerMin ?? 15));
      setTempBanInput(String(data.tempBanDurationMins ?? 15));
    }
  }, [data, isUserEditing]);

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

  const handleConfigSave = () => {
    const maxReqNum = parseInt(maxReqInput, 10);
    const tempMinsNum = parseInt(tempBanInput, 10);

    if (isNaN(maxReqNum) || maxReqNum <= 0) {
      toast({ title: "Invalid Input", description: "Max requests per minute must be a positive number.", variant: "destructive" });
      return;
    }
    if (isNaN(tempMinsNum) || tempMinsNum <= 0) {
      toast({ title: "Invalid Input", description: "Penalty duration must be a positive number.", variant: "destructive" });
      return;
    }

    configMutation.mutate({
      autoBanEnabled,
      maxReqPerMin: maxReqNum,
      tempBanDurationMins: tempMinsNum,
    });
  };

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

        // Synchronously update local component state
        setAutoBanEnabled(newAutoBan);
        setMaxReqInput(String(newMaxReq));
        setTempBanInput(String(newTempMins));

        // Synchronously update TanStack Query cache so background refetches never see stale data
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

      setIsUserEditing(false);
      queryClient.invalidateQueries({ queryKey: ["/api/spam-protector/stats"] });
      refetch();
      toast({
        title: "Anti-Spam Settings Saved",
        description: "Rate limiting and auto-ban rules have been saved to database.",
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
        title: "Ban Status Updated",
        description: "User restriction status updated successfully.",
      });
    },
  });

  const users = data?.users || [];
  const filteredUsers = users.filter((u) => {
    const searchLower = search.toLowerCase();
    const fullName = `${u.firstName || ""} ${u.lastName || ""}`.toLowerCase();
    const username = u.username?.toLowerCase() || "";
    const telegramId = String(u.telegramId || "").toLowerCase();
    return fullName.includes(searchLower) || username.includes(searchLower) || telegramId.includes(searchLower);
  });

  return (
    <div className="space-y-10 animate-in pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-5xl font-black tracking-tighter text-white drop-shadow-2xl flex items-center gap-3">
            <ShieldAlert className="w-12 h-12 text-red-500 animate-pulse" />
            Spam Protector
          </h1>
          <p className="text-white/60 text-base mt-2 font-medium">
            Real-time request rate monitoring, sliding-window anti-spam protection, & auto/manual ban enforcement.
          </p>
        </div>

        <Button
          onClick={() => refetch()}
          variant="outline"
          className="glass-panel border-white/20 text-white hover:bg-white/10"
        >
          <RefreshCw className="w-4 h-4 mr-2" /> Live Refresh
        </Button>
      </div>

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="glass-card border-0 bg-gradient-to-br from-purple-950/30 to-black/40">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-white/50">Monitored Users</p>
                <h2 className="text-4xl font-black text-white mt-1">{data?.totalMonitoredUsers ?? 0}</h2>
              </div>
              <Activity className="w-10 h-10 text-purple-400 opacity-80" />
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card border-0 bg-gradient-to-br from-red-950/30 to-black/40">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-white/50">Banned / Suspended</p>
                <h2 className="text-4xl font-black text-red-400 mt-1">{data?.totalBannedUsers ?? 0}</h2>
              </div>
              <UserX className="w-10 h-10 text-red-400 opacity-80" />
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card border-0 bg-gradient-to-br from-amber-950/30 to-black/40">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-white/50">Max Rate Limit</p>
                <h2 className="text-4xl font-black text-amber-400 mt-1">
                  {isLoading ? <Loader2 className="w-6 h-6 animate-spin inline" /> : (data?.maxReqPerMin ?? 15)}{" "}
                  <span className="text-sm font-normal text-white/50">/min</span>
                </h2>
              </div>
              <Zap className="w-10 h-10 text-amber-400 opacity-80" />
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card border-0 bg-gradient-to-br from-emerald-950/30 to-black/40">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-white/50">Auto-Ban Engine</p>
                <h2 className="text-2xl font-black mt-2">
                  {isLoading ? (
                    <Loader2 className="w-6 h-6 animate-spin" />
                  ) : data?.autoBanEnabled ? (
                    <span className="text-emerald-400 flex items-center gap-1.5"><ShieldCheck className="w-6 h-6" /> ACTIVE</span>
                  ) : (
                    <span className="text-red-400 flex items-center gap-1.5"><AlertTriangle className="w-6 h-6" /> OFF</span>
                  )}
                </h2>
              </div>
              <ShieldCheck className="w-10 h-10 text-emerald-400 opacity-80" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Anti-Spam Configuration Rules */}
      <Card className="glass-card border-0 border-white/10">
        <CardHeader>
          <CardTitle className="text-white text-2xl font-bold flex items-center gap-3">
            <Zap className="w-6 h-6 text-amber-400" /> Rate Limiter & Auto-Ban Configuration
          </CardTitle>
          <CardDescription className="text-white/60">
            Set maximum allowed requests per minute. Users exceeding this threshold will be automatically suspended.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Auto Ban Switch */}
            <div className="glass-panel p-5 rounded-2xl border-white/10 flex items-center justify-between">
              <div>
                <Label className="text-white font-bold text-base">Automatic Auto-Ban</Label>
                <p className="text-xs text-white/50 mt-1">Auto-suspend spammers when rate limit is exceeded.</p>
              </div>
              <Switch
                checked={autoBanEnabled}
                onCheckedChange={(val) => {
                  setAutoBanEnabled(val);
                  setIsUserEditing(true);
                }}
                disabled={isLoading}
                className="data-[state=checked]:bg-emerald-500"
              />
            </div>

            {/* Max Req per Min */}
            <div className="glass-panel p-5 rounded-2xl border-white/10 space-y-2">
              <Label className="text-white font-bold text-sm">Max Requests Per Minute</Label>
              {isLoading && maxReqInput === "" ? (
                <div className="h-10 flex items-center px-3 glass-panel border-white/10 rounded-md">
                  <Loader2 className="w-4 h-4 animate-spin text-white/40" />
                </div>
              ) : (
                <Input
                  type="number"
                  min="1"
                  max="500"
                  value={maxReqInput}
                  onChange={(e) => {
                    setMaxReqInput(e.target.value);
                    setIsUserEditing(true);
                  }}
                  placeholder="15"
                  className="glass-panel border-white/10 text-white font-bold"
                />
              )}
            </div>

            {/* Temp Ban Duration */}
            <div className="glass-panel p-5 rounded-2xl border-white/10 space-y-2">
              <Label className="text-white font-bold text-sm">Auto-Ban Penalty Duration (Mins)</Label>
              {isLoading && tempBanInput === "" ? (
                <div className="h-10 flex items-center px-3 glass-panel border-white/10 rounded-md">
                  <Loader2 className="w-4 h-4 animate-spin text-white/40" />
                </div>
              ) : (
                <Input
                  type="number"
                  min="1"
                  max="1440"
                  value={tempBanInput}
                  onChange={(e) => {
                    setTempBanInput(e.target.value);
                    setIsUserEditing(true);
                  }}
                  placeholder="15"
                  className="glass-panel border-white/10 text-white font-bold"
                />
              )}
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              onClick={handleConfigSave}
              disabled={configMutation.isPending || isLoading}
              className="bg-gradient-to-r from-purple-500 to-blue-600 font-bold px-8 h-12 rounded-xl shadow-lg"
            >
              {configMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Save className="w-5 h-5 mr-2" />}
              Save Anti-Spam Rules
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Live User Risk & Request Monitor */}
      <Card className="glass-card border-0 border-white/10">
        <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <CardTitle className="text-white text-2xl font-bold flex items-center gap-3">
              <Activity className="w-6 h-6 text-purple-400" /> Live Request Rate & User Activity Tracker
            </CardTitle>
            <CardDescription className="text-white/60">
              Users ranked by real-time request frequency in the last 60 seconds.
            </CardDescription>
          </div>

          <div className="relative max-w-sm w-full">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
            <Input
              placeholder="Filter users..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="glass-panel pl-10 border-white/10 text-white text-sm"
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
              </div>
            ) : filteredUsers.length === 0 ? (
              <p className="text-center text-white/40 py-8">No user activity recorded yet.</p>
            ) : (
              filteredUsers.map((user) => {
                const maxLimit = data?.maxReqPerMin ?? 15;
                const isHighRisk = user.reqPerMin >= maxLimit * 0.7;
                const isViolation = user.reqPerMin > maxLimit;

                return (
                  <div
                    key={user.id}
                    className={`glass-panel p-5 rounded-2xl border-white/10 flex flex-wrap items-center justify-between gap-4 transition-all duration-300 ${
                      user.isBanned
                        ? "bg-red-950/20 border-red-500/30"
                        : user.isTempBanned
                        ? "bg-amber-950/20 border-amber-500/30"
                        : isViolation
                        ? "bg-purple-950/30 border-purple-500/40"
                        : ""
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-3">
                        <p className="font-bold text-white text-lg">
                          {user.firstName || ""} {user.lastName || ""}
                        </p>

                        {/* Status Badges */}
                        {user.isBanned ? (
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-red-500/20 text-red-400 border border-red-500/30 flex items-center gap-1">
                            <Ban className="w-3.5 h-3.5" /> PERM BANNED
                          </span>
                        ) : user.isTempBanned ? (
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" /> TEMP SUSPENDED
                          </span>
                        ) : isViolation ? (
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-purple-500/20 text-purple-400 border border-purple-500/30 flex items-center gap-1">
                            <AlertTriangle className="w-3.5 h-3.5" /> HIGH SPAM RATE
                          </span>
                        ) : isHighRisk ? (
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 flex items-center gap-1">
                            <Activity className="w-3.5 h-3.5" /> WARNING
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> NORMAL
                          </span>
                        )}
                      </div>

                      <p className="text-sm text-white/60">
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
                        <p className="text-xs text-white/40 font-bold uppercase">Req / 60s</p>
                        <p
                          className={`text-2xl font-black ${
                            user.reqPerMin > maxLimit
                              ? "text-red-400 animate-pulse"
                              : isHighRisk
                              ? "text-amber-400"
                              : "text-emerald-400"
                          }`}
                        >
                          {user.reqPerMin} <span className="text-xs font-normal text-white/40">reqs</span>
                        </p>
                      </div>

                      {/* Dropdown for Temp / Permanent Ban Actions */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="outline"
                            className="glass-panel border-white/20 text-white font-bold"
                          >
                            <ShieldAlert className="w-4 h-4 mr-2 text-purple-400" /> Actions
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="glass-card border-white/20 text-white">
                          <DropdownMenuItem
                            onClick={() => banMutation.mutate({ userId: user.id, action: "temp_15m" })}
                            className="hover:bg-amber-500/20 text-amber-300 font-bold cursor-pointer"
                          >
                            <Clock className="w-4 h-4 mr-2" /> Temp Ban (15 Mins)
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => banMutation.mutate({ userId: user.id, action: "temp_1h" })}
                            className="hover:bg-amber-500/20 text-amber-300 font-bold cursor-pointer"
                          >
                            <Clock className="w-4 h-4 mr-2" /> Temp Ban (1 Hour)
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => banMutation.mutate({ userId: user.id, action: "temp_24h" })}
                            className="hover:bg-amber-500/20 text-amber-300 font-bold cursor-pointer"
                          >
                            <Clock className="w-4 h-4 mr-2" /> Temp Ban (24 Hours)
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => banMutation.mutate({ userId: user.id, action: "perm_ban" })}
                            className="hover:bg-red-500/20 text-red-400 font-bold cursor-pointer"
                          >
                            <Ban className="w-4 h-4 mr-2" /> Permanent Ban
                          </DropdownMenuItem>
                          {(user.isBanned || user.isTempBanned) && (
                            <DropdownMenuItem
                              onClick={() => banMutation.mutate({ userId: user.id, action: "unban" })}
                              className="hover:bg-emerald-500/20 text-emerald-400 font-bold cursor-pointer"
                            >
                              <ShieldCheck className="w-4 h-4 mr-2" /> Unban User
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
        </CardContent>
      </Card>
    </div>
  );
}
