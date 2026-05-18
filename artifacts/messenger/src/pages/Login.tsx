import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/lib/api-client";
import { useE2EE } from "@/lib/e2ee-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

interface LoginPageProps {
  onAuth: () => void;
}

export default function LoginPage({ onAuth }: LoginPageProps) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const e2ee = useE2EE();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "login") {
        await api.login(email.trim(), password);
      } else {
        if (!displayName.trim()) {
          toast({ title: "Укажите имя", variant: "destructive" });
          setLoading(false);
          return;
        }
        await api.register(email.trim(), password, displayName.trim());
      }
      await e2ee.init(password);
      onAuth();
    } catch (err) {
      toast({
        title: mode === "login" ? "Не удалось войти" : "Не удалось зарегистрироваться",
        description: err instanceof Error ? err.message : "Попробуйте ещё раз",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 60% at 20% 10%, hsl(355 45% 35% / 0.10) 0%, transparent 60%)," +
            "radial-gradient(50% 50% at 90% 90%, hsl(120 15% 40% / 0.10) 0%, transparent 60%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />

      <main className="relative mx-auto flex min-h-screen max-w-6xl items-center px-6 py-12">
        <div className="grid w-full gap-12 md:grid-cols-2 md:items-center">
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="space-y-5"
          >
            <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/70 px-3 py-1 text-xs uppercase tracking-[0.2em] text-muted-foreground backdrop-blur">
              <span className="size-1.5 rounded-full bg-primary" />
              Лицейский мессенджер
            </div>
            <h1 className="font-serif text-5xl leading-tight text-foreground md:text-6xl">
              Тихая учительская
              <br />
              для писем и совещаний.
            </h1>
            <p className="max-w-md text-base leading-relaxed text-muted-foreground">
              Личные переписки, классные группы и обмен материалами — без шума
              и без отвлекающих лент.
            </p>
          </motion.section>

          <motion.section
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.08 }}
          >
            <div className="rounded-3xl border border-border bg-card p-8 shadow-xl">
              <div className="mb-6 flex gap-1 rounded-xl border border-border/70 bg-muted/40 p-1">
                {(["login", "register"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
                      mode === m
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    type="button"
                    data-testid={`tab-${m}`}
                  >
                    {m === "login" ? "Войти" : "Регистрация"}
                  </button>
                ))}
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <AnimatePresence mode="wait">
                  {mode === "register" && (
                    <motion.div
                      key="name"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <label className="mb-1.5 block text-sm font-medium text-foreground">
                        Имя
                      </label>
                      <Input
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="Анна Сергеевна"
                        maxLength={60}
                        required={mode === "register"}
                        data-testid="input-display-name"
                      />
                    </motion.div>
                  )}
                </AnimatePresence>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">
                    Email
                  </label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="anna@liceum.ru"
                    required
                    autoComplete="email"
                    data-testid="input-email"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">
                    Пароль
                  </label>
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={mode === "register" ? "Не менее 6 символов" : "••••••••"}
                    required
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                    data-testid="input-password"
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  size="lg"
                  disabled={loading}
                  data-testid="button-submit"
                >
                  {loading
                    ? mode === "login"
                      ? "Входим…"
                      : "Создаём аккаунт…"
                    : mode === "login"
                      ? "Войти"
                      : "Создать аккаунт"}
                </Button>
              </form>

              <p className="mt-5 text-center text-xs text-muted-foreground">
                {mode === "login" ? (
                  <>
                    Ещё нет аккаунта?{" "}
                    <button
                      className="text-primary underline-offset-2 hover:underline"
                      onClick={() => setMode("register")}
                      type="button"
                    >
                      Зарегистрироваться
                    </button>
                  </>
                ) : (
                  <>
                    Уже есть аккаунт?{" "}
                    <button
                      className="text-primary underline-offset-2 hover:underline"
                      onClick={() => setMode("login")}
                      type="button"
                    >
                      Войти
                    </button>
                  </>
                )}
              </p>
            </div>
          </motion.section>
        </div>
      </main>

      <footer className="relative border-t border-border/60 bg-card/40 py-4 text-center text-xs text-muted-foreground">
        Лицеум — мессенджер для лицеистов и наставников
      </footer>
    </div>
  );
}
