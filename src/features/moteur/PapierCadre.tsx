import * as React from "react";

import cadrePng from "@/assets/cadre-papier.png";
import { cn } from "@/lib/utils";

/** Carré 1:1 fixe + bordure ondulée. Le format ne bouge jamais. */
export function PapierCadre({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("relative aspect-[9/16] overflow-hidden bg-black", className)}>
      <div className="absolute inset-x-0 top-1/2 aspect-square -translate-y-1/2 overflow-hidden">
        {children}
      </div>
      <img
        src={cadrePng}
        alt=""
        className="pointer-events-none absolute inset-0 h-full w-full select-none"
        draggable={false}
      />
    </div>
  );
}
