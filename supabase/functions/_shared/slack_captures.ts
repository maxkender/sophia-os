/**
 * 24/11 (Max) : les captures d'écran jointes à un message Slack (DM à l'appli Sophia OS, salons et fils suivis par le
 * support). Comme pour les emails (decrireImagesBrevo), chaque image est téléchargée avec le jeton du bot (scope
 * `files:read`), décrite par le modèle et ajoutée au texte : « [Screenshot: …] 📎 <permalien> ». Le bot lit la
 * description, la Boîte affiche « 📎 capture » avec le lien. Ne lève jamais : une image illisible devient
 * « [Screenshot: (screenshot not readable)] » et la raison est loggée.
 */
type Fetch = typeof fetch;

export const CAPTURES_MAX = 3;
export const CAPTURE_OCTETS_MAX = 5 * 1024 * 1024;
export const CAPTURE_ILLISIBLE = "(screenshot not readable)";

export interface ImageSlack {
  id: string | null;
  nom: string;
  mimetype: string;
  url: string | null;
  permalien: string | null;
  taille: number | null;
}

export interface CaptureSlack {
  description: string | null;
  permalien: string | null;
  /** La raison quand l'image n'a pas pu être lue (missing_scope, http_403, trop_lourde…). */
  erreur: string | null;
}

/** Un message Slack qui peut porter des fichiers (évènement `message`, sous-type `file_share` ou non). */
export interface MessageAvecFichiers {
  subtype?: string;
  text?: string;
  files?: unknown;
}

/** Les images d'un message Slack (mimetype image/*), au plus 3. */
export function imagesDuMessage(m: MessageAvecFichiers | null | undefined): ImageSlack[] {
  const fichiers = Array.isArray(m?.files) ? m!.files as Record<string, unknown>[] : [];
  const images: ImageSlack[] = [];
  for (const f of fichiers) {
    if (!f || typeof f !== "object") continue;
    const mimetype = String(f.mimetype ?? "").toLowerCase();
    if (!mimetype.startsWith("image/")) continue;
    const url = (typeof f.url_private_download === "string" && f.url_private_download) ||
      (typeof f.url_private === "string" && f.url_private) || null;
    const taille = Number(f.size);
    images.push({
      id: typeof f.id === "string" ? f.id : null,
      nom: String(f.name ?? f.title ?? "image"),
      mimetype,
      url,
      permalien: typeof f.permalink === "string" && f.permalink ? f.permalink : null,
      taille: Number.isFinite(taille) && taille > 0 ? taille : null,
    });
    if (images.length >= CAPTURES_MAX) break;
  }
  return images;
}

export function aDesImages(m: MessageAvecFichiers | null | undefined): boolean {
  return imagesDuMessage(m).length > 0;
}

