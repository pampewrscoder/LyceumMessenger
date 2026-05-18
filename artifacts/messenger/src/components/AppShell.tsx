import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/use-auth";
import { api } from "@/lib/api-client";
import { UserAvatar } from "@/components/UserAvatar";
import { Button } from "@/components/ui/button";
import { pluralRu } from "@/lib/format";
import { cn } from "@/lib/utils";

interface AppShellProps { children: React.ReactNode; }

export function AppShell({ children }: AppShellProps) {
  const { user, logout } = useAuth();
  const [location] = useLocation();

  const { data: summary } = useQuery({
    queryKey: ["chats-summary"],
    queryFn: () => api.getChatsSummary(),
    refetchInterval: 15000,
  });

  // Update tab title with unread count
  useEffect(() => {
    const unread = summary?.totalUnread ?? 0;
    document.title = unread > 0 ? `(${unread}) Лицеум` : "Лицеум";
  }, [summary?.totalUnread]);

  const displayName = user?.displayName ?? "";
  const isAdmin = user?.role === "admin";

  return (
    <div className="flex h-screen w-full flex-col bg-background">
      <header className="flex shrink-0 items-center justify-between border-b border-border/70 bg-card/80 px-6 py-3 backdrop-blur">
        <Link href="/" className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <span className="font-serif text-lg font-bold">Л</span>
          </div>
          <div className="leading-tight">
            <div className="font-serif text-lg font-semibold text-foreground">Лицеум</div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">мессенджер</div>
          </div>
        </Link>

        <nav className="hidden items-center gap-1 rounded-full border border-border/70 bg-background/60 p-1 md:flex">
          <NavTab href="/" active={location === "/" || location.startsWith("/chat")}>Чаты</NavTab>
          <NavTab href="/profile" active={location === "/profile"}>Профиль</NavTab>
          {isAdmin && <NavTab href="/admin" active={location === "/admin" || location.startsWith("/admin")} admin>Админ</NavTab>}
        </nav>

        <div className="flex items-center gap-3">
          {summary && (
            <div className="hidden items-center gap-4 rounded-full border border-border/60 bg-background/40 px-4 py-1.5 text-xs text-muted-foreground lg:flex">
              <SummaryBit label="чатов" value={summary.totalChats} />
              <SummaryBit label={pluralRu(summary.totalUnread, ["новое", "новых", "новых"])} value={summary.totalUnread} accent />
              <SummaryBit label="за неделю" value={summary.messagesLast7Days} />
            </div>
          )}
          {user && (
            <Link href="/profile" className="flex items-center gap-2">
              <UserAvatar name={displayName} src={user.avatarUrl} size="sm" />
              <span className="hidden text-sm font-medium text-foreground sm:inline">{displayName}</span>
              {isAdmin && <span className="hidden rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary sm:inline">admin</span>}
            </Link>
          )}
          <Button variant="ghost" size="sm" onClick={() => void logout()}>Выйти</Button>
        </div>
      </header>
      <main className="min-h-0 flex-1">{children}</main>
    </div>
  );
}

function NavTab({ href, active, children, admin }: { href: string; active: boolean; children: React.ReactNode; admin?: boolean }) {
  return (
    <Link href={href}
      className={cn("rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
        active ? (admin ? "bg-primary text-primary-foreground" : "bg-primary text-primary-foreground shadow-sm") : "text-muted-foreground hover:text-foreground",
      )}>
      {children}
    </Link>
  );
}

function SummaryBit({ label, value, accent = false }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="flex items-baseline gap-1">
      <span className={cn("font-serif text-base font-semibold", accent ? "text-primary" : "text-foreground")}>{value}</span>
      <span className="text-[11px] uppercase tracking-wider">{label}</span>
    </div>
  );
}
