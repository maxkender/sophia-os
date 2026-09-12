import { lireParLots } from "./lots.ts";
import { serviceClient } from "./supabase.ts";

export type Supabase = ReturnType<typeof serviceClient>;

/**
 * Classement des comptes — remplace l'ELO de compte (`comptes.score`, supprimé
 * par la migration 0238).
 *
 * Cinq cases : INACTIF · MAUVAISES VUES · PASSABLE · BIEN · STAR. La partie pure
 * (seuils + `classer` + trial + file de surveillance) est une copie Deno de
 * `src/features/moteur/classementComptes.ts`, où vivent les tests — garder synchro.
 *
 * La requalification (`requalifierClassementComptes`, plus bas) tourne à la fin du
 * drain de relevé des vues (`rattrapage-elo`), donc sur les vues fraîches de la
 * nuit : un compte dont les vues viennent d'être relevées est jugé dessus le
 * même passage.
 */
export const CLASSEMENTS = [
  "inactif",
  "mauvaises_vues",
  "passable",
  "bien",
  "star",
] as const;
export type Classement = (typeof CLASSEMENTS)[number];

export function estClassement(v: unknown): v is Classement {
  return typeof v === "string" && (CLASSEMENTS as readonly string[]).includes(v);
}

/** Position dans l'échelle INACTIF < MAUVAISES VUES < PASSABLE < BIEN < STAR. */
export function rangClassement(c: Classement): number {
  return CLASSEMENTS.indexOf(c);
}

/** La moins bonne des deux cases — un compte qui coche plusieurs flags y tombe. */
export function pireClassement(a: Classement, b: Classement): Classement {
  return rangClassement(a) <= rangClassement(b) ? a : b;
}

// ---------------------------------------------------------------------------
// Réglages (`reglages.classement_comptes`)
// ---------------------------------------------------------------------------

export interface ClassementReglages {
  /** Taille de la fenêtre : les N derniers posts (prévus, et publiés). */
  fenetre: number;
  /** Minimum de posts (prévus, ou mesurés) avant de sortir de PASSABLE. */
  min_echantillon: number;
  /** Postés / prévus (sur `fenetre`) à partir duquel le compte est INACTIF. */
  ratio_inactif: number;
  /** Postés / prévus (sur `fenetre`) exigé pour BIEN. */
  ratio_bien: number;
  /** Postés / prévus (sur `fenetre`) exigé pour STAR. */
  ratio_star: number;
  /** Moyenne de vues sous laquelle le compte est en MAUVAISES VUES. */
  vues_mauvaises: number;
  /** Moyenne de vues minimale pour BIEN. */
  vues_bien: number;
  /** Moyenne de vues au-delà de laquelle un compte régulier est STAR. */
  vues_star: number;
  /** Durée du trial, en heures depuis la création du compte dans l'OS. */
  trial_heures: number;
  /** Combien d'heures avant la fin du trial le compte entre en surveillance. */
  trial_alerte_heures: number;
  /** Durée d'un « skip » dans la file de surveillance, en jours. */
  skip_jours: number;
}

export const CLASSEMENT_REGLAGES_DEFAUT: ClassementReglages = {
  fenetre: 10,
  min_echantillon: 3,
  ratio_inactif: 6,
  ratio_bien: 8,
  ratio_star: 9,
  vues_mauvaises: 600,
  vues_bien: 1_000,
  vues_star: 10_000,
  trial_heures: 80,
  trial_alerte_heures: 30,
  skip_jours: 7,
};

function nombre(v: unknown, defaut: number, min = 0): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= min ? n : defaut;
}

