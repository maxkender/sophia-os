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
  // 26/11 : ?lang= vient aussi de l'ancien site (pt-BR, es-419, nb…) : la langue de base de Join si elle existe.
  const brut = (new URLSearchParams(location.search).get("lang") ?? "").trim().toLowerCase();
  const base = brut.split(/[-_]/)[0];
  const p = DISPONIBLES.has(brut) ? brut : base === "nb" || base === "nn" ? "no" : base;
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

/** 25/11 : la locale d'Intl pour une langue de Join (le serbe de Join s'écrit en alphabet latin). */
export function localeIntl(langue: string): string {
  return langue === "sr" ? "sr-Latn" : langue;
}

export function nomPays(code: string, langue: string): string {
  try {
    return new Intl.DisplayNames([localeIntl(langue), "en"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/**
 * 25/11 : un jour (AAAA-MM-JJ) sans jour de la semaine : « 30 November », « 30 listopada », « 11月30日 ». Les textes
 * écrivent eux-mêmes « lundi » à la bonne forme de leur langue (« w poniedziałek », « od poniedziałku », « na
 * segunda-feira ») : le jour de la semaine tout seul, tiré d'Intl, n'a jamais la bonne préposition ni le bon cas.
 */
export function jourMois(jour: string, langue: string): string {
  const d = new Date(`${jour.slice(0, 10)}T12:00:00Z`);
  try {
    return d.toLocaleDateString(localeIntl(langue), { day: "numeric", month: "long", timeZone: "UTC" });
  } catch {
    return jour.slice(0, 10);
  }
}

/** L'instant de minuit (00:00, heure de Paris) au début du jour donné (comme minuitParis de _shared/join.ts). */
export function minuitParis(jour: string): Date {
  const utc = new Date(`${jour.slice(0, 10)}T00:00:00Z`);
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", hour: "2-digit", hourCycle: "h23" }).format(utc));
  return new Date(utc.getTime() - h * 3_600_000);
}

/** La date limite avant un lundi de départ : la veille à 23:59, heure de Paris (le dimanche à minuit). */
export function limiteAvantLundi(lundi: string): Date {
  return new Date(minuitParis(lundi).getTime() - 60_000);
}

/**
 * 25/11 : une date limite lue dans le fuseau du candidat, avec l'heure : « Sunday 29 November, 19:59 » à São Paulo,
 * « niedziela, 29 listopada, 23:59 » à Varsovie. Les textes ajoutent « (minuit, heure de Paris) ».
 */
export function limiteLocale(instant: string | Date, langue: string): string {
  const d = new Date(instant);
  try {
    return d.toLocaleString(localeIntl(langue), { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
  } catch {
    return d.toISOString().slice(0, 16).replace("T", " ");
  }
}
