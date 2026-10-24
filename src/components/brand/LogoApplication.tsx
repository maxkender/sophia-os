import { cn } from "@/lib/utils";

/**
 * Icônes des applications, reprises des visuels des pods (pods/…/applis) en
 * 96 px. Une application sans icône ici retombe sur son nom en texte.
 */
const LOGOS: Readonly<Record<string, string>> = {
  sophia: "/applications/sophia.png",
  unswipe: "/applications/unswipe.png",
  micabo: "/applications/micabo.png",
};

const TAILLES = {
  xs: "size-4",
  sm: "size-5",
  md: "size-6",
} as const;

/**
 * Le logo d'une application à la place de son nom. Le nom reste là pour les
 * lecteurs d'écran (alt) et au survol (title).
 */
export function LogoApplication({
  slug,
  nom,
  size = "sm",
  className,
}: {
  slug: string | null | undefined;
  nom: string;
  size?: keyof typeof TAILLES;
  className?: string;
}) {
  const src = slug ? LOGOS[slug] : undefined;
  if (!src) return <span className={cn("text-xs font-medium", className)}>{nom}</span>;
  return (
    <img
      src={src}
      alt={nom}
      title={nom}
      width={24}
      height={24}
      className={cn(TAILLES[size], "inline-block shrink-0 rounded-[24%] object-cover ring-1 ring-black/5", className)}
    />
  );
}
