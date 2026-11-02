/**
 * L'export du dashboard HM : des données brutes (0375) aux lignes du CSV et de
 * « Copier pour Claude ». Mêmes fonctions et mêmes mots que le dashboard.
 * Règles de format : une valeur par colonne, dates AAAA-MM-JJ, heures ISO UTC,
 * nombres sans unité, yes / no, case vide si inconnu.
 */
import type { TFunction } from "i18next";

import type { BonusAVenir } from "@/features/bonus/api";
import { problemesAncien } from "@/features/ckd/anciens/logique";
import { caseDuJour } from "@/features/ckd/calendrier/logique";
import { jourParis, minuitParis } from "@/features/ckd/cohorte/logique";
import { etatSemaine } from "@/features/ckd/semaineProchaine/logique";
import { libelleEtape } from "@/features/moteur/libelleEtape";
import { lundiDepartCompte } from "@/features/moteur/cohortes";
import { etapeCompte, qualiteAffichee } from "@/features/moteur/etapes";
import type { DonneesEtape } from "@/features/moteur/etapesApi";
import { lundiDe } from "@/features/moteur/semaines";
import { ajouterJours } from "@/features/onboarding/datesRuul";
import type { LignePaie, SemaineSuivante } from "@/features/paie/api";
import { consigneSuivante } from "@/features/paie/logique";
import type { ValeurCsv } from "@/lib/csv";

import type { CompteExport } from "./api";
import type { ColonneDetail, ColonneResume } from "./colonnes";

export const BLOCS = ["cette_semaine", "semaine_prochaine", "anciens", "paie", "tout"] as const;
export type Bloc = (typeof BLOCS)[number];
export const PERIODES = ["cette_semaine", "semaine_derniere", "14j", "30j"] as const;
export type PeriodeExport = (typeof PERIODES)[number];

/** Au-delà, « Copier pour Claude » propose le CSV. */
export const MAX_LIGNES_CLAUDE = 300;

export function bornesPeriode(p: PeriodeExport, aujourdhui: string): { debut: string; fin: string } {
  const lundi = lundiDe(aujourdhui);
  switch (p) {
    case "cette_semaine":
      return { debut: lundi, fin: aujourdhui };
    case "semaine_derniere":
      return { debut: ajouterJours(lundi, -7), fin: ajouterJours(lundi, -1) };
    case "14j":
      return { debut: ajouterJours(aujourdhui, -13), fin: aujourdhui };
    case "30j":
      return { debut: ajouterJours(aujourdhui, -29), fin: aujourdhui };
  }
}

export interface ContexteExport {
  aujourdhui: string;
  maintenant: Date;
  t: TFunction;
  langue: string;
  etapes: Map<string, DonneesEtape>;
  /** La paie de la dernière semaine finie, par posteur. */
  paie: Map<string, LignePaie>;
  semainePayee: string;
  suivante: Map<string, SemaineSuivante>;
  bonus: BonusAVenir[];
}

/** Le lundi de la cohorte du compte (premier post prévu, sinon fin du warm-up). */
export function lundiCohorte(c: CompteExport): string | null {
  return lundiDepartCompte(c.premier_jour, c.warmup_ends_at);
}

/** Cette semaine (première semaine de posts), semaine prochaine (warm-up), ou ancien. */
export function blocDuCompte(c: CompteExport, aujourdhui: string): "cette_semaine" | "semaine_prochaine" | "anciens" {
  const lundi = lundiDe(aujourdhui);
  const cohorte = lundiCohorte(c);
  if (cohorte === lundi) return "cette_semaine";
  if (cohorte === null || cohorte > lundi) return "semaine_prochaine";
  return "anciens";
}

export function filtrerBloc(comptes: CompteExport[], bloc: Bloc, ctx: ContexteExport): CompteExport[] {
  if (bloc === "tout") return comptes;
  if (bloc === "paie") {
    const avecBonus = new Set(ctx.bonus.map((b) => b.poster_id));
    return comptes.filter((c) => ctx.paie.has(c.poster_id) || avecBonus.has(c.poster_id));
  }
  return comptes.filter((c) => blocDuCompte(c, ctx.aujourdhui) === bloc);
}

/** Les comptes dans l'ordre de l'export, et le premier compte de chaque posteur (pour la paie et les bonus). */
function premiersComptes(comptes: CompteExport[]): Set<string> {
  const premier = new Map<string, CompteExport>();
  for (const c of comptes) {
    const p = premier.get(c.poster_id);
    if (!p || c.cree_le < p.cree_le) premier.set(c.poster_id, c);
  }
  return new Set([...premier.values()].map((c) => c.compte_id));
}

function iso(d: string | null | undefined): string | null {
  return d ? new Date(d).toISOString() : null;
}

function mediane(v: number[]): number | null {
  if (v.length === 0) return null;
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : Math.round((s[m - 1]! + s[m]!) / 2);
}

