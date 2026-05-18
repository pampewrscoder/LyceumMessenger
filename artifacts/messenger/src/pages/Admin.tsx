import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Link, useLocation } from "wouter";
import { api } from "@/lib/api-client";
import type { UserProfile, AdminChat } from "@/lib/api-client";
import { useAuth } from "@/lib/use-auth";
import { UserAvatar } from "@/components/UserAvatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/format";

type Tab = "dashboard" | "users" | "chats" | "reports";

export default function AdminPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [, setLocation] = useLocation();

  if (!user) return null;
  if (user.role !== "admin") {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center">
        <div className="mb-4 text-5xl">🔒</div>
        <h2 className="font-serif text-2xl text-foreground">Доступ запрещён</h2>
        <p className="mt-2 text-sm text-muted-foreground">Эта страница доступна только администраторам.</p>
        <Button onClick={() => setLocation("/")} className="mt-6">На главную</Button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      {/* Sidebar */}
      <aside className="flex w-56 shrink-0 flex-col border-r border-border/70 bg-card/40">
        <div className="border-b border-border/70 px-5 py-5">
          <div className="font-serif text-lg font-semibold text-foreground">Панель управления</div>
          <div className="mt-0.5 text-xs text-muted-foreground">Администратор</div>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {(["dashboard", "users", "chats", "reports"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors text-left",
                tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
              {t === "dashboard" && <GridIcon />}
              {t === "users" && <UsersIcon />}
              {t === "chats" && <ChatIcon />}
              {t === "reports" && <FlagIcon />}
              {t === "dashboard" && "Обзор"}
              {t === "users" && "Пользователи"}
              {t === "chats" && "Беседы"}
              {t === "reports" && "Жалобы"}
            </button>
          ))}
        </nav>
        <div className="border-t border-border/70 p-3">
          <Link href="/" className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
            <ArrowLeftIcon /> В мессенджер
          </Link>
        </div>
      </aside>
      {/* Content */}
      <main className="min-h-0 flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="p-8">
            {tab === "dashboard" && <DashboardTab />}
            {tab === "users" && <UsersTab currentUserId={user.id} />}
            {tab === "chats" && <ChatsTab />}
            {tab === "reports" && <ReportsTab />}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}

// ── Dashboard ────────────────────────────────────────────────────────────

