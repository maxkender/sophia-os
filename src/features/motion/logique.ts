// Motion (page /admin/motion, migration 0663) : les règles pures de la page.
// La fonction `motion` a les mêmes bornes dans supabase/functions/_shared/motion.ts.

export const LANGUES_MOTION = ["fr", "en", "de", "it"] as const;

/** Langue pilote (même règle que la fonction `motion`) : la vidéo se fait d'abord en anglais, les autres après sa validation. */
export function languePiloteDe(langues: string[]): string {
  return langues.includes("en") ? "en" : (langues[0] ?? "en");
}

/** Une langue qui attend la validation de la pilote (pas encore lancée). */
export function attendLaPilote(langue: { langue: string; statut: string }, toutes: Array<{ langue: string; statut: string }>, pilote: string): boolean {
  if (langue.langue === pilote || langue.statut !== "en_attente") return false;
  const p = toutes.find((l) => l.langue === pilote);
  return !p || !["validee", "distribuee"].includes(p.statut);
}

export type StatutVideoMotion =
  | "brouillon"
  | "script_demande"
  | "script_pret"
  | "production"
  | "a_valider"
  | "termine"
  | "archive";

export type StatutLangueMotion = "en_attente" | "en_cours" | "a_valider" | "validee" | "rejetee" | "distribuee" | "echec";

export type VarianteBadge = "default" | "secondary" | "outline" | "info" | "success" | "warning" | "error";

export const VARIANTE_VIDEO: Record<StatutVideoMotion, VarianteBadge> = {
  brouillon: "outline",
  script_demande: "info",
  script_pret: "warning",
  production: "info",
  a_valider: "warning",
  termine: "success",
  archive: "secondary",
};

export const VARIANTE_LANGUE: Record<StatutLangueMotion, VarianteBadge> = {
  en_attente: "outline",
  en_cours: "info",
  a_valider: "warning",
  validee: "success",
  rejetee: "error",
  distribuee: "success",
  echec: "error",
};

/** Le moteur travaille : on relit la page toutes les 10 s. */
export function moteurAuTravail(
  videos: Array<{ statut: StatutVideoMotion; langues: Array<{ statut: StatutLangueMotion }> }>,
): boolean {
  return videos.some(
    (v) =>
      v.statut === "script_demande" ||
      v.statut === "production" ||
      v.langues.some((l) => l.statut === "en_attente" || l.statut === "en_cours"),
  );
}

/** Ce que l'admin peut modifier dans un script : le texte des scènes, l'outro et la légende. */
export interface ScriptEditable {
  scenes: Array<{ id: string | null; texte: string }>;
  outro: string;
  legende: string;
}

type Objet = Record<string, unknown>;
const estObjet = (v: unknown): v is Objet => typeof v === "object" && v !== null && !Array.isArray(v);

/** Le script du moteur ramené à ses textes, ou null s'il n'y en a pas encore. */
export function scriptEditable(script: unknown): ScriptEditable | null {
  if (!estObjet(script) || !Array.isArray(script.scenes) || script.scenes.length === 0) return null;
  const scenes = script.scenes.map((s) => ({
    id: estObjet(s) && s.id != null ? String(s.id) : null,
    texte: estObjet(s) && typeof s.texte === "string" ? s.texte : "",
  }));
  return {
    scenes,
    outro: estObjet(script.outro) && typeof script.outro.texte === "string" ? script.outro.texte : "",
    legende: typeof script.legende === "string" ? script.legende : "",
  };
}

/** Ce que la page envoie à `maj_script` : seulement les textes (la fonction garde le reste). */
export function scriptModifie(e: ScriptEditable): Objet {
  return {
    scenes: e.scenes.map((s) => (s.id != null ? { id: s.id, texte: s.texte } : { texte: s.texte })),
    outro: { texte: e.outro },
    legende: e.legende,
  };
}

/** Le texte a-t-il changé ? (bouton « Enregistrer » actif) */
export function scriptsDifferents(a: ScriptEditable | null, b: ScriptEditable | null): boolean {
  return JSON.stringify(a) !== JSON.stringify(b);
}

/** Les comptes MOTION d'une langue : exacte, sinon même langue de base (comme la fonction). */
export function comptesDeLaLangue<T extends { langue: string | null }>(comptes: T[], langue: string): T[] {
  const exacts = comptes.filter((c) => (c.langue ?? "").toLowerCase() === langue.toLowerCase());
  if (exacts.length > 0) return exacts;
  const base = langue.split("-")[0].toLowerCase();
  return comptes.filter((c) => (c.langue ?? "").toLowerCase().split("-")[0] === base);
}

const EXTENSIONS_CAPTURE = ["png", "jpg", "jpeg", "webp"] as const;

/** Où déposer la capture Sophia (anglais) : medias/motion/<video>/capture-<horodatage>.<ext>, ou null si ce n'est pas une image. */
export function cheminCapture(videoId: string, nomFichier: string, horodatage: number): string | null {
  const point = nomFichier.lastIndexOf(".");
  const ext = point > 0 ? nomFichier.slice(point + 1).toLowerCase() : "";
  if (!(EXTENSIONS_CAPTURE as readonly string[]).includes(ext)) return null;
  return `motion/${videoId.toLowerCase()}/capture-${Math.floor(horodatage)}.${ext}`;
}

/** Les dernières lignes du journal, la plus récente en premier. */
export function dernieresLignes(journal: unknown, n = 6): Array<{ at: string; message: string }> {
  if (!Array.isArray(journal)) return [];
  return journal
    .filter((e): e is Objet => estObjet(e))
    .map((e) => ({ at: String(e.at ?? ""), message: String(e.message ?? "") }))
    .slice(-n)
    .reverse();
}
