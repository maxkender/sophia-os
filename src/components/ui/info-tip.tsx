import type React from "react";
import { Info } from "lucide-react";

import { Tooltip, TooltipPopup, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * L'explication d'un chiffre ou d'une règle, au survol d'un « i ». Ce qui
 * était un paragraphe sous un titre devient une infobulle : la page se lit
 * d'abord, le détail se demande.
 */
export function InfoTip({ children, label, className }: { children: React.ReactNode; label: string; className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        delay={150}
        aria-label={label}
        className={cn(
          "inline-flex size-4 shrink-0 cursor-help items-center justify-center rounded-full p-0 align-[-2px] text-muted-foreground/70 hover:text-foreground focus-visible:text-foreground",
          className,
        )}
      >
        <Info className="size-3.5" aria-hidden />
      </TooltipTrigger>
      <TooltipPopup side="top" className="max-w-72 p-2 text-left leading-relaxed">
        {children}
      </TooltipPopup>
    </Tooltip>
  );
}
