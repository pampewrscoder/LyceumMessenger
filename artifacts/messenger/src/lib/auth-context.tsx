import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { api } from "./api-client";
import type { UserProfile } from "./api-client";

export type AuthUser = UserProfile;

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  logout: () => Promise<void>;
  refetch: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => { if (!r.ok) throw new Error("unauth"); return r.json() as Promise<AuthUser>; })
      .then((data) => { if (!cancelled) { setUser(data); setIsLoading(false); } })
      .catch(() => { if (!cancelled) { setUser(null); setIsLoading(false); } });
    return () => { cancelled = true; };
  }, [tick]);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    setUser(null);
  }, []);

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  return (
    <AuthContext.Provider value={{ user, isLoading, isAuthenticated: !!user, logout, refetch }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
