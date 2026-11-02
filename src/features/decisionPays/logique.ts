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

/** Les lundis des n dernières semaines complètes, du plus ancien au plus récent. */
export function semainesCompletes(lundiCourant: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => ajouterJours(lundiCourant, -7 * (n - i)));
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
export function lignesPays(t: TableauPays, periode: Periode): LignePays[] {
  const taux = Number(t.reglages.taux_usd_eur ?? 0.86);
  const lundi = t.lundi;
  const fenetre = new Set(semainesCompletes(lundi, SEMAINES_PERIODE[periode]));
  const fenetre4 = new Set(semainesCompletes(lundi, 4));
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
      } else if (manque < 0) {
        recommandation = "reduire";
        raison = `${pipeline} comptes en place ou en route pour un objectif de ${objectif}${roi !== null ? ` · ROI ${arrondi(roi, 1)}` : ""}`;
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
