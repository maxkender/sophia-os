import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { invoke } from "@/features/moteur/api";
import { aujourdhuiParis } from "@/features/moteur/cohortes";
import { ajouterJours } from "@/features/onboarding/datesRuul";
import { supabase } from "@/lib/supabase/client";

import { lundiDeLaSemaine } from "./logique";

/**
 * 16/11 (Max) : le samedi de la semaine passée, pas validé (la page avait planté avant « Validate »).
 * Les kills choisis samedi et les propositions restées sans décision, à valider ici : même chemin que
 * Validate (comptes désactivés, retrait Slack, fin de contrat après la paie ; milestone financée →
 * « payer ou rembourser » dans la liste). Rien ne part sans le clic.
 */

export type ChoixRattrapage = "kill" | "kill_np" | "keep" | "";

export interface LigneRattrapage {
  compte_id: string;
  poster_id: string;
  nom: string | null;
  handle: string | null;
  canal_paie: string | null;
  regle: string | null;
  proposition_id: string | null;
  brouillon: string | null;
  brouillon_raison: { code?: string; detail?: string } | null;
  posts_semaine: number;
  posts_total: number;
  stop: boolean;
  paie_statut: string | null;
  paie_montant: number | null;
}

export async function lireRattrapage(lundi: string): Promise<LigneRattrapage[]> {
  const { data, error } = await supabase.rpc("samedi_rattrapage_lire", { p_lundi: lundi });
  if (error) throw error;
  return (data ?? []) as LigneRattrapage[];
}

export async function validerRattrapage(
  lundi: string,
  choix: { compte_id: string; choix: Exclude<ChoixRattrapage, "">; raison: string | null }[],
): Promise<{ kills: number; kills_sans_paie: number; gardes: number; erreurs: string[] }> {
  const { data, error } = await supabase.rpc("samedi_rattrapage_valider", { p_lundi: lundi, p_choix: choix });
  if (error) throw error;
  return data as { kills: number; kills_sans_paie: number; gardes: number; erreurs: string[] };
}

/** Le choix proposé d'office : celui du samedi (brouillon), sinon rien. */
export function choixInitial(l: LigneRattrapage): ChoixRattrapage {
  return l.brouillon === "kill" || l.brouillon === "kill_np" || l.brouillon === "keep" ? l.brouillon : "";
}

const LIBELLE_REGLE: Record<string, string> = {
  absent: "0 post / absent",
  premiere_semaine: "1re semaine",
  anciens: "ancien",
};

const OPTIONS: { v: ChoixRattrapage; l: string }[] = [
  { v: "", l: "—" },
  { v: "kill", l: "Kill" },
  { v: "kill_np", l: "Kill sans paie" },
  { v: "keep", l: "Keep" },
];

