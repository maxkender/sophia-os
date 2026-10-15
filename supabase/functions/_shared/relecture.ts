/**
 * Relecture automatique des posts publiés : la mise en forme du texte que le
 * créateur a retapé dans TikTok, comparée slide par slide à l'original.
 *
 * Le créateur reçoit des images propres et des textes à copier ; il choisit
 * lui-même taille, couleur, retours à la ligne. C'est là que naissent les
 * défauts que l'admin relevait à la main dans /admin/file-reviews (« text not
 * the same », « Jutifier », « Corpus / head »).
 *
 * Ce module est PUR (aucun appel réseau) : il parse la mesure renvoyée par
 * Gemini, juge chaque paire original / publié avec des règles chiffrées, agrège
 * à l'échelle du post et rédige le brouillon de review. L'IA mesure, les règles
 * jugent : même mesure → même verdict, et chaque seuil se recalibre ici.
 */

export type Role = "titre" | "corps";
export type Alignement = "gauche" | "centre" | "droite";

/** Un bloc de texte incrusté, boîte SERRÉE en fractions 0..1 de l'image. */
export interface BlocTexte {
  role: Role;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Lignes visuelles (max du compte déclaré et de la transcription). */
  lignes: number;
  /** Transcription, une ligne visuelle par ligne. */
  texte: string;
  couleur: string;
  contour: boolean;
  gras: boolean;
  alignement: Alignement;
}

export interface MesureSlide {
  blocs: BlocTexte[];
  largeurPx: number;
  hauteurPx: number;
}

export type CodeDefaut =
  | "forme_paragraphe"
  | "taille"
  | "hierarchie"
  | "couleur"
  | "contour"
  | "gras"
  | "police"
  | "alignement"
  | "placement"
  | "texte_absent"
  | "nb_slides"
  | "musique";

/** Ce qu'une paire de slides révèle, défaut ou non. */
export interface Constat {
  code: CodeDefaut;
  position: number;
  /** Phrase courte en français, pour l'admin. */
  detail: string;
  /** Valeurs utiles au brouillon (car./ligne, ratio de taille…). */
  valeurs?: Record<string, number | string>;
}

export interface JugementPaire {
  position: number;
  /** Règles qui ont pu s'appliquer à cette paire (dénominateur de la confiance). */
  evalues: CodeDefaut[];
  constats: Constat[];
}

export interface Defaut {
  code: CodeDefaut;
  slides: number[];
  /** Part des slides comparables où l'écart est vu (1 pour les contrôles de post). */
  confiance: number;
  detail: string;
  valeurs?: Record<string, number | string>;
}

// ---------------------------------------------------------------------------
// Seuils — à recalibrer sur le jeu de référence (voir docs/relecture-auto.md)
// ---------------------------------------------------------------------------

/** Caractères par ligne publiés ÷ originaux : en dessous, paragraphe en colonne étroite. */
export const SEUIL_LIGNES_COURTES = 0.72;
/**
 * Largeur du paragraphe publiée ÷ originale : en dessous, colonne étroite même
 * si le texte, plus petit, garde autant de caractères par ligne (test du 15/10 :
 * 0,59 et 0,63 sur un post où la remarque « Jutifier » s'imposait à l'œil).
 */
export const SEUIL_LARGEUR = 0.75;
/** Au-dessus : lignes nettement plus longues que l'original. */
export const SEUIL_LIGNES_LONGUES = 1.5;
/**
 * Hauteur de ligne publiée ÷ originale, rapportée à la largeur de l'image.
 * Calibré le 15/10 sur 10 posts relus à l'œil : les textes grossis à ×1,3
 * se voient nettement, ceux à ×1,1-1,2 passent pour fidèles.
 */
export const SEUIL_TAILLE_MIN = 0.8;
export const SEUIL_TAILLE_MAX = 1.25;
/** Le titre de l'original est plus grand que son corps d'au moins ce facteur. */
export const SEUIL_HIERARCHIE = 1.15;
/** Écart vertical du centre du texte, en fraction de la hauteur de l'image. */
export const SEUIL_PLACEMENT = 0.2;
/** Paragraphe assez long pour juger sa forme. */
const MIN_CARACTERES_FORME = 60;

// ---------------------------------------------------------------------------
// Mesure : prompt et parsing
// ---------------------------------------------------------------------------

