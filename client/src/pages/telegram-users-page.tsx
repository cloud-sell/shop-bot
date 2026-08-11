import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Users, Save, Loader2, Edit2, Search, Ban, ShieldCheck, ChevronLeft, ChevronRight } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface TelegramUser {
  id: number;
  telegramId: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  balance: number;
  isBanned?: boolean;
  createdAt: string;
}

const PAGE_SIZE = 20;

export default function TelegramUsersPage() {
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editBalance, setEditBalance] = useState<number>(0);
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState<number>(1);

  const { data: usersData, isLoading, isError, refetch } = useQuery<TelegramUser[]>({
    queryKey: ["/api/telegram-users"],
    retry: 1,
  });

  const users: TelegramUser[] = useMemo(() => Array.isArray(usersData) ? usersData : [], [usersData]);

  const mutation = useMutation({
    mutationFn: async ({ id, balance }: { id: number; balance: number }) => {
      const res = await apiRequest("PATCH", `/api/telegram-users/${id}`, {
        balance: Math.round(balance * 100),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/telegram-users"] });
      toast({
        title: "User Updated",
        description: "Telegram user balance has been updated.",
      });
      setEditingId(null);
    },
  });

  const banMutation = useMutation({
    mutationFn: async ({ id, isBanned }: { id: number; isBanned: boolean }) => {
      const res = await apiRequest("PATCH", `/api/telegram-users/${id}`, {
        isBanned,
      });
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/telegram-users"] });
      toast({
        title: variables.isBanned ? "User Banned" : "User Unbanned",
        description: variables.isBanned
          ? "User has been banned from using the Telegram bot."
          : "User has been unbanned and restored access to the bot.",
      });
    },
  });

  const filteredUsers = useMemo(() => {
    const searchLower = (search || "").toLowerCase().trim();
    if (!searchLower) return users;

    return users.filter((user) => {
      if (!user) return false;
      const firstName = String(user.firstName || "");
      const lastName = String(user.lastName || "");
      const fullName = `${firstName} ${lastName}`.toLowerCase();
      const username = String(user.username || "").toLowerCase();
      const telegramId = String(user.telegramId || "").toLowerCase();

      return (
        fullName.includes(searchLower) ||
        username.includes(searchLower) ||
        telegramId.includes(searchLower)
      );
    });
  }, [users, search]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
  const validCurrentPage = Math.min(currentPage, totalPages);

  const paginatedUsers = useMemo(() => {
    const start = (validCurrentPage - 1) * PAGE_SIZE;
    return filteredUsers.slice(start, start + PAGE_SIZE);
  }, [filteredUsers, validCurrentPage]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setCurrentPage(1);
  };

  const handleEdit = (user: TelegramUser) => {
    setEditingId(user.id);
    setEditBalance((user.balance || 0) / 100);
  };

  const handleSave = () => {
    if (editingId !== null) {
      mutation.mutate({ id: editingId, balance: editBalance });
    }
  };

  return (
    <div className="space-y-8 animate-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl sm:text-5xl font-black tracking-tighter text-white drop-shadow-2xl">
            Telegram Users
          </h1>
          <p className="text-white/40 text-xs sm:text-sm font-medium mt-1">
            Manage bot subscribers, view balances & access status.
          </p>
        </div>
        <div className="px-5 py-2 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center gap-3 text-sm font-bold text-white shadow-lg">
          <Users className="w-5 h-5 text-purple-400" />
          <span>{users.length} Total Users</span>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/20" />
          <Input
            placeholder="Search by name, @username, or Telegram ID..."
            className="pl-12 h-12 rounded-2xl border-white/10 bg-[#130d24] text-white placeholder:text-white/30 focus:border-purple-500/50"
            value={search}
            onChange={handleSearchChange}
          />
        </div>

        {totalPages > 1 && (
          <div className="flex items-center gap-2 self-end sm:self-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={validCurrentPage === 1}
              className="h-10 px-3 rounded-xl border-white/10 bg-[#130d24] text-white hover:bg-white/10 disabled:opacity-30"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-xs font-bold text-white/60 px-2">
              Page {validCurrentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={validCurrentPage === totalPages}
              className="h-10 px-3 rounded-xl border-white/10 bg-[#130d24] text-white hover:bg-white/10 disabled:opacity-30"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>

      <div className="space-y-3">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
          </div>
        ) : isError ? (
          <Card className="border border-red-500/20 bg-red-950/20">
            <CardContent className="pt-6 text-center space-y-3">
              <p className="text-red-400 text-sm font-bold">Failed to load Telegram users.</p>
              <Button onClick={() => refetch()} variant="outline" className="border-red-500/30 text-white">
                Retry
              </Button>
            </CardContent>
          </Card>
        ) : filteredUsers.length === 0 ? (
          <Card className="border border-white/10 bg-[#130d24]">
            <CardContent className="pt-6">
              <p className="text-center text-white/50 text-sm">
                {search ? "No users found matching your search" : "No telegram users yet"}
              </p>
            </CardContent>
          </Card>
        ) : (
          paginatedUsers.map((user) => {
            const isUserBanned = Boolean(user.isBanned);
            const userDisplayName = (user.firstName || user.lastName)
              ? `${user.firstName || ""} ${user.lastName || ""}`.trim()
              : (user.username ? `@${user.username}` : `User ${user.telegramId || user.id}`);

            return (
              <div
                key={`user-${user.id || user.telegramId}`}
                className={`p-5 rounded-2xl border transition-all duration-200 ${
                  isUserBanned
                    ? 'border-red-500/30 bg-red-950/20'
                    : 'border-white/10 bg-[#130d24] hover:border-purple-500/30'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <p className="font-bold text-white text-base sm:text-lg">
                        {userDisplayName}
                      </p>
                      {isUserBanned ? (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30 flex items-center gap-1">
                          <Ban className="w-3 h-3" /> BANNED
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                          <ShieldCheck className="w-3 h-3" /> ACTIVE
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-white/60 font-mono">
                      ID: {String(user.telegramId || user.id)} {user.username ? `(@${user.username})` : ""}
                    </p>
                    <p className="text-xs text-purple-300 font-bold">
                      Balance: ${(((user.balance || 0)) / 100).toFixed(2)}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <Button
                      onClick={() => banMutation.mutate({ id: user.id, isBanned: !isUserBanned })}
                      disabled={banMutation.isPending}
                      variant="outline"
                      size="sm"
                      className={
                        isUserBanned
                          ? "border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 bg-emerald-950/20 h-9 rounded-xl text-xs font-bold"
                          : "border-red-500/30 text-red-400 hover:bg-red-500/20 bg-red-950/20 h-9 rounded-xl text-xs font-bold"
                      }
                    >
                      {isUserBanned ? (
                        <>
                          <ShieldCheck className="w-3.5 h-3.5 mr-1.5 text-emerald-400" /> Unban User
                        </>
                      ) : (
                        <>
                          <Ban className="w-3.5 h-3.5 mr-1.5 text-red-400" /> Ban User
                        </>
                      )}
                    </Button>

                    <Button
                      onClick={() => handleEdit(user)}
                      variant="ghost"
                      size="icon"
                      className="text-purple-400 hover:bg-purple-500/10 h-9 w-9 rounded-xl"
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-4 border-t border-white/5">
          <span className="text-xs font-medium text-white/40">
            Showing {(validCurrentPage - 1) * PAGE_SIZE + 1} - {Math.min(validCurrentPage * PAGE_SIZE, filteredUsers.length)} of {filteredUsers.length} users
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={validCurrentPage === 1}
              className="h-9 px-3 rounded-xl border-white/10 bg-[#130d24] text-white hover:bg-white/10 disabled:opacity-30 text-xs font-bold"
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={validCurrentPage === totalPages}
              className="h-9 px-3 rounded-xl border-white/10 bg-[#130d24] text-white hover:bg-white/10 disabled:opacity-30 text-xs font-bold"
            >
              Next
            </Button>
          </div>
        </div>
      )}

      <Dialog open={editingId !== null} onOpenChange={(open) => !open && setEditingId(null)}>
        <DialogContent className="border-white/10 bg-[#130d24] text-white rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white font-bold text-lg">Edit User Balance</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label className="text-white/70 text-xs font-bold">Balance ($)</Label>
              <Input
                type="number"
                step="0.01"
                value={editBalance}
                onChange={(e) => setEditBalance(parseFloat(e.target.value) || 0)}
                className="h-11 rounded-xl border-white/10 bg-white/5 text-white text-sm"
              />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button
                variant="outline"
                onClick={() => setEditingId(null)}
                className="border-white/10 text-white hover:bg-white/5 h-10 rounded-xl text-xs font-bold"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={mutation.isPending}
                className="bg-gradient-to-r from-purple-500 to-blue-600 text-white h-10 rounded-xl text-xs font-bold px-5"
              >
                {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
                Save Balance
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
