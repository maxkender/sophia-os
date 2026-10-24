import type React from "react";

import { cn } from "@/lib/utils";

/**
 * Un choix entre quelques options, au gabarit des onglets de la page
 * Allocation : l'option choisie ressort sur fond blanc. Des boutons à
 * `aria-pressed`, pas des onglets : rien ne change de panneau.
 */
export function Segments<C extends string>({
  libelle,
  options,
  actif,
  onChange,
  disabled,
  className,
}: {
  libelle: string;
  options: ReadonlyArray<{ cle: C; contenu: React.ReactNode }>;
  actif: C | null | undefined;
  onChange: (cle: C) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={libelle}
      className={cn("inline-flex w-fit max-w-full flex-wrap gap-0.5 rounded-lg border bg-muted/40 p-0.5", className)}
    >
      {options.map((o) => (
        <button
          key={o.cle}
          type="button"
          aria-pressed={o.cle === actif}
          disabled={disabled}
          onClick={() => onChange(o.cle)}
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs transition-colors disabled:opacity-60",
            o.cle === actif ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.contenu}
        </button>
      ))}
    </div>
  );
}
