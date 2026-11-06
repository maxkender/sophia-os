// Données d'une langue : le script (textes, repères, voix, textes de l'appli) et les deux voix off horodatées.

export type Repere = {mot: string; image: number; ou?: 'debut' | 'fin'};
export type Segment = {t?: string; m?: string}; // texte normal, ou passage surligné
export type Question = {q: string; options: string[]; bonne: number; fait: string};

export type TextesAppli = {
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
  scenes: {id: string; texte: string; reperes?: Repere[]}[];
  outro: {texte: string};
  legende?: string;
  appli: TextesAppli;
};

export type Voix = {texte: string; caracteres: string[]; debuts: number[]; fins: number[]};
export type DonneesLangue = {code: string; script: ScriptLangue; recit: Voix; outro: Voix};
