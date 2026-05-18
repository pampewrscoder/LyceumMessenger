import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { Message, ReactionOut } from "@/lib/api-client";
import { useUpload } from "@/lib/use-upload";
import { useE2EE } from "@/lib/e2ee-context";
import { UserAvatar } from "@/components/UserAvatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { chatTitle, chatSubtitle, dayKey, formatDayHeader, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Lightbox } from "@/components/Lightbox";
import { useUnreadNotifier } from "@/lib/use-unread-notifier";
import { useOnlineStatus } from "@/lib/online-status";
import { REPORT_REASONS } from "@/lib/api-client";

const ALLOWED_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "👏", "🔥", "🎉"];

const EMOJI_PICKER_LIST = [
  "😀","😃","😄","😁","😅","😂","🤣","😊","😇","🙂","😉","😌","😍","🥰","😘",
  "😋","😛","😜","🤪","😝","🤗","🤔","🤨","😐","😑","😶","😏","😒","🙄","😬",
  "😴","😷","🤒","🥱","😎","🤓","🧐","😕","😮","😲","😳","🥺","😢","😭","😱",
  "😤","😡","🤬","💀","☠️","👋","✋","👌","✌️","🤞","🤟","🤘","👍","👎","👊",
  "✊","🤛","🤜","👏","🙌","🤝","🙏","💪","✍️","❤️","🧡","💛","💚","💙","💜",
  "🖤","🤍","💔","💕","💞","💗","💖","💘","💝","🐶","🐱","🐼","🦊","🐸","🐵",
  "🦄","🐧","🐤","🐌","🐢","🐍","🦋","🌸","🌺","🌻","🌹","🌷","🍀","🌈","⭐",
  "🔥","💯","🎉","🎊","🎈","🎁","🎀","🕶️","👑","💎","🧸","🎵","🎶","❤️‍🔥",
];

interface ChatViewProps { chatId: number; currentUserId: string; }

interface ReplyTarget { id: number; senderName: string; content: string; }

