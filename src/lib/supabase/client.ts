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

export const supabase = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseAnonKey || "placeholder-anon-key",
  {
    global: {
      // PostgREST n'envoie pas de `Cache-Control` sur ses réponses, et certains
      // codes d'erreur sont cacheables d'office (un 300 « Multiple Choices »
      // l'est par défaut, RFC 7231 §6.4.1). Résultat observé en prod : après
      // correction d'un embed ambigu côté base, des navigateurs continuaient
      // de resservir l'ancienne erreur depuis leur cache disque — sans jamais
      // rappeler l'API — alors que la même requête en navigation privée
      // passait. On refuse donc toute réutilisation de réponse en cache.
      // Le surcoût est nul : ces requêtes déclenchent déjà un préflight CORS
      // (apikey + Authorization), aucune n'était « simple ».
      headers: { "Cache-Control": "no-store" },
    },
  },
);