/** Normalise `reglages.classement_comptes` — toute clé absente reprend le défaut. */
export function lireClassementReglages(brut: unknown): ClassementReglages {
  const v = (brut ?? {}) as Record<string, unknown>;
  const d = CLASSEMENT_REGLAGES_DEFAUT;
  return {
    fenetre: Math.max(1, Math.round(nombre(v.fenetre, d.fenetre, 1))),
    min_echantillon: Math.round(nombre(v.min_echantillon, d.min_echantillon)),
    ratio_inactif: nombre(v.ratio_inactif, d.ratio_inactif),
    ratio_bien: nombre(v.ratio_bien, d.ratio_bien),
    ratio_star: nombre(v.ratio_star, d.ratio_star),
    vues_mauvaises: nombre(v.vues_mauvaises, d.vues_mauvaises),
    vues_bien: nombre(v.vues_bien, d.vues_bien),
    vues_star: nombre(v.vues_star, d.vues_star),
    trial_heures: nombre(v.trial_heures, d.trial_heures, 1),
    trial_alerte_heures: nombre(v.trial_alerte_heures, d.trial_alerte_heures),
    skip_jours: nombre(v.skip_jours, d.skip_jours),
  };
}

// ---------------------------------------------------------------------------
// Modèles de nudge (`reglages.nudges`)
// ---------------------------------------------------------------------------

/** Message prédéfini envoyable à un créateur depuis la surveillance. */
export interface ModeleNudge {
  id: string;
  titre: string;
  corps: string;
}

/**
 * Normalise `reglages.nudges` : un modèle sans corps est inutilisable, on le
 * jette ; un modèle sans id reçoit un id positionnel stable.
 */
export function lireModelesNudge(brut: unknown): ModeleNudge[] {
  const liste = (brut as { modeles?: unknown } | null)?.modeles;
  if (!Array.isArray(liste)) return [];
  return liste
    .map((m, i) => {
      const o = (m ?? {}) as Record<string, unknown>;
      const titre = typeof o.titre === "string" ? o.titre.trim() : "";
      const corps = typeof o.corps === "string" ? o.corps.trim() : "";
      const id = typeof o.id === "string" && o.id.trim() ? o.id.trim() : `modele_${i + 1}`;
      return { id, titre, corps };
    })
    .filter((m) => m.corps.length > 0);
}

// ---------------------------------------------------------------------------
// Qualification
// ---------------------------------------------------------------------------

export interface ClassementEntree {
  /**
   * Posts prévus dans la fenêtre : les `fenetre` derniers passages échus
   * (hors brouillons, hors rappels J+7). Le jour en cours ne compte pas —
   * le créateur a encore le temps de poster.
   */
  prevus: number;
  /** Parmi ces prévus, ceux réellement publiés. */
  postes: number;
  /** Moyenne des vues des `fenetre` derniers posts publiés ET mesurés. */
  moyenneVues: number | null;
  /** Combien de ces posts publiés portent une mesure de vues. */
  mesures: number;
}

export interface ClassementSortie {
  classement: Classement;
  /** Règle appliquée, pour le journal et la page de surveillance. */
  regle: string;
}

/**
 * Nombre de posts à tenir sur `prevus` créneaux, au prorata de la fenêtre.
 * Moins de 10 prévus → le seuil suit le nombre réel de prévus (8/10 sur
 * 5 créneaux = 4). `arrondi` monte pour une exigence, descend pour un plafond.
 */
export function seuilPostes(
  ratioSurFenetre: number,
  prevus: number,
  fenetre: number,
  arrondi: "haut" | "bas" = "haut",
): number {
  const brut = (ratioSurFenetre * Math.min(prevus, fenetre)) / Math.max(1, fenetre);
  return arrondi === "haut" ? Math.ceil(brut) : Math.floor(brut);
}

function formaterVues(n: number): string {
  return Math.round(n).toLocaleString("fr-FR");
}

/**
 * Qualifie un compte.
 *
 * Les deux flags négatifs priment sur les cases positives : un compte qui ne
 * poste pas est INACTIF même s'il fait des millions de vues (« la catégorie la
 * moins bonne »). Entre BIEN et STAR, qui se recouvrent par construction, c'est
 * la meilleure qui gagne — sinon STAR serait inatteignable.
 *
 * Sous `min_echantillon`, on ne juge pas : PASSABLE. Sans ça, tout compte neuf
 * tomberait en INACTIF dès son premier créneau raté.
 */
