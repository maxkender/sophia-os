/** 23/11 : les couleurs des apps et les pastilles de statut de la Bible. */
import { cn } from "@/lib/utils";

import type { Section } from "./moodboard";

const FIXES: Record<string, string> = { idees: "#2dd4bf", sans: "#d6d3d1" };

/**
 * La couleur d'une section : celle de son application (`--app-<slug>` dans `index.css`, la même que dans les
 * graphes), ou le gris « autre » pour une application qui n'a pas encore la sienne.
 */
export const couleurSection = (section: Section | "sans"): string => FIXES[section] ?? `var(--app-${section}, var(--app-autre))`;

export const PASTILLE = "inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-px text-[10px] font-medium ring-1";
export const PASTILLE_A_CREER = cn(PASTILLE, "bg-amber-50 text-amber-700 ring-amber-200");
export const PASTILLE_PODZ = cn(PASTILLE, "bg-teal-50 text-teal-700 ring-teal-200");
