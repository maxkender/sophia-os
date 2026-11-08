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

// --- Lecture de l'avancement (page) : où en est la vidéo, et qui doit agir ---

interface VideoAvancement {
  statut: StatutVideoMotion;
  erreur?: string | null;
  langues: Array<{ langue: string; statut: StatutLangueMotion }>;
  langues_visees?: string[];
}

/** Qui a la main : toi (relire, valider), le moteur (écrire, rendre), personne (fini, archivé). */
export type GroupeMotion = "a_toi" | "moteur" | "fini" | "archive";
export const GROUPES_MOTION: GroupeMotion[] = ["a_toi", "moteur", "fini", "archive"];

const FINIES: StatutLangueMotion[] = ["validee", "distribuee"];
const MOTEUR: StatutLangueMotion[] = ["en_attente", "en_cours", "rejetee"];

function piloteDe(v: VideoAvancement): string {
  return languePiloteDe(v.langues_visees?.length ? v.langues_visees : v.langues.map((l) => l.langue));
}

export function groupeVideo(v: VideoAvancement): GroupeMotion {
  if (v.statut === "archive") return "archive";
  if (v.erreur || v.statut === "brouillon" || v.statut === "script_pret") return "a_toi";
  if (v.langues.some((l) => l.statut === "a_valider" || l.statut === "echec")) return "a_toi";
  if (v.statut === "script_demande" || v.statut === "production") return "moteur";
  const pilote = piloteDe(v);
  if (v.langues.some((l) => MOTEUR.includes(l.statut) && !attendLaPilote(l, v.langues, pilote))) return "moteur";
  return v.statut === "termine" || (v.langues.length > 0 && v.langues.every((l) => FINIES.includes(l.statut))) ? "fini" : "a_toi";
}

/** Ce qu'il faut faire maintenant, en une phrase (clé i18n `motion.action.*`). */
export type ActionMotion =
  | { cle: "archivee" | "echec" | "script_en_cours" | "relire_script" | "terminee" }
  | { cle: "valider_pilote"; langues: string[] }
  | { cle: "valider_langues" | "moteur_rend"; langues: string[] };

export function prochaineAction(v: VideoAvancement): ActionMotion {
  if (v.statut === "archive") return { cle: "archivee" };
  if (v.erreur || v.langues.some((l) => l.statut === "echec")) return { cle: "echec" };
  if (v.statut === "brouillon" || v.statut === "script_demande") return { cle: "script_en_cours" };
  if (v.statut === "script_pret") return { cle: "relire_script" };
  const pilote = piloteDe(v);
  const aValider = v.langues.filter((l) => l.statut === "a_valider").map((l) => l.langue);
  if (aValider.includes(pilote)) return { cle: "valider_pilote", langues: [pilote] };
  if (aValider.length > 0) return { cle: "valider_langues", langues: aValider };
  const enCours = v.langues.filter((l) => MOTEUR.includes(l.statut) && !attendLaPilote(l, v.langues, pilote)).map((l) => l.langue);
  if (enCours.length > 0 || v.statut === "production") return { cle: "moteur_rend", langues: enCours.length ? enCours : [pilote] };
  if (v.langues.length > 0 && v.langues.every((l) => FINIES.includes(l.statut))) return { cle: "terminee" };
  return { cle: "moteur_rend", langues: [pilote] };
}

/** Les étapes d'une vidéo : script, version pilote, autres langues, publication. */
export type EtatEtape = "faite" | "a_toi" | "moteur" | "a_venir";
export interface EtapeMotion {
  cle: "script" | "pilote" | "traductions" | "publication";
  etat: EtatEtape;
}

export function etapesVideo(v: VideoAvancement): EtapeMotion[] {
  const pilote = piloteDe(v);
  const scriptFait = !["brouillon", "script_demande", "script_pret"].includes(v.statut);
  const etapes: EtapeMotion[] = [
    {
      cle: "script",
      etat: scriptFait ? "faite" : v.statut === "script_pret" || v.statut === "brouillon" ? "a_toi" : "moteur",
    },
  ];
  const p = v.langues.find((l) => l.langue === pilote);
  const piloteFaite = !!p && FINIES.includes(p.statut);
  etapes.push({
    cle: "pilote",
    etat: !scriptFait ? "a_venir" : piloteFaite ? "faite" : p?.statut === "a_valider" || p?.statut === "echec" ? "a_toi" : "moteur",
  });
  const visees = v.langues_visees?.length ? v.langues_visees : v.langues.map((l) => l.langue);
  const ligne = (langue: string) => v.langues.find((l) => l.langue === langue);
  const autres = visees.filter((l) => l !== pilote);
  if (autres.length > 0) {
    const rendues = autres.every((l) => ["a_valider", ...FINIES].includes(ligne(l)?.statut ?? "en_attente"));
    const auTravail = v.langues.some((l) => l.langue !== pilote && MOTEUR.includes(l.statut) && !attendLaPilote(l, v.langues, pilote));
    etapes.push({ cle: "traductions", etat: rendues ? "faite" : auTravail ? "moteur" : "a_venir" });
  }
  const toutes = visees.length > 0 && visees.every((l) => FINIES.includes(ligne(l)?.statut ?? "en_attente"));
  etapes.push({
    cle: "publication",
    etat: toutes ? "faite" : v.langues.some((l) => l.statut === "a_valider") && piloteFaite ? "a_toi" : "a_venir",
  });
  return etapes;
}

/** L'onglet ouvert d'abord : le script tant qu'il n'est pas validé, sinon les vidéos. */
export function ongletParDefaut(v: VideoAvancement): "script" | "videos" {
  return ["brouillon", "script_demande", "script_pret"].includes(v.statut) || v.langues.length === 0 ? "script" : "videos";
}

/** La langue pilote d'abord, puis l'ordre FR, EN, DE, IT. */
export function languesOrdonnees<T extends { langue: string }>(langues: T[], pilote: string): T[] {
  const rang = (l: string) => (l === pilote ? -1 : (LANGUES_MOTION as readonly string[]).indexOf(l));
  return [...langues].sort((a, b) => rang(a.langue) - rang(b.langue));
}
