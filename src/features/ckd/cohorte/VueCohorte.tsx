import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ArrowRight, CalendarCheck, Check, ChevronLeft, ChevronRight, Clock, Flame, Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import { MICRO_LABEL } from "@/components/ui/micro-label";
import {
  listerControles,
  listerPersonnes,
  listerPropositions,
  type PersonneCkd,
  type PropositionCkd,
  type TypeControle,
} from "@/features/ckd/api";
import { aujourdhuiParis } from "@/features/moteur/cohortes";
import { ajouterJours } from "@/features/onboarding/datesRuul";
import { cn } from "@/lib/utils";

import { lireCohorte, releverWarmup } from "./api";
import { useFormats } from "./formats";
import {
  bilanSemaine,
  ecartJours,
  etatWarmup,
  libelleCohorte,
  minuitParis,
  paireDuJour,
  resteAvant,
  STATUTS_WARMUP,
  type StatutWarmup,
} from "./logique";
import { OngletPoste } from "./OngletPoste";
import { OngletWarmup } from "./OngletWarmup";

const CLE = ["ckd"] as const;

/** Les couleurs des statuts du warm-up : celles des statuts de l'OS, jamais seules (icône + libellé). */
const COULEUR_STATUT: Record<StatutWarmup, string> = {
  pret: "var(--success)",
  en_cours: "var(--info)",
  nouveau: "var(--muted-foreground)",
  a_relancer: "var(--destructive)",
};

type Onglet = "poste" | "warmup";

/**
 * Check, Kill or Double → Suivi cohorte (0356). Deux cohortes de nouveaux
 * posteurs à la fois, chacune dans son onglet : celle qui fait sa première
 * semaine de posts (suivi du soir, check du jeudi, kill / keep du samedi) et
 * celle qui fait son warm-up pour démarrer le lundi qui vient (compte TikTok
 * créé, abonnements et likes, « Start warmup »). Les décisions passent par le
 * même bloc que le suivi global (`rendreControle`).
 */
