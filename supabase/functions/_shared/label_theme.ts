/**
 * Thème + genre déduits du nom/slug d'un label.
 * Partagé par persona (prénoms) et avatar (PDP du bon pool).
 */

export type Genre = "homme" | "femme";

export type ThemeLabel =
  | "alpha_male"
  | "smart_girl"
  | "clean_girl"
  | "cinema"
  | "anciens"
  | "default";

function sansAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function normaliserLabel(s: string): string {
  return sansAccents(s).replace(/[^a-z0-9]+/g, "_");
}

/** Déduit le thème persona depuis le nom ou slug du label. */
export function themeDuLabel(nomOuSlug: string | null | undefined): ThemeLabel {
  const s = normaliserLabel(nomOuSlug ?? "");
  if (!s) return "default";
  if (s.includes("ancien")) return "anciens";
  if (s === "cinema" || s === "film" || (s.includes("cinema") && !s.includes("alpha"))) {
    return "cinema";
  }
  if (s.includes("clean")) return "clean_girl";
  // alpha* / *male* (y compris alpha_msle_dark typo) → alpha_male
  if (s.includes("alpha") || (s.includes("male") && !s.includes("girl"))) return "alpha_male";
  if (s.includes("girl") || s.includes("smart") || s.includes("beau")) return "smart_girl";
  return "default";
}

/**
 * Genre imposé par le label / thème.
 * clean_girl / smart_girl / *_girl → femme
 * alpha_male / *male* → homme
 */
export function genreDuLabel(nomOuSlug: string | null | undefined): Genre | null {
  const theme = themeDuLabel(nomOuSlug);
  if (theme === "alpha_male") return "homme";
  if (theme === "clean_girl" || theme === "smart_girl") return "femme";
  const s = normaliserLabel(nomOuSlug ?? "");
  if (!s) return null;
  if (s.includes("girl") || s.includes("femme") || s.includes("woman")) return "femme";
  if (s.includes("male") || s.includes("homme") || s.includes("alpha")) return "homme";
  return null;
}
