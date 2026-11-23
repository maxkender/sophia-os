/**
 * qg — la lecture du QG (22/11, Max). Lecture seule : aucune écriture, nulle part.
 *
 *   GET /api/qg/apps?from=AAAA-MM-JJ&to=AAAA-MM-JJ        (Vercel réécrit /api/qg/* vers cette fonction)
 *   GET /functions/v1/qg/apps?from=…&to=…                  (appel direct)
 *   En-tête obligatoire : x-qg-token = le secret QG_TOKEN (variable d'environnement des fonctions Edge).
 *
 *   GET /api/qg/control/recrutement?cohorte=AAAA-MM-JJ  (un lundi) → qg_recrutement(cohorte)
 *   GET /api/qg/control/paie?semaine=AAAA-MM-JJ         (un lundi) → qg_paie(semaine)
 *   GET /api/qg/control/autres                                    → qg_autres()
 *   GET /api/qg/control/join[?test=1]                             → qg_join(test) (app Join, test exclus par défaut)
 *
 * apps → qg_apps(from, to) : par application (passages.application_id) et par jour, posts publiés, vues (total,
 * médiane), % de posts à 10 k+, comptes et posteurs qui ont posté, coût des posteurs ; le même découpage par label
 * et par pays. Les routes control/* : l'entonnoir d'une cohorte, la paie d'une semaine (attendu, payé, écart,
 * plaintes) et les autres contrôles. Format : docs/qg-api.md.
 */
import { json, serviceClient } from "../_shared/supabase.ts";
import { estRouteQg, jetonDeRequete, jetonValide, lirePeriodeQg, lundiDe, lundiSouple, raisonRefus, routeQg } from "../_shared/qg.ts";
import { lireTestQg } from "../_shared/qg.ts";

const ENTETES = { "cache-control": "no-store" };

Deno.serve(async (request) => {
  // Le jeton d'abord : sans lui, toujours 401 (le contrôle de démarrage du déploiement l'attend, quelle que soit la méthode).
  const fourni = jetonDeRequete(request.headers);
  if (!jetonValide(fourni, Deno.env.get("QG_TOKEN"))) {
    return json({ ok: false, error: "unauthorized", raison: raisonRefus(fourni, Deno.env.get("QG_TOKEN")) }, 401);
  }
  if (request.method !== "GET") return json({ ok: false, error: "GET attendu" }, 405);
  const url = new URL(request.url);
  const route = routeQg(url.pathname);
  if (!estRouteQg(route)) {
    return json({ ok: false, error: "route inconnue (apps, control/recruitment|recrutement, control/payroll|paie, control/issues|autres)" }, 404);
  }
  let rpc: { fn: string; args: Record<string, string> };
  if (route === "apps") {
    const periode = lirePeriodeQg(url.searchParams);
    if (!periode.ok) return json({ ok: false, error: periode.erreur }, 400);
    rpc = { fn: "qg_apps", args: { p_from: periode.from, p_to: periode.to } };
  } else if (route === "control/recrutement") {
    // Sans cohorte : celle qui a démarré ce lundi.
    const l = lundiSouple(url.searchParams, ["cohorte", "cohort", "lundi", "monday", "date"], lundiDe(new Date().toISOString().slice(0, 10)));
    if (!l.ok) return json({ ok: false, error: l.erreur }, 400);
    rpc = { fn: "qg_recrutement", args: { p_cohorte: l.lundi } };
  } else if (route === "control/paie") {
    // Sans semaine : la dernière semaine terminée (lundi précédent).
    const precedente = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
    const l = lundiSouple(url.searchParams, ["semaine", "week", "lundi", "monday", "date"], lundiDe(precedente));
    if (!l.ok) return json({ ok: false, error: l.erreur }, 400);
    rpc = { fn: "qg_paie", args: { p_semaine: l.lundi } };
  } else if (route === "control/join") {
    rpc = { fn: "qg_join", args: { p_test: String(lireTestQg(url.searchParams)) } };
  } else {
    rpc = { fn: "qg_autres", args: {} };
  }

  const { data, error } = await serviceClient().rpc(rpc.fn, rpc.args);
  if (error) {
    console.error(rpc.fn, error.message);
    return json({ ok: false, error: "lecture impossible" }, 500);
  }
  // 23/11 (Max) : Control > Paie montre aussi le récap du plan de paie (libérés, fermés, killés, à décider) et les
  // contrats Upwork ouverts sans posteur actif. Lecture seule ; une erreur ici n'empêche pas la paie de s'afficher.
  let extra: Record<string, unknown> = {};
  if (route === "control/paie") {
    const plan = await serviceClient().rpc("qg_plan_paie", { p_plan: "W47" });
    extra = plan.error ? { plan_paie_erreur: "lecture impossible" } : { plan_paie: plan.data };
  }
  return new Response(JSON.stringify({ ok: true, ...(data as Record<string, unknown>), ...extra }), {
    status: 200,
    headers: { "content-type": "application/json", ...ENTETES },
  });
});