export function classer(
  e: ClassementEntree,
  reglages: ClassementReglages = CLASSEMENT_REGLAGES_DEFAUT,
): ClassementSortie {
  const r = reglages;
  const fenetre = Math.max(1, r.fenetre);
  const prevus = Math.max(0, Math.min(Math.round(e.prevus), fenetre));
  const postes = Math.max(0, Math.min(Math.round(e.postes), prevus));
  const mesures = Math.max(0, Math.round(e.mesures));
  const moyenne = e.moyenneVues;

  const assezDePrevus = prevus >= r.min_echantillon;
  const assezDeMesures = mesures >= r.min_echantillon && moyenne != null;

  // 1) INACTIF — un compte qui ne poste pas n'est pas jugé sur ses vues.
  if (assezDePrevus && postes <= seuilPostes(r.ratio_inactif, prevus, fenetre, "bas")) {
    return {
      classement: "inactif",
      regle: `${postes}/${prevus} posts publiés`,
    };
  }

  // 2) MAUVAISES VUES
  if (assezDeMesures && moyenne! < r.vues_mauvaises) {
    return {
      classement: "mauvaises_vues",
      regle: `${formaterVues(moyenne!)} vues de moyenne (< ${formaterVues(r.vues_mauvaises)})`,
    };
  }

  if (!assezDePrevus || !assezDeMesures) {
    return {
      classement: "passable",
      regle: `pas assez d'historique (${prevus} prévu(s) · ${mesures} mesuré(s))`,
    };
  }

  // 3) STAR, puis BIEN — la meilleure des cases positives atteintes.
  if (
    moyenne! > r.vues_star &&
    postes >= seuilPostes(r.ratio_star, prevus, fenetre)
  ) {
    return {
      classement: "star",
      regle: `${formaterVues(moyenne!)} vues de moyenne · ${postes}/${prevus} posts`,
    };
  }
  if (
    moyenne! >= r.vues_bien &&
    postes >= seuilPostes(r.ratio_bien, prevus, fenetre)
  ) {
    return {
      classement: "bien",
      regle: `${formaterVues(moyenne!)} vues de moyenne · ${postes}/${prevus} posts`,
    };
  }

  return {
    classement: "passable",
    regle: `${formaterVues(moyenne!)} vues de moyenne · ${postes}/${prevus} posts`,
  };
}

// ---------------------------------------------------------------------------
// Trial (80 h après la création du compte dans l'OS)
// ---------------------------------------------------------------------------

export interface EtatTrial {
  /** Le compte est encore dans ses `trial_heures` premières heures. */
  enTrial: boolean;
  /** Fin du trial (ISO), null si la date de création est inconnue. */
  finAt: string | null;
  /** Heures restantes avant la fin du trial (0 si terminé). */
  heuresRestantes: number;
  /** Fin de trial proche → entrée obligatoire dans la file de surveillance. */
  alerte: boolean;
}

export function etatTrial(
  createdAt: string | null | undefined,
  reglages: ClassementReglages = CLASSEMENT_REGLAGES_DEFAUT,
  maintenant: number = Date.now(),
): EtatTrial {
  const debut = createdAt ? new Date(createdAt).getTime() : Number.NaN;
  if (!Number.isFinite(debut)) {
    return { enTrial: false, finAt: null, heuresRestantes: 0, alerte: false };
  }
  const fin = debut + reglages.trial_heures * 3600_000;
  const restantMs = fin - maintenant;
  const enTrial = restantMs > 0;
  return {
    enTrial,
    finAt: new Date(fin).toISOString(),
    heuresRestantes: enTrial ? restantMs / 3600_000 : 0,
    alerte: enTrial && restantMs <= reglages.trial_alerte_heures * 3600_000,
  };
}

// ---------------------------------------------------------------------------
// File de surveillance
// ---------------------------------------------------------------------------

