/**
 * Relecture automatique des posts publiés : la mise en forme du texte que le
 * créateur a retapé dans TikTok, comparée slide par slide à l'original.
 *
 * Le créateur reçoit des images propres et des textes à copier ; il retape
 * chaque texte dans l'éditeur de TikTok. C'est là que naissent les défauts que
 * l'admin relevait à la main dans /admin/file-reviews. Ce que montrent les
 * vidéos tuto des remarques-types :
 *
 *   - « Jutifier » (la justification) : dans l'éditeur de TikTok, la zone de
 *     texte a une LARGEUR FIXE. Le curseur de taille décide donc combien de mots
 *     tiennent sur une ligne, c'est-à-dire où les lignes se coupent ; le
 *     pincement, après « Done », agrandit ou réduit le bloc entier sans toucher
 *     aux retours à la ligne. Justifier comme l'original = retrouver ses lignes
 *     (autant de mots par ligne), puis pincer à la bonne taille.
 *   - « text not the same » : les réglages de style de l'éditeur (police
 *     Classic / Elegance / Neon…, effet contour ou fond, couleur).
 *   - « Corpus / head » : le titre dans sa propre zone de texte, plus grand que
 *     le paragraphe.
 *
 * Ce module est PUR (aucun appel réseau) : il parse la mesure renvoyée par
 * Gemini, juge chaque paire original / publié avec des règles chiffrées, agrège
 * à l'échelle du post et prépare le brouillon de review. L'IA mesure, les
 * règles jugent : même mesure → même verdict, et chaque seuil se recalibre ici.
 */

export type Role = "titre" | "corps";
export type Alignement = "gauche" | "centre" | "droite";
/** Effet de texte de l'éditeur TikTok (bouton « A ») : rien, contour, fond. */
export type Effet = "aucun" | "contour" | "fond";

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
  effet: Effet;
  gras: boolean;
  alignement: Alignement;
}

export interface MesureSlide {
  blocs: BlocTexte[];
  largeurPx: number;
  hauteurPx: number;
}

export type CodeDefaut =
  | "justification"
  | "largeur"
  | "taille"
  | "hierarchie"
  | "alignement"
  | "couleur"
  | "effet"
  | "gras"
  | "police"
  | "placement"
  | "texte_absent"
  | "nb_slides"
  | "musique";

/** « remarque » : peut partir dans la review ; « info » : pour l'admin seulement. */
export type Niveau = "remarque" | "info";

/** Ce qu'une paire de slides révèle, défaut ou non. */
export interface Constat {
  code: CodeDefaut;
  position: number;
  /** Phrase courte en français, pour l'admin. */
  detail: string;
  /** Valeurs utiles au brouillon (mots par ligne, sens de l'écart…). */
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
  niveau: Niveau;
  slides: number[];
  /** Part des slides comparables où l'écart est vu (1 pour les contrôles de post). */
  confiance: number;
  detail: string;
  valeurs?: Record<string, number | string>;
}

// ---------------------------------------------------------------------------
// Seuils — calibrés le 15/10 sur 10 posts relus à l'œil (docs/relecture-auto.md)
// ---------------------------------------------------------------------------

/**
 * Justification : largeur du paragraphe exprimée en hauteurs de ligne, publiée
 * ÷ originale. Le pincement ne la change pas, seul le curseur de taille la
 * change. En dessous, lignes trop courtes (le texte a été tapé trop gros puis
 * pincé) ; au-dessus, lignes trop longues.
 */
export const SEUIL_JUSTIF_COURTES = 0.75;
export const SEUIL_JUSTIF_LONGUES = 1.35;
/** En dessous (de chaque côté), le texte est trop court pour parler de paragraphe. */
export const SEUIL_JUSTIF_CARACTERES = 60;
/**
 * Taille à l'écran (le pincement) : hauteur de ligne rapportée à la largeur de
 * l'image. Volontairement large : on ne relève qu'un écart qui se voit au
 * premier coup d'œil.
 */
