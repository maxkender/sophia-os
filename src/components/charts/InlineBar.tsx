import { cn } from "@/lib/utils";

/**
 * Barre fine dans une cellule de tableau : la valeur se lit dans la colonne
 * voisine, la barre donne l'ordre de grandeur d'un coup d'œil. Un seuil
 * optionnel se dessine en trait vertical (ex. 7 jours de stock).
 */
export function InlineBar({
  value,
  max,
  threshold,
  tone = "neutre",
  className,
}: {
  value: number;
  max: number;
  threshold?: number;
  tone?: "neutre" | "alerte";
  className?: string;
}) {
  const part = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <div className={cn("relative h-1.5 w-full min-w-16 rounded-full bg-muted", className)} aria-hidden>
      <div
        className={cn(
          "absolute inset-y-0 left-0 rounded-full",
          tone === "alerte" ? "bg-destructive" : "bg-foreground/70",
        )}
        // Une valeur non nulle reste visible, même minuscule.
        style={{ width: value > 0 ? `max(3px, ${part * 100}%)` : 0 }}
      />
      {threshold !== undefined && max > 0 && threshold <= max && (
        <div
          className="absolute -inset-y-1 w-px bg-destructive/70"
          style={{ left: `${(threshold / max) * 100}%` }}
        />
      )}
    </div>
  );
}
