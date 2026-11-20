import type React from "react";
import { Link } from "react-router-dom";

import { cn } from "@/lib/utils";

/** Les vues d'une page, en onglets soulignés : chaque onglet est un lien (l'URL dit où l'on est). */
export function Onglets<C extends string>({
  libelle,
  actif,
  onglets,
}: {
  libelle: string;
  actif: C;
  onglets: ReadonlyArray<{ cle: C; vers: string; contenu: React.ReactNode; compteur?: number; alerte?: boolean }>;
}) {
  return (
    <nav aria-label={libelle} className="flex gap-6 overflow-x-auto border-b">
      {onglets.map((o) => (
        <Link
          key={o.cle}
          to={o.vers}
          replace
          aria-current={o.cle === actif ? "page" : undefined}
          className={cn(
            "-mb-px inline-flex shrink-0 items-center gap-2 border-b-2 pb-2.5 pt-1 text-sm transition-colors",
            o.cle === actif
              ? "border-foreground font-medium text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {o.contenu}
          {o.compteur != null && o.compteur > 0 && (
            <span
              className={cn(
                "rounded-full px-1.5 py-px text-[11px] font-semibold tabular-nums",
                o.alerte ? "bg-warning/15 text-warning-foreground" : "bg-muted text-muted-foreground",
              )}
            >
              {o.compteur}
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}
