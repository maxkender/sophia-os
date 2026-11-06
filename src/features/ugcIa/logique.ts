// UGC IA (page /admin/ugc-ia, migrations 0656 à 0658) : règles pures de la page.
// Mêmes bornes que la fonction `ugc-ia` (supabase/functions/_shared/ugc_ia.ts).

export type StatutGenerationUgcIa = "en_cours" | "prete" | "echec";
export type ResolutionUgcIa = "480p" | "720p" | "1080p";

/** Genjutsu coupe au-delà de 30 s. Pas de minimum : Higgsfield tranche (échec non facturé). */
export const PASSAGE_MAX_S = 30;
/** La partie téléphone (la démo de l'appli) ne passe pas par Genjutsu : plafond plus large. */
export const TELEPHONE_MAX_S = 180;

/** Les deux parties qu'on coupe dans une source : la réaction (pour Genjutsu) et la partie téléphone. */
export type PartieSource = "reaction" | "telephone";
/** La durée proposée par défaut : une réaction tient en quelques secondes. */
export const PASSAGE_DEFAUT_S = 6;
/** Au plus 10 personas par lancement, comme la fonction. */
export const PERSONAS_MAX_PAR_LANCEMENT = 10;

/** Le prompt du pod Réactions UGC : le persona refait le mouvement, sans texte. */
export const PROMPT_DEFAUT =
  "the woman from the image performs exactly the motion of the video, natural phone selfie, no text, no captions";

/** La vidéo générée a-t-elle été montée (recadrée ou avec bandeau) ? */
export function estMontee(g: { video_url: string | null; video_brute_url: string | null }): boolean {
  return Boolean(g.video_url && g.video_brute_url && g.video_url !== g.video_brute_url);
}

export function messageErreur(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

/** Un nombre de secondes saisi (« 1,5 » ou « 1.5 »), ou null. */
export function lireSecondes(saisie: string): number | null {
  const t = saisie.trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export type ErreurPassage = "manquant" | "negatif" | "ordre" | "tropLong" | "depasse";

/** Ce qui ne va pas dans le passage choisi, ou null s'il est bon. */
export function erreurPassage(
  debut: number | null,
  fin: number | null,
  dureeSource: number | null,
  max = PASSAGE_MAX_S,
): ErreurPassage | null {
  if (debut == null || fin == null) return "manquant";
  if (debut < 0) return "negatif";
  if (fin <= debut) return "ordre";
  if (fin - debut > max) return "tropLong";
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

/**
 * La partie téléphone proposée à l'ouverture : celle déjà coupée, sinon de la
 * fin de la réaction (la démo suit la réaction) jusqu'à la fin de la vidéo.
 */
export function passageTelephoneInitial(v: {
  fin_s: number | null;
  source_duree_s: number | null;
  telephone_debut_s: number | null;
  telephone_fin_s: number | null;
}): { debut: string; fin: string } {
  if (v.telephone_debut_s != null && v.telephone_fin_s != null) return { debut: String(v.telephone_debut_s), fin: String(v.telephone_fin_s) };
  const debut = v.fin_s ?? PASSAGE_DEFAUT_S;
  const duree = v.source_duree_s;
  const fin = duree != null && duree > debut ? Math.min(duree, debut + TELEPHONE_MAX_S) : debut + 10;
  return { debut: String(debut), fin: String(Math.round(fin * 10) / 10) };
}

/** Un temps de lecture arrondi au dixième, pour remplir début ou fin. */
export function arrondiDixieme(s: number): string {
  return String(Math.round(Math.max(0, s) * 10) / 10);
}

/** On ne recoupe pas un passage que Genjutsu est en train de lire. */
export function peutCouper(generations: ReadonlyArray<{ statut: StatutGenerationUgcIa }>): boolean {
  return !generations.some((g) => g.statut === "en_cours");
}

/** Les personas qu'on peut cocher : pas ceux qui ont déjà une génération en cours sur cette source. */
export function personasOccupes(generations: ReadonlyArray<{ statut: StatutGenerationUgcIa; persona_id: string }>): Set<string> {
  return new Set(generations.filter((g) => g.statut === "en_cours").map((g) => g.persona_id));
}

/** Coche ou décoche un persona, sans dépasser le maximum par lancement. */
export function basculer(coches: ReadonlySet<string>, id: string): Set<string> {
  const suite = new Set(coches);
  if (suite.has(id)) suite.delete(id);
  else if (suite.size < PERSONAS_MAX_PAR_LANCEMENT) suite.add(id);
  return suite;
}