export const PROMPT_MESURE = `Tu compares deux slides TikTok. A est l'ORIGINAL (la référence). B est la version PUBLIÉE par un créateur, qui a retapé le texte (traduit dans une autre langue) avec l'éditeur de TikTok.

Pour CHAQUE image, relève les blocs de texte incrusté. Ignore les watermarks, les @pseudos, les logos et l'interface TikTok.
Un bloc = un paragraphe d'un même style. Un titre et son paragraphe font DEUX blocs s'ils diffèrent par la taille, la graisse ou la couleur ; un seul bloc sinon.

Pour chaque bloc :
- role : "titre" (accroche ou intertitre court) ou "corps" (paragraphe)
- x, y, w, h : boîte SERRÉE autour des lettres, en fractions 0..1 de l'image (origine en haut à gauche), sans marge
- lignes : nombre de lignes VISUELLES affichées (compte-les une par une)
- texte : transcription exacte, en respectant les retours à la ligne AFFICHÉS (un \\n entre deux lignes visuelles)
- couleur : couleur de remplissage des lettres en #RRGGBB (pas le contour)
- contour : true seulement si chaque lettre a un contour ou une ombre nette
- gras : true si les lettres sont nettement grasses
- alignement : "gauche", "centre" ou "droite", d'après les bords des lignes

Enfin, compare les deux images :
- police_identique : true si B utilise la même police que A (même famille de caractères ET même graisse), false sinon

Réponds UNIQUEMENT par un objet JSON, sans texte autour :
{"a":[{"role":"titre","x":0.1,"y":0.3,"w":0.8,"h":0.06,"lignes":1,"texte":"...","couleur":"#FFFFFF","contour":false,"gras":true,"alignement":"centre"}],"b":[...],"police_identique":true}`;

