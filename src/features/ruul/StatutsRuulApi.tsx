import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { invoke } from "@/features/moteur/api";
import { supabase } from "@/lib/supabase/client";

/**
 * 17/11 (Max) : les statuts Ruul lus par l'API (toutes les heures), à la place de l'import manuel.
 * Un tableau par cohorte et par statut d'onboarding, la dernière lecture, la dernière erreur.
 */

export const STATUTS_ONBOARDING = ["READY", "PENDING_AGREEMENTS", "PENDING_COLLECTION_ACCOUNT", "PENDING_KYC", "NOT_REGISTERED", "PAS_TROUVE"] as const;

export const LIBELLE_ONBOARDING: Record<string, string> = {
  READY: "READY (payable)",
  PENDING_AGREEMENTS: "Contrats à signer",
  PENDING_COLLECTION_ACCOUNT: "Banque à ajouter",
  PENDING_KYC: "Identité à faire",
  NOT_REGISTERED: "Compte pas activé",
  PAS_TROUVE: "Pas dans Ruul",
};

export interface LigneTableau {
  cohorte: string | null;
  onboarding: string;
  posteurs: number;
  actifs: number;
  ont_poste: number;
}

export interface EtatApi {
  env: "prod" | "sandbox";
  company_id: number | null;
  connect_actif: boolean;
  derniere_lecture: { at: string; env: string; lus: number | null } | null;
  derniere_erreur: { at: string; env: string; action: string; http: number | null; erreur: string } | null;
  non_relies: number;
}

export async function lireTableauRuul(): Promise<LigneTableau[]> {
  const { data, error } = await supabase.rpc("ruul_onboarding_tableau");
  if (error) throw error;
  return (data ?? []) as LigneTableau[];
}

export async function lireEtatApiRuul(): Promise<EtatApi | null> {
  const { data, error } = await supabase.rpc("ruul_api_etat");
  if (error) throw error;
  return (data ?? null) as EtatApi | null;
}

/** Les cohortes en lignes (les plus récentes d'abord), les statuts en colonnes. */
export function croiser(lignes: LigneTableau[]): { cohortes: (string | null)[]; n: (c: string | null, s: string) => number; total: (s: string) => number } {
  const cohortes = [...new Set(lignes.map((l) => l.cohorte))].sort((a, b) => (b ?? "").localeCompare(a ?? ""));
  const n = (c: string | null, s: string) => lignes.filter((l) => l.cohorte === c && l.onboarding === s).reduce((t, l) => t + l.actifs, 0);
  const total = (s: string) => lignes.filter((l) => l.onboarding === s).reduce((t, l) => t + l.actifs, 0);
  return { cohortes, n, total };
}

const quand = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const jour = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : "sans cohorte");

export function StatutsRuulApi() {
  const qc = useQueryClient();
  const tableau = useQuery({ queryKey: ["ruul-api", "tableau"], queryFn: lireTableauRuul });
  const etat = useQuery({ queryKey: ["ruul-api", "etat"], queryFn: lireEtatApiRuul });
  const relire = useMutation({
    mutationFn: () => invoke<{ ok: boolean; error?: string; lus?: number }>("ruul-api", { action: "sync" }),
    onSettled: () => void qc.invalidateQueries({ queryKey: ["ruul-api"] }),
  });
  const { cohortes, n, total } = croiser(tableau.data ?? []);
  const e = etat.data;
  const colonnes = STATUTS_ONBOARDING.filter((s) => total(s) > 0 || s === "READY");

  return (
    <Card data-testid="statuts-ruul-api">
      <CardHeader>
        <CardTitle>Statuts Ruul (API)</CardTitle>
        <CardDescription>
          Lus chez Ruul toutes les heures ({e?.env === "sandbox" ? "SANDBOX" : "prod"}). Dernière lecture :{" "}
          <b>{e?.derniere_lecture ? `${quand(e.derniere_lecture.at)} · ${e.derniere_lecture.lus ?? "?"} personnes chez Ruul` : "jamais"}</b>
          {e && e.non_relies > 0 ? ` · ${e.non_relies} chez Ruul sans fiche dans l'OS` : ""}. Posteurs actifs seulement.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {e?.derniere_erreur && (!e.derniere_lecture || e.derniere_erreur.at > e.derniere_lecture.at) && (
          <p className="text-sm text-destructive" data-testid="statuts-ruul-erreur">
            Dernière erreur ({quand(e.derniere_erreur.at)}, {e.derniere_erreur.action}) : {e.derniere_erreur.erreur}
          </p>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="py-1 pr-3">Cohorte</th>
                {colonnes.map((s) => <th key={s} className="py-1 pr-3">{LIBELLE_ONBOARDING[s]}</th>)}
              </tr>
            </thead>
            <tbody>
              {cohortes.map((c) => (
                <tr key={c ?? "aucune"} className="border-t">
                  <td className="py-1 pr-3">{jour(c)}</td>
                  {colonnes.map((s) => <td key={s} className="py-1 pr-3 tabular-nums">{n(c, s) || ""}</td>)}
                </tr>
              ))}
              <tr className="border-t font-semibold">
                <td className="py-1 pr-3">Total</td>
                {colonnes.map((s) => <td key={s} className="py-1 pr-3 tabular-nums">{total(s)}</td>)}
              </tr>
            </tbody>
          </table>
        </div>
        <div className="flex items-center gap-3">
          <Button size="sm" variant="outline" loading={relire.isPending} onClick={() => relire.mutate()} data-testid="statuts-ruul-relire">
            Relire maintenant
          </Button>
          {relire.data && !relire.data.ok && <span className="text-sm text-destructive">{relire.data.error}</span>}
          {relire.data?.ok && <span className="text-sm text-muted-foreground">{relire.data.lus} personnes lues chez Ruul</span>}
        </div>
      </CardContent>
    </Card>
  );
}
