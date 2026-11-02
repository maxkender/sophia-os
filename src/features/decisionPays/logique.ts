/**
 * Page « Pays » (2/11) : les indicateurs de décision, sans réseau.
 *
 * Données (pays_tableau, 0512) : par pays et par semaine (lundi), les vues
 * gagnées, les proceeds RevenueCat (EUR), le coût de la paie ($) ; par pays,
 * les posteurs et la file de recrutement.
 *
 * Périodes : « 7 jours » = la dernière semaine complète, « 28 jours » = les 4
 * dernières, « 8 semaines » = les 8 dernières. La semaine en cours n'est
 * jamais comptée (vues et proceeds incomplets).
 */

export type Periode = "7j" | "28j" | "8s";
export const PERIODES: readonly Periode[] = ["7j", "28j", "8s"];
export const SEMAINES_PERIODE: Record<Periode, number> = { "7j": 1, "28j": 4, "8s": 8 };

export interface SemainePays {
  pays: string;
  semaine: string;
  vues: number;
  comptes: number;
  sous_seuil: number;
  proceeds: number;
  proceeds_new: number | null;
  transactions: number;
  incomplet: boolean;
  cout_reel: number | null;
  cout_estime: number | null;
  comptes_publies: number;
}

export interface InfoPays {
  pays: string;
  zone: string | null;
  zone_retiree: boolean;
  tarif: number | null;
  objectif: number | null;
  note: string | null;
  premier_post: string | null;
  posteurs_actifs: number;
  comptes_actifs: number;
  cohorte_en_cours: number;
  cohorte_suivante: number;
  start_tuesday: number;
  postpone: number;
  /** Marché de langue : les pays regroupés (regrouperParLangue). */
  membres?: string[];
}

export interface OffreAttente {
  titre: string | null;
  freelancer: string | null;
  debut_at: string | null;
}

export interface HmZone {
  id: string;
  nom: string | null;
  zone: string | null;
}

export interface TableauPays {
  aujourdhui: string;
  lundi: string;
  semaines: SemainePays[];
  pays: InfoPays[];
  offres: OffreAttente[];
  hms: HmZone[];
  reglages: { taux_usd_eur?: number; seuil_vues_semaine?: number };
  devise: string | null;
  lecture: { at: string; ok: boolean; detail: Record<string, unknown> | null } | null;
}

export type Recommandation = "recruter" | "maintenir" | "reduire" | "arreter" | "exclu";

export interface LignePays {
  pays: string;
  zone: string | null;
  vues: number;
  proceeds: number;
  proceeds_new: number | null;
  rpm: number | null;
  rpm_new: number | null;
  baseline: number | null;
  incremental: number | null;
  /** Proceeds qui ne viennent pas de nous : baseline × semaines, ou tout le revenu d'un pays sans posteur. */
  sans_posteurs: number;
  rpm_incremental: number | null;
  cout: number | null;
  cout_estime: boolean;
  roi: number | null;
  roi_4s: number | null;
  cout_1000_vues: number | null;
  vues_par_compte: number | null;
  pct_sous_seuil: number | null;
  revenu_sans_posteurs: boolean;
  sparkline: number[];
  actifs: number;
  pipeline: number;
  offres: number;
  objectif: number;
  objectif_manuel: boolean;
  objectif_suggere: number;
  manque: number;
  recommandation: Recommandation;
  raison: string;
  info: InfoPays;
}

export const DEBUT_DONNEES = "2026-08-03";