function nombre(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

function couleurHex(v: unknown): string {
  const s = String(v ?? "").trim();
  return /^#[0-9A-Fa-f]{6}$/.test(s) ? s.toUpperCase() : "#FFFFFF";
}

function vrai(v: unknown): boolean {
  return v === true || v === "true" || v === 1;
}

function alignementDe(v: unknown): Alignement {
  const s = String(v ?? "").toLowerCase();
  if (s.startsWith("g") || s.startsWith("l")) return "gauche";
  if (s.startsWith("d") || s.startsWith("r")) return "droite";
  return "centre";
}

/** Lignes non vides de la transcription. */
export function lignesTexte(texte: string): string[] {
  return texte.split(/\n/).map((l) => l.trim()).filter(Boolean);
}

// deno-lint-ignore no-explicit-any
function parserBloc(item: any): BlocTexte | null {
  if (!item || typeof item !== "object") return null;
  let x = nombre(item.x), y = nombre(item.y), w = nombre(item.w), h = nombre(item.h);
  if (x === null || y === null || w === null || h === null) return null;
  // Gemini répond parfois sur l'échelle 0-1000.
  if (Math.max(x, y, w, h) > 1.5) {
    x /= 1000; y /= 1000; w /= 1000; h /= 1000;
  }
  if (w <= 0 || h <= 0) return null;
  const texte = String(item.texte ?? item.text ?? "").trim();
  if (!texte) return null;
  const declarees = Math.round(nombre(item.lignes) ?? 0);
  const lignes = Math.max(1, declarees, lignesTexte(texte).length);
  const role: Role = String(item.role ?? "").toLowerCase().startsWith("t") ? "titre" : "corps";
  return {
    role,
    x: Math.max(0, Math.min(1, x)),
    y: Math.max(0, Math.min(1, y)),
    w: Math.min(1, w),
    h: Math.min(1, h),
    lignes,
    texte,
    couleur: couleurHex(item.couleur ?? item.color),
    contour: vrai(item.contour ?? item.ombre ?? item.stroke),
    gras: vrai(item.gras ?? item.bold),
    alignement: alignementDe(item.alignement ?? item.align),
  };
}

export interface Mesure {
  a: BlocTexte[];
  b: BlocTexte[];
  /** null quand le modèle ne s'est pas prononcé. */
  policeIdentique: boolean | null;
}

/** `{"a":[...],"b":[...],"police_identique":…}`, même noyé dans du texte ou un bloc de code. */
export function parserMesure(reponse: string): Mesure | null {
  const debut = reponse.indexOf("{");
  const fin = reponse.lastIndexOf("}");
  if (debut < 0 || fin <= debut) return null;
  let data: unknown;
  try {
    data = JSON.parse(reponse.slice(debut, fin + 1));
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const liste = (v: unknown) =>
    (Array.isArray(v) ? v : []).map(parserBloc).filter((b): b is BlocTexte => b !== null);
  if (!Array.isArray(d.a) && !Array.isArray(d.b)) return null;
  const police = d.police_identique;
  const policeIdentique = police === true || police === "true"
    ? true
    : police === false || police === "false"
    ? false
    : null;
  return { a: liste(d.a), b: liste(d.b), policeIdentique };
}

// ---------------------------------------------------------------------------
// Grandeurs
// ---------------------------------------------------------------------------

const aire = (b: BlocTexte) => b.w * b.h;

/** Le paragraphe principal : le plus grand bloc « corps », à défaut le plus grand bloc. */
export function blocPrincipal(blocs: BlocTexte[]): BlocTexte | null {
  const corps = blocs.filter((b) => b.role === "corps");
  const pool = corps.length > 0 ? corps : blocs;
  return pool.reduce<BlocTexte | null>((m, b) => (!m || aire(b) > aire(m) ? b : m), null);
}

function titreAuDessus(blocs: BlocTexte[], corps: BlocTexte): BlocTexte | null {
  const titres = blocs.filter((b) => b.role === "titre" && b !== corps && b.y < corps.y);
  return titres.sort((p, q) => q.y - p.y)[0] ?? null;
}

/** Caractères par ligne visuelle. */
export function caracteresParLigne(b: BlocTexte): number {
  const total = lignesTexte(b.texte).join(" ").length;
  return total / b.lignes;
}

/**
 * Hauteur d'une ligne rapportée à la LARGEUR de l'image : dans TikTok, la
 * taille du texte se juge par rapport à la largeur de l'écran, et les deux
 * images n'ont pas toujours le même format.
 */
export function hauteurLigne(b: BlocTexte, m: MesureSlide): number {
  return (b.h * m.hauteurPx) / (b.lignes * m.largeurPx);
}

/** Famille de couleur : les nuances proches (blanc / blanc cassé) se confondent. */
export function familleCouleur(hex: string): string {
  const v = parseInt(hex.slice(1), 16);
  const r = (v >> 16) & 255, g = (v >> 8) & 255, b = v & 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max - min < 50) {
    const l = (max + min) / 2;
    return l > 190 ? "blanc" : l < 60 ? "noir" : "gris";
  }
  let t: number;
  if (max === r) t = ((g - b) / (max - min)) % 6;
  else if (max === g) t = (b - r) / (max - min) + 2;
  else t = (r - g) / (max - min) + 4;
  const teinte = (t * 60 + 360) % 360;
  if (teinte < 15 || teinte >= 345) return "rouge";
  if (teinte < 40) return "orange";
  if (teinte < 70) return "jaune";
  if (teinte < 170) return "vert";
  if (teinte < 260) return "bleu";
  if (teinte < 300) return "violet";
  return "rose";
}

function centreVertical(blocs: BlocTexte[]): number {
  const haut = Math.min(...blocs.map((b) => b.y));
  const bas = Math.max(...blocs.map((b) => b.y + b.h));
  return (haut + bas) / 2;
}

const arrondi = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

// ---------------------------------------------------------------------------
// Jugement d'une paire original / publié
// ---------------------------------------------------------------------------

export function jugerPaire(
  position: number,
  a: MesureSlide,
  b: MesureSlide,
  policeIdentique: boolean | null = null,
): JugementPaire {
  const evalues: CodeDefaut[] = [];
  const constats: Constat[] = [];
  const ajouter = (code: CodeDefaut, detail: string, valeurs?: Constat["valeurs"]) =>
    constats.push({ code, position, detail, valeurs });

  // L'original n'a pas de texte sur cette slide : rien à comparer.
  if (a.blocs.length === 0) return { position, evalues, constats };

  evalues.push("texte_absent");
  if (b.blocs.length === 0) {
    ajouter("texte_absent", "aucun texte sur la slide publiée");
    return { position, evalues, constats };
  }

  const pa = blocPrincipal(a.blocs)!;
  const pb = blocPrincipal(b.blocs)!;

  // Forme du paragraphe (« Jutifier ») : longueur des lignes, quelle que soit la taille.
  const charsA = lignesTexte(pa.texte).join(" ").length;
  const charsB = lignesTexte(pb.texte).join(" ").length;
  if (
    charsA >= MIN_CARACTERES_FORME && charsB >= MIN_CARACTERES_FORME &&
    Math.max(pa.lignes, pb.lignes) >= 3
  ) {
    evalues.push("forme_paragraphe");
    const cplA = caracteresParLigne(pa);
    const cplB = caracteresParLigne(pb);
    const ratio = cplB / cplA;
    const largeur = pb.w / pa.w;
    const valeurs = { cpl_original: Math.round(cplA), cpl_publie: Math.round(cplB), lignes_original: pa.lignes, lignes_publie: pb.lignes, largeur: arrondi(largeur) };
    if (largeur < SEUIL_LARGEUR && pb.lignes >= 3) {
      ajouter("forme_paragraphe", `colonne étroite : paragraphe ${Math.round((1 - largeur) * 100)} % moins large que l'original (${pb.lignes} lignes contre ${pa.lignes})`, { ...valeurs, sens: "courtes" });
    } else if (ratio < SEUIL_LIGNES_COURTES) {
      ajouter("forme_paragraphe", `lignes trop courtes : ${Math.round(cplB)} car./ligne contre ${Math.round(cplA)} (${pb.lignes} lignes contre ${pa.lignes})`, { ...valeurs, sens: "courtes" });
    } else if (ratio > SEUIL_LIGNES_LONGUES) {
      ajouter("forme_paragraphe", `lignes trop longues : ${Math.round(cplB)} car./ligne contre ${Math.round(cplA)}`, { ...valeurs, sens: "longues" });
    }
  }

  // Taille du texte.
  evalues.push("taille");
  const ratioTaille = hauteurLigne(pb, b) / hauteurLigne(pa, a);
  if (ratioTaille < SEUIL_TAILLE_MIN || ratioTaille > SEUIL_TAILLE_MAX) {
    const sens = ratioTaille > 1 ? "plus grand" : "plus petit";
    ajouter("taille", `texte ${sens} que l'original (×${arrondi(ratioTaille, 1)})`, { ratio: arrondi(ratioTaille), sens });
  }

  // Hiérarchie titre / corps : l'original distingue un titre, le publié non.
  const titreA = titreAuDessus(a.blocs, pa);
  if (titreA && pa.role === "corps") {
    const distinctA = hauteurLigne(titreA, a) / hauteurLigne(pa, a) >= SEUIL_HIERARCHIE ||
      titreA.gras !== pa.gras || familleCouleur(titreA.couleur) !== familleCouleur(pa.couleur);
    if (distinctA) {
      evalues.push("hierarchie");
      const titreB = pb.role === "corps" ? titreAuDessus(b.blocs, pb) : null;
      const distinctB = titreB !== null && (
        hauteurLigne(titreB, b) / hauteurLigne(pb, b) >= 1.08 ||
        titreB.gras !== pb.gras || familleCouleur(titreB.couleur) !== familleCouleur(pb.couleur)
      );
      if (!distinctB) ajouter("hierarchie", "titre et corps à la même taille, dans le même style");
    }
  }

  // Style : couleur, contour, graisse du paragraphe principal.
  evalues.push("couleur", "contour", "gras");
  const famA = familleCouleur(pa.couleur), famB = familleCouleur(pb.couleur);
  if (famA !== famB) ajouter("couleur", `couleur ${famB} au lieu de ${famA}`, { original: famA, publie: famB });
  if (pa.contour !== pb.contour) {
    ajouter("contour", pb.contour ? "contour ou ombre ajouté sur les lettres" : "contour de l'original absent", { original: String(pa.contour), publie: String(pb.contour) });
  }
  if (pa.gras !== pb.gras) {
    ajouter("gras", pb.gras ? "texte en gras, l'original ne l'est pas" : "gras de l'original perdu", { original: String(pa.gras), publie: String(pb.gras) });
  }

  // Police et graisse : comparées directement par le modèle sur les deux images.
  if (policeIdentique !== null) {
    evalues.push("police");
    if (!policeIdentique) ajouter("police", "police ou graisse différente de l'original");
  }

  // Alignement, seulement s'il a un sens (au moins 2 lignes de chaque côté).
  if (pa.lignes >= 2 && pb.lignes >= 2) {
    evalues.push("alignement");
    if (pa.alignement !== pb.alignement) {
      ajouter("alignement", `aligné ${pb.alignement === "centre" ? "au centre" : `à ${pb.alignement}`} au lieu de ${pa.alignement === "centre" ? "au centre" : `à ${pa.alignement}`}`, { original: pa.alignement, publie: pb.alignement });
    }
  }

  // Placement vertical de l'ensemble du texte.
  evalues.push("placement");
  const ecart = centreVertical(b.blocs) - centreVertical(a.blocs);
  if (Math.abs(ecart) > SEUIL_PLACEMENT) {
    ajouter("placement", `texte placé nettement plus ${ecart > 0 ? "bas" : "haut"} que l'original`, { ecart: arrondi(ecart), sens: ecart > 0 ? "bas" : "haut" });
  }

  return { position, evalues, constats };
}

// ---------------------------------------------------------------------------
// Agrégation à l'échelle du post
// ---------------------------------------------------------------------------

/**
 * Un défaut n'est retenu que s'il se répète : vu sur au moins la moitié des
 * slides où la règle s'applique, et sur 2 slides dès qu'il y en a 2 à juger.
 * Une mesure ratée sur une slide ne suffit donc pas à envoyer une remarque.
 *
 * Exception : l'alignement. Souvent seule l'accroche a un alignement propre
 * (à gauche quand le reste est centré), et le modèle le lit sans erreur sur
 * les posts relus à l'œil : une slide suffit.
 */
const VU_SUR_UNE_SLIDE: CodeDefaut[] = ["alignement"];

export function agreger(jugements: JugementPaire[]): Defaut[] {
  const parCode = new Map<CodeDefaut, { evalues: number; constats: Constat[] }>();
  for (const j of jugements) {
    for (const code of j.evalues) {
      const e = parCode.get(code) ?? { evalues: 0, constats: [] };
      e.evalues += 1;
      parCode.set(code, e);
    }
    for (const c of j.constats) parCode.get(c.code)!.constats.push(c);
  }
  const defauts: Defaut[] = [];
  for (const [code, e] of parCode) {
    const vus = e.constats.length;
    if (vus === 0) continue;
    if (!VU_SUR_UNE_SLIDE.includes(code) && (vus / e.evalues < 0.5 || vus < Math.min(2, e.evalues))) continue;
    const premier = e.constats[0];
    defauts.push({
      code,
      slides: e.constats.map((c) => c.position).sort((p, q) => p - q),
      confiance: arrondi(vus / e.evalues),
      detail: premier.detail,
      valeurs: premier.valeurs,
    });
  }
  return defauts.sort((p, q) => ORDRE.indexOf(p.code) - ORDRE.indexOf(q.code));
}

const ORDRE: CodeDefaut[] = [
  "forme_paragraphe", "taille", "hierarchie", "alignement", "police", "couleur", "contour", "gras",
  "placement", "texte_absent", "nb_slides", "musique",
];

/** Contrôles du post entier : nombre de slides et son fourni. */
export function controlesPost(input: {
  slidesAttendues: number;
  slidesPubliees: number;
  musiqueAttendueId: string | null;
  musiquePublieeId: string | null;
}): Defaut[] {
  const out: Defaut[] = [];
  if (input.slidesPubliees > 0 && input.slidesPubliees !== input.slidesAttendues) {
    out.push({
      code: "nb_slides",
      slides: [],
      confiance: 1,
      detail: `${input.slidesPubliees} slides publiées au lieu de ${input.slidesAttendues}`,
      valeurs: { publie: input.slidesPubliees, attendu: input.slidesAttendues },
    });
  }
  if (input.musiqueAttendueId && input.musiquePublieeId && input.musiqueAttendueId !== input.musiquePublieeId) {
    out.push({ code: "musique", slides: [], confiance: 1, detail: "le son n'est pas celui fourni" });
  }
  return out;
}

/** Identifiant numérique d'un son TikTok (fin d'un lien /music/<slug>-<id>). */
export function idMusique(url: string | null | undefined): string | null {
  const m = String(url ?? "").match(/\/music\/[^?#]*?(\d{8,})(?:[/?#]|$)/);
  return m ? m[1] : null;
}

/**
 * Slides à comparer : l'accroche, puis les deux slides au texte le plus long
 * (ce sont elles qui montrent la forme du paragraphe). Jamais la slide de
 * l'appli, qui n'a pas d'équivalent dans l'original.
 */
export function choisirPositions(
  candidates: Array<{ position: number; longueur: number }>,
  max = 3,
): number[] {
  const accroche = candidates.find((c) => c.position === 1);
  const autres = candidates
    .filter((c) => c.position !== 1)
    .sort((p, q) => q.longueur - p.longueur || p.position - q.position)
    .slice(0, accroche ? max - 1 : max);
  return [...(accroche ? [accroche.position] : []), ...autres.map((c) => c.position)].sort((p, q) => p - q);
}

// ---------------------------------------------------------------------------
// Brouillon de review (anglais, comme les reviews envoyées)
// ---------------------------------------------------------------------------

export interface RemarqueType {
  id: string;
  titre: string;
  corps: string;
}

/** Remarque-type de la file qui couvre chaque défaut, retrouvée par son titre. */
const REMARQUE_DU_CODE: Partial<Record<CodeDefaut, RegExp>> = {
  forme_paragraphe: /justif|jutif/i,
  taille: /not the same|style/i,
  couleur: /not the same|style/i,
  contour: /not the same|style/i,
  gras: /not the same|style/i,
  police: /not the same|style/i,
  hierarchie: /corpus|head/i,
};

function slidesEn(slides: number[]): string {
  if (slides.length === 0) return "";
  if (slides.length === 1) return `slide ${slides[0]}`;
  return `slides ${slides.slice(0, -1).join(", ")} and ${slides[slides.length - 1]}`;
}

function phraseAnglaise(d: Defaut): string {
  const ou = d.slides.length ? `On ${slidesEn(d.slides)}, ` : "";
  const v = d.valeurs ?? {};
  switch (d.code) {
    case "forme_paragraphe":
      return v.sens === "longues"
        ? `${ou}the lines run much longer than in the original (${v.cpl_publie} characters per line instead of ${v.cpl_original}).`
        : `${ou}the paragraph is a narrow column (${v.lignes_publie} lines instead of ${v.lignes_original}). Make the lines as long as in the original.`;
    case "taille":
      return `${ou}the text is about ${v.ratio}× ${v.sens === "plus grand" ? "bigger" : "smaller"} than in the original.`;
    case "hierarchie":
      return `${ou}the title and the body look the same: the title should stand out like in the original.`;
    case "alignement":
      return `${ou}the text is ${v.publie === "centre" ? "centered" : `${v.publie === "gauche" ? "left" : "right"}-aligned`}, the original is ${v.original === "centre" ? "centered" : `${v.original === "gauche" ? "left" : "right"}-aligned`}.`;
    case "couleur":
      return `${ou}the text color is not the original one (original: ${COULEURS_EN[String(v.original)] ?? v.original}).`;
    case "contour":
      return `${ou}${v.publie === "true" ? "the letters have an outline or shadow that the original does not have" : "the outline of the original letters is missing"}.`;
    case "gras":
      return `${ou}${v.publie === "true" ? "the text is bold, the original is not" : "the original text is bold, yours is not"}.`;
    case "police":
      return `${ou}the font is not the one of the original (typeface or weight).`;
    case "placement":
      return `${ou}the text sits much ${v.sens === "bas" ? "lower" : "higher"} than in the original.`;
    case "texte_absent":
      return `${ou}there is no text.`;
    case "nb_slides":
      return `The post has ${v.publie} slides instead of ${v.attendu}.`;
    case "musique":
      return "Please use the sound provided with the slideshow.";
  }
}

const COULEURS_EN: Record<string, string> = {
  blanc: "white", noir: "black", gris: "grey", rouge: "red", orange: "orange",
  jaune: "yellow", vert: "green", bleu: "blue", violet: "purple", rose: "pink",
};

/**
 * Brouillon prêt à relire : la remarque-type de chaque famille (avec sa vidéo
 * tuto côté file), suivie des constats précis. `remarques` garde le même format
 * que `reviews.remarques`, pour que le compteur « 3× » par créateur continue de
 * marcher quand la review sera envoyée.
 */
export function redigerBrouillon(defauts: Defaut[], remarquesTypes: RemarqueType[]): {
  texte: string;
  remarques: Array<{ id: string; titre: string }>;
} {
  if (defauts.length === 0) return { texte: "", remarques: [] };
  const trouver = (re: RegExp) => remarquesTypes.find((r) => re.test(r.titre));
  const utilisees: RemarqueType[] = [];
  const bonjour = trouver(/hello/i);
  if (bonjour) utilisees.push(bonjour);
  for (const d of defauts) {
    const re = REMARQUE_DU_CODE[d.code];
    const r = re ? trouver(re) : undefined;
    if (r && !utilisees.includes(r)) utilisees.push(r);
  }
  const paragraphes = utilisees.map((r) => r.corps.trim());
  paragraphes.push(defauts.map(phraseAnglaise).join("\n"));
  return {
    texte: paragraphes.join("\n\n"),
    remarques: utilisees.map((r) => ({ id: r.id, titre: r.titre })),
  };
}
