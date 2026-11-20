/**
 * 21/11 (Max) : une plateforme par posteur (profiles.canal_paie : RUUL ou UPWORK), visible partout.
 */
import { cn } from "@/lib/utils";

import { plateformeDe, useIdsRuul } from "./canal";

/** Le badge de plateforme. */
export function BadgePlateforme({ ruul, className }: { ruul: boolean; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 rounded px-1.5 py-px text-[10px] font-semibold tracking-wide ring-1",
        ruul ? "bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-950/40 dark:text-violet-200" : "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200",
        className,
      )}
      data-testid="badge-plateforme"
    >
      {ruul ? "RUUL" : "UPWORK"}
    </span>
  );
}

/** Le badge d'un posteur, d'après sa plateforme dans l'OS. */
export function BadgePosteur({ posterId, className }: { posterId: string | null | undefined; className?: string }) {
  const ids = useIdsRuul();
  if (!posterId) return null;
  return <BadgePlateforme ruul={plateformeDe(ids, posterId) === "ruul"} className={className} />;
}
