import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/use-auth";
import { useUpload } from "@/lib/use-upload";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/UserAvatar";
import { useToast } from "@/hooks/use-toast";

export default function ProfilePage() {
  const { user, refetch } = useAuth();
  const { toast } = useToast();

  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [avatarPath, setAvatarPath] = useState<string | null>(user?.avatarUrl ?? null);

  useEffect(() => {
    if (user) { setDisplayName(user.displayName); setAvatarPath(user.avatarUrl); }
  }, [user]);

  const { uploadFile, isUploading } = useUpload({
    onSuccess: (res) => setAvatarPath(res.objectPath),
    onError: (e) => toast({ title: "Не удалось загрузить", description: e.message, variant: "destructive" }),
  });

  const updateProfile = useMutation({
    mutationFn: (data: { displayName?: string; avatarUrl?: string | null }) =>
      api.updateProfile(data),
    onSuccess: () => {
      refetch();
      toast({ title: "Сохранено", description: "Ваш профиль обновлён." });
    },
    onError: (err) => toast({
      title: "Не удалось сохранить",
      description: err instanceof Error ? err.message : "Попробуйте позже.",
      variant: "destructive",
    }),
  });

  function handleSave() {
    const trimmed = displayName.trim();
    if (!trimmed) { toast({ title: "Укажите имя", variant: "destructive" }); return; }
    updateProfile.mutate({ displayName: trimmed, avatarUrl: avatarPath });
  }

  if (!user) return null;
  const displayed = displayName.trim() || user.displayName;

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
        className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
        <div className="relative h-32" style={{ background: "linear-gradient(120deg, hsl(355 45% 35% / 0.85), hsl(120 15% 40% / 0.85))" }} />
        <div className="-mt-12 px-8 pb-8">
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-end gap-4">
              <label className="group relative cursor-pointer shrink-0 rounded-full bg-card p-1.5 shadow-md transition-shadow hover:shadow-lg" style={{ width: 108, height: 108 }}>
                <input type="file" accept="image/*" hidden onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) await uploadFile(f); }} />
                <UserAvatar name={displayed} src={avatarPath} size="xl" />
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                  <CameraIcon />
                </div>
              </label>
              <div className="pb-1">
                <h1 className="font-serif text-3xl text-foreground" data-testid="text-profile-name">{displayed}</h1>
                {user.email && <p className="text-sm text-muted-foreground">{user.email}</p>}
              </div>
            </div>
            <label className="cursor-pointer">
              <input type="file" accept="image/*" hidden onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) await uploadFile(f); }} />
              <span className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted">
                {isUploading ? "Загружаем…" : "Сменить аватар"}
              </span>
            </label>
            </div>
            {avatarPath && (
              <button onClick={() => setAvatarPath(null)} className="mt-1 text-xs text-muted-foreground underline-offset-2 hover:text-destructive hover:underline">
                Удалить аватар
              </button>
            )}

            <div className="mt-10 space-y-6">
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">Отображаемое имя</label>
              <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={60} placeholder={'Например, \u201EАнна Сергеевна\u201D'} data-testid="input-display-name" />
              <p className="mt-1.5 text-xs text-muted-foreground">Так вас будут видеть в списках бесед и подписи к сообщениям.</p>
            </div>
            <div className="flex justify-end gap-2 border-t border-border/60 pt-6">
              <Button onClick={handleSave} disabled={updateProfile.isPending} size="lg" data-testid="button-save-profile">
                {updateProfile.isPending ? "Сохраняем…" : "Сохранить"}
              </Button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-7 text-white" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h3.5l2-3h7l2 3H21a2 2 0 012 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}
