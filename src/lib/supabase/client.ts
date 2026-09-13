import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured) {
  // Deliberately not thrown: throwing here would blow up at module-evaluation
  // time and blank the whole app before React even mounts. A placeholder
  // client lets the UI render; real Supabase calls just fail until .env is set.
  console.error(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY — copy .env.example to .env and fill in your project's values.",
  );
}

/**
 * Le `no-store` ne vise QUE PostgREST.
 *
 * PostgREST n'envoie pas de `Cache-Control` sur ses réponses, et certains codes
 * d'erreur sont cacheables d'office (un 300 « Multiple Choices » l'est par
 * défaut, RFC 7231 §6.4.1). Observé en prod : après correction d'un embed
 * ambigu côté base, des navigateurs resservaient l'ancienne erreur depuis leur
 * cache disque sans jamais rappeler l'API, alors que la même requête en
 * navigation privée passait.
 *
 * Mais poser l'en-tête globalement le colle aussi aux appels
 * `functions.invoke`, et là il casse tout : le préflight des Edge Functions
 * n'autorise que `authorization, x-client-info, apikey, content-type, accept,
 * x-cron-secret` (voir `supabase/functions/_shared/supabase.ts`). Le navigateur
 * bloque alors la requête avant l'envoi — « Failed to send a request to the
 * Edge Function ». Le storage, lui, reflète les en-têtes demandés et n'était
 * pas touché.
 *
 * D'où le filtre sur l'URL plutôt qu'un en-tête global.
 */
export function viseRest(url: string): boolean {
  return url.includes("/rest/v1/");
}

function urlDe(entree: RequestInfo | URL): string {
  if (typeof entree === "string") return entree;
  if (entree instanceof URL) return entree.href;
  return entree.url;
}

/** `fetch` du client : `no-store` sur PostgREST, rien de plus ailleurs. */
export function fetchSupabase(
  entree: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  if (!viseRest(urlDe(entree))) return fetch(entree, init);
  const entetes = new Headers(
    init?.headers ?? (entree instanceof Request ? entree.headers : undefined),
  );
  entetes.set("Cache-Control", "no-store");
  return fetch(entree, { ...init, headers: entetes });
}

export const supabase = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseAnonKey || "placeholder-anon-key",
  { global: { fetch: fetchSupabase } },
);
