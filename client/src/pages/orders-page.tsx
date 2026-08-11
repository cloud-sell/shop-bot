import { useOrders } from "@/hooks/use-orders";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Search, ShoppingCart, Calendar, User, Eye, Copy, Check, Package } from "lucide-react";
import { useState } from "react";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export default function OrdersPage() {
  const { data: orders, isLoading } = useOrders();
  const [search, setSearch] = useState("");
  const { toast } = useToast();
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const copyToClipboard = (text: string, id: number) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast({
      title: "Copied!",
      description: "Credentials copied to clipboard.",
    });
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filteredOrders = orders?.filter(order => 
    order.product?.name.toLowerCase().includes(search.toLowerCase()) ||
    order.telegramUser?.username?.toLowerCase().includes(search.toLowerCase()) ||
    order.telegramUser?.telegramId.includes(search)
  ) || [];

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Orders</h1>
          <p className="text-white/40 mt-1 font-medium">History of all transactions.</p>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-white/30" />
          <Input
            type="search"
            placeholder="Search orders..."
            className="pl-9 glass-panel border-white/10 text-white placeholder:text-white/20"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="glass-card border-0 rounded-3xl overflow-hidden shadow-2xl">
        <Table>
          <TableHeader>
            <TableRow className="border-white/5 hover:bg-transparent">
              <TableHead className="text-white/40 font-bold uppercase tracking-widest text-[10px]">Order ID</TableHead>
              <TableHead className="text-white/40 font-bold uppercase tracking-widest text-[10px]">Product</TableHead>
              <TableHead className="text-white/40 font-bold uppercase tracking-widest text-[10px]">Buyer</TableHead>
              <TableHead className="text-white/40 font-bold uppercase tracking-widest text-[10px]">Date</TableHead>
              <TableHead className="text-white/40 font-bold uppercase tracking-widest text-[10px]">Status</TableHead>
              <TableHead className="text-white/40 font-bold uppercase tracking-widest text-[10px]">Amount</TableHead>
              <TableHead className="text-white/40 font-bold uppercase tracking-widest text-[10px] text-right pr-8">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i} className="border-white/5">
                  <TableCell><Skeleton className="h-5 w-12 bg-white/5" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-32 bg-white/5" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-24 bg-white/5" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-20 bg-white/5" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-16 bg-white/5" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-16 bg-white/5" /></TableCell>
                  <TableCell className="pr-8"><Skeleton className="h-8 w-8 ml-auto rounded-xl bg-white/5" /></TableCell>
                </TableRow>
              ))
            ) : filteredOrders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-white/20 font-medium">
                  No orders found.
                </TableCell>
              </TableRow>
            ) : (
              filteredOrders.map((order) => (
                <TableRow key={order.id} className="border-white/5 hover:bg-white/5 transition-all duration-500">
                  <TableCell className="font-mono text-[10px] text-white/30 tracking-tighter">#{order.id}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-purple-500/20 to-blue-500/20 flex items-center justify-center text-purple-400">
                        <ShoppingCart className="w-4 h-4" />
                      </div>
                      <span className="text-sm font-bold text-white tracking-tight">{order.product?.name || "Deleted Product"}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center text-white/30">
                        <User className="w-4 h-4" />
                      </div>
                      {order.telegramUser ? (
                        <div className="flex flex-col min-w-0">
                          <span className="text-sm font-bold text-white tracking-tight truncate">@{order.telegramUser.username || "No Username"}</span>
                          <span className="text-[10px] text-white/20 font-black">ID: {order.telegramUser.telegramId}</span>
                        </div>
                      ) : (
                        <span className="text-white/20 italic text-xs">Unknown User</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 text-white/40 text-[11px] font-bold">
                      <Calendar className="w-3 h-3 text-white/20" />
                      {order.createdAt ? format(new Date(order.createdAt), "MMM d, HH:mm") : "-"}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className="bg-green-500/10 text-green-400 border-green-500/20 text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-lg">
                      Completed
                    </Badge>
                  </TableCell>
                  <TableCell className="font-black text-sm text-white">
                    ${((order.product?.price || 0) / 100).toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right pr-8">
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-10 w-10 rounded-xl text-white/20 hover:text-white hover:bg-white/5 transition-all">
                          <Eye className="h-5 w-5" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="glass-panel border-white/10 bg-background/95 backdrop-blur-3xl sm:max-w-md rounded-[2rem] p-8 shadow-4xl">
                        <DialogHeader className="mb-6">
                          <DialogTitle className="flex items-center gap-3 text-2xl font-black text-white tracking-tighter">
                            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center text-white shadow-lg">
                              <Package className="w-5 h-5" />
                            </div>
                            Credentials
                          </DialogTitle>
                        </DialogHeader>
                        <div className="space-y-6">
                          <div className="p-6 rounded-3xl glass-panel border-white/5 bg-white/[0.02] relative group min-h-[120px] flex items-center justify-center overflow-hidden">
                            <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                            <pre className="text-sm text-white/80 font-mono whitespace-pre-wrap break-all relative z-10 leading-relaxed text-center">
                              {order.credential?.content || "No content available"}
                            </pre>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="absolute top-4 right-4 h-10 w-10 rounded-xl bg-white/5 hover:bg-white/10 text-white transition-all opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100"
                              onClick={() => copyToClipboard(order.credential?.content || "", order.id)}
                            >
                              {copiedId === order.id ? (
                                <Check className="h-5 w-5 text-green-400" />
                              ) : (
                                <Copy className="h-5 w-5 text-white/40" />
                              )}
                            </Button>
                          </div>
                          <div className="flex items-center justify-between px-2 pt-2 border-t border-white/5">
                            <div className="flex flex-col gap-1">
                              <span className="text-[10px] text-white/20 font-black uppercase tracking-widest">Product</span>
                              <span className="text-sm text-white/60 font-bold">{order.product?.name}</span>
                            </div>
                            <div className="flex flex-col gap-1 text-right">
                              <span className="text-[10px] text-white/20 font-black uppercase tracking-widest">Buyer</span>
                              <span className="text-sm text-white/60 font-bold">@{order.telegramUser?.username || "Unknown"}</span>
                            </div>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
