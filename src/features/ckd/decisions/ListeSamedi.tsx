import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/features/auth/AuthContext";
import { deciderCkd } from "@/features/ckd/api";
import { HandleTiktok } from "@/features/ckd/cohorte/liens";
import { arreterRecrueSamedi, reporterRecrue } from "@/features/cohortes/api";
import { invoke } from "@/features/moteur/api";
import { aujourdhuiParis } from "@/features/moteur/cohortes";
import { ajouterJours } from "@/features/onboarding/datesRuul";

import type { ADecider } from "./api";
import { FicheSamedi } from "./FicheSamedi";
import { useFicheSamedi } from "./useFicheSamedi";
import { lundiDeLaSemaine } from "./logique";
import {
  type ChoixSamedi,
  choisirSamedi,
  choixSamediInitial,
  type CompteSemaine,
  decisionSamedi,
  type DemandeArret,
  garderMalgreDemande,
  lireDemandesArret,
  FILTRES_VIDES,
  filtrerComptes,
  lireRecruesSansReaction,
  lireFicheSamedi,
  lireSemaineComptes,
  manqueRecrue,
  noterKillSansPaie,
  planSamedi,
  RAISONS_SANS_PAIE,
  type RaisonSansPaie,
  type RecrueSansReaction,
  type Tri,
  trierComptes,
} from "./semaineComptes";
import { BarreFiltres, CelluleCompte, CellulesJours, CelluleVues, Choix, EnTetesJours, Signaux, TD, TH } from "./TableauComptes";
import { useRaison } from "./useRaison";

const CHOIX: readonly ChoixSamedi[] = ["kill", "kill_np", "double", "keep"];

type RaisonSaisie = { code: RaisonSansPaie | ""; detail: string };
/** La raison d'un Kill & don't pay, en clair (Disputes la montre si le freelance conteste). */
const texteRaison = (r: RaisonSaisie | undefined, libelle: (c: RaisonSansPaie) => string) =>
  r?.code ? [libelle(r.code), r.detail.trim()].filter(Boolean).join(" : ") : "";
const raisonComplete = (r: RaisonSaisie | undefined) => Boolean(r?.code && (r.code !== "autre" || r.detail.trim()));

/**
 * Prompt 26 : Kill & don't pay : la raison obligatoire, le montant en jeu et
 * l'avertissement (le freelance a 7 jours pour accepter le remboursement).
 */
function RaisonSansPaieSaisie({ posterId, lundi, valeur, onChange }: { posterId: string; lundi: string; valeur: RaisonSaisie; onChange: (r: RaisonSaisie) => void }) {
  const { t } = useTranslation();
  const fiche = useFicheSamedi(posterId, lundi, true);
  const p = "autoOnglets.decisions.liste.samedi.sansPaie";
  return (
    <div className="space-y-1.5 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs" data-testid="raison-sans-paie">
      <p className="font-medium">{t(`${p}.enJeu`, { montant: fiche.data?.semaine?.montant ?? "…" })}</p>
      <p className="text-destructive">{t(`${p}.avertissement`)}</p>
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="h-8 rounded-md border bg-background px-2"
          aria-label={t(`${p}.raison`)}
          value={valeur.code}
          onChange={(e) => onChange({ ...valeur, code: e.target.value as RaisonSaisie["code"] })}
        >
          <option value="">{t(`${p}.choisir`)}</option>
          {RAISONS_SANS_PAIE.map((r) => <option key={r} value={r}>{t(`${p}.raisons.${r}`)}</option>)}
        </select>
        <Input className="h-8 max-w-md" aria-label={t(`${p}.detail`)} placeholder={t(`${p}.detail`)} value={valeur.detail}
          onChange={(e) => onChange({ ...valeur, detail: e.target.value })} />
      </div>
    </div>
  );
}
type ChoixRecrue = "kill" | "reporter" | "rien";
const CHOIX_RECRUE: readonly ChoixRecrue[] = ["kill", "reporter", "rien"];

/** Décisions finales : la demande d'arrêt (Kill pré-coché) et sa raison. */
export function BadgeDemande({ d }: { d: DemandeArret }) {
  const { t } = useTranslation();
  return (
    <div className="max-w-64 space-y-0.5 text-xs" data-demande-arret={d.source}>
      <Badge variant="error">{t(`autoOnglets.decisions.liste.samedi.demande.${d.source}`)}</Badge>
      {d.raison && <p className="line-clamp-3 text-muted-foreground">« {d.raison} »</p>}
    </div>
  );
}

