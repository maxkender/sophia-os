/**
 * Test à blanc — l'intercepteur `fetch`, fermé par défaut.
 *
 * POSÉ SEULEMENT dans l'isolate de la fonction Edge `assignation-a-blanc`
 * (voir assignation-a-blanc/installer.ts). Une fonction Edge est un bundle et
 * un isolate à elle : remplacer `globalThis.fetch` ici ne touche ni la nuit,
 * ni l'assignation test, ni aucune autre fonction. Importer ce module ne
 * remplace RIEN : seule `installerIntercepteur` le fait.
 *
 * Toute requête HTTP du code de la nuit passe par `fetch` (supabase-js 2.112
 * relit `fetch` à CHAQUE appel — `resolveFetch` —, et aucun module de la
 * fermeture de l'assignation n'ouvre de socket, de WebSocket ou de worker).
 * L'intercepteur décide, dans cet ordre, et rien n'atteint le vrai `fetch`
 * hors des DEUX portes `envoyerLecture` / `envoyerIA` :
 *
 *  1. requête illisible, hors contexte de test, ou contexte fermé → BLOQUÉE ;
 *  2. origine SUPABASE_URL :
 *     - chemin autre que `/rest/v1/<table>` (rpc, storage, functions, auth,
 *       graphql, realtime…) → bloqué (403) — la liste blanche RPC est VIDE ;
 *     - en-tête de surcharge de méthode → bloqué ;
 *     - GET / HEAD → lecture réelle (à travers le calque si la table a été
 *       « écrite » pendant le test) ;
 *     - contexte qui n'est pas un run (authentification) → bloqué ;
 *     - POST / PATCH / DELETE → SIMULÉ : jamais envoyé, gardé dans le calque,
 *       journalisé, et une réponse au format de supabase-js est rendue ;
 *     - toute autre méthode → bloquée ;
 *  3. API Gemini `generateContent`, case IA cochée, sous le plafond → envoyée
 *     (rien n'est écrit : le deck fabriqué reste dans le calque) ;
 *  4. tout le reste (fal, TikTok, Apify, Replicate, Gemini sans IA…) → bloqué,
 *     par une TypeError comme une coupure réseau.
 *
 * Une exception interne est BLOQUÉE elle aussi : il n'y a pas de repli sur le
 * vrai `fetch`, nulle part.
 *
 * Les messages de blocage ne contiennent ni code HTTP (429, 50x) ni « timeout »,
 * « unavailable », « overload » : `callWithFallback` (gemini.ts) n'y voit pas
 * une panne passagère et lève après un seul tour de modèles, sans attente.
 */

import { AsyncLocalStorage } from "node:async_hooks";

import {
  analyserUrlPostgrest,
  decrireFiltres,
  estRequeteSimple,
  formeAccept,
  type Ligne,
  preferences,
  projeter,
  reponsePostgrest,
  type RequetePostgrest,
} from "./a_blanc_postgrest.ts";
import {
  Calque,
  clePrimaire,
  type Lecteur,
  ligneEnConflit,
  lignesCiblees,
  lireSuperpose,
} from "./a_blanc_calque.ts";

export const HOTE_GEMINI = "generativelanguage.googleapis.com";

/**
 * Fonctions RPC autorisées : AUCUNE. Le chemin d'assignation d'un compte n'en
 * appelle pas (relevé de `.rpc(` sur sa fermeture d'imports : seuls
 * media_caption.ts et slide_media.ts en ont, hors chemin, et elles ÉCRIVENT).
 * En ajouter une exigerait la preuve qu'elle est STABLE ou IMMUTABLE et
 * n'écrit rien.
 */
export const RPC_LECTURE_SEULE: ReadonlySet<string> = new Set<string>();

/** Appels IA autorisés par test (case cochée) : au-delà, bloqués et notés. */
export const PLAFOND_APPELS_IA = 30;

/** Événements texte poussés dans le flux ; les compteurs, eux, restent complets. */
export const PLAFOND_EVENEMENTS = 300;

const CHEMIN_TABLE = /^\/rest\/v1\/([A-Za-z0-9_]+)$/;
const CHEMIN_GEMINI = /^\/v1beta\/models\/[A-Za-z0-9._-]+:generateContent$/;
const ENTETES_SURCHARGE = ["x-http-method-override", "x-http-method", "x-method-override"];
const ENTETES_LECTURE = [
  "apikey",
  "authorization",
  "accept",
  "accept-profile",
  "x-client-info",
  "range",
  "range-unit",
];