function DashboardTab() {
  const { data: stats, isLoading } = useQuery({ queryKey: ["admin-stats"], queryFn: () => api.adminStats(), refetchInterval: 30_000 });

  if (isLoading) return <LoadingSpinner />;
  if (!stats) return null;

  const maxMsg = Math.max(...stats.messagesWeek, 1);
  const maxUsr = Math.max(...stats.newUsersWeek, 1);
  const days = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
  const todayIdx = (new Date().getDay() + 6) % 7;
  const dayLabels = Array.from({ length: 7 }, (_, i) => days[(todayIdx - 6 + i + 7) % 7]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-3xl text-foreground">Обзор системы</h1>
        <p className="mt-1 text-sm text-muted-foreground">Статистика в реальном времени.</p>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Пользователей", value: stats.totalUsers, sub: `${stats.activeUsers24h} онлайн за 24ч`, accent: false },
          { label: "Бесед", value: stats.totalChats, sub: "всего в системе", accent: false },
          { label: "Сообщений", value: stats.totalMessages, sub: `${stats.messagesToday} сегодня`, accent: true },
          { label: "Новых сегодня", value: stats.messagesToday, sub: "сообщений за сутки", accent: false },
        ].map((card) => (
          <div key={card.label} className={cn("rounded-2xl border border-border bg-card p-5 shadow-sm", card.accent && "border-primary/30 bg-primary/5")}>
            <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{card.label}</div>
            <div className={cn("mt-1 font-serif text-4xl font-semibold", card.accent ? "text-primary" : "text-foreground")}>{stats && card.value.toLocaleString("ru-RU")}</div>
            <div className="mt-1 text-xs text-muted-foreground">{card.sub}</div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title="Сообщения за 7 дней" bars={stats.messagesWeek} max={maxMsg} labels={dayLabels} color="hsl(355 45% 35%)" />
        <ChartCard title="Новые пользователи за 7 дней" bars={stats.newUsersWeek} max={maxUsr} labels={dayLabels} color="hsl(120 15% 40%)" />
      </div>
    </div>
  );
}

function ChartCard({ title, bars, max, labels, color }: { title: string; bars: number[]; max: number; labels: string[]; color: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h3 className="mb-4 font-medium text-foreground">{title}</h3>
      <div className="flex h-36 items-end gap-1.5">
        {bars.map((v, i) => {
          const pct = max === 0 ? 0 : (v / max) * 100;
          return (
            <div key={i} className="group relative flex flex-1 flex-col items-center justify-end h-full">
              <div className="absolute -top-7 left-1/2 -translate-x-1/2 rounded-md bg-foreground px-1.5 py-0.5 text-[10px] text-background opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">{v}</div>
              <span className="text-[9px] text-muted-foreground">{labels[i]}</span>
              <div className="w-full rounded-t-md transition-all duration-300" style={{ height: `${Math.max(pct, 2)}%`, backgroundColor: color, opacity: 0.7 + (i / bars.length) * 0.3 }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Users ────────────────────────────────────────────────────────────────

function UsersTab({ currentUserId }: { currentUserId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [filter, setFilter] = useState("");
  const { data: users, isLoading } = useQuery({ queryKey: ["admin-users"], queryFn: () => api.adminUsers() });

  const updateUser = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof api.adminUpdateUser>[1] }) => api.adminUpdateUser(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-users"] }); toast({ title: "Обновлено" }); },
    onError: (e) => toast({ title: "Ошибка", description: e instanceof Error ? e.message : "Попробуйте позже", variant: "destructive" }),
  });

  const clearMsgs = useMutation({
    mutationFn: (id: string) => api.adminClearMessages(id),
    onSuccess: (r) => toast({ title: `Удалено ${r.deleted} сообщений` }),
    onError: (e) => toast({ title: "Ошибка", description: e instanceof Error ? e.message : "", variant: "destructive" }),
  });

  const filtered = (users ?? []).filter((u) => u.displayName.toLowerCase().includes(filter.toLowerCase()) || u.email.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl text-foreground">Пользователи</h1>
          <p className="mt-1 text-sm text-muted-foreground">{users?.length ?? 0} зарегистрированных</p>
        </div>
        <Input className="max-w-64" placeholder="Поиск…" value={filter} onChange={(e) => setFilter(e.target.value)} />
      </div>
      {isLoading ? <LoadingSpinner /> : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-border/70 bg-muted/40">
              <tr>
                {["Пользователь", "Email", "Роль", "Статус", "Последний визит", "Действия"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {filtered.map((u) => (
                <tr key={u.id} className={cn("transition-colors hover:bg-muted/30", u.isBanned && "opacity-60 bg-destructive/5")}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <UserAvatar name={u.displayName} src={u.avatarUrl} size="sm" />
                      <div>
                        <div className="font-medium text-foreground">{u.displayName}</div>
                        {u.id === currentUserId && <div className="text-[10px] text-muted-foreground">Это вы</div>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                  <td className="px-4 py-3">
                    <RoleBadge role={u.role} />
                  </td>
                  <td className="px-4 py-3">
                    {u.isBanned ? <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-medium text-destructive">Заблокирован</span>
                      : <span className="rounded-full bg-green-500/15 px-2 py-0.5 text-xs font-medium text-green-700">Активен</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{u.lastSeen ? formatTime(u.lastSeen) : "Никогда"}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {u.id !== currentUserId && (
                        <>
                          <Button size="sm" variant="outline" className="h-7 text-xs"
                            onClick={() => updateUser.mutate({ id: u.id, data: { isBanned: !u.isBanned } })}>
                            {u.isBanned ? "Разблок." : "Заблок."}
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 text-xs"
                            onClick={() => updateUser.mutate({ id: u.id, data: { role: u.role === "admin" ? "user" : "admin" } })}>
                            {u.role === "admin" ? "→ User" : "→ Admin"}
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => { if (confirm(`Удалить все сообщения ${u.displayName}?`)) clearMsgs.mutate(u.id); }}>
                            Сообщения
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <div className="py-12 text-center text-sm text-muted-foreground">Никого не нашли</div>}
        </div>
      )}
    </div>
  );
}

// ── Chats ────────────────────────────────────────────────────────────────

function ChatsTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [filter, setFilter] = useState("");
  const { data: chats, isLoading } = useQuery({ queryKey: ["admin-chats"], queryFn: () => api.adminChats() });

  const delChat = useMutation({
    mutationFn: (id: number) => api.adminDeleteChat(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-chats"] }); toast({ title: "Беседа удалена" }); },
    onError: (e) => toast({ title: "Ошибка", description: e instanceof Error ? e.message : "", variant: "destructive" }),
  });

  const filtered = (chats ?? []).filter((c) => (c.name ?? "").toLowerCase().includes(filter.toLowerCase()) || c.participants.some((p) => p.displayName.toLowerCase().includes(filter.toLowerCase())));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl text-foreground">Беседы</h1>
          <p className="mt-1 text-sm text-muted-foreground">{chats?.length ?? 0} всего</p>
        </div>
        <Input className="max-w-64" placeholder="Поиск…" value={filter} onChange={(e) => setFilter(e.target.value)} />
      </div>
      {isLoading ? <LoadingSpinner /> : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => <ChatCard key={c.id} chat={c} onDelete={() => { if (confirm("Удалить беседу навсегда?")) delChat.mutate(c.id); }} />)}
          {filtered.length === 0 && <div className="col-span-3 py-12 text-center text-sm text-muted-foreground">Ничего не найдено</div>}
        </div>
      )}
    </div>
  );
}

function ChatCard({ chat, onDelete }: { chat: AdminChat; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-lg">{chat.isGroup ? "👥" : "💬"}</span>
            <div className="min-w-0">
              <div className="truncate font-medium text-foreground">{chat.name ?? (chat.isGroup ? "Группа" : "Личный диалог")}</div>
              <div className="text-xs text-muted-foreground">{formatTime(chat.createdAt)}</div>
            </div>
          </div>
        </div>
        <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive shrink-0" onClick={onDelete}>Удалить</Button>
      </div>
      <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><UsersIcon size={12} />{chat.participantCount} уч.</span>
        <span className="flex items-center gap-1"><ChatIcon size={12} />{chat.messageCount} сообщ.</span>
      </div>
      <button onClick={() => setExpanded((p) => !p)} className="mt-2 text-xs text-primary hover:underline">
        {expanded ? "Скрыть участников" : "Показать участников"}
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mt-2 space-y-1">
            {chat.participants.map((p) => <div key={p.id} className="text-xs text-muted-foreground truncate">{p.displayName}</div>)}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Shared ───────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: string }) {
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", role === "admin" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground")}>{role === "admin" ? "Администратор" : "Пользователь"}</span>
  );
}

function LoadingSpinner() {
  return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>;
}

function GridIcon() { return <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>; }
function UsersIcon({ size = 16 }: { size?: number }) { return <svg viewBox="0 0 24 24" style={{ width: size, height: size }} fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" /></svg>; }
function ChatIcon({ size = 16 }: { size?: number }) { return <svg viewBox="0 0 24 24" style={{ width: size, height: size }} fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>; }
function ArrowLeftIcon() { return <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" /></svg>; }

// ── Reports Tab ───────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = { pending: "На рассмотрении", resolved: "Решено", dismissed: "Отклонено" };
const REASON_LABELS: Record<string, string> = { spam: "Спам", harassment: "Оскорбления", inappropriate: "Неприемлемый контент", other: "Другое" };

function ReportsTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [filter, setFilter] = useState("");

  const { data: reports, isLoading } = useQuery({
    queryKey: ["admin-reports", filter],
    queryFn: () => api.adminReports(filter || undefined),
  });

  const resolveReport = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => api.adminResolveReport(id, status),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-reports"] }); toast({ title: "Обновлено" }); },
    onError: (e) => toast({ title: "Ошибка", description: e instanceof Error ? e.message : "", variant: "destructive" }),
  });

  const filters = [
    { key: "", label: "Все" },
    { key: "pending", label: "На рассмотрении" },
    { key: "resolved", label: "Решено" },
    { key: "dismissed", label: "Отклонено" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl text-foreground">Жалобы</h1>
          <p className="mt-1 text-sm text-muted-foreground">{reports?.length ?? 0} всего</p>
        </div>
        <div className="flex gap-1 rounded-xl border border-border/70 bg-muted/30 p-0.5">
          {filters.map((f) => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={cn("rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                filter === f.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
              {f.label}
            </button>
          ))}
        </div>
      </div>
      {isLoading ? <LoadingSpinner /> : !reports || reports.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <FlagIconBig />
          <h3 className="mt-4 font-serif text-xl text-foreground">Жалоб нет</h3>
          <p className="mt-1 text-sm text-muted-foreground">{filter ? "Нет жалоб с таким статусом." : "В системе пока нет ни одной жалобы."}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-border/70 bg-muted/40">
              <tr>
                {["Дата", "Сообщение", "Отправитель", "Причина", "Репортёр", "Статус", "Действия"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {reports.map((r) => (
                <tr key={r.id} className="transition-colors hover:bg-muted/30">
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">{formatTime(r.createdAt)}</td>
                  <td className="max-w-64 px-4 py-3">
                    <div className="truncate text-foreground">{r.messageContent}</div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <div className="flex items-center gap-2">
                      <UserAvatar name={r.messageSender.displayName} src={r.messageSender.avatarUrl} size="sm" />
                      <span className="text-foreground">{r.messageSender.displayName}</span>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                    {REASON_LABELS[r.reason] ?? r.reason}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <div className="flex items-center gap-2">
                      <UserAvatar name={r.reporter.displayName} src={r.reporter.avatarUrl} size="sm" />
                      <span className="text-foreground">{r.reporter.displayName}</span>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {r.status === "pending" ? (
                      <div className="flex items-center gap-1.5">
                        <Button size="sm" variant="outline" className="h-7 text-xs text-green-700 border-green-300 hover:bg-green-50"
                          onClick={() => resolveReport.mutate({ id: r.id, status: "resolved" })}>
                          Разрешить
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 text-xs text-muted-foreground"
                          onClick={() => resolveReport.mutate({ id: r.id, status: "dismissed" })}>
                          Отклонить
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">{r.resolvedBy ?? "—"}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls = status === "pending" ? "bg-amber-500/15 text-amber-700" :
    status === "resolved" ? "bg-green-500/15 text-green-700" :
    "bg-muted text-muted-foreground";
  return <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", cls)}>{STATUS_LABELS[status] ?? status}</span>;
}

function FlagIconBig() {
  return (
    <div className="flex size-16 items-center justify-center rounded-full bg-amber-500/10 text-amber-600">
      <svg viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d="M4 21V4h8l2 4h7v10h-9l-2-4H4z" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function FlagIcon() { return <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 21V4h8l2 4h7v10h-9l-2-4H4z" strokeLinejoin="round" /></svg>; }
