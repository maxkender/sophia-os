// Ce qu'on sait lire d'une épingle Pinterest et ce qu'on en garde. Tout ici est
// pur (ni réseau ni disque) : c'est testé par `npm test`.
//
// Le scraper (`epctex/pinterest-scraper` sur Apify) rend une épingle avec ses
// images en plusieurs tailles : `images.orig` (l'original), `images["236x"]`
// (la vignette). L'empreinte d'une image est dans son adresse i.pinimg.com, la
// même pour toutes ses tailles et pour toutes les épingles qui la reprennent :
// c'est elle qui identifie une candidate (`ref`).

/** Une image de la banque : verticale 9:16, 720 px de large au moins (BANQUE_PODZ de l'OS). */
export const FORMAT = { ratio: 9 / 16, largeurMin: 720, largeurMax: 1080 } as const;
/** En dessous de ce rapport hauteur / largeur, le recadrage 9:16 coupe trop de l'image. */
export const HAUTEUR_SUR_LARGEUR_MIN = 1.2;

export type Cadrage = "centre" | "haut" | "bas" | "gauche" | "droite";
export const CADRAGES: readonly Cadrage[] = ["centre", "haut", "bas", "gauche", "droite"];

export type Candidat = {
  /** Empreinte de l'image (32 caractères hexadécimaux). */
  ref: string;
  image_url: string;
  vignette: string;
  largeur: number;
  hauteur: number;
  page_url: string | null;
  description: string;
  domaine: string | null;
  /** Recherches ou tableaux qui l'ont rendue. */
  requetes: string[];
  vu_le: string;
  /** Posé par le tri : une candidate décidée ne revient plus sur une planche. */
  decision?: "versee" | "ecartee";
  motif?: string;
  /** Mot de la description qui sent la pub ou la marque : à regarder de près. */
  alerte?: string;
};

/** Une adresse i.pinimg.com découpée : ses trois dossiers, l'empreinte de l'image, son extension. */
function decouper(url: string): { dossiers: string; ref: string; ext: string } | null {
  const m = /^https:\/\/i\.pinimg\.com\/[a-z0-9_]{2,20}\/([0-9a-f]{2}\/[0-9a-f]{2}\/[0-9a-f]{2})\/([0-9a-f]{32})\.([a-z0-9]{3,4})$/i.exec(url.trim());
  return m ? { dossiers: m[1].toLowerCase(), ref: m[2].toLowerCase(), ext: m[3].toLowerCase() } : null;
}

/** L'empreinte d'une image que la banque accepte (JPEG, PNG ou WebP de i.pinimg.com), sinon null. */
export function refPinimg(url: string): string | null {
  const d = decouper(url);
  return d && /^(jpe?g|png|webp)$/.test(d.ext) ? d.ref : null;
}

/** Largeur du JPEG que Pinterest sert pour un original qu'on ne sait pas lire (photo d'iPhone en HEIC). */
const LARGEUR_JPEG_HEIC = 1200;

/** La zone 9:16 la plus grande de l'image, calée selon le cadrage. */
export function zone(largeur: number, hauteur: number, cadrage: Cadrage = "centre"): { x: number; y: number; l: number; h: number } {
  if (largeur / hauteur > FORMAT.ratio) {
    const l = hauteur * FORMAT.ratio;
    const x = cadrage === "gauche" ? 0 : cadrage === "droite" ? largeur - l : (largeur - l) / 2;
    return { x, y: 0, l, h: hauteur };
  }
  const h = largeur / FORMAT.ratio;
  const y = cadrage === "haut" ? 0 : cadrage === "bas" ? hauteur - h : (hauteur - h) / 2;
  return { x: 0, y, l: largeur, h };
}

/** Taille de l'image versée : la zone 9:16, ramenée à 1080 px de large au plus, jamais agrandie. */
export function tailleSortie(largeur: number, hauteur: number): { l: number; h: number } {
  const l = Math.min(FORMAT.largeurMax, Math.floor(zone(largeur, hauteur).l));
  return { l, h: Math.round(l / FORMAT.ratio) };
}

/** Pourquoi une image ne peut pas entrer, d'après ses seules dimensions (null = elle peut). */
export function refusFormat(largeur: number, hauteur: number): string | null {
  if (!largeur || !hauteur) return "dimensions inconnues";
  if (hauteur / largeur < HAUTEUR_SUR_LARGEUR_MIN) return "pas verticale";
  if (tailleSortie(largeur, hauteur).l < FORMAT.largeurMin) return "trop petite";
  return null;
}

