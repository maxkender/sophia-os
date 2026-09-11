import * as React from "react";

import { PAPIER_CANVAS_BG, cssFenetrePapier } from "@/features/moteur/papierCompose";
import { cn } from "@/lib/utils";

/** Canvas 9:16 noir + fenêtre 1:1 832×832 à y=544, coins 56px (marges TikTok). */
export function PapierCadre({
  children,
  className,
  dejaCadre = false,
}: {
  children: React.ReactNode;
  className?: string;
  /** Vidéo déjà composée sur 9:16 : remplir le canvas, ne pas re-fenêtrer. */
  dejaCadre?: boolean;
}) {
  const fenetre = cssFenetrePapier();
  return (
    <div
      className={cn("relative aspect-[9/16] overflow-hidden", className)}
      style={{ backgroundColor: PAPIER_CANVAS_BG }}
    >
      {dejaCadre ? (
        <div className="absolute inset-0 overflow-hidden">{children}</div>
      ) : (
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
      )}
    </div>
  );
}
