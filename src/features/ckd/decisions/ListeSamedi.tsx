import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/features/auth/AuthContext";
import { deciderCkd } from "@/features/ckd/api";
import { HandleTiktok } from "@/features/ckd/cohorte/liens";
import { arreterRecrueSamedi, reporterRecrue } from "@/features/cohortes/api";
import { invoke } from "@/features/moteur/api";
import { aujourdhuiParis } from "@/features/moteur/cohortes";
import { ajouterJours } from "@/features/onboarding/datesRuul";

import type { ADecider } from "./api";
import { lundiDeLaSemaine } from "./logique";
import {
  type ChoixSamedi,
  choisirSamedi,
  choixSamediInitial,
  type CompteSemaine,
  decisionSamedi,
  FILTRES_VIDES,
  filtrerComptes,
  lireRecruesSansReaction,
  lireSemaineComptes,
  manqueRecrue,
  planSamedi,
  type RecrueSansReaction,
  type Tri,
  trierComptes,
} from "./semaineComptes";
import { BarreFiltres, CelluleCompte, CellulesJours, CelluleVues, Choix, EnTetesJours, Signaux, TD, TH } from "./TableauComptes";
import { useRaison } from "./useRaison";

const CHOIX: readonly ChoixSamedi[] = ["kill", "double", "keep"];
type ChoixRecrue = "kill" | "reporter" | "rien";
const CHOIX_RECRUE: readonly ChoixRecrue[] = ["kill", "reporter", "rien"];

/** La proposition de l'OS et sa raison, en une ligne. */
function Proposition({ c }: { c: CompteSemaine }) {
  const { t } = useTranslation();
  const texteRaison = useRaison();
  if (!c.ckd_samedi_id) return <span className="text-xs text-muted-foreground">{t("autoOnglets.decisions.liste.samedi.rienAProposer")}</span>;
  const manuel = Boolean(c.ckd_samedi_donnees?.manuel);
  const action = c.ckd_samedi_action === "ne_pas_renouveler" ? "kill" : c.ckd_samedi_action === "doubler" ? "double" : "keep";
  const raison = manuel
    ? t("autoOnglets.decisions.liste.samedi.manuel")
    : texteRaison({ regle: c.ckd_samedi_regle, donnees: c.ckd_samedi_donnees ?? {}, mercredi_at: null } as unknown as ADecider);
  return (
    <div className="max-w-56 space-y-0.5 text-xs">
      <Badge variant={action === "kill" ? "error" : action === "double" ? "success" : "secondary"}>
        {t(`autoOnglets.decisions.liste.samedi.choix.${action}`)}
      </Badge>
      {raison && <p className="text-muted-foreground">{raison}</p>}
    </div>
  );
}

/**
 * Prompt 25, partie 4 : Weekly decisions → Saturday, la masterlist. Tous les
 * comptes actifs, une ligne par compte : posts avec lien du lundi au samedi,
 * vues, nudgé jeudi ou non, shadowban supposé, la proposition de l'OS avec sa
 * raison. Kill / Double / Keep, pré-rempli avec la proposition ; mêmes filtres
 * et même tri que le jeudi. Une section à part : les recrues qui n'ont pas
 * réagi aux relances (Kill ou reporter). Rien sans « Validate ». Prompt 25
 * v4 : un Kill part tout de suite, sans message (désactivé, retiré de Slack,
 * contrat fermé ; milestone financée : Needs you) ; les Double suivent l'offre
 * au posteur.
 */