export function ajouterJours(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Le lundi de la semaine d'un jour. */
export function lundiDe(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  const isodow = ((d.getUTCDay() + 6) % 7) + 1;
  return ajouterJours(iso, 1 - isodow);
}

/** Les lundis des n dernières semaines complètes (décalées de `decalage` semaines), du plus ancien au plus récent. */
export function semainesCompletes(lundiCourant: string, n: number, decalage = 0): string[] {
  return Array.from({ length: n }, (_, i) => ajouterJours(lundiCourant, -7 * (n - i + decalage)));
}

const arrondi = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
const div = (a: number | null, b: number | null): number | null => (a === null || b === null || b === 0 ? null : a / b);

/**
 * Baseline : proceeds moyens par semaine AVANT la semaine du 1er post du pays
 * (semaines complètes depuis le 3 août). null si aucune semaine avant (le pays
 * postait déjà au début des données) ou si le pays n'a jamais posté.
 */
export function baseline(semaines: SemainePays[], premierPost: string | null): number | null {
  if (!premierPost) return null;
  const avant = semaines.filter((s) => s.semaine >= DEBUT_DONNEES && s.semaine < lundiDe(premierPost));
  const nbSemaines = Math.round((Date.parse(lundiDe(premierPost)) - Date.parse(DEBUT_DONNEES)) / (7 * 86_400_000));
  if (nbSemaines <= 0) return null;
  return avant.reduce((t, s) => t + s.proceeds, 0) / nbSemaines;
}

/** Objectif suggéré (comptes) selon le ROI : > 3 → +30 %, 1 à 3 → stable, < 1 → −30 %, < 0,5 sur 4 semaines → 0. */
export function objectifSuggere(base: number, roi: number | null, roi4s: number | null): number {
  if (roi4s !== null && roi4s < 0.5) return 0;
  if (roi === null) return base;
  if (roi > 3) return Math.ceil(base * 1.3);
  if (roi >= 1) return base;
  return Math.floor(base * 0.7);
}

const MOTS_PAYS: [RegExp, string][] = [
  // 2/11 : avant « german » (« German speaker based in Switzerland » = CH).
  [/switzerland|swiss/i, "CH"], [/new zealand/i, "NZ"], [/canada/i, "CA"], [/ireland/i, "IE"],
  [/hungar/i, "HU"], [/israel/i, "IL"], [/gree(ce|k)/i, "GR"], [/bulgar/i, "BG"], [/finn|finland/i, "FI"],
  [/denmark|danish/i, "DK"], [/\bspain\b|spanish speaker\/ in spain/i, "ES"], [/german/i, "DE"], [/france|french/i, "FR"],
  [/ital/i, "IT"], [/poland|polish/i, "PL"], [/turk|türk/i, "TR"], [/roman/i, "RO"], [/czech/i, "CZ"], [/sloven/i, "SI"],
  [/slovak/i, "SK"], [/croat/i, "HR"], [/swed/i, "SE"], [/norw/i, "NO"], [/netherlands|dutch/i, "NL"], [/\buk\b|united kingdom|britain/i, "GB"],
  [/\bus\b|usa|united states/i, "US"], [/brazil/i, "BR"], [/portugal/i, "PT"], [/kazakh/i, "KZ"], [/serbia/i, "RS"], [/eston/i, "EE"],
  [/lithuan/i, "LT"], [/latvi/i, "LV"], [/japan/i, "JP"], [/\buae\b|emirates|dubai|\barab\b/i, "AE"], [/colombia/i, "CO"],
  [/argentin/i, "AR"], [/mexic/i, "MX"], [/austral/i, "AU"], [/belgi/i, "BE"],
];

/** Le pays d'une offre d'après son titre (mots-clés), ou null. */
export function paysDeTitre(titre: string | null | undefined): string | null {
  if (!titre) return null;
  for (const [re, code] of MOTS_PAYS) if (re.test(titre)) return code;
  return null;
}

/** Les codes ISO d'une zone de recrutement (« Germany + Norway + Sweden »). */
export function paysDeZone(zone: string | null | undefined, nomVersCode: (nom: string) => string | null): string[] {
  if (!zone) return [];
  return zone
    .split(/\s*[+,/]\s*/)
    .map((nom) => nomVersCode(nom.trim()))
    .filter((c): c is string => Boolean(c));
}

const SPECIAUX: Record<string, string> = { uk: "GB", us: "US", usa: "US", uae: "AE", czechia: "CZ", turkey: "TR", "türkiye": "TR" };
/** Codes historiques ou non standard qu'Intl nomme comme un vrai pays (DD « Germany », FX « France »…). */
const CODES_HISTORIQUES = new Set(["AN", "BU", "CS", "DD", "EU", "EZ", "FX", "NT", "QO", "SU", "TP", "UN", "YD", "YU", "ZR", "ZZ"]);

let indexRegions: Map<string, string> | null = null;

/** Nom de pays anglais → code ISO (Intl, plus quelques abréviations). */
export function nomVersCode(nom: string): string | null {
  const n = nom.trim().toLowerCase();
  if (!n) return null;
  if (SPECIAUX[n]) return SPECIAUX[n];
  if (/^[a-z]{2}$/.test(n)) return n.toUpperCase();
  if (!indexRegions) {
    indexRegions = new Map();
    try {
      const noms = new Intl.DisplayNames(["en"], { type: "region" });
      for (let i = 0; i < 26; i++) {
        for (let j = 0; j < 26; j++) {
          const code = String.fromCharCode(65 + i, 65 + j);
          let affiche: string | undefined;
          try {
            affiche = noms.of(code);
          } catch {
            affiche = undefined;
          }
          if (affiche && affiche !== code && !CODES_HISTORIQUES.has(code) && !indexRegions.has(affiche.toLowerCase())) indexRegions.set(affiche.toLowerCase(), code);
        }
      }
    } catch {
      // pas d'Intl.DisplayNames : seules les abréviations sont reconnues
    }
  }
  return indexRegions.get(n) ?? null;
}

/** Toutes les lignes du tableau, pour une période. */
export function lignesPays(t: TableauPays, periode: Periode, decalage = 0): LignePays[] {
  const taux = Number(t.reglages.taux_usd_eur ?? 0.86);
  const lundi = t.lundi;
  const fenetre = new Set(semainesCompletes(lundi, SEMAINES_PERIODE[periode], decalage));
  const fenetre4 = new Set(semainesCompletes(lundi, 4, decalage));
  const huit = semainesCompletes(lundi, 8);
  const parPays = new Map<string, SemainePays[]>();
  for (const s of t.semaines) {
    const l = parPays.get(s.pays) ?? [];
    l.push(s);
    parPays.set(s.pays, l);
  }
  const offresPays = new Map<string, number>();
  for (const o of t.offres) {
    const p = paysDeTitre(o.titre);
    if (p) offresPays.set(p, (offresPays.get(p) ?? 0) + 1);
  }

  const calcul = (semaines: SemainePays[], fen: Set<string>, base: number | null) => {
    const dans = semaines.filter((s) => fen.has(s.semaine));
    const vues = dans.reduce((n, s) => n + s.vues, 0);
    const proceeds = dans.reduce((n, s) => n + s.proceeds, 0);
    const avecNew = dans.filter((s) => s.proceeds_new !== null);
    const proceedsNew = avecNew.length ? avecNew.reduce((n, s) => n + (s.proceeds_new ?? 0), 0) : null;
    let cout: number | null = null;
    let estime = false;
    for (const s of dans) {
      const c = s.cout_reel ?? s.cout_estime;
      if (c === null) continue;
      if (s.cout_reel === null) estime = true;
      cout = (cout ?? 0) + c * taux;
    }
    const incremental = base === null ? proceeds : proceeds - base * fen.size;
    const comptesSemaines = dans.reduce((n, s) => n + s.comptes, 0);
    const sousSeuil = dans.reduce((n, s) => n + s.sous_seuil, 0);
    return { vues, proceeds, proceedsNew, cout, estime, incremental, comptesSemaines, sousSeuil };
  };

  return t.pays
    .map((info): LignePays => {
      const semaines = parPays.get(info.pays) ?? [];
      const base = baseline(semaines, info.premier_post);
      const p = calcul(semaines, fenetre, base);
      const p4 = calcul(semaines, fenetre4, base);
      const roi = p.cout ? p.incremental / p.cout : null;
      const roi4 = p4.cout ? p4.incremental / p4.cout : null;
      const offres = offresPays.get(info.pays) ?? 0;
      const actifs = info.comptes_actifs;
      const pipeline = actifs + info.cohorte_en_cours + info.cohorte_suivante + offres;
      const sansPosteurs = p.proceeds > 0 && p.vues === 0 && actifs === 0 && info.cohorte_en_cours === 0 && info.cohorte_suivante === 0;
      const suggere = sansPosteurs ? 0 : objectifSuggere(actifs, roi, roi4);
      const objectif = info.objectif ?? suggere;
      const manque = objectif - pipeline;
      let recommandation: Recommandation;
      let raison: string;
      if (sansPosteurs) {
        recommandation = "exclu";
        raison = "revenu sans posteurs : hors décision";
      } else if (info.zone_retiree) {
        recommandation = "arreter";
        raison = "pays retiré des zones";
      } else if (roi4 !== null && roi4 < 0.5 && info.objectif === null) {
        recommandation = "arreter";
        raison = `ROI ${arrondi(roi4, 1)} sur 4 semaines (< 0,5)`;
      } else if (manque > 0) {
        recommandation = "recruter";
        raison = `objectif ${objectif} comptes, ${pipeline} en place ou en route${roi !== null ? ` · ROI ${arrondi(roi, 1)}` : ""}`;
      } else if (objectif < actifs) {
        // Réduire seulement si l'objectif passe sous les comptes actifs ; des
        // cohortes ou offres en route au-delà de l'objectif, c'est « maintenir ».
        recommandation = "reduire";
        raison = `${actifs} comptes actifs pour un objectif de ${objectif}${roi !== null ? ` · ROI ${arrondi(roi, 1)}` : ""}`;
      } else if (manque < 0) {
        recommandation = "maintenir";
        raison = `objectif ${objectif} couvert : ${pipeline} en place ou en route${roi !== null ? ` · ROI ${arrondi(roi, 1)}` : ""}`;
      } else {
        recommandation = "maintenir";
        raison = roi !== null ? `ROI ${arrondi(roi, 1)}, objectif atteint` : "objectif atteint";
      }
      return {
        pays: info.pays,
        zone: info.zone,
        vues: p.vues,
        proceeds: arrondi(p.proceeds),
        proceeds_new: p.proceedsNew === null ? null : arrondi(p.proceedsNew),
        rpm: div(p.proceeds, p.vues) === null ? null : arrondi((p.proceeds / p.vues) * 1000, 3),
        rpm_new: p.proceedsNew === null || !p.vues ? null : arrondi((p.proceedsNew / p.vues) * 1000, 3),
        baseline: base === null ? null : arrondi(base),
        incremental: arrondi(p.incremental),
        sans_posteurs: arrondi(sansPosteurs ? p.proceeds : Math.max(0, p.proceeds - p.incremental)),
        rpm_incremental: p.vues ? arrondi((p.incremental / p.vues) * 1000, 3) : null,
        cout: p.cout === null ? null : arrondi(p.cout),
        cout_estime: p.estime,
        roi: roi === null ? null : arrondi(roi, 2),
        roi_4s: roi4 === null ? null : arrondi(roi4, 2),
        cout_1000_vues: p.cout !== null && p.vues ? arrondi((p.cout / p.vues) * 1000, 3) : null,
        vues_par_compte: p.comptesSemaines ? Math.round(p.vues / p.comptesSemaines) : null,
        pct_sous_seuil: p.comptesSemaines ? arrondi((p.sousSeuil / p.comptesSemaines) * 100, 0) : null,
        revenu_sans_posteurs: sansPosteurs,
        sparkline: huit.map((w) => semaines.find((s) => s.semaine === w)?.proceeds ?? 0),
        actifs,
        pipeline,
        offres,
        objectif,
        objectif_manuel: info.objectif !== null,
        objectif_suggere: suggere,
        manque,
        recommandation,
        raison,
        info,
      };
    })
    .filter((l) => l.vues > 0 || l.proceeds > 0 || l.pipeline > 0 || l.objectif_manuel);
}

export interface Totaux {
  proceeds: number;
  vues: number;
  rpm: number | null;
  roi: number | null;
  a_recruter: number;
}

/** En haut de la page : les totaux (les pays « revenu sans posteurs » sont hors ROI). */
export function totaux(lignes: LignePays[]): Totaux {
  const decision = lignes.filter((l) => !l.revenu_sans_posteurs);
  const proceeds = lignes.reduce((n, l) => n + l.proceeds, 0);
  const vues = lignes.reduce((n, l) => n + l.vues, 0);
  const incremental = decision.reduce((n, l) => n + (l.cout !== null ? (l.incremental ?? 0) : 0), 0);
  const cout = decision.reduce((n, l) => n + (l.cout ?? 0), 0);
  return {
    proceeds: arrondi(proceeds),
    vues,
    rpm: vues ? arrondi((proceeds / vues) * 1000, 3) : null,
    roi: cout ? arrondi(incremental / cout, 2) : null,
    a_recruter: decision.filter((l) => l.recommandation === "recruter").reduce((n, l) => n + Math.max(0, l.manque), 0),
  };
}

export interface CibleHm {
  hm: HmZone;
  lignes: { pays: string; nombre: number; raison: string }[];
  total: number;
}

/**
 * « Envoyer les objectifs aux HMs » (préparation seulement) : chaque pays à
 * recruter va à la HM dont la zone de recrutement le contient. Les pays sans
 * HM restent dans « sans HM ».
 */
export function ciblesParHm(lignes: LignePays[], hms: HmZone[]): { cibles: CibleHm[]; sansHm: { pays: string; nombre: number }[] } {
  const zones = hms.map((hm) => ({ hm, pays: new Set(paysDeZone(hm.zone, nomVersCode)) }));
  const cibles = new Map<string, CibleHm>();
  const sansHm: { pays: string; nombre: number }[] = [];
  for (const l of lignes) {
    if (l.recommandation !== "recruter" || l.manque <= 0) continue;
    const z = zones.find((x) => x.pays.has(l.pays));
    if (!z) {
      sansHm.push({ pays: l.pays, nombre: l.manque });
      continue;
    }
    const c = cibles.get(z.hm.id) ?? { hm: z.hm, lignes: [], total: 0 };
    c.lignes.push({ pays: l.pays, nombre: l.manque, raison: l.raison });
    c.total += l.manque;
    cibles.set(z.hm.id, c);
  }
  return { cibles: [...cibles.values()].sort((a, b) => b.total - a.total), sansHm };
}

/**
 * 2/11 (Max) : les pays de même langue comptent comme un seul marché, sauf
 * l'espagnol, décliné en Espagne (es) et LATAM (es-419), comme les langues de
 * l'OS (pt et pt-BR restent aussi distincts). Un pays absent de la liste reste
 * seul (TR, HU, IT…).
 */
const LANGUE_PAYS: Record<string, string[]> = {
  de: ["DE", "AT", "CH", "LI"],
  fr: ["FR", "BE", "LU", "MC", "RE", "GP", "MQ", "GF", "YT", "NC", "PF"],
  en: ["US", "GB", "CA", "AU", "NZ", "IE"],
  es: ["ES"],
  "es-419": ["MX", "CO", "AR", "CL", "PE", "EC", "VE", "UY", "PY", "BO", "CR", "DO", "GT", "HN", "SV", "NI", "PA", "CU", "PR"],
  pt: ["PT"],
  "pt-BR": ["BR"],
  el: ["GR", "CY"],
  ar: ["AE", "SA", "QA", "OM", "KW", "BH", "EG", "MA", "DZ", "TN", "JO", "LB", "IQ"],
  ru: ["RU", "BY", "KZ"],
};
const MARCHE_DE_PAYS = new Map(Object.entries(LANGUE_PAYS).flatMap(([l, ps]) => ps.map((p) => [p, l] as const)));

/** Le marché d'un pays : le code de langue (« de », « es-419 »), ou le pays lui-même. */
export function marcheDe(pays: string): string {
  return MARCHE_DE_PAYS.get(pays) ?? pays;
}

/** Le tableau, regroupé par marché de langue (mêmes champs, `pays` = le marché). */
export function regrouperParLangue(t: TableauPays): TableauPays {
  const somme = (a: number | null, b: number | null) => (a === null && b === null ? null : (a ?? 0) + (b ?? 0));
  const semaines = new Map<string, SemainePays>();
  for (const s of t.semaines) {
    const m = marcheDe(s.pays);
    const cle = `${m}|${s.semaine}`;
    const x = semaines.get(cle);
    if (!x) {
      semaines.set(cle, { ...s, pays: m });
      continue;
    }
    x.vues += s.vues;
    x.comptes += s.comptes;
    x.sous_seuil += s.sous_seuil;
    x.proceeds += s.proceeds;
    x.proceeds_new = somme(x.proceeds_new, s.proceeds_new);
    x.transactions += s.transactions;
    x.incomplet = x.incomplet || s.incomplet;
    x.cout_reel = somme(x.cout_reel, s.cout_reel);
    x.cout_estime = somme(x.cout_estime, s.cout_estime);
    x.comptes_publies += s.comptes_publies;
  }
  const groupes = new Map<string, InfoPays[]>();
  for (const p of t.pays) {
    const m = marcheDe(p.pays);
    groupes.set(m, [...(groupes.get(m) ?? []), p]);
  }
  const pays = [...groupes.entries()].map(([m, membres]): InfoPays => {
    const principal = [...membres].filter((p) => p.zone).sort((a, b) => b.comptes_actifs - a.comptes_actifs)[0] ?? membres[0];
    const propre = membres.find((p) => p.pays === m);
    const posts = membres.map((p) => p.premier_post).filter((d): d is string => Boolean(d)).sort();
    const total = (k: "posteurs_actifs" | "comptes_actifs" | "cohorte_en_cours" | "cohorte_suivante" | "start_tuesday" | "postpone") =>
      membres.reduce((n, p) => n + (p[k] ?? 0), 0);
    return {
      pays: m,
      zone: principal.zone,
      zone_retiree: membres.every((p) => p.zone_retiree),
      tarif: principal.tarif,
      objectif: propre?.objectif ?? null,
      note: propre?.note ?? null,
      premier_post: posts[0] ?? null,
      posteurs_actifs: total("posteurs_actifs"),
      comptes_actifs: total("comptes_actifs"),
      cohorte_en_cours: total("cohorte_en_cours"),
      cohorte_suivante: total("cohorte_suivante"),
      start_tuesday: total("start_tuesday"),
      postpone: total("postpone"),
      membres: membres.map((p) => p.pays).filter((p) => /^[A-Z]{2}$/.test(p)).sort(),
    };
  });
  return { ...t, semaines: [...semaines.values()], pays };
}

/** « Allemand », « Espagnol d'Amérique latine »… ; un pays seul garde son code. */
export function libelleMarche(cle: string, langue: string): string {
  if (/^[A-Z]{2}$/.test(cle)) return cle;
  try {
    const nom = new Intl.DisplayNames([langue], { type: "language" }).of(cle);
    return nom ? nom.charAt(0).toUpperCase() + nom.slice(1) : cle;
  } catch {
    return cle;
  }
}

// ---------------------------------------------------------------------------
// Refonte (2/11) : vue d'ensemble, à faire, top / flop, recrutement, comptes.
// ---------------------------------------------------------------------------

export interface TotauxPeriode {
  proceeds: number;
  cout: number;
  roi: number | null;
  rpm: number | null;
  vues: number;
  sans_posteurs: number;
  incremental: number;
}

/**
 * Les totaux d'une période. ROI global = Σ proceeds incrémentaux ÷ Σ paie, sur
 * les pays qui ont une paie ; « sans posteurs » = baseline des pays où l'on
 * poste + tout le revenu des pays sans posteur.
 */
export function totauxPeriode(lignes: LignePays[]): TotauxPeriode {
  const avecPaie = lignes.filter((l) => l.cout !== null && l.cout > 0 && !l.revenu_sans_posteurs);
  const proceeds = lignes.reduce((n, l) => n + l.proceeds, 0);
  const vues = lignes.reduce((n, l) => n + l.vues, 0);
  const cout = avecPaie.reduce((n, l) => n + (l.cout ?? 0), 0);
  const incremental = avecPaie.reduce((n, l) => n + (l.incremental ?? 0), 0);
  return {
    proceeds: arrondi(proceeds),
    cout: arrondi(cout),
    roi: cout ? arrondi(incremental / cout, 1) : null,
    rpm: vues ? arrondi((proceeds / vues) * 1000, 2) : null,
    vues,
    sans_posteurs: arrondi(lignes.reduce((n, l) => n + l.sans_posteurs, 0)),
    incremental: arrondi(incremental),
  };
}

/** Variation en % (null si la période d'avant est vide). */
export function variation(maintenant: number | null, avant: number | null): number | null {
  if (maintenant === null || avant === null || avant === 0) return null;
  return Math.round(((maintenant - avant) / Math.abs(avant)) * 100);
}

export interface SemaineTotale {
  semaine: string;
  proceeds: number;
  cout: number;
  vues: number;
}

/** Les n dernières semaines complètes, tous pays : proceeds, paie (EUR), vues. */
export function serieHebdo(t: TableauPays, n = 8): SemaineTotale[] {
  const taux = Number(t.reglages.taux_usd_eur ?? 0.86);
  return semainesCompletes(t.lundi, n).map((w) => {
    const dans = t.semaines.filter((s) => s.semaine === w);
    return {
      semaine: w,
      proceeds: arrondi(dans.reduce((x, s) => x + s.proceeds, 0)),
      cout: arrondi(dans.reduce((x, s) => x + (s.cout_reel ?? s.cout_estime ?? 0), 0) * taux),
      vues: dans.reduce((x, s) => x + s.vues, 0),
    };
  });
}

/** La série d'un pays sur n semaines : proceeds, vues, RPM. */
export function seriePays(t: TableauPays, pays: string, n = 8): { semaine: string; proceeds: number; vues: number; rpm: number | null }[] {
  return semainesCompletes(t.lundi, n).map((w) => {
    const s = t.semaines.find((x) => x.pays === pays && x.semaine === w);
    const proceeds = s?.proceeds ?? 0;
    const vues = s?.vues ?? 0;
    return { semaine: w, proceeds, vues, rpm: vues ? arrondi((proceeds / vues) * 1000, 2) : null };
  });
}

export type TypeAFaire = "recruter" | "arreter" | "reduire" | "surveiller";
export interface AFaire {
  type: TypeAFaire;
  pays: string;
  nombre?: number;
  detail?: string;
}

/**
 * « À faire cette semaine », 5 lignes au plus : arrêter (pays retiré ou ROI
 * < 0,5 sur 4 semaines), recruter (les plus gros manques, meilleur ROI d'abord),
 * surveiller (RPM en baisse de plus de 30 % vs les 4 semaines d'avant, à plus
 * de 50 000 vues), réduire.
 */
export function aFaireSemaine(lignes: LignePays[], avant: LignePays[], max = 5): AFaire[] {
  const prec = new Map(avant.map((l) => [l.pays, l]));
  const decision = lignes.filter((l) => !l.revenu_sans_posteurs);
  const arreter = decision
    .filter((l) => l.recommandation === "arreter" && (l.actifs > 0 || l.pipeline > 0))
    .map((l): AFaire => ({ type: "arreter", pays: l.pays }));
  const recruter = decision
    .filter((l) => l.recommandation === "recruter" && l.manque > 0)
    .sort((a, b) => b.manque - a.manque || (b.roi ?? 0) - (a.roi ?? 0))
    .map((l): AFaire => ({ type: "recruter", pays: l.pays, nombre: l.manque }));
  const surveiller = decision
    .filter((l) => {
      const p = prec.get(l.pays);
      return l.vues >= 50_000 && l.rpm !== null && p?.rpm && l.rpm < p.rpm * 0.7;
    })
    .map((l): AFaire => ({ type: "surveiller", pays: l.pays, detail: "rpm" }));
  const reduire = decision.filter((l) => l.recommandation === "reduire").map((l): AFaire => ({ type: "reduire", pays: l.pays, nombre: l.actifs - l.objectif }));
  return [...arreter.slice(0, 1), ...recruter.slice(0, 3), ...surveiller.slice(0, 1), ...arreter.slice(1), ...recruter.slice(3), ...reduire].slice(0, max);
}

/** Top et flop par ROI (pays avec une paie et des proceeds). */
export function topFlopRoi(lignes: LignePays[], n = 5): { top: LignePays[]; flop: LignePays[] } {
  const notes = lignes.filter((l) => l.roi !== null && !l.revenu_sans_posteurs && (l.cout ?? 0) > 0);
  const tries = [...notes].sort((a, b) => (b.roi ?? 0) - (a.roi ?? 0));
  return { top: tries.slice(0, n), flop: tries.slice(-n).reverse() };
}

export interface AnnonceUpwork {
  titre: string | null;
  pays: string | null;
  generique: boolean | null;
  vue_at: string | null;
  contrats_21j: number;
}

/**
 * Une annonce est active pour un pays si elle a amené un contrat dans les 21
 * derniers jours. (vue_at ne dit pas qu'elle est ouverte : toutes les annonces
 * ont été « vues » le 28/10, à l'amorçage depuis les contrats.)
 */
export function annoncesActives(annonces: AnnonceUpwork[]): Set<string> {
  const actifs = new Set<string>();
  for (const a of annonces) {
    const p = a.pays ?? paysDeTitre(a.titre);
    if (!p) continue;
    if (a.contrats_21j > 0) actifs.add(p);
  }
  return actifs;
}

export interface LigneHm {
  hm: string;
  pays: string;
  manque: number;
  offres: number;
  annonce: boolean;
}

/** Le tableau par HM (selon sa zone de recrutement) : pays, manque, offres en attente, annonce active. */
export function tableauHm(lignes: LignePays[], hms: HmZone[], actives: Set<string>): LigneHm[] {
  const parPays = new Map(lignes.map((l) => [l.pays, l]));
  const out: LigneHm[] = [];
  for (const hm of hms) {
    for (const p of paysDeZone(hm.zone, nomVersCode)) {
      const l = parPays.get(p);
      out.push({ hm: hm.nom ?? hm.id, pays: p, manque: l ? Math.max(0, l.manque) : 0, offres: l?.offres ?? 0, annonce: actives.has(p) });
    }
  }
  return out.sort((a, b) => a.hm.localeCompare(b.hm) || b.manque - a.manque);
}

export type StatutCompte = "bon" | "moyen" | "sous_seuil";

/** Statut d'un compte sur ses vues des 7 derniers jours : bon ≥ 2 × seuil, moyen ≥ seuil, sinon sous le seuil. */
export function statutCompte(vues7j: number, seuil: number): StatutCompte {
  if (vues7j >= seuil * 2) return "bon";
  if (vues7j >= seuil) return "moyen";
  return "sous_seuil";
}

/** Le drapeau d'un code pays (🇩🇪), vide sinon. */
export function drapeau(code: string): string {
  if (!/^[A-Z]{2}$/.test(code)) return "";
  return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

/** Le nom d'un pays dans la langue de l'écran. */
export function nomPays(code: string, langue: string): string {
  if (!/^[A-Z]{2}$/.test(code)) return code;
  try {
    return new Intl.DisplayNames([langue], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

// ---------------------------------------------------------------------------
// 0516 (2/11) : la cohorte du lundi : objectif / offres envoyées / acceptées /
// restant, par pays et par HM (la HM des nouvelles recrues de chaque pays).
// ---------------------------------------------------------------------------

export interface HmPays {
  pays: string;
  hm_id: string | null;
  hm_nom: string;
  zone: "A" | "B" | "C";
}

export interface AlerteOffre {
  contrat_id: string | null;
  offre_id: string | null;
  hm_nom: string | null;
  pays: string | null;
  motif: "hors_vik" | "nb_milestones" | "montant" | "nom_1er" | "echeance_1er" | "plusieurs_finances";
  detail: string | null;
  created_at: string;
}

export interface RecrutementCohorte {
  lundi: string;
  objectifs: { pays: string; nombre: number }[];
  hm_pays: HmPays[];
  acceptees: { contrat_id: string; pays: string | null; hm_id: string | null; hm_nom: string | null; debut_at: string | null }[];
  en_attente: { offre_id: string; titre: string | null; debut_at: string | null }[];
  offres_lues_at: string | null;
  alertes: AlerteOffre[];
}

export interface LigneCohorte {
  pays: string;
  hm: string;
  zone: string | null;
  objectif: number;
  acceptees: number;
  en_attente: number;
  /** Offres envoyées = acceptées + en attente. */
  envoyees: number;
  /** Ce qu'il reste à envoyer : objectif − envoyées, jamais négatif. */
  restant: number;
}

/** La cohorte en cours : le lundi qui suit (une offre acceptée le dimanche compte pour le lundi d'après), comme cohorte_lundi_de. */
export function cohorteEnCours(aujourdhui: string): string {
  const d = new Date(`${aujourdhui}T12:00:00Z`);
  const iso = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  return ajouterJours(aujourdhui, iso === 7 ? 8 : 8 - iso);
}

/** Une ligne par pays qui a un objectif, une offre ou une recrue cette cohorte ; triée par HM puis par restant. */
export function lignesCohorte(c: RecrutementCohorte): LigneCohorte[] {
  const hmDe = new Map(c.hm_pays.map((h) => [h.pays, h]));
  const objectif = new Map(c.objectifs.map((o) => [o.pays, Number(o.nombre ?? 0)]));
  const acc = new Map<string, number>();
  for (const a of c.acceptees) if (a.pays) acc.set(a.pays, (acc.get(a.pays) ?? 0) + 1);
  const att = new Map<string, number>();
  for (const o of c.en_attente) {
    const p = paysDeTitre(o.titre);
    if (p) att.set(p, (att.get(p) ?? 0) + 1);
  }
  const pays = new Set([...objectif.keys(), ...acc.keys(), ...att.keys()]);
  return [...pays].map((p): LigneCohorte => {
    const o = objectif.get(p) ?? 0;
    const a = acc.get(p) ?? 0;
    const e = att.get(p) ?? 0;
    return { pays: p, hm: hmDe.get(p)?.hm_nom ?? "—", zone: hmDe.get(p)?.zone ?? null, objectif: o, acceptees: a, en_attente: e, envoyees: a + e, restant: Math.max(0, o - a - e) };
  }).sort((x, y) => x.hm.localeCompare(y.hm) || y.restant - x.restant || y.objectif - x.objectif || x.pays.localeCompare(y.pays));
}

/** Les totaux par HM (objectif, envoyées, acceptées, restant). */
export function totauxHm(lignes: LigneCohorte[]): { hm: string; objectif: number; envoyees: number; acceptees: number; restant: number }[] {
  const m = new Map<string, { hm: string; objectif: number; envoyees: number; acceptees: number; restant: number }>();
  for (const l of lignes) {
    const t = m.get(l.hm) ?? { hm: l.hm, objectif: 0, envoyees: 0, acceptees: 0, restant: 0 };
    t.objectif += l.objectif;
    t.envoyees += l.envoyees;
    t.acceptees += l.acceptees;
    t.restant += l.restant;
    m.set(l.hm, t);
  }
  return [...m.values()].sort((a, b) => b.restant - a.restant || a.hm.localeCompare(b.hm));
}