export const SEUIL_TAILLE_MIN = 0.7;
export const SEUIL_TAILLE_MAX = 1.4;
/** Le titre de l'original est plus grand que son corps d'au moins ce facteur. */
export const SEUIL_HIERARCHIE = 1.15;
/**
 * Largeur du paragraphe sur l'écran (ses marges), publiée ÷ originale. Les
 * mêmes retours à la ligne en plus gros donnent un paragraphe qui mange les
 * marges : c'est aussi de la justification pour l'admin, et ça se corrige en
 * pinçant. Au-delà de ±15 %, ça se voit (cas klara.mudrost149 du 15/10 :
 * 44 % → 52 % de l'écran, mêmes lignes).
 */
export const SEUIL_LARGEUR_MIN = 0.85;
export const SEUIL_LARGEUR_MAX = 1.15;
/**
 * …et seulement si les lettres sont elles aussi plus grosses (ou plus petites)
 * d'au moins 10 % : un paragraphe plus large à taille égale vient d'une
 * traduction plus longue (cas hugo.notes813 du 15/10), pas d'un pincement, et
 * « pince pour réduire » rendrait les lettres trop petites.
 */
export const ECART_TAILLE_LARGEUR = 0.1;
/** Écart vertical du centre du texte, en fraction de la hauteur (info admin). */
export const SEUIL_PLACEMENT = 0.25;
/** Au plus autant de points dans une review : au-delà, le créateur décroche. */
export const MAX_POINTS_REVIEW = 2;

/** Ce qui peut partir dans la review, du plus important au moins important. */
const PRIORITE: CodeDefaut[] = [
  "texte_absent", "justification", "largeur", "hierarchie", "taille", "alignement", "couleur", "effet",
  "nb_slides", "musique",
];
/** Mesuré, montré à l'admin, jamais envoyé : la mesure est trop fragile ou l'écart secondaire. */
const INFO: CodeDefaut[] = ["gras", "police", "placement"];

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
- couleur : couleur de remplissage des lettres en #RRGGBB (pas le contour, pas le fond)
- effet : "contour" si chaque lettre a un contour ou une ombre nette, "fond" si le texte est posé sur un fond (bandeau, pastille, encadré plein ou translucide), "aucun" sinon
- gras : true si les lettres sont nettement grasses
- alignement : "gauche", "centre" ou "droite", d'après les bords des lignes

Enfin, compare les deux images :
- police_identique : true si B utilise la même police que A (même famille de caractères ET même graisse), false sinon

