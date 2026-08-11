import { useStats } from "@/hooks/use-stats";
import { useOrders } from "@/hooks/use-orders";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  DollarSign, 
  Package, 
  ShoppingCart, 
  TrendingUp, 
  Users 
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useStats();
  const { data: orders, isLoading: ordersLoading } = useOrders();

  // Historical data for the chart from orders
  const chartData = orders ? Array.from({ length: 7 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - i));
    const dayName = format(date, "EEE");
    const dayStart = new Date(date.setHours(0, 0, 0, 0));
    const dayEnd = new Date(date.setHours(23, 59, 59, 999));
    
    const dailyTotal = orders
      .filter(order => {
        const orderDate = new Date(order.createdAt!);
        return orderDate >= dayStart && orderDate <= dayEnd;
      })
      .reduce((sum, order) => sum + (order.product?.price || 0), 0);
      
    return { name: dayName, total: dailyTotal / 100 };
  }) : [
    { name: "Mon", total: 0 },
    { name: "Tue", total: 0 },
    { name: "Wed", total: 0 },
    { name: "Thu", total: 0 },
    { name: "Fri", total: 0 },
    { name: "Sat", total: 0 },
    { name: "Sun", total: 0 },
  ];

  const recentOrders = orders?.slice(0, 5) || [];

  return (
    <div className="space-y-10 animate-in">
      <div className="flex items-center justify-between">
        <h1 className="text-5xl font-black tracking-tighter text-white drop-shadow-2xl">
          Dashboard
        </h1>
        <div className="glass-panel px-6 py-2.5 rounded-full flex items-center gap-3 text-sm font-bold text-white shadow-lg border-white/20">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse shadow-[0_0_15px_rgba(74,222,128,0.6)]" />
          System Active
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Daily Revenue"
          value={stats ? `$${(stats.dailyRevenue / 100).toFixed(2)}` : "$0.00"}
          icon={TrendingUp}
          description="Last 24 hours"
          loading={statsLoading}
        />
        <StatsCard
          title="Daily Sales"
          value={stats?.dailySales?.toString() ?? "0"}
          icon={ShoppingCart}
          description="Items sold today"
          loading={statsLoading}
        />
        <StatsCard
          title="Total Revenue"
          value={stats ? `$${(stats.totalRevenue / 100).toFixed(2)}` : "$0.00"}
          icon={DollarSign}
          description="Total gross revenue"
          loading={statsLoading}
        />
        <StatsCard
          title="Total Sales"
          value={stats?.totalSales.toString() || "0"}
          icon={Package}
          description="Total successful orders"
          loading={statsLoading}
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
        {/* Chart */}
        <Card className="col-span-4 glass-card p-2 border-0">
          <CardHeader>
            <CardTitle className="text-xl font-bold flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              Revenue Overview
            </CardTitle>
          </CardHeader>
          <CardContent className="pl-2">
            <div className="h-[350px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                  <XAxis 
                    dataKey="name" 
                    stroke="#888888" 
                    fontSize={12} 
                    tickLine={false} 
                    axisLine={false} 
                  />
                  <YAxis
                    stroke="#888888"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => `$${value}`}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      borderRadius: '8px',
                      border: '1px solid hsl(var(--border))'
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="total"
                    stroke="hsl(var(--primary))"
                    fillOpacity={1}
                    fill="url(#colorTotal)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Recent Orders */}
        <Card className="col-span-3 glass-card border-0">
          <CardHeader>
            <CardTitle className="text-xl font-bold">Recent Orders</CardTitle>
          </CardHeader>
          <CardContent>
            {ordersLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-4">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="space-y-2 flex-1">
                      <Skeleton className="h-4 w-[200px]" />
                      <Skeleton className="h-3 w-[150px]" />
                    </div>
                  </div>
                ))}
              </div>
            ) : recentOrders.length > 0 ? (
              <div className="space-y-6">
                {recentOrders.map((order) => (
                  <div key={order.id} className="flex items-center justify-between group">
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-200">
                        <ShoppingCart className="w-5 h-5" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-medium leading-none">
                          {order.product?.name || "Unknown Product"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {order.telegramUser?.username || "Anonymous"}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">
                        ${((order.product?.price || 0) / 100).toFixed(2)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {order.createdAt ? format(new Date(order.createdAt), "MMM d") : ""}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground py-8">
                <Package className="w-12 h-12 mb-3 opacity-20" />
                <p>No orders yet</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatsCard({ 
  title, 
  value, 
  icon: Icon, 
  description, 
  loading 
}: { 
  title: string; 
  value: string; 
  icon: any; 
  description: string; 
  loading: boolean;
}) {
  return (
    <Card className="glass-card border-0">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          {title}
        </CardTitle>
        <div className="p-2 rounded-xl bg-primary/10">
          <Icon className="h-4 w-4 text-primary" />
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-24 bg-white/5" />
            <Skeleton className="h-3 w-32 bg-white/5" />
          </div>
        ) : (
          <>
            <div className="text-3xl font-black tracking-tight">{value}</div>
            <p className="text-xs text-muted-foreground mt-2 font-medium">
              {description}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
