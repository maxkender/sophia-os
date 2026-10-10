/**
 * Utilitaires de TEST du test à blanc — importés par aucune fonction Edge.
 *
 * Le cœur est `fauxServeurPostgrest` : un faux `fetch` SOUS-JACENT, posé à la
 * place du vrai derrière l'intercepteur, et PIÉGÉ. Il ne sait répondre qu'à
 * GET / HEAD sur `https://test.supabase.co/rest/v1/<table>` (et, si on le lui
 * donne, au faux Gemini). Toute autre requête qui lui parvient — insert,
 * update, rpc, storage, functions, hôte externe — est une écriture ou un appel
 * qui a TRAVERSÉ l'intercepteur : elle est notée dans `violations` et lève.
 * Un test qui finit avec `violations` vide prouve donc que rien d'autre n'est
 * sorti.
 */

import {
  analyserUrlPostgrest,
  type Filtre,
  formeAccept,
  type Ligne,
  ligneCorrespond,
  type Ordre,
  reponsePostgrest,
  trierEtCouper,
} from "./a_blanc_postgrest.ts";
import { HOTE_GEMINI, installerIntercepteur } from "./a_blanc_intercepteur.ts";
import { oublierSondeMultiApp } from "./applications_moteur.ts";
import { oublierSondeTiersApplication } from "./tiers_application.ts";

export const URL_TEST = "https://test.supabase.co";
export const CLE_GEMINI_TEST = "CLE-GEMINI-SECRETE-123";
const PLAFOND = 1000;

/** Relation to-one embarquable : `table.fk` → `cible.cle`. */
export interface RelationEmbarquee {
  fk: string;
  table: string;
  cle?: string;
}
/** table → nom d'embed → relation. */
export type Relations = Record<string, Record<string, RelationEmbarquee>>;

export interface FauxGemini {
  appels: string[];
  repondre: (req: Request) => Promise<Response>;
}

/**
 * Faux Gemini : `repondeur(prompt)` rend le TEXTE du modèle (souvent un JSON).
 * Les prompts reçus sont gardés dans `appels`.
 */
