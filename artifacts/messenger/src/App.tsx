import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/Login";
import MessengerPage from "@/pages/Messenger";
import ProfilePage from "@/pages/Profile";
import AdminPage from "@/pages/Admin";
import { AppShell } from "@/components/AppShell";
import { AuthProvider, useAuth } from "@/lib/use-auth";
import { E2EEProvider } from "@/lib/e2ee-context";
import { OnlineStatusProvider } from "@/lib/online-status";

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
});

function AuthenticatedRouter() {
  return (
    <AppShell>
      <Switch>
        <Route path="/" component={MessengerPage} />
        <Route path="/chat/:id" component={MessengerPage} />
        <Route path="/profile" component={ProfilePage} />
        <Route path="/admin" component={AdminPage} />
        <Route component={NotFound} />
      </Switch>
    </AppShell>
  );
}

function AppContent() {
  const { isLoading, isAuthenticated, refetch } = useAuth();
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="font-serif text-sm text-muted-foreground">Открываем учительскую…</p>
        </div>
      </div>
    );
  }
  if (!isAuthenticated) return <LoginPage onAuth={refetch} />;
  return <AuthenticatedRouter />;
}

function AppWithOnline() {
  const { user } = useAuth();
  return (
    <OnlineStatusProvider userId={user?.id}>
      <AppContent />
    </OnlineStatusProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <E2EEProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <AppWithOnline />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
        </E2EEProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
