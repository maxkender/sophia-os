// UGC IA (page /admin/ugc-ia, migration 0656) : règles pures de la page.
// Mêmes bornes que la fonction `ugc-ia` (supabase/functions/_shared/ugc_ia.ts).

export type StatutVideoUgcIa = "importee" | "coupee" | "en_cours" | "prete" | "echec";
export type ResolutionUgcIa = "480p" | "720p" | "1080p";

/** Genjutsu refuse une source de moins de 4 s et coupe au-delà de 30 s. */
export const PASSAGE_MIN_S = 4;
export const PASSAGE_MAX_S = 30;
/** La durée proposée par défaut : une réaction tient en quelques secondes. */
export const PASSAGE_DEFAUT_S = 6;

/** Le prompt du pod Réactions UGC : le persona refait le mouvement, sans texte. */
export const PROMPT_DEFAUT =
  "the woman from the image performs exactly the motion of the video, natural phone selfie, no text, no captions";

/** Un nombre de secondes saisi (« 1,5 » ou « 1.5 »), ou null. */
export function lireSecondes(saisie: string): number | null {
  const t = saisie.trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export type ErreurPassage = "manquant" | "negatif" | "tropCourt" | "tropLong" | "depasse";

/** Ce qui ne va pas dans le passage choisi, ou null s'il est bon. */
export function erreurPassage(debut: number | null, fin: number | null, dureeSource: number | null): ErreurPassage | null {
  if (debut == null || fin == null) return "manquant";
  if (debut < 0) return "negatif";
  if (fin - debut < PASSAGE_MIN_S) return "tropCourt";
  if (fin - debut > PASSAGE_MAX_S) return "tropLong";
  if (dureeSource != null && dureeSource > 0 && fin > dureeSource + 0.1) return "depasse";
  return null;
}

/** Le passage proposé à l'ouverture : celui déjà coupé, sinon les premières secondes. */
export function passageInitial(v: { debut_s: number | null; fin_s: number | null; source_duree_s: number | null }): {
  debut: string;
  fin: string;
} {
  if (v.debut_s != null && v.fin_s != null) return { debut: String(v.debut_s), fin: String(v.fin_s) };
  const duree = v.source_duree_s;
  const fin = duree != null && duree > 0 ? Math.min(duree, PASSAGE_DEFAUT_S) : PASSAGE_DEFAUT_S;
  return { debut: "0", fin: String(Math.round(fin * 10) / 10) };
}

/** Un temps de lecture arrondi au dixième, pour remplir début ou fin. */
export function arrondiDixieme(s: number): string {
  return String(Math.round(Math.max(0, s) * 10) / 10);
}

/** On peut (re)couper tant que rien n'est lancé ni prêt. */
export function peutCouper(statut: StatutVideoUgcIa): boolean {
  return statut === "importee" || statut === "coupee" || statut === "echec";
}

/** On peut lancer Genjutsu sur un passage coupé, ou relancer après un échec. */
export function peutGenerer(v: { statut: StatutVideoUgcIa; coupe_url: string | null }): boolean {
  return Boolean(v.coupe_url) && (v.statut === "coupee" || v.statut === "echec");
}
