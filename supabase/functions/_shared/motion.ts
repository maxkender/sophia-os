/**
 * Motion (page /admin/motion, migration 0663) : les règles pures, partagées
 * par la fonction `motion` et ses tests. Le front a les mêmes libellés dans
 * `src/features/motion/logique.ts`.
 */

import { LEGENDE_MAX } from "./ugc_ia.ts";

/** Les langues d'une vidéo si l'admin n'en choisit pas. */
export const LANGUES_MOTION = ["fr", "en", "de", "it"] as const;

/** Une tâche du moteur repart d'elle-même tant qu'elle a échoué moins de fois que ça. */
export const TENTATIVES_MAX = 3;

/**
 * Langue pilote : la vidéo se fait d'abord dans cette langue ; les autres ne se lancent qu'après sa validation
 * (demande d'Adrien du 6/11 : script → vidéo anglaise → validation → autres langues).
 */
export const LANGUE_PILOTE = "en";
export function languePilote(langues: string[]): string {
  return langues.includes(LANGUE_PILOTE) ? LANGUE_PILOTE : langues[0];
}
/** Les langues à lancer quand la pilote est validée : encore en attente et pas déjà dans la file. */
export function languesALancer(
  langues: Array<{ langue: string; statut: string }>,
  pilote: string,
  dejaEnFile: string[],
): string[] {
  return langues
    .filter((l) => l.langue !== pilote && l.statut === "en_attente" && !dejaEnFile.includes(l.langue))
    .map((l) => l.langue)
    .sort();
}

/** Le moteur dépose ses fichiers sous ce dossier du bucket `medias`. */
export const PREFIXE_MOTION = "motion/";

/** Combien de jours on cherche un jour libre sur le compte MOTION. */
export const JOURS_RECHERCHE = 60;

export const SUJET_MAX = 300;
export const CONSIGNE_MAX = 4000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const LANGUE = /^[a-z]{2}(-[a-z0-9]{2,3})?$/;
const NOM_FICHIER = /^[a-z0-9][a-z0-9._-]{0,80}\.(mp4|json|jpg|png|mp3|wav)$/;

export const estUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v.toLowerCase());

function texteOuNull(v: unknown): string | null {
  const t = typeof v === "string" ? v.trim() : "";
  return t ? t : null;
}

/** Une langue telle que la stocke l'OS (« fr », « pt-br » → « pt-BR »), ou null. */
export function langueValide(brut: unknown): string | null {
  const l = String(brut ?? "").trim().toLowerCase();
  if (!LANGUE.test(l)) return null;
  const [base, region] = l.split("-");
  return region ? `${base}-${/^\d+$/.test(region) ? region : region.toUpperCase()}` : base;
}

/** Les langues demandées, sans doublon, dans l'ordre ; les langues par défaut si vide. */
export function languesDemandees(brut: unknown): string[] | { erreur: string } {
  if (brut == null) return [...LANGUES_MOTION];
  if (!Array.isArray(brut)) return { erreur: "Langues : une liste attendue" };
  const sortie: string[] = [];
  for (const b of brut) {
    const l = langueValide(b);
    if (!l) return { erreur: `Langue invalide : ${String(b)}` };
    if (!sortie.includes(l)) sortie.push(l);
  }
  return sortie.length > 0 ? sortie : { erreur: "Choisis au moins une langue" };
}

/** Styles de vidéo Motion : papier découpé, ou explication sur une carte du monde. */
export const STYLES_MOTION = ["papier", "geographie"] as const;
export type StyleMotion = (typeof STYLES_MOTION)[number];
export const styleValide = (v: unknown): StyleMotion | null =>
  typeof v === "string" && (STYLES_MOTION as readonly string[]).includes(v) ? (v as StyleMotion) : null;

export interface DemandeCreation {
  sujet: string;
  consigne: string | null;
  langues: string[];
  style: StyleMotion;
}