/** La proposition de l'OS et sa raison, en une ligne. */
function Proposition({ c, demande }: { c: CompteSemaine; demande: DemandeArret | null }) {
  const { t } = useTranslation();
  const texteRaison = useRaison();
  if (demande && !decisionSamedi(c)) return <BadgeDemande d={demande} />;
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
 * au posteur. Décisions finales : seul ce « Validate » arrête ; une demande
 * d'arrêt (STOP, persona refusé…) y arrive Kill pré-coché, avec sa raison.
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
  const demandes = useQuery({ queryKey: ["demandes-arret"], queryFn: lireDemandesArret });
  const [choix, setChoix] = React.useState<Record<string, ChoixSamedi>>({});
  // Prompt 26 : la raison de chaque Kill & don't pay, et les fiches ouvertes.
  const [raisons, setRaisons] = React.useState<Record<string, RaisonSaisie>>({});
  const [ouverts, setOuverts] = React.useState<Record<string, boolean>>({});
  const [choixRecrues, setChoixRecrues] = React.useState<Record<string, ChoixRecrue>>({});
  const [filtres, setFiltres] = React.useState(FILTRES_VIDES);
  const [tri, setTri] = React.useState<Tri>("posts_asc");
  const [bilan, setBilan] = React.useState<string | null>(null);

  const liste = lu.data ?? [];
  // Décisions finales : une demande d'arrêt pré-coche Kill (sur les comptes de ceux qui ont commencé ;
  // une recrue d'une cohorte pas commencée est dans la liste des recrues).
  const demandeDe = new Map((demandes.data ?? []).map((d) => [d.poster_id, d]));
  const demandeCompte = (c: CompteSemaine) => (!c.cohorte_lundi || c.cohorte_lundi <= lundi ? demandeDe.get(c.poster_id) ?? null : null);
  const choixDe = (c: CompteSemaine) => choix[c.compte_id] ?? choixSamediInitial(c, demandeCompte(c));
  const visibles = trierComptes(filtrerComptes(liste, filtres), tri);
  // Décisions finales 2 : la masterlist en 3 parties : les recrues de la prochaine cohorte (plus bas, en tête de page),
  // les comptes en 1re semaine de posts, puis les anciens.
  const groupes: [string, CompteSemaine[]][] = [
    ["premiere", visibles.filter((c) => c.cohorte_lundi === lundi)],
    ["anciens", visibles.filter((c) => c.cohorte_lundi !== lundi)],
  ];
  const jours = liste[0]?.jours.map((j) => j.jour) ?? [];
  const aDecider = liste.filter((c) => !decisionSamedi(c));
  const compte = (x: ChoixSamedi) => aDecider.filter((c) => choixDe(c) === x && (x !== "keep" || c.ckd_samedi_id)).length;
  const choixRecrueDe = (r: RecrueSansReaction) => choixRecrues[r.poster_id] ?? (demandeDe.has(r.poster_id) ? "kill" : "rien");
  const recruesKill = (recrues.data ?? []).filter((r) => choixRecrueDe(r) === "kill");
  const recruesReport = (recrues.data ?? []).filter((r) => choixRecrueDe(r) === "reporter");

  const libelleRaison = (c: RaisonSansPaie) => t(`autoOnglets.decisions.liste.samedi.sansPaie.raisons.${c}`);
  const sansPaie = aDecider.filter((c) => choixDe(c) === "kill_np");
  const valider = useMutation({
    mutationFn: async () => {
      const erreurs: string[] = [];
      let decides = 0;
      // Prompt 26 : Kill & don't pay : une raison pour chacun, puis le montant en jeu confirmé une 2e fois.
      const montants = new Map<string, number | null>();
      for (const c of sansPaie) {
        const f = await qc.fetchQuery({ queryKey: ["samedi-fiche", c.poster_id, lundi], queryFn: () => lireFicheSamedi(c.poster_id, lundi) });
        montants.set(c.compte_id, f.semaine?.montant ?? null);
      }
      if (sansPaie.length > 0) {
        const total = [...montants.values()].reduce<number>((s, m) => s + Number(m ?? 0), 0);
        if (!window.confirm(t("autoOnglets.decisions.liste.samedi.sansPaie.confirm", { n: sansPaie.length, total }))) {
          return { decides: 0, kills: 0, reports: 0, erreurs: [t("autoOnglets.decisions.liste.samedi.sansPaie.annule")] };
        }
      }
      for (const c of aDecider) {
        const etapes = planSamedi(c, choixDe(c));
        try {
          for (const e of etapes) {
            if (e.op === "decider") await deciderCkd(e.id, e.decision, null);
            else await deciderCkd(await choisirSamedi(c.compte_id, e.action), e.action, null);
          }
          if (etapes.length) decides++;
          if (choixDe(c) === "kill_np") await noterKillSansPaie(c.poster_id, lundi, texteRaison(raisons[c.compte_id], libelleRaison), montants.get(c.compte_id) ?? null);
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
      // Décisions finales : une demande d'arrêt pas suivie d'un Kill est classée « garder » (les relances reprennent).
      const gardes = new Set([
        ...aDecider.filter((c) => demandeCompte(c) && choixDe(c) !== "kill").map((c) => c.poster_id),
        ...(recrues.data ?? []).filter((r) => demandeDe.has(r.poster_id) && choixRecrueDe(r) !== "kill").map((r) => r.poster_id),
      ]);
      for (const p of gardes) {
        try {
          await garderMalgreDemande(p);
        } catch (err) {
          erreurs.push((err as Error).message);
        }
      }
      // Prompt 25 v4 : les arrêts (désactivé, Slack, contrat fermé, sans message) partent tout de suite, pas au passage suivant.
      if (decides > 0 || recruesKill.length > 0) await invoke("upwork", { action: "arrets" }).catch(() => undefined);
      return { decides, kills: recruesKill.length, reports: recruesReport.length, erreurs };
    },
    onSuccess: (r) => {
      setChoix({});
      setRaisons({});
      setChoixRecrues({});
      setBilan(t("autoOnglets.decisions.liste.samedi.bilan", r) + (r.erreurs.length ? ` · ${r.erreurs.join(" · ")}` : ""));
      void qc.invalidateQueries({ queryKey: ["semaine-comptes"] });
      void qc.invalidateQueries({ queryKey: ["samedi-recrues"] });
      void qc.invalidateQueries({ queryKey: ["demandes-arret"] });
      void qc.invalidateQueries({ queryKey: ["ckd"] });
    },
  });

  return (
    <div className="space-y-4">
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
                {demandeDe.get(r.poster_id) && <BadgeDemande d={demandeDe.get(r.poster_id)!} />}
                <span className="text-xs text-muted-foreground">{t("autoOnglets.decisions.liste.recrues.relances", { n: r.relances })}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

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
                {groupes.map(([g, lignes]) => lignes.length === 0 ? null : (
                  <React.Fragment key={g}>
                  <tr className="bg-muted/40" data-groupe={g}>
                    <td className={`${TD} font-medium`} colSpan={jours.length + 8}>
                      {t(`autoOnglets.decisions.liste.samedi.groupes.${g}`, { n: lignes.length })}
                    </td>
                  </tr>
                {lignes.map((c) => {
                  const prise = decisionSamedi(c);
                  const np = !prise && choixDe(c) === "kill_np";
                  return (
                    <React.Fragment key={c.compte_id}>
                    <tr className="border-b border-border/40" data-compte={c.handle ?? c.compte_id}>
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
                        <button
                          type="button"
                          className="mt-1 text-[11px] text-primary underline"
                          onClick={() => setOuverts((x) => ({ ...x, [c.compte_id]: !x[c.compte_id] }))}
                        >
                          {t(ouverts[c.compte_id] ? "autoOnglets.decisions.liste.samedi.fiche.masquer" : "autoOnglets.decisions.liste.samedi.fiche.voir")}
                        </button>
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
                        <Proposition c={c} demande={demandeCompte(c)} />
                      </td>
                    </tr>
                    {(np || ouverts[c.compte_id]) && (
                      <tr className="border-b border-border/40 bg-muted/20" data-fiche={c.handle ?? c.compte_id}>
                        <td className={TD} colSpan={jours.length + 8}>
                          <div className="space-y-2">
                            {np && (
                              <RaisonSansPaieSaisie
                                posterId={c.poster_id}
                                lundi={lundi}
                                valeur={raisons[c.compte_id] ?? { code: "", detail: "" }}
                                onChange={(r) => setRaisons((x) => ({ ...x, [c.compte_id]: r }))}
                              />
                            )}
                            {ouverts[c.compte_id] && <FicheSamedi posterId={c.poster_id} lundi={lundi} />}
                          </div>
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  );
                })}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>


      <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t bg-background py-3">
        <Badge variant="info">
          {t("autoOnglets.decisions.liste.samedi.compte", {
            kills: compte("kill") + compte("kill_np"),
            doubles: compte("double"),
            keeps: compte("keep"),
            recrues: recruesKill.length + recruesReport.length,
          })}
        </Badge>
        {admin && sansPaie.some((c) => !raisonComplete(raisons[c.compte_id])) && (
          <span className="text-xs text-destructive">{t("autoOnglets.decisions.liste.samedi.sansPaie.manque")}</span>
        )}
        {admin && (
          <Button
            data-action="valider-samedi"
            loading={valider.isPending}
            disabled={sansPaie.some((c) => !raisonComplete(raisons[c.compte_id]))}
            onClick={() => {
              if (window.confirm(t("autoOnglets.decisions.liste.samedi.confirm", {
                kills: compte("kill") + compte("kill_np") + recruesKill.length, doubles: compte("double"), reports: recruesReport.length,
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
