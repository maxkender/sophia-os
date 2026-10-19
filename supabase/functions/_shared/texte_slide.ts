/**
 * Texte d'une slide importée : ce qu'on recopie, et ce que le nettoyage efface.
 *
 * LE PROBLÈME. L'OCR recopiait tout le texte visible, stickers compris : la
 * carte App Store « QuizLocky - Study App Blocker / GET / Pass a quiz to
 * unlock -> » finissait dans la légende, puis traduite dans chaque langue.
 * Côté image, les modèles « text-removal » (fal, Replicate) effacent TOUT le
 * texte sans consigne possible : stickers vidés de leur texte, page de recette
 * manuscrite rendue blanche alors que la légende dit « voici ma recette »
 * (#questions, 10/10).
 *
 * LA RÈGLE, la même des deux côtés :
 *   - la LÉGENDE (texte tapé par la créatrice pour porter le message) est
 *     recopiée, puis effacée de l'image ;
 *   - les STICKERS (emoji, badges, cartes d'app, logos, watermarks…) ne sont
 *     pas recopiés, et le nettoyage les retire en entier ;
 *   - le texte du DÉCOR (écriture sur papier, livre, panneau, emballage…) n'est
 *     pas recopié, et le nettoyage le laisse tel quel ;
 *   - l'INTERFACE (barre de statut, boutons TikTok) n'est ni recopiée ni gardée.
 */

export type TypeBloc = "legende" | "sticker" | "decor" | "interface";

export interface BlocTexte {
  type: TypeBloc;
  texte: string;
}

export interface LectureSlide {
  /** Texte à poser sur la slide : les blocs « legende », dans l'ordre de lecture. */
  legende: string;
  /** Tous les blocs lus, écartés compris (pour les journaux). */
  blocs: BlocTexte[];
}

/** Gemini, image jointe : lecture classée de la slide. Réponse JSON, voir `parserLectureSlide`. */
export const PROMPT_LECTURE_SLIDE =
  `Tu lis une slide TikTok (une photo + le texte que la créatrice a tapé par-dessus) pour en recopier la LÉGENDE.

Découpe tout le texte visible en blocs et classe chaque bloc :
- "legende" : texte ajouté par la créatrice pour porter le message de la slide (accroche, titre, phrase, liste, conseil), quel que soit son style : texte TikTok avec contour ou ombre, texte sur fond coloré, ou message écrit dans une note collée qui sert de texte à la slide.
- "sticker" : texte d'un élément collé qui n'est pas le message : emoji, badge, étiquette décorative, icône ou nom d'app sous son icône, carte App Store ou Google Play, bouton (GET, Obtenir, Download, Installer), note en étoiles, prix, logo, watermark, @pseudo, capture d'écran d'une app ou d'un site.
- "decor" : texte qui existe physiquement dans la scène photographiée : écriture à la main ou impression sur papier, page de cahier ou de livre, tableau, panneau, emballage, vêtement, écran filmé dans la scène.
- "interface" : interface du téléphone ou de TikTok (barre de statut, boutons, barre de recherche, compteurs).

Dans le doute entre "legende" et "sticker" : si le texte fait partie de la phrase de la créatrice, c'est "legende" ; s'il nomme ou vend une app, un produit ou un compte sans faire partie de sa phrase, c'est "sticker".
Exception : si la slide présente un livre, un podcast, un film ou une app et que son NOM n'apparaît que sur un sticker ou dans le décor, ajoute un bloc "legende" avec ce nom seul.

"texte" = transcription EXACTE en langue d'origine, sans corriger ni traduire, retours à la ligne et emojis compris.
Liste les blocs dans l'ordre de lecture (haut vers bas, puis gauche vers droite).

Réponds UNIQUEMENT par ce JSON, rien avant ni après :
{"blocs":[{"type":"legende","texte":"..."}]}
Réponds {"blocs":[]} si la slide ne contient aucun texte.`;

/**
 * Dernier recours quand la lecture classée ne rend pas de JSON exploitable :
 * l'ancienne transcription en texte libre, avec la même liste d'exclusions.
 */
export const PROMPT_LECTURE_SLIDE_TEXTE_LIBRE =
  `Transcris exactement le texte que la créatrice a incrusté sur cette slide TikTok,
en langue d'origine, sans le corriger ni le traduire.

Ignore : stickers, emojis, badges, icônes et cartes d'app (App Store, Google Play,
boutons GET / Download), logos, watermarks, @pseudos, captures d'écran collées,
texte du décor (écriture sur papier, livre, panneau, emballage, vêtement),
barre de statut du téléphone. Garde le nom d'une app/d'un podcast si c'est le
sujet de la slide.

Si la slide ne contient aucun texte incrusté, réponds exactement : (aucun texte)`;

/**
 * FLUX Kontext Pro (fal, Replicate), image jointe : retire la légende et les
 * stickers, garde le décor. Remplace les applis « text-removal », même modèle
 * mais consigne figée « retire tout le texte ». Surchargeable par
 * `reglages.nettoyage.prompt` sans redéployer.
 */