/** Pourquoi un compte est dans la file. `trial` s'ajoute aux autres motifs. */
export type MotifSurveillance = "inactif" | "mauvaises_vues" | "trial";

export interface CompteSurveillance {
  classement: Classement;
  /** Date de création du compte dans l'OS (`comptes.created_at`). */
  created_at?: string | null;
  /** Skip posé par un admin — la ligne est masquée jusque-là. */
  surveillance_skip_jusqu?: string | null;
  /** Déjà proposé au non-renouvellement — la décision est prise. */
  non_renouveler?: boolean | null;
}

/**
 * Motifs de présence dans la file, hors skip.
 *
 * Un compte à 30 h de la fin de son trial y entre **obligatoirement**, quel que
 * soit son classement : c'est le dernier moment pour décider de le garder.
 */
export function motifsSurveillance(
  compte: CompteSurveillance,
  reglages: ClassementReglages = CLASSEMENT_REGLAGES_DEFAUT,
  maintenant: number = Date.now(),
): MotifSurveillance[] {
  const motifs: MotifSurveillance[] = [];
  if (compte.classement === "inactif") motifs.push("inactif");
  if (compte.classement === "mauvaises_vues") motifs.push("mauvaises_vues");
  if (etatTrial(compte.created_at, reglages, maintenant).alerte) motifs.push("trial");
  return motifs;
}

/** Skip encore actif (posé il y a moins de `skip_jours`). */
export function estSkippe(
  skipJusqu: string | null | undefined,
  maintenant: number = Date.now(),
): boolean {
  if (!skipJusqu) return false;
  const t = new Date(skipJusqu).getTime();
  return Number.isFinite(t) && t > maintenant;
}

/**
 * Le compte doit-il apparaître dans la file de surveillance ?
 *
 * La file est une liste de décisions à prendre. Un compte déjà proposé au
 * non-renouvellement en sort : la décision est prise, il vit dans la liste
 * « ne pas renouveler » avec sa checklist. Le retirer de cette liste le
 * ramène dans la file s'il est toujours flagué.
 */
export function estSousSurveillance(
  compte: CompteSurveillance,
  reglages: ClassementReglages = CLASSEMENT_REGLAGES_DEFAUT,
  maintenant: number = Date.now(),
): boolean {
  if (compte.non_renouveler) return false;
  if (estSkippe(compte.surveillance_skip_jusqu, maintenant)) return false;
  return motifsSurveillance(compte, reglages, maintenant).length > 0;
}

/** Fin d'un skip posé maintenant. */
export function finDuSkip(
  reglages: ClassementReglages = CLASSEMENT_REGLAGES_DEFAUT,
  maintenant: number = Date.now(),
): string {
  return new Date(maintenant + reglages.skip_jours * 86_400_000).toISOString();
}

// ---------------------------------------------------------------------------
// Requalification — fin du drain de relevé des vues
// ---------------------------------------------------------------------------

interface EtatLigne {
  compte_id: string;
  prevus: number;
  postes: number;
  moyenne_vues: number | null;
  mesures: number;
}

interface CompteLigne {
  id: string;
  persona_nom: string | null;
  handle_tiktok: string | null;
  classement: string | null;
  classement_verrou: boolean | null;
}

export interface ClassementChange {
  compteId: string;
  nom: string;
  avant: Classement;
  apres: Classement;
  regle: string;
  prevus: number;
  postes: number;
  moyenneVues: number | null;
  mesures: number;
}

export interface ClassementRunResultat {
  ok: true;
  dryRun?: boolean;
  /** Comptes passés en revue (hors CM / UGC AI VIDEO — voir la RPC). */
  examines: number;
  /** Comptes qui changent de case. */
  changes: number;
  /** Comptes laissés tels quels par un verrou manuel. */
  verrous: number;
  /** Répartition après requalification. */
  parCase: Record<Classement, number>;
  /** Détail des changements (tronqué à 50 pour la réponse HTTP). */
  details: ClassementChange[];
}