function Ligne({ l, choix, onChange }: { l: LigneRattrapage; choix: ChoixRattrapage; onChange: (c: ChoixRattrapage) => void }) {
  return (
    <tr className="border-t" data-compte={l.compte_id}>
      <td className="py-1.5 pr-3">
        <div className="font-medium">{l.nom ?? "?"}</div>
        <div className="text-xs text-muted-foreground">@{l.handle ?? "?"} · {l.canal_paie === "ruul" ? "Ruul" : "Upwork"}</div>
      </td>
      <td className="py-1.5 pr-3 text-xs">
        {l.regle ? LIBELLE_REGLE[l.regle] ?? l.regle : "choisi à la main"}
        {l.stop && <Badge variant="destructive" className="ml-1">STOP</Badge>}
      </td>
      <td className="py-1.5 pr-3 text-xs tabular-nums">{l.posts_semaine} cette semaine · {l.posts_total} au total</td>
      <td className="py-1.5 pr-3 text-xs">
        {l.paie_statut === "paye" ? `payé ${l.paie_montant ?? "?"} $` : l.paie_statut === "a_verifier" ? "paie à vérifier" : "pas de paie"}
      </td>
      <td className="py-1.5">
        <select
          aria-label={`Choix pour ${l.nom ?? l.handle ?? l.compte_id}`}
          className="h-8 rounded-md border bg-background px-2 text-sm"
          value={choix}
          onChange={(e) => onChange(e.target.value as ChoixRattrapage)}
        >
          {OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
        </select>
      </td>
    </tr>
  );
}

export function RattrapageSamedi({ maintenant = new Date() }: { maintenant?: Date }) {
  const qc = useQueryClient();
  const lundi = ajouterJours(lundiDeLaSemaine(aujourdhuiParis(maintenant)), -7);
  const lu = useQuery({ queryKey: ["samedi-rattrapage", lundi], queryFn: () => lireRattrapage(lundi) });
  const [choix, setChoix] = React.useState<Record<string, ChoixRattrapage>>({});
  const lignes = React.useMemo(() => lu.data ?? [], [lu.data]);
  const choixDe = (l: LigneRattrapage) => choix[l.compte_id] ?? choixInitial(l);

  const valider = useMutation({
    mutationFn: async () => {
      const liste = lignes
        .map((l) => ({ compte_id: l.compte_id, choix: choixDe(l), raison: l.brouillon_raison?.detail ?? null }))
        .filter((c): c is { compte_id: string; choix: Exclude<ChoixRattrapage, "">; raison: string | null } => c.choix !== "");
      const r = await validerRattrapage(lundi, liste);
      // La fin de contrat (après la paie) et le rattrapage des arrêts : le passage habituel, tout de suite.
      await invoke("upwork", { action: "arrets" }).catch(() => undefined);
      return r;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["samedi-rattrapage"] });
      void qc.invalidateQueries({ queryKey: ["semaine-comptes"] });
    },
  });

  if (lu.isLoading || lignes.length === 0) {
    return valider.data ? <Resultat r={valider.data} /> : null;
  }

  const kills = lignes.filter((l) => l.brouillon === "kill" || l.brouillon === "kill_np");
  const sansDecision = lignes.filter((l) => !l.brouillon);
  const gardes = lignes.filter((l) => l.brouillon === "keep");
  const n = (k: ChoixRattrapage) => lignes.filter((l) => choixDe(l) === k).length;
  const recap = `${n("kill")} Kill, ${n("kill_np")} Kill sans paie, ${n("keep")} Keep, ${n("")} sans choix (laissés tels quels)`;
  const fixer = (id: string) => (c: ChoixRattrapage) => setChoix((p) => ({ ...p, [id]: c }));

  return (
    <Card className="border-destructive/50" data-testid="rattrapage-samedi">
      <CardHeader>
        <CardTitle>Samedi du {lundi.slice(8, 10)}/{lundi.slice(5, 7)} : pas validé</CardTitle>
        <CardDescription>
          Les choix du samedi n'ont pas été exécutés. Valider ici fait comme « Validate » : comptes désactivés, retrait de Slack,
          fin du contrat après la paie de la semaine. Une milestone encore financée arrive dans ta liste (« payer ou rembourser »).
          Aucun message aux posteurs.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {[
          { titre: `Kills choisis samedi (${kills.length})`, l: kills },
          { titre: `Propositions sans décision (${sansDecision.length})`, l: sansDecision },
          { titre: `Gardés samedi (${gardes.length})`, l: gardes },
        ].filter((g) => g.l.length > 0).map((g) => (
          <section key={g.titre} className="space-y-1">
            <h3 className="text-sm font-semibold">{g.titre}</h3>
            <table className="w-full text-sm">
              <tbody>
                {g.l.map((l) => <Ligne key={l.compte_id} l={l} choix={choixDe(l)} onChange={fixer(l.compte_id)} />)}
              </tbody>
            </table>
          </section>
        ))}
        <div className="flex flex-wrap items-center gap-3 border-t pt-3">
          <span className="text-sm">{recap}</span>
          <Button
            data-action="valider-rattrapage"
            loading={valider.isPending}
            onClick={() => {
              if (window.confirm(`Valider le samedi du ${lundi} ?\n${recap}`)) valider.mutate();
            }}
          >
            Valider
          </Button>
        </div>
        {valider.error && <p className="text-sm text-destructive">{(valider.error as Error).message}</p>}
        {valider.data && <Resultat r={valider.data} />}
      </CardContent>
    </Card>
  );
}

function Resultat({ r }: { r: { kills: number; kills_sans_paie: number; gardes: number; erreurs: string[] } }) {
  return (
    <div className="space-y-1 text-sm" data-testid="rattrapage-resultat">
      <p>Fait : {r.kills} Kill, {r.kills_sans_paie} Kill sans paie, {r.gardes} gardés.</p>
      {r.erreurs.length > 0 && (
        <ul className="list-disc pl-5 text-destructive">
          {r.erreurs.map((e) => <li key={e}>{e}</li>)}
        </ul>
      )}
    </div>
  );
}
