/**
 * Éditer les réglages du choix de label, depuis la page Allocation.
 *
 * POURQUOI UN MODULE À PART. `scoreLabel.ts` est le miroir exact du moteur
 * (`choix_label_equilibre.ts`), comparé bloc par bloc par un test. Tout ce qui
 * sert à ÉDITER n'existe que côté navigateur : le poser là-bas ferait diverger
 * le miroir pour une raison étrangère au calcul.
 *
 * CE QUE LE MOTEUR ACCEPTE VRAIMENT. Son lecteur de réglages ne rejette rien :
 * il remplace en silence une valeur qu'il n'aime pas par celle par défaut
 * (`positif()`) ou la rabote (`Math.max(0, …)`, `Math.min(1, …)`). Poser
 * `perf_exposant: 0` ne met donc pas zéro, ça remet 2 sans le dire. Les bornes
 * ci-dessous recopient ces règles pour que l'écran refuse exactement ce que le
 * moteur aurait réécrit : ce qu'on lit est ce qui tourne.
 */
import { cleFermeture, type ReglagesChoixLabel } from "./scoreLabel";

/**
 * Les réglages scalaires que la page pose. `fermes_auto` et `dernier_run`
 * vivent dans la même clé mais appartiennent à la nuit : ils ne sont pas ici,
 * et toute écriture doit les préserver.
 */
export type CleReglageLabel =
  | "perfExposant"
  | "perfLissage"
  | "perfMin"
  | "perfMax"
  | "fermeturePerf"
  | "fermetureMinPosts"
  | "reserveMinJours"
  | "reserveCibleJours"
  | "postsParJourNouveau"
  | "partMax"
  | "rafaleRecents"
  | "relabelsMaxParNuit";

export interface ChampReglageLabel {
  cle: CleReglageLabel;
  /** La clé dans `reglages.choix_labels`, telle que le moteur la lit. */
  cleBase: string;
  /**
   * La clé de traduction du libellé, écrite en toutes lettres.
   *
   * Elle se déduisait de `cle` par une capitale ; cinq libellés sur douze ne
   * suivaient pas la règle (`reserveMinJours` contre `rReserveMin`) et
   * s'affichaient en clé brute, sans que rien ne plante.
   */
  cleI18n: string;
  /** Borne basse du moteur. `strict` quand il exige strictement plus (`positif`). */
  min: number;
  strict: boolean;
  max?: number;
  entier?: boolean;
  /** Pas de l'`<input type="number">`, choisi sur l'ordre de grandeur du réglage. */
  pas: number;
}

/** Dans l'ordre de l'écran : d'abord la performance, puis la réserve, puis les garde-fous. */
export const CHAMPS_REGLAGE_LABEL: readonly ChampReglageLabel[] = Object.freeze([
  { cle: "perfExposant", cleBase: "perf_exposant", cleI18n: "rPerfExposant", min: 0, strict: true, pas: 0.1 },
  { cle: "perfLissage", cleBase: "perf_lissage", cleI18n: "rPerfLissage", min: 0, strict: false, pas: 1 },
  { cle: "perfMin", cleBase: "perf_min", cleI18n: "rPerfMin", min: 0, strict: true, pas: 0.05 },
  { cle: "perfMax", cleBase: "perf_max", cleI18n: "rPerfMax", min: 0, strict: true, pas: 0.5 },
  { cle: "fermeturePerf", cleBase: "fermeture_perf", cleI18n: "rFermeturePerf", min: 0, strict: true, pas: 0.05 },
  { cle: "fermetureMinPosts", cleBase: "fermeture_min_posts", cleI18n: "rFermetureMinPosts", min: 0, strict: true, entier: true, pas: 10 },
  { cle: "reserveMinJours", cleBase: "reserve_min_jours", cleI18n: "rReserveMin", min: 0, strict: false, pas: 1 },
  { cle: "reserveCibleJours", cleBase: "reserve_cible_jours", cleI18n: "rReserveCible", min: 0, strict: true, pas: 1 },
  { cle: "postsParJourNouveau", cleBase: "posts_par_jour_nouveau", cleI18n: "rPostsNouveau", min: 0, strict: true, pas: 1 },
  { cle: "partMax", cleBase: "part_max", cleI18n: "rPartMax", min: 0, strict: true, max: 1, pas: 0.05 },
  { cle: "rafaleRecents", cleBase: "rafale_recents", cleI18n: "rRafale", min: 0, strict: true, entier: true, pas: 1 },
  { cle: "relabelsMaxParNuit", cleBase: "relabels_max_par_nuit", cleI18n: "rRelabels", min: 0, strict: false, entier: true, pas: 1 },
] as const satisfies readonly ChampReglageLabel[]);

export type ValeursReglageLabel = Record<CleReglageLabel, number>;
export type BrouillonReglageLabel = Record<CleReglageLabel, string>;

/** Pourquoi une saisie est refusée. Le moteur, lui, l'aurait réécrite en silence. */
export type ErreurChamp = "nombre" | "borne" | "entier";

export interface VerdictReglagesLabel {
  /** `null` dès qu'une saisie est refusée : on n'écrit jamais à moitié. */
  valeurs: ValeursReglageLabel | null;
  erreurs: Partial<Record<CleReglageLabel, ErreurChamp>>;
  /**
   * `perfMin` au-dessus de `perfMax` : le moteur borne par
   * `Math.min(perfMax, Math.max(perfMin, x))`, donc la borne haute
   * disparaîtrait et tous les labels vaudraient `perfMin`. Ce n'est pas un
   * réglage, c'est une panne, et elle ne se voit nulle part.
   */
  bornesCroisees: boolean;
}