export const PROMPT_NETTOYAGE =
  `Remove the caption text that was typed on top of this photo: every TikTok-style text overlay, including its outline, shadow and any colored box behind it. Also remove every small element pasted on top of the photo, in full: stickers, emojis, badges, app icons, App Store or Google Play cards, buttons, logos, watermarks, usernames and pasted screenshots. Fill each removed area with what the photo naturally shows behind it, matching the surrounding texture, lighting and perspective. Change nothing else: keep the main subject, people, objects, colors, framing and image quality exactly the same, and keep any writing that physically belongs to the photographed scene (handwriting or print on paper, notebook and book pages, whiteboards, signs, packaging, clothing) exactly as it is.`;

/** Valeurs de `type` rencontrées ou plausibles, ramenées aux quatre familles. */
const SYNONYMES: Record<string, TypeBloc> = {
  legende: "legende",
  caption: "legende",
  overlay: "legende",
  titre: "legende",
  title: "legende",
  texte: "legende",
  text: "legende",
  message: "legende",
  corps: "legende",
  sticker: "sticker",
  stickers: "sticker",
  autocollant: "sticker",
  emoji: "sticker",
  badge: "sticker",
  logo: "sticker",
  watermark: "sticker",
  filigrane: "sticker",
  app: "sticker",
  carte: "sticker",
  card: "sticker",
  bouton: "sticker",
  button: "sticker",
  capture: "sticker",
  screenshot: "sticker",
  pseudo: "sticker",
  username: "sticker",
  decor: "decor",
  scene: "decor",
  manuscrit: "decor",
  handwriting: "decor",
  papier: "decor",
  livre: "decor",
  book: "decor",
  panneau: "decor",
  sign: "decor",
  emballage: "decor",
  vetement: "decor",
  interface: "interface",
  ui: "interface",
  statut: "interface",
  status: "interface",
};

/**
 * Famille d'un bloc. Inconnue → "legende" : avant cette lecture classée, tout
 * le texte était gardé ; un type inattendu ne doit pas faire perdre la légende.
 */
export function typeBloc(brut: unknown): TypeBloc {
  const cle = String(brut ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
  if (SYNONYMES[cle]) return SYNONYMES[cle];
  const tete = cle.split(/[^a-z]+/).find((mot) => SYNONYMES[mot]);
  return tete ? SYNONYMES[tete] : "legende";
}

/** Le premier objet ou tableau JSON de la réponse, bloc de code ```json compris. */
function extraireJson(reponse: string): unknown {
  const sansClotures = reponse.replace(/```(?:json)?/gi, "");
  for (const [ouvre, ferme] of [["{", "}"], ["[", "]"]] as const) {
    const debut = sansClotures.indexOf(ouvre);
    const fin = sansClotures.lastIndexOf(ferme);
    if (debut < 0 || fin <= debut) continue;
    try {
      return JSON.parse(sansClotures.slice(debut, fin + 1));
    } catch {
      // essaie la forme suivante
    }
  }
  return undefined;
}

/**
 * Lit la réponse de `PROMPT_LECTURE_SLIDE`. Accepte {"blocs":[…]},
 * {"blocks":[…]} ou un tableau nu. `null` = réponse inexploitable (l'appelant
 * redemande) ; « (aucun texte) » et {"blocs":[]} = slide sans texte.
 */
export function parserLectureSlide(reponse: string): LectureSlide | null {
  const brut = reponse.trim();
  if (brut === "(aucun texte)") return { legende: "", blocs: [] };

  const data = extraireJson(brut);
  const liste = Array.isArray(data)
    ? data
    : data && typeof data === "object"
      ? (data as Record<string, unknown>).blocs ?? (data as Record<string, unknown>).blocks
      : undefined;
  if (!Array.isArray(liste)) return null;

  const blocs: BlocTexte[] = [];
  for (const item of liste) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Record<string, unknown>;
    const texte = String(raw.texte ?? raw.text ?? "")
      .replace(/\r\n?/g, "\n")
      .trim();
    if (!texte) continue;
    blocs.push({ type: typeBloc(raw.type ?? raw.categorie ?? raw.role), texte });
  }

  const legende = blocs
    .filter((b) => b.type === "legende")
    .map((b) => b.texte)
    .join("\n\n");
  return { legende, blocs };
}

/** Résumé des blocs écartés pour les journaux : `sticker×2, decor×1`, ou "". */
export function resumeEcartes(blocs: BlocTexte[]): string {
  const compte = new Map<TypeBloc, number>();
  for (const b of blocs) {
    if (b.type !== "legende") compte.set(b.type, (compte.get(b.type) ?? 0) + 1);
  }
  return [...compte].map(([type, n]) => `${type}×${n}`).join(", ");
}

/**
 * Consigne de nettoyage tirée de `reglages.nettoyage` :
 *   - `mode: "tout_texte"` → `null`, retour aux applis « text-removal » ;
 *   - sinon `prompt` s'il est renseigné, à défaut `PROMPT_NETTOYAGE`.
 */
export function consigneNettoyage(valeur: unknown): string | null {
  const v = (valeur && typeof valeur === "object" ? valeur : {}) as {
    mode?: unknown;
    prompt?: unknown;
  };
  if (v.mode === "tout_texte") return null;
  const prompt = typeof v.prompt === "string" ? v.prompt.trim() : "";
  return prompt || PROMPT_NETTOYAGE;
}
