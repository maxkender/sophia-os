import type React from "react";
import { Star, type LucideIcon } from "lucide-react";

import { LogoApplication } from "@/components/brand/LogoApplication";
import { cn } from "@/lib/utils";

import { CLASSES_TON, type Ton } from "./apparence";

/**
 * Une pastille : icône et libellé, dans la teinte de ce qu'elle désigne. Une
 * pastille d'application prend le logo de l'appli (`logo`, son slug) à la
 * place de l'icône.
 */
export function Puce({
  icone: Icone,
  logo,
  ton = "neutre",
  children,
  className,
}: {
  icone?: LucideIcon;
  logo?: string;
  ton?: Ton;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        CLASSES_TON[ton],
        className,
      )}
    >
      {logo ? (
        <LogoApplication slug={logo} taille="xs" decoratif className="-ml-1" />
      ) : (
        Icone && <Icone className="size-3.5 shrink-0" aria-hidden />
      )}
      <span className="truncate">{children}</span>
    </span>
  );
}

/** Une icône dans une tuile carrée arrondie, en tête de carte ou de bloc. */
export function TuileIcone({ icone: Icone, ton = "neutre", className }: { icone: LucideIcon; ton?: Ton; className?: string }) {
  return (
    <span
      className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg border", CLASSES_TON[ton], className)}
      aria-hidden
    >
      <Icone className="size-4.5" />
    </span>
  );
}

/** Une petite barre d'avancement, pour une cellule de tableau. */
export function MiniBarre({ valeur, total, ton = "vert" }: { valeur: number; total: number; ton?: Ton }) {
  const pct = total > 0 ? Math.min(100, Math.round((valeur / total) * 100)) : 0;
  return (
    <span className="block h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
      <span
        className={cn(
          "block h-full rounded-full",
          ton === "vert" ? "bg-success" : ton === "bleu" ? "bg-info" : ton === "violet" ? "bg-violet-500" : "bg-primary",
        )}
        style={{ width: `${pct}%` }}
      />
    </span>
  );
}

/** Une note de 1 à 5, en étoiles ; recliquer la même étoile retire la note. */
export function Etoiles({ libelle, valeur, onChange }: { libelle: string; valeur: number | null; onChange: (n: number | null) => void }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{libelle}</p>
      <div role="radiogroup" aria-label={libelle} className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={valeur === n}
            aria-label={`${n}/5`}
            onClick={() => onChange(valeur === n ? null : n)}
            className="rounded p-0.5 text-muted-foreground hover:text-amber-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <Star className={cn("size-5", valeur != null && n <= valeur && "fill-amber-400 text-amber-500")} aria-hidden />
          </button>
        ))}
      </div>
    </div>
  );
}