Réponds UNIQUEMENT par un objet JSON, sans texte autour :
{"a":[{"role":"titre","x":0.1,"y":0.3,"w":0.8,"h":0.06,"lignes":1,"texte":"...","couleur":"#FFFFFF","effet":"aucun","gras":true,"alignement":"centre"}],"b":[...],"police_identique":true}`;

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

function effetDe(item: Record<string, unknown>): Effet {
  const s = String(item.effet ?? item.effect ?? "").toLowerCase();
  if (s.startsWith("f") || s.startsWith("b")) return "fond";
  if (s.startsWith("c") || s.startsWith("o") || s.startsWith("s")) return "contour";
  if (s.startsWith("a") || s.startsWith("n")) return "aucun";
  // Ancien format : un booléen de contour.
  return vrai(item.contour ?? item.ombre) ? "contour" : "aucun";
}

/** Lignes non vides de la transcription. */
export function lignesTexte(texte: string): string[] {
  return texte.split(/\n/).map((l) => l.trim()).filter(Boolean);
}

/**
 * Caractères de la ligne la plus longue : la longueur d'une ligne pleine, qui
 * fixe la largeur du bloc. Une moyenne serait faussée par les fins de phrase
 * courtes, plus ou moins nombreuses selon la langue de la traduction.
 */
export function ligneLaPlusLongue(texte: string): number {
  return Math.max(0, ...lignesTexte(texte).map((l) => l.length));
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
    effet: effetDe(item),
    gras: vrai(item.gras ?? item.bold),
    alignement: alignementDe(item.alignement ?? item.align),
  };
}

/** Blocs relus depuis la base (relecture sans nouvel appel à Gemini). */
export function normaliserBlocs(raw: unknown): BlocTexte[] {
  return (Array.isArray(raw) ? raw : []).map(parserBloc).filter((b): b is BlocTexte => b !== null);
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

/**
 * Le paragraphe principal : le plus grand bloc, sauf si un bloc « corps » pèse
 * au moins 40 % de celui-ci (on préfère alors le corps au titre). Un petit
 * sous-titre ne doit pas passer pour le texte de la slide.
 */
export function blocPrincipal(blocs: BlocTexte[]): BlocTexte | null {
  const plusGrand = blocs.reduce<BlocTexte | null>((m, b) => (!m || aire(b) > aire(m) ? b : m), null);
  if (!plusGrand) return null;
  const corps = blocs
    .filter((b) => b.role === "corps" && aire(b) >= 0.4 * aire(plusGrand))
    .sort((p, q) => aire(q) - aire(p));
  return corps[0] ?? plusGrand;
}

function titreAuDessus(blocs: BlocTexte[], corps: BlocTexte): BlocTexte | null {
  const titres = blocs.filter((b) => b.role === "titre" && b !== corps && b.y < corps.y);
  return titres.sort((p, q) => q.y - p.y)[0] ?? null;
}

/** Hauteur d'une ligne en pixels. */
function hauteurLignePx(b: BlocTexte, m: MesureSlide): number {
  return (b.h * m.hauteurPx) / b.lignes;
}

/**
 * Taille à l'écran : hauteur d'une ligne rapportée à la LARGEUR de l'image (dans
 * TikTok, la taille se juge par rapport à la largeur de l'écran, et les deux
 * images n'ont pas toujours le même format).
 */
export function hauteurLigne(b: BlocTexte, m: MesureSlide): number {
  return hauteurLignePx(b, m) / m.largeurPx;
}

/**
 * Justification : largeur du paragraphe en hauteurs de ligne. Le pincement
 * agrandit largeur et hauteur de ligne ensemble, ce rapport ne bouge pas ;
 * seul le curseur de taille (où se coupent les lignes) le change.
 */
export function largeurEnLignes(b: BlocTexte, m: MesureSlide): number {
  return (b.w * m.largeurPx) / hauteurLignePx(b, m);
}

/** Famille de couleur : les nuances proches (blanc / blanc cassé / crème) se confondent. */
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

const EFFET_FR: Record<Effet, string> = { aucun: "sans effet", contour: "avec contour", fond: "sur un fond" };

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

  // Justification : la longueur des lignes, indépendamment de la taille. On
  // ne compare JAMAIS le nombre de lignes : le texte est traduit, une version
  // plus longue fait naturellement plus de lignes de la même largeur.
  // Il faut un vrai paragraphe des deux côtés (une accroche de deux mots par
  // ligne se coupe comme l'auteur l'a voulu) et que la ligne la plus longue,
  // en caractères, confirme l'écart : une mesure de boîte ratée ne suffit pas.
  const charsA = lignesTexte(pa.texte).join(" ").length;
  const charsB = lignesTexte(pb.texte).join(" ").length;
  if (
    pa.lignes >= 2 && pb.lignes >= 2 && Math.max(pa.lignes, pb.lignes) >= 3 &&
    charsA >= SEUIL_JUSTIF_CARACTERES && charsB >= SEUIL_JUSTIF_CARACTERES
  ) {
    evalues.push("justification");
    const j = largeurEnLignes(pb, b) / largeurEnLignes(pa, a);
    const ligneA = ligneLaPlusLongue(pa.texte), ligneB = ligneLaPlusLongue(pb.texte);
    const confirme = ligneB / Math.max(1, ligneA);
    const valeurs = { car_ligne_original: ligneA, car_ligne_publie: ligneB, j: arrondi(j) };
    if (j < SEUIL_JUSTIF_COURTES && confirme < 0.85) {
      ajouter("justification", `lignes trop courtes, le paragraphe fait colonne : ligne la plus longue de ${ligneB} caractères contre ${ligneA} dans l'original`, { ...valeurs, sens: "courtes" });
    } else if (j > SEUIL_JUSTIF_LONGUES && confirme > 1.2) {
      ajouter("justification", `lignes trop longues : ligne la plus longue de ${ligneB} caractères contre ${ligneA} dans l'original`, { ...valeurs, sens: "longues" });
    }
  }

  // Largeur du paragraphe sur l'écran (les marges), quand les lignes se
  // coupent comme dans l'original : le bloc a été pincé trop grand ou trop petit.
  const ratioTaille = hauteurLigne(pb, b) / hauteurLigne(pa, a);
  if (pa.lignes >= 2 && pb.lignes >= 2) {
    evalues.push("largeur");
    const justifRelevee = constats.some((c) => c.code === "justification");
    const ratio = pb.w / pa.w;
    const valeurs = { ratio: arrondi(ratio), part_original: Math.round(pa.w * 100), part_publie: Math.round(pb.w * 100) };
    if (!justifRelevee && ratio > SEUIL_LARGEUR_MAX && ratioTaille >= 1 + ECART_TAILLE_LARGEUR) {
      ajouter("largeur", `paragraphe plus large que l'original, marges plus étroites : ${valeurs.part_publie} % de la largeur de l'écran contre ${valeurs.part_original} %`, { ...valeurs, sens: "large" });
    } else if (!justifRelevee && ratio < SEUIL_LARGEUR_MIN && ratioTaille <= 1 - ECART_TAILLE_LARGEUR) {
      ajouter("largeur", `paragraphe plus étroit que l'original, marges plus larges : ${valeurs.part_publie} % de la largeur de l'écran contre ${valeurs.part_original} %`, { ...valeurs, sens: "etroit" });
    }
  }

  // Taille à l'écran (le pincement).
  evalues.push("taille");
  if (ratioTaille < SEUIL_TAILLE_MIN || ratioTaille > SEUIL_TAILLE_MAX) {
    const sens = ratioTaille > 1 ? "plus grand" : "plus petit";
    ajouter("taille", `texte nettement ${sens} que l'original (×${arrondi(ratioTaille, 1)})`, { ratio: arrondi(ratioTaille), sens });
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
      if (!distinctB) ajouter("hierarchie", "titre et paragraphe à la même taille, dans le même style");
    }
  }

  // Style du paragraphe principal : couleur et effet (envoyés), graisse et police (info).
  evalues.push("couleur", "effet", "gras");
  const famA = familleCouleur(pa.couleur), famB = familleCouleur(pb.couleur);
  if (famA !== famB) ajouter("couleur", `texte ${famB} au lieu de ${famA}`, { original: famA, publie: famB });
  if (pa.effet !== pb.effet) {
    ajouter("effet", `texte ${EFFET_FR[pb.effet]} au lieu de ${EFFET_FR[pa.effet]}`, { original: pa.effet, publie: pb.effet });
  }
  if (pa.gras !== pb.gras) {
    ajouter("gras", pb.gras ? "texte en gras, l'original ne l'est pas" : "gras de l'original perdu", { original: String(pa.gras), publie: String(pb.gras) });
  }
  if (policeIdentique !== null) {
    evalues.push("police");
    if (!policeIdentique) ajouter("police", "police ou graisse peut-être différente de l'original (à vérifier)");
  }

  // Alignement du paragraphe principal, s'il a un sens (2 lignes ou plus de chaque côté).
  if (pa.lignes >= 2 && pb.lignes >= 2) {
    evalues.push("alignement");
    if (pa.alignement !== pb.alignement) {
      ajouter("alignement", `aligné ${pb.alignement === "centre" ? "au centre" : `à ${pb.alignement}`} au lieu de ${pa.alignement === "centre" ? "au centre" : `à ${pa.alignement}`}`, { original: pa.alignement, publie: pb.alignement });
    }
  }

  // Placement vertical de l'ensemble du texte (info).
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
 * Une mesure ratée sur une slide ne suffit donc pas à faire une remarque.
 *
 * Exception : l'alignement. Souvent seule l'accroche a un alignement propre
 * (à gauche quand le reste est centré) : une slide suffit.
 */
