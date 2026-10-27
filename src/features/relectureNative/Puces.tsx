import type React from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

import { CLASSES_TON, type Ton } from "./apparence";

/** Une pastille : icône et libellé, dans la teinte de ce qu'elle désigne. */
export function Puce({
  icone: Icone,
  ton = "neutre",
  children,
  className,
}: {
  icone?: LucideIcon;
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
      {Icone && <Icone className="size-3.5 shrink-0" aria-hidden />}
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
        className={cn("block h-full rounded-full", ton === "vert" ? "bg-success" : ton === "bleu" ? "bg-info" : "bg-primary")}
        style={{ width: `${pct}%` }}
      />
    </span>
  );
}