export function ChatView({ chatId, currentUserId }: ChatViewProps) {
  const qc = useQueryClient();

  const { onlineUserIds } = useOnlineStatus();

  const { data: chat } = useQuery({ queryKey: ["chat", chatId], queryFn: () => api.getChat(chatId), enabled: !!chatId });
  const { data: messages, isLoading: msgsLoading } = useQuery({
    queryKey: ["messages", chatId], queryFn: () => api.listMessages(chatId), enabled: !!chatId, refetchInterval: 30_000,
  });
  const { data: typing } = useQuery({
    queryKey: ["typing", chatId], queryFn: () => api.getTyping(chatId), enabled: !!chatId, refetchInterval: 1500,
  });

  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  const [editingMsg, setEditingMsg] = useState<{ id: number; original: string } | null>(null);
  const [pendingFile, setPendingFile] = useState<{ objectPath: string; name: string; type: string } | null>(null);
  const [showReactionPicker, setShowReactionPicker] = useState<number | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [pendingMessages, setPendingMessages] = useState<Message[]>([]);
  const [reportTarget, setReportTarget] = useState<{ id: number; chatId: number } | null>(null);
  const [reportReason, setReportReason] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastCountRef = useRef(0);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const e2ee = useE2EE();
  const { uploadFile, isUploading } = useUpload({ onSuccess: (r) => setPendingFile({ objectPath: r.objectPath, name: r.fileName, type: r.contentType }) });

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["messages", chatId] });
    qc.invalidateQueries({ queryKey: ["chats"] });
    qc.invalidateQueries({ queryKey: ["chats-summary"] });
  }, [qc, chatId]);

  const [decrypted, setDecrypted] = useState<Map<number, string>>(new Map());

  useEffect(() => {
    if (!e2ee.isReady) return;
    for (const msg of messages ?? []) {
      if (msg.encryptedContent && !decrypted.has(msg.id)) {
        e2ee.decryptMessageContent(msg).then((plaintext) => {
          setDecrypted((prev) => new Map(prev).set(msg.id, plaintext));
        }).catch(() => {
          setDecrypted((prev) => new Map(prev).set(msg.id, "🔒 Ошибка расшифровки"));
        });
      }
    }
  }, [messages, e2ee.isReady]);

  const sendMsg = useMutation({
    mutationFn: async (d: { content: string; replyToId?: number | null }) => {
      const participants = chat?.participants ?? [];
      const allIds = participants.map((p) => p.user.id);

      if (d.content && e2ee.isReady && allIds.length >= 2) {
        const enc = await e2ee.encryptContent(d.content, allIds);
        return api.sendMessage(chatId, {
          content: "",
          encryptedContent: enc.encryptedContent,
          contentIv: enc.contentIv,
          encryptedKeys: JSON.stringify(enc.encryptedKeys),
          fileUrl: pendingFile?.objectPath ?? null,
          fileName: pendingFile?.name ?? null,
          fileType: pendingFile?.type ?? null,
          replyToId: d.replyToId ?? null,
        });
      }
      return api.sendMessage(chatId, {
        content: d.content,
        fileUrl: pendingFile?.objectPath ?? null,
        fileName: pendingFile?.name ?? null,
        fileType: pendingFile?.type ?? null,
        replyToId: d.replyToId ?? null,
      });
    },
    onMutate: (d) => {
      const tempId = -Date.now();
      const opt: Message = {
        id: tempId, chatId, content: d.content,
        encryptedContent: null, contentIv: null, myEncryptedKey: null,
        createdAt: new Date().toISOString(),
        sender: { id: currentUserId, displayName: "Вы", email: "", avatarUrl: null, role: "user", isBanned: false, lastSeen: null },
        fileUrl: pendingFile?.objectPath ?? null, fileName: pendingFile?.name ?? null, fileType: pendingFile?.type ?? null,
        replyTo: d.replyToId ? { id: d.replyToId, content: replyTo?.content ?? "", senderDisplayName: replyTo?.senderName ?? "", fileName: null } : null,
        isDeleted: false, isEdited: false, editedAt: null, reactions: [],
      };
      setPendingMessages((prev) => [...prev, opt]);
    },
    onSuccess: () => { setDraft(""); setPendingFile(null); setReplyTo(null); setPendingMessages([]); invalidate(); },
    onError: () => { setPendingMessages([]); },
  });
  const editMsg = useMutation({
    mutationFn: ({ id, content }: { id: number; content: string }) => api.editMessage(chatId, id, content),
    onSuccess: () => { setEditingMsg(null); setDraft(""); qc.invalidateQueries({ queryKey: ["messages", chatId] }); },
  });
  const deleteMsg = useMutation({
    mutationFn: (id: number) => api.deleteMessage(chatId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["messages", chatId] }),
  });
  const reactMsg = useMutation({
    mutationFn: ({ id, emoji }: { id: number; emoji: string }) => api.reactMessage(chatId, id, emoji),
    onSuccess: () => { setShowReactionPicker(null); qc.invalidateQueries({ queryKey: ["messages", chatId] }); },
  });
  const reportMsg = useMutation({
    mutationFn: ({ id, reason, desc }: { id: number; reason: string; desc?: string }) =>
      api.reportMessage(chatId, id, reason, desc),
    onSuccess: () => { setReportTarget(null); setReportReason(""); toast({ title: "Жалоба отправлена", description: "Администратор рассмотрит её." }); },
    onError: (e) => toast({ title: "Ошибка", description: e instanceof Error ? e.message : "", variant: "destructive" }),
  });

  const allMessages = useMemo(() => {
    const server = messages ?? [];
    const pending = pendingMessages.filter(
      (p) => !server.some((s) => s.id === p.id || (s.content === p.content && s.sender.id === p.sender.id && Math.abs(new Date(s.createdAt).getTime() - new Date(p.createdAt).getTime()) < 3000)),
    );
    return [...server, ...pending].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [messages, pendingMessages]);

  const titleForNotifier = chat ? chatTitle(chat, currentUserId) : "";
  useUnreadNotifier(allMessages.length, titleForNotifier || "загрузка…", chatId);

  useEffect(() => { setDraft(""); setPendingFile(null); setReplyTo(null); setEditingMsg(null); setPendingMessages([]); }, [chatId]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (allMessages.length !== lastCountRef.current) {
      const near = el.scrollHeight - el.scrollTop - el.clientHeight < 200;
      if (lastCountRef.current === 0 || near) requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
      lastCountRef.current = allMessages.length;
    }
  }, [allMessages, chatId]);

  useEffect(() => { lastCountRef.current = 0; }, [chatId]);

  const grouped = useMemo(() => {
    const groups: { day: string; firstIso: string; items: Message[] }[] = [];
    for (const m of allMessages) {
      const k = dayKey(m.createdAt);
      const last = groups[groups.length - 1];
      if (!last || last.day !== k) groups.push({ day: k, firstIso: m.createdAt, items: [m] });
      else last.items.push(m);
    }
    return groups;
  }, [allMessages]);

  function handleTyping() {
    api.setTyping(chatId);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
  }

  function startEdit(msg: Message) {
    setEditingMsg({ id: msg.id, original: msg.content });
    setDraft(msg.content);
    setReplyTo(null);
  }

  function cancelEdit() { setEditingMsg(null); setDraft(""); }

  function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    if (editingMsg) {
      if (!draft.trim()) return;
      editMsg.mutate({ id: editingMsg.id, content: draft.trim() });
      return;
    }
    const content = draft.trim();
    if (!content && !pendingFile) return;
    sendMsg.mutate({ content, replyToId: replyTo?.id ?? null });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
    if (e.key === "Escape" && editingMsg) { cancelEdit(); }
  }

  async function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; e.target.value = "";
    if (f) await uploadFile(f);
  }

  if (!chat) return <div className="flex h-full items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>;

  const title = chatTitle(chat, currentUserId);
  const subtitle = chatSubtitle(chat);
  const otherForAvatar = chat.isGroup ? null : chat.participants.find((p) => p.user.id !== currentUserId)?.user;
  const typingNames = typing?.displayNames ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col bg-background" onClick={() => setShowReactionPicker(null)}>
      {/* Header */}
      <header className="flex shrink-0 items-center gap-3 border-b border-border/70 bg-card/40 px-6 py-4">
        {chat.isGroup
          ? <div className="flex size-11 items-center justify-center rounded-full bg-secondary/15 font-serif text-lg font-semibold text-secondary-foreground/90 ring-1 ring-border/60">#</div>
          : <div className="relative"><UserAvatar name={otherForAvatar?.displayName ?? title} src={otherForAvatar?.avatarUrl} size="lg" />{otherForAvatar && onlineUserIds.has(otherForAvatar.id) && <span className="absolute bottom-0 right-0 size-3 rounded-full border-2 border-card bg-green-500" />}</div>}
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-serif text-xl text-foreground">{title}</h1>
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        </div>
        {chat.isGroup && (
          <div className="hidden -space-x-2 sm:flex">
            {chat.participants.slice(0, 5).map((p) => (
              <div key={p.user.id} className="relative">
                <UserAvatar name={p.user.displayName} src={p.user.avatarUrl} size="sm" className="ring-2 ring-card" />
                {onlineUserIds.has(p.user.id) && <span className="absolute bottom-0 right-0 size-2 rounded-full border border-card bg-green-500" />}
              </div>
            ))}
            {chat.participants.length > 5 && <div className="flex size-8 items-center justify-center rounded-full bg-muted text-[11px] font-medium text-muted-foreground ring-2 ring-card">+{chat.participants.length - 5}</div>}
          </div>
        )}
      </header>

      {/* Messages */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-8">
        {msgsLoading && pendingMessages.length === 0
          ? <div className="flex h-full items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>
          : allMessages.length === 0
            ? <EmptyMessages />
            : <div className="mx-auto max-w-3xl space-y-6">
              {grouped.map((group) => (
                <div key={group.day} className="space-y-2">
                  <div className="sticky top-0 z-[1] flex justify-center">
                    <div className="rounded-full bg-card/80 px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground shadow-sm backdrop-blur">{formatDayHeader(group.firstIso)}</div>
                  </div>
                  <AnimatePresence initial={false}>
                    {group.items.map((m, i) => {
                      const prev = group.items[i - 1];
                      const stacked = !!prev && prev.sender.id === m.sender.id && !m.replyTo && new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < 4 * 60 * 1000;
                      const displayContent = m.encryptedContent ? (decrypted.get(m.id) ?? "🔒 Расшифровываем…") : m.content;
                      return (
                        <MessageBubble key={m.id} msg={m} displayContent={displayContent} isMe={m.sender.id === currentUserId} stacked={stacked} showSender={chat.isGroup}
                          showReactionPicker={showReactionPicker === m.id}
                          onPickerToggle={(e) => { e.stopPropagation(); setShowReactionPicker((p) => p === m.id ? null : m.id); }}
                          onReact={(emoji) => reactMsg.mutate({ id: m.id, emoji })}
                          onReply={() => { setReplyTo({ id: m.id, senderName: m.sender.displayName, content: displayContent }); setEditingMsg(null); }}
                          onEdit={() => startEdit(m)}
                          onDelete={() => { if (confirm("Удалить это сообщение?")) deleteMsg.mutate(m.id); }}
                          onReport={() => setReportTarget({ id: m.id, chatId })}
                          canEdit={m.sender.id === currentUserId && !m.isDeleted}
                          canDelete={m.sender.id === currentUserId && !m.isDeleted}
                          onLightboxOpen={(src) => setLightboxSrc(src)}
                        />
                      );
                    })}
                  </AnimatePresence>
                </div>
              ))}
              {/* Typing indicator */}
              <AnimatePresence>
                {typingNames.length > 0 && (
                  <motion.div key="typing" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-center gap-2 pl-12 text-sm text-muted-foreground">
                    <TypingDots />
                    <span>{typingNames.length === 1 ? `${typingNames[0]} печатает…` : `${typingNames.join(", ")} печатают…`}</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>}
      </div>

      {/* Compose */}
      <form onSubmit={handleSubmit} className="shrink-0 border-t border-border/70 bg-card/40 px-4 py-3 md:px-8">
        <div className="mx-auto max-w-3xl">
          {/* Edit banner */}
          <AnimatePresence>
            {editingMsg && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mb-2 flex items-center justify-between gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
                <div className="flex items-center gap-2 text-primary"><PencilIcon /><span>Редактирование сообщения</span></div>
                <button type="button" onClick={cancelEdit} className="text-xs text-muted-foreground hover:text-foreground">Отмена (Esc)</button>
              </motion.div>
            )}
          </AnimatePresence>
          {/* Reply banner */}
          <AnimatePresence>
            {replyTo && !editingMsg && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mb-2 flex items-start justify-between gap-2 rounded-xl border border-border/70 bg-background/70 px-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-primary">{replyTo.senderName}</div>
                  <div className="truncate text-muted-foreground">{replyTo.content || "Вложение"}</div>
                </div>
                <button type="button" onClick={() => setReplyTo(null)} className="text-xs text-muted-foreground hover:text-destructive">×</button>
              </motion.div>
            )}
          </AnimatePresence>
          {/* File preview */}
          {pendingFile && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              className="mb-2 flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-background/70 px-3 py-2 text-sm">
              {pendingFile.type.startsWith("image/")
                ? <img src={api.fileUrl(pendingFile.objectPath)} className="h-16 w-16 rounded-lg object-cover" alt={pendingFile.name} />
                : <div className="flex items-center gap-2"><FileIcon /><span className="truncate text-foreground">{pendingFile.name}</span></div>}
              <button type="button" onClick={() => setPendingFile(null)} className="text-xs text-muted-foreground hover:text-destructive">удалить</button>
            </motion.div>
          )}
          <div className="flex items-end gap-2 rounded-2xl border border-border bg-background px-3 py-2 shadow-sm focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/15 transition-colors">
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isUploading}
              className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50">
              {isUploading ? <span className="size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" /> : <PaperclipIcon />}
            </button>
            <input ref={fileInputRef} type="file" hidden onChange={handleFilePick} />
            <Popover>
              <PopoverTrigger asChild>
                <button type="button" className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                  😊
                </button>
              </PopoverTrigger>
              <PopoverContent side="top" align="start" className="w-[280px] p-2">
                <div className="grid grid-cols-8 gap-0.5">
                  {EMOJI_PICKER_LIST.map((emoji) => (
                    <button key={emoji} type="button" onClick={() => setDraft((d) => d + emoji)}
                      className="flex size-8 items-center justify-center rounded-md text-lg transition-colors hover:bg-muted">
                      {emoji}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
            <Textarea value={draft} onChange={(e) => { setDraft(e.target.value); handleTyping(); }} onKeyDown={handleKeyDown}
              placeholder={editingMsg ? "Изменённый текст…" : "Напишите сообщение…"} rows={1}
              className="min-h-[40px] max-h-40 resize-none border-0 bg-transparent px-1 py-2 text-sm shadow-none focus-visible:ring-0" />
            <Button type="submit" size="icon" className="size-9 shrink-0 rounded-full"
              disabled={sendMsg.isPending || editMsg.isPending || (!draft.trim() && !pendingFile && !editingMsg)}>
              {editingMsg ? <CheckIcon /> : <SendIcon />}
            </Button>
          </div>
          <div className="mt-1.5 px-1 text-[11px] text-muted-foreground">Enter — отправить, Shift+Enter — новая строка</div>
        </div>
      </form>
      <Lightbox src={lightboxSrc ?? ""} alt="Просмотр изображения" open={!!lightboxSrc} onClose={() => setLightboxSrc(null)} />
      {/* Report dialog */}
      {reportTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setReportTarget(null)}>
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-serif text-xl text-foreground">Пожаловаться</h3>
            <p className="mt-1 text-sm text-muted-foreground">Почему это сообщение нарушает правила?</p>
            <div className="mt-4 space-y-2">
              {REPORT_REASONS.map((r) => (
                <label key={r} className="flex cursor-pointer items-center gap-3 rounded-xl border border-border/60 px-4 py-3 text-sm transition-colors hover:bg-muted/40 has-[:checked]:border-amber-500 has-[:checked]:bg-amber-500/5">
                  <input type="radio" name="reason" value={r} checked={reportReason === r} onChange={() => setReportReason(r)} className="accent-amber-500" />
                  <span className="text-foreground">{r === "spam" ? "Спам" : r === "harassment" ? "Оскорбления" : r === "inappropriate" ? "Неприемлемый контент" : "Другое"}</span>
                </label>
              ))}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setReportTarget(null)}>Отмена</Button>
              <Button variant="default" disabled={!reportReason || reportMsg.isPending} onClick={() => reportTarget && reportMsg.mutate({ id: reportTarget.id, reason: reportReason })}>
                {reportMsg.isPending ? "Отправляем…" : "Отправить"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface BubbleProps {
  msg: Message; displayContent: string; isMe: boolean; stacked: boolean; showSender: boolean;
  showReactionPicker: boolean;
  onPickerToggle: (e: React.MouseEvent) => void;
  onReact: (emoji: string) => void;
  onReply: () => void; onEdit: () => void; onDelete: () => void; onReport: () => void;
  canEdit: boolean; canDelete: boolean;
  onLightboxOpen?: (src: string) => void;
}

function MessageBubble({ msg, displayContent, isMe, stacked, showSender, showReactionPicker, onPickerToggle, onReact, onReply, onEdit, onDelete, onReport, canEdit, canDelete, onLightboxOpen }: BubbleProps) {
  const fileUrl = api.fileUrl(msg.fileUrl);
  const isImage = msg.fileType?.startsWith("image/");
  const [hover, setHover] = useState(false);

  return (
    <motion.div layout="position" initial={{ opacity: 0, y: 6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.18, ease: "easeOut" }}
      className={cn("group flex gap-2", isMe ? "justify-end" : "justify-start", stacked ? "mt-0.5" : "mt-3")}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      {!isMe && <div className="w-9 shrink-0">{!stacked && <UserAvatar name={msg.sender.displayName} src={msg.sender.avatarUrl} size="sm" />}</div>}
      <div className={cn("relative max-w-[75%]", isMe ? "items-end" : "items-start")}>
        {!stacked && showSender && !isMe && (
          <div className="mb-0.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{msg.sender.displayName}</div>
        )}
        {/* Reply preview */}
        {msg.replyTo && !msg.isDeleted && (
          <div className={cn("mb-1 rounded-lg border-l-2 border-primary/60 bg-primary/5 px-3 py-1.5 text-xs", isMe ? "ml-auto" : "")}>
            <div className="font-semibold text-primary">{msg.replyTo.senderDisplayName}</div>
            <div className="truncate text-muted-foreground">{msg.replyTo.content || msg.replyTo.fileName || "Вложение"}</div>
          </div>
        )}
        {/* Bubble */}
        <div className={cn("relative rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm",
          isMe ? "bg-primary text-primary-foreground" : "bg-card text-foreground border border-border/60",
          msg.isDeleted ? "opacity-60 italic" : "",
          stacked ? (isMe ? "rounded-tr-md" : "rounded-tl-md") : (isMe ? "rounded-br-md" : "rounded-bl-md"))}>
          {/* Image preview */}
          {fileUrl && isImage && !msg.isDeleted && (
            <button type="button" onClick={() => onLightboxOpen?.(fileUrl!)} className="mb-2 block w-full cursor-pointer text-left">
              <img src={fileUrl} alt={msg.fileName ?? "изображение"} className="max-h-64 max-w-full rounded-xl object-cover" loading="lazy" />
            </button>
          )}
          {/* File link */}
          {fileUrl && !isImage && !msg.isDeleted && (
            <a href={fileUrl} target="_blank" rel="noreferrer"
              className={cn("mb-2 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors",
                isMe ? "border-primary-foreground/30 bg-primary-foreground/10 text-primary-foreground" : "border-border bg-muted/40 text-foreground")}>
              <FileIcon /><span className="truncate">{msg.fileName ?? "Файл"}</span>
            </a>
          )}
          {displayContent && <div className="whitespace-pre-wrap break-words">{displayContent}</div>}
        </div>
        {/* Metadata */}
        <div className={cn("mt-0.5 flex items-center gap-1.5 px-1", isMe ? "justify-end" : "justify-start")}>
          <span className="text-[10px] text-muted-foreground">{formatTime(msg.createdAt)}</span>
          {msg.isEdited && !msg.isDeleted && <span className="text-[10px] text-muted-foreground italic">изм.</span>}
        </div>
        {/* Reactions */}
        {msg.reactions.length > 0 && !msg.isDeleted && (
          <div className={cn("mt-1 flex flex-wrap gap-1 px-1", isMe ? "justify-end" : "justify-start")}>
            {groupReactions(msg.reactions).map((r) => (
              <button key={r.emoji} onClick={() => onReact(r.emoji)}
                className={cn("flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium transition-colors border",
                  r.reactedByMe ? "bg-primary/15 border-primary/40 text-primary" : "bg-card border-border/60 text-foreground hover:bg-muted")}>
                <span>{r.emoji}</span><span>{r.count}</span>
              </button>
            ))}
          </div>
        )}
        {/* Action buttons */}
        <AnimatePresence>
          {hover && !msg.isDeleted && (
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ duration: 0.1 }}
              className={cn("absolute -top-9 flex items-center gap-1 rounded-xl border border-border bg-card px-2 py-1 shadow-md", isMe ? "right-0" : "left-0")}
              onClick={(e) => e.stopPropagation()}>
              {/* Reaction picker toggle */}
              <div className="relative">
                <button type="button" onClick={onPickerToggle} title="Реакция"
                  className="flex size-7 items-center justify-center rounded-lg text-base hover:bg-muted transition-colors">😊</button>
                <AnimatePresence>
                  {showReactionPicker && (
                    <motion.div initial={{ opacity: 0, y: 4, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 4, scale: 0.9 }}
                      className={cn("absolute -top-12 z-10 flex items-center gap-1 rounded-xl border border-border bg-card px-2 py-1.5 shadow-lg", isMe ? "right-0" : "left-0")}>
                      {ALLOWED_EMOJIS.map((e) => (
                        <button key={e} onClick={() => onReact(e)}
                          className="rounded-lg px-1.5 py-0.5 text-base hover:bg-muted transition-colors">{e}</button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <button type="button" onClick={onReply} title="Ответить" className="flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"><ReplyIcon /></button>
              {canEdit && !msg.encryptedContent && <button type="button" onClick={onEdit} title="Редактировать" className="flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"><PencilIcon /></button>}
              {canDelete && <button type="button" onClick={onDelete} title="Удалить" className="flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-destructive transition-colors"><TrashIcon /></button>}
              <button type="button" onClick={onReport} title="Пожаловаться" className="flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-amber-500 transition-colors"><FlagIcon /></button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function groupReactions(reactions: ReactionOut[]): ReactionOut[] {
  const map = new Map<string, ReactionOut>();
  for (const r of reactions) {
    const existing = map.get(r.emoji);
    if (existing) { existing.count += r.count; existing.reactedByMe = existing.reactedByMe || r.reactedByMe; }
    else map.set(r.emoji, { ...r });
  }
  return [...map.values()];
}

function TypingDots() {
  return (
    <div className="flex items-center gap-0.5">
      {[0, 1, 2].map((i) => (
        <motion.div key={i} className="size-1.5 rounded-full bg-muted-foreground"
          animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }} />
      ))}
    </div>
  );
}

function EmptyMessages() {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex h-full flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 flex size-16 items-center justify-center rounded-full bg-secondary/15 text-secondary-foreground/80"><FeatherIcon /></div>
      <h3 className="font-serif text-xl text-foreground">Чистая страница</h3>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">Это начало вашей беседы. Напишите первое сообщение.</p>
    </motion.div>
  );
}

function PaperclipIcon() { return <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.4 11.05L12.5 19.95a5 5 0 11-7.07-7.07l9.19-9.19a3.5 3.5 0 014.95 4.95l-9.2 9.19a2 2 0 11-2.83-2.83l8.49-8.49" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function SendIcon() { return <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M5 12l14-7-7 14-2-5-5-2z" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function CheckIcon() { return <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function FileIcon() { return <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H7a2 2 0 00-2 2v16a2 2 0 002 2h11a2 2 0 002-2V8l-6-6z" strokeLinejoin="round" /><path d="M14 2v6h6" strokeLinejoin="round" /></svg>; }
function FeatherIcon() { return <svg viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M20.5 3.5a6 6 0 00-8.49 0l-7 7v8h8l7-7a6 6 0 000-8z" strokeLinejoin="round" /><path d="M16 8L2 22M17.5 15H9" strokeLinecap="round" /></svg>; }
function PencilIcon() { return <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" strokeLinecap="round" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>; }
function TrashIcon() { return <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /><path d="M10 11v6M14 11v6" strokeLinecap="round" /></svg>; }
function ReplyIcon() { return <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 17l-5-5 5-5" strokeLinecap="round" strokeLinejoin="round" /><path d="M4 12h11a5 5 0 015 5v1" strokeLinecap="round" /></svg>; }
function FlagIcon() { return <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 21V4h8l2 4h7v10h-9l-2-4H4z" strokeLinejoin="round" /></svg>; }