export type OperationEcriture = "insert" | "update" | "upsert" | "delete";

export interface EcritureEvitee {
  seq: number;
  at: string;
  table: string;
  operation: OperationEcriture;
  /** Lignes touchées ; null si non résolu (écriture sans filtre). */
  lignes: number | null;
  /** Filtres lisibles (« id=eq.… »), ou `on_conflict` d'un upsert. */
  cible: string;
  /** Lignes complètes (insert, upsert) ou patch (update). */
  valeurs: Ligne[];
  /** Clés primaires des lignes touchées. */
  cles: Ligne[];
}

export type MotifBlocage =
  | "hors_contexte"
  | "contexte_ferme"
  | "supabase_rpc"
  | "supabase_storage"
  | "supabase_functions"
  | "supabase_auth"
  | "supabase_autre"
  | "methode_refusee"
  | "hors_run"
  | "ia_non_autorisee"
  | "ia_plafond"
  | "externe"
  | "requete_illisible"
  | "erreur_interne";

export interface AppelBloque {
  seq: number;
  at: string;
  hote: string;
  methode: string;
  /** Chemin SANS la query : une clé passée en paramètre n'y figure jamais. */
  chemin: string;
  motif: MotifBlocage;
}

export interface SuiviIA {
  autorises: number;
  bloques: number;
}

/** Ce qu'un deck a coûté et d'où il vient (rempli par a_blanc_decks.ts). */
export interface NoteDeck {
  contenuId: string;
  langue: string;
  /** Slug de l'application du deck. */
  application: string;
  origine: "existant" | "livre" | "cuit_ia" | "a_fabriquer" | "refuse" | "echec" | "budget";
  /** Ce qu'il faudrait fabriquer (aperçu) : « traduction de + placement Sophia »… */
  besoin?: string;
  raison?: string;
  hashtagsIA: "inutile" | "generes" | "bloques";
  appelsIA: SuiviIA;
  /** Écritures que ferait la fabrication (aperçu : NON simulées, donc absentes du journal). */
  fabrication?: string[];
}

export interface EtatABlanc {
  id: string;
  nature: "auth" | "run";
  ia: boolean;
  /** Posé en fin de test : toute requête tardive est alors bloquée. */
  ferme: boolean;
  seq: number;
  journal: EcritureEvitee[];
  bloques: AppelBloque[];
  compteurIA: SuiviIA;
  plafondIA: number;
  lectures: number;
  lecturesParTable: Map<string, number>;
  limites: Set<string>;
  calque: Calque;
  decks: NoteDeck[];
  evenementsEmis: number;
  /** Reçoit les lignes « Évité · … » / « Bloqué · … ». Ne doit pas lever (et si elle lève, c'est avalé). */
  onEvenement?: (texte: string) => void;
}

export interface ContexteABlanc {
  etat: EtatABlanc;
  /** Compteur IA local d'un appel de deck (a_blanc_decks.ts), en plus du global. */
  suivi?: SuiviIA;
}

const stockage = new AsyncLocalStorage<ContexteABlanc>();

export function creerContexteABlanc(args: {
  nature: "auth" | "run";
  ia: boolean;
  plafondIA?: number;
}): ContexteABlanc {
  return {
    etat: {
      id: crypto.randomUUID(),
      nature: args.nature,
      ia: args.ia,
      ferme: false,
      seq: 0,
      journal: [],
      bloques: [],
      compteurIA: { autorises: 0, bloques: 0 },
      plafondIA: args.plafondIA ?? PLAFOND_APPELS_IA,
      lectures: 0,
      lecturesParTable: new Map(),
      limites: new Set(),
      calque: new Calque(),
      decks: [],
      evenementsEmis: 0,
    },
  };
}

/** Exécute `fn` dans ce contexte (suit await, timers, Promise.all, flux). */
export function executerDansContexte<T>(ctx: ContexteABlanc, fn: () => T): T {
  return stockage.run(ctx, fn);
}

/** Contexte du test en cours, ou undefined (tout est alors bloqué). */
export function contexteABlanc(): ContexteABlanc | undefined {
  return stockage.getStore();
}