function jours(debut: string, fin: string): string[] {
  const out: string[] = [];
  for (let j = debut; j <= fin; j = ajouterJours(j, 1)) out.push(j);
  return out;
}

function actionSuggeree(c: CompteExport, bloc: ReturnType<typeof blocDuCompte>, ctx: ContexteExport): string | null {
  const { t } = ctx;
  if (bloc === "anciens") {
    const p = problemesAncien({ ...c, premier_jour: c.premier_jour ?? "", warmup_lance: Boolean(c.warmup_started_at) }, ctx.aujourdhui);
    return p[0] ? t(`accueilHm.anciens.actions.${p[0]}`) : null;
  }
  if (bloc === "cette_semaine") {
    return c.diagnostic.badge !== "ok" ? t(`accueilHm.calendrier.actions.${c.diagnostic.badge}`) : null;
  }
  const e = etatSemaine(
    {
      compte_id: c.compte_id,
      poster_id: c.poster_id,
      hm_id: c.hm_id,
      handle: c.handle,
      pays: c.pays,
      type: "premier",
      ancien_handle: null,
      is_active: c.is_active,
      cree_le: c.cree_le,
      warmup_lance_le: c.warmup_started_at,
      warmup_fin: c.warmup_ends_at,
      reposts_le: c.reposts_le,
      releves:
        c.tiktok_existe === null
          ? []
          : [
              {
                at: ctx.maintenant.toISOString(),
                existe: c.tiktok_existe,
                cree_tiktok_at: c.tiktok_cree_le,
                abonnements: c.follows,
                likes: c.likes,
                abonnes: null,
                videos: null,
              },
            ],
    },
    lundiCohorte(c) ?? ajouterJours(lundiDe(ctx.aujourdhui), 7),
    ctx.aujourdhui,
  );
  return e.retard
    ? `${t("accueilHm.prochaine.statuts.en_retard")} : ${t(`accueilHm.prochaine.etapes.${e.retard}`)}`
    : null;
}

