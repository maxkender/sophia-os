import * as React from "react";
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
  paresseux = false,
  testId,
  className,
  children,
}: {
  titre: React.ReactNode;
  /** Une ligne d'explication en tête du contenu déplié. */
  aide?: React.ReactNode;
  ouvert?: boolean;
  /** Le contenu n'est monté qu'à la première ouverture : pour un bloc qui lit la base. */
  paresseux?: boolean;
  testId?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [dejaOuvert, setDejaOuvert] = React.useState(Boolean(ouvert));
  return (
    <details
      className={cn("group rounded-lg border bg-card", className)}
      open={ouvert}
      data-testid={testId}
      onToggle={
        paresseux
          ? (e) => {
              if (e.currentTarget.open) setDejaOuvert(true);
            }
          : undefined
      }
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium select-none [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" aria-hidden />
        {titre}
      </summary>
      <div className="space-y-3 border-t px-4 py-3">
        {aide ? <p className="text-xs text-muted-foreground">{aide}</p> : null}
        {paresseux && !dejaOuvert ? null : children}
      </div>
    </details>
  );
}