/** Exécute `fn` dans le même test, avec un compteur IA local en plus. */
export function avecSuivi<T>(suivi: SuiviIA, fn: () => T): T {
  const ctx = stockage.getStore();
  if (!ctx) return fn();
  return stockage.run({ etat: ctx.etat, suivi }, fn);
}

// ---------------------------------------------------------------------------
// Journal et événements
// ---------------------------------------------------------------------------

function notifier(etat: EtatABlanc, texte: string): void {
  if (etat.evenementsEmis > PLAFOND_EVENEMENTS) return;
  etat.evenementsEmis += 1;
  const ligne = etat.evenementsEmis > PLAFOND_EVENEMENTS
    ? `… plus de ${PLAFOND_EVENEMENTS} événements : la suite n'est plus affichée (les compteurs restent complets)`
    : texte;
  try {
    etat.onEvenement?.(ligne);
  } catch {
    // Un flux fermé ne change jamais une décision de l'intercepteur.
  }
}

function noterEcriture(
  etat: EtatABlanc,
  e: Omit<EcritureEvitee, "seq" | "at">,
): void {
  etat.seq += 1;
  etat.journal.push({ ...e, seq: etat.seq, at: new Date().toISOString() });
  notifier(
    etat,
    `Évité · ${e.operation.toUpperCase()} ${e.table} (${e.lignes ?? "?"})`,
  );
}

type Blocage = { hote: string; methode: string; chemin: string; motif: MotifBlocage; supabase: boolean };

function noterBlocage(ctx: ContexteABlanc | undefined, b: Blocage): void {
  if (!ctx) {
    console.warn(`[a-blanc] requête bloquée hors contexte : ${b.methode} ${b.hote}${b.chemin}`);
    return;
  }
  const etat = ctx.etat;
  etat.seq += 1;
  etat.bloques.push({
    seq: etat.seq,
    at: new Date().toISOString(),
    hote: b.hote,
    methode: b.methode,
    chemin: b.chemin,
    motif: b.motif,
  });
  if (b.hote === HOTE_GEMINI) {
    etat.compteurIA.bloques += 1;
    if (ctx.suivi) ctx.suivi.bloques += 1;
  }
  notifier(etat, `Bloqué · ${b.methode} ${b.hote} (${b.motif})`);
}

/** Erreur réseau RÉELLE d'une requête autorisée : rendue telle quelle à l'appelant. */
class ErreurTransport {
  constructor(readonly cause: unknown) {}
}

// ---------------------------------------------------------------------------
// L'intercepteur
// ---------------------------------------------------------------------------

export interface OptionsIntercepteur {
  supabaseUrl: string;
  /** Le vrai `fetch` (ou, en test, un faux piégé). Seules les deux portes l'appellent. */
  fetchOrigine: typeof fetch;
}

type Issue = { reponse: Response } | { bloque: Blocage };

