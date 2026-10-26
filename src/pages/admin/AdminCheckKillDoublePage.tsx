import * as React from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Check, ChevronRight, ExternalLink, EyeOff, List, RefreshCw, Send, Users } from "lucide-react";

import { LogoApplication } from "@/components/brand/LogoApplication";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle, EmptyState } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MICRO_LABEL } from "@/components/ui/micro-label";
import { StatGroup, StatTile } from "@/components/ui/stat";
import {
  type ActionCkd,
  annulerCkd,
  apercuHmCkd,
  apercuNudgeCkd,
  type ArretCkd,
  type ControleCkd,
  deciderCkd,
  enregistrerCanalSlack,
  enregistrerSlackHm,
  enregistrerTextesNudges,
  envoyerAuxHm,
  envoyerNudgesCkd,
  type ChiffresCkd,
  type DecisionCkd,
  type HistoriqueCkd,
  listerHistorique,
  type HmCkd,
  type LabelCkd,
  lancerControle,
  lireCanalSlack,
  lireTextesNudges,
  listerArrets,
  listerHandles,
  listerManques,
  type ManqueCkd,
  MOTIFS_NUDGE,
  type TextesNudges,
  verifierSlackCkd,
  lirePartBonsPosts,
  listerControles,
  listerHms,
  listerJournal,
  listerLabels,
  listerPersonnes,
  listerPropositions,
  listerReglages,
  type PersonneCkd,
  type PropositionCkd,
  type PersonnalisationNudge,
  type ReglageCkd,
  reglerCkd,
  type TexteNudge,
  type TypeControle,
} from "@/features/ckd/api";
import {
  aEnvoyer,
  annulable,
  boutonDeLaDecision,
  BOUTONS_PAR_REGLE,
  compterActions,
  creeUnCompte,
  DECISION_DU_BOUTON,
  enRetard,
  resumerHistorique,
  type ResumeDecision,
  type Tendance,
  tendanceDecision,
  defReglage,
  type DefReglage,
  exceptionsLabel,
  formaterValeur,
  grouperParHm,
  lienTiktok,
  lireSaisie,
  ORDRE_ACTIONS,
  pourcentage,
  REGLAGES,
  reglageDuNiveau,
  valeurEffective,
  valeurEnSaisie,
} from "@/features/ckd/logique";
import { VueCohorte } from "@/features/ckd/cohorte/VueCohorte";
import { DiagnosticCompte } from "@/features/ckd/DiagnosticCompte";
import { VueShadowban } from "@/features/ckd/shadowban/VueShadowban";
import { drapeauPays, nomPaysIso } from "@/features/moteur/pays";
import { Aide, BarreRepartition } from "@/features/moteur/repartition/graphes";
import { cn } from "@/lib/utils";
import { localeDate } from "@/locales/localeDate";

const CLE = ["ckd"] as const;

const selectClass =
  "h-8 max-w-full rounded-md border border-input bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-60";

/** Les tableaux de la page Allocation : en-têtes en petites capitales, lignes fines. */
const TH = "pb-2 pr-4 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground last:pr-0";
const TD = "py-2 pr-4 align-top last:pr-0";
const LIGNE = "border-b border-border/40";

/** La pastille de chaque action. La couleur dit le sens (kill, doubler…), le texte reste neutre. */
const POINT_ACTION: Record<ActionCkd, string> = {
  ne_pas_renouveler: "bg-destructive",
  recreer: "bg-warning",
  doubler: "bg-success",
  nudge: "bg-info",
};

const ONGLETS = ["samedi", "jeudi", "historique", "reglages"] as const;
type Onglet = (typeof ONGLETS)[number];

/** La semaine du contrôle, dans l'ordre : ce qui tourne, qui décide, quand ça part. */
const ETAPES = ["jeudi", "samedi", "decision", "envoi"] as const;

function messageErreur(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

function nomPersonne(p: PersonneCkd | undefined): string {
  if (!p) return "";
  return [p.prenom, p.nom].filter(Boolean).join(" ").trim();
}

function useDate() {
  const { i18n } = useTranslation();
  return React.useCallback(
    (iso: string | null | undefined, options: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit" }) => {
      if (!iso) return "";
      // Une date seule (« 2026-10-24 ») est une date de Paris : midi évite tout décalage.
      const d = iso.length === 10 ? new Date(`${iso}T12:00:00Z`) : new Date(iso);
      return new Intl.DateTimeFormat(localeDate(i18n.language), { timeZone: "Europe/Paris", ...options }).format(d);
    },
    [i18n.language],
  );
}

/** Les comptes d'une cohorte et le jour de son contrôle : la vue cohorte ne montre qu'eux (0356). */
interface FiltreCohorte {
  jour: string;
  comptes: ReadonlySet<string>;
}

/**
 * Admin → Check, Kill or Double (PROMPT 5, migration 0326). Le jeudi 6 h, les
 * nudges proposés aux comptes dans leur première semaine ; le samedi 6 h, les
 * comptes à tuer (recréer, ne pas renouveler) et les posteurs à doubler. L'admin
 * décide ligne par ligne (0328) ; les décisions partent aux HMs dans
 * #managers-hq (bouton, ou tout seul le dimanche à 12 h).
 *
 * Deux vues (0356) : « Suivi cohorte », la paire de cohortes de nouveaux
 * posteurs (celle qui poste, celle en warm-up), et « Suivi global », la page
 * telle qu'elle était, pour toutes les cohortes. `?vue=global` ouvre la seconde.
 */
export function AdminCheckKillDoublePage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const brut = params.get("vue");
  const vue: Vue = brut === "global" || brut === "shadowban" ? brut : "cohorte";
  const choisirVue = (v: Vue) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        if (v === "cohorte") n.delete("vue");
        else n.set("vue", v);
        return n;
      },
      { replace: true },
    );
  const [onglet, setOnglet] = React.useState<Onglet>("samedi");

  return (
    <div className="space-y-6" data-testid="page-ckd">
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2">
            {t("ckd.titre")}
            <Aide libelle={t("ckd.titre")}>
              <ul className="list-disc space-y-1 pl-4">
                <li>{t("ckd.calendrierJeudi")}</li>
                <li>{t("ckd.calendrierSamedi")}</li>
                <li>{t("ckd.calendrierVues")}</li>
              </ul>
              <p className="mt-1.5">{t("ckd.circuit")}</p>
            </Aide>
          </span>
        }
        description={t("ckd.description")}
        actions={<ChoixVue vue={vue} onChange={choisirVue} />}
      />

      {vue === "shadowban" ? (
        <VueShadowban />
      ) : vue === "cohorte" ? (
        <VueCohorte
          ouvrirGlobal={() => choisirVue("global")}
          rendreControle={(type, jour, comptes) => (
            <VueControles key={`${type}-${jour}`} type={type} cohorte={{ jour, comptes }} />
          )}
        />
      ) : (
        <>
          <Semaine />

          <Onglets actif={onglet} onChange={setOnglet} />

          <div id="panneau-ckd" role="tabpanel" aria-labelledby={`onglet-ckd-${onglet}`}>
            {onglet === "reglages" ? (
              <VueReglages />
            ) : onglet === "historique" ? (
              <VueHistorique />
            ) : (
              <VueControles key={onglet} type={onglet} />
            )}
          </div>
        </>
      )}
    </div>
  );
}

type Vue = "cohorte" | "global" | "shadowban";

