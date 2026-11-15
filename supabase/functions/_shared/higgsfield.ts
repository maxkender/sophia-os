/**
 * Higgsfield, API directe (docs.higgsfield.ai) : Genjutsu, transfert de
 * mouvement. Une vidéo source (le mouvement) + des images de référence (le
 * visage) → une vidéo où le persona refait le mouvement.
 *
 * Secret : HIGGSFIELD_API_KEY = « KEY_ID:KEY_SECRET » (console.higgsfield.ai),
 * ou HIGGSFIELD_KEY_ID + HIGGSFIELD_KEY_SECRET. Facturation à l'usage sur le
 * solde API de la console ; un échec ou un refus NSFW n'est pas facturé.
 *
 * Asynchrone : la soumission rend un `request_id`, on lit ensuite
 * `/requests/{id}/status` jusqu'à `completed` (vidéo dans `video.url`, gardée
 * au moins 7 jours chez Higgsfield : on la rapatrie), `failed`, `nsfw` ou
 * `canceled`.
 */

const BASE = "https://api.higgsfield.ai";
export const MODELE_GENJUTSU_MOUVEMENT = "higgsfield/genjutsu/motion-transfer/v1.0";

export type ResolutionGenjutsu = "480p" | "720p" | "1080p";
export const RESOLUTIONS_GENJUTSU: readonly ResolutionGenjutsu[] = ["480p", "720p", "1080p"];

/** La clé au format de l'en-tête (`KEY_ID:KEY_SECRET`), ou null si absente. */
export function cleHiggsfield(env: (nom: string) => string | undefined = (n) => Deno.env.get(n)): string | null {
  const entiere = env("HIGGSFIELD_API_KEY")?.trim();
  if (entiere) return entiere;
  const id = env("HIGGSFIELD_KEY_ID")?.trim();
  const secret = env("HIGGSFIELD_KEY_SECRET")?.trim();
  return id && secret ? `${id}:${secret}` : null;
}

function entetes(cle: string): Record<string, string> {
  return { Authorization: `Key ${cle}`, "Content-Type": "application/json", Accept: "application/json" };
}

/** Une URL publique sans le `?v=` anti-cache que l'OS ajoute à ses fichiers. */
export function urlPropre(url: string): string {
  return String(url ?? "").trim().split("?")[0];
}

/**
 * Le corps exact de la requête (le schéma refuse tout champ en plus) : la
 * vidéo du mouvement, 1 à 8 images du persona, le prompt, la résolution.
 */
export function corpsGenjutsu(entree: {
  videoUrl: string;
  imageUrls: string[];
  prompt?: string | null;
  resolution?: ResolutionGenjutsu;
}): { video_url: string; image_urls: string[]; prompt: string; resolution: ResolutionGenjutsu } {
  const video_url = urlPropre(entree.videoUrl);
  if (!/^https:\/\//.test(video_url)) throw new Error("Genjutsu : vidéo source sans URL publique");
  const image_urls = entree.imageUrls.map(urlPropre).filter((u) => /^https:\/\//.test(u));
  if (image_urls.length < 1 || image_urls.length > 8) throw new Error("Genjutsu : il faut 1 à 8 images du persona");
  const resolution = entree.resolution ?? "720p";
  if (!RESOLUTIONS_GENJUTSU.includes(resolution)) throw new Error(`Genjutsu : résolution inconnue (${resolution})`);
  return { video_url, image_urls, prompt: String(entree.prompt ?? "").trim().slice(0, 10_000), resolution };
}

/** Message lisible d'une réponse d'erreur Higgsfield (`detail` en chaîne ou en liste). */
export function messageErreurHiggsfield(statut: number, corps: string): string {
  let detail = corps.trim().slice(0, 300);
  try {
    const j = JSON.parse(corps) as { detail?: unknown; message?: unknown; error?: unknown };
    const d = j.detail ?? j.message ?? j.error;
    if (typeof d === "string") detail = d;
    else if (Array.isArray(d)) detail = d.map((x) => (typeof x === "object" && x && "msg" in x ? String((x as { msg: unknown }).msg) : String(x))).join(" · ");
  } catch {
    // corps non JSON : on garde le texte brut
  }
  if (statut === 401) return `Higgsfield : clé API refusée (${detail || "401"})`;
  if (statut === 402) return `Higgsfield : solde API insuffisant (${detail || "402"})`;
  return `Higgsfield ${statut} : ${detail || "sans détail"}`;
}

export async function lancerGenjutsuMouvement(
  cle: string,
  corps: ReturnType<typeof corpsGenjutsu>,
): Promise<{ requestId: string }> {
  const r = await fetch(`${BASE}/${MODELE_GENJUTSU_MOUVEMENT}`, {
    method: "POST",
    headers: entetes(cle),
    body: JSON.stringify(corps),
    signal: AbortSignal.timeout(60_000),
  });
  const texte = await r.text();
  if (!r.ok) throw new Error(messageErreurHiggsfield(r.status, texte));
  let requestId: unknown;
  try {
    requestId = (JSON.parse(texte) as { request_id?: unknown }).request_id;
  } catch {
    // traité juste après
  }
  if (typeof requestId !== "string" || !requestId) throw new Error(`Higgsfield : pas de request_id (${texte.slice(0, 200)})`);
  return { requestId };
}

export type EtatGenjutsu =
  | { statut: "en_cours"; detail: string }
  | { statut: "prete"; videoUrl: string }
  | { statut: "echec"; erreur: string };

/** Lit une réponse de `/requests/{id}/status`. */
export function lireEtatGenjutsu(reponse: unknown): EtatGenjutsu {
  const r = (reponse ?? {}) as { status?: unknown; video?: { url?: unknown }; error?: unknown };
  const statut = String(r.status ?? "").toLowerCase();
  if (statut === "completed") {
    const url = typeof r.video?.url === "string" ? r.video.url : "";
    return url ? { statut: "prete", videoUrl: url } : { statut: "echec", erreur: "Higgsfield : terminée sans vidéo" };
  }
  if (statut === "nsfw") return { statut: "echec", erreur: "Higgsfield : refusée (contenu jugé NSFW), non facturée" };
  if (statut === "failed") {
    const e = typeof r.error === "string" && r.error ? ` (${r.error})` : "";
    return { statut: "echec", erreur: `Higgsfield : génération échouée${e}, non facturée` };
  }
  if (statut === "canceled" || statut === "cancelled") return { statut: "echec", erreur: "Higgsfield : génération annulée" };
  return { statut: "en_cours", detail: statut || "inconnu" };
}

export async function suivreGenjutsu(cle: string, requestId: string): Promise<EtatGenjutsu> {
  const r = await fetch(`${BASE}/requests/${encodeURIComponent(requestId)}/status`, {
    headers: entetes(cle),
    signal: AbortSignal.timeout(30_000),
  });
  const texte = await r.text();
  // 404 : l'identifiant n'existe pas (ou plus) chez Higgsfield, inutile d'insister.
  if (r.status === 404) return { statut: "echec", erreur: "Higgsfield : génération introuvable (404)" };
  if (!r.ok) throw new Error(messageErreurHiggsfield(r.status, texte));
  try {
    return lireEtatGenjutsu(JSON.parse(texte));
  } catch {
    throw new Error(`Higgsfield : statut illisible (${texte.slice(0, 200)})`);
  }
}
