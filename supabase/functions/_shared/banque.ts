/**
 * Banque d'images venues de l'extérieur (Pinterest, 0771) : ce que la fonction
 * Edge `banque` vérifie avant d'écrire. Tout ici est pur (ni base ni réseau).
 *
 * Une image de la banque est celle qu'un podz dépose : un JPEG vertical 9:16,
 * sans métadonnées, avec sa légende en anglais (`controlerImageBanque`). Elle
 * porte en plus son origine : l'adresse de l'image chez Pinterest et celle de
 * l'épingle. L'empreinte de l'image (`ref`) se lit dans l'adresse : la même
 * image épinglée sous dix numéros d'épingle n'entre qu'une fois.
 */

export const BANQUE_EXTERNE = {
  /** Labels qu'une même image peut recevoir d'un coup. */
  labelsMax: 8,
  requeteMax: 200,
  /** Empreintes interrogées en un appel (`connues`). */
  refsMax: 2000,
} as const;

export const SITES_BANQUE = ["pinterest"] as const;
export type SiteBanque = (typeof SITES_BANQUE)[number];

/**
 * L'empreinte d'une image Pinterest : les 32 caractères hexadécimaux de son
 * adresse i.pinimg.com, la même pour toutes ses tailles (`originals`, `736x`,
 * `236x`…). `null` si l'adresse n'en est pas une.
 */
export function refPinimg(url: string): string | null {
  const m = /^https:\/\/i\.pinimg\.com\/[a-z0-9_]{2,20}\/[0-9a-f]{2}\/[0-9a-f]{2}\/[0-9a-f]{2}\/([0-9a-f]{32})\.(?:jpe?g|png|webp)$/i
    .exec(url.trim());
  return m ? m[1].toLowerCase() : null;
}

/** L'adresse d'une épingle (pinterest.com, fr.pinterest.com, pinterest.co.uk…), sans paramètres. */
export function estPageEpingle(url: string): boolean {
  return /^https:\/\/(?:[a-z]{2,3}\.)?pinterest\.(?:com|[a-z]{2,3}|co\.[a-z]{2}|com\.[a-z]{2})\/pin\/[\w-]{4,120}\/?$/i.test(url.trim());
}

export interface OrigineBanque {
  site: SiteBanque;
  ref: string;
  image_url: string;
  page_url: string | null;
  requete: string | null;
}

export interface DemandeBanque {
  /** Noms de labels (« male_run ») ou slugs (« male-run »), sans doublon. */
  labels: string[];
  origine: OrigineBanque;
}

const NOM_LABEL = /^[a-z0-9][a-z0-9_-]{1,59}$/;

/** Les labels demandés, nettoyés : minuscules, sans doublon. Une erreur dit lequel ne va pas. */
export function lireLabels(brut: unknown): string[] | { erreur: string } {
  if (!Array.isArray(brut) || !brut.length) return { erreur: "labels : au moins un label (« male_run »)" };
  const labels = [...new Set(brut.map((l) => String(l ?? "").trim().toLowerCase()))];
  if (labels.length > BANQUE_EXTERNE.labelsMax) return { erreur: `labels : ${BANQUE_EXTERNE.labelsMax} au plus` };
  const faux = labels.find((l) => !NOM_LABEL.test(l));
  if (faux !== undefined) return { erreur: `labels : « ${faux} » n'est pas un nom de label` };
  return labels;
}

/** Lit `{ labels, origine: { site, image_url, page_url?, requete? } }` d'un versement. */
export function lireDemandeBanque(body: Record<string, unknown>): DemandeBanque | { erreur: string } {
  const labels = lireLabels(body.labels);
  if (!Array.isArray(labels)) return labels;
  const o = (body.origine ?? {}) as Record<string, unknown>;
  const site = String(o.site ?? "");
  if (!(SITES_BANQUE as readonly string[]).includes(site)) return { erreur: `origine.site : ${SITES_BANQUE.join(" | ")}` };
  const imageUrl = String(o.image_url ?? "").trim();
  const ref = refPinimg(imageUrl);
  if (!ref) return { erreur: "origine.image_url : l'adresse i.pinimg.com de l'image" };
  const pageUrl = String(o.page_url ?? "").trim();
  if (pageUrl && !estPageEpingle(pageUrl)) return { erreur: "origine.page_url : l'adresse de l'épingle (https://www.pinterest.com/pin/…/)" };
  const requete = String(o.requete ?? "").trim();
  if (requete.length > BANQUE_EXTERNE.requeteMax) return { erreur: `origine.requete : ${BANQUE_EXTERNE.requeteMax} caractères au plus` };
  return {
    labels,
    origine: { site: site as SiteBanque, ref, image_url: imageUrl, page_url: pageUrl || null, requete: requete || null },
  };
}

/**
 * La légende de secours d'un versement, facultative : la description d'une
 * image de la banque est écrite par l'OS (Florence, puis Moondream). Celle de
 * l'agent ne sert que si l'OS n'en rend aucune. Vide = pas de légende.
 */
export function lireLegendeSecours(brut: unknown): string | { erreur: string } {
  const l = String(brut ?? "").replace(/\s+/g, " ").trim();
  if (!l) return "";
  if (l.length > 300) return { erreur: `legende de ${l.length} caractères (300 au plus)` };
  if (l.split(" ").filter((m) => /[a-z]{3,}/i.test(m)).length < 3) return { erreur: "legende : en anglais, 3 mots au moins (ou rien : l'OS décrit l'image)" };
  return l;
}

/** Les empreintes à interroger (`connues`) : 32 caractères hexadécimaux, sans doublon, bornées. */
export function lireRefs(brut: unknown): string[] {
  if (!Array.isArray(brut)) return [];
  const refs = new Set<string>();
  for (const r of brut) {
    const ref = String(r ?? "").trim().toLowerCase();
    if (/^[0-9a-f]{32}$/.test(ref)) refs.add(ref);
    if (refs.size >= BANQUE_EXTERNE.refsMax) break;
  }
  return [...refs];
}

/**
 * Rapproche les labels demandés de ceux de la base, par nom (« male_run ») ou
 * par slug (« male-run »). Rend les labels trouvés, ou le premier inconnu.
 */
export function rapprocherLabels<L extends { nom: string; slug: string }>(
  demandes: string[],
  enBase: L[],
): { labels: L[] } | { inconnu: string } {
  const trouves: L[] = [];
  for (const d of demandes) {
    const l = enBase.find((b) => b.nom.toLowerCase() === d || b.slug.toLowerCase() === d);
    if (!l) return { inconnu: d };
    if (!trouves.includes(l)) trouves.push(l);
  }
  return { labels: trouves };
}
