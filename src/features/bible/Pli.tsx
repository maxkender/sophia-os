/**
 * 23/11 : le chevron qui replie une app ou un label, et la barre « Replier les apps / les labels · Tout déplier ».
 */
import { ChevronDown, ChevronsDownUp, ChevronsUpDown } from "lucide-react";

import { cn } from "@/lib/utils";

import type { Pliage } from "./pliage";

export function BoutonPli({ plie, onClick, nom, className }: { plie: boolean; onClick: () => void; nom: string; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={!plie}
      aria-label={plie ? `Déplier ${nom}` : `Replier ${nom}`}
      title={plie ? "Déplier" : "Replier"}
      className={cn("inline-flex size-6 shrink-0 items-center justify-center rounded-full text-stone-400 transition hover:bg-stone-200 hover:text-stone-800 dark:hover:bg-stone-800 dark:hover:text-white", className)}
    >
      <ChevronDown className={cn("size-4 transition-transform", plie && "-rotate-90")} aria-hidden />
    </button>
  );
}

const BOUTON = "inline-flex h-9 items-center gap-1.5 rounded-full border border-stone-200 bg-white px-3 text-sm text-stone-600 transition disabled:pointer-events-none disabled:opacity-40 hover:border-stone-400 hover:text-stone-900 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300";

/** Replier toutes les apps, tous les labels, ou tout déplier (ce qui est à l'écran). */
export function BarrePliage({ pliage, apps, labels }: { pliage: Pliage; apps: string[]; labels: string[] }) {
  if (apps.length === 0 && labels.length === 0) return null;
  const toutDeplie = [...apps, ...labels].every((c) => !pliage.estPlie(c));
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="barre-pliage">
      <button type="button" className={BOUTON} onClick={() => pliage.plier(apps)} disabled={apps.length === 0}>
        <ChevronsDownUp className="size-3.5" aria-hidden /> Replier les apps
      </button>
      <button type="button" className={BOUTON} onClick={() => { pliage.deplier(apps); pliage.plier(labels); }} disabled={labels.length === 0}>
        <ChevronsDownUp className="size-3.5" aria-hidden /> Replier les labels
      </button>
      <button type="button" className={BOUTON} onClick={() => pliage.deplier([...apps, ...labels])} disabled={toutDeplie}>
        <ChevronsUpDown className="size-3.5" aria-hidden /> Tout déplier
      </button>
    </div>
  );
}
