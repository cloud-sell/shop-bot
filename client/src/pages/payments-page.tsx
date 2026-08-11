import { useQuery } from "@tanstack/react-query";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { Search, Wallet, Clock, CheckCircle2, XCircle } from "lucide-react";
import { format } from "date-fns";

export default function PaymentsPage() {
  const [search, setSearch] = useState("");
  const { data: payments, isLoading } = useQuery<any[]>({
    queryKey: ["/api/payments"],
  });

  const filteredPayments = payments?.filter((payment) => {
    const searchLower = search.toLowerCase();
    const username = payment.telegramUser?.username?.toLowerCase() || "";
    const telegramId = payment.telegramUser?.telegramId || "";
    const method = payment.paymentMethod?.toLowerCase() || "";
    return (
      username.includes(searchLower) ||
      telegramId.includes(searchLower) ||
      method.includes(searchLower)
    );
  });

  if (isLoading) {
    return <div className="p-8">Loading payments...</div>;
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/20"><CheckCircle2 className="w-3 h-3 mr-1" /> Completed</Badge>;
      case "failed":
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/20"><XCircle className="w-3 h-3 mr-1" /> Failed</Badge>;
      case "expired":
        return <Badge className="bg-gray-500/20 text-gray-400 border-gray-500/20"><Clock className="w-3 h-3 mr-1" /> Expired</Badge>;
      default:
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/20"><Clock className="w-3 h-3 mr-1" /> Pending</Badge>;
    }
  };

  return (
    <div className="space-y-8 animate-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-black text-white tracking-tighter">Payments</h1>
          <p className="text-white/40 mt-1 font-medium">Manage and track user deposits</p>
        </div>
        <div className="glass-panel px-6 py-3 rounded-2xl flex items-center gap-3">
          <Wallet className="w-5 h-5 text-purple-400" />
          <span className="text-white font-bold">Payment Gateway</span>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/20" />
        <Input
          placeholder="Search by username, ID or method..."
          className="glass-panel pl-12 h-14 rounded-2xl border-white/10 text-white placeholder:text-white/20"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <Card className="glass-card border-0">
        <CardHeader>
          <CardTitle className="text-xl font-bold text-white">Transaction History</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="border-white/5 hover:bg-transparent">
                <TableHead className="text-white/40 font-bold">User</TableHead>
                <TableHead className="text-white/40 font-bold">Amount</TableHead>
                <TableHead className="text-white/40 font-bold">Method</TableHead>
                <TableHead className="text-white/40 font-bold">Status</TableHead>
                <TableHead className="text-white/40 font-bold">Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPayments?.map((payment) => (
                <TableRow key={payment.id} className="border-white/5 hover:bg-white/5 transition-colors">
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="text-white font-bold">@{payment.telegramUser?.username || "Unknown"}</span>
                      <span className="text-white/30 text-xs">ID: {payment.telegramUser?.telegramId}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-white font-bold">
                    ${(payment.amount / 100).toFixed(2)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="border-white/10 text-white/60">
                      {payment.paymentMethod}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {getStatusBadge(payment.status)}
                  </TableCell>
                  <TableCell className="text-white/40 text-sm">
                    {format(new Date(payment.createdAt), "MMM d, HH:mm")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
