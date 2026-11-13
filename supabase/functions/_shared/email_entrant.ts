/**
 * 12/11 (Max, point 10) : un posteur répond quand même à un de nos emails. Brevo (inbound parsing)
 * reçoit la réponse et la transmet à l'OS ; elle est traitée comme une demande Help (même bot, même
 * circuit), et l'OS lui répond par email avec la réponse et le lien Help.
 */

export interface EmailEntrant {
  messageId: string;
  de: string;
  nom: string | null;
  sujet: string;
  texte: string;
  /** 13/11 : les images jointes (captures d'écran), à télécharger chez Brevo avec leur jeton. */
  images: { nom: string; type: string; jeton: string }[];
}

/** Les images jointes d'un email Brevo (au plus 3, moins de 8 Mo chacune). */
export function imagesJointes(it: Item): { nom: string; type: string; jeton: string }[] {
  const pieces = Array.isArray(it?.Attachments) ? it.Attachments as Item[] : [];
  return pieces
    .filter((a) => /^image\/(png|jpe?g|webp|gif|heic)$/i.test(String(a?.ContentType ?? "")) && a?.DownloadToken && Number(a?.ContentLength ?? 0) < 8_000_000)
    .slice(0, 3)
    .map((a) => ({ nom: String(a.Name ?? "image").slice(0, 120), type: String(a.ContentType).toLowerCase(), jeton: String(a.DownloadToken) }));
}

/** Les images collées dans Gmail laissent « [ii_…](ii_…) » ou « [image: …] » dans le texte : on les retire. */
export function sansImagesInline(texte: string): string {
  return texte.replace(/!?\[(?:ii_[\w-]+|image:[^\]]*)\]\([^)]*\)/gi, "").replace(/\[image:[^\]]*\]/gi, "").replace(/\n{3,}/g, "\n\n").trim();
}

// deno-lint-ignore no-explicit-any
type Item = Record<string, any>;

/** Les emails d'un appel Brevo (`items`), lisibles ; les réponses automatiques et les vides sont écartés. */
export function lireEmailsBrevo(corps: unknown): EmailEntrant[] {
  const items = (corps as { items?: unknown })?.items;
  if (!Array.isArray(items)) return [];
  const sortie: EmailEntrant[] = [];
  for (const it of items as Item[]) {
    const de = String(it?.From?.Address ?? "").trim().toLowerCase();
    const sujet = String(it?.Subject ?? "").trim().slice(0, 200);
    const brut = String(it?.ExtractedMarkdownMessage ?? it?.RawTextBody ?? "").trim();
    const images = imagesJointes(it);
    const texte = sansImagesInline(sansCitation(brut)).slice(0, 3500) || (images.length ? "(screenshot only)" : "");
    const messageId = String(it?.MessageId ?? it?.Uuid?.[0] ?? "").trim();
    if (!de || !/@/.test(de) || !messageId || texte.length < 2) continue;
    if (estAutomatique(de, sujet, it?.Headers)) continue;
    sortie.push({ messageId, de, nom: it?.From?.Name ? String(it.From.Name).slice(0, 120) : null, sujet, texte, images });
  }
  return sortie;
}

/** Coupe l'email cité en dessous (« On … wrote: », « > … », « -----Original Message----- »). */
export function sansCitation(texte: string): string {
  const lignes = texte.replace(/\r\n/g, "\n").split("\n");
  const coupe = lignes.findIndex((l) =>
    /^\s*>/.test(l) ||
    /^\s*(On|Le|Am|El|Il|Em|W dniu)\b.{0,200}(wrote|a écrit|schrieb|escribió|ha scritto|escreveu|napisał)\s*:?\s*$/i.test(l) ||
    /^-{2,}\s*(Original Message|Message d'origine|Forwarded message)/i.test(l) ||
    /^\s*From:\s.+/i.test(l)
  );
  return (coupe > 0 ? lignes.slice(0, coupe) : lignes).join("\n").trim();
}

function estAutomatique(de: string, sujet: string, entetes: unknown): boolean {
  if (/(no-?reply|mailer-daemon|postmaster|bounce)/i.test(de)) return true;
  if (/^(automatic reply|auto(matic)?[- ]?reply|out of (the )?office|réponse automatique|abwesenheit|respuesta automática)/i.test(sujet)) return true;
  const h = (entetes && typeof entetes === "object") ? entetes as Record<string, unknown> : {};
  const auto = String(h["Auto-Submitted"] ?? h["auto-submitted"] ?? "").toLowerCase();
  return !!auto && auto !== "no";
}

/** Le jeton de Brevo (en-tête Authorization: Bearer …), comparé sans fuite de temps. */
export function jetonValide(entete: string | null, attendu: string | undefined): boolean {
  if (!entete || !attendu || attendu.length < 16) return false;
  const fourni = entete.replace(/^Bearer\s+/i, "");
  if (fourni.length !== attendu.length) return false;
  let diff = 0;
  for (let i = 0; i < attendu.length; i++) diff |= fourni.charCodeAt(i) ^ attendu.charCodeAt(i);
  return diff === 0;
}

/** La réponse au posteur, par email (anglais), avec la phrase Help. */
export function texteReponseEmail(prenom: string | null, reponse: string): string {
  return `Hi ${prenom?.trim() || "there"},\n\n${reponse.trim()}\n\n` +
    "Have a question or a problem? Don't reply to this email: click Help on your dashboard, you'll get an answer there.";
}

/**
 * 13/11 (Max) : les emails partent à la vraie adresse du posteur (email perso, puis email Ruul), jamais à
 * l'adresse de connexion @sophia.com (personne ne la lit).
 */
export function emailReel(candidats: unknown[]): string | null {
  for (const c of candidats) {
    const e = typeof c === "string" ? c.trim().toLowerCase() : "";
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && !e.endsWith("@sophia.com")) return e;
  }
  return null;
}