export function creerFetchABlanc(opts: OptionsIntercepteur): typeof fetch {
  const origineSupabase = new URL(opts.supabaseUrl).origin;
  const fetchOrigine = opts.fetchOrigine;

  /** PORTE 1 — lecture PostgREST. Revérifie tout avant d'appeler le vrai fetch. */
  const envoyerLecture = async (
    ctx: ContexteABlanc,
    url: URL,
    source: Headers,
    methode: string,
    signal: AbortSignal | null,
  ): Promise<Response> => {
    const m = CHEMIN_TABLE.exec(url.pathname);
    if (url.origin !== origineSupabase || !m || m[1] === "rpc") {
      throw new Error("garde de lecture : chemin refusé");
    }
    if (methode !== "GET" && methode !== "HEAD") throw new Error("garde de lecture : méthode refusée");
    if (ctx.etat.ferme) throw new Error("garde de lecture : contexte fermé");
    const entetes = new Headers();
    for (const nom of ENTETES_LECTURE) {
      const v = source.get(nom);
      if (v !== null) entetes.set(nom, v);
    }
    const compte = [...preferences(source.get("prefer"))].filter((p) =>
      /^count=(exact|planned|estimated)$/.test(p)
    );
    if (compte.length > 0) entetes.set("prefer", compte.join(", "));
    ctx.etat.lectures += 1;
    ctx.etat.lecturesParTable.set(m[1], (ctx.etat.lecturesParTable.get(m[1]) ?? 0) + 1);
    try {
      return await fetchOrigine(url.toString(), {
        method: methode,
        headers: entetes,
        signal: signal ?? undefined,
      });
    } catch (e) {
      throw new ErreurTransport(e);
    }
  };

  /** PORTE 2 — génération Gemini, case IA cochée. Revérifie tout. */
  const envoyerIA = async (ctx: ContexteABlanc, req: Request, url: URL): Promise<Response> => {
    if (
      !ctx.etat.ia || ctx.etat.ferme || url.protocol !== "https:" || url.hostname !== HOTE_GEMINI ||
      url.port !== "" || req.method.toUpperCase() !== "POST" || !CHEMIN_GEMINI.test(url.pathname)
    ) {
      throw new Error("garde IA : requête refusée");
    }
    const corps = await req.text();
    ctx.etat.compteurIA.autorises += 1;
    if (ctx.suivi) ctx.suivi.autorises += 1;
    try {
      return await fetchOrigine(url.toString(), {
        method: "POST",
        headers: req.headers,
        body: corps,
        signal: req.signal,
      });
    } catch (e) {
      throw new ErreurTransport(e);
    }
  };

  /** Lecture réelle pour le calque : tableau JSON forcé, lignes parsées. */
  const lecteurPour = (ctx: ContexteABlanc, req: Request): Lecteur => async (u: URL) => {
    const entetes = new Headers(req.headers);
    entetes.set("accept", "application/json");
    entetes.delete("prefer");
    entetes.delete("range");
    const rep = await envoyerLecture(ctx, u, entetes, "GET", req.signal);
    if (!rep.ok) return { reponse: rep, lignes: null };
    const texte = await rep.text();
    const refaite = () => new Response(texte, { status: rep.status, headers: rep.headers });
    try {
      const data = JSON.parse(texte);
      return Array.isArray(data) ? { reponse: refaite(), lignes: data as Ligne[] } : { reponse: refaite(), lignes: null };
    } catch {
      return { reponse: refaite(), lignes: null };
    }
  };

  const lire = async (
    ctx: ContexteABlanc,
    req: Request,
    url: URL,
    methode: string,
    requete: RequetePostgrest,
  ): Promise<Response> => {
    const etat = ctx.etat;
    const table = requete.table;
    if (!etat.calque.touche(table)) return await envoyerLecture(ctx, url, req.headers, methode, req.signal);
    const forme = formeAccept(req.headers.get("accept"));
    const compte = [...preferences(req.headers.get("prefer"))].some((p) => p.startsWith("count="));
    if (methode === "HEAD" || compte || forme === "inconnue" || !estRequeteSimple(requete)) {
      const raison = methode === "HEAD"
        ? "HEAD"
        : compte
        ? "count"
        : forme === "inconnue"
        ? `Accept ${req.headers.get("accept")}`
        : requete.raisons.join(", ");
      etat.limites.add(
        `Lecture non superposée de ${table} (${raison}) : les lignes fabriquées par le test n'y figurent pas` +
          ` (les lignes supprimées en sont retirées quand leur clé est lue).`,
      );
      const rep = await envoyerLecture(ctx, url, req.headers, methode, req.signal);
      return await ajusterReponseReelle(etat, table, rep, methode, forme);
    }
    const res = await lireSuperpose(etat.calque, url, requete, lecteurPour(ctx, req));
    if ("reponse" in res) return res.reponse;
    return reponsePostgrest(res.lignes, forme === "objet");
  };

  const simulerEcriture = async (
    ctx: ContexteABlanc,
    req: Request,
    url: URL,
    methode: string,
    requete: RequetePostgrest,
  ): Promise<Response | Blocage> => {
    const etat = ctx.etat;
    const table = requete.table;
    const calque = etat.calque;
    const prefer = preferences(req.headers.get("prefer"));
    const representation = prefer.has("return=representation");
    const forme = formeAccept(req.headers.get("accept"));
    if (forme === "inconnue") {
      etat.limites.add(`Écriture ${table} : Accept « ${req.headers.get("accept")} » inconnu, réponse en tableau JSON.`);
    }
    const objet = forme === "objet";
    const select = requete.selectSimple ? requete.select : "*";
    if (!requete.selectSimple) {
      etat.limites.add(`Écriture ${table} : select « ${url.searchParams.get("select")} » rendu en colonnes brutes.`);
    }
    const repondre = (lignes: Ligne[], statut: number): Response => {
      if (!representation) return new Response(null, { status: statut === 200 ? 204 : statut });
      return reponsePostgrest(lignes.map((l) => projeter(l, select)), objet, statut);
    };
    const pk = (l: Ligne): Ligne => Object.fromEntries(clePrimaire(table).map((c) => [c, l[c] ?? null]));

    let corps: unknown = null;
    if (methode !== "DELETE") {
      const texte = await req.text();
      try {
        corps = texte.trim() === "" ? null : JSON.parse(texte);
      } catch {
        return { hote: url.host, methode, chemin: url.pathname, motif: "requete_illisible", supabase: true };
      }
    }
    const lecteur = lecteurPour(ctx, req);

    if (methode === "POST") {
      const lignesCorps = Array.isArray(corps)
        ? corps
        : corps !== null && typeof corps === "object"
        ? [corps]
        : null;
      if (!lignesCorps || lignesCorps.some((l) => l === null || typeof l !== "object" || Array.isArray(l))) {
        return { hote: url.host, methode, chemin: url.pathname, motif: "requete_illisible", supabase: true };
      }
      const colonnes = (url.searchParams.get("columns") ?? "")
        .split(",")
        .map((c) => c.trim().replace(/^"|"$/g, ""))
        .filter(Boolean);
      const optsInsert = {
        colonnes: colonnes.length > 0 ? colonnes : null,
        manquantsParDefaut: prefer.has("missing=default"),
      };
      const upsert = [...prefer].some((p) => p.startsWith("resolution=")) || url.searchParams.has("on_conflict");
      if (!upsert) {
        const lignes = calque.inserer(table, lignesCorps as Ligne[], optsInsert);
        noterEcriture(etat, {
          table,
          operation: "insert",
          lignes: lignes.length,
          cible: "",
          valeurs: lignes,
          cles: lignes.map(pk),
        });
        return repondre(lignes, 201);
      }
      const ignorer = prefer.has("resolution=ignore-duplicates");
      const conflit = (url.searchParams.get("on_conflict") ?? "")
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean);
      const colonnesConflit = conflit.length > 0 ? conflit : [...clePrimaire(table)];
      const rendues: Ligne[] = [];
      for (const brut of lignesCorps as Ligne[]) {
        const existante = await ligneEnConflit(calque, url, table, colonnesConflit, brut, lecteur);
        if ("reponse" in existante) return existante.reponse;
        if (existante.ligne) {
          if (ignorer) continue;
          rendues.push(calque.patcher(table, existante.ligne, brut));
        } else {
          rendues.push(...calque.inserer(table, [brut], optsInsert));
        }
      }
      noterEcriture(etat, {
        table,
        operation: "upsert",
        lignes: rendues.length,
        cible: `on_conflict=${colonnesConflit.join(",")}${ignorer ? " (ignore)" : ""}`,
        valeurs: rendues,
        cles: rendues.map(pk),
      });
      return repondre(rendues, 201);
    }

    if (methode === "PATCH" || methode === "DELETE") {
      if (methode === "PATCH" && (corps === null || typeof corps !== "object" || Array.isArray(corps))) {
        return { hote: url.host, methode, chemin: url.pathname, motif: "requete_illisible", supabase: true };
      }
      const operation: OperationEcriture = methode === "PATCH" ? "update" : "delete";
      const cibles = await lignesCiblees(calque, url, requete, lecteur);
      if (cibles !== null && "reponse" in cibles) return cibles.reponse;
      if (cibles === null) {
        etat.limites.add(`${operation.toUpperCase()} ${table} sans filtre : nombre de lignes non résolu.`);
        noterEcriture(etat, {
          table,
          operation,
          lignes: null,
          cible: "(aucun filtre)",
          valeurs: operation === "update" ? [corps as Ligne] : [],
          cles: [],
        });
        return repondre([], 200);
      }
      if (!cibles.superposee) {
        etat.limites.add(`${operation.toUpperCase()} ${table} : filtres non évaluables (${requete.raisons.join(", ")}), lignes visées lues sans le calque.`);
      }
      const apres: Ligne[] = [];
      for (const l of cibles.lignes) {
        if (operation === "update") apres.push(calque.patcher(table, l, corps as Ligne));
        else {
          calque.supprimer(table, l);
          apres.push(l);
        }
      }
      noterEcriture(etat, {
        table,
        operation,
        lignes: apres.length,
        cible: decrireFiltres(url),
        valeurs: operation === "update" ? [corps as Ligne] : [],
        cles: apres.map(pk),
      });
      return repondre(apres, 200);
    }

    return { hote: url.host, methode, chemin: url.pathname, motif: "methode_refusee", supabase: true };
  };

  const motifSupabase = (chemin: string): MotifBlocage => {
    if (chemin.startsWith("/rest/v1/rpc/") || chemin === "/rest/v1/rpc") return "supabase_rpc";
    if (chemin.startsWith("/storage/")) return "supabase_storage";
    if (chemin.startsWith("/functions/")) return "supabase_functions";
    if (chemin.startsWith("/auth/")) return "supabase_auth";
    return "supabase_autre";
  };

  const decider = async (ctx: ContexteABlanc | undefined, req: Request): Promise<Issue> => {
    const methode = req.method.toUpperCase();
    const url = new URL(req.url);
    const base = { hote: url.host, methode, chemin: url.pathname };
    const supabase = url.origin === origineSupabase;
    if (!ctx) return { bloque: { ...base, motif: "hors_contexte", supabase } };
    if (ctx.etat.ferme) return { bloque: { ...base, motif: "contexte_ferme", supabase } };

    if (supabase) {
      const m = CHEMIN_TABLE.exec(url.pathname);
      if (!m || m[1] === "rpc") return { bloque: { ...base, motif: motifSupabase(url.pathname), supabase } };
      if (ENTETES_SURCHARGE.some((h) => req.headers.has(h))) {
        return { bloque: { ...base, motif: "methode_refusee", supabase } };
      }
      const requete = analyserUrlPostgrest(url);
      if (methode === "GET" || methode === "HEAD") return { reponse: await lire(ctx, req, url, methode, requete) };
      if (ctx.etat.nature !== "run") return { bloque: { ...base, motif: "hors_run", supabase } };
      if (methode === "POST" || methode === "PATCH" || methode === "DELETE") {
        const r = await simulerEcriture(ctx, req, url, methode, requete);
        return r instanceof Response ? { reponse: r } : { bloque: r };
      }
      return { bloque: { ...base, motif: "methode_refusee", supabase } };
    }

    if (url.hostname === HOTE_GEMINI) {
      const forme = url.protocol === "https:" && url.port === "" && methode === "POST" &&
        CHEMIN_GEMINI.test(url.pathname);
      if (!ctx.etat.ia || !forme) return { bloque: { ...base, motif: "ia_non_autorisee", supabase } };
      if (ctx.etat.compteurIA.autorises >= ctx.etat.plafondIA) {
        ctx.etat.limites.add(
          `Plafond de ${ctx.etat.plafondIA} appels IA atteint : les appels suivants ont été bloqués` +
            ` (decks concernés rendus comme un échec de modèle).`,
        );
        return { bloque: { ...base, motif: "ia_plafond", supabase } };
      }
      return { reponse: await envoyerIA(ctx, req, url) };
    }

    return { bloque: { ...base, motif: "externe", supabase } };
  };

  return async function fetchABlanc(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const ctx = stockage.getStore();
    let issue: Issue;
    let req: Request | null = null;
    try {
      req = new Request(input, init);
    } catch {
      req = null;
    }
    if (req === null) {
      issue = {
        bloque: { hote: "?", methode: "?", chemin: "?", motif: "requete_illisible", supabase: false },
      };
    } else {
      try {
        issue = await decider(ctx, req);
      } catch (e) {
        // Seule une vraie erreur réseau d'une requête AUTORISÉE remonte telle
        // quelle ; toute autre exception est un blocage, jamais un envoi.
        if (e instanceof ErreurTransport) throw e.cause;
        ctx?.etat.limites.add(
          `Erreur interne de l'intercepteur (requête bloquée) : ${e instanceof Error ? e.message : String(e)}`,
        );
        let hote = "?";
        let supabase = false;
        try {
          const u = new URL(req.url);
          hote = u.host;
          supabase = u.origin === origineSupabase;
        } catch {
          // URL illisible : bloquée comme externe.
        }
        issue = { bloque: { hote, methode: req.method, chemin: "?", motif: "erreur_interne", supabase } };
      }
    }
    if ("bloque" in issue) return rendreBlocage(ctx, issue.bloque);
    return issue.reponse;
  };
}