// Pub, marque, concurrent d'Atala (docs/applications.md § 7) : la description
// ne décide de rien, elle fait regarder l'image de plus près.
const ALERTES =
  /(?:^|[^a-z])(#?ad|#?sponsored|#?partner|giveaway|discount|shop now|promo code|nike|adidas|asics|hoka|new balance|saucony|brooks|puma|under armour|on running|lululemon|gymshark|zalando|garmin|strava|runna|nrc|coros|suunto|polar|whoop|apple watch)(?:[^a-z]|$)/i;

export function alerteDescription(description: string): string | undefined {
  return ALERTES.exec(description)?.[1]?.toLowerCase();
}

type Taille = { url?: unknown; width?: unknown; height?: unknown };

/**
 * Une épingle du scraper → une candidate, ou la raison de l'écarter d'office
 * (`null` si l'épingle n'a pas d'image lisible).
 */
export function lireEpingle(item: Record<string, unknown>, requete: string, vuLe: string): Candidat | { ecartee: string; ref: string | null } | null {
  if (item.type && item.type !== "pin") return null;
  const images = (item.images ?? {}) as Record<string, Taille>;
  const orig = images.orig ?? images["736x"];
  const adresse = decouper(typeof orig?.url === "string" ? orig.url : "");
  if (!adresse) return null;
  const ref = adresse.ref;
  if (item.videos || item.is_video === true || item.story_pin_data) return { ecartee: "vidéo", ref };
  if (adresse.ext === "gif") return { ecartee: "gif", ref };
  let url = String(orig.url).trim();
  let largeur = Number(orig.width) || 0;
  let hauteur = Number(orig.height) || 0;
  // Une photo d'iPhone est gardée en HEIC : on prend le JPEG de 1200 px de large que Pinterest en sert.
  if (adresse.ext === "heic") {
    url = `https://i.pinimg.com/${LARGEUR_JPEG_HEIC}x/${adresse.dossiers}/${ref}.jpg`;
    if (largeur > LARGEUR_JPEG_HEIC) {
      hauteur = Math.round((hauteur * LARGEUR_JPEG_HEIC) / largeur);
      largeur = LARGEUR_JPEG_HEIC;
    }
  } else if (!refPinimg(url)) return null;
  const refus = refusFormat(largeur, hauteur);
  if (refus) return { ecartee: refus, ref };
  const vignette = images["236x"]?.url;
  const description = [item.grid_title, item.title, item.description]
    .filter((t): t is string => typeof t === "string" && t.trim().length > 0)
    .join(" · ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
  const page = typeof item.url === "string" && /^https:\/\/[a-z.]*pinterest\.[a-z.]+\/pin\/[\w-]+\/?$/i.test(item.url) ? item.url : null;
  const alerte = alerteDescription(description);
  return {
    ref,
    image_url: url,
    vignette: typeof vignette === "string" ? vignette : `https://i.pinimg.com/236x/${adresse.dossiers}/${ref}.jpg`,
    largeur,
    hauteur,
    page_url: page,
    description,
    domaine: typeof item.domain === "string" && item.domain !== "Uploaded by user" ? item.domain : null,
    requetes: [requete],
    vu_le: vuLe,
    ...(alerte ? { alerte } : {}),
  };
}

/** Ajoute des candidates au stock connu : une image déjà vue garde sa décision et gagne la requête. */
export function fusionner(stock: Record<string, Candidat>, nouvelles: Candidat[]): { neuves: number; revues: number } {
  let neuves = 0;
  let revues = 0;
  for (const c of nouvelles) {
    const connue = stock[c.ref];
    if (connue) {
      revues += 1;
      for (const r of c.requetes) if (!connue.requetes.includes(r)) connue.requetes.push(r);
    } else {
      neuves += 1;
      stock[c.ref] = c;
    }
  }
  return { neuves, revues };
}

/** La candidate que désigne un début d'empreinte (6 caractères au moins) ; une erreur s'il y en a zéro ou plusieurs. */
export function trouver(stock: Record<string, Candidat>, debut: string): Candidat {
  const d = debut.trim().toLowerCase();
  if (!/^[0-9a-f]{6,32}$/.test(d)) throw new Error(`« ${debut} » : 6 caractères au moins de l'empreinte (ceux de la planche)`);
  const trouvees = Object.values(stock).filter((c) => c.ref.startsWith(d));
  if (trouvees.length !== 1) throw new Error(`« ${debut} » : ${trouvees.length ? "plusieurs images commencent ainsi, donne plus de caractères" : "aucune candidate"}`);
  return trouvees[0];
}

export type Decision = { ref: string; legende?: string; cadrage?: Cadrage; labels?: string[]; visage?: boolean };

/**
 * Vérifie un fichier de décisions (les images gardées d'une planche) ; rend les
 * erreurs, ligne par ligne. Une ligne est l'empreinte seule ("c4dfbf") ou un
 * objet. La légende est facultative : l'OS décrit lui-même chaque image.
 */
export function verifierDecisions(brut: unknown): { decisions: Decision[]; erreurs: string[] } {
  const erreurs: string[] = [];
  if (!Array.isArray(brut)) return { decisions: [], erreurs: ['le fichier est une liste : ["c4dfbf", { ref, cadrage?, labels?, visage?, legende? }]'] };
  const decisions: Decision[] = [];
  const vues = new Set<string>();
  for (const [i, d] of brut.entries()) {
    const o = (typeof d === "string" ? { ref: d } : (d ?? {})) as Record<string, unknown>;
    const ref = String(o.ref ?? "").trim().toLowerCase();
    const legende = String(o.legende ?? "").replace(/\s+/g, " ").trim();
    const ou = `n° ${i + 1} (${ref || "sans ref"})`;
    if (!/^[0-9a-f]{6,32}$/.test(ref)) erreurs.push(`${ou} : ref = les 6 caractères de la planche`);
    if (vues.has(ref)) erreurs.push(`${ou} : en double`);
    vues.add(ref);
    if (legende && legende.split(" ").filter((m) => /[a-z]{3,}/i.test(m)).length < 3) erreurs.push(`${ou} : legende en anglais, 3 mots au moins (ou aucune)`);
    if (legende.length > 300) erreurs.push(`${ou} : legende de ${legende.length} caractères (300 au plus)`);
    if (o.cadrage !== undefined && !CADRAGES.includes(o.cadrage as Cadrage)) erreurs.push(`${ou} : cadrage = ${CADRAGES.join(" | ")}`);
    if (o.labels !== undefined && (!Array.isArray(o.labels) || !o.labels.length)) erreurs.push(`${ou} : labels = une liste de noms de labels`);
    decisions.push({
      ref,
      ...(legende ? { legende } : {}),
      ...(o.cadrage ? { cadrage: o.cadrage as Cadrage } : {}),
      ...(Array.isArray(o.labels) ? { labels: o.labels.map(String) } : {}),
      ...(o.visage === true ? { visage: true } : {}),
    });
  }
  return { decisions, erreurs };
}