export function brouillonDepuisReglages(r: ReglagesChoixLabel): BrouillonReglageLabel {
  const out = {} as BrouillonReglageLabel;
  for (const c of CHAMPS_REGLAGE_LABEL) out[c.cle] = String(r[c.cle]);
  return out;
}

function verifier(champ: ChampReglageLabel, brut: string): ErreurChamp | null {
  const texte = brut.trim();
  if (texte === "") return "nombre";
  const n = Number(texte);
  if (!Number.isFinite(n)) return "nombre";
  if (champ.strict ? n <= champ.min : n < champ.min) return "borne";
  if (champ.max !== undefined && n > champ.max) return "borne";
  if (champ.entier && !Number.isInteger(n)) return "entier";
  return null;
}

export function validerReglagesLabel(b: BrouillonReglageLabel): VerdictReglagesLabel {
  const erreurs: Partial<Record<CleReglageLabel, ErreurChamp>> = {};
  const valeurs = {} as ValeursReglageLabel;
  for (const champ of CHAMPS_REGLAGE_LABEL) {
    const faute = verifier(champ, b[champ.cle] ?? "");
    if (faute) erreurs[champ.cle] = faute;
    else valeurs[champ.cle] = Number(b[champ.cle]);
  }
  const bornesCroisees =
    erreurs.perfMin === undefined &&
    erreurs.perfMax === undefined &&
    valeurs.perfMin > valeurs.perfMax;
  const bon = Object.keys(erreurs).length === 0 && !bornesCroisees;
  return { valeurs: bon ? valeurs : null, erreurs, bornesCroisees };
}

/** Les douze réglages en clés `snake_case`, celles que le moteur lit. */
export function versCleBase(v: ValeursReglageLabel): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of CHAMPS_REGLAGE_LABEL) out[c.cleBase] = v[c.cle];
  return out;
}

/** Les douze clés, pour les retirer quand on revient aux valeurs par défaut. */
export const CLES_BASE_REGLAGE_LABEL: readonly string[] = Object.freeze(
  CHAMPS_REGLAGE_LABEL.map((c) => c.cleBase),
);

/**
 * La décision humaine posée sur un label POUR UNE APPLICATION.
 *
 * Trois états et pas deux : « auto » n'est pas « ouvert ». Un label laissé en
 * auto suit ses chiffres, donc la nuit peut le fermer ; un label « ouvert »
 * reste ouvert même quand les chiffres disent le contraire. Les confondre
 * ferait croire qu'on a protégé un label alors qu'on l'a seulement laissé
 * tranquille.
 */
export type EtatManuelLabel = "auto" | "ouvert" | "ferme";

export function etatManuelLabel(
  labelId: string,
  applicationId: string,
  r: Pick<ReglagesChoixLabel, "ouvertsApp" | "fermesApp">,
): EtatManuelLabel {
  const k = cleFermeture(applicationId, labelId);
  if (r.ouvertsApp.includes(k)) return "ouvert";
  if (r.fermesApp.includes(k)) return "ferme";
  return "auto";
}

/**
 * Les deux listes par application après la décision.
 *
 * ON NE TOUCHE JAMAIS `fermes_auto`. C'est la mémoire de la nuit, et elle
 * existe parce qu'un label fermé ne poste plus : ses chiffres s'éteignent, donc
 * ils ne le rouvriront jamais d'eux-mêmes. L'effacer ferait revenir le label
 * par la bande, sans que personne l'ait décidé. Forcer « ouvert » suffit :
 * `estFerme` et `motifFermeture` lisent `ouvertsApp` en premier, des deux
 * côtés, donc la réouverture vaut à la création comme à la nuit. Et comme la
 * mémoire reste, repasser en « auto » rend le label à la décision d'origine au
 * lieu de le rouvrir en douce.
 *
 * LES DEUX LISTES SONT EXCLUSIVES : poser l'une retire l'autre. Sans ça,
 * fermer un label déjà forcé ouvert ne ferait rien du tout — `ouvertsApp`
 * gagne — et l'écran mentirait.
 *
 * Les listes GLOBALES (`labels_ouverts`, `labels_fermes`) ne sont pas touchées
 * ici : elles valent pour toutes les applications, alors que cette page en
 * regarde une seule. Une décision par application l'emporte sur elles de toute
 * façon, donc l'écran reste maître de ce qu'il montre.
 */
export function poserEtatManuelLabel(
  r: Pick<ReglagesChoixLabel, "ouvertsApp" | "fermesApp">,
  applicationId: string,
  labelId: string,
  etat: EtatManuelLabel,
): { ouvertsApp: string[]; fermesApp: string[] } {
  const k = cleFermeture(applicationId, labelId);
  const sans = (liste: readonly string[]) => liste.filter((x) => x !== k);
  return {
    ouvertsApp: etat === "ouvert" ? [...sans(r.ouvertsApp), k] : sans(r.ouvertsApp),
    fermesApp: etat === "ferme" ? [...sans(r.fermesApp), k] : sans(r.fermesApp),
  };
}
