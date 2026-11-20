/**
 * 21/11 (Max) : la page Pay montre pour chaque posteur le détail : base + 2e compte + bonus = total. Par défaut, les
 * posteurs dont la paie a un ajustement (2e compte, bonus, retenue, au-dessus du plafond) ; « Tous » pour le reste.
 */
import { useQuery } from "@tanstack/react-query";
import * as React from "react";

import { Input } from "@/components/ui/input";
import { BadgePlateforme } from "@/features/ruul/BadgePlateforme";
import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export interface LigneDetail {
  poster_id: string;
  nom: string;
  plateforme: "ruul" | "upwork";
  comptes: number;
  tarif: number | null;
  base: number;
  deuxieme: number;
  retenue: number;
  bonus: { type: string; montant: number; statut: string }[];
  bonus_total: number;
  total: number;
  au_dessus_plafond: boolean;
}

const NOMS_BONUS: Record<string, string> = {
  questionnaire: "Bonus questionnaire", parrainage: "Parrainage", comment_master: "Comment Master", manuel: "Bonus",
};

const usd = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(2)} $`;

/** « 14 $ + 14 $ (2e compte) + 5 $ (Bonus questionnaire) − 2 $ (retenue) = 31 $ ». */
export function formuleDetail(l: LigneDetail): string {
  const parts = [usd(Number(l.base))];
  if (Number(l.deuxieme) > 0) parts.push(`${usd(Number(l.deuxieme))} (${l.comptes > 2 ? `${l.comptes - 1} comptes en plus` : "2e compte"})`);
  for (const b of l.bonus) parts.push(`${usd(Number(b.montant))} (${NOMS_BONUS[b.type] ?? b.type})`);
  let f = parts.join(" + ");
  if (Number(l.retenue) > 0) f += ` − ${usd(Number(l.retenue))} (retenue)`;
  return `${f} = ${usd(Number(l.total))}`;
}

export const aUnAjustement = (l: LigneDetail) => Number(l.deuxieme) > 0 || Number(l.bonus_total) > 0 || Number(l.retenue) > 0 || l.au_dessus_plafond;

export function DetailPaie() {
  const q = useQuery({
    queryKey: ["paie-detail-semaine"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("paie_detail_semaine", { p_semaine: null });
      if (error) throw new Error(error.message);
      return (data ?? []) as LigneDetail[];
    },
  });
  const [tous, setTous] = React.useState(false);
  const [cherche, setCherche] = React.useState("");
  const lignes = (q.data ?? [])
    .filter((l) => tous || aUnAjustement(l))
    .filter((l) => !cherche.trim() || l.nom.toLowerCase().includes(cherche.trim().toLowerCase()))
    .sort((a, b) => Number(b.au_dessus_plafond) - Number(a.au_dessus_plafond) || Number(b.total) - Number(a.total));
  return (
    <details className="rounded-xl border bg-card p-3 shadow-sm" data-testid="detail-paie">
      <summary className="cursor-pointer text-sm font-semibold">
        Détail de la paie · {(q.data ?? []).filter(aUnAjustement).length} posteur(s) avec un ajustement (2e compte, bonus, retenue)
      </summary>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Input className="h-8 max-w-xs" placeholder="Chercher un posteur" value={cherche} onChange={(e) => setCherche(e.target.value)} />
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" checked={tous} onChange={(e) => setTous(e.target.checked)} /> Tous les posteurs
        </label>
      </div>
      {q.error && <p className="mt-2 text-sm text-destructive">{(q.error as Error).message}</p>}
      <ul className="mt-2 divide-y text-sm">
        {lignes.map((l) => (
          <li key={l.poster_id} className={cn("flex flex-wrap items-baseline justify-between gap-2 py-1.5", l.au_dessus_plafond && "text-destructive")}>
            <span className="flex items-center gap-1.5 font-medium"><BadgePlateforme ruul={l.plateforme === "ruul"} />{l.nom || "—"}</span>
            <span className="tabular-nums text-xs sm:text-sm">
              {formuleDetail(l)}{l.au_dessus_plafond ? " · au-dessus du plafond : à vérifier" : ""}
            </span>
          </li>
        ))}
        {!q.isLoading && !lignes.length && <li className="py-2 text-xs text-muted-foreground">Aucun ajustement cette semaine.</li>}
      </ul>
    </details>
  );
}
