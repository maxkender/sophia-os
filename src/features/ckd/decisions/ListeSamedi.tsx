import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/features/auth/AuthContext";
import { deciderCkd, recreerShadowban } from "@/features/ckd/api";
import { arreterRecrueSamedi, reporterRecrue } from "@/features/cohortes/api";
import { invoke } from "@/features/moteur/api";
import { conversationDe, useConversations } from "@/features/upwork/conversation";
import { LienConversation } from "@/features/upwork/LienConversation";
import { aujourdhuiParis } from "@/features/moteur/cohortes";
import { ajouterJours } from "@/features/onboarding/datesRuul";
import { cn } from "@/lib/utils";

import { CelluleAway, CelluleContexte } from "./ColonnesContexte";
import { lireContexte, relireConversationsUpwork } from "./contexte";
import { FicheSamedi } from "./FicheSamedi";
import { lireEtatsHandle } from "./handlesEtat";
import {
  calculerCouverture,
  type LigneSimulation,
  lireCouverture,
  lireForces,
  lireModeArret,
  simulerValidate,
} from "./samediExhaustif";
import { BadgesForces, CompteurCouverture, ContratsSansPosteur, ResultatSimulation } from "./SectionsSamedi";
import { LigneHandle } from "./LigneHandle";
import { BadgesPosteur, CellulesEtapes, StatutCompte } from "./LigneStatut";
import { lundiDeLaSemaine } from "./logique";
import {
  attendusJusquIci,
  type ChoixSamedi,
  choisirSamedi,
  type CompteSemaine,
  decisionSamedi,
  type DemandeArret,
  FILTRES_VIDES,
  filtrerComptes,
  garderMalgreDemande,
  lireDemandesArret,
  lireFicheSamedi,
  lireSemaineComptes,
  noterKillSansPaie,
  planSamedi,
  RAISONS_SANS_PAIE,
  type RaisonSansPaie,
  type Tri,
  trierComptes,
} from "./semaineComptes";
import {
  csvMasterlist,
  type EvaluationCompte,
  evaluerCompte,
  lireExtras,
  lireSeuilsConfiance,
  noterPause,
  type Onglet,
  ongletDe,
  ordreStatut,
  semaineCommencee,
} from "./statutCompte";
import { BarreFiltres, CelluleCompte, CellulesJours, CelluleVues, Choix, EnTetesJours, TD, TH } from "./TableauComptes";
import { useFicheSamedi } from "./useFicheSamedi";

const CHOIX: readonly ChoixSamedi[] = ["kill", "kill_np", "double", "keep", "repondre"];
const AUTRES: readonly ChoixSamedi[] = ["recreate", "pause", "reporter"];
// 31/10 : plus d'onglet « recrues » : la cohorte qui arrive n'est pas traitée le samedi.
const ONGLETS: readonly Onglet[] = ["premiere", "anciens", "tous"];

type RaisonSaisie = { code: RaisonSansPaie | ""; detail: string };
/** La raison d'un Kill & don't pay, en clair (Disputes la montre si le freelance conteste). */
const texteRaison = (r: RaisonSaisie | undefined, libelle: (c: RaisonSansPaie) => string) =>
  r?.code ? [libelle(r.code), r.detail.trim()].filter(Boolean).join(" : ") : "";
const raisonComplete = (r: RaisonSaisie | undefined) => Boolean(r?.code && (r.code !== "autre" || r.detail.trim()));

/** La proposition de l'OS en choix pré-coché (Je réponds : Keep, la ligne reste à traiter). */
function choixPropose(e: EvaluationCompte): ChoixSamedi {
  switch (e.proposition) {
    case "kill":
    case "double":
    case "recreate":
    case "reporter":
      return e.proposition;
    default:
      return "keep";
  }
}

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

