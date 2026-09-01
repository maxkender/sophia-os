import * as React from "react";

import { PAPIER_CANVAS_BG, cssFenetrePapier } from "@/features/moteur/papierCompose";
import { cn } from "@/lib/utils";

/** Canvas 9:16 noir + fenêtre 1:1 1040×1040 à y=440, coins 48px. */
export function PapierCadre({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const fenetre = cssFenetrePapier();
  return (
    <div
      className={cn("relative aspect-[9/16] overflow-hidden", className)}
      style={{ backgroundColor: PAPIER_CANVAS_BG }}
    >
      <div
        className="absolute aspect-square overflow-hidden"
        style={{
          left: fenetre.left,
          top: fenetre.top,
          width: fenetre.width,
          borderRadius: fenetre.borderRadius,
        }}
      >
        {children}
      </div>
    </div>
  );
}