export function fauxGemini(repondeur: (prompt: string) => string): FauxGemini {
  const appels: string[] = [];
  return {
    appels,
    repondre: async (req: Request) => {
      const corps = await req.json() as { contents?: Array<{ parts?: Array<{ text?: string }> }> };
      const prompt = (corps.contents?.[0]?.parts ?? []).map((p) => p.text ?? "").join("\n");
      appels.push(prompt);
      const texte = repondeur(prompt);
      return new Response(
        JSON.stringify({ candidates: [{ content: { parts: [{ text: texte }] } }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  };
}

interface Embed {
  nom: string;
  inner: boolean;
  colonnes: string[] | "*";
}

function decouper(texte: string): string[] {
  const parts: string[] = [];
  let profondeur = 0;
  let courant = "";
  for (const c of texte) {
    if (c === "(") profondeur += 1;
    if (c === ")") profondeur -= 1;
    if (c === "," && profondeur === 0) {
      parts.push(courant.trim());
      courant = "";
      continue;
    }
    courant += c;
  }
  if (courant.trim()) parts.push(courant.trim());
  return parts;
}

function analyserSelectAvecEmbeds(brut: string | null): { colonnes: string[] | "*"; embeds: Embed[] } {
  if (!brut || brut === "*") return { colonnes: "*", embeds: [] };
  const colonnes: string[] = [];
  const embeds: Embed[] = [];
  let etoile = false;
  for (const part of decouper(brut)) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)(!inner)?\((.*)\)$/s.exec(part);
    if (m) {
      const interieur = m[3].trim();
      embeds.push({
        nom: m[1],
        inner: Boolean(m[2]),
        colonnes: interieur === "" || interieur === "*" ? "*" : decouper(interieur),
      });
    } else if (part === "*") {
      etoile = true;
    } else if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(part)) {
      colonnes.push(part);
    } else {
      throw new Error(`faux serveur : select non géré « ${part} »`);
    }
  }
  return { colonnes: etoile ? "*" : colonnes, embeds };
}

function filtreUnique(colonne: string, valeur: string): Filtre {
  const r = analyserUrlPostgrest(new URL(`${URL_TEST}/rest/v1/t?${encodeURIComponent(colonne)}=${encodeURIComponent(valeur)}`));
  if (!r.filtresEvaluables || r.filtres.length !== 1) {
    throw new Error(`faux serveur : filtre non géré ${colonne}=${valeur}`);
  }
  return r.filtres[0];
}

function projeterColonnes(l: Ligne, colonnes: string[] | "*"): Ligne {
  if (colonnes === "*") return structuredClone(l);
  return Object.fromEntries(colonnes.map((c) => [c, structuredClone(l[c] ?? null)]));
}

/**
 * Faux PostgREST en lecture seule, PIÉGÉ. `tables` n'est jamais modifié : un
 * `instantane` avant / après le prouve.
 */
export function fauxServeurPostgrest(
  tables: Record<string, Ligne[]>,
  opts: { relations?: Relations; absentes?: string[]; gemini?: FauxGemini } = {},
) {
  const violations: string[] = [];
  const requetes: Array<{ methode: string; url: string }> = [];

  const lire = (url: URL, methode: string, entetes: Headers): Response => {
    const table = url.pathname.split("/").pop() ?? "";
    if (opts.absentes?.includes(table) || !(table in tables)) {
      return new Response(
        JSON.stringify({
          code: "PGRST205",
          details: null,
          hint: null,
          message: `Could not find the table 'public.${table}' in the schema cache`,
        }),
        { status: 404, headers: { "content-type": "application/json" } },
      );
    }
    const { colonnes, embeds } = analyserSelectAvecEmbeds(url.searchParams.get("select"));
    const filtres: Filtre[] = [];
    const filtresEmbed = new Map<string, Filtre[]>();
    let ordre: Ordre[] = [];
    let limite: number | null = null;
    let offset: number | null = null;
    for (const [cle, valeur] of url.searchParams.entries()) {
      if (cle === "select" || cle === "columns") continue;
      if (cle === "order") {
        ordre = analyserUrlPostgrest(new URL(`${URL_TEST}/rest/v1/t?order=${encodeURIComponent(valeur)}`)).ordre;
        continue;
      }
      if (cle === "limit") {
        limite = Number(valeur);
        continue;
      }
      if (cle === "offset") {
        offset = Number(valeur);
        continue;
      }
      if (cle.includes(".")) {
        const [rel, col] = cle.split(".");
        filtresEmbed.set(rel, [...(filtresEmbed.get(rel) ?? []), filtreUnique(col, valeur)]);
        continue;
      }
      filtres.push(filtreUnique(cle, valeur));
    }

    let lignes = (tables[table] ?? []).filter((l) => ligneCorrespond(l, filtres)).map((l) => structuredClone(l));
    for (const e of embeds) {
      const rel = opts.relations?.[table]?.[e.nom];
      if (!rel) throw new Error(`faux serveur : relation ${table}.${e.nom} non déclarée`);
      const cible = tables[rel.table] ?? [];
      const fe = filtresEmbed.get(e.nom) ?? [];
      lignes = lignes.flatMap((l) => {
        const trouvee = cible.find((c) => c[rel.cle ?? "id"] === l[rel.fk] && l[rel.fk] !== null);
        const valide = trouvee && ligneCorrespond(trouvee, fe) ? trouvee : null;
        if (e.inner && !valide) return [];
        return [{ ...l, [`__embed_${e.nom}`]: valide ? projeterColonnes(valide, e.colonnes) : null }];
      });
    }
    const total = lignes.length;
    lignes = trierEtCouper(lignes, ordre, Math.min(limite ?? PLAFOND, PLAFOND), offset);
    const sortie = lignes.map((l) => {
      const base = colonnes === "*"
        ? Object.fromEntries(Object.entries(l).filter(([c]) => !c.startsWith("__embed_")))
        : projeterColonnes(l, colonnes);
      for (const e of embeds) base[e.nom] = l[`__embed_${e.nom}`];
      return base;
    });

    const prefer = entetes.get("prefer") ?? "";
    const enTetes: Record<string, string> = { "content-type": "application/json; charset=utf-8" };
    if (/count=exact/.test(prefer)) {
      enTetes["content-range"] = sortie.length > 0 ? `0-${sortie.length - 1}/${total}` : `*/${total}`;
    }
    if (methode === "HEAD") return new Response(null, { status: 200, headers: enTetes });
    const objet = formeAccept(entetes.get("accept")) === "objet";
    const rep = reponsePostgrest(sortie, objet);
    return new Response(rep.body, { status: rep.status, headers: { ...enTetes } });
  };

  const fetch: typeof globalThis.fetch = async (input, init) => {
    const req = new Request(input, init);
    const url = new URL(req.url);
    const methode = req.method.toUpperCase();
    requetes.push({ methode, url: `${url.origin}${url.pathname}${url.search}` });
    const estTable = /^\/rest\/v1\/[A-Za-z0-9_]+$/.test(url.pathname) && !url.pathname.endsWith("/rpc");
    if (url.origin === URL_TEST && estTable && (methode === "GET" || methode === "HEAD")) {
      if (req.body !== null) {
        violations.push(`${methode} ${url.pathname} avec un corps`);
        throw new Error(`VIOLATION : lecture avec corps ${url}`);
      }
      return lire(url, methode, req.headers);
    }
    if (
      opts.gemini && url.hostname === HOTE_GEMINI && methode === "POST" &&
      /:generateContent$/.test(url.pathname)
    ) {
      return await opts.gemini.repondre(req);
    }
    violations.push(`${methode} ${url.origin}${url.pathname}`);
    throw new Error(`VIOLATION : ${methode} ${url.origin}${url.pathname} a traversé l'intercepteur`);
  };

  return { fetch, violations, requetes };
}

/** Copie profonde de la base : `assertEquals(instantane(t), avant)` prouve que rien n'a bougé. */
export function instantane<T>(tables: T): T {
  return structuredClone(tables);
}

const VARIABLES = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY", "GEMINI_API_KEY", "FAL_KEY"];

/**
 * Pose l'intercepteur devant `fetchSousJacent`, avec un environnement de test,
 * le temps de `fn` ; restaure tout ensuite (fetch, variables, sondes de schéma).
 */
export async function avecIntercepteur<T>(
  fetchSousJacent: typeof fetch,
  fn: () => Promise<T>,
): Promise<T> {
  const avant = new Map(VARIABLES.map((v) => [v, Deno.env.get(v)]));
  Deno.env.set("SUPABASE_URL", URL_TEST);
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "cle-service-test");
  Deno.env.set("SUPABASE_ANON_KEY", "cle-anon-test");
  Deno.env.set("GEMINI_API_KEY", CLE_GEMINI_TEST);
  Deno.env.set("FAL_KEY", "cle-fal-test");
  oublierSondeMultiApp();
  oublierSondeTiersApplication();
  const pose = installerIntercepteur({ supabaseUrl: URL_TEST, fetchOrigine: fetchSousJacent });
  try {
    return await fn();
  } finally {
    pose.desinstaller();
    oublierSondeMultiApp();
    oublierSondeTiersApplication();
    for (const [v, valeur] of avant) {
      if (valeur === undefined) Deno.env.delete(v);
      else Deno.env.set(v, valeur);
    }
  }
}