const VU_SUR_UNE_SLIDE: CodeDefaut[] = ["alignement"];

export function agreger(jugements: JugementPaire[]): Defaut[] {
  const evalues = new Map<CodeDefaut, number>();
  for (const j of jugements) for (const code of j.evalues) evalues.set(code, (evalues.get(code) ?? 0) + 1);
  // Des lignes trop courtes ici et trop longues là ne font pas un défaut qui se répète.
  const parCle = new Map<string, Constat[]>();
  for (const j of jugements) {
    for (const c of j.constats) {
      const cle = `${c.code}:${c.valeurs?.sens ?? ""}`;
      parCle.set(cle, [...(parCle.get(cle) ?? []), c]);
    }
  }
  const defauts: Defaut[] = [];
  for (const constats of parCle.values()) {
    const code = constats[0].code;
    const n = evalues.get(code) ?? constats.length;
    const vus = constats.length;
    if (!VU_SUR_UNE_SLIDE.includes(code) && (vus / n < 0.5 || vus < Math.min(2, n))) continue;
    const premier = constats[0];
    defauts.push({
      code,
      niveau: INFO.includes(code) ? "info" : "remarque",
      slides: constats.map((c) => c.position).sort((p, q) => p - q),
      confiance: arrondi(vus / n),
      detail: premier.detail,
      valeurs: premier.valeurs,
    });
  }
  // Un paragraphe plus large et des lettres plus grosses, c'est le même geste
  // (pincer) : un seul point.
  const sensLargeur = defauts.find((d) => d.code === "largeur")?.valeurs?.sens;
  const doublon = (d: Defaut) =>
    d.code === "taille" &&
    ((sensLargeur === "large" && d.valeurs?.sens === "plus grand") ||
      (sensLargeur === "etroit" && d.valeurs?.sens === "plus petit"));
  return trier(defauts.filter((d) => !doublon(d)));
}

