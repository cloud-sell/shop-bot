import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import { LayoutShell } from "@/components/layout-shell";
import { AdminNotifier } from "@/components/admin-notifier";

// Eagerly import all pages to eliminate dynamic chunk import errors permanently!
import Dashboard from "@/pages/dashboard";
import ProductsPage from "@/pages/products-page";
import InventoryPage from "@/pages/inventory-page";
import OrdersPage from "@/pages/orders-page";
import PaymentsPage from "@/pages/payments-page";
import SettingsPage from "@/pages/settings-page";
import AwsCheckerPage from "@/pages/aws-checker-page";
import BroadcastPage from "@/pages/broadcast-page";
import LoginPage from "@/pages/login-page";
import SpecialOffersPage from "@/pages/special-offers-page";
import TelegramUsersPage from "@/pages/telegram-users-page";
import SpamProtectorPage from "@/pages/spam-protector-page";
import TelegramClientPage from "@/pages/telegram-client-page";
import BackupPage from "@/pages/backup-page";
import ForwardPage from "@/pages/forward-page";
import MiniAppShop from "@/pages/mini-app-shop";
import NotFound from "@/pages/not-found";
import { ErrorBoundary } from "@/components/error-boundary";

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
      <ErrorBoundary>
        <Component />
      </ErrorBoundary>
    </LayoutShell>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/login">
        <LoginPage />
      </Route>
      
      <Route path="/shop">
        <MiniAppShop />
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

      <Route path="/spam-protector">
        <ProtectedRoute component={SpamProtectorPage} />
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
