import type { CleSection, LigneJour, PosteurJour, SectionJour, Ton } from "./api";

/**
 * 21/11 (Max, points 7 et 10) : la logique pure de la page « Aujourd'hui » : filtres, recherche,
 * « depuis », couleurs et navigation au clavier (J/K).
 */

export const ORDRE_SECTIONS: readonly CleSection[] = ["valider", "argent", "posteurs", "contenu", "technique"];

/** Les couleurs des sections (bordure à gauche, pastille du compteur). */
export const COULEUR_SECTION: Record<CleSection, string> = {
  valider: "border-l-violet-500",
  argent: "border-l-red-500",
  posteurs: "border-l-amber-500",
  contenu: "border-l-sky-500",
  technique: "border-l-slate-500",
};

export const PASTILLE: Record<Ton, string> = { rouge: "bg-red-500", orange: "bg-amber-500", gris: "bg-slate-300 dark:bg-slate-600" };

export interface FiltresJour {
  recherche: string;
  categorie: string | null;
  plateforme: "upwork" | "ruul" | null;
  urgence: Ton | null;
}

export const FILTRES_VIDES: FiltresJour = { recherche: "", categorie: null, plateforme: null, urgence: null };

const RANG_TON: Record<Ton, number> = { rouge: 0, orange: 1, gris: 2 };

/** « 3 j », « 5 h », « 20 min » (vide sans date). */
export function depuisCourt(depuis: string | null, maintenant = new Date()): string {
  if (!depuis) return "";
  const min = Math.max(0, Math.round((maintenant.getTime() - new Date(depuis).getTime()) / 60_000));
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  return h < 48 ? `${h} h` : `${Math.round(h / 24)} j`;
}

const normaliser = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();

/** Un posteur correspond à la recherche : nom, @ TikTok (avec ou sans @) ou email. */
export function posteurCorrespond(p: PosteurJour, recherche: string): boolean {
  const q = normaliser(recherche).replace(/^@/, "");
  if (!q) return true;
  return [p.nom ?? "", p.email ?? "", ...p.handles.map((h) => h.replace(/^@/, ""))].some((x) => normaliser(x).includes(q));
}

/** Une ligne passe les filtres : catégorie, plateforme, urgence, et recherche (titre ou un de ses posteurs). */
export function lignePasse(l: LigneJour, f: FiltresJour, posteurs: Map<string, PosteurJour>): boolean {
  if (f.categorie && l.categorie !== f.categorie) return false;
  if (f.plateforme && l.plateforme && l.plateforme !== f.plateforme) return false;
  if (f.urgence && l.ton !== f.urgence) return false;
  const q = f.recherche.trim();
  if (!q) return true;
  if (normaliser(l.titre).includes(normaliser(q))) return true;
  return l.posteurs.some((id) => {
    const p = posteurs.get(id);
    return p ? posteurCorrespond(p, q) : false;
  });
}

/** Les sections dans l'ordre, lignes filtrées et triées (rouge, orange, gris ; la plus ancienne d'abord). */
export function sectionsFiltrees(sections: SectionJour[], f: FiltresJour, posteurs: Map<string, PosteurJour>): SectionJour[] {
  return ORDRE_SECTIONS.map((cle) => sections.find((s) => s.cle === cle))
    .filter((s): s is SectionJour => Boolean(s))
    .map((s) => ({
      ...s,
      lignes: s.lignes.filter((l) => lignePasse(l, f, posteurs)).sort((a, b) =>
        RANG_TON[a.ton] - RANG_TON[b.ton] || (a.depuis ?? "9").localeCompare(b.depuis ?? "9")),
    }));
}

/** Le compteur d'une section : les lignes qui ne sont pas grises (ce qui attend vraiment). */
export const compteur = (s: SectionJour) => s.lignes.filter((l) => l.ton !== "gris").length;

/** La couleur dominante d'une section (la pire de ses lignes). */
export function tonSection(s: SectionJour): Ton {
  if (s.lignes.some((l) => l.ton === "rouge")) return "rouge";
  if (s.lignes.some((l) => l.ton === "orange")) return "orange";
  return "gris";
}

/** Les catégories présentes (pour le filtre), triées. */
export function categories(sections: SectionJour[]): string[] {
  return [...new Set(sections.flatMap((s) => s.lignes.map((l) => l.categorie).filter((c): c is string => Boolean(c))))].sort();
}

/** J / K : la ligne suivante ou précédente parmi les lignes visibles (sections ouvertes). */
export function deplacer(ids: string[], courant: string | null, sens: 1 | -1): string | null {
  if (!ids.length) return null;
  const i = courant ? ids.indexOf(courant) : -1;
  if (i === -1) return sens === 1 ? ids[0] : ids[ids.length - 1];
  return ids[Math.min(ids.length - 1, Math.max(0, i + sens))];
}

/** Les 5 derniers échanges du fil (le plus récent en bas), sans les actions de l'OS. */
export function derniersEchanges<T extends { sens: string; at: string }>(fil: T[], n = 5): T[] {
  return fil.filter((e) => e.sens !== "action").slice(-n);
}

/** La phrase du haut de la page. */
export function phraseResume(r: { a_valider: number; cas: number; problemes: number; reponses: number; corrections: number }): string {
  const p = (n: number, un: string, plusieurs: string) => `${n} ${n > 1 ? plusieurs : un}`;
  return `${p(r.a_valider, "chose à valider", "choses à valider")} · ${p(r.cas, "cas pour toi", "cas pour toi")} · ` +
    `${p(r.problemes, "problème", "problèmes")} · géré seul : ${p(r.reponses, "réponse", "réponses")}, ${p(r.corrections, "correction", "corrections")}`;
}
