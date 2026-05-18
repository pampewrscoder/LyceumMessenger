import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { ChatPreview } from "@/lib/api-client";
import type { AuthUser } from "@/lib/use-auth";
import { UserAvatar } from "@/components/UserAvatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { chatTitle, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useOnlineStatus } from "@/lib/online-status";

interface ChatListProps {
  user: AuthUser;
  selectedChatId: number | null;
  onNewChat: () => void;
}

export function ChatList({ user, selectedChatId, onNewChat }: ChatListProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["chats"],
    queryFn: () => api.listChats(),
    refetchInterval: 30_000,
  });
  const [filter, setFilter] = useState("");

  const chats = useMemo(() => {
    const items = data ?? [];
    if (!filter.trim()) return items;
    const q = filter.toLowerCase();
    return items.filter((c) => {
      const title = chatTitle(c, user.id).toLowerCase();
      return title.includes(q) || (c.lastMessage?.content?.toLowerCase() ?? "").includes(q);
    });
  }, [data, filter, user.id]);

  return (
    <aside className="flex h-full min-h-0 w-full flex-col border-r border-border/70 bg-card/40">
      <div className="space-y-3 border-b border-border/70 px-4 pb-4 pt-5">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-2xl text-foreground">Беседы</h2>
          <Button size="sm" onClick={onNewChat} className="gap-1.5" data-testid="button-new-chat">
            <PlusIcon /> Новая
          </Button>
        </div>
        <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Поиск по беседам…" data-testid="input-filter-chats" />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="space-y-2 p-3">
            {[0, 1, 2, 3].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-muted/50" />)}
          </div>
        ) : chats.length === 0 ? (
          <EmptyChats hasFilter={filter.length > 0} onNewChat={onNewChat} />
        ) : (
          <ul className="divide-y divide-border/60">
            <AnimatePresence initial={false}>
              {chats.map((chat) => (
                <motion.li key={chat.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
                  <ChatRow chat={chat} currentUserId={user.id} selected={selectedChatId === chat.id} />
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>
    </aside>
  );
}

function ChatRow({ chat, currentUserId, selected }: { chat: ChatPreview; currentUserId: string; selected: boolean }) {
  const { onlineUserIds } = useOnlineStatus();
  const title = chatTitle(chat, currentUserId);
  const last = chat.lastMessage;
  const lastText = last
    ? last.fileUrl && !last.content ? (last.fileName ? `Файл: ${last.fileName}` : "Вложение") : last.content
    : "Беседа создана. Скажите первое слово.";
  const prefix = last
    ? last.sender.id === currentUserId
      ? "Вы: "
      : chat.isGroup ? `${last.sender.displayName.split(" ")[0]}: ` : ""
    : "";
  const other = chat.isGroup ? null : chat.participants.find((p) => p.user.id !== currentUserId)?.user;

  return (
    <Link
      href={`/chat/${chat.id}`}
      className={cn(
        "flex items-start gap-3 px-4 py-3 transition-colors",
        selected ? "bg-primary/8 border-l-2 border-l-primary" : "border-l-2 border-l-transparent hover:bg-muted/40",
      )}
      data-testid={`chat-row-${chat.id}`}
    >
      {chat.isGroup ? (
        <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-secondary/15 font-serif font-semibold text-secondary-foreground/90 ring-1 ring-border/60">#</div>
      ) : (
        <div className="relative">
          <UserAvatar name={other?.displayName ?? title} src={other?.avatarUrl} size="lg" />
          {other && onlineUserIds.has(other.id) && <span className="absolute bottom-0 right-0 size-3 rounded-full border-2 border-card bg-green-500" />}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="truncate text-sm font-semibold text-foreground">{title}</div>
          {last && <div className="shrink-0 text-[11px] text-muted-foreground">{formatTime(last.createdAt)}</div>}
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <div className={cn("truncate text-sm", chat.unreadCount > 0 ? "font-medium text-foreground" : "text-muted-foreground")}>
            <span className="text-muted-foreground">{prefix}</span>{lastText}
          </div>
          {chat.unreadCount > 0 && (
            <span className="ml-2 inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground" data-testid={`badge-unread-${chat.id}`}>
              {chat.unreadCount}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

function EmptyChats({ hasFilter, onNewChat }: { hasFilter: boolean; onNewChat: () => void }) {
  if (hasFilter) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-8 text-center">
        <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <SearchIcon />
        </div>
        <h3 className="font-serif text-lg text-foreground">Совпадений нет</h3>
        <p className="mt-1 text-sm text-muted-foreground">Попробуйте другое слово или создайте новую беседу.</p>
      </div>
    );
  }
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex h-full flex-col items-center justify-center px-8 text-center">
      <div className="mb-4 flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary"><ChatIcon /></div>
      <h3 className="font-serif text-xl text-foreground">Здесь пока тихо</h3>
      <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">Начните первую беседу — пригласите однокурсника или наставника.</p>
      <Button onClick={onNewChat} className="mt-5" data-testid="button-empty-new-chat">Создать беседу</Button>
    </motion.div>
  );
}

function PlusIcon() {
  return <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3v10M3 8h10" strokeLinecap="round" /></svg>;
}
function SearchIcon() {
  return <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="6" /><path d="M20 20l-4-4" strokeLinecap="round" /></svg>;
}
function ChatIcon() {
  return <svg viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M4 6.5C4 5.12 5.12 4 6.5 4h11C18.88 4 20 5.12 20 6.5v8c0 1.38-1.12 2.5-2.5 2.5H10l-4 4v-4h-.5C4.12 17 3 15.88 3 14.5v-8C3 6.32 3.04 6.16 4 6.5z" /></svg>;
}
