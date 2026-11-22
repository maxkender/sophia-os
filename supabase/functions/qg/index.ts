/**
 * qg — la lecture du QG (22/11, Max). Lecture seule : aucune écriture, nulle part.
 *
 *   GET /api/qg/apps?from=AAAA-MM-JJ&to=AAAA-MM-JJ        (Vercel réécrit /api/qg/* vers cette fonction)
 *   GET /functions/v1/qg/apps?from=…&to=…                  (appel direct)
 *   En-tête obligatoire : x-qg-token = le secret QG_TOKEN (variable d'environnement des fonctions Edge).
 *
 * Renvoie qg_apps(from, to) : par application (passages.application_id) et par jour, posts publiés, vues
 * (total, médiane), % de posts à 10 k+, comptes et posteurs qui ont posté, coût des posteurs ; le même découpage
 * par label et par pays. Format : docs/qg-api.md.
 */
import { json, serviceClient } from "../_shared/supabase.ts";
import { jetonValide, lirePeriodeQg, routeQg } from "../_shared/qg.ts";

const ENTETES = { "cache-control": "no-store" };

Deno.serve(async (request) => {
  if (request.method !== "GET") return json({ ok: false, error: "GET attendu" }, 405);
  if (!jetonValide(request.headers.get("x-qg-token"), Deno.env.get("QG_TOKEN"))) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }
  const url = new URL(request.url);
  if (routeQg(url.pathname) !== "apps") return json({ ok: false, error: "route inconnue (GET /api/qg/apps)" }, 404);
  const periode = lirePeriodeQg(url.searchParams);
  if (!periode.ok) return json({ ok: false, error: periode.erreur }, 400);

  const { data, error } = await serviceClient().rpc("qg_apps", { p_from: periode.from, p_to: periode.to });
  if (error) {
    console.error("qg_apps", error.message);
    return json({ ok: false, error: "lecture impossible" }, 500);
  }
  return new Response(JSON.stringify({ ok: true, ...(data as Record<string, unknown>) }), {
    status: 200,
    headers: { "content-type": "application/json", ...ENTETES },
  });
});