function rang(code: CodeDefaut): number {
  const i = PRIORITE.indexOf(code);
  return i >= 0 ? i : PRIORITE.length + INFO.indexOf(code);
}

export function trier(defauts: Defaut[]): Defaut[] {
  return [...defauts].sort((p, q) => rang(p.code) - rang(q.code));
}

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
      niveau: "remarque",
      slides: [],
      confiance: 1,
      detail: `${input.slidesPubliees} slides publiées au lieu de ${input.slidesAttendues}`,
      valeurs: { publie: input.slidesPubliees, attendu: input.slidesAttendues },
    });
  }
  if (input.musiqueAttendueId && input.musiquePublieeId && input.musiqueAttendueId !== input.musiquePublieeId) {
    out.push({ code: "musique", niveau: "remarque", slides: [], confiance: 1, detail: "le son n'est pas celui fourni" });
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
 * (ce sont elles qui montrent la justification). Jamais la slide de
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
  /** Vidéo tuto jointe à la review quand la remarque est utilisée. */
  video_url?: string | null;
}

/** Remarque-type de la file (et sa vidéo tuto) qui couvre chaque défaut, retrouvée par son titre. */
const REMARQUE_DU_CODE: Partial<Record<CodeDefaut, RegExp>> = {
  justification: /justif|jutif/i,
  largeur: /justif|jutif/i,
  taille: /not the same|style/i,
  couleur: /not the same|style/i,
  effet: /not the same|style/i,
  hierarchie: /corpus|head/i,
};

function slidesEn(slides: number[]): string {
  if (slides.length === 0) return "";
  if (slides.length === 1) return `slide ${slides[0]}`;
  return `slides ${slides.slice(0, -1).join(", ")} and ${slides[slides.length - 1]}`;
}

const COULEURS_EN: Record<string, string> = {
  blanc: "white", noir: "black", gris: "grey", rouge: "red", orange: "orange",
  jaune: "yellow", vert: "green", bleu: "blue", violet: "purple", rose: "pink",
};
const EFFETS_EN: Record<string, string> = {
  aucun: "plain, with no outline or background",
  contour: "with an outline around the letters",
  fond: "on a background box",
};
const ALIGN_EN: Record<string, string> = { gauche: "left-aligned", centre: "centered", droite: "right-aligned" };

/**
 * Un point de review, comme l'écrirait un manager : ce qui se voit, puis le
 * geste exact dans l'éditeur de TikTok. Jamais de ratio ni de pourcentage.
 */
