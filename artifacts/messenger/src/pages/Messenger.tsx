import { useState } from "react";
import { useLocation, useRoute } from "wouter";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/use-auth";
import { ChatList } from "@/components/ChatList";
import { ChatView } from "@/components/ChatView";
import { NewChatDialog } from "@/components/NewChatDialog";

export default function MessengerPage() {
  const { user } = useAuth();
  const [, params] = useRoute<{ id: string }>("/chat/:id");
  const [, setLocation] = useLocation();
  const [newChatOpen, setNewChatOpen] = useState(false);

  if (!user) return null;

  const chatIdNum = params?.id ? Number(params.id) : null;
  const selectedChatId = chatIdNum != null && Number.isFinite(chatIdNum) ? chatIdNum : null;

  return (
    <>
      <div className="grid h-full min-h-0 grid-cols-1 md:grid-cols-[340px_1fr]">
        <div className={`min-h-0 ${selectedChatId != null ? "hidden md:block" : "block"}`}>
          <ChatList user={user} selectedChatId={selectedChatId} onNewChat={() => setNewChatOpen(true)} />
        </div>
        <div className={`min-h-0 ${selectedChatId != null ? "block" : "hidden md:block"}`}>
          {selectedChatId != null ? (
            <ChatView chatId={selectedChatId} currentUserId={user.id} />
          ) : (
            <NoChatSelected />
          )}
        </div>
      </div>
      <NewChatDialog open={newChatOpen} onOpenChange={setNewChatOpen} currentUserId={user.id} onCreated={(id) => setLocation(`/chat/${id}`)} />
    </>
  );
}

function NoChatSelected() {
  return (
    <div className="flex h-full items-center justify-center bg-background/40 px-8">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="max-w-md text-center">
        <div className="mx-auto mb-5 flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary"><BookIcon /></div>
        <h2 className="font-serif text-3xl text-foreground">Выберите беседу</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Слева — личные диалоги и классные группы. Откройте любую или создайте новую беседу.
        </p>
      </motion.div>
    </div>
  );
}

function BookIcon() {
  return <svg viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M4 5a2 2 0 012-2h12a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V5z" strokeLinejoin="round" /><path d="M8 3v18M16 3v18" /></svg>;
}