/** Nombre de détails renvoyés — au-delà, seul le compteur bouge. */
const MAX_DETAILS = 50;

function parCaseVide(): Record<Classement, number> {
  return { inactif: 0, mauvaises_vues: 0, passable: 0, bien: 0, star: 0 };
}

export async function lireReglagesClassement(
  supabase: Supabase,
): Promise<ClassementReglages> {
  const { data } = await supabase
    .from("reglages")
    .select("valeur")
    .eq("cle", "classement_comptes")
    .maybeSingle();
  return lireClassementReglages(data?.valeur);
}

/**
 * Requalifie tous les comptes suivis.
 *
 * Un compte sous verrou manuel garde sa case ; on continue quand même d'écrire
 * `classement_calcule` pour que la page de surveillance montre ce que l'auto
 * aurait dit. Seuls les changements automatiques écrivent l'historique — les
 * changements manuels sont journalisés par l'action admin qui les pose.
 */
export async function requalifierClassementComptes(
  supabase: Supabase,
  opts: { dryRun?: boolean } = {},
): Promise<ClassementRunResultat> {
  const reglages = await lireReglagesClassement(supabase);

  const { data: etats, error } = await supabase.rpc("classement_comptes_etat", {
    p_fenetre: reglages.fenetre,
  });
  if (error) throw error;

  const lignes = (etats ?? []) as EtatLigne[];
  const out: ClassementRunResultat = {
    ok: true,
    ...(opts.dryRun ? { dryRun: true } : {}),
    examines: 0,
    changes: 0,
    verrous: 0,
    parCase: parCaseVide(),
    details: [],
  };
  if (lignes.length === 0) return out;

  const comptes = await lireParLots<CompteLigne>(
    lignes.map((l) => l.compte_id),
    "Comptes a requalifier",
    (lot) =>
      supabase
        .from("comptes")
        .select("id, persona_nom, handle_tiktok, classement, classement_verrou")
        .in("id", lot),
  );
  const parId = new Map(comptes.map((c) => [c.id, c]));
  const maj = new Date().toISOString();

  for (const l of lignes) {
    const compte = parId.get(l.compte_id);
    if (!compte) continue;

    const sortie = classer(
      {
        prevus: l.prevus,
        postes: l.postes,
        moyenneVues: l.moyenne_vues,
        mesures: l.mesures,
      },
      reglages,
    );
    const avant: Classement = estClassement(compte.classement) ? compte.classement : "passable";
    const verrou = Boolean(compte.classement_verrou);
    const apres = verrou ? avant : sortie.classement;

    out.examines += 1;
    out.parCase[apres] += 1;
    if (verrou) out.verrous += 1;

    const rapport = {
      prevus: l.prevus,
      postes: l.postes,
      moyenne_vues: l.moyenne_vues,
      mesures: l.mesures,
      regle: sortie.regle,
      calcule: sortie.classement,
      at: maj,
    };

    if (!opts.dryRun) {
      await supabase
        .from("comptes")
        .update({
          classement: apres,
          classement_calcule: sortie.classement,
          classement_maj_at: maj,
          classement_rapport: rapport,
        })
        .eq("id", l.compte_id);
    }

    if (apres === avant) continue;
    out.changes += 1;
    if (!opts.dryRun) {
      await supabase.from("compte_classement_historique").insert({
        compte_id: l.compte_id,
        avant,
        apres,
        source: "auto",
        regle: sortie.regle,
        rapport,
      });
    }
    if (out.details.length < MAX_DETAILS) {
      out.details.push({
        compteId: l.compte_id,
        nom:
          compte.persona_nom ??
          (compte.handle_tiktok ? `@${compte.handle_tiktok}` : l.compte_id.slice(0, 8)),
        avant,
        apres,
        regle: sortie.regle,
        prevus: l.prevus,
        postes: l.postes,
        moyenneVues: l.moyenne_vues,
        mesures: l.mesures,
      });
    }
  }

  return out;
}
