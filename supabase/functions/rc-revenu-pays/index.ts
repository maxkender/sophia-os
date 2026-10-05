/**
 * Lecture ponctuelle d'un graphique RevenueCat, segmenté par pays.
 *
 * Pourquoi : `suivi-rc` ne récupère que trois graphiques (essais, conversion
 * d'essai, conversion initiale) sur 13 à 27 jours, et AUCUN graphique d'argent.
 * Impossible donc de calculer un revenu par mille vues depuis la base.
 *
 * Volontairement AUTONOME, sans import de `_shared` : c'est un outil de
 * diagnostic ponctuel, et le bundler exige sinon tout l'arbre d'imports.
 *
 * `chart` part dans le CHEMIN de l'URL RevenueCat, donc une valeur libre
 * permettrait d'atteindre n'importe quel point d'API avec la clé secrète.
 * La liste blanche n'est pas décorative.
 */

const CHARTS_AUTORISES = new Set([
  "revenue",
  "mrr",
  "active_subscriptions",
  "new_customers",
  "conversion_to_paying",
  "initial_conversion",
  "trials_new",
  "trial_conversion_rate",
]);

function json(corps: unknown, status = 200): Response {
  return new Response(JSON.stringify(corps), {
    status,
    headers: { "content-type": "application/json" },
  });
}

Deno.serve(async (request) => {
  const attendu = Deno.env.get("CRON_SECRET");
  const test = Deno.env.get("TEST_SECRET");
  const fourni = request.headers.get("x-cron-secret");
  if (!attendu) return json({ error: "CRON_SECRET non configuré" }, 500);
  if (fourni !== attendu && !(test && fourni === test)) {
    return json({ error: "unauthorized" }, 401);
  }

  try {
    const corps = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const chart = String(corps.chart ?? "revenue");
    if (!CHARTS_AUTORISES.has(chart)) {
      return json({ error: `chart non autorisé : ${chart}` }, 400);
    }

    const cle =
      Deno.env.get("REVENUECAT_SECRET_API_KEY")?.trim() ||
      Deno.env.get("REVENUECAT_API_KEY")?.trim() ||
      Deno.env.get("REVENUE_CAT_SECRET_API_KEY")?.trim() ||
      Deno.env.get("RC_SECRET_API_KEY")?.trim();
    if (!cle) return json({ error: "REVENUECAT_SECRET_API_KEY manquant" }, 500);

    const projectId =
      Deno.env.get("REVENUECAT_PROJECT_ID")?.trim() ||
      Deno.env.get("REVENUE_CAT_PROJECT_ID")?.trim() ||
      "proj3f496a80";

    const url = new URL(`https://api.revenuecat.com/v2/projects/${projectId}/charts/${chart}`);
    url.searchParams.set("start_date", String(corps.start ?? "2026-08-01"));
    url.searchParams.set("end_date", String(corps.end ?? new Date().toISOString().slice(0, 10)));
    url.searchParams.set("resolution", String(corps.resolution ?? "3"));
    url.searchParams.set("segment", String(corps.segment ?? "country"));
    url.searchParams.set("limit_num_segments", String(corps.limit ?? 25));
    url.searchParams.set("realtime", "true");
    url.searchParams.set("currency", String(corps.currency ?? "EUR"));
    if (corps.selectors) url.searchParams.set("selectors", JSON.stringify(corps.selectors));

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${cle}`, Accept: "application/json" },
    });
    const texte = await res.text();
    if (!res.ok) {
      return json({ error: `RevenueCat ${chart} ${res.status}`, detail: texte.slice(0, 500) }, 502);
    }
    return json({ ok: true, chart, data: JSON.parse(texte) });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
