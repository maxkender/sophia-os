// Données d'une langue : le script (textes, repères, voix, textes de l'appli) et les deux voix off horodatées.

export type Repere = {mot: string; image: number; ou?: 'debut' | 'fin'};

// ——— Style « géographie » : ce que la carte fait pendant une scène ———
/** Point sur la carte : [longitude, latitude] */
export type LonLat = [number, number];
/** Un cadrage : des pays à faire tenir à l'écran, ou un centre et un zoom (1 = le monde entier en largeur) */
export type Vue = {pays: string[]; marge?: number} | {centre: LonLat; zoom: number};
/** Moment d'apparition : un mot exact du texte de la scène (sinon le début de la scène) */
type Quand = {au?: string; fin?: boolean};
export type CouleurCarte = 'rouge' | 'bleu' | 'vert' | 'jaune' | 'orange' | 'violet' | 'gris' | 'noir';
export type Icone = 'ville' | 'explosion' | 'bateau' | 'armee' | 'montagne' | 'or' | 'drapeau' | 'personne' | 'usine' | 'petrole' | 'avion' | 'epingle' | 'couronne' | 'blé';
export type CarteScene = {
  vue?: Vue; // cadrage au début de la scène (vol de caméra depuis le cadrage précédent)
  vers?: Vue & Quand; // second cadrage pendant la scène (au mot donné)
  pays?: ({noms: string[]; couleur?: CouleurCarte} & Quand)[];
  points?: ({lieu: LonLat; icone?: Icone; couleur?: CouleurCarte} & Quand)[];
  // `par` : points de passage (un bateau qui contourne un continent) ; sinon un arc, plus ou moins courbé
  fleches?: ({de: LonLat; a: LonLat; par?: LonLat[]; couleur?: CouleurCarte; courbe?: number} & Quand)[];
  zones?: ({centre: LonLat; rayon_km: number; couleur?: CouleurCarte} & Quand)[];
  garde?: boolean; // garder ces éléments à l'écran jusqu'à la fin du récit (sinon ils s'effacent à la scène suivante)
};
export type Segment = {t?: string; m?: string}; // texte normal, ou passage surligné
export type Question = {q: string; options: string[]; bonne: number; fait: string};

export type TextesAppli = {
  /** Réécrire les textes de la capture même en anglais (capture composée, ou d'un autre cours) */
  recouvrir?: boolean;
  categorie: string;
  lectures: string;
  jours: string;
  commencer: string;
  onglets: string[];
  titre: string;
  description: string;
  lecon: {sousTitre: string; paragraphes: Segment[][]; continuer: string};
  quiz: {etiquette: string; bravo: string; questions: Question[]};
  fin: {titre: string; score: string; serie: string; xp: string; suivant: string; suivantTitre: string; bouton: string};
};

export type ScriptLangue = {
  langue: string;
  voix: {id: string; nom: string; modele: string; reglages: Record<string, unknown>};
  scenes: {id: string; texte: string; reperes?: Repere[]; carte?: CarteScene}[];
  outro: {texte: string};
  legende?: string;
  appli: TextesAppli;
};

export type Voix = {texte: string; caracteres: string[]; debuts: number[]; fins: number[]};
export type DonneesLangue = {code: string; script: ScriptLangue; recit: Voix; outro: Voix};
