// Transcription d'un post (posts/<id>.json) : les blocs de texte de chaque
// slide, avec leurs boîtes exactes (lues par geometrie.ts), le texte anglais
// d'origine et ses traductions, plus l'élément de LEUR appli à remplacer par
// UnSwipe. C'est le fichier que l'agent remplit.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { Langue } from "./api.ts";
import type { Boite, BlocGeo } from "./geometrie.ts";

export type Action = "traduire" | "garder" | "effacer";

export type BlocTexte = Omit<BlocGeo, "id"> & {
  id: string;
  /**
   * traduire (défaut) ; garder : texte universel laissé tel quel (« S+ », « A »,
   * « ? », « + ») ; effacer : filigrane @mentalapp, mention de leur appli.
   */
  action: Action;
  /**
   * Graisse : par défaut 200 (ExtraLight) pour un grand titre, 300 (Light)
   * sinon ; 400 ou 600 pour un mot en gras.
   */
  graisse?: 200 | 300 | 400 | 600;
  /**
   * Si la traduction n'a pas le même nombre de lignes que l'original : haut
   * (défaut, on ajoute dessous) ou bas (la dernière ligne reste en place, pour
   * une légende posée sur le bord d'une case).
   */
  ancre?: "haut" | "bas";
  /** Couleur imposée (« #rrggbb »), sinon celle lue sur la slide. */
  couleur_texte?: string;
  /** Le texte anglais d'origine, UNE chaîne par ligne détectée : il sert à caler la taille. */
  en: string[];
  /** Le texte par langue, ligne par ligne (en : le remake anglais, `en` par défaut). */
  textes: Partial<Record<Langue, string[]>>;
};

export type SlideTranscrite = { position: number; blocs: BlocTexte[] };

export type Transcription = {
  source_id: string;
  format: "tier-list" | "comparatif" | "guide" | "autre";
  /** L'accroche anglaise de la couverture (sert aussi à la note de pertinence). */
  titre: string;
  /** Légende TikTok de chaque langue, hashtags compris. */
  legendes: Partial<Record<Langue, string>>;
  /**
   * L'élément de LEUR appli (icône + « (check bio) »), remplacé par l'icône
   * UnSwipe et « delete short-videos (UnSwipe app) » : slide, boîte de l'icône,
   * id du bloc de sa légende. C'est la slide de l'app du deck.
   */
  app: { position: number; icone: Boite; legende: string } | null;
  slides: SlideTranscrite[];
  notes?: string;
};

export const cheminTranscription = (id: string) => `posts/${id}.json`;

export function lireTranscription(id: string): Transcription {
  const chemin = cheminTranscription(id);
  if (!existsSync(chemin)) throw new Error(`${chemin} absent : lance d'abord npm run geometrie -- ${id}`);
  return JSON.parse(readFileSync(chemin, "utf8")) as Transcription;
}

export function ecrireTranscription(t: Transcription) {
  writeFileSync(cheminTranscription(t.source_id), `${JSON.stringify(t, null, 1)}\n`);
}

/** Les textes de base d'un post, dans l'ordre de lecture (pour la note de pertinence de l'OS). */
export function textesAnglais(t: Transcription): string[] {
  return t.slides.flatMap((s) =>
    s.blocs.filter((b) => b.action === "traduire").map((b) => (b.textes.en ?? b.en).join(" ").trim()).filter(Boolean),
  );
}
