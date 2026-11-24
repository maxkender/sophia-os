// Traductions : un fichier src/locales/<langue>.json par langue (clés plates). L'anglais sert de secours.
import { langueDuNavigateur, NOMS_LANGUES } from "./langues";
import en from "./locales/en.json";

type Dico = Record<string, string>;

// 24/11 : 30 langues. L'anglais est dans le paquet ; les autres sont chargées à la demande (un petit fichier par
// langue), la langue de départ avant le premier rendu (main.tsx).
const fichiers = import.meta.glob<{ default: Dico }>(["./locales/*.json", "!./locales/en.json"]);
const codeDe = (chemin: string) => chemin.replace(/^.*\/([\w-]+)\.json$/, "$1");
const CHARGEURS: Record<string, () => Promise<{ default: Dico }>> = Object.fromEntries(
  Object.entries(fichiers).map(([chemin, charger]) => [codeDe(chemin), charger]),
);

/** Les langues disponibles (chargées ou non). */
const DISPONIBLES = new Set(["en", ...Object.keys(CHARGEURS)]);

/** Les dictionnaires déjà chargés. */
const DICOS: Record<string, Dico> = { en: en as Dico };

/** Charge une langue (sans effet si elle l'est déjà ou si elle n'existe pas). */
export async function chargerLangue(code: string): Promise<void> {
  if (DICOS[code] || !CHARGEURS[code]) return;
  try {
    DICOS[code] = (await CHARGEURS[code]()).default;
  } catch {
    // réseau coupé : l'anglais sert de secours
  }
}

export const langueChargee = (code: string): boolean => !!DICOS[code];

export { estRtl } from "./langues";

/** Toutes les langues de Join, chacune avec son nom natif : l'alphabet latin d'abord, puis les autres écritures. */
export const LANGUES: { code: string; nom: string }[] = Object.entries(NOMS_LANGUES)
  .filter(([c]) => DISPONIBLES.has(c))
  .sort((a, b) => a[1].localeCompare(b[1], "en"))
  .map(([code, nom]) => ({ code, nom }));

export function langueInitiale(): string {
  const p = new URLSearchParams(location.search).get("lang");
  if (p && DISPONIBLES.has(p)) return p;
  try {
    const g = localStorage.getItem("join_langue");
    if (g && DISPONIBLES.has(g)) return g;
  } catch {
    // stockage indisponible
  }
  return langueDuNavigateur(navigator.languages?.length ? navigator.languages : [navigator.language], (c) => DISPONIBLES.has(c));
}

export type T = (cle: string, vars?: Record<string, string | number>) => string;

export function traducteur(langue: string): T {
  const d = DICOS[langue] ?? {};
  const base = en as Dico;
  return (cle, vars) => {
    const s = d[cle] ?? base[cle] ?? cle;
    return vars ? s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? "")) : s;
  };
}

export function nomPays(code: string, langue: string): string {
  try {
    return new Intl.DisplayNames([langue, "en"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

export function dateLongue(jour: string, langue: string): string {
  const d = new Date(`${jour}T12:00:00Z`);
  try {
    return d.toLocaleDateString(langue, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  } catch {
    return jour;
  }
}

/** La date limite (instant ISO) lue à Paris : « Sunday 29 November ». */
export function heureLimite(iso: string, langue: string): string {
  try {
    return new Date(iso).toLocaleDateString(langue, { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Paris" });
  } catch {
    return iso.slice(0, 10);
  }
}