export function pointAnglais(d: Defaut): string {
  const sur = d.slides.length ? `On ${slidesEn(d.slides)}, ` : "";
  const v = d.valeurs ?? {};
  switch (d.code) {
    case "justification": {
      // Le geste est peu connu des créateurs : le curseur de taille n'apparaît
      // qu'en touchant le texte, sur le bord droit (vidéo tuto « Jutifier »).
      // Jamais de nombre de lignes à viser : le texte est traduit.
      const longues = v.sens === "longues";
      return [
        longues
          ? `${sur}your lines are longer than in the original, so the text looks stretched. Here's how to fix it:`
          : `${sur}your lines are shorter than in the original, so the paragraph looks like a thin column. Here's how to fix it:`,
        "1. Tap your text to edit it.",
        longues
          ? "2. A small slider appears on the right edge of the screen (a white dot on a thin line). Slide the dot up: the letters get bigger and fewer words fit on each line."
          : "2. A small slider appears on the right edge of the screen (a white dot on a thin line). Slide the dot down: the letters get smaller and more words fit on each line.",
        "3. Stop when your lines look about as long as in the original, then tap Done.",
        longues
          ? "4. If the text is now too big, pinch it with two fingers to make it smaller. This keeps your line breaks."
          : "4. If the text is now too small, spread two fingers on it to make it bigger. This keeps your line breaks.",
        "Your text is translated, so you may not get the same number of lines, and that's fine.",
      ].join("\n");
    }
    case "largeur":
      return v.sens === "etroit"
        ? `${sur}your paragraph is narrower than in the original, with more empty space on each side. Spread two fingers on the text to make it a bit bigger, until the space on each side is the same as in the original.`
        : `${sur}your paragraph is wider than in the original: the text goes closer to the edges of the screen. Pinch the text with two fingers to make it a bit smaller, until the space on each side is the same as in the original.`;
    case "taille":
      return v.sens === "plus grand"
        ? `${sur}the text is clearly bigger than in the original and covers more of the picture. Pinch it down a little so it takes the same space as in the original.`
        : `${sur}the text is clearly smaller than in the original, so it is harder to read on a phone. Pinch it up a little so it takes the same space as in the original.`;
    case "hierarchie":
      return `${sur}the title and the paragraph look the same. Put the title in its own text box, a bit bigger than the paragraph, like in the original.`;
    case "alignement":
      return `${sur}the text is ${ALIGN_EN[String(v.publie)]} while the original is ${ALIGN_EN[String(v.original)]}. Tap the alignment button (the lines icon at the top of the text editor) until it matches.`;
    case "couleur":
      return `${sur}the text is ${COULEURS_EN[String(v.publie)] ?? v.publie} while the original is ${COULEURS_EN[String(v.original)] ?? v.original}. Pick the same color in the color row of the text editor.`;
    case "effet":
      return `${sur}the original text is ${EFFETS_EN[String(v.original)]}, yours is ${EFFETS_EN[String(v.publie)]}. Tap the A button at the top of the text editor until you get the same style.`;
    case "texte_absent":
      return `${sur}there is no text. Please add the text provided for this slide.`;
    case "nb_slides":
      return `The post has ${v.publie} slides instead of ${v.attendu}. Please use all the images provided, in the same order.`;
    case "musique":
      return "Please use the sound provided with the slideshow, it is part of what makes these posts work.";
    default:
      return "";
  }
}

/**
 * Brouillon prêt à relire : au plus MAX_POINTS_REVIEW points, les plus
 * importants ; le reste est gardé pour l'admin. `remarques` garde le format
 * de `reviews.remarques` (compteur « 3× » par créateur, vidéos tuto jointes).
 * Ce brouillon est déjà lisible tel quel ; `relecture-auto` le fait ensuite
 * reformuler par Gemini pour qu'il sonne moins mécanique.
 */
