import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";

interface OnlineStatusCtx {
  onlineUserIds: Set<string>;
}

const OnlineStatusContext = createContext<OnlineStatusCtx>({ onlineUserIds: new Set() });

interface Props { children: ReactNode; userId: string | undefined; }

export function OnlineStatusProvider({ children, userId }: Props) {
  const qc = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout>>();
  const pingRef = useRef<ReturnType<typeof setInterval>>();
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!userId) return;
    let mounted = true;

    function connect() {
      if (!mounted) return;
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${protocol}//${window.location.host}/api/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        pingRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send("ping");
        }, 30000);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          switch (data.type) {
            case "pong": break;
            case "user_online":
              setOnlineIds((prev) => new Set(prev).add(data.user_id));
              break;
            case "user_offline":
              setOnlineIds((prev) => { const n = new Set(prev); n.delete(data.user_id); return n; });
              break;
            case "online_snapshot":
              setOnlineIds(new Set(data.user_ids));
              break;
            case "new_message":
              qc.invalidateQueries({ queryKey: ["messages", data.chat_id] });
              qc.invalidateQueries({ queryKey: ["chats"] });
              qc.invalidateQueries({ queryKey: ["chats-summary"] });
              break;
            case "message_updated":
            case "message_deleted":
            case "message_reacted":
              qc.invalidateQueries({ queryKey: ["messages", data.chat_id] });
              break;
          }
        } catch { /* ignore */ }
      };

      ws.onclose = () => {
        clearInterval(pingRef.current);
        reconnectRef.current = setTimeout(connect, 3000);
      };

      ws.onerror = () => { ws.close(); };
    }

    connect();

    return () => {
      mounted = false;
      clearTimeout(reconnectRef.current);
      clearInterval(pingRef.current);
      wsRef.current?.close();
    };
  }, [userId, qc]);

  return (
    <OnlineStatusContext.Provider value={{ onlineUserIds: onlineIds }}>
      {children}
    </OnlineStatusContext.Provider>
  );
}

export function useOnlineStatus() {
  return useContext(OnlineStatusContext);
}
