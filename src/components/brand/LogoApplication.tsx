import logoMicabo from "@/assets/applications/micabo.png";
import logoSophia from "@/assets/applications/sophia.png";
import logoUnswipe from "@/assets/applications/unswipe.png";
import { couleurApplication, nomAffiche } from "./identiteApplications";
import { cn } from "@/lib/utils";

/**
 * L'identité visuelle d'une application : son icône d'App Store et sa
 * couleur dans les graphes. Une application inconnue (créée demain dans
 * l'OS) n'a ni l'une ni l'autre : elle prend une pastille à son initiale et
 * le gris « autre », la page reste lisible sans qu'on touche au code.
 */
const LOGOS: Record<string, string> = {
  sophia: logoSophia,
  micabo: logoMicabo,
  unswipe: logoUnswipe,
};

const TAILLES = {
  xs: "size-4 rounded-[4px]",
  sm: "size-5 rounded-[5px]",
  md: "size-7 rounded-md",
  lg: "size-10 rounded-lg",
} as const;

export function LogoApplication({
  slug,
  taille = "sm",
  className,
  decoratif = false,
}: {
  slug: string;
  taille?: keyof typeof TAILLES;
  className?: string;
  /** Vrai quand le nom est déjà écrit à côté : l'image ne le répète pas aux lecteurs d'écran. */
  decoratif?: boolean;
}) {
  const nom = nomAffiche(slug);
  const src = LOGOS[slug];
  const classe = cn("inline-block shrink-0 object-cover ring-1 ring-black/10 dark:ring-white/25", TAILLES[taille], className);
  if (src) {
    return <img src={src} alt={decoratif ? "" : nom} title={nom} className={classe} draggable={false} />;
  }
  return (
    <span
      role={decoratif ? undefined : "img"}
      aria-label={decoratif ? undefined : nom}
      aria-hidden={decoratif || undefined}
      title={nom}
      className={cn(classe, "inline-flex items-center justify-center text-[10px] font-semibold uppercase text-white")}
      style={{ background: couleurApplication(slug) }}
    >
      {nom.slice(0, 1)}
    </span>
  );
}

/** Logo + nom, pour les légendes et les en-têtes. */
export function EtiquetteApplication({
  slug,
  taille = "sm",
  className,
}: {
  slug: string;
  taille?: keyof typeof TAILLES;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <LogoApplication slug={slug} taille={taille} decoratif />
      <span>{nomAffiche(slug)}</span>
    </span>
  );
}
