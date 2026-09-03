import {
  assertAuthorised,
  json,
  messageErreur,
  serviceClient,
} from "../_shared/supabase.ts";
import {
  CACHE_ID,
  cacheFrais,
  cleRevenueCat,
  fetchChartsSophia,
  projectIdRevenueCat,
} from "../_shared/revenuecat.ts";

/**
 * Snapshot Charts RevenueCat pour /admin/suivi-rc.
 *
 * - Admin JWT : renvoie le cache s'il a moins de 4 h, sinon refetch.
 * - pg_cron (`{"cron":true}`) : refetch systématique.
 * - Sans `REVENUECAT_SECRET_API_KEY` : pas d'appel RC, on renvoie
 *   `secret_manquant` (+ le dernier snapshot s'il existe).
 */
Deno.serve(async (request) => {
  const denied = await assertAuthorised(request);
  if (denied) return denied;

  let cron = false;
  try {
    const body = (await request.json()) as { cron?: boolean };
    cron = Boolean(body?.cron);
  } catch {
    // corps vide
  }

  const supabase = serviceClient();
  const projectId = projectIdRevenueCat();

  const { data: ligne, error: lecture } = await supabase
    .from("rc_metrics_cache")
    .select("project_id, fetched_at, payload, erreur")
    .eq("id", CACHE_ID)
    .maybeSingle();
  if (lecture) return json({ error: lecture.message }, 500);

  const snapshotExistant =
    ligne?.payload && typeof ligne.payload === "object"
      ? (ligne.payload as {
          fetched_at?: string;
          project_id?: string;
          charts?: unknown;
          erreur?: string | null;
        })
      : null;

  const cle = cleRevenueCat();
  if (!cle) {
    if (cron) {
      await supabase
        .from("rc_metrics_cache")
        .upsert({
          id: CACHE_ID,
          project_id: projectId,
          erreur: "REVENUECAT_SECRET_API_KEY manquant",
          updated_at: new Date().toISOString(),
        });
    }
    return json({
      ok: true,
      secret_manquant: true,
      depuis_cache: Boolean(snapshotExistant?.charts),
      snapshot: snapshotExistant?.charts
        ? {
            fetched_at: snapshotExistant.fetched_at ?? ligne?.fetched_at,
            project_id: snapshotExistant.project_id ?? ligne?.project_id ?? projectId,
            charts: snapshotExistant.charts,
            erreur: snapshotExistant.erreur ?? ligne?.erreur,
          }
        : null,
    });
  }

  const fetchedAt = snapshotExistant?.fetched_at ?? ligne?.fetched_at ?? null;
  if (!cron && snapshotExistant?.charts && cacheFrais(fetchedAt)) {
    return json({
      ok: true,
      secret_manquant: false,
      depuis_cache: true,
      snapshot: {
        fetched_at: fetchedAt,
        project_id: snapshotExistant.project_id ?? ligne?.project_id ?? projectId,
        charts: snapshotExistant.charts,
        erreur: snapshotExistant.erreur ?? null,
      },
    });
  }

  try {
    const charts = await fetchChartsSophia(cle, projectId);
    const fetched_at = new Date().toISOString();
    const payload = { fetched_at, project_id: projectId, charts, erreur: null };
    const { error: ecriture } = await supabase.from("rc_metrics_cache").upsert({
      id: CACHE_ID,
      project_id: projectId,
      fetched_at,
      payload,
      erreur: null,
      updated_at: fetched_at,
    });
    if (ecriture) throw new Error(ecriture.message);
    return json({
      ok: true,
      secret_manquant: false,
      depuis_cache: false,
      snapshot: payload,
    });
  } catch (error) {
    const message = messageErreur(error);
    await supabase.from("rc_metrics_cache").upsert({
      id: CACHE_ID,
      project_id: projectId,
      erreur: message,
      updated_at: new Date().toISOString(),
    });
    if (snapshotExistant?.charts) {
      return json({
        ok: true,
        secret_manquant: false,
        depuis_cache: true,
        snapshot: {
          fetched_at: snapshotExistant.fetched_at ?? ligne?.fetched_at,
          project_id: snapshotExistant.project_id ?? projectId,
          charts: snapshotExistant.charts,
          erreur: message,
        },
        erreur: message,
      });
    }
    return json({ error: message, secret_manquant: false }, 502);
  }
});
