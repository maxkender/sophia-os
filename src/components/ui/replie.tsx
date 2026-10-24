import type React from "react";
import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Un bloc replié, comme les réglages avancés de la page Allocation : le titre
 * ouvre le contenu. Un `<details>` natif, donc clavier et lecteur d'écran
 * sans rien de plus.
 */
export function Replie({
  titre,
  aide,
  ouvert,
  className,
  children,
}: {
  titre: React.ReactNode;
  /** Une ligne d'explication en tête du contenu déplié. */
  aide?: React.ReactNode;
  ouvert?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <details className={cn("group rounded-lg border bg-card", className)} open={ouvert}>
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium select-none [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" aria-hidden />
        {titre}
      </summary>
      <div className="space-y-3 border-t px-4 py-3">
        {aide ? <p className="text-xs text-muted-foreground">{aide}</p> : null}
        {children}
      </div>
    </details>
  );
}
