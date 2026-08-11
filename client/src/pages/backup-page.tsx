import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Database, Save, Loader2, Play, Terminal as TerminalIcon, History, Trash2, Clock, ShieldCheck } from "lucide-react";
import { format } from "date-fns";

type BackupConfig = {
  id: number;
  dbUrl: string;
  botToken: string;
  chatId: string;
  frequency: number;
  lastBackup: string | null;
  nextBackup: string | null;
  isActive: boolean;
};

type BackupLog = {
  id: number;
  configId: number;
  status: string;
  message: string;
  fileSize: number | null;
  fileName: string | null;
  createdAt: string;
};

export default function BackupPage() {
  const { toast } = useToast();
  const consoleEndRef = useRef<HTMLDivElement>(null);
  
  const [formData, setFormData] = useState({
    dbUrl: "",
    botToken: "",
    chatId: "",
    frequency: 3,
  });

  const { data: config, isLoading: isConfigLoading } = useQuery<BackupConfig | null>({
    queryKey: ["/api/backups/config"],
  });

  const { data: logs, isLoading: isLogsLoading } = useQuery<BackupLog[]>({
    queryKey: ["/api/backups/logs"],
    refetchInterval: 5000, // Refresh logs every 5 seconds
  });

  useEffect(() => {
    if (config) {
      setFormData({
        dbUrl: config.dbUrl,
        botToken: config.botToken,
        chatId: config.chatId,
        frequency: config.frequency,
      });
    }
  }, [config]);

  useEffect(() => {
    // Scroll terminal to bottom when new logs arrive
    if (consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs]);

  const updateMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await apiRequest("POST", "/api/backups/config", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/backups/config"] });
      toast({
        title: "Configuration Saved",
        description: "Your database backup settings have been updated.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const triggerMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/backups/trigger");
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Backup Triggered",
        description: "The backup process has started in the background. Check console for status.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Backup Failed",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  if (isConfigLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
      </div>
    );
  }

  return (
    <div className="space-y-10 animate-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-5xl font-black tracking-tighter text-white drop-shadow-2xl">
            DB Backup
          </h1>
          <p className="text-white/60 mt-2 font-medium">Automated PostgreSQL 17 Backup System</p>
        </div>
        <div className="glass-panel px-6 py-2.5 rounded-full flex items-center gap-3 text-sm font-bold text-white shadow-lg border-white/20">
          <Database className="w-5 h-5 text-purple-400" />
          Status: <span className={config?.isActive ? "text-green-400" : "text-yellow-400"}>
            {config?.isActive ? "Active" : "Inactive"}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Configuration Card */}
        <Card className="glass-card border-0 overflow-hidden h-fit">
          <CardHeader className="bg-gradient-to-r from-purple-500/20 to-blue-500/20">
            <CardTitle className="text-2xl font-bold flex items-center gap-2">
              <ShieldCheck className="w-6 h-6 text-purple-400" />
              Backup Configuration
            </CardTitle>
            <CardDescription className="text-white/60">
              Configure where to fetch the dump and where to send it via Telegram.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            <div className="space-y-2">
              <Label className="text-xs font-bold text-white/50 uppercase tracking-widest">PostgreSQL Connection URL</Label>
              <Input
                placeholder="postgresql://user:pass@host:port/dbname"
                className="glass-panel border-white/10 bg-white/5 text-white h-12 rounded-xl"
                value={formData.dbUrl}
                onChange={(e) => setFormData({ ...formData, dbUrl: e.target.value })}
              />
              <p className="text-[10px] text-white/40">The URL of the database you want to backup.</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold text-white/50 uppercase tracking-widest">Telegram Bot Token</Label>
                <Input
                  type="password"
                  placeholder="Bot Token"
                  className="glass-panel border-white/10 bg-white/5 text-white h-12 rounded-xl"
                  value={formData.botToken}
                  onChange={(e) => setFormData({ ...formData, botToken: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold text-white/50 uppercase tracking-widest">Chat ID / User ID</Label>
                <Input
                  placeholder="Chat ID"
                  className="glass-panel border-white/10 bg-white/5 text-white h-12 rounded-xl"
                  value={formData.chatId}
                  onChange={(e) => setFormData({ ...formData, chatId: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold text-white/50 uppercase tracking-widest">Backup Frequency (Hours)</Label>
              <div className="flex gap-4 items-center">
                <Input
                  type="number"
                  min="1"
                  max="24"
                  className="glass-panel border-white/10 bg-white/5 text-white h-12 rounded-xl w-32"
                  value={formData.frequency}
                  onChange={(e) => setFormData({ ...formData, frequency: parseInt(e.target.value) })}
                />
                <span className="text-sm text-white/60">Automatically runs every {formData.frequency} hours.</span>
              </div>
            </div>

            <div className="pt-4 flex gap-4">
              <Button 
                onClick={() => updateMutation.mutate(formData)}
                disabled={updateMutation.isPending}
                className="flex-1 h-12 rounded-xl bg-gradient-to-r from-purple-500 to-blue-600 font-bold"
              >
                {updateMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5 mr-2" />}
                Save Configuration
              </Button>
              <Button 
                onClick={() => triggerMutation.mutate()}
                disabled={triggerMutation.isPending || !config}
                variant="outline"
                className="h-12 px-6 rounded-xl border-white/20 hover:bg-white/5 font-bold text-white"
              >
                {triggerMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5 mr-2 text-green-400" />}
                Run Now
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Premium iOS Console / Log Viewer */}
        <Card className="relative glass-panel border-0 overflow-hidden flex flex-col h-[600px] group/console shadow-2xl">
          {/* Glass Shine Effect */}
          <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent pointer-events-none z-10 opacity-30" />
          
          <CardHeader className="bg-white/5 backdrop-blur-3xl border-b border-white/10 shrink-0 py-4 relative z-20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex gap-2">
                  <div className="w-3 button-red h-3 rounded-full bg-[#FF5F56] shadow-[0_0_10px_rgba(255,95,86,0.3)]" />
                  <div className="w-3 button-yellow h-3 rounded-full bg-[#FFBD2E] shadow-[0_0_10px_rgba(255,189,46,0.2)]" />
                  <div className="w-3 button-green h-3 rounded-full bg-[#27C93F] shadow-[0_0_10px_rgba(39,201,63,0.3)]" />
                </div>
                <div className="h-4 w-px bg-white/10 mx-1" />
                <CardTitle className="text-sm font-black flex items-center gap-2 text-white/90 uppercase tracking-[0.2em]">
                  <TerminalIcon className="w-4 h-4 text-purple-400" />
                  Live Console
                </CardTitle>
              </div>
              <div className="flex items-center gap-2">
                <div className="px-2 py-0.5 rounded bg-green-500/20 text-[10px] font-bold text-green-400 border border-green-500/30">
                  LIVE
                </div>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-0 flex-1 bg-[#050510]/95 font-mono text-[13px] overflow-hidden flex flex-col relative z-20">
            {/* Subtle Grid Background */}
            <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:20px_20px] pointer-events-none opacity-20" />
            
            <div className="flex-1 overflow-y-auto p-6 space-y-2.5 custom-scrollbar relative">
              {!logs || logs.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-white/20 gap-4">
                  <Loader2 className="w-8 h-8 animate-spin" />
                  <div className="italic font-medium animate-pulse">Establishing terminal connection...</div>
                </div>
              ) : (
                logs.map((log) => (
                  <div key={log.id} className="flex gap-4 group animate-in slide-in-from-left-2 duration-300">
                    <span className="text-white/20 shrink-0 select-none font-medium">
                      {format(new Date(log.createdAt), "HH:mm:ss")}
                    </span>
                    <div className="flex flex-col gap-1">
                      <div className={`
                        flex items-center gap-2 font-medium leading-relaxed
                        ${log.status === 'success' ? 'text-green-400 drop-shadow-[0_0_8px_rgba(74,222,128,0.3)]' : ''}
                        ${log.status === 'error' ? 'text-red-400 drop-shadow-[0_0_8px_rgba(248,113,113,0.3)]' : ''}
                        ${log.status === 'starting' ? 'text-blue-400' : ''}
                        ${log.status === 'info' ? 'text-white/80' : ''}
                      `}>
                        <span className="shrink-0 opacity-50">
                          {log.status === 'success' ? '✔' : log.status === 'error' ? '✖' : '›'}
                        </span>
                        <span>
                          {log.message}
                          {log.fileSize && (
                            <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/50 border border-white/5">
                              {(log.fileSize / 1024 / 1024).toFixed(2)} MB
                            </span>
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
              <div ref={consoleEndRef} />
            </div>
            
            <div className="p-4 bg-white/5 border-t border-white/10 shrink-0 flex justify-between items-center text-[10px] text-white/40 font-bold uppercase tracking-[0.15em] px-6">
              <div className="flex items-center gap-6">
                <span className="flex items-center gap-2 group/stat">
                  <Clock className="w-3.5 h-3.5 text-blue-400 group-hover/stat:scale-110 transition-transform" /> 
                  SCHED: <span className="text-white/70">{config?.frequency || 0}H</span>
                </span>
                <span className="flex items-center gap-2 group/stat">
                  <History className="w-3.5 h-3.5 text-purple-400 group-hover/stat:scale-110 transition-transform" /> 
                  LAST: <span className="text-white/70">{config?.lastBackup ? format(new Date(config.lastBackup), "MMM d, HH:mm") : 'NEVER'}</span>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                SECURE CHANNEL
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Info Card */}
      <Card className="glass-card border-0 bg-blue-500/10 border-blue-500/20 p-6">
        <div className="flex gap-4">
          <div className="bg-blue-500/20 p-3 rounded-xl h-fit">
            <ShieldCheck className="w-6 h-6 text-blue-400" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-bold text-white">Cloud Shooping Security Protocol</h3>
            <p className="text-white/60 text-sm leading-relaxed">
              Backups are generated on-server using <code>pg_dump</code> v17. Files are temporarily stored in <code>~/pg_backups</code> 
              and uploaded to your Telegram bot via the Bot API. After successful upload, the local file is deleted to save space. 
              The backup includes the full database structure and data in custom format (<code>.dump</code>).
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