/**
 * Prompts 12 et 14 : Weekly decisions → Saturday, la masterlist v2. Chaque
 * compte reçoit un statut calculé en direct (rouge « À traiter », orange « À
 * surveiller », vert « De confiance », sinon « Rien à signaler »), le problème
 * en une phrase et la proposition de l'OS avec sa raison. Onglets : la cohorte
 * qui arrive, la 1re semaine, les anciens, tous ; « À traiter » d'abord ; les
 * comptes de confiance regroupés en bas, fermés, sur Keep d'office. Un clic
 * sur la ligne (ou une case jour) ouvre le détail. Boutons : Kill & pay, Kill
 * & don't pay, Double, Keep, Je réponds, Autre (Recreate, pause, reporter) ;
 * pas de contrat : Kill bloqué. Rien sans le récap et Validate.
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
  const extras = useQuery({ queryKey: ["semaine-extras", lundi], queryFn: () => lireExtras(lundi) });
  const seuils = useQuery({ queryKey: ["masterlist-seuils"], queryFn: lireSeuilsConfiance });
  const demandes = useQuery({ queryKey: ["demandes-arret"], queryFn: lireDemandesArret });
  // 0464 : la couverture, les posteurs toujours montrés, le mode de Full stop (Test : Validate simule).
  const couverture = useQuery({ queryKey: ["samedi-couverture", lundi], queryFn: () => lireCouverture(lundi) });
  const forces = useQuery({ queryKey: ["samedi-forces", lundi], queryFn: () => lireForces(lundi) });
  const modeArret = useQuery({ queryKey: ["reglage-arret-auto"], queryFn: lireModeArret });
  const [simulation, setSimulation] = React.useState<{ lignes: LigneSimulation[]; autres: string[] } | null>(null);
  // Prompt 27 : le contexte de chaque posteur (messages, connexion, dernier post, absence déclarée).
  const posteursListe = React.useMemo(() => [...new Set((lu.data ?? []).map((c) => c.poster_id))].sort(), [lu.data]);
  const contexte = useQuery({
    queryKey: ["masterlist-contexte", lundi, posteursListe],
    queryFn: () => lireContexte(lundi, posteursListe),
    enabled: posteursListe.length > 0,
  });
  const comptesListe = React.useMemo(() => [...new Set((lu.data ?? []).map((c) => c.compte_id))].sort(), [lu.data]);
  const etats = useQuery({
    queryKey: ["handles-etat", lundi, comptesListe],
    queryFn: () => lireEtatsHandle(lundi, comptesListe),
    enabled: comptesListe.length > 0,
  });
  const jeudi = ajouterJours(lundi, 3);
  /** Posts avec lien depuis jeudi (vendredi → dimanche). */
  const postsDepuisJeudi = (c: CompteSemaine) => c.jours.filter((j) => j.jour > jeudi).reduce((n, j) => n + j.lien, 0);
  const relire = useMutation({
    mutationFn: () => relireConversationsUpwork(posteursListe),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["masterlist-contexte"] }),
  });
  const [choix, setChoix] = React.useState<Record<string, ChoixSamedi>>({});
  const [raisons, setRaisons] = React.useState<Record<string, RaisonSaisie>>({});
  const [ouverts, setOuverts] = React.useState<Record<string, string | true | undefined>>({});
  const [filtres, setFiltres] = React.useState(FILTRES_VIDES);
  const [tri, setTri] = React.useState<Tri>("posts_asc");
  const [onglet, setOnglet] = React.useState<Onglet>("tous");
  const [tous, setTous] = React.useState(false);
  const [bilan, setBilan] = React.useState<string | null>(null);

  // 31/10 : seulement les posteurs qui ont eu une semaine de posting. La cohorte qui arrive
  // (cohorte_lundi après ce lundi) reste à Onboarding posters et au check warm-up du dimanche soir.
  const liste = React.useMemo(() => (lu.data ?? []).filter((c) => semaineCommencee(c.cohorte_lundi, lundi)), [lu.data, lundi]);
  const x = (c: CompteSemaine) => extras.data?.get(c.compte_id);
  const evals = React.useMemo(() => new Map(liste.map((c) => [c.compte_id, evaluerCompte(c, extras.data?.get(c.compte_id), {
    lundi, aujourdhui, maintenant, page: "samedi", seuils: seuils.data,
  })])), [liste, extras.data, seuils.data, lundi, aujourdhui, maintenant]);
  const e = (c: CompteSemaine) => evals.get(c.compte_id)!;
  const demandeDe = new Map((demandes.data ?? []).map((d) => [d.poster_id, d]));
  // 0464 : quelle que soit la cohorte.
  const demandeCompte = (c: CompteSemaine) => demandeDe.get(c.poster_id) ?? null;
  const forcesDe = (posterId: string) => forces.data?.get(posterId) ?? [];
  const choixDe = (c: CompteSemaine): ChoixSamedi => {
    if (choix[c.compte_id]) return choix[c.compte_id];
    const prise = decisionSamedi(c);
    if (prise) return prise;
    if (demandeCompte(c)) return "kill";
    // « Kill Saturday » choisi jeudi : Kill & pay pré-sélectionné (Max valide toujours samedi).
    if (etats.data?.get(c.compte_id)?.kill_jeudi_at) return "kill";
    // 0464 : reporté 2 fois, No channel (et les autres raisons) : Kill & pay proposé.
    if (forcesDe(c.poster_id).length) return "kill";
    return choixPropose(e(c));
  };
  const filtres_ = filtrerComptes(liste, filtres);
  const duOnglet = (o: Onglet) => filtres_.filter((c) => o === "tous" || ongletDe(c, lundi) === o);
  // 0464 : un posteur « toujours montré » (demande d'arrêt, reporté 2 fois, Kill Saturday, No channel) est à traiter.
  const force = (c: CompteSemaine) => forcesDe(c.poster_id).length > 0 || Boolean(demandeCompte(c));
  const aTraiter = (c: CompteSemaine) => force(c) || e(c).statut === "rouge" || e(c).statut === "orange";
  const visibles = trierComptes(duOnglet(onglet), tri).sort((a, b) => Number(force(b)) - Number(force(a)) || ordreStatut(e(a), e(b)));
  const principaux = visibles.filter((c) => (tous ? force(c) || e(c).statut !== "vert" : aTraiter(c)));
  const confiance = visibles.filter((c) => e(c).statut === "vert" && !force(c));
  const posteursMontres = React.useMemo(() => new Set(liste.map((c) => c.poster_id)), [liste]);
  // 0469 : la conversation Upwork de chaque posteur (liste, toujours montrés).
  const conv = useConversations([...liste.map((c) => c.poster_id), ...[...(forces.data?.keys() ?? [])]]);
  const cover = couverture.data ? calculerCouverture(couverture.data, posteursMontres) : null;
  const jours = liste[0]?.jours.map((j) => j.jour) ?? [];
  const nbCol = jours.length + 8;
  const compteurs = {
    rouge: visibles.filter((c) => e(c).statut === "rouge").length,
    orange: visibles.filter((c) => e(c).statut === "orange").length,
    vert: confiance.length,
  };
  const aDecider = liste.filter((c) => !decisionSamedi(c));
  const nbChoix = (k: ChoixSamedi) => aDecider.filter((c) => choixDe(c) === k).length;
  const sansPaie = aDecider.filter((c) => choixDe(c) === "kill_np");
  const libelleRaison = (r: RaisonSansPaie) => t(`autoOnglets.decisions.liste.samedi.sansPaie.raisons.${r}`);
  // 0464 : un posteur toujours montré sans compte dans la liste : sa carte, Kill proposé.
  const forcesSansCompte = [...(forces.data?.entries() ?? [])]
    .filter(([p]) => !posteursMontres.has(p))
    .map(([p, f]) => ({ poster_id: p, forces: f, nom: couverture.data?.find((l) => l.poster_id === p)?.nom ?? null }));
  const [choixForces, setChoixForces] = React.useState<Record<string, "kill" | "rien">>({});
  const choixForceDe = (p: string) => choixForces[p] ?? "kill";

  const recap = () => {
    const parties = (["kill", "kill_np", "double", "recreate", "pause", "reporter"] as const)
      .map((k) => ({ k, n: nbChoix(k) }))
      .filter((p) => p.n > 0)
      .map((p) => `${p.n} ${t(`autoOnglets.decisions.liste.samedi.choix.${p.k}`)}`);
    const forcesKill = forcesSansCompte.filter((f) => choixForceDe(f.poster_id) === "kill").length;
    if (forcesKill) parties.push(`${forcesKill} ${t("autoOnglets.decisions.liste.samedi.recap.recrues")}`);
    return parties.length ? parties.join(", ") : t("autoOnglets.decisions.liste.samedi.recap.rien");
  };

  /** 0464 : Full stop sur Test : ce que ferait Validate, ligne par ligne ; rien n'est écrit. */
  const simuler = async () => {
    const kills = [
      ...aDecider.filter((c) => ["kill", "kill_np"].includes(choixDe(c)))
        .map((c) => ({ poster_id: c.poster_id, compte_id: c.compte_id, choix: choixDe(c) as "kill" | "kill_np" })),
      ...forcesSansCompte.filter((f) => choixForceDe(f.poster_id) === "kill").map((f) => ({ poster_id: f.poster_id, compte_id: null, choix: "kill" as const })),
    ];
    const autres = (["double", "recreate", "pause", "reporter"] as const)
      .map((k) => ({ k, n: nbChoix(k) }))
      .filter((p) => p.n > 0)
      .map((p) => `${p.n} ${t(`autoOnglets.decisions.liste.samedi.choix.${p.k}`)}`);
    setSimulation({ lignes: await simulerValidate(lundi, kills), autres });
    return { decides: 0, kills: 0, reports: 0, erreurs: [] as string[], simulation: true };
  };

  const valider = useMutation({
    mutationFn: async () => {
      if (modeArret.data === "test") return await simuler();
      setSimulation(null);
      const erreurs: string[] = [];
      let decides = 0;
      const montants = new Map<string, number | null>();
      for (const c of sansPaie) {
        const f = await qc.fetchQuery({ queryKey: ["samedi-fiche", c.poster_id, lundi], queryFn: () => lireFicheSamedi(c.poster_id, lundi) });
        montants.set(c.compte_id, f.semaine?.montant ?? null);
      }
      if (sansPaie.length > 0) {
        const total = [...montants.values()].reduce<number>((s, m) => s + Number(m ?? 0), 0);
        if (!window.confirm(t("autoOnglets.decisions.liste.samedi.sansPaie.confirm", { n: sansPaie.length, total }))) {
          return { decides: 0, kills: 0, reports: 0, erreurs: [t("autoOnglets.decisions.liste.samedi.sansPaie.annule")], simulation: false };
        }
      }
      for (const c of aDecider) {
        const k = choixDe(c);
        const etapes = planSamedi(c, k);
        try {
          for (const et of etapes) {
            if (et.op === "decider") await deciderCkd(et.id, et.decision, null);
            else await deciderCkd(await choisirSamedi(c.compte_id, et.action), et.action, null);
          }
          if (k === "kill_np") await noterKillSansPaie(c.poster_id, lundi, texteRaison(raisons[c.compte_id], libelleRaison), montants.get(c.compte_id) ?? null);
          if (k === "recreate") await recreerShadowban(c.compte_id);
          if (k === "pause") await noterPause(c.poster_id, 7, t("autoOnglets.decisions.liste.samedi.pauseRaison"));
          if (k === "reporter") await reporterRecrue(c.poster_id);
          if (etapes.length || ["recreate", "pause", "reporter"].includes(k)) decides++;
        } catch (err) {
          erreurs.push(`@${c.handle ?? "?"} : ${(err as Error).message}`);
        }
      }
      const forcesKill = forcesSansCompte.filter((x) => choixForceDe(x.poster_id) === "kill");
      for (const f of forcesKill) {
        try {
          await arreterRecrueSamedi(f.poster_id);
        } catch (err) {
          erreurs.push(`${f.nom ?? "?"} : ${(err as Error).message}`);
        }
      }
      // Décisions finales : une demande d'arrêt pas suivie d'un Kill est classée « garder » (les relances reprennent).
      const gardes = new Set(aDecider.filter((c) => demandeCompte(c) && !["kill", "kill_np"].includes(choixDe(c))).map((c) => c.poster_id));
      for (const p of gardes) {
        try {
          await garderMalgreDemande(p);
        } catch (err) {
          erreurs.push((err as Error).message);
        }
      }
      if (decides > 0 || forcesKill.length > 0) await invoke("upwork", { action: "arrets" }).catch(() => undefined);
      return { decides, kills: forcesKill.length, reports: 0, erreurs, simulation: false };
    },
    onSuccess: (r) => {
      if (r.simulation) {
        setBilan(t("autoOnglets.decisions.liste.samedi.simulation.bilan"));
        return;
      }
      setChoix({});
      setRaisons({});
      setBilan(t("autoOnglets.decisions.liste.samedi.bilan", r) + (r.erreurs.length ? ` · ${r.erreurs.join(" · ")}` : ""));
      for (const k of ["semaine-comptes", "semaine-extras", "demandes-arret", "ckd", "samedi-forces", "samedi-couverture"]) {
        void qc.invalidateQueries({ queryKey: [k] });
      }
    },
  });

  const exporter = () => {
    const lignes = visibles.map((c) => ({ c, e: e(c), choix: choixDe(c), phrase: e(c).signaux.map((s) => s.cle).join(" + ") || "ok" }));
    const blob = new Blob([csvMasterlist(lignes)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `masterlist_${lundi}_${onglet}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const ligne = (c: CompteSemaine) => {
    const ev = e(c);
    const ex = x(c);
    const prise = decisionSamedi(c);
    const k = choixDe(c);
    const np = !prise && k === "kill_np";
    const ouvert = ouverts[c.compte_id];
    const autre = AUTRES.includes(k);
    const contratUrl = ex?.contrat_id ? `https://www.upwork.com/nx/wm/workroom/${ex.contrat_id}/overview` : null;
    return (
      <React.Fragment key={c.compte_id}>
        <tr className={cn("border-b border-border/40", ev.statut === "rouge" && "bg-destructive/5")} data-compte={c.handle ?? c.compte_id}>
          <td className={TD}>
            <Choix
              valeur={autre ? "keep" : k}
              options={CHOIX}
              libelle={(o) => t(`autoOnglets.decisions.liste.samedi.choix.${o}`)}
              // Pas de contrat : Kill bloqué, sauf un posteur toujours montré (No channel…) : le Kill le désactive dans l'OS.
              desactives={[...(ex?.sans_contrat && !force(c) ? (["kill", "kill_np"] as const) : []), ...(ev.recrue ? (["double"] as const) : [])]}
              lecture={!admin || prise !== null}
              onChange={(o) => {
                setChoix((v) => ({ ...v, [c.compte_id]: o }));
                if (o === "repondre" && contratUrl) window.open(contratUrl, "_blank", "noopener");
              }}
            />
            <select
              className={cn("mt-1 block h-7 rounded-md border bg-background px-1 text-xs", autre && "border-primary")}
              aria-label={t("autoOnglets.decisions.liste.samedi.autre")}
              disabled={!admin || prise !== null}
              value={autre ? k : ""}
              onChange={(ev2) => setChoix((v) => ({ ...v, [c.compte_id]: (ev2.target.value || "keep") as ChoixSamedi }))}
            >
              <option value="">{t("autoOnglets.decisions.liste.samedi.autre")}</option>
              {AUTRES.map((o) => <option key={o} value={o}>{t(`autoOnglets.decisions.liste.samedi.choix.${o}`)}</option>)}
            </select>
            {prise && <p className="mt-1 text-[11px] text-muted-foreground">{t("autoOnglets.decisions.liste.samedi.dejaDecide")}</p>}
          </td>
          <td className={TD}>
            {demandeCompte(c) && !prise ? <BadgeDemande d={demandeCompte(c)!} /> : <StatutCompte e={ev} x={ex} />}
            {!prise && forcesDe(c.poster_id).some((f) => f.raison === "reporte_2" || f.raison === "sans_canal") && (
              <BadgesForces forces={forcesDe(c.poster_id).filter((f) => f.raison === "reporte_2" || f.raison === "sans_canal")} />
            )}
            {etats.data?.get(c.compte_id)?.kill_jeudi_at && (
              <p className="mt-1 max-w-56 text-[11px]" data-testid="kill-jeudi">
                {t("autoOnglets.decisions.liste.handle.killJeudi", {
                  date: new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Europe/Paris" }).format(new Date(etats.data.get(c.compte_id)!.kill_jeudi_at!)),
                  phrase: etats.data.get(c.compte_id)!.kill_jeudi_phrase ?? "—",
                })}
                {postsDepuisJeudi(c) > 0 && (
                  <Badge variant="warning" className="ml-1">{t("autoOnglets.decisions.liste.handle.postesDepuis", { n: postsDepuisJeudi(c) })}</Badge>
                )}
              </p>
            )}
          </td>
          <td className={TD}>
            <CelluleCompte c={c} />
            <BadgesPosteur e={ev} x={ex} />
            <LigneHandle compteId={c.compte_id} e={etats.data?.get(c.compte_id)} admin={admin} />
            <LienConversation className="mt-1" c={conversationDe(conv.data, { posteur: c.poster_id })} />
            <button
              type="button"
              className="mt-1 block text-[11px] text-primary underline"
              onClick={() => setOuverts((v) => ({ ...v, [c.compte_id]: v[c.compte_id] ? undefined : true }))}
            >
              {t(ouvert ? "autoOnglets.decisions.liste.samedi.fiche.masquer" : "autoOnglets.decisions.liste.samedi.fiche.voir")}
            </button>
          </td>
          {ev.recrue ? (
            <CellulesEtapes x={ex} colonnes={jours.length + 1} />
          ) : (
            <>
              <CellulesJours c={c} aujourdhui={jusqu} onJour={(j) => setOuverts((v) => ({ ...v, [c.compte_id]: j }))} />
              <td className={`${TD} text-right tabular-nums`}>{c.lien_total}/{attendusJusquIci(c)}</td>
            </>
          )}
          <td className={TD}>
            <CelluleVues c={c} />
          </td>
          <td className={`${TD} text-xs`}>
            {c.nudge_envoye_at ? <Badge variant="warning">{t("autoOnglets.decisions.liste.samedi.nudge")}</Badge> : <span className="text-muted-foreground">—</span>}
          </td>
          <CelluleContexte c={contexte.data?.get(c.poster_id)} maintenant={maintenant} />
          <CelluleAway c={contexte.data?.get(c.poster_id)} />
        </tr>
        {(np || ouvert) && (
          <tr className="border-b border-border/40 bg-muted/20" data-fiche={c.handle ?? c.compte_id}>
            <td className={TD} colSpan={nbCol}>
              <div className="space-y-2">
                {np && (
                  <RaisonSansPaieSaisie
                    posterId={c.poster_id}
                    lundi={lundi}
                    valeur={raisons[c.compte_id] ?? { code: "", detail: "" }}
                    onChange={(r) => setRaisons((v) => ({ ...v, [c.compte_id]: r }))}
                  />
                )}
                {ouvert && <FicheSamedi posterId={c.poster_id} lundi={lundi} jour={typeof ouvert === "string" ? ouvert : null} />}
              </div>
            </td>
          </tr>
        )}
      </React.Fragment>
    );
  };

  const entetes = (
    <thead>
      <tr className="border-b">
        <th className={TH}>{t("autoOnglets.decisions.liste.colonnes.choix")}</th>
        <th className={TH}>{t("autoOnglets.decisions.liste.colonnes.statut")}</th>
        <th className={TH}>{t("autoOnglets.decisions.liste.colonnes.compte")}</th>
        <EnTetesJours jours={jours} />
        <th className={`${TH} text-right`}>{t("autoOnglets.decisions.liste.colonnes.total")}</th>
        <th className={TH}>{t("autoOnglets.decisions.liste.colonnes.vues")}</th>
        <th className={TH}>{t("autoOnglets.decisions.liste.colonnes.jeudi")}</th>
        <th className={TH}>{t("autoOnglets.decisions.liste.contexte.titre")}</th>
        <th className={TH}>{t("autoOnglets.decisions.liste.contexte.awayTitre")}</th>
      </tr>
    </thead>
  );

  return (
    <div className="space-y-4">
      <Card data-testid="liste-samedi">
        <CardHeader>
          <CardTitle>{t("autoOnglets.decisions.liste.samedi.titre", { n: liste.length })}</CardTitle>
          <CardDescription>{t("autoOnglets.decisions.liste.samedi.aide")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {cover && <CompteurCouverture c={cover} />}
          {(couverture.error || forces.error) && <p className="text-sm text-destructive">{((couverture.error ?? forces.error) as Error).message}</p>}
          {lu.error && <p className="text-sm text-destructive">{(lu.error as Error).message}</p>}
          {extras.error && <p className="text-sm text-destructive">{(extras.error as Error).message}</p>}
          {lu.isPending && <p className="text-sm text-muted-foreground">{t("common.loading")}</p>}
          <div className="flex flex-wrap gap-1" role="tablist" data-testid="onglets-samedi">
            {ONGLETS.map((o) => (
              <Button key={o} size="sm" variant={onglet === o ? "default" : "outline"} role="tab" aria-selected={onglet === o} data-onglet={o} onClick={() => setOnglet(o)}>
                {t(`autoOnglets.decisions.liste.samedi.onglets.${o}`, { n: duOnglet(o).filter(aTraiter).length })}
              </Button>
            ))}
          </div>
          <p className="text-sm font-medium" data-testid="compteurs-statut">
            {t("autoOnglets.decisions.liste.statut.compteurs", compteurs)}
          </p>
          <BarreFiltres liste={liste} filtres={filtres} setFiltres={setFiltres} tri={tri} setTri={setTri} />
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setTous((v) => !v)} data-testid="tous-les-comptes">
              {tous ? t("autoOnglets.decisions.liste.samedi.aTraiterSeulement") : t("autoOnglets.decisions.liste.samedi.tousLesComptes", { n: visibles.length })}
            </Button>
            <Button size="sm" variant="ghost" onClick={exporter}>{t("autoOnglets.decisions.liste.samedi.csv")}</Button>
            {admin && (
              <Button size="sm" variant="ghost" loading={relire.isPending} onClick={() => relire.mutate()} data-testid="relire-upwork">
                {t("autoOnglets.decisions.liste.contexte.relire")}
              </Button>
            )}
            {relire.data && (
              <span className="text-xs text-muted-foreground">{t("autoOnglets.decisions.liste.contexte.relu", { n: relire.data.lus, erreurs: relire.data.erreurs })}</span>
            )}
            {(contexte.error || relire.error) && <span className="text-xs text-destructive">{((contexte.error ?? relire.error) as Error).message}</span>}
          </div>
          <div className="relative overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              {entetes}
              <tbody>{principaux.map(ligne)}</tbody>
            </table>
            {principaux.length === 0 && <p className="py-3 text-sm text-muted-foreground">{t("autoOnglets.decisions.liste.samedi.rienATraiter")}</p>}
          </div>
          {confiance.length > 0 && (
            <details className="rounded-md border" data-testid="section-confiance">
              <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
                {t("autoOnglets.decisions.liste.samedi.confiance", { n: confiance.length })}
              </summary>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  {entetes}
                  <tbody>{confiance.map(ligne)}</tbody>
                </table>
              </div>
            </details>
          )}
        </CardContent>
      </Card>

      {forcesSansCompte.length > 0 && (
        <Card data-testid="forces-sans-compte">
          <CardHeader>
            <CardTitle className="text-base">{t("autoOnglets.decisions.liste.samedi.forces.titre", { n: forcesSansCompte.length })}</CardTitle>
            <CardDescription>{t("autoOnglets.decisions.liste.samedi.forces.aide")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y rounded-md border text-sm">
              {forcesSansCompte.map((f) => (
                <li key={f.poster_id} className="flex flex-wrap items-center gap-3 p-2" data-force-poster={f.poster_id}>
                  <Choix
                    valeur={choixForceDe(f.poster_id)}
                    options={["kill", "rien"] as const}
                    libelle={(o) => t(`autoOnglets.decisions.liste.recrues.choix.${o}`)}
                    lecture={!admin}
                    onChange={(o) => setChoixForces((v) => ({ ...v, [f.poster_id]: o }))}
                  />
                  <span className="font-medium">{f.nom ?? "—"}</span>
                  <BadgesForces forces={f.forces} />
                  <LienConversation c={conversationDe(conv.data, { posteur: f.poster_id })} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <ContratsSansPosteur admin={admin} />

      {simulation && <ResultatSimulation lignes={simulation.lignes} autres={simulation.autres} />}

      <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t bg-background py-3">
        {modeArret.data === "test" && (
          <Badge variant="warning" data-testid="validate-test">{t("autoOnglets.decisions.liste.samedi.simulation.bandeau")}</Badge>
        )}
        <Badge variant="info" data-testid="recap-samedi">{t("autoOnglets.decisions.liste.samedi.recap.titre", { recap: recap() })}</Badge>
        {admin && sansPaie.some((c) => !raisonComplete(raisons[c.compte_id])) && (
          <span className="text-xs text-destructive">{t("autoOnglets.decisions.liste.samedi.sansPaie.manque")}</span>
        )}
        {admin && (
          <Button
            data-action="valider-samedi"
            loading={valider.isPending}
            disabled={sansPaie.some((c) => !raisonComplete(raisons[c.compte_id]))}
            onClick={() => {
              if (modeArret.data === "test" || window.confirm(t("autoOnglets.decisions.liste.samedi.recap.confirm", { recap: recap() }))) valider.mutate();
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