export function demandeCreation(body: Record<string, unknown>): DemandeCreation | { erreur: string } {
  const sujet = texteOuNull(body.sujet);
  if (!sujet) return { erreur: "Écris le sujet de la vidéo" };
  if (sujet.length > SUJET_MAX) return { erreur: `Sujet : ${SUJET_MAX} caractères au plus` };
  const consigne = texteOuNull(body.consigne);
  if (consigne && consigne.length > CONSIGNE_MAX) return { erreur: `Consigne : ${CONSIGNE_MAX} caractères au plus` };
  const langues = languesDemandees(body.langues);
  if ("erreur" in langues) return langues;
  const style = body.style == null || body.style === "" ? "papier" : styleValide(body.style);
  if (!style) return { erreur: "Style inconnu (papier ou geographie)" };
  return { sujet, consigne, langues, style };
}

type Objet = Record<string, unknown>;
const estObjet = (v: unknown): v is Objet => typeof v === "object" && v !== null && !Array.isArray(v);

/** Un script du moteur : un objet avec au moins une scène qui a un texte. */
export function scriptValide(brut: unknown): Objet | null {
  if (!estObjet(brut)) return null;
  const scenes = brut.scenes;
  if (!Array.isArray(scenes) || scenes.length === 0) return null;
  if (!scenes.every((s) => estObjet(s) && typeof s.texte === "string")) return null;
  return brut;
}

/**
 * Ce que l'admin a modifié dans le script, reporté sur le script stocké : le
 * texte des scènes (par `id`, ou par position si la scène n'a pas d'id), le
 * texte de l'outro et la légende. Tout le reste (repères, voix, appli…) est
 * celui du moteur et ne bouge pas.
 */
export function fusionnerScriptEdite(stocke: unknown, edite: unknown): Objet | { erreur: string } {
  const base = scriptValide(stocke);
  if (!base) return { erreur: "Pas encore de script à modifier" };
  if (!estObjet(edite)) return { erreur: "Script modifié invalide" };
  const copie = structuredClone(base) as Objet;
  const scenes = copie.scenes as Objet[];
  const editees = Array.isArray(edite.scenes) ? (edite.scenes as unknown[]) : [];
  editees.forEach((e, i) => {
    if (!estObjet(e) || typeof e.texte !== "string") return;
    const cible = e.id != null ? scenes.find((s) => s.id === e.id) : scenes[i];
    if (cible) cible.texte = e.texte.trim();
  });
  if (estObjet(edite.outro) && typeof edite.outro.texte === "string") {
    copie.outro = { ...(estObjet(copie.outro) ? copie.outro : {}), texte: edite.outro.texte.trim() };
  }
  if (typeof edite.legende === "string") {
    const legende = edite.legende.trim();
    if (legende.length > LEGENDE_MAX) return { erreur: `Légende : ${LEGENDE_MAX} caractères au plus` };
    copie.legende = legende;
  }
  if (scenes.some((s) => !String(s.texte ?? "").trim())) return { erreur: "Chaque scène a besoin d'un texte" };
  return copie;
}

/** Le chemin d'un fichier du moteur : medias/motion/<video>/<langue>/<nom>. */
export function cheminMotion(videoId: unknown, langue: unknown, nom: unknown): string | { erreur: string } {
  if (!estUuid(videoId)) return { erreur: "video_id invalide" };
  const l = langueValide(langue);
  if (!l) return { erreur: "Langue invalide" };
  const n = String(nom ?? "").trim();
  if (!NOM_FICHIER.test(n) || n.includes("..")) {
    return { erreur: "nom : minuscules, chiffres, . _ -, extension mp4, json, jpg, png, mp3 ou wav" };
  }
  return `${PREFIXE_MOTION}${String(videoId).toLowerCase()}/${l}/${n}`;
}

/** Un chemin déposé par le moteur appartient bien à cette vidéo et cette langue. */
export function cheminDeLaLangue(chemin: unknown, videoId: string, langue: string): boolean {
  const c = String(chemin ?? "");
  return c.startsWith(`${PREFIXE_MOTION}${videoId.toLowerCase()}/${langue}/`) && !c.includes("..");
}

