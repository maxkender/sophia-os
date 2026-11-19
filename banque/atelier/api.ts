// Les deux guichets de la banque : Apify (le scraper Pinterest) et la fonction
// Edge `banque` de l'OS. Aucun jeton ne s'écrit dans un fichier.
//   - Apify : le jeton est injecté par le proxy de la session (rien à fournir) ;
//     hors session, APIFY_TOKEN dans l'environnement.
//   - OS : BANQUE_JETON dans l'environnement (en-tête x-banque-jeton).
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import type { Candidat } from "./pinterest.ts";

export const ACTEUR = "epctex~pinterest-scraper";
const APIFY = "https://api.apify.com/v2";
const URL_DEFAUT = "https://mbikecieskoobeizixig.supabase.co";

export const STOCK = "donnees/candidats.json";
export const PLANCHES = "donnees/planches.json";
export const JOURNAL = "donnees/journal.json";

export function lire<T>(chemin: string, defaut: T): T {
  return existsSync(chemin) ? (JSON.parse(readFileSync(chemin, "utf8")) as T) : defaut;
}

/** Écrit d'un coup (fichier temporaire, puis renommage) : une autre commande qui lit en même temps ne voit jamais un fichier à moitié écrit. */
export function ecrire(chemin: string, valeur: unknown): void {
  mkdirSync("donnees", { recursive: true });
  const provisoire = `${chemin}.${process.pid}.tmp`;
  writeFileSync(provisoire, JSON.stringify(valeur, null, 1));
  renameSync(provisoire, chemin);
}

export const lireStock = () => lire<Record<string, Candidat>>(STOCK, {});

async function apify<T>(chemin: string, corps?: unknown): Promise<T> {
  const jeton = process.env.APIFY_TOKEN;
  const r = await fetch(`${APIFY}${chemin}`, {
    method: corps === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", ...(jeton ? { authorization: `Bearer ${jeton}` } : {}) },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  });
  if (!r.ok) throw new Error(`Apify ${chemin.split("?")[0]} : HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
  return (await r.json()) as T;
}

type Run = { id: string; status: string; defaultDatasetId: string; usageTotalUsd?: number };

/**
 * Lance le scraper, attend sa fin, rend (épingles, coût en $). Asynchrone : le
 * proxy de la session coupe une requête au bout de ~30 s.
 */
export async function scraper(entree: Record<string, unknown>): Promise<{ items: Record<string, unknown>[]; cout: number; run: string }> {
  let run = (await apify<{ data: Run }>(`/acts/${ACTEUR}/runs`, entree)).data;
  const debut = Date.now();
  while (run.status === "READY" || run.status === "RUNNING") {
    if (Date.now() - debut > 15 * 60_000) throw new Error(`Le run Apify ${run.id} tourne encore après 15 min : relis-le plus tard, ne le relance pas.`);
    await new Promise((s) => setTimeout(s, 6000));
    run = (await apify<{ data: Run }>(`/actor-runs/${run.id}`)).data;
  }
  if (run.status !== "SUCCEEDED") throw new Error(`Run Apify ${run.id} : ${run.status}`);
  const items: Record<string, unknown>[] = [];
  for (let debutLot = 0; ; debutLot += 1000) {
    const lot = await apify<Record<string, unknown>[]>(`/datasets/${run.defaultDatasetId}/items?clean=true&limit=1000&offset=${debutLot}`);
    items.push(...lot);
    if (lot.length < 1000) break;
  }
  // Apify chiffre un run quelques secondes après sa fin : on relit une fois.
  let cout = Number(run.usageTotalUsd) || 0;
  if (!cout && items.length) {
    await new Promise((s) => setTimeout(s, 5000));
    cout = Number((await apify<{ data: Run }>(`/actor-runs/${run.id}`)).data.usageTotalUsd) || 0;
  }
  return { items, cout, run: run.id };
}

export async function appelBanque<T = Record<string, unknown>>(corps: Record<string, unknown>): Promise<T & { ok: boolean; error?: string; code?: string }> {
  const jeton = process.env.BANQUE_JETON;
  if (!jeton) throw new Error("BANQUE_JETON manquant dans l'environnement");
  const r = await fetch(`${process.env.SUPABASE_URL ?? URL_DEFAUT}/functions/v1/banque`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-banque-jeton": jeton },
    body: JSON.stringify(corps),
  });
  const json = (await r.json().catch(() => ({ ok: false, error: `HTTP ${r.status}` }))) as T & { ok: boolean; error?: string; code?: string };
  if (!r.ok && json.ok !== false) return { ...json, ok: false, error: `HTTP ${r.status}` };
  return json;
}

/** Les empreintes déjà en banque parmi celles-ci (vide si BANQUE_JETON manque : le tri reste possible). */
export async function dejaEnBanque(refs: string[]): Promise<Set<string>> {
  const connues = new Set<string>();
  if (!process.env.BANQUE_JETON) return connues;
  for (let i = 0; i < refs.length; i += 2000) {
    const r = await appelBanque<{ connues: string[] }>({ action: "connues", site: "pinterest", refs: refs.slice(i, i + 2000) });
    if (!r.ok) throw new Error(`connues : ${r.error}`);
    for (const ref of r.connues) connues.add(ref);
  }
  return connues;
}
