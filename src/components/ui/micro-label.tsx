import type React from "react";

import { cn } from "@/lib/utils";

/** Petit intitulé en capitales, celui des en-têtes de tableau de la page Allocation. */
export const MICRO_LABEL = "text-[11px] font-medium uppercase tracking-wide text-muted-foreground";

export function MicroLabel({ className, ...props }: React.ComponentProps<"p">) {
  return <p className={cn(MICRO_LABEL, className)} {...props} />;
}