/** Le message contient déjà une capture décrite (Slack, email…) : le bot ne la redemande pas. */
export function contientCapture(texte: string | null | undefined): boolean {
  return /\[Screenshot:/i.test(texte ?? "");
}

function base64(octets: Uint8Array): string {
  let binaire = "";
  for (let i = 0; i < octets.length; i += 0x8000) binaire += String.fromCharCode(...octets.subarray(i, i + 0x8000));
  return btoa(binaire);
}

/** Pourquoi Slack refuse le fichier (le corps d'une réponse non-image : JSON d'erreur ou page de connexion HTML). */
async function raisonRefus(r: Response): Promise<string> {
  const type = (r.headers.get("content-type") ?? "").toLowerCase();
  if (type.includes("json")) {
    // deno-lint-ignore no-explicit-any
    const j = await r.json().catch(() => null) as any;
    if (j?.error) return String(j.error) + (j.needed ? ` (needed: ${j.needed})` : "");
  }
  // Sans `files:read`, Slack renvoie sa page de connexion (HTML, 200) au lieu de l'image.
  if (type.includes("html")) return "not_allowed (page de connexion Slack : scope files:read manquant ?)";
  return `type ${type || "inconnu"}`;
}

/** Télécharge et décrit une image. Ne lève pas. */
export async function lireImageSlack(
  jeton: string | null,
  im: ImageSlack,
  decrire: (base64: string, mime: string) => Promise<string>,
  fetchFn: Fetch = fetch,
): Promise<CaptureSlack> {
  const echec = (erreur: string): CaptureSlack => {
    console.warn(`[slack_captures] ${im.id ?? im.nom} illisible : ${erreur}`);
    return { description: null, permalien: im.permalien, erreur };
  };
  if (!jeton) return echec("jeton Slack manquant");
  if (!im.url) return echec("pas d'url_private (fichier caché ou scope files:read manquant)");
  if (im.taille !== null && im.taille > CAPTURE_OCTETS_MAX) return echec(`trop_lourde (${im.taille} octets > 5 Mo)`);
  try {
    const r = await fetchFn(im.url, { headers: { authorization: `Bearer ${jeton}` } });
    if (!r.ok) {
      await r.body?.cancel().catch(() => {});
      return echec(`http_${r.status}${r.status === 403 ? " (not_allowed : scope files:read ?)" : ""}`);
    }
    const type = (r.headers.get("content-type") ?? "").toLowerCase().split(";")[0]!.trim();
    if (!type.startsWith("image/")) return echec(await raisonRefus(r));
    const longueur = Number(r.headers.get("content-length"));
    if (Number.isFinite(longueur) && longueur > CAPTURE_OCTETS_MAX) {
      await r.body?.cancel().catch(() => {});
      return echec(`trop_lourde (${longueur} octets > 5 Mo)`);
    }
    const octets = new Uint8Array(await r.arrayBuffer());
    if (octets.length > CAPTURE_OCTETS_MAX) return echec(`trop_lourde (${octets.length} octets > 5 Mo)`);
    if (!octets.length) return echec("fichier vide");
    const mime = type === "image/jpg" ? "image/jpeg" : type;
    const description = (await decrire(base64(octets), mime)).replace(/\s+/g, " ").replace(/[[\]]/g, "").trim().slice(0, 600);
    if (!description) return echec("description vide");
    return { description, permalien: im.permalien, erreur: null };
  } catch (e) {
    return echec(e instanceof Error ? e.message : String(e));
  }
}

/** Les images d'un message, lues l'une après l'autre (au plus 3). */
export async function lireCapturesSlack(
  jeton: string | null,
  m: MessageAvecFichiers | null | undefined,
  decrire: (base64: string, mime: string) => Promise<string>,
  fetchFn: Fetch = fetch,
): Promise<CaptureSlack[]> {
  const sortie: CaptureSlack[] = [];
  for (const im of imagesDuMessage(m)) sortie.push(await lireImageSlack(jeton, im, decrire, fetchFn));
  return sortie;
}

/** Le texte du message, suivi d'une ligne « [Screenshot: …] 📎 <permalien> » par capture. */
export function texteAvecCaptures(texte: string, captures: readonly CaptureSlack[]): string {
  if (!captures.length) return texte;
  const lignes = captures.map((c) => `[Screenshot: ${c.description ?? CAPTURE_ILLISIBLE}]${c.permalien ? ` 📎 ${c.permalien}` : ""}`);
  return [texte.trim(), lignes.join("\n")].filter(Boolean).join("\n\n");
}

/** Le texte enrichi d'un message Slack (inchangé s'il n'a pas d'image). Ne lève pas. */
export async function texteSlackAvecCaptures(
  jeton: string | null,
  m: MessageAvecFichiers | null | undefined,
  decrire: (base64: string, mime: string) => Promise<string>,
  fetchFn: Fetch = fetch,
): Promise<string> {
  const texte = String(m?.text ?? "");
  if (!aDesImages(m)) return texte;
  return texteAvecCaptures(texte, await lireCapturesSlack(jeton, m, decrire, fetchFn));
}