/** Résumé : une ligne par compte. */
export function lignesResume(
  comptes: CompteExport[],
  debut: string,
  fin: string,
  ctx: ContexteExport,
): Record<ColonneResume, ValeurCsv>[] {
  const { t, aujourdhui } = ctx;
  const premiers = premiersComptes(comptes);
  const finPassee = fin < aujourdhui ? fin : aujourdhui;
  const sept = { de: ajouterJours(aujourdhui, -7), a: ajouterJours(aujourdhui, -1) };

  return comptes.map((c) => {
    const bloc = blocDuCompte(c, aujourdhui);
    const d = ctx.etapes.get(c.compte_id);
    const publies = c.posts.filter((p) => p.url);
    const dernierPublie = publies.map((p) => p.jour).sort().pop() ?? d?.dernierPublie ?? null;
    const etat = etapeCompte(
      {
        compteId: c.compte_id,
        isActive: c.is_active,
        arrete: d?.arrete ?? false,
        warmupStartedAt: c.warmup_started_at,
        warmupEndsAt: c.warmup_ends_at,
        tiktokExiste: d?.tiktokExiste ?? c.tiktok_existe,
        premierJour: c.premier_jour,
        dernierPublie,
      },
      aujourdhui,
      ctx.maintenant,
    );
    const qualite = qualiteAffichee(etat, d?.qualite);
    const periode = c.posts.filter((p) => p.jour >= debut && p.jour <= finPassee);
    const incomplets = jours(debut, finPassee)
      .filter((j) => j < aujourdhui)
      .map((j) => caseDuJour(c.posts.map((p) => ({ ...p })), j, aujourdhui))
      .filter((x) => x.etat === "partiel")
      .reduce((n, x) => n + (x.prevus - x.publies), 0);
    const duJour = c.posts.filter((p) => p.jour === aujourdhui);
    const mesures7 = c.posts.filter((p) => p.jour >= sept.de && p.jour <= sept.a && p.mesure && p.vues !== null);
    const dernier = [...publies].sort((a, b) => (a.jour + a.rang).localeCompare(b.jour + b.rang)).pop();
    const cohorte = lundiCohorte(c);
    const enWarmup = cohorte === null || cohorte > lundiDe(aujourdhui);
    const premier = premiers.has(c.compte_id);
    const paie = premier ? ctx.paie.get(c.poster_id) : undefined;
    const suivante = premier ? ctx.suivante.get(c.poster_id) : undefined;
    const bonus = premier ? ctx.bonus.filter((b) => b.poster_id === c.poster_id) : [];
    const consigne = suivante && paie ? consigneSuivante(ctx.semainePayee, suivante, paie.tarif, (n) => String(n)) : null;
    const valeursConsigne = consigne
      ? {
          ...consigne.valeurs,
          ...(consigne.valeurs.raison ? { raison: t(`paie.suivante.raisons.${consigne.valeurs.raison}`) } : {}),
        }
      : null;

    return {
      hm: c.hm_prenom,
      poster_name: c.poster_nom,
      country: c.pays,
      language: c.langue,
      tiktok_handle: c.handle,
      tiktok_url: c.handle ? `https://www.tiktok.com/@${c.handle}` : null,
      cohort_monday: cohorte,
      posting_week_number: etat.semaine ?? null,
      stage: libelleEtape(etat, t, ctx.langue, { maintenant: ctx.maintenant, dateIso: true }),
      quality: qualite ? t(`etapes.qualite.${qualite}`) : null,
      accounts_count: c.comptes_actifs,
      posts_expected_week: periode.length,
      posts_done_week: periode.filter((p) => p.url).length,
      posts_missed_week: periode.filter((p) => !p.url && p.jour < aujourdhui).length,
      links_missing_week: incomplets,
      posts_done_today: duJour.filter((p) => p.url).length,
      posts_expected_today: duJour.length,
      last_post_date: dernierPublie,
      views_median_7d: mediane(mesures7.map((p) => p.vues!)),
      views_best_7d: mesures7.length > 0 ? Math.max(...mesures7.map((p) => p.vues!)) : null,
      views_last_post: dernier?.mesure ? dernier.vues : null,
      dead_posts_7d: c.premier_jour && c.premier_jour < aujourdhui ? c.diagnostic.morts : null,
      country_median_views: c.mediane_pays,
      tiktok_account_created: c.tiktok_cree_le ? jourParis(c.tiktok_cree_le) : null,
      warmup_started_at: iso(c.warmup_started_at),
      follows: c.follows,
      likes: c.likes,
      reposts_done: Boolean(c.reposts_le),
      // Warm-up pas lancé : il rejoint la cohorte du lundi qui vient.
      warmup_deadline: enWarmup ? minuitParis(cohorte ?? ajouterJours(lundiDe(aujourdhui), 7)).toISOString() : null,
      diagnostic: c.premier_jour && c.premier_jour < aujourdhui ? t(`ckd.diagnostic.badges.${c.diagnostic.badge}`) : null,
      suggested_action: actionSuggeree(c, bloc, ctx),
      decision_this_week: c.decision?.decision ? t(`ckd.decisions.${c.decision.decision}`) : null,
      decision_done: c.decision?.decision ? Boolean(c.decision.fait_at) : null,
      pay_week_amount: paie ? paie.montant : null,
      pay_deduction: paie ? paie.retenue : null,
      pay_status: paie ? (paie.paye_at ? t("bonus.statuts.paye") : t(`paie.statuts.${paie.statut}`)) : null,
      next_week_milestone: consigne && valeursConsigne ? t(`paie.suivante.${consigne.cle}`, valeursConsigne) : null,
      upwork_contract_url: c.upwork_contrat_url,
      bonus_upcoming_amount: bonus.length > 0 ? Math.round(bonus.reduce((n, b) => n + b.montant, 0) * 100) / 100 : null,
      bonus_upcoming_date: bonus.length > 0 ? bonus.map((b) => b.lundi_bonus).sort()[0]! : null,
      bonus_detail: bonus.length > 0 ? bonus.map((b) => b.detail).join("; ") : null,
    };
  });
}

/** Détail : une ligne par post de la période. */
export function lignesDetail(
  comptes: CompteExport[],
  debut: string,
  fin: string,
  aujourdhui: string,
): Record<ColonneDetail, ValeurCsv>[] {
  return comptes
    .flatMap((c) =>
      c.posts
        .filter((p) => p.jour >= debut && p.jour <= fin)
        .map((p) => ({
          date: p.jour,
          tiktok_handle: c.handle,
          poster_name: c.poster_nom,
          slot: p.rang,
          status: p.url ? "published" : p.jour < aujourdhui ? "missed" : "planned",
          published_at: p.url ? iso(p.publie_at) : null,
          post_url: p.url,
          views: p.url ? p.vues : null,
          likes: p.url ? p.likes : null,
          hours_measured_after:
            p.url && p.publie_at && p.stats_maj_at
              ? Math.round((Date.parse(p.stats_maj_at) - Date.parse(p.publie_at)) / 3_600_000)
              : null,
        })),
    )
    .sort(
      (a, b) =>
        String(a.date).localeCompare(String(b.date)) ||
        String(a.tiktok_handle).localeCompare(String(b.tiktok_handle)) ||
        Number(a.slot) - Number(b.slot),
    );
}

/** Seules les colonnes cochées, dans l'ordre. */
export function garderColonnes<C extends string>(lignes: Record<C, ValeurCsv>[], colonnes: C[]): ValeurCsv[][] {
  return lignes.map((l) => colonnes.map((c) => l[c]));
}

/** hm_[prénom]_[bloc]_[AAAA-MM-JJ].csv */
export function nomFichier(prenom: string, bloc: Bloc, aujourdhui: string): string {
  const p =
    prenom
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "hm";
  return `hm_${p}_${bloc}_${aujourdhui}.csv`;
}