/** Les statuts de langue qui empêchent une vidéo d'être « à valider ». */
const BLOQUANTS = new Set(["en_attente", "en_cours", "echec", "rejetee"]);

/**
 * Le statut d'une vidéo en production, vu ses langues : à valider quand plus
 * aucune n'est à rendre, terminée quand toutes sont distribuées, sinon il ne
 * change pas (null).
 */
export function statutVideoDepuisLangues(statuts: string[]): "a_valider" | "termine" | null {
  if (statuts.length === 0) return null;
  if (statuts.every((s) => s === "distribuee")) return "termine";
  if (statuts.some((s) => BLOQUANTS.has(s))) return null;
  return "a_valider";
}

/** Après un échec du moteur : la tâche repart, ou s'arrête pour de bon. */
export function statutApresEchec(tentatives: number): "en_attente" | "echec" {
  return tentatives < TENTATIVES_MAX ? "en_attente" : "echec";
}

export interface CompteMotion {
  id: string;
  langue: string | null;
  handle_tiktok: string | null;
  is_active: boolean;
  created_at?: string | null;
}

/**
 * Le compte MOTION d'une langue : actif, de la langue exacte, sinon de la même
 * langue de base (« pt-BR » sert « pt »). Un seul par langue en principe ; s'il
 * y en a plusieurs, le plus ancien.
 */
export function compteMotionDeLaLangue(comptes: CompteMotion[], langue: string): CompteMotion | null {
  const actifs = comptes
    .filter((c) => c.is_active)
    .sort((a, b) => String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")));
  const exact = actifs.find((c) => (c.langue ?? "").toLowerCase() === langue.toLowerCase());
  if (exact) return exact;
  const base = langue.split("-")[0].toLowerCase();
  return actifs.find((c) => (c.langue ?? "").toLowerCase().split("-")[0] === base) ?? null;
}

/** Ajoute `n` jours à une date YYYY-MM-DD. */
export function plusJours(jour: string, n: number): string {
  const d = new Date(`${jour}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Le premier jour à partir d'aujourd'hui sans post sur le compte (1 post par jour), ou null. */
export function premierJourLibre(aujourdhui: string, pris: string[], jours = JOURS_RECHERCHE): string | null {
  const occupes = new Set(pris);
  for (let i = 0; i < jours; i++) {
    const j = plusJours(aujourdhui, i);
    if (!occupes.has(j)) return j;
  }
  return null;
}

/** Durée en secondes (nombre positif, au dixième), ou null. */
export function dureeOuNull(brut: unknown): number | null {
  const n = typeof brut === "number" ? brut : typeof brut === "string" ? Number(brut.replace(",", ".")) : NaN;
  return Number.isFinite(n) && n > 0 && n < 3600 ? Math.round(n * 10) / 10 : null;
}

/** Légende d'une langue : texte nettoyé, au plus la longueur d'une légende TikTok. */
export function legendeOuNull(brut: unknown): string | null | { erreur: string } {
  const l = texteOuNull(brut);
  if (l && l.length > LEGENDE_MAX) return { erreur: `Légende : ${LEGENDE_MAX} caractères au plus` };
  return l;
}

/** Jeton du moteur : 32 octets aléatoires en hexadécimal. */
export function nouveauJeton(): string {
  return [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** SHA-256 hexadécimal (jeton du moteur comparé à `motion_reglages.jeton_hash`). */
export async function empreinte(texte: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texte));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * La capture d'accueil Sophia (anglais) déposée par la page :
 * medias/motion/<video>/capture-<horodatage>.<png|jpg|jpeg|webp>.
 */
export function cheminCaptureValide(chemin: unknown, videoId: string): boolean {
  const c = String(chemin ?? "");
  const prefixe = `${PREFIXE_MOTION}${videoId.toLowerCase()}/capture-`;
  return c.startsWith(prefixe) && /^\d{1,16}\.(png|jpe?g|webp)$/.test(c.slice(prefixe.length));
}

/** Comparaison en temps constant de deux empreintes hexadécimales. */
export function memesEmpreintes(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
