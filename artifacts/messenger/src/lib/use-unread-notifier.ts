import { useEffect, useRef } from "react";

function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(523.25, ctx.currentTime);
    osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.08);
    osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.16);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.35);
  } catch {
    /* audio not supported */
  }
}

export function useUnreadNotifier(messageCount: number, chatTitle: string, chatId: number | null) {
  const prevRef = useRef(0);
  const notifiedRef = useRef(false);

  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    if (!chatId || messageCount === 0) {
      prevRef.current = messageCount;
      notifiedRef.current = false;
      return;
    }
    const prev = prevRef.current;
    prevRef.current = messageCount;
    if (messageCount <= prev || prev === 0) return;
    if (notifiedRef.current) return;
    if (!document.hidden) return;
    notifiedRef.current = true;
    playNotificationSound();
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification("Лицеум", {
        body: `Новое сообщение в «${chatTitle}»`,
        icon: "/favicon.svg",
      });
    }
  }, [messageCount, chatTitle, chatId]);
}
