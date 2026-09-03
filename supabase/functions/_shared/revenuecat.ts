/**
 * Client Charts API v2 (RevenueCat).
 *
 * Secret : `REVENUECAT_SECRET_API_KEY` (clé secrète v2, permission
 * `charts_metrics:charts:read`). Optionnel : `REVENUECAT_PROJECT_ID`
 * (défaut = projet Sophia).
 */

export const RC_PROJECT_SOPHIA = "proj3f496a80";
export const CACHE_ID = "sophia";
export const TTL_MS = 4 * 60 * 60 * 1000;

const RC_API = "https://api.revenuecat.com/v2";

export function cleRevenueCat(): string | null {
  const cle = Deno.env.get("REVENUECAT_SECRET_API_KEY")?.trim();
  return cle || null;
}

export function projectIdRevenueCat(): string {
  return Deno.env.get("REVENUECAT_PROJECT_ID")?.trim() || RC_PROJECT_SOPHIA;
}

export function isoUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function ilYaJoursUtc(n: number, depuis = new Date()): string {
  const d = new Date(depuis);
  d.setUTCDate(d.getUTCDate() - n);
  return isoUtc(d);
}

export function cacheFrais(fetchedAt: string | null | undefined, maintenant = Date.now()): boolean {
  if (!fetchedAt) return false;
  const t = new Date(fetchedAt).getTime();
  if (Number.isNaN(t)) return false;
  return maintenant - t < TTL_MS;
}

export async function fetchChart(opts: {
  key: string;
  projectId: string;
  chart: string;
  start: string;
  end: string;
  resolution: string;
  segment: string;
  limit: number;
  selectors?: Record<string, string>;
}): Promise<unknown> {
  const url = new URL(`${RC_API}/projects/${opts.projectId}/charts/${opts.chart}`);
  url.searchParams.set("start_date", opts.start);
  url.searchParams.set("end_date", opts.end);
  url.searchParams.set("resolution", opts.resolution);
  url.searchParams.set("segment", opts.segment);
  url.searchParams.set("limit_num_segments", String(opts.limit));
  url.searchParams.set("realtime", "true");
  url.searchParams.set("currency", "EUR");
  if (opts.selectors) url.searchParams.set("selectors", JSON.stringify(opts.selectors));

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${opts.key}`,
      Accept: "application/json",
    },
  });
  const texte = await res.text();
  if (!res.ok) {
    throw new Error(`RevenueCat ${opts.chart} ${res.status}: ${texte.slice(0, 280)}`);
  }
  try {
    return JSON.parse(texte) as unknown;
  } catch {
    throw new Error(`RevenueCat ${opts.chart}: réponse non-JSON`);
  }
}

export async function fetchChartsSophia(key: string, projectId: string) {
  const end = isoUtc(new Date());
  const startJours = ilYaJoursUtc(13);
  const startSemaines = ilYaJoursUtc(27);

  const [trials_new, trial_conversion_rate, initial_conversion] = await Promise.all([
    fetchChart({
      key,
      projectId,
      chart: "trials_new",
      start: startJours,
      end,
      resolution: "0",
      segment: "country",
      limit: 20,
    }),
    fetchChart({
      key,
      projectId,
      chart: "trial_conversion_rate",
      start: startSemaines,
      end,
      resolution: "1",
      segment: "country",
      limit: 15,
    }),
    fetchChart({
      key,
      projectId,
      chart: "initial_conversion",
      start: startSemaines,
      end,
      resolution: "1",
      segment: "first_country",
      limit: 15,
      selectors: { conversion_timeframe: "7_days" },
    }),
  ]);

  return { trials_new, trial_conversion_rate, initial_conversion };
}
