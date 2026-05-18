import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { avatarUrl, userInitials } from "@/lib/format";
import { cn } from "@/lib/utils";

interface UserAvatarProps {
  name: string;
  src?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

const SIZE_CLASS: Record<NonNullable<UserAvatarProps["size"]>, string> = {
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-12 text-base",
  xl: "size-24 text-2xl",
};

const AVATAR_COLOR = "bg-amber-800";

export function UserAvatar({ name, src, size = "md", className }: UserAvatarProps) {
  return (
    <Avatar className={cn(SIZE_CLASS[size], "ring-1 ring-border/60", className)}>
      <AvatarImage src={avatarUrl(src) ?? undefined} alt={name} className="object-cover" />
      <AvatarFallback className={cn(AVATAR_COLOR, "font-serif font-semibold text-white")}>
        {userInitials(name)}
      </AvatarFallback>
    </Avatar>
  );
}
