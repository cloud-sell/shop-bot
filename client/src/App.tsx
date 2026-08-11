import { lazy, Suspense } from "react";
import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import { LayoutShell } from "@/components/layout-shell";
import { AdminNotifier } from "@/components/admin-notifier";

// Lazy load pages for code splitting
const Dashboard = lazy(() => import("@/pages/dashboard"));
const ProductsPage = lazy(() => import("@/pages/products-page"));
const InventoryPage = lazy(() => import("@/pages/inventory-page"));
const OrdersPage = lazy(() => import("@/pages/orders-page"));
const PaymentsPage = lazy(() => import("@/pages/payments-page"));
const SettingsPage = lazy(() => import("@/pages/settings-page"));
const AwsCheckerPage = lazy(() => import("@/pages/aws-checker-page"));
const BroadcastPage = lazy(() => import("@/pages/broadcast-page"));
const LoginPage = lazy(() => import("@/pages/login-page"));
const SpecialOffersPage = lazy(() => import("@/pages/special-offers-page"));
const TelegramUsersPage = lazy(() => import("@/pages/telegram-users-page"));
const TelegramClientPage = lazy(() => import("@/pages/telegram-client-page"));
const BackupPage = lazy(() => import("@/pages/backup-page"));
const ForwardPage = lazy(() => import("@/pages/forward-page"));
const MiniAppShop = lazy(() => import("@/pages/mini-app-shop"));
const NotFound = lazy(() => import("@/pages/not-found"));

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <PageLoader />;
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  return (
    <LayoutShell>
      <Suspense fallback={<PageLoader />}>
        <Component />
      </Suspense>
    </LayoutShell>
  );
}

function Router() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        <Route path="/login">
          <LoginPage />
        </Route>
        
        <Route path="/shop">
          <Suspense fallback={<PageLoader />}>
            <MiniAppShop />
          </Suspense>
        </Route>

        <Route path="/">
          <ProtectedRoute component={Dashboard} />
        </Route>
        
        <Route path="/products">
          <ProtectedRoute component={ProductsPage} />
        </Route>
        
        <Route path="/inventory">
          <ProtectedRoute component={InventoryPage} />
        </Route>

        <Route path="/orders">
          <ProtectedRoute component={OrdersPage} />
        </Route>

        <Route path="/payments">
          <ProtectedRoute component={PaymentsPage} />
        </Route>

        <Route path="/broadcast">
          <ProtectedRoute component={BroadcastPage} />
        </Route>

        <Route path="/settings">
          <ProtectedRoute component={SettingsPage} />
        </Route>

        <Route path="/aws-checker">
          <ProtectedRoute component={AwsCheckerPage} />
        </Route>

        <Route path="/special-offers">
          <ProtectedRoute component={SpecialOffersPage} />
        </Route>

        <Route path="/backups">
          <ProtectedRoute component={BackupPage} />
        </Route>

        <Route path="/users">
          <ProtectedRoute component={TelegramUsersPage} />
        </Route>

        <Route path="/telegram-client">
          <ProtectedRoute component={TelegramClientPage} />
        </Route>

        <Route path="/forward">
          <ProtectedRoute component={ForwardPage} />
        </Route>

        {/* Fallback to 404 */}
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

import { ThemeProvider } from "@/components/theme-provider";

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="dark" storageKey="shopeefy-theme">
        <TooltipProvider>
          <Toaster />
          <AdminNotifier />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