export function redigerBrouillon(defauts: Defaut[], remarquesTypes: RemarqueType[]): {
  texte: string;
  remarques: Array<{ id: string; titre: string }>;
  points: Defaut[];
} {
  const points = trier(defauts.filter((d) => d.niveau === "remarque")).slice(0, MAX_POINTS_REVIEW);
  if (points.length === 0) return { texte: "", remarques: [], points: [] };
  const trouver = (re: RegExp) => remarquesTypes.find((r) => re.test(r.titre));
  const utilisees: RemarqueType[] = [];
  const bonjour = trouver(/hello/i);
  if (bonjour) utilisees.push(bonjour);
  for (const d of points) {
    const re = REMARQUE_DU_CODE[d.code];
    const r = re ? trouver(re) : undefined;
    if (r && !utilisees.includes(r)) utilisees.push(r);
  }
  const ouverture = points.length === 1
    ? "Hi! Thanks for your post. One small thing to make it match the original:"
    : "Hi! Thanks for your post. Two small things to make it match the original:";
  // La vidéo tuto de la remarque est jointe à la review : on y renvoie.
  const avecVideo = (d: Defaut) => {
    const re = REMARQUE_DU_CODE[d.code];
    const r = re ? trouver(re) : undefined;
    const texte = pointAnglais(d);
    return r?.video_url ? `${texte}\nThe short video with this message shows how to do it.` : texte;
  };
  const texte = [ouverture, ...points.map(avecVideo), "Keep it up!"].join("\n\n");
  return { texte, remarques: utilisees.map((r) => ({ id: r.id, titre: r.titre })), points };
}

/**
 * La reformulation de Gemini n'est gardée que si elle n'a rien perdu ni
 * inventé : mêmes numéros de slides, pas de chiffres techniques ni de nombre
 * de lignes, longueur raisonnable. Sinon on garde le brouillon déterministe.
 */
/** Mots du geste qu'une reformulation ne doit pas perdre. */
const GESTES = [/slider/i, /right edge/i, /white dot/i, /\bDone\b/, /pinch|spread two fingers/i, /alignment button/i, /\bA button\b/i, /color row/i, /video/i];

export function reformulationValide(brouillon: string, reformule: string): boolean {
  const texte = reformule.trim();
  if (texte.length < 40 || texte.length > Math.max(900, brouillon.length * 1.3)) return false;
  if (/%|×|\bratio\b|```/i.test(texte)) return false;
  // Jamais de nombre de lignes à viser : le texte est traduit.
  if (/\b\d+\s+(?:lines?|rows?)\b/i.test(texte)) return false;
  // Les gestes doivent survivre mot pour mot : c'est la partie que les créateurs ne connaissent pas.
  for (const mot of GESTES) {
    if (mot.test(brouillon) && !mot.test(texte)) return false;
  }
  const etapes = (t: string) => (t.match(/^\s*\d\.\s/gm) ?? []).length;
  if (etapes(texte) < etapes(brouillon)) return false;
  const numeros = (s: string) =>
    new Set([...s.matchAll(/slides?\s+((?:\d+(?:,?\s+and\s+|,\s*))*\d+)/gi)].flatMap((m) => m[1].match(/\d+/g) ?? []));
  const attendus = numeros(brouillon);
  const obtenus = numeros(texte);
  for (const n of attendus) if (!obtenus.has(n)) return false;
  for (const n of obtenus) if (!attendus.has(n)) return false;
  return true;
}

/** Consigne de reformulation (Gemini) : garder chaque fait et chaque geste, changer le ton. */
export const PROMPT_TON = `You are a friendly manager writing a short review to a TikTok creator (who may not be a native English speaker) about one of their slideshow posts.

Rewrite the draft below so it sounds like a real person wrote it: warm, encouraging, simple English, short sentences.

Rules:
- Keep every fact, every slide number and every instruction exactly (what to tap, which slider, pinch). Do not add new problems or new advice.
- No percentages, ratios or technical words.
- Never ask the creator to match the number of lines: the text is translated, so it can have more or fewer lines than the original. Talk about how long the lines are, not how many there are.
- Start with one short positive sentence, then the points, then a one-line friendly closing.
- If a point has numbered steps, keep them as numbered steps, one per line, with the same gestures in the same order (tap the text, the small slider on the right edge of the screen, the white dot, slide down or up, tap Done, pinch or spread two fingers). You may only make the wording simpler.
- Keep any sentence about the short video.
- At most 170 words.
- Return only the message. No quotes, no markdown, no subject line.

Draft:
`;