/** Réponse d'un blocage : 403 PostgREST pour Supabase, coupure réseau ailleurs. */
function rendreBlocage(ctx: ContexteABlanc | undefined, b: Blocage): Response {
  noterBlocage(ctx, b);
  if (b.supabase) {
    return new Response(
      JSON.stringify({
        code: "ABLANC",
        message: `Test à blanc : requête refusée (${b.motif})`,
        details: null,
        hint: null,
      }),
      { status: 403, headers: { "content-type": "application/json; charset=utf-8" } },
    );
  }
  throw new TypeError(`Test à blanc : appel externe refusé (${b.hote})`);
}

/**
 * Lecture réelle NON superposée d'une table écrite : on en retire au moins
 * les lignes supprimées par le test, et on y reporte ses patchs sur les
 * colonnes présentes, quand la clé primaire figure dans la réponse.
 */
async function ajusterReponseReelle(
  etat: EtatABlanc,
  table: string,
  rep: Response,
  methode: string,
  forme: "tableau" | "objet" | "inconnue",
): Promise<Response> {
  if (methode !== "GET" || !rep.ok || forme === "inconnue") return rep;
  const texte = await rep.text();
  const refaite = (corps: string, statut = rep.status) =>
    new Response(corps, { status: statut, headers: rep.headers });
  let data: unknown;
  try {
    data = JSON.parse(texte);
  } catch {
    return refaite(texte);
  }
  const ajuster = (l: Ligne): Ligne | null => {
    if (etat.calque.estSupprimee(table, l)) return null;
    return etat.calque.reporterPatch(table, l);
  };
  if (Array.isArray(data)) {
    const lignes = (data as Ligne[]).map(ajuster).filter((l): l is Ligne => l !== null);
    return refaite(JSON.stringify(lignes));
  }
  if (data && typeof data === "object") {
    const l = ajuster(data as Ligne);
    if (l === null) return reponsePostgrest([], true);
    return refaite(JSON.stringify(l));
  }
  return refaite(texte);
}

