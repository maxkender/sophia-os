/**
 * 12/11 : la base du login @sophia.com (prénom + initiale du nom), en lettres latines.
 * Un nom en grec ou en cyrillique (« ΚΩΝΣΤΑΝΤΙΝΑ », « Кирилл ») donnait une base vide, donc
 * « @sophia.com », refusé par Supabase (« Unable to validate email address: invalid format ») :
 * le site ne pouvait pas créer le compte de ces signés. On translittère, et un nom illisible
 * donne « poster » (le suffixe numérique rend le login unique).
 */

const GREC: Record<string, string> = {
  α: "a", β: "v", γ: "g", δ: "d", ε: "e", ζ: "z", η: "i", θ: "th", ι: "i", κ: "k", λ: "l", μ: "m",
  ν: "n", ξ: "x", ο: "o", π: "p", ρ: "r", σ: "s", ς: "s", τ: "t", υ: "y", φ: "f", χ: "ch", ψ: "ps", ω: "o",
};

const CYRILLIQUE: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l",
  м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch",
  ш: "sh", щ: "shch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya", і: "i", ї: "yi", є: "ye", ґ: "g", ё: "e",
};

/** Lettres latines minuscules et chiffres seulement (accents retirés, grec et cyrillique translittérés). */
export function normaliserLogin(valeur: string): string {
  const minuscule = valeur.toLowerCase();
  // Avant NFD : « й » et « ё » perdraient leur signe et deviendraient « и » / « е ».
  let latin = "";
  for (const c of minuscule) latin += c === "й" ? "y" : c === "ё" ? "e" : c;
  latin = latin.normalize("NFD").replace(/[̀-ͯ]/g, "");
  let sortie = "";
  for (const c of latin) sortie += GREC[c] ?? CYRILLIQUE[c] ?? c;
  return sortie.replace(/[^a-z0-9]/g, "");
}

/** La base du login : prénom + initiale du nom ; « poster » si rien de lisible. */
export function baseLogin(prenom: string, nom: string): string {
  const base = normaliserLogin(prenom) + normaliserLogin(nom).slice(0, 1);
  return base || "poster";
}
