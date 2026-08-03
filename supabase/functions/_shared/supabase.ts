import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * Client service_role : contourne la RLS. Réservé aux Edge Functions, qui sont
 * le seul endroit où le pipeline a le droit d'écrire dans les tables métier.
 */
export function serviceClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!url || !key) {
    throw new Error("SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant");
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Deux appelants légitimes, deux preuves différentes :
 *
 * - pg_cron n'a pas de session utilisateur, il présente un secret partagé
 *   (plus sûr que la clé anon, qui est publique par nature) ;
 * - un admin qui déclenche un run depuis l'interface présente son JWT, dont
 *   le rôle est vérifié côté base — le secret ne descend jamais au navigateur.
 */
export async function assertAuthorised(request: Request): Promise<Response | null> {
  // Requête préliminaire CORS du navigateur : on répond tout de suite, sans
  // authentifier. assertAuthorised étant le premier appel de chaque fonction,
  // ce seul point couvre le preflight de toutes.
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const expected = Deno.env.get("CRON_SECRET");
  if (!expected) {
    return json({ error: "CRON_SECRET non configuré" }, 500);
  }

  if (request.headers.get("x-cron-secret") === expected) return null;

  // Secret de TEST séparé (facultatif) : même pouvoir que CRON_SECRET, mais
  // distinct, pour déclencher les fonctions à la main pendant les tests sans
  // exposer/toucher le secret des crons. Les crons continuent d'utiliser
  // CRON_SECRET. Pour le désactiver : supprimer le secret TEST_SECRET côté
  // Supabase (aucun redéploiement nécessaire).
  const testSecret = Deno.env.get("TEST_SECRET");
  if (testSecret && request.headers.get("x-cron-secret") === testSecret) return null;

  const authorization = request.headers.get("Authorization") ?? "";
  const token = authorization.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "unauthorized" }, 401);

  const acces = await rolesDuJeton(token);
  if (!acces) return json({ error: "unauthorized" }, 401);
  if (!acces.roles.includes("admin")) return json({ error: "forbidden" }, 403);
  return null;
}

/** `sub` (id utilisateur) du JWT, décodé SANS vérifier la signature — juste pour
 *  savoir de qui on parle ; la VÉRIFICATION vient de la requête PostgREST ci-après. */
function jetonSub(token: string): string | null {
  try {
    const charge = token.split(".")[1];
    return (JSON.parse(atob(charge.replace(/-/g, "+").replace(/_/g, "/"))).sub as string) ?? null;
  } catch {
    return null;
  }
}

/**
 * Rôles du porteur du jeton, vérifiés via PostgREST — et NON via `getUser`/GoTrue,
 * qui rejette les jetons de l'ancien format depuis la migration des clés JWT
 * asymétriques (erreurs « bad_jwt ES256 » à la création de poster). PostgREST,
 * lui, valide la signature (c'est pourquoi les requêtes de données du front
 * marchent). La RLS `user_roles (user_id = auth.uid())` renvoie les rôles de
 * l'appelant ; on filtre sur le `sub` du jeton pour ne pas capter d'autres lignes
 * si l'appelant est admin. Renvoie null si le jeton est invalide (PostgREST refuse).
 */
async function rolesDuJeton(token: string): Promise<{ userId: string; roles: string[] } | null> {
  const sub = jetonSub(token);
  if (!sub) return null;
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anon) return null;
  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await userClient.from("user_roles").select("role").eq("user_id", sub);
  if (error) return null; // signature invalide → PostgREST refuse
  return { userId: sub, roles: (data ?? []).map((r) => r.role as string) };
}

/**
 * Comme assertAuthorised, mais accepte une LISTE de rôles et renvoie celui de
 * l'appelant (utile quand une même fonction sert admin ET hiring manager, avec
 * des actions réservées à l'un). Renvoie une Response en cas de refus, sinon
 * `{ userId, role }`.
 */
export async function assertRole(
  request: Request,
  roles: string[],
): Promise<Response | { userId: string; role: string }> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const expected = Deno.env.get("CRON_SECRET");
  if (expected && request.headers.get("x-cron-secret") === expected) {
    return { userId: "cron", role: "admin" };
  }
  const testSecret = Deno.env.get("TEST_SECRET");
  if (testSecret && request.headers.get("x-cron-secret") === testSecret) {
    return { userId: "cron", role: "admin" };
  }

  const authorization = request.headers.get("Authorization") ?? "";
  const token = authorization.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "unauthorized" }, 401);

  const acces = await rolesDuJeton(token);
  if (!acces) return json({ error: "unauthorized" }, 401);
  const trouve = acces.roles.find((r) => roles.includes(r));
  if (!trouve) return json({ error: "forbidden" }, 403);
  return { userId: acces.userId, role: trouve };
}

/**
 * Charge un prompt éditable depuis l'admin. Renvoie undefined si absent, pour
 * que l'appelant retombe sur le défaut codé plutôt que d'envoyer un prompt vide.
 */
export async function chargerPrompt(
  supabase: ReturnType<typeof serviceClient>,
  cle: string,
): Promise<string | undefined> {
  const { data } = await supabase
    .from("prompts")
    .select("contenu")
    .eq("cle", cle)
    .maybeSingle();

  return data?.contenu?.trim() || undefined;
}

/**
 * Message lisible pour n'importe quoi qui a été jeté.
 *
 * `String(erreur)` sur une erreur Supabase donne « [object Object] » : le
 * pipeline enregistrait ça en base, et on ne pouvait plus savoir ce qui avait
 * échoué. On va donc chercher les champs que Postgrest et Storage remplissent.
 */
export function messageErreur(erreur: unknown): string {
  if (erreur instanceof Error) return erreur.message;

  if (erreur && typeof erreur === "object") {
    const e = erreur as Record<string, unknown>;
    const parts = [e.message, e.details, e.hint, e.code].filter(Boolean);
    if (parts.length > 0) return parts.join(" · ");
    try {
      return JSON.stringify(erreur).slice(0, 400);
    } catch {
      // Objet non sérialisable (cycle) : on retombe sur String().
    }
  }

  return String(erreur);
}

// Sans ces en-têtes, un appel depuis le navigateur (origine Vercel, différente
// de supabase.co) est bloqué par CORS : la requête échoue en « Failed to fetch »
// avant même d'atteindre la fonction. En curl ça passait, d'où le piège.
export const corsHeaders: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers":
    "authorization, x-client-info, apikey, content-type, accept, x-cron-secret",
  "access-control-allow-methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders },
  });
}

/** Date du jour en YYYY-MM-DD (UTC — les crons raisonnent en UTC). */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Date du jour à PARIS (YYYY-MM-DD) — le « jour » métier de la plateforme.
 * À minuit Paris (22h UTC l'été), la date UTC est encore la VEILLE : utiliser
 * l'UTC faisait viser le mauvais jour au cron de minuit, et les posts du jour
 * n'étaient réellement créés qu'au rattrapage de 6h, avec 2h de fenêtre de
 * fabrication au lieu de 8 — d'où des posters sans post au réveil.
 */
export function aujourdhuiParis(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());
}