export function VueCohorte({
  rendreControle,
  ouvrirGlobal,
  maintenant,
}: {
  /** Les propositions d'un contrôle, réduites aux comptes de la cohorte (le bloc du suivi global). */
  rendreControle: (type: TypeControle, jour: string, comptes: ReadonlySet<string>) => React.ReactNode;
  ouvrirGlobal: () => void;
  /** Pour les tests. */
  maintenant?: Date;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { date, duree } = useFormats();
  const instant = React.useMemo(() => maintenant ?? new Date(), [maintenant]);
  const aujourdhui = aujourdhuiParis(instant);
  const courante = paireDuJour(aujourdhui).poste;
  const [lundiPoste, setLundiPoste] = React.useState(courante);
  const lundiWarmup = ajouterJours(lundiPoste, 7);
  const [onglet, setOnglet] = React.useState<Onglet>("poste");

  const poste = useQuery({ queryKey: [...CLE, "cohorte", lundiPoste], queryFn: () => lireCohorte(lundiPoste) });
  const warmup = useQuery({ queryKey: [...CLE, "cohorte", lundiWarmup], queryFn: () => lireCohorte(lundiWarmup) });
  const comptesPoste = React.useMemo(() => poste.data ?? [], [poste.data]);
  const comptesWarmup = React.useMemo(() => warmup.data ?? [], [warmup.data]);

  const ids = React.useMemo(() => {
    const s = new Set<string>();
    for (const c of [...comptesPoste, ...comptesWarmup]) {
      s.add(c.poster_id);
      if (c.hm_id) s.add(c.hm_id);
    }
    return [...s].sort();
  }, [comptesPoste, comptesWarmup]);
  const personnes = useQuery({
    queryKey: [...CLE, "personnes", ids],
    queryFn: () => listerPersonnes(ids),
    enabled: ids.length > 0,
  });
  const parId = React.useMemo(
    () => new Map<string, PersonneCkd>((personnes.data ?? []).map((p) => [p.id, p])),
    [personnes.data],
  );

  // Les contrôles de la semaine de la cohorte qui poste : jeudi et samedi.
  const controles = useQuery({ queryKey: [...CLE, "controles"], queryFn: listerControles });
  const jeudi = (controles.data ?? []).find((c) => c.type === "jeudi" && c.jour === ajouterJours(lundiPoste, 3));
  const samedi = (controles.data ?? []).find((c) => c.type === "samedi" && c.jour === ajouterJours(lundiPoste, 5));
  const propsJeudi = useQuery({
    queryKey: [...CLE, "propositions", jeudi?.id],
    queryFn: () => listerPropositions(jeudi!.id),
    enabled: Boolean(jeudi),
  });
  const propsSamedi = useQuery({
    queryKey: [...CLE, "propositions", samedi?.id],
    queryFn: () => listerPropositions(samedi!.id),
    enabled: Boolean(samedi),
  });
  const idsPoste = React.useMemo(() => new Set(comptesPoste.map((c) => c.compte_id)), [comptesPoste]);
  const propositions = React.useMemo(() => {
    const m = new Map<string, { jeudi?: PropositionCkd; samedi?: PropositionCkd[] }>();
    for (const p of propsJeudi.data ?? []) {
      if (!idsPoste.has(p.compte_id)) continue;
      m.set(p.compte_id, { ...m.get(p.compte_id), jeudi: p });
    }
    for (const p of propsSamedi.data ?? []) {
      if (!idsPoste.has(p.compte_id)) continue;
      const e = m.get(p.compte_id) ?? {};
      m.set(p.compte_id, { ...e, samedi: [...(e.samedi ?? []), p] });
    }
    return m;
  }, [propsJeudi.data, propsSamedi.data, idsPoste]);
  const nbPropsSamedi = (propsSamedi.data ?? []).filter((p) => idsPoste.has(p.compte_id)).length;
  const nbNudges = (propsJeudi.data ?? []).filter((p) => idsPoste.has(p.compte_id)).length;

  const relever = useMutation({
    mutationFn: releverWarmup,
    onSettled: () => queryClient.invalidateQueries({ queryKey: [...CLE, "cohorte"] }),
  });

  const bilan = bilanSemaine(comptesPoste, lundiPoste, aujourdhui);
  const etats = comptesWarmup.map((c) => etatWarmup(c, aujourdhui));
  const parStatut = Object.fromEntries(STATUTS_WARMUP.map((s) => [s, etats.filter((e) => e.statut === s).length])) as Record<
    StatutWarmup,
    number
  >;
  const reste = resteAvant(minuitParis(lundiWarmup), instant);
  const erreur = poste.error ?? warmup.error;

  return (
    <div className="space-y-5" data-testid="vue-cohorte">
      <EnTetePaire
        lundiPoste={lundiPoste}
        aujourdhui={aujourdhui}
        estCourante={lundiPoste === courante}
        precedente={() => setLundiPoste(ajouterJours(lundiPoste, -7))}
        suivante={() => setLundiPoste(ajouterJours(lundiPoste, 7))}
        revenir={() => setLundiPoste(courante)}
      />

      {erreur && (
        <p role="alert" className="text-sm text-destructive">
          {erreur instanceof Error ? erreur.message : String((erreur as { message?: unknown }).message ?? erreur)}
        </p>
      )}

      <div
        role="tablist"
        aria-label={t("ckd.cohorte.onglets.aria")}
        className="grid grid-cols-1 gap-3 md:grid-cols-2"
        onKeyDown={(ev) => {
          if (ev.key !== "ArrowRight" && ev.key !== "ArrowLeft") return;
          ev.preventDefault();
          const vers = onglet === "poste" ? "warmup" : "poste";
          setOnglet(vers);
          document.getElementById(`onglet-cohorte-${vers}`)?.focus();
        }}
      >
        <CarteOnglet
          id="poste"
          actif={onglet === "poste"}
          onClick={() => setOnglet("poste")}
          icone={<CalendarCheck className="size-5" aria-hidden />}
          ton="poste"
          micro={t("ckd.cohorte.onglets.poste")}
          titre={t("ckd.cohorte.poste.titre", { s: libelleCohorte(lundiPoste) })}
          sousTitre={t("ckd.cohorte.poste.sousTitre", {
            count: comptesPoste.length,
            date: date(lundiPoste, { weekday: "long", day: "numeric", month: "long" }),
          })}
        >
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                { jour: lundiPoste, cle: "lundi" },
                { jour: ajouterJours(lundiPoste, 3), cle: "jeudi" },
                { jour: ajouterJours(lundiPoste, 5), cle: "samedi" },
              ] as const
            ).map((j) => (
              <Jalon
                key={j.cle}
                etat={aujourdhui > j.jour ? "fait" : aujourdhui === j.jour ? "jour" : "a_venir"}
                libelle={t(`ckd.cohorte.jalons.${j.cle}`, {
                  n: j.cle === "jeudi" ? nbNudges : nbPropsSamedi,
                })}
              />
            ))}
          </div>
          <Chiffres
            cases={[
              {
                label: t("ckd.cohorte.poste.publies"),
                valeur: bilan.prevus > 0 ? `${Math.round((100 * bilan.publies) / bilan.prevus)} %` : "—",
                detail: t("ckd.cohorte.poste.publiesSur", { publies: bilan.publies, prevus: bilan.prevus }),
              },
              {
                label: t("ckd.cohorte.poste.mediane"),
                valeur: bilan.mediane !== null ? bilan.mediane.toLocaleString() : "—",
                detail: t("ckd.cohorte.poste.medianeDetail"),
              },
              {
                label: t("ckd.cohorte.poste.aDecider"),
                valeur: samedi ? String(nbPropsSamedi) : "—",
                detail: samedi ? t("ckd.cohorte.poste.aDeciderDetail") : t("ckd.cohorte.poste.aDeciderSamedi"),
              },
            ]}
          />
        </CarteOnglet>

        <CarteOnglet
          id="warmup"
          actif={onglet === "warmup"}
          onClick={() => setOnglet("warmup")}
          icone={<Flame className="size-5" aria-hidden />}
          ton="warmup"
          micro={t("ckd.cohorte.onglets.warmup")}
          titre={t("ckd.cohorte.warmup.titre", { s: libelleCohorte(lundiWarmup) })}
          sousTitre={t("ckd.cohorte.warmup.sousTitre", {
            count: comptesWarmup.length,
            date: date(lundiWarmup, { weekday: "long", day: "numeric", month: "long" }),
          })}
          badge={
            reste ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning-foreground">
                <Clock className="size-3.5" aria-hidden />
                {t("ckd.cohorte.dans", { duree: duree(reste) })}
              </span>
            ) : null
          }
        >
          <div className="space-y-2">
            <BarreStatuts parStatut={parStatut} />
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {STATUTS_WARMUP.map((s) => (
                <span key={s} className="inline-flex items-center gap-1.5">
                  <span className="size-2 rounded-[3px]" style={{ background: COULEUR_STATUT[s] }} aria-hidden />
                  {t(`ckd.cohorte.statuts.${s}`)} <span className="font-medium tabular-nums text-foreground">{parStatut[s]}</span>
                </span>
              ))}
            </div>
          </div>
          <Chiffres
            cases={[
              {
                label: t("ckd.cohorte.warmup.surTiktok"),
                valeur: `${etats.filter((e) => e.tiktok === "cree").length} / ${etats.length}`,
                detail: t("ckd.cohorte.warmup.surTiktokDetail"),
              },
              {
                label: t("ckd.cohorte.warmup.actif"),
                valeur: `${etats.filter((e) => e.warmup).length} / ${etats.length}`,
                detail: t("ckd.cohorte.warmup.actifDetail"),
              },
              {
                label: t("ckd.cohorte.warmup.start"),
                valeur: `${etats.filter((e) => e.start).length} / ${etats.length}`,
                detail: t("ckd.cohorte.warmup.startDetail", { count: etats.filter((e) => !e.start).length }),
                alerte: Boolean(reste) && etats.some((e) => !e.start),
              },
            ]}
          />
        </CarteOnglet>
      </div>

      <div role="tabpanel" id={`panneau-cohorte-${onglet}`} aria-labelledby={`onglet-cohorte-${onglet}`}>
        {onglet === "poste" ? (
          <OngletPoste
            lundi={lundiPoste}
            aujourdhui={aujourdhui}
            comptes={comptesPoste}
            chargement={poste.isPending}
            personnes={parId}
            propositions={propositions}
            controleJeudi={jeudi}
            controleSamedi={samedi}
            rendreControle={rendreControle}
            ouvrirGlobal={ouvrirGlobal}
          />
        ) : (
          <OngletWarmup
            lundi={lundiWarmup}
            aujourdhui={aujourdhui}
            maintenant={instant}
            comptes={comptesWarmup}
            chargement={warmup.isPending}
            personnes={parId}
            relever={() => relever.mutate()}
            releveEnCours={relever.isPending}
            resultatReleve={relever.data ?? null}
            erreurReleve={relever.error}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// En-tête : la paire et la frise
// ---------------------------------------------------------------------------

function EnTetePaire({
  lundiPoste,
  aujourdhui,
  estCourante,
  precedente,
  suivante,
  revenir,
}: {
  lundiPoste: string;
  aujourdhui: string;
  estCourante: boolean;
  precedente: () => void;
  suivante: () => void;
  revenir: () => void;
}) {
  const { t } = useTranslation();
  const { date } = useFormats();
  const lundiWarmup = ajouterJours(lundiPoste, 7);
  const sP = libelleCohorte(lundiPoste);
  const sW = libelleCohorte(lundiWarmup);
  const sSuivante = libelleCohorte(ajouterJours(lundiPoste, 14));
  const jours = Array.from({ length: 14 }, (_, i) => ajouterJours(lundiPoste, i));
  const iAuj = ecartJours(lundiPoste, aujourdhui);
  const court = { weekday: "narrow", day: "numeric" } as const;

  return (
    <section className="rounded-xl border bg-card p-4 shadow-xs sm:p-5" aria-label={t("ckd.cohorte.paire.aria")}>
      <div className="flex flex-wrap items-center gap-3">
        <Button size="icon-sm" variant="outline" aria-label={t("ckd.cohorte.paire.precedente")} onClick={precedente}>
          <ChevronLeft />
        </Button>
        <div className="min-w-0">
          <p className={MICRO_LABEL}>
            {t("ckd.cohorte.paire.semaine", {
              du: date(lundiPoste, { day: "numeric", month: "long" }),
              au: date(ajouterJours(lundiPoste, 6), { day: "numeric", month: "long" }),
            })}
          </p>
          <p className="flex flex-wrap items-center gap-2 text-lg font-semibold">
            <span>{t("ckd.cohorte.paire.poste", { s: sP })}</span>
            <ArrowRight className="size-4 text-muted-foreground" aria-hidden />
            <span>{t("ckd.cohorte.paire.warmup", { s: sW })}</span>
          </p>
        </div>
        <Button
          size="icon-sm"
          variant="outline"
          aria-label={t("ckd.cohorte.paire.suivante")}
          onClick={suivante}
          disabled={estCourante}
        >
          <ChevronRight />
        </Button>
        {!estCourante && (
          <Button size="sm" variant="ghost" onClick={revenir}>
            {t("ckd.cohorte.paire.revenir")}
          </Button>
        )}
      </div>

      {/* La frise : 14 jours, une ligne par cohorte. */}
      <div className="mt-4 overflow-x-auto pb-1">
        <div
          className="relative grid min-w-[760px] items-center gap-x-[3px] gap-y-2"
          style={{ gridTemplateColumns: "56px repeat(14, minmax(0, 1fr))" }}
        >
          {jours.map((j, i) => (
            <div
              key={j}
              className={cn(
                "text-center text-[11px] tabular-nums",
                i === iAuj ? "font-semibold text-foreground" : "text-muted-foreground",
              )}
              style={{ gridRow: 1, gridColumn: i + 2 }}
            >
              {i === iAuj ? (
                <span className="rounded-full bg-destructive px-1.5 py-0.5 text-white">{t("ckd.cohorte.frise.auj")}</span>
              ) : (
                date(j, court)
              )}
            </div>
          ))}
          {iAuj >= 0 && iAuj < 14 && (
            <div
              aria-hidden
              className="pointer-events-none z-10 w-0.5 justify-self-center self-stretch rounded-full bg-destructive/60"
              style={{ gridRow: "2 / 5", gridColumn: iAuj + 2 }}
            />
          )}

          <span className="text-xs font-semibold" style={{ gridRow: 2, gridColumn: 1 }}>
            {sP}
          </span>
          <div
            className="grid h-9 items-center rounded-md bg-foreground text-[11px] font-medium text-background"
            style={{ gridRow: 2, gridColumn: "2 / 8", gridTemplateColumns: "repeat(6, minmax(0, 1fr))" }}
          >
            <span className="inline-flex items-center gap-1 truncate pl-2">
              <Play className="size-3 fill-current" aria-hidden />
              {t("ckd.cohorte.frise.premiersPosts")}
            </span>
            <span />
            <span />
            <span className="truncate pl-1">{t("ckd.cohorte.frise.jeudi")}</span>
            <span />
            <span className="truncate pl-1">{t("ckd.cohorte.frise.samedi")}</span>
          </div>
          <div
            className="flex h-9 items-center truncate rounded-md border border-dashed px-2 text-[11px] text-muted-foreground"
            style={{ gridRow: 2, gridColumn: "8 / 16" }}
          >
            {t("ckd.cohorte.frise.suite")}
          </div>

          <span className="text-xs font-semibold" style={{ gridRow: 3, gridColumn: 1 }}>
            {sW}
          </span>
          <div
            className="flex h-9 items-center gap-1.5 truncate rounded-md border border-orange-300 bg-orange-50 px-2 text-[11px] font-medium text-orange-800 dark:border-orange-500/40 dark:bg-orange-500/10 dark:text-orange-200"
            style={{ gridRow: 3, gridColumn: "2 / 9" }}
          >
            <Flame className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{t("ckd.cohorte.frise.warmup")}</span>
          </div>
          <div
            className="flex h-9 items-center truncate rounded-md border bg-muted px-2 text-[11px] font-medium"
            style={{ gridRow: 3, gridColumn: "9 / 15" }}
          >
            {t("ckd.cohorte.frise.premiereSemaine")}
          </div>

          <span className="text-xs font-semibold text-muted-foreground" style={{ gridRow: 4, gridColumn: 1 }}>
            {sSuivante}
          </span>
          <div
            className="flex h-9 items-center truncate rounded-md border border-dashed border-orange-300 px-2 text-[11px] text-orange-800 dark:border-orange-500/40 dark:text-orange-200"
            style={{ gridRow: 4, gridColumn: "9 / 16" }}
          >
            {t("ckd.cohorte.frise.prochainWarmup", { s: sW })}
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Les deux onglets, en cartes
// ---------------------------------------------------------------------------

function CarteOnglet({
  id,
  actif,
  onClick,
  icone,
  ton,
  micro,
  titre,
  sousTitre,
  badge,
  children,
}: {
  id: Onglet;
  actif: boolean;
  onClick: () => void;
  icone: React.ReactNode;
  ton: "poste" | "warmup";
  micro: string;
  titre: string;
  sousTitre: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  // Le bouton d'onglet est le titre, étiré sur toute la carte : la carte entière
  // se clique, et le lecteur d'écran n'annonce que le titre.
  return (
    <div
      className={cn(
        "relative flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-4 shadow-xs transition-[box-shadow,border-color] sm:p-5",
        actif ? "border-foreground/60 ring-1 ring-foreground/60" : "hover:border-foreground/25",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "inline-flex size-10 shrink-0 items-center justify-center rounded-lg",
            ton === "poste"
              ? "bg-foreground text-background"
              : "border border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-500/30 dark:bg-orange-500/10 dark:text-orange-300",
          )}
        >
          {icone}
        </span>
        <div className="min-w-0 flex-1">
          <p className={MICRO_LABEL}>{micro}</p>
          <button
            id={`onglet-cohorte-${id}`}
            type="button"
            role="tab"
            aria-selected={actif}
            aria-controls={`panneau-cohorte-${id}`}
            tabIndex={actif ? 0 : -1}
            onClick={onClick}
            className="text-left text-lg font-semibold leading-tight after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-ring"
          >
            {titre}
          </button>
          <p className="text-sm text-muted-foreground">{sousTitre}</p>
        </div>
        {badge}
      </div>
      {children}
    </div>
  );
}

/** L'état de la cohorte en warm-up, en une barre : chaque statut sa part. */
function BarreStatuts({ parStatut }: { parStatut: Record<StatutWarmup, number> }) {
  const { t } = useTranslation();
  const total = STATUTS_WARMUP.reduce((a, s) => a + parStatut[s], 0);
  if (total === 0) return <p className="text-xs text-muted-foreground">{t("ckd.cohorte.warmup.aucun")}</p>;
  return (
    <div
      role="img"
      aria-label={STATUTS_WARMUP.map((s) => `${t(`ckd.cohorte.statuts.${s}`)} ${parStatut[s]}`).join(", ")}
      className="flex h-2.5 w-full gap-[2px] overflow-hidden rounded-full"
    >
      {STATUTS_WARMUP.filter((s) => parStatut[s] > 0).map((s) => (
        <div key={s} className="h-full min-w-[3px]" style={{ flexGrow: parStatut[s], flexBasis: 0, background: COULEUR_STATUT[s] }} />
      ))}
    </div>
  );
}

function Jalon({ etat, libelle }: { etat: "fait" | "jour" | "a_venir"; libelle: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        etat === "fait" && "border-success/30 bg-success/8 text-success-foreground",
        etat === "jour" && "border-foreground bg-foreground text-background",
        etat === "a_venir" && "text-muted-foreground",
      )}
    >
      {etat === "fait" ? (
        <Check className="size-3" aria-hidden />
      ) : etat === "jour" ? (
        <span className="size-1.5 rounded-full bg-current" aria-hidden />
      ) : (
        <Clock className="size-3" aria-hidden />
      )}
      {libelle}
    </span>
  );
}

function Chiffres({ cases }: { cases: { label: string; valeur: string; detail: string; alerte?: boolean }[] }) {
  return (
    <dl className="grid grid-cols-3 gap-3 border-t pt-3">
      {cases.map((c) => (
        <div key={c.label} className="min-w-0">
          <dt className={MICRO_LABEL}>{c.label}</dt>
          <dd className={cn("text-xl font-semibold tabular-nums", c.alerte && "text-warning-foreground")}>{c.valeur}</dd>
          <dd className="truncate text-xs text-muted-foreground">{c.detail}</dd>
        </div>
      ))}
    </dl>
  );
}
