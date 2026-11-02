/**
 * Le @ TikTok lu dans les liens postés (tiktok.com/@xxx/video/…, et les liens
 * courts vm.tiktok.com / vt.tiktok.com / tiktok.com/t/… résolus) : s'il ne
 * diffère du @ du compte que par les chiffres de la fin, l'OS corrige le @ ;
 * sinon, c'est peut-être un compte perso (« Posting from another account? »).
 */
type Fetch = typeof fetch;

const RE_HANDLE = /tiktok\.com\/@([A-Za-z0-9._]{2,24})/i;
const RE_COURT = /^https?:\/\/(vm|vt)\.tiktok\.com\/|tiktok\.com\/t\//i;

export function handleDuLien(url: string | null | undefined): string | null {
  const m = String(url ?? "").match(RE_HANDLE);
  return m ? m[1]!.toLowerCase() : null;
}

export function estLienCourt(url: string | null | undefined): boolean {
  return RE_COURT.test(String(url ?? ""));
}

/** Les chiffres de la fin retirés : clara.fortschritt528 → clara.fortschritt. */
export function baseHandle(h: string | null | undefined): string {
  return String(h ?? "").toLowerCase().replace(/^@+/, "").trim().replace(/[0-9]+$/, "");
}

/** Même @ aux chiffres de la fin près (au moins 4 caractères de base). */
export function handlesProches(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = baseHandle(a);
  return x.length >= 4 && x === baseHandle(b);
}

/** Le @ le plus fréquent des liens (au moins 2 liens, ou un seul lien s'il est seul). */
export function handleMajoritaire(handles: (string | null)[]): { handle: string; liens: number } | null {
  const n = new Map<string, number>();
  for (const h of handles) if (h) n.set(h, (n.get(h) ?? 0) + 1);
  const tri = [...n.entries()].sort((a, b) => b[1] - a[1]);
  if (tri.length === 0) return null;
  const [handle, liens] = tri[0]!;
  return { handle, liens };
}

/** Un lien court suivi jusqu'au lien complet (sans télécharger la vidéo). */
export async function resoudreLienCourt(url: string, fetchFn: Fetch = fetch): Promise<string | null> {
  const entetes = { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15" };
  try {
    const r = await fetchFn(url, { redirect: "manual", headers: entetes });
    const lieu = r.headers.get("location");
    if (lieu && handleDuLien(lieu)) return handleDuLien(lieu);
    const suivi = await fetchFn(lieu ?? url, { redirect: "follow", headers: entetes });
    return handleDuLien(suivi.url) ?? handleDuLien(await suivi.text().then((t) => t.slice(0, 200_000)).catch(() => ""));
  } catch {
    return null;
  }
}
