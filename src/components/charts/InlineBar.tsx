import { cn } from "@/lib/utils";

/**
 * Barre fine dans une cellule de tableau : la valeur se lit dans la colonne
 * voisine, la barre donne l'ordre de grandeur d'un coup d'œil. Même gabarit
 * que la barre de réserve de la page Allocation (`BarreReserve`).
 */
export function InlineBar({ value, max, className }: { value: number; max: number; className?: string }) {
  const part = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <div className={cn("relative h-2.5 w-full min-w-16 rounded-[3px] bg-muted", className)} aria-hidden>
      <div
        className="h-full rounded-r-[4px] bg-foreground/70"
        // Une valeur non nulle reste visible, même minuscule.
        style={{ width: value > 0 ? `max(3px, ${part * 100}%)` : 0 }}
      />
    </div>
  );
}
