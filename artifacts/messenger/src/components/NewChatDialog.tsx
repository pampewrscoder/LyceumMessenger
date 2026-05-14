import { useState, useMemo } from "react";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/lib/api-client";
import type { UserProfile } from "@/lib/api-client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/UserAvatar";
import { cn } from "@/lib/utils";

interface NewChatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentUserId: string;
  onCreated: (chatId: number) => void;
}

export function NewChatDialog({ open, onOpenChange, currentUserId, onCreated }: NewChatDialogProps) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<UserProfile[]>([]);
  const [groupName, setGroupName] = useState("");
  const queryClient = useQueryClient();

  const { data: searchData, isLoading: searchLoading } = useQuery({
    queryKey: ["users-search", query],
    queryFn: () => api.searchUsers(query),
    enabled: query.trim().length > 0,
    staleTime: 5_000,
  });

  const results = useMemo(
    () => (searchData ?? []).filter((u) => u.id !== currentUserId),
    [searchData, currentUserId],
  );

  const createChat = useMutation({
    mutationFn: ({ ids, name }: { ids: string[]; name?: string | null }) =>
      api.createChat(ids, name),
    onSuccess: (chat) => {
      queryClient.invalidateQueries({ queryKey: ["chats"] });
      queryClient.invalidateQueries({ queryKey: ["chats-summary"] });
      reset();
      onOpenChange(false);
      onCreated(chat.id);
    },
  });

  function reset() { setQuery(""); setSelected([]); setGroupName(""); }

  function toggle(user: UserProfile) {
    setSelected((prev) =>
      prev.find((u) => u.id === user.id) ? prev.filter((u) => u.id !== user.id) : [...prev, user],
    );
  }

  function handleCreate() {
    if (selected.length === 0) return;
    createChat.mutate({ ids: selected.map((u) => u.id), name: selected.length > 1 ? groupName.trim() || null : null });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">Новая беседа</DialogTitle>
          <DialogDescription>
            Найдите лицеистов и наставников по имени или email. Один — личный диалог, несколько — группа.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Поиск по имени или email…" data-testid="input-search-users" />

          {selected.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <AnimatePresence>
                {selected.map((u) => (
                  <motion.button key={u.id} layout initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ duration: 0.15 }}
                    onClick={() => toggle(u)} className="flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-sm text-primary">
                    <span>{u.displayName}</span><span className="text-xs opacity-70">×</span>
                  </motion.button>
                ))}
              </AnimatePresence>
            </div>
          )}

          <div className="max-h-72 overflow-y-auto rounded-xl border border-border/70 bg-background/60">
            {query.trim().length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">Начните вводить имя, чтобы найти собеседника.</div>
            ) : searchLoading ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">Ищем…</div>
            ) : results.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">Никого не нашли. Попробуйте другое имя.</div>
            ) : (
              <ul className="divide-y divide-border/60">
                {results.map((u) => {
                  const isSel = !!selected.find((s) => s.id === u.id);
                  return (
                    <li key={u.id}>
                      <button onClick={() => toggle(u)} className={cn("flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors", isSel ? "bg-primary/5" : "hover:bg-muted/50")} data-testid={`row-user-${u.id}`}>
                        <UserAvatar name={u.displayName} src={u.avatarUrl} size="md" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-foreground">{u.displayName}</div>
                          {u.email && <div className="truncate text-xs text-muted-foreground">{u.email}</div>}
                        </div>
                        <div className={cn("flex size-5 items-center justify-center rounded-full border", isSel ? "border-primary bg-primary text-primary-foreground" : "border-border")}>
                          {isSel && <svg viewBox="0 0 16 16" className="size-3" fill="none" stroke="currentColor" strokeWidth="3"><path d="M3 8l3.5 3.5L13 4" /></svg>}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {selected.length > 1 && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Название группы</label>
              <Input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder={'Например, \u201E9-А, литература\u201D'} maxLength={100} data-testid="input-group-name" />
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Отмена</Button>
            <Button onClick={handleCreate} disabled={selected.length === 0 || createChat.isPending} data-testid="button-create-chat">
              {createChat.isPending ? "Создаём…" : selected.length > 1 ? "Создать группу" : "Открыть диалог"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
