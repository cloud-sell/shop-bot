import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AwsAccount, AwsActivity, InsertAwsAccount } from "@shared/schema";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  Plus,
  RefreshCw,
  Trash2,
  Edit2,
  Key,
  ShieldCheck,
  FileText,
  Loader2,
  AlertCircle,
  Clock,
  MapPin,
  User,
  Globe,
  EyeOff,
  CalendarDays,
  Cpu
} from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertAwsAccountSchema } from "@shared/schema";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export default function AwsCheckerPage() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<AwsAccount | null>(null);
  const [criticalOnly, setCriticalOnly] = useState(false);
  const [hideNoise, setHideNoise] = useState(false);
  const [focusedAccountId, setFocusedAccountId] = useState<number | null>(null);
  const [timeFilter, setTimeFilter] = useState<"7d" | "14d" | "21d" | "30d" | "all">("all");
  const [selectedAccounts, setSelectedAccounts] = useState<number[]>([]);

  const TIME_FILTER_OPTIONS = [
    { value: "7d", label: "7 Days" },
    { value: "14d", label: "2 Weeks" },
    { value: "21d", label: "3 Weeks" },
    { value: "30d", label: "1 Month" },
    { value: "all", label: "All Time" },
  ];

  const getTimeFilterMs = () => {
    if (timeFilter === "all") return Infinity;
    const days = parseInt(timeFilter);
    return days * 24 * 60 * 60 * 1000;
  };

  const getEventCategory = (name: string) => {
    const critical = [
      "ChangePassword", "DeleteVirtualMFADevice", "DeactivateMFADevice", "DeleteUser",
      "DeleteAccessKey", "StopInstances", "TerminateInstances", "DeleteBucket",
      "DeleteDBInstance", "UpdateUser", "UpdateLoginProfile", "CreateLoginProfile",
      "DeleteLoginProfile", "ResyncMFADevice", "UpdateMFADevice", "UpdateAccessKey",
      "ConsoleLogin", "EnableMFADevice", "CreateAccessKey", "AttachUserPolicy", "PutUserPolicy"
    ];
    const sensitive = [
      "CreateInstance", "CreateBucket", "ModifyAccount", "CreateVirtualMFADevice"
    ];
    const noise = [
      "ListManagedNotificationEvents", "LookupEvents", "GetAccountPlanState",
      "GetServiceLastAccessedDetailsWithEntities", "GetServiceQuota", "ListServiceQuotas",
      "GetAccountQuota", "GetEventSelectors", "ListTags", "DescribeInstances"
    ];

    if (critical.includes(name)) return "critical";
    if (sensitive.includes(name)) return "sensitive";
    if (noise.includes(name)) return "noise";
    return "general";
  };

  const { data: accounts, isLoading: isAccountsLoading } = useQuery<AwsAccount[]>({
    queryKey: ["/api/aws/accounts"],
  });

  const { data: activities, isLoading: isActivitiesLoading } = useQuery<(AwsActivity & { account: AwsAccount })[]>({
    queryKey: focusedAccountId ? ["/api/aws/activities", { accountId: focusedAccountId }] : ["/api/aws/activities"],
    queryFn: async ({ queryKey }) => {
      const [_base, params] = queryKey as [string, { accountId?: number }?];
      const url = params?.accountId
        ? `/api/aws/activities?accountId=${params.accountId}`
        : "/api/aws/activities";
      const res = await apiRequest("GET", url);
      return res.json();
    }
  });

  const refreshMutation = useMutation({
    mutationFn: async ({ accountIds, lookbackDays }: { accountIds?: number[], lookbackDays?: number }) => {
      const body = { accountIds, lookbackDays };
      await apiRequest("POST", "/api/aws/refresh", body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/aws/accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/aws/activities"] });
      toast({ title: "AWS Status Refreshing", description: "Filtered accounts are being checked..." });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/aws/accounts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/aws/accounts"] });
      toast({ title: "Account Removed" });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      await apiRequest("DELETE", "/api/aws/accounts", { ids });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/aws/accounts"] });
      toast({ title: "Selected accounts removed from checker" });
      setSelectedAccounts([]);
    },
    onError: (err: any) => {
      toast({
        title: "Bulk delete failed",
        description: err.message,
        variant: "destructive"
      });
    }
  });

  const handleBulkDelete = () => {
    if (confirm(`Are you sure you want to delete the ${selectedAccounts.length} selected accounts from the AWS checker? This will only remove them from the checker, not from AWS itself.`)) {
      bulkDeleteMutation.mutate(selectedAccounts);
    }
  };

  const toggleAccountSelection = (id: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedAccounts(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const filteredAccounts = accounts?.filter(acc => {
    const searchLower = search.toLowerCase();
    const matchesSearch = acc.name.toLowerCase().includes(searchLower) ||
      (acc.email?.toLowerCase().includes(searchLower) ?? false);
    return matchesSearch;
  }) || [];

  const filteredActivities = activities?.filter(act => {
    const searchLower = search.toLowerCase();

    // Check if search matches activity fields
    const matchesActivityContent =
      act.eventName.toLowerCase().includes(searchLower) ||
      act.userName?.toLowerCase().includes(searchLower) ||
      act.ipAddress.includes(searchLower);

    // Check if search matches the account this activity belongs to
    const actAccount = accounts?.find(a => a.id === act.awsAccountId);
    const matchesAccountIdentity =
      actAccount?.name.toLowerCase().includes(searchLower) ||
      (actAccount?.email?.toLowerCase().includes(searchLower) ?? false);

    const matchesSearch = search === "" || matchesActivityContent || matchesAccountIdentity;

    // Only show activities for currently visible (time-filtered) accounts
    const filteredAccountIds = filteredAccounts.map(a => a.id);
    const matchesAccount = focusedAccountId
      ? act.awsAccountId === focusedAccountId
      : filteredAccountIds.includes(act.awsAccountId);

    const matchesCritical = criticalOnly ? getEventCategory(act.eventName) === "critical" : true;
    const isNoise = getEventCategory(act.eventName) === "noise";
    const matchesNoise = hideNoise ? !isNoise : true;
    const matchesTime = (Date.now() - new Date(act.eventTime).getTime()) <= getTimeFilterMs();

    return matchesSearch && matchesAccount && matchesTime && matchesCritical && matchesNoise;
  }) || [];

  const generatePDF = () => {
    const doc = new jsPDF();
    const account = focusedAccountId ? accounts?.find(a => a.id === focusedAccountId) : null;
    const accountName = account ? (account.email || account.name) : "All Accounts";
    const now = new Date();

    // Header
    doc.setFontSize(20);
    doc.setTextColor(40, 40, 40);
    doc.text("AWS Activity Audit Report", 14, 22);

    // Sub-header
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(`Account: ${accountName}`, 14, 30);
    doc.text(`Generated: ${format(now, "yyyy-MM-dd HH:mm:ss")}`, 14, 35);
    doc.text(`Filter: ${timeFilter} period`, 14, 40);

    const tableData = filteredActivities.map(act => [
      format(new Date(act.eventTime), "yyyy-MM-dd HH:mm:ss"),
      act.eventName,
      act.userName || "N/A",
      act.ipAddress,
      act.location || "Unknown",
    ]);

    autoTable(doc, {
      startY: 45,
      head: [["Time (UTC)", "Event Name", "User", "Source IP", "Location"]],
      body: tableData,
      headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: { fontSize: 8, cellPadding: 3 },
      alternateRowStyles: { fillColor: [245, 247, 250] },
      didDrawPage: (data) => {
        // Footer
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        const str = "Generated by Shop Bot Advanced Security System | Page " + doc.splitTextToSize(data.pageNumber.toString(), 1000);
        doc.text(str, 14, doc.internal.pageSize.height - 10);
      }
    });

    doc.save(`AWS_Activity_Report_${accountName.replace(/\s+/g, '_')}_${format(now, "yyyyMMdd")}.pdf`);
  };

  const generateCSV = () => {
    const headers = ["Time", "EventName", "User", "IP", "Location", "UserAgent"];
    const rows = filteredActivities.map(act => [
      new Date(act.eventTime).toISOString(),
      act.eventName,
      act.userName || "",
      act.ipAddress,
      act.location || "",
      act.userAgent || ""
    ]);

    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `AWS_Activity_Log_${format(new Date(), "yyyyMMdd")}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tighter drop-shadow-2xl flex items-center gap-3">
            <ShieldCheck className="w-8 h-8 text-purple-500" />
            AWS Checker
          </h1>
          <p className="text-white/40 text-sm font-medium">Verify and track AWS account activities.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={() => refreshMutation.mutate({ accountIds: filteredAccounts.map(a => a.id), lookbackDays: 7 })}
            disabled={refreshMutation.isPending}
            className="h-11 px-6 rounded-xl border-white/10 bg-white/5 text-white font-black text-xs uppercase tracking-widest hover:bg-white/10 transition-all flex items-center gap-2"
          >
            {refreshMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Sync (7d)
          </Button>
          <Button
            variant="outline"
            onClick={() => refreshMutation.mutate({ accountIds: filteredAccounts.map(a => a.id), lookbackDays: 30 })}
            disabled={refreshMutation.isPending}
            className="h-11 px-6 rounded-xl border-purple-500/30 bg-purple-500/10 text-purple-400 font-black text-xs uppercase tracking-widest hover:bg-purple-500/20 transition-all flex items-center gap-2"
          >
            {refreshMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
            Deep Sync (30d)
          </Button>
          <AccountDialog
            open={isCreateOpen || !!editingAccount}
            onOpenChange={(open) => {
              if (!open) {
                setIsCreateOpen(false);
                setEditingAccount(null);
              }
            }}
            editingAccount={editingAccount}
          />
          <Button
            onClick={() => setIsCreateOpen(true)}
            className="h-11 px-6 rounded-xl bg-gradient-to-r from-purple-500 to-blue-600 hover:from-purple-600 hover:to-blue-700 text-white font-black text-xs uppercase tracking-widest shadow-lg transition-all duration-300 hover:scale-105 active:scale-95"
          >
            <Plus className="mr-2 h-4 w-4" /> Add Account
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Accounts List */}
        <div className="lg:col-span-1 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
              <Input
                placeholder="Search accounts..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="glass-panel pl-10 h-10 rounded-xl border-white/5 bg-white/[0.02] text-xs text-white placeholder:text-white/10"
              />
            </div>
            {focusedAccountId && (
              <Button variant="ghost" size="sm" onClick={() => setFocusedAccountId(null)} className="text-[10px] text-purple-400 font-bold uppercase">
                Clear
              </Button>
            )}
          </div>

          {filteredAccounts.length > 0 && (
            <div className="flex items-center justify-between p-3 bg-white/[0.02] border border-white/5 rounded-xl text-xs font-semibold text-white/50">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={filteredAccounts.length > 0 && selectedAccounts.length === filteredAccounts.length}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setSelectedAccounts(filteredAccounts.map(a => a.id));
                    } else {
                      setSelectedAccounts([]);
                    }
                  }}
                  id="select-all-accounts"
                  className="border-white/20 data-[state=checked]:bg-purple-500 data-[state=checked]:border-purple-500"
                />
                <label htmlFor="select-all-accounts" className="cursor-pointer select-none text-[10px] uppercase font-black tracking-wider text-white/40">
                  Select All ({filteredAccounts.length})
                </label>
              </div>
              {selectedAccounts.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleBulkDelete}
                  disabled={bulkDeleteMutation.isPending}
                  className="h-7 px-3 text-[10px] font-black uppercase tracking-wider text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg flex items-center gap-1.5"
                >
                  {bulkDeleteMutation.isPending ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Trash2 className="w-3 h-3" />
                  )}
                  Delete Checked ({selectedAccounts.length})
                </Button>
              )}
            </div>
          )}

          <div className="space-y-3">
            {isAccountsLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-32 w-full rounded-2xl bg-white/5" />
              ))
            ) : filteredAccounts.length === 0 ? (
              <div className="glass-card p-12 text-center text-white/20 font-black text-xs uppercase tracking-widest border-dashed border-white/5">
                No accounts found
              </div>
            ) : (
              filteredAccounts.map(acc => (
                <div
                  key={acc.id}
                  onClick={() => setFocusedAccountId(acc.id)}
                  className={`glass-panel p-5 rounded-2xl border-white/5 transition-all cursor-pointer group hover:bg-white/[0.04] ${focusedAccountId === acc.id ? 'ring-2 ring-purple-500/50 bg-white/[0.05]' : 'bg-white/[0.01]'}`}
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={selectedAccounts.includes(acc.id)}
                        onCheckedChange={() => toggleAccountSelection(acc.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="border-white/20 data-[state=checked]:bg-purple-500 data-[state=checked]:border-purple-500 shrink-0"
                      />
                      <div className={`w-2 h-2 rounded-full shrink-0 ${acc.status === 'suspended'
                          ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]'
                          : acc.status === 'error'
                            ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]'
                            : 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]'
                        }`} />
                      <span className="text-sm font-black text-white tracking-tight">{acc.email || acc.name}</span>
                      <Badge
                        variant="outline"
                        className={`ml-2 text-[8px] h-4 uppercase tracking-tighter font-black ${acc.status === 'suspended'
                            ? 'border-red-500/50 text-red-500 bg-red-500/10'
                            : acc.status === 'error'
                              ? 'border-amber-500/50 text-amber-500 bg-amber-500/10'
                              : 'border-green-500/50 text-green-500 bg-green-500/10'
                          }`}
                      >
                        {acc.status === 'suspended' ? 'Suspended' : acc.status === 'error' ? 'Error' : 'Active'}
                      </Badge>
                    </div>
                    {acc.email && (
                      <p className="text-[10px] text-white/30 font-bold tracking-wider mb-2 uppercase truncate max-w-[150px] ml-4">
                        {acc.name}
                      </p>
                    )}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg hover:bg-white/10" onClick={(e) => { e.stopPropagation(); setEditingAccount(acc); }}>
                        <Edit2 className="w-3 h-3 text-white/40" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg hover:bg-red-500/10" onClick={(e) => { e.stopPropagation(); if (confirm("Delete this account?")) deleteMutation.mutate(acc.id); }}>
                        <Trash2 className="w-3 h-3 text-red-400/60" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-1.5 text-[10px] font-medium text-white/40">
                    <div className="flex items-center gap-2">
                      <Globe className="w-3 h-3" /> {acc.region}
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="w-3 h-3" /> {acc.lastChecked ? format(new Date(acc.lastChecked), "MMM d, HH:mm") : "Never checked"}
                    </div>
                    <div className="flex flex-col gap-1 mt-2 p-2 rounded-xl bg-white/[0.02] border border-white/5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-yellow-500/60">
                          <Cpu className="w-3 h-3" />
                          <span className="text-[9px] uppercase tracking-widest font-black">Initial Quota</span>
                        </div>
                        <span className="text-xs font-black text-white/60">{(acc as any).initialVcpu ?? "N/A"} vCPU</span>
                      </div>
                      <div className="flex items-center justify-between border-t border-white/5 pt-1 mt-1">
                        <div className="flex items-center gap-1.5 text-purple-400">
                          <Cpu className="w-3 h-3" />
                          <span className="text-[9px] uppercase tracking-widest font-black">Live Quota</span>
                        </div>
                        <span className="text-xs font-black text-purple-500">{(acc as any).spotVcpu ?? "N/A"} vCPU</span>
                      </div>
                    </div>
                    {acc.lastError && (acc.status === 'suspended' || acc.status === 'error') && (
                      <div className="flex items-start gap-2 text-red-400/80 mt-2 bg-red-500/5 p-2 rounded-lg">
                        <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                        <span className="leading-tight">{acc.lastError}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Activity Logs */}
        <div className="lg:col-span-2">
          <div className="glass-card border-0 rounded-3xl overflow-hidden shadow-2xl bg-white/[0.01] backdrop-blur-3xl">
            <div className="p-6 border-b border-white/5 flex items-center justify-between">
              <h2 className="text-lg font-black text-white tracking-tight flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-400" />
                {focusedAccountId ? `Activities: ${accounts?.find(a => a.id === focusedAccountId)?.name}` : 'Recent AWS Activities'}
                <span className="ml-2 text-[9px] font-black uppercase tracking-widest text-white/20 bg-white/5 px-2 py-1 rounded-lg">
                  {filteredAccounts.length} accts / {filteredActivities.length} events
                </span>
              </h2>
              <div className="flex items-center gap-3 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCriticalOnly(!criticalOnly)}
                  className={`h-9 px-4 rounded-xl border-white/5 font-black text-[9px] uppercase tracking-widest transition-all ${criticalOnly ? 'bg-red-500/20 text-red-400 border-red-500/50' : 'bg-white/5 text-white/40'}`}
                >
                  <AlertCircle className={`w-3 h-3 mr-2 ${criticalOnly ? 'text-red-400' : 'text-white/20'}`} />
                  Critical Only
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setHideNoise(!hideNoise)}
                  className={`h-9 px-4 rounded-xl border-white/5 font-black text-[9px] uppercase tracking-widest transition-all ${hideNoise ? 'bg-purple-500/20 text-purple-400 border-purple-500/50' : 'bg-white/5 text-white/40'}`}
                >
                  <EyeOff className={`w-3 h-3 mr-2 ${hideNoise ? 'text-purple-400' : 'text-white/20'}`} opacity={hideNoise ? 1 : 0.5} />
                  Hide Noise
                </Button>
                <Select value={timeFilter} onValueChange={(v) => setTimeFilter(v as any)}>
                  <SelectTrigger className="h-9 w-28 rounded-xl border-white/10 bg-white/5 text-white/60 text-[9px] font-black uppercase tracking-widest hover:bg-white/10 transition-all">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0f0a1e]/95 border-white/10 backdrop-blur-3xl rounded-xl">
                    {TIME_FILTER_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value} className="text-white/60 font-black text-[10px] uppercase tracking-widest focus:bg-white/10 focus:text-white">
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={generateCSV}
                    className="text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white hover:bg-white/10"
                  >
                    CSV
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={generatePDF}
                    className="text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white hover:bg-white/10"
                  >
                    PDF
                  </Button>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto min-h-[500px]">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/5 hover:bg-transparent">
                    <TableHead className="text-white/40 font-bold uppercase tracking-widest text-[9px] pl-6 py-4">Event / User</TableHead>
                    <TableHead className="text-white/40 font-bold uppercase tracking-widest text-[9px] py-4">Location & IP</TableHead>
                    <TableHead className="text-white/40 font-bold uppercase tracking-widest text-[9px] py-4 pr-6 text-right">Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isActivitiesLoading ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <TableRow key={i} className="border-white/5">
                        <TableCell colSpan={3} className="py-6 px-6"><Skeleton className="h-10 w-full bg-white/5 rounded-xl" /></TableCell>
                      </TableRow>
                    ))
                  ) : filteredActivities.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="h-96 text-center text-white/20 font-black text-sm uppercase tracking-tighter">
                        No activities found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredActivities.map((act) => {
                      const category = getEventCategory(act.eventName);
                      return (
                        <TableRow key={act.id} className={`border-white/5 transition-all group ${category === 'critical' ? 'bg-red-500/[0.03] hover:bg-red-500/[0.06]' : 'hover:bg-white/[0.03]'}`}>
                          <TableCell className="pl-6 py-4">
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-2">
                                <span className={`text-xs font-black transition-colors ${category === 'critical' ? 'text-red-400' : category === 'sensitive' ? 'text-blue-400' : 'text-white group-hover:text-purple-400'}`}>
                                  {act.eventName}
                                </span>
                                {category === 'critical' && <Badge className="bg-red-500 hover:bg-red-600 text-white text-[7px] font-black h-4 px-1 rounded-sm uppercase tracking-tighter shadow-[0_0_8px_rgba(239,68,68,0.4)] border-0">Critical Action</Badge>}
                                {category === 'sensitive' && <Badge className="bg-blue-500 hover:bg-blue-600 text-white text-[7px] font-black h-4 px-1 rounded-sm uppercase tracking-tighter border-0">Sensitive</Badge>}
                              </div>
                              <div className="flex items-center gap-1.5 text-[10px] text-white/30">
                                <User className="w-3 h-3" /> {act.userName}
                                {!focusedAccountId && <Badge variant="outline" className="ml-2 border-white/5 bg-white/5 text-[8px] h-4 py-0 px-1.5">{(act as any).account?.name}</Badge>}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="py-4">
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-1 text-[10px] text-white/60">
                                <MapPin className="w-3 h-3 text-blue-400/60" /> {act.location || "Unknown"}
                              </div>
                              <span className="text-[10px] text-white/20 font-mono">{act.ipAddress}</span>
                            </div>
                          </TableCell>
                          <TableCell className="py-4 pr-6 text-right">
                            <div className="text-[10px] font-black text-white/60">{format(new Date(act.eventTime), "HH:mm:ss")}</div>
                            <div className="text-[10px] text-white/20">{format(new Date(act.eventTime), "MMM d, yyyy")}</div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AccountDialog({
  open,
  onOpenChange,
  editingAccount
}: {
  open: boolean,
  onOpenChange: (open: boolean) => void,
  editingAccount: AwsAccount | null
}) {
  const { toast } = useToast();

  const form = useForm<any>({
    resolver: zodResolver(insertAwsAccountSchema),
    values: editingAccount ? {
      name: editingAccount.name,
      email: editingAccount.email || "",
      accessKey: editingAccount.accessKey,
      secretKey: editingAccount.secretKey,
      region: editingAccount.region,
      isSold: editingAccount.isSold,
    } : {
      name: "",
      email: "",
      accessKey: "",
      secretKey: "",
      region: "us-east-1",
      isSold: false,
    },
  });

  const mutation = useMutation({
    mutationFn: async (values: any) => {
      if (editingAccount) {
        await apiRequest("PUT", `/api/aws/accounts/${editingAccount.id}`, values);
      } else {
        await apiRequest("POST", "/api/aws/accounts", values);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/aws/accounts"] });
      toast({ title: editingAccount ? "Account Updated" : "Account Registered" });
      onOpenChange(false);
      form.reset();
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-panel border-white/10 bg-[#0f0a1e]/90 backdrop-blur-3xl sm:max-w-[500px] rounded-3xl p-8 shadow-4xl">
        <DialogHeader className="mb-6">
          <DialogTitle className="text-2xl font-black text-white tracking-tighter flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center text-white shadow-md">
              {editingAccount ? <Edit2 className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
            </div>
            {editingAccount ? "Edit Account" : "Register AWS Account"}
          </DialogTitle>
          <DialogDescription className="text-white/40 font-medium text-sm">
            Provide AWS credentials to track activity logs.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit((data) => mutation.mutate(data))} className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[9px] font-black uppercase tracking-widest text-white/30">Account Label</FormLabel>
                    <FormControl>
                      <Input placeholder="AWS 5 VCPU..." className="glass-panel h-11 rounded-xl border-white/5 bg-white/[0.02] text-sm text-white" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[9px] font-black uppercase tracking-widest text-white/30">Account Email</FormLabel>
                    <FormControl>
                      <Input placeholder="user@gmail.com" className="glass-panel h-11 rounded-xl border-white/5 bg-white/[0.02] text-sm text-white" {...field} value={field.value || ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="region"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[9px] font-black uppercase tracking-widest text-white/30 pt-1">Default Region</FormLabel>
                  <FormControl>
                    <Input placeholder="us-east-1" className="glass-panel h-11 rounded-xl border-white/5 bg-white/[0.02] text-sm text-white" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="accessKey"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[9px] font-black uppercase tracking-widest text-white/30 pt-1">Access Key ID</FormLabel>
                  <FormControl>
                    <Input placeholder="AKIA..." className="glass-panel h-11 rounded-xl border-white/5 bg-white/[0.02] text-sm text-white font-mono" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="secretKey"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[9px] font-black uppercase tracking-widest text-white/30 pt-1">Secret Access Key</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="••••••••••••" className="glass-panel h-11 rounded-xl border-white/5 bg-white/[0.02] text-sm text-white font-mono" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="pt-6 border-t border-white/5 gap-3">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="h-11 px-6 rounded-xl text-white/40 hover:text-white hover:bg-white/5 font-black uppercase tracking-widest text-[9px]">
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending} className="h-11 px-8 rounded-xl bg-white text-black hover:bg-white/90 font-black uppercase tracking-widest text-[9px] shadow-xl">
                {mutation.isPending ? "Processing..." : (editingAccount ? "Update Details" : "Register Account")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
