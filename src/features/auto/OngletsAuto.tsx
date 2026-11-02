/**
 * Prompt 22, parties 5 à 9 : la barre d'onglets des pages de « Recruitment
 * Automation » (l'onglet actif vient de `useOnglet`).
 */
import type * as React from "react";

import { cn } from "@/lib/utils";

/** La barre d'onglets (motif ARIA : flèches, Début, Fin), avec un compteur facultatif par onglet. */
export function OngletsAuto<O extends string>({
  id,
  libelle,
  onglets,
  actif,
  onChange,
  compteurs = {},
  alerte = [],
}: {
  id: string;
  libelle: string;
  onglets: readonly { cle: O; titre: React.ReactNode }[];
  actif: O;
  onChange: (o: O) => void;
  compteurs?: Partial<Record<O, number | undefined>>;
  /** Les onglets dont le compteur ressort quand il n'est pas nul (ce qui attend une personne). */
  alerte?: readonly O[];
}) {
  const cles = onglets.map((o) => o.cle);
  return (
    <div
      role="tablist"
      aria-label={libelle}
      className="inline-flex w-fit max-w-full flex-wrap gap-1 rounded-lg border bg-muted/40 p-1"
      onKeyDown={(ev) => {
        const i = cles.indexOf(actif);
        const n = cles.length;
        const vers =
          ev.key === "ArrowRight" ? (i + 1) % n
          : ev.key === "ArrowLeft" ? (i - 1 + n) % n
          : ev.key === "Home" ? 0
          : ev.key === "End" ? n - 1
          : -1;
        if (vers < 0) return;
        ev.preventDefault();
        onChange(cles[vers]!);
        document.getElementById(`onglet-${id}-${cles[vers]}`)?.focus();
      }}
    >
      {onglets.map((o) => {
        const n = compteurs[o.cle];
        return (
          <button
            key={o.cle}
            id={`onglet-${id}-${o.cle}`}
            type="button"
            role="tab"
            aria-selected={o.cle === actif}
            aria-controls={`panneau-${id}`}
            tabIndex={o.cle === actif ? 0 : -1}
            onClick={() => onChange(o.cle)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm transition-colors",
              o.cle === actif ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.titre}
            {n !== undefined && (
              <span
                data-compteur={o.cle}
                className={cn(
                  "rounded-full px-1.5 text-[11px] tabular-nums",
                  alerte.includes(o.cle) && n > 0 ? "bg-warning/15 text-warning-foreground" : "bg-muted text-muted-foreground",
                )}
              >
                {n}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Le panneau de l'onglet actif. */
export function PanneauOnglet({ id, actif, children }: { id: string; actif: string; children: React.ReactNode }) {
  return (
    <div id={`panneau-${id}`} role="tabpanel" aria-labelledby={`onglet-${id}-${actif}`} className="space-y-6">
      {children}
    </div>
  );
}
