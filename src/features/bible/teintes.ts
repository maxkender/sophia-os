/** 23/11 : les couleurs des apps et les pastilles de statut de la Bible. */
import { cn } from "@/lib/utils";

import type { Section } from "./moodboard";

export const TEINTE: Record<Section | "sans", string> = {
  atala: "bg-emerald-500", micabo: "bg-violet-400", sophia: "bg-pink-400", idees: "bg-teal-400", sans: "bg-stone-300",
};

export const PASTILLE = "inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-px text-[10px] font-medium ring-1";
export const PASTILLE_A_CREER = cn(PASTILLE, "bg-amber-50 text-amber-700 ring-amber-200");
export const PASTILLE_PODZ = cn(PASTILLE, "bg-teal-50 text-teal-700 ring-teal-200");