export function ListeSamedi({ maintenant = new Date() }: { maintenant?: Date }) {
  const { t } = useTranslation();
  const { role } = useAuth();
  const admin = role === "admin";
  const qc = useQueryClient();
  const aujourdhui = aujourdhuiParis(maintenant);
  const lundi = lundiDeLaSemaine(aujourdhui);
  const samedi = ajouterJours(lundi, 5);
  const jusqu = aujourdhui < samedi ? aujourdhui : samedi;
  const lu = useQuery({ queryKey: ["semaine-comptes", lundi, jusqu], queryFn: () => lireSemaineComptes(lundi, jusqu) });
  const recrues = useQuery({ queryKey: ["samedi-recrues", lundi], queryFn: () => lireRecruesSansReaction(lundi) });
  const [choix, setChoix] = React.useState<Record<string, ChoixSamedi>>({});
  const [choixRecrues, setChoixRecrues] = React.useState<Record<string, ChoixRecrue>>({});
  const [filtres, setFiltres] = React.useState(FILTRES_VIDES);
  const [tri, setTri] = React.useState<Tri>("posts_asc");
  const [bilan, setBilan] = React.useState<string | null>(null);

  const liste = lu.data ?? [];
  const choixDe = (c: CompteSemaine) => choix[c.compte_id] ?? choixSamediInitial(c);
  const visibles = trierComptes(filtrerComptes(liste, filtres), tri);
  const jours = liste[0]?.jours.map((j) => j.jour) ?? [];
  const aDecider = liste.filter((c) => !decisionSamedi(c));
  const compte = (x: ChoixSamedi) => aDecider.filter((c) => choixDe(c) === x && (x !== "keep" || c.ckd_samedi_id)).length;
  const choixRecrueDe = (r: RecrueSansReaction) => choixRecrues[r.poster_id] ?? "rien";
  const recruesKill = (recrues.data ?? []).filter((r) => choixRecrueDe(r) === "kill");
  const recruesReport = (recrues.data ?? []).filter((r) => choixRecrueDe(r) === "reporter");

  const valider = useMutation({
    mutationFn: async () => {
      const erreurs: string[] = [];
      let decides = 0;
      for (const c of aDecider) {
        const etapes = planSamedi(c, choixDe(c));
        try {
          for (const e of etapes) {
            if (e.op === "decider") await deciderCkd(e.id, e.decision, null);
            else await deciderCkd(await choisirSamedi(c.compte_id, e.action), e.action, null);
          }
          if (etapes.length) decides++;
        } catch (err) {
          erreurs.push(`@${c.handle ?? "?"} : ${(err as Error).message}`);
        }
      }
      for (const r of recruesKill) {
        try {
          if (r.compte_id) await deciderCkd(await choisirSamedi(r.compte_id, "ne_pas_renouveler"), "ne_pas_renouveler", null);
          else await arreterRecrueSamedi(r.poster_id);
        } catch (err) {
          erreurs.push(`${r.nom ?? "?"} : ${(err as Error).message}`);
        }
      }
      for (const r of recruesReport) {
        try {
          await reporterRecrue(r.poster_id);
        } catch (err) {
          erreurs.push(`${r.nom ?? "?"} : ${(err as Error).message}`);
        }
      }
      // Prompt 25 v4 : les arrêts (désactivé, Slack, contrat fermé, sans message) partent tout de suite, pas au passage suivant.
      if (decides > 0 || recruesKill.length > 0) await invoke("upwork", { action: "arrets" }).catch(() => undefined);
      return { decides, kills: recruesKill.length, reports: recruesReport.length, erreurs };
    },
    onSuccess: (r) => {
      setChoix({});
      setChoixRecrues({});
      setBilan(t("autoOnglets.decisions.liste.samedi.bilan", r) + (r.erreurs.length ? ` · ${r.erreurs.join(" · ")}` : ""));
      void qc.invalidateQueries({ queryKey: ["semaine-comptes"] });
      void qc.invalidateQueries({ queryKey: ["samedi-recrues"] });
      void qc.invalidateQueries({ queryKey: ["ckd"] });
    },
  });

  return (
    <div className="space-y-4">
      <Card data-testid="liste-samedi">
        <CardHeader>
          <CardTitle>{t("autoOnglets.decisions.liste.samedi.titre", { n: liste.length })}</CardTitle>
          <CardDescription>{t("autoOnglets.decisions.liste.samedi.aide")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {lu.error && <p className="text-sm text-destructive">{(lu.error as Error).message}</p>}
          {lu.isPending && <p className="text-sm text-muted-foreground">{t("common.loading")}</p>}
          <BarreFiltres liste={liste} filtres={filtres} setFiltres={setFiltres} tri={tri} setTri={setTri} />
          <p className="text-xs text-muted-foreground">{t("autoOnglets.decisions.liste.affiches", { n: visibles.length, total: liste.length })}</p>
          <div className="relative overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b">
                  <th className={TH}>{t("autoOnglets.decisions.liste.colonnes.choix")}</th>
                  <th className={TH}>{t("autoOnglets.decisions.liste.colonnes.compte")}</th>
                  <th className={TH}>{t("autoOnglets.decisions.liste.colonnes.pays")}</th>
                  <EnTetesJours jours={jours} />
                  <th className={`${TH} text-right`}>{t("autoOnglets.decisions.liste.colonnes.total")}</th>
                  <th className={TH}>{t("autoOnglets.decisions.liste.colonnes.vues")}</th>
                  <th className={TH}>{t("autoOnglets.decisions.liste.colonnes.jeudi")}</th>
                  <th className={TH}>{t("autoOnglets.decisions.liste.colonnes.signaux")}</th>
                  <th className={TH}>{t("autoOnglets.decisions.liste.colonnes.propose")}</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((c) => {
                  const prise = decisionSamedi(c);
                  return (
                    <tr key={c.compte_id} className="border-b border-border/40" data-compte={c.handle ?? c.compte_id}>
                      <td className={TD}>
                        <Choix
                          valeur={choixDe(c)}
                          options={CHOIX}
                          libelle={(o) => t(`autoOnglets.decisions.liste.samedi.choix.${o}`)}
                          lecture={!admin || prise !== null}
                          onChange={(o) => setChoix((x) => ({ ...x, [c.compte_id]: o }))}
                        />
                        {prise && <p className="mt-1 text-[11px] text-muted-foreground">{t("autoOnglets.decisions.liste.samedi.dejaDecide")}</p>}
                      </td>
                      <td className={TD}>
                        <CelluleCompte c={c} />
                      </td>
                      <td className={`${TD} text-xs`}>{c.pays ?? "—"}</td>
                      <CellulesJours c={c} aujourdhui={jusqu} />
                      <td className={`${TD} text-right tabular-nums`}>
                        {c.lien_total}/{c.prevus_passes + c.lien_aujourdhui}
                      </td>
                      <td className={TD}>
                        <CelluleVues c={c} />
                      </td>
                      <td className={`${TD} text-xs`}>
                        {c.nudge_envoye_at ? (
                          <Badge variant="warning">{t("autoOnglets.decisions.liste.samedi.nudge")}</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className={TD}>
                        <Signaux c={c} />
                      </td>
                      <td className={TD}>
                        <Proposition c={c} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="samedi-recrues">
        <CardHeader>
          <CardTitle className="text-base">{t("autoOnglets.decisions.liste.recrues.titre", { n: recrues.data?.length ?? 0 })}</CardTitle>
          <CardDescription>{t("autoOnglets.decisions.liste.recrues.aide")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {recrues.error && <p className="text-destructive">{(recrues.error as Error).message}</p>}
          {recrues.data && recrues.data.length === 0 && <p className="text-muted-foreground">{t("autoOnglets.decisions.liste.recrues.vide")}</p>}
          <ul className="divide-y rounded-md border">
            {(recrues.data ?? []).map((r) => (
              <li key={r.poster_id} className="flex flex-wrap items-center gap-3 p-2" data-recrue={r.poster_id}>
                <Choix
                  valeur={choixRecrueDe(r)}
                  options={CHOIX_RECRUE}
                  libelle={(o) => t(`autoOnglets.decisions.liste.recrues.choix.${o}`)}
                  lecture={!admin}
                  onChange={(o) => setChoixRecrues((x) => ({ ...x, [r.poster_id]: o }))}
                />
                <span className="font-medium">{r.nom ?? "—"}</span>
                {r.handle && <HandleTiktok handle={r.handle} pays={r.pays} className="text-xs font-normal" />}
                <span className="text-xs text-muted-foreground">{[r.hm_nom ? `HM ${r.hm_nom}` : null, r.pays].filter(Boolean).join(" · ")}</span>
                <Badge variant="warning">{t(`autoOnglets.decisions.liste.recrues.manque.${manqueRecrue(r)}`, { n: Math.max(0, 5 - (r.abonnements ?? 0)) })}</Badge>
                <span className="text-xs text-muted-foreground">{t("autoOnglets.decisions.liste.recrues.relances", { n: r.relances })}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t bg-background py-3">
        <Badge variant="info">
          {t("autoOnglets.decisions.liste.samedi.compte", {
            kills: compte("kill"),
            doubles: compte("double"),
            keeps: compte("keep"),
            recrues: recruesKill.length + recruesReport.length,
          })}
        </Badge>
        {admin && (
          <Button
            data-action="valider-samedi"
            loading={valider.isPending}
            onClick={() => {
              if (window.confirm(t("autoOnglets.decisions.liste.samedi.confirm", {
                kills: compte("kill") + recruesKill.length, doubles: compte("double"), reports: recruesReport.length,
              }))) valider.mutate();
            }}
          >
            {t("autoOnglets.decisions.liste.samedi.valider")}
          </Button>
        )}
        <span className="text-xs text-muted-foreground">{t("autoOnglets.decisions.liste.samedi.quand")}</span>
      </div>
      {bilan && <p className="text-sm">{bilan}</p>}
      {valider.error && <p className="text-sm text-destructive">{(valider.error as Error).message}</p>}
    </div>
  );
}
