import { useQuery } from "@tanstack/react-query";
import * as React from "react";

import { lireTextes } from "./api";
import { dictionnaireAnglais, droiteAGauche } from "./questions";

/**
 * 20/11 (Max) : le questionnaire et son pop-up dans la langue du posteur (langue de son compte, l'anglais par
 * défaut). Les textes anglais sont la source ; la traduction vient de la fonction questionnaire (gardée, puis
 * réutilisée). Tant qu'elle n'est pas là, ou si elle échoue : l'anglais.
 */
export type Traduire = (cle: string, vars?: Record<string, string | number>) => string;

const EN = dictionnaireAnglais();

export function remplir(texte: string, vars?: Record<string, string | number>): string {
  return vars ? texte.replace(/\{([a-z_]+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : texte;
}

export function useTextes(slug: string, langue: string | null | undefined) {
  const l = (langue ?? "en").trim() || "en";
  const anglais = l.toLowerCase().startsWith("en");
  const q = useQuery({
    queryKey: ["questionnaire", slug, "textes", l],
    queryFn: () => lireTextes(slug, l),
    enabled: !anglais,
    staleTime: Infinity,
    retry: 1,
  });
  const dict = q.data?.textes;
  const t: Traduire = React.useCallback((cle, vars) => remplir(dict?.[cle] ?? EN[cle] ?? cle, vars), [dict]);
  return {
    t,
    langue: anglais ? "en" : (q.data?.langue ?? l),
    dir: droiteAGauche(l) ? ("rtl" as const) : ("ltr" as const),
    chargement: !anglais && q.isLoading,
  };
}

/** « 30 November » dans la langue donnée (repli : anglais). */
export function dateLundi(iso: string, langue: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  try {
    return new Intl.DateTimeFormat(langue.toLowerCase().startsWith("en") ? "en-GB" : langue, { day: "numeric", month: "long", timeZone: "UTC" }).format(d);
  } catch {
    return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: "UTC" }).format(d);
  }
}