// ---------------------------------------------------------------------------
// Installation
// ---------------------------------------------------------------------------

let installation: { fetch: typeof fetch; original: typeof fetch } | null = null;

/**
 * Pose l'intercepteur sur `globalThis.fetch`. À n'appeler QUE dans l'isolate
 * dédié (installer.ts) ou dans un test. `verrouiller` rend la propriété non
 * réinscriptible : aucun module ne peut ensuite remettre le vrai `fetch`.
 */
export function installerIntercepteur(args: {
  supabaseUrl: string;
  fetchOrigine?: typeof fetch;
  verrouiller?: boolean;
}): { fetch: typeof fetch; verrouille: boolean; desinstaller: () => void } {
  if (installation) throw new Error("Intercepteur du test à blanc déjà installé");
  const original = globalThis.fetch;
  const intercepteur = creerFetchABlanc({
    supabaseUrl: args.supabaseUrl,
    fetchOrigine: args.fetchOrigine ?? original.bind(globalThis),
  });
  let verrouille = false;
  if (args.verrouiller) {
    try {
      Object.defineProperty(globalThis, "fetch", {
        value: intercepteur,
        writable: false,
        configurable: false,
        enumerable: true,
      });
      verrouille = true;
    } catch {
      // Propriété non redéfinissable dans ce runtime : pose simple. La sonde de
      // chaque test revérifie de toute façon que `fetch` est l'intercepteur.
    }
  }
  if (!verrouille) globalThis.fetch = intercepteur;
  if (globalThis.fetch !== intercepteur) throw new Error("globalThis.fetch n'a pas pu être remplacé");
  const pose = { fetch: intercepteur, original };
  installation = pose;
  return {
    fetch: intercepteur,
    verrouille,
    desinstaller: () => {
      if (installation !== pose) return;
      if (!verrouille) globalThis.fetch = original;
      installation = null;
    },
  };
}

/** L'intercepteur est-il posé ET toujours celui que voit le code ? */
export function intercepteurActif(): boolean {
  return installation !== null && globalThis.fetch === installation.fetch;
}
