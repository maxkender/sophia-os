/**
 * 23/11 : le chevron qui replie une app ou un label, et le bouton unique « Tout déplier / Tout replier ».
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

/** Un seul bouton : « Tout replier » dès qu'un label à l'écran est ouvert, sinon « Tout déplier ». */
export function BarrePliage({ pliage, apps, labels }: { pliage: Pliage; apps: string[]; labels: string[] }) {
  if (apps.length === 0 && labels.length === 0) return null;
  const unOuvert = labels.some((c) => !pliage.estPlie(c));
  const Icone = unOuvert ? ChevronsDownUp : ChevronsUpDown;
  return (
    <button
      type="button"
      data-testid="barre-pliage"
      onClick={() => (unOuvert ? pliage.toutReplier() : pliage.toutDeplier())}
      className="inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs text-stone-500 transition hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-white"
    >
      <Icone className="size-3.5" aria-hidden /> {unOuvert ? "Tout replier" : "Tout déplier"}
    </button>
  );
}
