import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Users, Save, Loader2, Edit2, Search } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface TelegramUser {
  id: number;
  telegramId: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  balance: number;
  createdAt: string;
}

export default function TelegramUsersPage() {
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editBalance, setEditBalance] = useState<number>(0);
  const [search, setSearch] = useState("");

  const { data: users = [], isLoading } = useQuery<TelegramUser[]>({
    queryKey: ["/api/telegram-users"],
  });

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

  const filteredUsers = users.filter((user) => {
    const searchLower = search.toLowerCase();
    const fullName = `${user.firstName || ""} ${user.lastName || ""}`.toLowerCase();
    const username = user.username?.toLowerCase() || "";
    const telegramId = user.telegramId.toLowerCase();
    
    return (
      fullName.includes(searchLower) ||
      username.includes(searchLower) ||
      telegramId.includes(searchLower)
    );
  });

  const handleEdit = (user: TelegramUser) => {
    setEditingId(user.id);
    setEditBalance(user.balance / 100);
  };

  const handleSave = () => {
    if (editingId !== null) {
      mutation.mutate({ id: editingId, balance: editBalance });
    }
  };

  return (
    <div className="space-y-10 animate-in">
      <div className="flex items-center justify-between">
        <h1 className="text-5xl font-black tracking-tighter text-white drop-shadow-2xl">
          Telegram Users
        </h1>
        <div className="glass-panel px-6 py-2.5 rounded-full flex items-center gap-3 text-sm font-bold text-white shadow-lg border-white/20">
          <Users className="w-5 h-5 text-purple-400" />
          {users.length} Users
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/20" />
        <Input
          placeholder="Search users..."
          className="glass-panel pl-12 h-14 rounded-2xl border-white/10 text-white placeholder:text-white/20"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="space-y-4">
        {isLoading ? (
          <div className="flex justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
          </div>
        ) : filteredUsers.length === 0 ? (
          <Card className="glass-card border-0">
            <CardContent className="pt-6">
              <p className="text-center text-white/50">
                {search ? "No users found matching your search" : "No telegram users yet"}
              </p>
            </CardContent>
          </Card>
        ) : (
          filteredUsers.map((user) => (
            <Card key={user.id} className="glass-card border-0">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="font-bold text-white">
                      {user.firstName || ""} {user.lastName || ""}
                    </p>
                    <p className="text-sm text-white/60">
                      ID: {user.telegramId} {user.username && `(@${user.username})`}
                    </p>
                    <p className="text-xs text-white/40">
                      Balance: ${(user.balance / 100).toFixed(2)}
                    </p>
                  </div>
                  <Button
                    onClick={() => handleEdit(user)}
                    variant="ghost"
                    size="icon"
                    className="text-purple-400"
                    data-testid={`button-edit-user-${user.id}`}
                  >
                    <Edit2 className="w-5 h-5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Dialog open={editingId !== null} onOpenChange={(open) => !open && setEditingId(null)}>
        <DialogContent className="glass-card border-white/20">
          <DialogHeader>
            <DialogTitle className="text-white">Edit User Balance</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-white/70">Balance ($)</Label>
              <Input
                type="number"
                step="0.01"
                value={editBalance}
                onChange={(e) => setEditBalance(parseFloat(e.target.value) || 0)}
                className="glass-panel border-white/10 bg-white/5 text-white"
                data-testid="input-user-balance"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => setEditingId(null)}
                className="border-white/20 text-white"
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={mutation.isPending}
                className="bg-gradient-to-r from-purple-500 to-blue-600"
                data-testid="button-save-balance"
              >
                {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
