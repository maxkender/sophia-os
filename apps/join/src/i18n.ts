// Traductions : un fichier src/locales/<langue>.json par langue (clés plates). L'anglais sert de secours.
import en from "./locales/en.json";

type Dico = Record<string, string>;

const fichiers = import.meta.glob<{ default: Dico }>("./locales/*.json", { eager: true });

export const DICOS: Record<string, Dico> = Object.fromEntries(
  Object.entries(fichiers).map(([chemin, m]) => [chemin.replace(/^.*\/(\w+)\.json$/, "$1"), m.default]),
);

export const LANGUES: { code: string; nom: string }[] = [
  ["en", "English"], ["fr", "Français"], ["es", "Español"], ["it", "Italiano"], ["de", "Deutsch"], ["pt", "Português"],
  ["ro", "Română"], ["pl", "Polski"], ["hu", "Magyar"], ["tr", "Türkçe"], ["nl", "Nederlands"], ["el", "Ελληνικά"],
  ["hr", "Hrvatski"], ["sr", "Srpski"], ["cs", "Čeština"], ["sk", "Slovenčina"], ["bg", "Български"],
].filter(([c]) => DICOS[c]).map(([code, nom]) => ({ code, nom }));

export function langueInitiale(): string {
  const p = new URLSearchParams(location.search).get("lang");
  if (p && DICOS[p]) return p;
  try {
    const g = localStorage.getItem("join_langue");
    if (g && DICOS[g]) return g;
  } catch {
    // stockage indisponible
  }
  for (const l of navigator.languages ?? [navigator.language]) {
    const c = l.slice(0, 2).toLowerCase();
    if (DICOS[c]) return c;
  }
  return "en";
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