/** Suivi cohorte, suivi global ou Shadowban : des boutons collés, celui de la vue affichée en avant. */
function ChoixVue({ vue, onChange }: { vue: Vue; onChange: (v: Vue) => void }) {
  const { t } = useTranslation();
  return (
    <div role="group" aria-label={t("ckd.cohorte.vues.aria")} className="inline-flex rounded-lg border bg-muted/40 p-1">
      {(
        [
          { v: "cohorte", icone: <Users className="size-4" aria-hidden /> },
          { v: "global", icone: <List className="size-4" aria-hidden /> },
          { v: "shadowban", icone: <EyeOff className="size-4" aria-hidden /> },
        ] as const
      ).map(({ v, icone }) => (
        <button
          key={v}
          type="button"
          aria-pressed={vue === v}
          onClick={() => onChange(v)}
          className={cn(
            "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors",
            "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
            vue === v ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {icone}
          {t(`ckd.cohorte.vues.${v}`)}
        </button>
      ))}
    </div>
  );
}

/** Les quatre temps de la semaine, en une bande : remplace le pavé d'explications. */
function Semaine() {
  const { t } = useTranslation();
  return (
    <ol className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border bg-border/70 sm:grid-cols-2 lg:grid-cols-4">
      {ETAPES.map((e) => (
        <li key={e} className="min-w-0 bg-card px-4 py-3">
          <p className={MICRO_LABEL}>{t(`ckd.semaine.${e}Quand`)}</p>
          <p className="mt-0.5 text-sm font-medium">{t(`ckd.semaine.${e}`)}</p>
          <p className="text-xs text-muted-foreground">{t(`ckd.semaine.${e}Detail`)}</p>
        </li>
      ))}
    </ol>
  );
}

/** Les onglets de la page Allocation : flèches, Début et Fin pour passer de l'un à l'autre. */
function Onglets({ actif, onChange }: { actif: Onglet; onChange: (o: Onglet) => void }) {
  const { t } = useTranslation();
  return (
    <div
      role="tablist"
      aria-label={t("ckd.ongletsAria")}
      className="inline-flex w-fit max-w-full flex-wrap gap-1 rounded-lg border bg-muted/40 p-1"
      onKeyDown={(ev) => {
        const i = ONGLETS.indexOf(actif);
        const n = ONGLETS.length;
        const vers =
          ev.key === "ArrowRight" ? (i + 1) % n
          : ev.key === "ArrowLeft" ? (i - 1 + n) % n
          : ev.key === "Home" ? 0
          : ev.key === "End" ? n - 1
          : -1;
        if (vers < 0) return;
        ev.preventDefault();
        onChange(ONGLETS[vers]!);
        document.getElementById(`onglet-ckd-${ONGLETS[vers]}`)?.focus();
      }}
    >
      {ONGLETS.map((o) => (
        <button
          key={o}
          id={`onglet-ckd-${o}`}
          type="button"
          role="tab"
          aria-selected={o === actif}
          aria-controls="panneau-ckd"
          tabIndex={o === actif ? 0 : -1}
          onClick={() => onChange(o)}
          className={cn(
            "rounded-md px-2.5 py-1 text-sm transition-colors",
            o === actif ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t(`ckd.onglets.${o}`)}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Propositions (samedi) et nudges (jeudi)
// ---------------------------------------------------------------------------

/**
 * Les propositions d'un contrôle. Avec `cohorte` (vue cohorte, 0356) : le
 * contrôle de ce jour-là seulement, réduit aux comptes de la cohorte, sans les
 * boutons qui agissent sur tout le contrôle (recalcul, envois aux HM).
 */
function VueControles({ type, cohorte }: { type: TypeControle; cohorte?: FiltreCohorte }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const date = useDate();

  const controles = useQuery({ queryKey: [...CLE, "controles"], queryFn: listerControles });
  const duType = React.useMemo(
    () => (controles.data ?? []).filter((c) => c.type === type),
    [controles.data, type],
  );
  const [choisi, setChoisi] = React.useState<string | null>(null);
  const controle: ControleCkd | undefined = cohorte
    ? duType.find((c) => c.jour === cohorte.jour)
    : (duType.find((c) => c.id === choisi) ?? duType[0]);

  const propositions = useQuery({
    queryKey: [...CLE, "propositions", controle?.id],
    queryFn: () => listerPropositions(controle!.id),
    enabled: Boolean(controle),
  });
  // Le samedi, les posts manqués de la semaine (pour info, sous les propositions).
  const manquesBruts = useQuery({
    queryKey: [...CLE, "manques", controle?.jour],
    queryFn: () => listerManques(controle!.jour),
    enabled: type === "samedi" && Boolean(controle),
  });
  const manques = {
    data: cohorte ? manquesBruts.data?.filter((m) => cohorte.comptes.has(m.compte_id)) : manquesBruts.data,
  };
  const ids = React.useMemo(() => {
    const s = new Set<string>();
    for (const p of [...(propositions.data ?? []), ...(manques.data ?? [])]) {
      s.add(p.poster_id);
      if (p.hm_id) s.add(p.hm_id);
    }
    for (const p of propositions.data ?? []) if (p.decision_par) s.add(p.decision_par);
    return [...s].sort();
  }, [propositions.data, manques.data]);
  const comptesIds = React.useMemo(
    () => [...new Set((propositions.data ?? []).map((p) => p.compte_id))].sort(),
    [propositions.data],
  );
  const nouveauxIds = React.useMemo(
    () => (propositions.data ?? []).map((p) => p.nouveau_compte_id).filter(Boolean).sort() as string[],
    [propositions.data],
  );
  const arrets = useQuery({
    queryKey: [...CLE, "arrets", comptesIds],
    queryFn: () => listerArrets(comptesIds),
    enabled: comptesIds.length > 0,
  });
  const nouveaux = useQuery({
    queryKey: [...CLE, "nouveaux", nouveauxIds],
    queryFn: () => listerHandles(nouveauxIds),
    enabled: nouveauxIds.length > 0,
  });
  const personnes = useQuery({
    queryKey: [...CLE, "personnes", ids],
    queryFn: () => listerPersonnes(ids),
    enabled: ids.length > 0,
  });
  const labels = useQuery({ queryKey: [...CLE, "labels"], queryFn: listerLabels });

  const recalculer = useMutation({
    mutationFn: () => lancerControle(type, controle?.jour),
    onSettled: () => queryClient.invalidateQueries({ queryKey: CLE }),
  });
  const envoyerNudges = useMutation({
    mutationFn: () => envoyerNudgesCkd(controle!.id),
    onSettled: () => queryClient.invalidateQueries({ queryKey: CLE }),
  });
  const envoyerHm = useMutation({
    mutationFn: () => envoyerAuxHm(controle!.id),
    onSettled: () => queryClient.invalidateQueries({ queryKey: CLE }),
  });

  const parId = React.useMemo(
    () => new Map((personnes.data ?? []).map((p) => [p.id, p] as const)),
    [personnes.data],
  );
  const labelParId = React.useMemo(
    () => new Map((labels.data ?? []).map((l) => [l.id, l] as const)),
    [labels.data],
  );
  const arretDe = React.useMemo(
    () => new Map((arrets.data ?? []).map((a) => [a.compte_id, a] as const)),
    [arrets.data],
  );
  const handleDe = React.useMemo(
    () => new Map((nouveaux.data ?? []).map((c) => [c.id, c.handle_tiktok] as const)),
    [nouveaux.data],
  );
  const toutes = propositions.data ?? [];
  const liste = cohorte ? toutes.filter((p) => cohorte.comptes.has(p.compte_id)) : toutes;
  const groupes = grouperParHm(liste);
  const nudgesEnAttente = liste.filter((p) => p.action === "nudge" && !p.decision).length;
  const prets = liste.filter(aEnvoyer).length;
  const erreur = controles.error ?? propositions.error ?? recalculer.error ?? envoyerNudges.error ?? envoyerHm.error;

  return (
    <div className="space-y-5" data-testid={`vue-${type}`}>
      {cohorte ? (
        controle && (
          <p className="text-xs text-muted-foreground" data-testid="barre-cohorte">
            {t("ckd.calculeLe", { date: date(controle.lance_at, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) })}
            {" · "}
            {t("ckd.cohorte.focus.envoiGlobal")}
          </p>
        )
      ) : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2" data-testid="barre-envoi">
          {duType.length > 0 && (
            <select
              className={selectClass}
              aria-label={t("ckd.controle")}
              value={controle?.id ?? ""}
              onChange={(e) => setChoisi(e.target.value)}
            >
              {duType.map((c) => (
                <option key={c.id} value={c.id}>
                  {t("ckd.controleDu", { date: date(c.jour, { weekday: "long", day: "numeric", month: "long" }) })}
                </option>
              ))}
            </select>
          )}
          {controle && (
            <span className="text-xs text-muted-foreground">
              {t("ckd.calculeLe", { date: date(controle.lance_at, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) })}
            </span>
          )}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" loading={recalculer.isPending} onClick={() => recalculer.mutate()}>
              <RefreshCw />
              {controle ? t("ckd.recalculer") : t("ckd.calculer")}
            </Button>
            {controle && liste.length > 0 && type === "jeudi" && nudgesEnAttente > 0 && (
              <Button
                size="sm"
                variant="outline"
                loading={envoyerNudges.isPending}
                onClick={() => {
                  if (window.confirm(t("ckd.confirmNudges", { n: nudgesEnAttente }))) envoyerNudges.mutate();
                }}
              >
                {t("ckd.envoyerNudges", { n: nudgesEnAttente })}
              </Button>
            )}
            {controle && liste.length > 0 && (
              <Button
                size="sm"
                disabled={prets === 0}
                loading={envoyerHm.isPending}
                onClick={() => {
                  if (window.confirm(t("ckd.confirmEnvoiHm", { n: prets }))) envoyerHm.mutate();
                }}
              >
                <Send />
                {t("ckd.envoyerHm", { n: prets })}
              </Button>
            )}
          </div>
        </div>
      )}

      {erreur && (
        <p role="alert" className="text-sm text-destructive">
          {messageErreur(erreur)}
        </p>
      )}
      {controle?.slack_erreur && (
        <p role="alert" className="text-sm text-destructive">
          {t("ckd.erreurSlack", { erreur: controle.slack_erreur })}
        </p>
      )}
      {envoyerHm.data && (
        <p role="status" className="text-sm text-muted-foreground">
          {t("ckd.envoyees", { n: envoyerHm.data.envoyees })}
        </p>
      )}

      {controles.isPending ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : !controle ? (
        <EmptyState title={t(cohorte ? `ckd.cohorte.focus.pasDeControle.${type}` : `ckd.aucunControle.${type}`)} />
      ) : liste.length === 0 ? (
        propositions.isPending ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : (
          <EmptyState title={t(cohorte ? `ckd.cohorte.focus.vide.${type}` : `ckd.vide.${type}`)} />
        )
      ) : (
        <>
          <ChiffresControle type={type} controle={controle} liste={liste} />
          {groupes.map((g) => {
            const hm = g.hmId ? parId.get(g.hmId) : undefined;
            return (
              <Card key={g.hmId ?? "sans-hm"} data-testid={`groupe-hm-${g.hmId ?? "aucun"}`}>
                <CardHeader>
                  <CardTitle className="text-base">{hm ? nomPersonne(hm) : t("ckd.sansHm")}</CardTitle>
                  <CardDescription>
                    {[hm?.zone_recrutement, t("ckd.comptes", { count: g.propositions.length })].filter(Boolean).join(" · ")}
                  </CardDescription>
                </CardHeader>
                <CardContent className="divide-y divide-border/60">
                  {g.propositions.map((p) => (
                    <LigneProposition
                      key={p.id}
                      p={p}
                      type={type}
                      poster={parId.get(p.poster_id)}
                      label={p.label_id ? labelParId.get(p.label_id) : undefined}
                      decideur={p.decision_par ? parId.get(p.decision_par) : undefined}
                      arret={arretDe.get(p.compte_id)}
                      nouveauHandle={p.nouveau_compte_id ? handleDe.get(p.nouveau_compte_id) ?? null : null}
                    />
                  ))}
                </CardContent>
              </Card>
            );
          })}
          {type === "samedi" && (
            <CarteManques manques={manques.data ?? []} propositions={liste} parId={parId} />
          )}
        </>
      )}
    </div>
  );
}

/**
 * Où en est le contrôle, en quatre chiffres : ce qui est proposé, ce qui
 * attend une décision (en rouge une fois le dimanche midi passé), ce qui est
 * prêt à partir aux HMs, et ce qui est déjà parti.
 */
function ChiffresControle({ type, controle, liste }: { type: TypeControle; controle: ControleCkd; liste: PropositionCkd[] }) {
  const { t } = useTranslation();
  const date = useDate();
  const compte = compterActions(liste);
  const sansDecision = liste.filter((p) => !p.decision).length;
  const retards = liste.filter((p) => enRetard(p, type)).length;
  const prets = liste.filter(aEnvoyer).length;
  const envoyees = liste.filter((p) => p.envoye_at).length;
  const attenteCompte = liste.filter(
    (p) => p.decision && creeUnCompte(p.decision) && !p.nouveau_compte_id && !p.envoye_at,
  ).length;

  // Le samedi, les propositions par action ; le jeudi, tout est nudge : on compte les motifs.
  let repartition: string;
  if (type === "jeudi") {
    const motifs = new Map<string, number>();
    for (const p of liste) for (const m of p.donnees.motifs) motifs.set(m, (motifs.get(m) ?? 0) + 1);
    repartition = [...motifs.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([m, n]) => `${n} ${t(`ckd.motifs.${m}`)}`)
      .join(" · ");
  } else {
    repartition = ORDRE_ACTIONS.filter((a) => compte[a] > 0)
      .map((a) => `${compte[a]} ${t(`ckd.actionsCourtes.${a}`)}`)
      .join(" · ");
  }

  const heure = { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" } as const;
  return (
    <div data-testid="chiffres-ckd">
      <StatGroup>
        <StatTile
          label={t(type === "jeudi" ? "ckd.chiffres.nudges" : "ckd.chiffres.propositions")}
          value={liste.length}
          detail={repartition || undefined}
        />
        <StatTile
          label={t("ckd.chiffres.sansDecision")}
          value={sansDecision}
          tone={retards > 0 ? "alerte" : "neutre"}
          detail={
            retards > 0
              ? t("ckd.enRetard", { n: retards })
              : sansDecision === 0
                ? undefined
                : type === "samedi"
                  ? t("ckd.chiffres.avantDimanche")
                  : t("ckd.chiffres.nudgesDUnCoup")
          }
        />
        <StatTile
          label={t("ckd.chiffres.aEnvoyer")}
          value={prets}
          detail={
            attenteCompte > 0
              ? t("ckd.chiffres.attenteCompte", { n: attenteCompte })
              : prets === 0
                ? undefined
                : type === "samedi"
                  ? t("ckd.chiffres.partentSeules")
                  : t("ckd.chiffres.auClic")
          }
        />
        <StatTile
          label={t("ckd.chiffres.envoyees")}
          value={envoyees}
          detail={
            controle.rappel_at
              ? t("ckd.rappelEnvoye", { date: date(controle.rappel_at, heure) })
              : controle.slack_ts
                ? t("ckd.recapPoste")
                : envoyees === 0
                  ? t("ckd.chiffres.rien")
                  : undefined
          }
        />
      </StatGroup>
    </div>
  );
}

/**
 * Les comptes qui ont manqué des posts cette semaine sans sortir en Absent :
 * pour info (la discipline se règle avec le HM), groupés par HM.
 */
function CarteManques({
  manques,
  propositions,
  parId,
}: {
  manques: ManqueCkd[];
  propositions: PropositionCkd[];
  parId: Map<string, PersonneCkd>;
}) {
  const { t } = useTranslation();
  const date = useDate();
  const absents = new Set(propositions.filter((p) => p.regle === "absent").map((p) => p.compte_id));
  const lignes = manques
    .filter((m) => !absents.has(m.compte_id))
    .sort(
      (a, b) =>
        b.prevus - b.publies - (a.prevus - a.publies) || (a.handle ?? "").localeCompare(b.handle ?? ""),
    );
  if (lignes.length === 0) return null;
  return (
    <Card data-testid="carte-manques">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {t("ckd.manques.titre", { n: lignes.length })}
          <Aide libelle={t("ckd.manques.titre", { n: lignes.length })}>{t("ckd.manques.aide")}</Aide>
        </CardTitle>
        <CardDescription>{t("ckd.aidesCourtes.manques")}</CardDescription>
      </CardHeader>
      <CardContent className="relative overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b">
              <th className={TH}>{t("ckd.manques.compte")}</th>
              <th className={TH}>{t("ckd.hm")}</th>
              <th className={cn(TH, "text-right")}>{t("ckd.manques.publies")}</th>
              <th className={cn(TH, "hidden w-32 sm:table-cell")}>
                <span className="sr-only">{t("ckd.manques.publies")}</span>
              </th>
              <th className={TH}>{t("ckd.manques.jours")}</th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((m) => (
              <tr key={m.compte_id} className={LIGNE} data-testid={`manque-${m.handle}`}>
                <td className={TD}>
                  <Link to={`/admin/createurs/${m.compte_id}`} className="whitespace-nowrap underline-offset-2 hover:underline">
                    {drapeauPays(m.pays)} @{m.handle}
                  </Link>
                </td>
                <td className={cn(TD, "whitespace-nowrap text-muted-foreground")}>
                  {m.hm_id ? nomPersonne(parId.get(m.hm_id)) : t("ckd.sansHm")}
                </td>
                <td className={cn(TD, "text-right tabular-nums")}>
                  {m.publies}/{m.prevus}
                </td>
                <td className={cn(TD, "hidden sm:table-cell")}>
                  <PartPubliee publies={m.publies} prevus={m.prevus} />
                </td>
                <td className={cn(TD, "text-xs text-muted-foreground")}>{m.jours.map((j) => date(j)).join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

/** Publiés sur prévus : la barre pleine, c'est tout publié ; le vide, ce qui manque. */
function PartPubliee({ publies, prevus }: { publies: number; prevus: number }) {
  const part = prevus > 0 ? Math.min(1, publies / prevus) : 0;
  return (
    <div className="mt-1.5 h-2 w-full rounded-[3px] bg-muted" aria-hidden>
      <div
        className={cn("h-full rounded-r-[4px]", part < 0.8 ? "bg-warning" : "bg-foreground/70")}
        style={{ width: `${part * 100}%` }}
      />
    </div>
  );
}

function LienPost({ post }: { post: { vues: number; url: string; jour: string } | null }) {
  const date = useDate();
  if (!post) return <span className="text-muted-foreground">—</span>;
  return (
    <a href={post.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline-offset-2 hover:underline">
      <span className="tabular-nums">{post.vues.toLocaleString()}</span>
      <span className="font-normal text-muted-foreground">({date(post.jour)})</span>
      <ExternalLink className="size-3 text-muted-foreground" />
    </a>
  );
}

function PastilleAction({ action }: { action: ActionCkd }) {
  const { t } = useTranslation();
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium">
      <span className={cn("size-1.5 rounded-full", POINT_ACTION[action])} aria-hidden />
      {t(`ckd.actions.${action}`)}
    </span>
  );
}

/** Un chiffre de la proposition : intitulé en petites capitales, la valeur, une ligne de détail. */
function Mesure({
  label,
  children,
  detail,
  ton,
}: {
  label: string;
  children: React.ReactNode;
  detail?: React.ReactNode;
  ton?: "alerte" | "attention";
}) {
  return (
    <div className="min-w-0">
      <dt className={MICRO_LABEL}>{label}</dt>
      <dd
        className={cn(
          "mt-0.5 text-sm font-medium tabular-nums",
          ton === "alerte" && "text-destructive",
          ton === "attention" && "text-warning-foreground",
        )}
      >
        {children}
      </dd>
      {detail ? <dd className="text-xs text-muted-foreground">{detail}</dd> : null}
    </div>
  );
}

/**
 * La médiane du compte face à celle de référence (le trait). En rouge quand
 * c'est elle qui fait proposer le compte : un compte ancien sous la part de la
 * médiane du pays.
 */
function BarreMediane({ valeur, reference, alerte }: { valeur: number; reference: number; alerte: boolean }) {
  const max = Math.max(reference * 1.25, valeur, 1);
  return (
    <div className="relative mt-1.5 h-1.5 w-full max-w-36 rounded-[3px] bg-muted" aria-hidden>
      <div
        className={cn("h-full rounded-r-[4px]", alerte ? "bg-destructive" : "bg-foreground/70")}
        style={{ width: `${(100 * valeur) / max}%` }}
      />
      <div className="absolute -top-0.5 h-[calc(100%+0.25rem)] w-px bg-foreground/60" style={{ left: `${(100 * reference) / max}%` }} />
    </div>
  );
}

function LigneProposition({
  p,
  type,
  poster,
  label,
  decideur,
  arret,
  nouveauHandle,
}: {
  p: PropositionCkd;
  type: TypeControle;
  poster?: PersonneCkd;
  label?: LabelCkd;
  decideur?: PersonneCkd;
  arret?: ArretCkd;
  nouveauHandle: string | null;
}) {
  const { t } = useTranslation();
  const date = useDate();
  const d = p.donnees;
  const per = d.periode;
  const tiktok = lienTiktok(d.handle);
  const manques = per.attendus - per.publies;
  const reference = d.mediane_ref.valeur ?? 0;
  const mediane = typeof per.mediane === "number" ? per.mediane : null;
  const part = d.reglages.part_mediane_pays?.v;
  const sousLaPart = p.regle === "anciens" && typeof part === "number" && mediane !== null && mediane < reference * part;

  // Qui poste, où, pour quelle appli, sur quel label : une ligne, l'appli par son logo.
  const contexte: React.ReactNode[] = [];
  if (nomPersonne(poster)) contexte.push(nomPersonne(poster));
  if (p.pays) contexte.push(nomPaysIso(p.pays));
  if (p.application) contexte.push(<LogoApplication key="app" slug={p.application} taille="xs" />);
  if (label) contexte.push(<span key="label" className="font-mono">{label.nom}</span>);

  return (
    <div className="space-y-3 py-4 first:pt-0 last:pb-0" data-testid={`proposition-${d.handle}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <PastilleAction action={p.action} />
        <Link
          to={`/admin/createurs/${p.compte_id}`}
          title={t("ckd.ficheCompte")}
          className="font-medium underline-offset-2 hover:underline"
        >
          {drapeauPays(p.pays)} @{d.handle}
        </Link>
        {tiktok && (
          <a
            href={tiktok}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-0.5 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            TikTok <ExternalLink className="size-3" />
          </a>
        )}
        <span className="inline-flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
          {contexte.map((c, i) => (
            <React.Fragment key={i}>
              {i > 0 && <span aria-hidden>·</span>}
              {c}
            </React.Fragment>
          ))}
        </span>
        {d.abonnes !== null && d.abonnes !== undefined && (
          <span className="text-xs tabular-nums text-muted-foreground">{t("ckd.abonnes", { n: d.abonnes.toLocaleString() })}</span>
        )}
      </div>

      <DiagnosticCompte diagnostic={p.diagnostic} />

      <p className="text-sm">
        {t(`ckd.regles.${p.regle}`)}
        {d.motifs.length > 0 && (
          <span className="ml-2 inline-flex flex-wrap gap-1 align-middle">
            {d.motifs.map((m) => (
              <span key={m} className="rounded-full border px-1.5 py-px text-[11px] text-muted-foreground">
                {t(`ckd.motifs.${m}`)}
              </span>
            ))}
          </span>
        )}
      </p>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
        <Mesure label={t("ckd.mesures.periode")}>{t("ckd.periodeValeur", { du: date(per.du), au: date(per.au) })}</Mesure>
        <Mesure
          label={t("ckd.mesures.publies")}
          ton={manques > 0 ? "attention" : undefined}
          detail={[
            t("ckd.mesures.releves", { n: per.mesures }),
            per.liens_manquants.length > 0
              ? t("ckd.liensManquants", { jours: per.liens_manquants.map((l) => date(l.jour)).join(", ") })
              : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        >
          {per.publies}/{per.attendus}
        </Mesure>
        <Mesure
          label={t("ckd.mesures.mediane")}
          ton={sousLaPart ? "alerte" : undefined}
          detail={t("ckd.medianeRef", {
            valeur: reference.toLocaleString(),
            source: t(`ckd.sourcesMediane.${d.mediane_ref.source}`),
            n: d.mediane_ref.n_comptes,
          })}
        >
          {mediane !== null ? mediane.toLocaleString() : "—"}
          {mediane !== null && reference > 0 && <BarreMediane valeur={mediane} reference={reference} alerte={sousLaPart} />}
        </Mesure>
        <Mesure
          label={t("ckd.mesures.meilleur")}
          detail={
            <span className="inline-flex flex-wrap items-center gap-1">
              {t("ckd.mesures.plusBas")} <LienPost post={per.bas} />
            </span>
          }
        >
          <LienPost post={per.haut} />
        </Mesure>
        <Mesure
          label={t("ckd.mesures.bonsMorts")}
          detail={t("ckd.mesures.seuil", {
            n: d.seuil_bon_post.valeur.toLocaleString(),
            source: t(`ckd.sources.${d.seuil_bon_post.source}`),
          })}
        >
          {per.bons} / {per.morts}
        </Mesure>
      </dl>

      <details className="group text-xs text-muted-foreground">
        <summary className="inline-flex cursor-pointer list-none items-center gap-1 select-none hover:text-foreground [&::-webkit-details-marker]:hidden">
          <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" aria-hidden />
          {t("ckd.details")}
        </summary>
        <div className="mt-2 space-y-2 pl-4.5">
          <p>
            {t("ckd.mesures.moyenne", { n: (per.moyenne ?? 0).toLocaleString() })} · {t("ckd.recreations", { n: d.recreations })}
          </p>
          {d.autres_comptes.length > 0 && (
            <p>
              {t("ckd.autresComptes")}{" "}
              {d.autres_comptes.map((c, i) => (
                <React.Fragment key={c.id}>
                  {i > 0 && ", "}
                  <Link to={`/admin/createurs/${c.id}`} className={cn("underline-offset-2 hover:underline", !c.actif && "line-through")}>
                    @{c.handle ?? "?"}
                  </Link>
                </React.Fragment>
              ))}
            </p>
          )}
          <div>
            <p className="font-medium text-foreground/80">{t("ckd.seuilsAppliques")}</p>
            <ul className="mt-1 grid gap-x-6 sm:grid-cols-2">
              {REGLAGES.filter((r) => d.reglages[r.cle]).map((r) => (
                <li key={r.cle}>
                  {t(`ckd.reglages.${r.cle}`)} : {formaterValeur(r, d.reglages[r.cle].v, t("ckd.oui"), t("ckd.non"))}{" "}
                  <span>({t(`ckd.sources.${d.reglages[r.cle].s}`)})</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </details>

      <BlocDecision p={p} type={type} decideur={decideur} arret={arret} nouveauHandle={nouveauHandle} />
    </div>
  );
}

/**
 * Les boutons tant que rien n'est décidé (un clic ouvre la confirmation, avec
 * une note facultative pour le HM et, pour un Nudge, le texte du pop-up à
 * modifier pour ce posteur), puis ce que la décision est devenue : compte
 * créé, arrêt prévu ou fait, envoi au HM, Done.
 */
function BlocDecision({
  p,
  type,
  decideur,
  arret,
  nouveauHandle,
}: {
  p: PropositionCkd;
  type: TypeControle;
  decideur?: PersonneCkd;
  arret?: ArretCkd;
  nouveauHandle: string | null;
}) {
  const { t } = useTranslation();
  const date = useDate();
  const queryClient = useQueryClient();
  const [choix, setChoix] = React.useState<string | null>(null);
  const [note, setNote] = React.useState("");
  const nudge = choix !== null && DECISION_DU_BOUTON[choix] === "nudge";
  const perso = usePersonnalisationNudge(p, nudge);
  const fermer = () => {
    setChoix(null);
    setNote("");
    perso.reinitialiser();
  };
  const invalider = () => queryClient.invalidateQueries({ queryKey: CLE });
  const decider = useMutation({
    mutationFn: (bouton: string) => {
      const decision = DECISION_DU_BOUTON[bouton];
      const n = note.trim() || null;
      const modifs = decision === "nudge" ? perso.personnalisation() : null;
      return modifs ? deciderCkd(p.id, decision, n, modifs) : deciderCkd(p.id, decision, n);
    },
    onSuccess: fermer,
    onSettled: invalider,
  });
  const annuler = useMutation({ mutationFn: () => annulerCkd(p.id), onSettled: invalider });
  const heure = { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" } as const;
  const erreur = decider.error ?? annuler.error;

  if (!p.decision) {
    return (
      <div className="space-y-2" data-testid={`decision-${p.donnees.handle}`}>
        <div className="flex flex-wrap items-center gap-1.5">
          {BOUTONS_PAR_REGLE[p.regle].map((b) => (
            <Button
              key={b}
              size="sm"
              variant={choix === b ? "default" : "outline"}
              disabled={decider.isPending}
              onClick={() => {
                perso.reinitialiser();
                setChoix(choix === b ? null : b);
              }}
            >
              {t(`ckd.boutons.${b}`)}
            </Button>
          ))}
          {enRetard(p, type) && <span className="ml-1 text-xs font-semibold text-destructive">{t("ckd.retard")}</span>}
        </div>
        {choix && (
          <div className="space-y-2.5 rounded-lg border bg-muted/40 p-3 text-xs">
            <p className="text-sm">{t(`ckd.consequences.${DECISION_DU_BOUTON[choix]}`, { handle: p.donnees.handle })}</p>
            {nudge ? (
              <div className="grid gap-2 lg:grid-cols-2">
                <PanneauNudge handle={p.donnees.handle} perso={perso} />
              </div>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              {!nudge && (
                <Input
                  className="h-8 max-w-xs text-xs"
                  placeholder={t("ckd.notePlaceholder")}
                  aria-label={t("ckd.note")}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              )}
              <Button
                size="sm"
                loading={decider.isPending}
                disabled={nudge && perso.bloquant}
                onClick={() => decider.mutate(choix)}
              >
                {t("ckd.confirmer", { action: t(`ckd.boutons.${choix}`) })}
              </Button>
              <Button size="sm" variant="ghost" disabled={decider.isPending} onClick={fermer}>
                {t("common.cancel")}
              </Button>
            </div>
          </div>
        )}
        {(erreur || p.erreur) && (
          <p role="alert" className="text-xs text-destructive">
            {erreur ? messageErreur(erreur) : t("ckd.erreurPrecedente", { erreur: p.erreur })}
          </p>
        )}
      </div>
    );
  }

  const statut: string[] = [];
  if (creeUnCompte(p.decision)) {
    statut.push(p.nouveau_compte_id ? t("ckd.statut.compteCree", { handle: nouveauHandle ?? "…" }) : t("ckd.statut.compteAttente"));
  }
  if (arret && !arret.annule_at) {
    statut.push(
      arret.fait_at
        ? t("ckd.statut.arrete", { date: date(arret.fait_at, heure) })
        : t("ckd.statut.arretPrevu", { date: date(arret.prevu_at, heure) }),
    );
  }
  if (p.envoye_at) statut.push(t("ckd.statut.envoye", { date: date(p.envoye_at, heure) }));
  else if (p.decision === "nudge" && p.hm_suivi === false) statut.push(t("ckd.statut.sansSuiviHm"));
  else if (aEnvoyer(p)) statut.push(t("ckd.statut.aEnvoyer"));
  if (p.fait_at) statut.push(t("ckd.statut.fait", { date: date(p.fait_at, heure) }));

  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border bg-muted/30 px-3 py-2 text-xs"
      data-testid={`decision-${p.donnees.handle}`}
    >
      <span className="inline-flex items-center gap-1.5 text-sm font-medium">
        <Check className="size-3.5" aria-hidden />
        {t(`ckd.boutons.${boutonDeLaDecision(p.decision)}`)}
      </span>
      <span className="text-muted-foreground">
        {t("ckd.decidePar", { nom: nomPersonne(decideur) || "?", date: date(p.decision_at, heure) })}
      </span>
      {p.nouveau_compte_id && (
        <Link to={`/admin/createurs/${p.nouveau_compte_id}`} className="underline-offset-2 hover:underline">
          @{nouveauHandle ?? "…"}
        </Link>
      )}
      {statut.length > 0 && <span>{statut.join(" · ")}</span>}
      {annulable(p, arret) && (
        <Button className="ml-auto" size="xs" variant="ghost" loading={annuler.isPending} onClick={() => annuler.mutate()}>
          {t("ckd.annuler")}
        </Button>
      )}
      {p.note && <p className="basis-full text-muted-foreground">{t("ckd.noteValeur", { note: p.note })}</p>}
      {(erreur || p.erreur) && (
        <p role="alert" className="basis-full text-destructive">
          {erreur ? messageErreur(erreur) : p.erreur}
        </p>
      )}
    </div>
  );
}

/**
 * Ce qu'un Nudge enverra, pré-rempli et modifiable pour ce posteur : le pop-up
 * (Réglages, 0338), la consigne au HM (fonction `ckd`) et son suivi dans
 * #managers-hq, désactivable (0339). Rien de modifié : tout part par défaut.
 */
function usePersonnalisationNudge(p: PropositionCkd, actif: boolean) {
  const [popup, setPopup] = React.useState<TexteNudge | null>(null);
  const [hm, setHm] = React.useState<string | null>(null);
  const [suiviHm, setSuiviHm] = React.useState(true);
  const apercuPopup = useQuery({
    queryKey: [...CLE, "apercu-nudge", p.id],
    queryFn: () => apercuNudgeCkd(p.id),
    enabled: actif && !p.decision,
    staleTime: Infinity,
  });
  const apercuHm = useQuery({
    queryKey: [...CLE, "apercu-hm", p.id],
    queryFn: () => apercuHmCkd(p.id),
    enabled: actif && !p.decision,
    staleTime: Infinity,
  });
  const popupAffiche = popup ?? apercuPopup.data ?? null;
  const hmAffiche = hm ?? apercuHm.data ?? null;
  const popupModifie =
    popup !== null && (!apercuPopup.data || popup.titre !== apercuPopup.data.titre || popup.corps !== apercuPopup.data.corps);
  const hmModifie = hm !== null && hm !== apercuHm.data;
  const popupVide = actif && popupAffiche !== null && (!popupAffiche.titre.trim() || !popupAffiche.corps.trim());
  const hmVide = actif && suiviHm && hmAffiche !== null && !hmAffiche.trim();
  return {
    apercuPopup,
    popupAffiche,
    setPopup,
    popupModifie,
    popupVide,
    apercuHm,
    hmAffiche,
    setHm,
    hmModifie,
    hmVide,
    suiviHm,
    setSuiviHm,
    bloquant: popupVide || hmVide || apercuPopup.isLoading || (suiviHm && apercuHm.isLoading),
    /** Ce qui a changé ; `null` : rien, la décision part par défaut. */
    personnalisation: (): PersonnalisationNudge | null => {
      const pop = popupModifie && popup ? { titre: popup.titre.trim(), corps: popup.corps.trim() } : null;
      const consigne = suiviHm && hmModifie && hm ? hm.trim() : null;
      return pop || consigne || !suiviHm ? { popup: pop, hm: consigne, suiviHm } : null;
    },
    reinitialiser: () => {
      setPopup(null);
      setHm(null);
      setSuiviHm(true);
    },
  };
}

type Personnalisation = ReturnType<typeof usePersonnalisationNudge>;

/** Les deux textes d'un Nudge : le pop-up du posteur, puis le message au HM. */
function PanneauNudge({ handle, perso }: { handle: string | null | undefined; perso: Personnalisation }) {
  const { t } = useTranslation();
  const champ = "w-full rounded-md border border-input bg-background px-2 py-1 text-xs shadow-sm";
  return (
    <>
      <div className="min-w-0 space-y-1.5 rounded-md border bg-background p-2.5" data-testid={`texte-nudge-${handle}`}>
        <p className="font-medium">{t("ckd.texteNudge.titre")}</p>
        <p className="text-muted-foreground">{t("ckd.texteNudge.aide")}</p>
        {perso.apercuPopup.isLoading ? (
          <p className="text-muted-foreground">{t("common.loading")}</p>
        ) : perso.apercuPopup.error ? (
          <p role="alert" className="text-destructive">
            {t("ckd.texteNudge.erreur", { erreur: messageErreur(perso.apercuPopup.error) })}
          </p>
        ) : (
          <>
            <Input
              className="h-7 text-xs"
              aria-label={t("ckd.texteNudge.champTitre")}
              maxLength={200}
              value={perso.popupAffiche?.titre ?? ""}
              onChange={(e) => perso.setPopup({ titre: e.target.value, corps: perso.popupAffiche?.corps ?? "" })}
            />
            <textarea
              className={cn(champ, "min-h-24")}
              aria-label={t("ckd.texteNudge.champCorps")}
              maxLength={3000}
              value={perso.popupAffiche?.corps ?? ""}
              onChange={(e) => perso.setPopup({ titre: perso.popupAffiche?.titre ?? "", corps: e.target.value })}
            />
            <div className="flex flex-wrap items-center gap-2">
              {perso.popupModifie && <Badge variant="outline">{t("ckd.texteNudge.modifie")}</Badge>}
              {perso.popupModifie && (
                <Button size="xs" variant="ghost" onClick={() => perso.setPopup(null)}>
                  {t("ckd.texteNudge.retablir")}
                </Button>
              )}
              {perso.popupVide && <span className="text-destructive">{t("ckd.texteNudge.vide")}</span>}
            </div>
          </>
        )}
      </div>

      <div className="min-w-0 space-y-1.5 rounded-md border bg-background p-2.5" data-testid={`message-hm-${handle}`}>
        <label className="flex items-center gap-2 font-medium">
          <input type="checkbox" checked={perso.suiviHm} onChange={(e) => perso.setSuiviHm(e.target.checked)} />
          {t("ckd.messageHm.suivi")}
        </label>
        {!perso.suiviHm ? (
          <p className="text-muted-foreground">{t("ckd.messageHm.sansSuivi")}</p>
        ) : (
          <>
            <p className="text-muted-foreground">{t("ckd.messageHm.aide", { handle })}</p>
            {perso.apercuHm.isLoading ? (
              <p className="text-muted-foreground">{t("common.loading")}</p>
            ) : perso.apercuHm.error ? (
              <p role="alert" className="text-destructive">
                {t("ckd.messageHm.erreur", { erreur: messageErreur(perso.apercuHm.error) })}
              </p>
            ) : (
              <>
                <textarea
                  className={cn(champ, "min-h-20")}
                  aria-label={t("ckd.messageHm.champ")}
                  maxLength={2000}
                  value={perso.hmAffiche ?? ""}
                  onChange={(e) => perso.setHm(e.target.value)}
                />
                <div className="flex flex-wrap items-center gap-2">
                  {perso.hmModifie && <Badge variant="outline">{t("ckd.messageHm.modifie")}</Badge>}
                  {perso.hmModifie && (
                    <Button size="xs" variant="ghost" onClick={() => perso.setHm(null)}>
                      {t("ckd.messageHm.retablir")}
                    </Button>
                  )}
                  {perso.hmVide && <span className="text-destructive">{t("ckd.messageHm.vide")}</span>}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Historique : ce que les décisions sont devenues (0329)
// ---------------------------------------------------------------------------

/** Hausse et baisse en couleur, stable en gris : la couleur ne sert qu'à ce qui bouge. */
const COULEUR_TENDANCE: Record<Tendance, string> = {
  hausse: "var(--success)",
  stable: "var(--muted-foreground)",
  baisse: "var(--destructive)",
};

/**
 * Toutes les décisions des 12 dernières semaines et, sur les 2 semaines qui
 * suivent, les chiffres du compte gardé ou doublé, et du compte créé. Pour voir
 * si les seuils sont trop durs (les gardés remontent) ou trop mous.
 */
function VueHistorique() {
  const { t } = useTranslation();
  const historique = useQuery({ queryKey: [...CLE, "historique"], queryFn: () => listerHistorique(12) });
  const [filtre, setFiltre] = React.useState<DecisionCkd | "">("");
  const lignes = React.useMemo(() => historique.data ?? [], [historique.data]);
  const ids = React.useMemo(
    () => [...new Set(lignes.flatMap((h) => [h.poster_id, h.decision_par]).filter(Boolean))].sort() as string[],
    [lignes],
  );
  const personnes = useQuery({
    queryKey: [...CLE, "personnes", ids],
    queryFn: () => listerPersonnes(ids),
    enabled: ids.length > 0,
  });
  const parId = React.useMemo(
    () => new Map((personnes.data ?? []).map((p) => [p.id, p] as const)),
    [personnes.data],
  );
  const resume = resumerHistorique(lignes);
  const visibles = filtre ? lignes.filter((h) => h.decision === filtre) : lignes;

  if (historique.error) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {messageErreur(historique.error)}
      </p>
    );
  }
  return (
    <Card data-testid="vue-historique">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {t("ckd.historique.titre")}
          <Aide libelle={t("ckd.historique.titre")}>{t("ckd.historique.aide")}</Aide>
        </CardTitle>
        <CardDescription>{t("ckd.aidesCourtes.historique")}</CardDescription>
        {lignes.length > 0 && (
          <CardAction>
            <select
              className={selectClass}
              aria-label={t("ckd.historique.filtre")}
              value={filtre}
              onChange={(e) => setFiltre(e.target.value as DecisionCkd | "")}
            >
              <option value="">{t("ckd.historique.toutes", { n: lignes.length })}</option>
              {resume.map((r) => (
                <option key={r.decision} value={r.decision}>
                  {t(`ckd.decisions.${r.decision}`)} ({r.total})
                </option>
              ))}
            </select>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        {historique.isPending ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : lignes.length === 0 ? (
          <EmptyState title={t("ckd.historique.vide")} />
        ) : (
          <>
            <ResumeHistorique resume={resume} filtre={filtre} onFiltre={setFiltre} />
            <div className="relative overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b">
                    <th className={TH}>{t("ckd.historique.colonnes.decision")}</th>
                    <th className={TH}>{t("ckd.historique.colonnes.compte")}</th>
                    <th className={TH}>{t("ckd.historique.colonnes.avant")}</th>
                    <th className={TH}>{t("ckd.historique.colonnes.apres")}</th>
                    <th className={TH}>{t("ckd.historique.colonnes.nouveau")}</th>
                    <th className={TH}>{t("ckd.historique.colonnes.tendance")}</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((h) => (
                    <LigneHistorique key={h.id} h={h} poster={parId.get(h.poster_id)} decideur={h.decision_par ? parId.get(h.decision_par) : undefined} />
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Une ligne par décision : combien, combien suivies jusqu'au bout, et ce que
 * ces dernières sont devenues. Un clic sur la ligne filtre le tableau.
 */
function ResumeHistorique({
  resume,
  filtre,
  onFiltre,
}: {
  resume: ResumeDecision[];
  filtre: DecisionCkd | "";
  onFiltre: (d: DecisionCkd | "") => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="relative overflow-x-auto">
      <table className="w-full border-collapse text-sm" data-testid="resume-historique">
        <thead>
          <tr className="border-b">
            <th className={TH}>{t("ckd.resume.decision")}</th>
            <th className={cn(TH, "text-right")}>{t("ckd.resume.total")}</th>
            <th className={cn(TH, "text-right")}>{t("ckd.resume.suivies")}</th>
            <th className={cn(TH, "w-1/2")}>{t("ckd.resume.apres")}</th>
          </tr>
        </thead>
        <tbody>
          {resume.map((r) => (
            <tr
              key={r.decision}
              title={t("ckd.resume.filtrer")}
              className={cn(LIGNE, "cursor-pointer hover:bg-muted/50", filtre === r.decision && "bg-muted/60")}
              onClick={() => onFiltre(filtre === r.decision ? "" : r.decision)}
            >
              <td className={cn(TD, "font-medium")}>{t(`ckd.decisions.${r.decision}`)}</td>
              <td className={cn(TD, "text-right tabular-nums")}>{r.total}</td>
              <td className={cn(TD, "text-right tabular-nums")}>{r.complets}</td>
              <td className={TD}>
                {r.complets === 0 ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <div className="w-32 shrink-0">
                      <BarreRepartition
                        hauteur="sm"
                        aria-label={t(`ckd.decisions.${r.decision}`)}
                        segments={(["hausse", "stable", "baisse"] as const).map((k) => ({
                          cle: k,
                          valeur: r[k],
                          couleur: COULEUR_TENDANCE[k],
                          libelle: t(`ckd.resume.${k}`),
                          valeurAffichee: String(r[k]),
                        }))}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground">{t("ckd.resume.tendances", { ...r })}</span>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Chiffres({ c }: { c: ChiffresCkd }) {
  const { t } = useTranslation();
  return (
    <span className="tabular-nums">
      {c.mediane !== null && c.mediane !== undefined ? t("ckd.historique.mediane", { n: c.mediane.toLocaleString() }) : "—"}
      {" · "}
      {t("ckd.historique.publies", { publies: c.publies ?? 0, attendus: c.attendus ?? 0 })}
      {c.bons ? ` · ${t("ckd.historique.bons", { n: c.bons })}` : ""}
    </span>
  );
}

function LigneHistorique({ h, poster, decideur }: { h: HistoriqueCkd; poster?: PersonneCkd; decideur?: PersonneCkd }) {
  const { t } = useTranslation();
  const date = useDate();
  const tend = tendanceDecision(h);
  const pasCommence = !h.apres && !h.apres_nouveau && !h.arrete_at;
  return (
    <tr className={cn(LIGNE, "text-xs")} data-testid={`historique-${h.handle}`}>
      <td className={TD}>
        <span className="text-sm font-medium">{t(`ckd.decisions.${h.decision}`)}</span>
        <div className="mt-0.5 whitespace-nowrap text-muted-foreground">
          {t("ckd.historique.decide", { date: date(h.decision_at ?? h.jour), nom: nomPersonne(decideur) || "?" })}
        </div>
        {h.note && <div className="text-muted-foreground italic">{h.note}</div>}
      </td>
      <td className={TD}>
        <Link to={`/admin/createurs/${h.compte_id}`} className="whitespace-nowrap text-sm underline-offset-2 hover:underline">
          {drapeauPays(h.pays)} @{h.handle}
        </Link>
        <div className="text-muted-foreground">
          {[nomPersonne(poster), t(`ckd.reglesCourtes.${h.regle}`)].filter(Boolean).join(" · ")}
        </div>
      </td>
      <td className={TD}>
        <Chiffres c={h.avant} />
        {h.mediane_ref !== null && (
          <div className="text-muted-foreground">{t("ckd.historique.reference", { n: h.mediane_ref.toLocaleString() })}</div>
        )}
      </td>
      <td className={TD}>
        {h.arrete_at ? (
          <span className="text-muted-foreground">{t("ckd.historique.arrete", { date: date(h.arrete_at) })}</span>
        ) : pasCommence ? (
          <span className="text-muted-foreground">{t("ckd.historique.commence", { date: date(h.du) })}</span>
        ) : (
          h.apres && <Chiffres c={h.apres} />
        )}
        {!pasCommence && !h.complet && (
          <div className="text-muted-foreground">{t("ckd.historique.enCours", { date: date(h.au) })}</div>
        )}
      </td>
      <td className={TD}>
        {h.nouveau_compte_id ? (
          <>
            <Link to={`/admin/createurs/${h.nouveau_compte_id}`} className="underline-offset-2 hover:underline">
              @{h.nouveau_handle ?? "…"}
            </Link>
            {h.apres_nouveau && (
              <div>
                <Chiffres c={h.apres_nouveau} />
              </div>
            )}
          </>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className={TD}>
        {tend ? (
          <span
            className={cn(
              "whitespace-nowrap text-sm font-medium",
              tend === "hausse" && "text-success-foreground",
              tend === "baisse" && "text-destructive",
              tend === "stable" && "text-muted-foreground",
            )}
          >
            {t(`ckd.historique.tendances.${tend}`)}
            {!h.complet && " *"}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Réglages
// ---------------------------------------------------------------------------

function VueReglages() {
  const { t } = useTranslation();
  const reglages = useQuery({ queryKey: [...CLE, "reglages"], queryFn: listerReglages });
  const part = useQuery({ queryKey: [...CLE, "part-bons-posts"], queryFn: lirePartBonsPosts });
  const labels = useQuery({ queryKey: [...CLE, "labels"], queryFn: listerLabels });
  const erreur = reglages.error ?? part.error ?? labels.error;
  const pays = React.useMemo(
    () => [...(part.data ?? [])].sort((a, b) => b.posts - a.posts).map((l) => l.pays),
    [part.data],
  );

  if (erreur) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {messageErreur(erreur)}
      </p>
    );
  }
  if (!reglages.data) return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;

  return (
    <div className="space-y-8" data-testid="vue-reglages">
      <section className="space-y-4">
        <h2 className={MICRO_LABEL}>{t("ckd.sections.seuils")}</h2>
        <CarteDefauts reglages={reglages.data} />
        <CartePays reglages={reglages.data} pays={pays} />
        <CarteExceptions reglages={reglages.data} labels={labels.data ?? []} pays={pays} />
        <CartePartBons />
      </section>
      <section className="space-y-4">
        <h2 className={MICRO_LABEL}>{t("ckd.sections.slack")}</h2>
        <CarteCanalSlack />
        <CarteSlack />
        <CarteTextesNudges />
      </section>
      <CarteJournal labels={labels.data ?? []} />
    </div>
  );
}

/** Le titre d'une carte de réglages : le nom, son « i » pour le détail, une ligne pour l'essentiel. */
function EnTeteReglage({ titre, aide, resume }: { titre: string; aide?: string; resume?: string }) {
  return (
    <CardHeader>
      <CardTitle className="flex items-center gap-2 text-base">
        {titre}
        {aide && <Aide libelle={titre}>{aide}</Aide>}
      </CardTitle>
      {resume && <CardDescription>{resume}</CardDescription>}
    </CardHeader>
  );
}

function useRegler() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (v: { cle: string; pays: string | null; labelId: string | null; valeur: unknown }) =>
      reglerCkd(v.cle, v.pays, v.labelId, v.valeur),
    onSettled: () => queryClient.invalidateQueries({ queryKey: CLE }),
  });
}

/**
 * Une case de réglage : affiche la valeur qui s'applique (grisée si elle est
 * héritée), se modifie au clic. Vide + Entrée = retirer l'exception.
 */
function CelluleReglage({
  def,
  reglages,
  pays,
  labelId,
}: {
  def: DefReglage;
  reglages: ReglageCkd[];
  pays: string | null;
  labelId: string | null;
}) {
  const { t } = useTranslation();
  const regler = useRegler();
  const [edition, setEdition] = React.useState(false);
  const [texte, setTexte] = React.useState("");
  const [erreur, setErreur] = React.useState<string | null>(null);

  const propre = reglageDuNiveau(reglages, def.cle, pays, labelId);
  const effective = valeurEffective(reglages, def.cle, pays, labelId);
  const herite = !propre;
  const affichage =
    def.cle === "seuil_bon_post" && (effective?.valeur ?? null) === null
      ? t("ckd.commentMasters")
      : formaterValeur(def, effective?.valeur, t("ckd.oui"), t("ckd.non"));
  const niveauDefaut = pays === null && labelId === null;

  const ouvrir = () => {
    setTexte(propre ? valeurEnSaisie(def, propre.valeur) : "");
    setErreur(null);
    setEdition(true);
  };
  const valider = () => {
    const lu = lireSaisie(def, texte);
    if ("erreur" in lu) {
      setErreur(t(`ckd.erreursSaisie.${lu.erreur}`));
      return;
    }
    if (lu.valeur === null && niveauDefaut && !def.videAutorise) {
      setErreur(t("ckd.erreursSaisie.defautRequis"));
      return;
    }
    regler.mutate(
      { cle: def.cle, pays, labelId, valeur: lu.valeur },
      { onSuccess: () => setEdition(false), onError: (e) => setErreur(messageErreur(e)) },
    );
  };

  if (edition) {
    return (
      <div className="space-y-1">
        <Input
          autoFocus
          className="h-7 w-24 text-xs"
          value={texte}
          placeholder={def.type === "oui_non" ? t("ckd.ouiNon") : def.type === "part" ? "%" : ""}
          aria-label={t(`ckd.reglages.${def.cle}`)}
          onChange={(e) => setTexte(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") valider();
            if (e.key === "Escape") setEdition(false);
          }}
          onBlur={() => {
            if (!regler.isPending) setEdition(false);
          }}
        />
        {erreur && <p className="text-[11px] text-destructive">{erreur}</p>}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={ouvrir}
      className={cn(
        "-mx-1.5 rounded px-1.5 py-0.5 text-left text-sm whitespace-nowrap tabular-nums hover:bg-accent",
        herite ? "text-muted-foreground" : "font-semibold text-foreground",
      )}
      title={herite ? t("ckd.herite") : t("ckd.remplace")}
    >
      {affichage}
    </button>
  );
}

function CarteDefauts({ reglages }: { reglages: ReglageCkd[] }) {
  const { t } = useTranslation();
  return (
    <Card>
      <EnTeteReglage titre={t("ckd.defauts")} aide={t("ckd.defautsAide")} resume={t("ckd.aidesCourtes.defauts")} />
      <CardContent>
        <dl className="grid gap-x-10 sm:grid-cols-2">
          {REGLAGES.map((r) => (
            <div key={r.cle} className={cn(LIGNE, "flex items-center justify-between gap-3 py-1.5")}>
              <dt className="text-sm">{t(`ckd.reglages.${r.cle}`)}</dt>
              <dd>
                <CelluleReglage def={r} reglages={reglages} pays={null} labelId={null} />
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

function CartePays({ reglages, pays }: { reglages: ReglageCkd[]; pays: string[] }) {
  const { t } = useTranslation();
  const colonnes = REGLAGES.filter((r) => !r.global);
  return (
    <Card>
      <EnTeteReglage titre={t("ckd.parPays")} aide={t("ckd.parPaysAide")} resume={t("ckd.aidesCourtes.parPays")} />
      <CardContent className="relative overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b">
              <th className={TH}>{t("ckd.pays")}</th>
              {colonnes.map((r) => (
                <th key={r.cle} className={cn(TH, "align-bottom")} title={t(`ckd.reglages.${r.cle}`)}>
                  {t(`ckd.reglagesCourts.${r.cle}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pays.map((code) => (
              <tr key={code} className={LIGNE}>
                <td className={cn(TD, "whitespace-nowrap")}>
                  {drapeauPays(code)} {code}
                </td>
                {colonnes.map((r) => (
                  <td key={r.cle} className="py-1 pr-4 last:pr-0">
                    <CelluleReglage def={r} reglages={reglages} pays={code} labelId={null} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function CarteExceptions({ reglages, labels, pays }: { reglages: ReglageCkd[]; labels: LabelCkd[]; pays: string[] }) {
  const { t } = useTranslation();
  const regler = useRegler();
  const [label, setLabel] = React.useState("");
  const [codePays, setCodePays] = React.useState("");
  const [cle, setCle] = React.useState(REGLAGES[0].cle);
  const [texte, setTexte] = React.useState("");
  const [erreur, setErreur] = React.useState<string | null>(null);
  const labelParId = new Map(labels.map((l) => [l.id, l] as const));
  const exceptions = exceptionsLabel(reglages);
  const choix = REGLAGES.filter((r) => !r.global);

  const ajouter = () => {
    const def = defReglage(cle);
    if (!def || !label) return;
    const lu = lireSaisie(def, texte);
    if ("erreur" in lu || lu.valeur === null) {
      setErreur(t(`ckd.erreursSaisie.${"erreur" in lu ? lu.erreur : "nombre"}`));
      return;
    }
    setErreur(null);
    regler.mutate(
      { cle, pays: codePays || null, labelId: label, valeur: lu.valeur },
      { onSuccess: () => setTexte(""), onError: (e) => setErreur(messageErreur(e)) },
    );
  };

  return (
    <Card>
      <EnTeteReglage titre={t("ckd.exceptions")} aide={t("ckd.exceptionsAide")} resume={t("ckd.aidesCourtes.exceptions")} />
      <CardContent className="space-y-4">
        {exceptions.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("ckd.aucuneException")}</p>
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b">
                  <th className={TH}>{t("ckd.colonnesExceptions.label")}</th>
                  <th className={TH}>{t("ckd.colonnesExceptions.pays")}</th>
                  <th className={TH}>{t("ckd.colonnesExceptions.reglage")}</th>
                  <th className={cn(TH, "text-right")}>{t("ckd.colonnesExceptions.valeur")}</th>
                  <th className={TH}>
                    <span className="sr-only">{t("common.delete")}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {exceptions.map((r) => {
                  const def = defReglage(r.cle);
                  return (
                    <tr key={r.id} className={LIGNE}>
                      <td className={cn(TD, "font-mono")}>{labelParId.get(r.label_id ?? "")?.nom ?? r.label_id}</td>
                      <td className={cn(TD, "whitespace-nowrap")}>{r.pays ? `${drapeauPays(r.pays)} ${r.pays}` : t("ckd.tousPays")}</td>
                      <td className={cn(TD, "text-muted-foreground")}>{t(`ckd.reglages.${r.cle}`)}</td>
                      <td className={cn(TD, "text-right font-semibold tabular-nums")}>
                        {formaterValeur(def, r.valeur, t("ckd.oui"), t("ckd.non"))}
                      </td>
                      <td className="py-1 text-right">
                        <Button
                          size="xs"
                          variant="ghost"
                          onClick={() => regler.mutate({ cle: r.cle, pays: r.pays, labelId: r.label_id, valeur: null })}
                        >
                          {t("common.delete")}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex flex-wrap items-end gap-2">
          <select className={selectClass} aria-label={t("ckd.label")} value={label} onChange={(e) => setLabel(e.target.value)}>
            <option value="">{t("ckd.choisirLabel")}</option>
            {labels.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nom}
              </option>
            ))}
          </select>
          <select className={selectClass} aria-label={t("ckd.pays")} value={codePays} onChange={(e) => setCodePays(e.target.value)}>
            <option value="">{t("ckd.tousPays")}</option>
            {pays.map((p) => (
              <option key={p} value={p}>
                {drapeauPays(p)} {p}
              </option>
            ))}
          </select>
          <select className={selectClass} aria-label={t("ckd.reglage")} value={cle} onChange={(e) => setCle(e.target.value)}>
            {choix.map((r) => (
              <option key={r.cle} value={r.cle}>
                {t(`ckd.reglages.${r.cle}`)}
              </option>
            ))}
          </select>
          <Input
            className="h-8 w-28"
            value={texte}
            placeholder={t("ckd.valeur")}
            aria-label={t("ckd.valeur")}
            onChange={(e) => setTexte(e.target.value)}
          />
          <Button size="sm" disabled={!label || regler.isPending} onClick={ajouter}>
            {t("ckd.ajouterException")}
          </Button>
        </div>
        {erreur && <p className="text-xs text-destructive">{erreur}</p>}
      </CardContent>
    </Card>
  );
}

function CartePartBons() {
  const { t } = useTranslation();
  const part = useQuery({ queryKey: [...CLE, "part-bons-posts"], queryFn: lirePartBonsPosts });
  const lignes = [...(part.data ?? [])].sort((a, b) => b.posts - a.posts);
  return (
    <Card>
      <EnTeteReglage titre={t("ckd.partBons")} aide={t("ckd.partBonsAide")} resume={t("ckd.aidesCourtes.partBons")} />
      <CardContent className="relative overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b">
              <th className={TH}>{t("ckd.pays")}</th>
              <th className={cn(TH, "text-right")}>{t("ckd.seuilBon")}</th>
              <th className={cn(TH, "text-right")}>{t("ckd.posts")}</th>
              <th className={cn(TH, "text-right")}>{t("ckd.auDessus")}</th>
              <th className={cn(TH, "hidden w-32 sm:table-cell")}>
                <span className="sr-only">{t("ckd.auDessus")}</span>
              </th>
              <th className={cn(TH, "text-right")}>{t("ckd.medianePays")}</th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((l) => {
              const pct = pourcentage(l.au_dessus, l.posts);
              const horsCible = pct < 3 || pct > 12;
              return (
                <tr key={l.pays} className={LIGNE}>
                  <td className={cn(TD, "whitespace-nowrap")}>
                    {drapeauPays(l.pays)} {nomPaysIso(l.pays)}
                  </td>
                  <td className={cn(TD, "whitespace-nowrap text-right tabular-nums")}>
                    {l.seuil.toLocaleString()} <span className="text-xs text-muted-foreground">({t(`ckd.sources.${l.source}`)})</span>
                  </td>
                  <td className={cn(TD, "text-right tabular-nums")}>{l.posts.toLocaleString()}</td>
                  <td className={cn(TD, "whitespace-nowrap text-right tabular-nums", horsCible && "font-semibold text-warning-foreground")}>
                    {pct.toLocaleString()} %
                  </td>
                  <td className={cn(TD, "hidden sm:table-cell")}>
                    {/* La cible : entre 3 et 12 % des posts au-dessus du seuil ; l'échelle s'arrête à 20 %. */}
                    <div className="relative mt-1.5 h-2 w-full rounded-[3px] bg-muted" aria-hidden>
                      <div className="absolute inset-y-0 bg-foreground/10" style={{ left: "15%", width: "45%" }} />
                      <div
                        className={cn("relative h-full rounded-r-[4px]", horsCible ? "bg-warning" : "bg-foreground/70")}
                        style={{ width: `${Math.min(100, (100 * pct) / 20)}%` }}
                      />
                    </div>
                  </td>
                  <td className={cn(TD, "text-right tabular-nums")}>{(l.mediane ?? 0).toLocaleString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function LigneSlack({ hm }: { hm: HmCkd }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [texte, setTexte] = React.useState(hm.slack_user_id ?? "");
  const enregistrer = useMutation({
    mutationFn: () => enregistrerSlackHm(hm.profile_id, texte.trim() || null),
    onSettled: () => queryClient.invalidateQueries({ queryKey: [...CLE, "hms"] }),
  });
  const valide = texte.trim() === "" || /^[UW][A-Z0-9]{6,}$/.test(texte.trim());
  const change = texte.trim() !== (hm.slack_user_id ?? "");
  return (
    <tr className={LIGNE}>
      <td className={cn(TD, "whitespace-nowrap")}>{hm.nom}</td>
      <td className={cn(TD, "text-muted-foreground")}>{hm.zone ?? "—"}</td>
      <td className={cn(TD, "text-right tabular-nums")}>{hm.posters}</td>
      <td className="py-1.5">
        <div className="flex items-center gap-2">
          <Input
            className={cn("h-7 w-36 font-mono text-xs", !valide && "border-destructive")}
            value={texte}
            placeholder="U0…"
            aria-label={t("ckd.slackDe", { nom: hm.nom })}
            onChange={(e) => setTexte(e.target.value.toUpperCase())}
          />
          {change && (
            <Button size="xs" disabled={!valide} loading={enregistrer.isPending} onClick={() => enregistrer.mutate()}>
              {t("common.save")}
            </Button>
          )}
          {!hm.slack_user_id && !change && <Badge variant="warning">{t("ckd.slackManquant")}</Badge>}
          {enregistrer.error && <span className="text-xs text-destructive">{messageErreur(enregistrer.error)}</span>}
        </div>
      </td>
    </tr>
  );
}

/** Le canal des décisions (#managers-hq) et la vérification du bot, sans rien poster. */
function CarteCanalSlack() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const canal = useQuery({ queryKey: [...CLE, "canal-slack"], queryFn: lireCanalSlack });
  const [saisie, setSaisie] = React.useState<string | null>(null);
  const enregistrer = useMutation({
    mutationFn: (v: string) => enregistrerCanalSlack(v),
    onSuccess: () => setSaisie(null),
    onSettled: () => queryClient.invalidateQueries({ queryKey: [...CLE, "canal-slack"] }),
  });
  const verifier = useMutation({ mutationFn: verifierSlackCkd });
  const valeur = saisie ?? canal.data ?? "";
  const valide = /^[CG][A-Z0-9]{6,}$/.test(valeur.trim());
  const v = verifier.data;
  return (
    <Card data-testid="carte-canal-slack">
      <EnTeteReglage titre={t("ckd.canalSlack")} aide={t("ckd.canalSlackAide")} resume={t("ckd.aidesCourtes.canalSlack")} />
      <CardContent className="space-y-2 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="h-8 w-48 font-mono text-xs"
            aria-label={t("ckd.canalSlack")}
            value={valeur}
            onChange={(e) => setSaisie(e.target.value.toUpperCase())}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={saisie === null || !valide}
            loading={enregistrer.isPending}
            onClick={() => enregistrer.mutate(valeur)}
          >
            {t("common.save")}
          </Button>
          <Button size="sm" variant="outline" loading={verifier.isPending} onClick={() => verifier.mutate()}>
            {t("ckd.verifierSlack")}
          </Button>
        </div>
        {v && (
          <p role="status" className={cn(v.ok ? "text-success-foreground" : "text-destructive")}>
            {v.ok
              ? t("ckd.slackOk", { bot: v.bot, nom: v.nom ?? v.canal })
              : v.membre === false
                ? t("ckd.slackPasMembre", { bot: v.bot, nom: v.nom ?? v.canal })
                : t("ckd.slackKo", { erreur: v.error })}
          </p>
        )}
        {(verifier.error || enregistrer.error) && (
          <p role="alert" className="text-destructive">{messageErreur(verifier.error ?? enregistrer.error)}</p>
        )}
      </CardContent>
    </Card>
  );
}

/** Les textes des nudges (en anglais, ce que lit le posteur). `{handle}` = son compte. */
function CarteTextesNudges() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const textes = useQuery({ queryKey: [...CLE, "textes-nudges"], queryFn: lireTextesNudges });
  const [brouillon, setBrouillon] = React.useState<TextesNudges | null>(null);
  const enregistrer = useMutation({
    mutationFn: (v: TextesNudges) => enregistrerTextesNudges(v),
    onSuccess: () => setBrouillon(null),
    onSettled: () => queryClient.invalidateQueries({ queryKey: [...CLE, "textes-nudges"] }),
  });
  const courant = brouillon ?? textes.data ?? {};
  const changer = (m: (typeof MOTIFS_NUDGE)[number], champ: "titre" | "corps", v: string) =>
    setBrouillon({ ...courant, [m]: { titre: courant[m]?.titre ?? "", corps: courant[m]?.corps ?? "", [champ]: v } });
  return (
    <Card data-testid="carte-textes-nudges">
      <EnTeteReglage titre={t("ckd.textesNudges")} aide={t("ckd.textesNudgesAide")} resume={t("ckd.aidesCourtes.textesNudges")} />
      <CardContent className="space-y-4 text-xs">
        <div className="grid gap-4 lg:grid-cols-2">
          {MOTIFS_NUDGE.map((m) => (
            <div key={m} className="space-y-1.5">
              <p className={MICRO_LABEL}>{t(`ckd.motifsNudge.${m}`)}</p>
              <Input
                className="h-8 text-xs"
                aria-label={t("ckd.titreNudge", { motif: t(`ckd.motifsNudge.${m}`) })}
                value={courant[m]?.titre ?? ""}
                onChange={(e) => changer(m, "titre", e.target.value)}
              />
              <textarea
                className="min-h-20 w-full rounded-md border border-input bg-background px-2 py-1 text-xs shadow-sm"
                aria-label={t("ckd.corpsNudge", { motif: t(`ckd.motifsNudge.${m}`) })}
                value={courant[m]?.corps ?? ""}
                onChange={(e) => changer(m, "corps", e.target.value)}
              />
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={!brouillon}
            loading={enregistrer.isPending}
            onClick={() => brouillon && enregistrer.mutate(brouillon)}
          >
            {t("common.save")}
          </Button>
          {brouillon && (
            <Button size="sm" variant="ghost" onClick={() => setBrouillon(null)}>
              {t("common.cancel")}
            </Button>
          )}
        </div>
        {(textes.error || enregistrer.error) && (
          <p role="alert" className="text-destructive">{messageErreur(textes.error ?? enregistrer.error)}</p>
        )}
      </CardContent>
    </Card>
  );
}

function CarteSlack() {
  const { t } = useTranslation();
  const hms = useQuery({ queryKey: [...CLE, "hms"], queryFn: listerHms });
  const lignes = [...(hms.data ?? [])].sort((a, b) => b.posters - a.posters);
  return (
    <Card>
      <EnTeteReglage titre={t("ckd.slackHms")} aide={t("ckd.slackHmsAide")} resume={t("ckd.aidesCourtes.slackHms")} />
      <CardContent className="relative overflow-x-auto">
        {hms.error && <p className="text-xs text-destructive">{messageErreur(hms.error)}</p>}
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b">
              <th className={TH}>{t("ckd.hm")}</th>
              <th className={TH}>{t("ckd.zone")}</th>
              <th className={cn(TH, "text-right")}>{t("ckd.posters")}</th>
              <th className={TH}>{t("ckd.idSlack")}</th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((h) => (
              <LigneSlack key={`${h.profile_id}-${h.slack_user_id ?? ""}`} hm={h} />
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function CarteJournal({ labels }: { labels: LabelCkd[] }) {
  const { t } = useTranslation();
  const date = useDate();
  const journal = useQuery({ queryKey: [...CLE, "journal"], queryFn: listerJournal });
  const auteurs = React.useMemo(
    () => [...new Set((journal.data ?? []).map((j) => j.par).filter((p): p is string => Boolean(p)))].sort(),
    [journal.data],
  );
  const personnes = useQuery({
    queryKey: [...CLE, "personnes", auteurs],
    queryFn: () => listerPersonnes(auteurs),
    enabled: auteurs.length > 0,
  });
  const nom = new Map((personnes.data ?? []).map((p) => [p.id, nomPersonne(p)] as const));
  const labelParId = new Map(labels.map((l) => [l.id, l.nom] as const));
  const lignes = journal.data ?? [];
  return (
    <Card>
      <EnTeteReglage titre={t("ckd.journal")} />
      <CardContent className="relative overflow-x-auto">
        {lignes.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("ckd.journalVide")}</p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b">
                <th className={TH}>{t("ckd.colonnesJournal.quand")}</th>
                <th className={TH}>{t("ckd.colonnesJournal.par")}</th>
                <th className={TH}>{t("ckd.colonnesJournal.reglage")}</th>
                <th className={TH}>{t("ckd.colonnesJournal.niveau")}</th>
                <th className={TH}>{t("ckd.colonnesJournal.changement")}</th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((j) => {
                const def = defReglage(j.cle);
                const niveau =
                  [j.pays, j.label_id ? labelParId.get(j.label_id) : null].filter(Boolean).join(" × ") || t("ckd.niveauDefaut");
                return (
                  <tr key={j.id} className={cn(LIGNE, "text-xs")}>
                    <td className={cn(TD, "whitespace-nowrap tabular-nums text-muted-foreground")}>
                      {date(j.at, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className={cn(TD, "whitespace-nowrap")}>{j.par ? nom.get(j.par) ?? "" : t("ckd.systeme")}</td>
                    <td className={TD}>{t(`ckd.reglages.${j.cle}`)}</td>
                    <td className={cn(TD, "whitespace-nowrap text-muted-foreground")}>{niveau}</td>
                    <td className={cn(TD, "whitespace-nowrap tabular-nums")}>
                      {formaterValeur(def, j.ancienne, t("ckd.oui"), t("ckd.non"))} →{" "}
                      <span className="font-semibold">{formaterValeur(def, j.nouvelle, t("ckd.oui"), t("ckd.non"))}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
