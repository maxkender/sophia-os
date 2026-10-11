import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

/** Deux initiales (« Margherita Pilia » → « MP »), « ? » sans nom. */
function initiales(nom: string): string {
  const parts = nom.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

/** Photo d'un membre de l'équipe (`profiles.photo_url`), à défaut ses initiales. */
export function AvatarProfil({
  nom,
  photoUrl,
  className,
}: {
  nom: string;
  photoUrl?: string | null;
  className?: string;
}) {
  return (
    <Avatar className={cn("size-7", className)}>
      {photoUrl ? <AvatarImage src={photoUrl} alt="" /> : null}
      <AvatarFallback className="text-[10px]">{initiales(nom)}</AvatarFallback>
    </Avatar>
  );
}
