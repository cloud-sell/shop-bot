import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { io } from "socket.io-client";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Share2, 
  Play, 
  Square, 
  RefreshCw, 
  Trash2, 
  Loader2, 
  KeyRound, 
  Link2, 
  Clock, 
  CheckCircle2, 
  Activity, 
  Eye, 
  EyeOff, 
  Users,
  Send,
  Sparkles
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface ForwardGroup {
  groupId: string;
  groupName: string;
  sentCount: number;
  lastSentAt: string | null;
  disabled?: boolean;
}

interface ForwardConfig {
  botToken: string;
  postLink: string;
  interval: number;
  status: "running" | "stopped";
}

export default function ForwardPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showToken, setShowToken] = useState(false);

  // Local Form Inputs
  const [botToken, setBotToken] = useState("");
  const [postLink, setPostLink] = useState("");
  const [intervalVal, setIntervalVal] = useState(1);
  const isInitializedRef = React.useRef(false);

  // 1. Fetch forward configurations
  const { data: config, isLoading: isConfigLoading } = useQuery<ForwardConfig>({
    queryKey: ["/api/forward/config"],
  });

  // Sync loaded configuration values with local form inputs on initial load only
  useEffect(() => {
    if (config && !isInitializedRef.current) {
      setBotToken(config.botToken || "");
      setPostLink(config.postLink || "");
      setIntervalVal(config.interval || 1);
      isInitializedRef.current = true;
    }
  }, [config]);

  // 2. Fetch detected groups
  const { data: serverGroups = [], isLoading: isGroupsLoading } = useQuery<ForwardGroup[]>({
    queryKey: ["/api/forward/groups"],
  });

  const [groups, setGroups] = useState<ForwardGroup[]>([]);

  useEffect(() => {
    if (serverGroups) {
      setGroups(serverGroups);
    }
  }, [serverGroups]);

  // 3. Setup WebSocket listener for real-time counters and updates
  useEffect(() => {
    const socket = io();
    
    socket.on("tg_forward_stats", (updatedGroups: ForwardGroup[]) => {
      setGroups(updatedGroups);
      // Invalidate cash queries to keep sync
      queryClient.setQueryData(["/api/forward/groups"], updatedGroups);
    });

    return () => {
      socket.disconnect();
    };
  }, [queryClient]);

  // Mutations
  const updateConfigMutation = useMutation({
    mutationFn: async (newConfig: Partial<ForwardConfig>) => {
      const res = await fetch("/api/forward/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newConfig),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to update configuration.");
      }
      return res.json() as Promise<ForwardConfig>;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/forward/config"], data);
      setBotToken(data.botToken || "");
      setPostLink(data.postLink || "");
      setIntervalVal(data.interval || 1);
      toast({
        title: "Configuration Saved",
        description: "Auto Forward configuration updated successfully.",
      });
    },
    onError: (err: any) => {
      toast({
        title: "Error Saving Config",
        description: err.message,
        variant: "destructive",
      });
    }
  });

  const syncGroupsMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/forward/sync-groups", { method: "POST" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to sync groups.");
      }
      return res.json() as Promise<{ success: boolean; count: number }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/forward/groups"] });
      toast({
        title: "Sync Completed",
        description: `Successfully detected ${data.count} group(s).`,
      });
    },
    onError: (err: any) => {
      toast({
        title: "Sync Failed",
        description: err.message,
        variant: "destructive",
      });
    }
  });

  const clearCountersMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/forward/groups/clear", { method: "POST" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to clear counters.");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/forward/groups"] });
      toast({
        title: "Counters Reset",
        description: "All forward counters have been reset to zero.",
      });
    },
    onError: (err: any) => {
      toast({
        title: "Failed to Reset",
        description: err.message,
        variant: "destructive",
      });
    }
  });

  const toggleGroupMutation = useMutation({
    mutationFn: async (groupId: string) => {
      const res = await fetch(`/api/forward/groups/${groupId}/toggle`, {
        method: "POST"
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to toggle group status.");
      }
      return res.json() as Promise<{ success: boolean; groups: ForwardGroup[] }>;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/forward/groups"], data.groups);
      setGroups(data.groups);
      toast({
        title: "Status Updated",
        description: "Group forwarding status updated successfully.",
      });
    },
    onError: (err: any) => {
      toast({
        title: "Failed to Update",
        description: err.message,
        variant: "destructive",
      });
    }
  });

  const testForwardMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/forward/test", { method: "POST" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to test forward message.");
      }
      return res.json() as Promise<{
        success: boolean;
        totalGroups: number;
        sentCount: number;
        errors: string[];
      }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/forward/groups"] });
      if (data.errors && data.errors.length > 0) {
        toast({
          title: "Test Forward Partially Succeeded",
          description: `Forwarded to ${data.sentCount} of ${data.totalGroups} groups. Errors: ${data.errors.join(", ")}`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Test Forward Successful",
          description: `Successfully forwarded post to all ${data.sentCount} group(s).`,
        });
      }
    },
    onError: (err: any) => {
      toast({
        title: "Test Forward Failed",
        description: err.message,
        variant: "destructive",
      });
    }
  });

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!botToken.trim()) {
      toast({
        title: "Validation Error",
        description: "Please enter a valid Telegram Bot Token.",
        variant: "destructive"
      });
      return;
    }
    if (!postLink.trim()) {
      toast({
        title: "Validation Error",
        description: "Please enter a source post or channel link.",
        variant: "destructive"
      });
      return;
    }
    if (intervalVal < 1) {
      toast({
        title: "Validation Error",
        description: "Interval must be at least 1 minute.",
        variant: "destructive"
      });
      return;
    }

    updateConfigMutation.mutate({
      botToken,
      postLink,
      interval: intervalVal
    });
  };

  const toggleStatus = () => {
    if (!config?.botToken) {
      toast({
        title: "Not Configured",
        description: "Please configure and save the bot details first.",
        variant: "destructive"
      });
      return;
    }
    const newStatus = config.status === "running" ? "stopped" : "running";
    updateConfigMutation.mutate({ status: newStatus });
  };

  if (isConfigLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <Loader2 className="w-12 h-12 animate-spin text-purple-500" />
        <p className="text-white/40 text-sm animate-pulse">Loading Auto Forward config...</p>
      </div>
    );
  }

  const isRunning = config?.status === "running";

  return (
    <div className="space-y-8 pb-12">
      {/* Header section with live animation indicator */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-2xl">
              <Share2 className="w-6 h-6 text-purple-400" />
            </div>
            <div>
              <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-2">
                Auto Forward System
                <Sparkles className="w-5 h-5 text-purple-400 animate-pulse" />
              </h1>
              <p className="text-white/50 text-sm mt-1">
                Automatically forward messages from a channel to groups using a dedicated bot
              </p>
            </div>
          </div>
        </div>

        {/* Live Status Pill */}
        <div className="flex items-center gap-4">
          <motion.div 
            layout
            className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl font-black text-xs uppercase tracking-widest border transition-all duration-500 backdrop-blur-md ${
              isRunning 
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-[0_0_20px_rgba(16,185,129,0.1)]' 
                : 'bg-rose-500/10 text-rose-400 border-rose-500/20 shadow-[0_0_20px_rgba(244,63,94,0.1)]'
            }`}
          >
            <Activity className={`w-4 h-4 ${isRunning ? "animate-spin" : "animate-pulse"}`} />
            {isRunning ? "Live & Running" : "Stopped"}
          </motion.div>

          <Button
            onClick={toggleStatus}
            disabled={updateConfigMutation.isLoading}
            variant={isRunning ? "destructive" : "default"}
            className={`rounded-2xl px-6 py-5 font-black text-sm transition-all duration-500 flex items-center gap-2 ${
              isRunning
                ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-lg shadow-rose-900/20 hover:scale-105'
                : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-lg shadow-purple-900/20 hover:scale-105'
            }`}
          >
            {updateConfigMutation.isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : isRunning ? (
              <>
                <Square className="w-4 h-4 fill-current" />
                Stop Forwarder
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" />
                Start Forwarder
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Side: Configurations form */}
        <div className="lg:col-span-5 space-y-8">
          <Card className="glass-panel border-white/5 bg-gradient-to-b from-white/[0.03] to-transparent shadow-2xl rounded-[2rem] overflow-hidden">
            <CardHeader className="p-8 pb-4">
              <CardTitle className="text-xl font-bold text-white flex items-center gap-2">
                <Send className="w-5 h-5 text-purple-400" />
                Forward Configurations
              </CardTitle>
              <CardDescription className="text-white/40">
                Configure the forward bot credentials and delivery settings
              </CardDescription>
            </CardHeader>
            <CardContent className="p-8 pt-4 space-y-6">
              <form onSubmit={handleSave} className="space-y-6">
                
                {/* Bot Token field */}
                <div className="space-y-2">
                  <label className="text-xs font-black uppercase tracking-wider text-white/40 flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-purple-400" />
                    Forward Bot Token
                  </label>
                  <div className="relative">
                    <Input
                      type={showToken ? "text" : "password"}
                      value={botToken}
                      onChange={(e) => setBotToken(e.target.value)}
                      placeholder="e.g. 123456:ABC-DEF1234ghIkl-zyx"
                      className="bg-white/[0.02] border-white/10 rounded-2xl focus:border-purple-500/50 focus:ring-purple-500/20 text-white font-mono placeholder:text-white/20 py-6 pr-12"
                    />
                    <button
                      type="button"
                      onClick={() => setShowToken(!showToken)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-white transition-colors"
                    >
                      {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-[10px] text-white/30 italic">
                    * Enter a separate Bot Token dedicated for forwarding only.
                  </p>
                </div>

                {/* Target Link field */}
                <div className="space-y-2">
                  <label className="text-xs font-black uppercase tracking-wider text-white/40 flex items-center gap-1.5">
                    <Link2 className="w-3.5 h-3.5 text-purple-400" />
                    Channel Post Link
                  </label>
                  <Input
                    type="text"
                    value={postLink}
                    onChange={(e) => setPostLink(e.target.value)}
                    placeholder="e.g. https://t.me/c/123456789/123"
                    className="bg-white/[0.02] border-white/10 rounded-2xl focus:border-purple-500/50 focus:ring-purple-500/20 text-white font-mono placeholder:text-white/20 py-6"
                  />
                  <p className="text-[10px] text-white/30 italic">
                    Both Public (t.me/username/123) and Private (t.me/c/12345/123) post links are supported.
                  </p>
                </div>

                {/* Interval field */}
                <div className="space-y-2">
                  <label className="text-xs font-black uppercase tracking-wider text-white/40 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-purple-400" />
                    Forward Interval (Minutes)
                  </label>
                  <div className="flex items-center gap-3">
                    <Input
                      type="number"
                      min={1}
                      value={intervalVal}
                      onChange={(e) => setIntervalVal(Math.max(1, parseInt(e.target.value, 10) || 1))}
                      className="bg-white/[0.02] border-white/10 rounded-2xl focus:border-purple-500/50 focus:ring-purple-500/20 text-white font-mono py-6 w-32 text-center"
                    />
                    <span className="text-white/50 text-sm font-semibold">minutes</span>
                  </div>
                  <p className="text-[10px] text-white/30 italic">
                    Example: Setting to 1 will forward the post once every minute continuously.
                  </p>
                </div>

                {/* Save button */}
                <Button
                  type="submit"
                  disabled={updateConfigMutation.isLoading}
                  className="w-full bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-2xl py-6 font-black text-sm transition-all duration-300 flex items-center justify-center gap-2 hover:scale-[1.01]"
                >
                  {updateConfigMutation.isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 text-purple-400" />
                  )}
                  Save Configuration
                </Button>

              </form>
            </CardContent>
          </Card>
        </div>

        {/* Right Side: Detected Groups and counters */}
        <div className="lg:col-span-7 space-y-8">
          <Card className="glass-panel border-white/5 bg-gradient-to-b from-white/[0.03] to-transparent shadow-2xl rounded-[2rem] overflow-hidden">
            <CardHeader className="p-8 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <CardTitle className="text-xl font-bold text-white flex items-center gap-2">
                  <Users className="w-5 h-5 text-purple-400" />
                  Detected Groups
                </CardTitle>
                <CardDescription className="text-white/40">
                  List and statistics of groups where the bot is added
                </CardDescription>
              </div>

              {/* Group Action Buttons */}
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => testForwardMutation.mutate()}
                  disabled={testForwardMutation.isLoading || !config?.botToken || groups.length === 0}
                  variant="outline"
                  size="sm"
                  className="rounded-xl border-white/10 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 hover:text-amber-200 border-amber-500/20 flex items-center gap-1.5 transition-all text-xs font-black py-4 px-3.5"
                >
                  {testForwardMutation.isLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  Test Forward
                </Button>

                <Button
                  onClick={() => syncGroupsMutation.mutate()}
                  disabled={syncGroupsMutation.isLoading || !config?.botToken}
                  variant="outline"
                  size="sm"
                  className="rounded-xl border-white/10 bg-white/5 hover:bg-white/10 text-white flex items-center gap-1.5 transition-all text-xs font-black py-4 px-3.5"
                >
                  {syncGroupsMutation.isLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5 text-purple-400" />
                  )}
                  Sync Groups
                </Button>

                <Button
                  onClick={() => {
                    if (confirm("Are you sure you want to reset all forward counters to zero?")) {
                      clearCountersMutation.mutate();
                    }
                  }}
                  disabled={clearCountersMutation.isLoading || groups.length === 0}
                  variant="outline"
                  size="sm"
                  className="rounded-xl border-white/10 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 hover:text-rose-200 border-rose-500/20 flex items-center gap-1.5 transition-all text-xs font-black py-4 px-3.5"
                >
                  {clearCountersMutation.isLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                  Clear Counts
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-8 pt-4">
              <AnimatePresence mode="wait">
                {groups.length === 0 ? (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="flex flex-col items-center justify-center py-16 space-y-4 border border-dashed border-white/10 rounded-[2rem] bg-white/[0.01]"
                  >
                    <div className="w-16 h-16 rounded-full bg-white/[0.02] border border-white/5 flex items-center justify-center">
                      <Users className="w-6 h-6 text-white/20" />
                    </div>
                    <div className="text-center space-y-1">
                      <p className="text-white font-bold text-sm">No groups detected yet</p>
                      <p className="text-white/30 text-xs max-w-sm px-4">
                        Add the bot to your groups and click 'Sync Groups', or send a message to a group containing the bot.
                      </p>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="overflow-x-auto"
                  >
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-white/5 text-left">
                          <th className="pb-3 text-xs font-black uppercase tracking-wider text-white/30">Group Name</th>
                          <th className="pb-3 text-xs font-black uppercase tracking-wider text-white/30">Group ID</th>
                          <th className="pb-3 text-xs font-black uppercase tracking-wider text-white/30 text-center">Status</th>
                          <th className="pb-3 text-xs font-black uppercase tracking-wider text-white/30 text-center">Forwards</th>
                          <th className="pb-3 text-xs font-black uppercase tracking-wider text-white/30 text-right">Last Sent</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {groups.map((group, idx) => (
                          <motion.tr
                            key={group.groupId}
                            initial={{ opacity: 0, y: 5 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.05 }}
                            className="group/row hover:bg-white/[0.01] transition-colors"
                          >
                            <td className="py-4 text-sm font-bold text-white pr-4">
                              {group.groupName}
                            </td>
                            <td className="py-4 text-xs font-mono text-white/30 pr-4">
                              {group.groupId}
                            </td>
                            <td className="py-4 text-center pr-4">
                              <Button
                                onClick={() => toggleGroupMutation.mutate(group.groupId)}
                                disabled={toggleGroupMutation.isLoading}
                                variant="outline"
                                size="sm"
                                className={`rounded-xl text-[10px] font-black uppercase tracking-widest px-3.5 py-1.5 transition-all ${
                                  group.disabled 
                                    ? 'bg-rose-500/10 text-rose-400 border-rose-500/20 hover:bg-rose-500/20' 
                                    : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20'
                                }`}
                              >
                                {group.disabled ? "Restricted" : "Active"}
                              </Button>
                            </td>
                            <td className="py-4 text-center pr-4">
                              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-black bg-purple-500/10 border border-purple-500/20 text-purple-400 group-hover/row:bg-purple-500/25 transition-all">
                                {group.sentCount}
                              </span>
                            </td>
                            <td className="py-4 text-xs text-white/40 text-right font-mono">
                              {group.lastSentAt 
                                ? new Date(group.lastSentAt).toLocaleTimeString() 
                                : "-"
                              }
                            </td>
                          </motion.tr>
                        ))}
                      </tbody>
                    </table>
                  </motion.div>
                )}
              </AnimatePresence>
            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  );
}
