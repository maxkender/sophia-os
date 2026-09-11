/** Catégories de sujets + styles de narration du master papier. */

export const PAPIER_CATEGORIES = [
  "aleatoire",
  "psychologie",
  "corps",
  "sommeil",
  "nourriture",
  "argent",
  "tech",
  "societe",
  "relations",
  "sport",
  "langage",
  "histoire",
  "faits_divers",
  "mythes",
  "science",
  "espace",
  "animaux",
  "geographie",
  "pop_culture",
  "origines",
  "personnages",
  "mysteres",
] as const;

export type PapierCategorie = (typeof PAPIER_CATEGORIES)[number];

export const PAPIER_STYLES_NARRATION = ["question", "revelation", "storytelling"] as const;
export type PapierStyleChoix = (typeof PAPIER_STYLES_NARRATION)[number];

export const CATEGORIE_BRIEF: Record<PapierCategorie, string> = {
  aleatoire:
    "Choisis le domaine le plus scrollable pour un mec de 16-30 ans sur TikTok (psychologie, corps, sommeil, bouffe, argent, tel, société, relations, sport, langage, ou un mythe/film/people que TOUT LE MONDE connaît). Sujet du quotidien, pas une thèse.",
  psychologie:
    "Psycho du quotidien : biais, habitudes, pourquoi tu procrastines, l'effet spectateur, pourquoi le temps file. Un truc que le viewer a VÉCU ce matin.",
  corps:
    "Corps humain : frissons, voix dans les stories, mal de crâne à la glace, tu ne peux pas te chatouiller. Sensation banale + vraie cause simple.",
  sommeil:
    "Sommeil et rêves : réveil 2 min avant l'alarme, paralysie, pourquoi on rêve qu'on tombe. Tout le monde le connaît.",
  nourriture:
    "Bouffe : piment, café, sucre, pourquoi tu as encore faim. Un aliment que le viewer a dans la cuisine.",
  argent:
    "Argent du quotidien : 9,99 €, pourboire, pourquoi tu cliques trop vite. Pas de Bourse, pas de macro-économie.",
  tech:
    "Téléphone, notifs, batterie, Wi-Fi, caméra frontale. Un geste que tu fais 50 fois par jour.",
  societe:
    "Normes sociales : tel dans l'ascenseur, on se serre la main, file d'attente. Le viewer doit se reconnaître.",
  relations:
    "Potes, crush, ghost, pourquoi tu relis tes messages. PG, pas de sexe explicite, pas de thérapie de couple.",
  sport:
    "Sport que tout le monde a fait au collège : point de côté, adrénaline, crampe, balle trop rapide. Pas un sport obscur.",
  langage:
    "Mots, expressions, pourquoi ta voix te dégoûte enregistrée, pourquoi on dit « à tes souhaits ». Français de tous les jours.",
  histoire:
    "Un événement que le viewer connaît DÉJÀ de nom (Titanic, Napoléon, mur de Berlin, 11 septembre). Un détail WTF, pas un volcan dont personne n'a entendu parler.",
  faits_divers:
    "Une affaire ou un fait bizarre que les gens ont déjà vu passer (pas un cold case de 1847). Punch simple.",
  mythes:
    "UNIQUEMENT les mythes de film / collège : vampires, sirènes, Zeus, loup-garou, Atlantide. INTERDIT : folklore local, yokai, légende que 0,1 % des gens connaissent.",
  science:
    "Science du quotidien : micro-ondes, aimant, savon, froid qui « brûle ». L'objet est sur le bureau ou dans la salle de bain.",
  espace:
    "Espace grand public : Lune, trou noir, Mars, ISS. Pas une mission ou une étoile dont le nom ne dit rien.",
  animaux:
    "Chiens, chats, requins, abeilles, dauphins. Pas un invertébré obscur.",
  geographie:
    "Un lieu que tout le monde saurait placer : Sahara, Everest, Amazonie, Japon, NYC. Pas un village ou un détroit inconnu.",
  pop_culture:
    "Film, série, jeu ou meme que le viewer a déjà vu. Une scène célèbre vs le vrai truc. Pas de marque dans les visuels.",
  origines:
    "D'où vient un objet du quotidien : Post-it, micro-ondes, fermeture éclair, frigo. L'objet, pas l'inventeur oublié.",
  personnages:
    "Quelqu'un dont le visage ou le nom est connu (Einstein, Ronaldo, Marilyn, Napoléon). Un fait simple, pas une anecdote d'historien.",
  mysteres:
    "Mystères CÉLÈBRES : pyramides, Bermuda, disparition d'un avion dont tout le monde a entendu parler. Ce qu'on sait vraiment, en simple.",
};

export const STYLE_NARRATION_AIDE: Record<PapierStyleChoix, string> = {
  question: "« Mais savez-vous vraiment pourquoi... ? »",
  revelation: "Indices, puis retournement final",
  storytelling: "On raconte la scène vécue",
};

export function estCategoriePapier(v: string): v is PapierCategorie {
  return (PAPIER_CATEGORIES as readonly string[]).includes(v);
}

export function estStyleChoix(v: string): v is PapierStyleChoix {
  return (PAPIER_STYLES_NARRATION as readonly string[]).includes(v);
}

export function normaliserCategorie(v: unknown): PapierCategorie {
  const s = String(v ?? "").trim();
  return estCategoriePapier(s) ? s : "aleatoire";
}

export function normaliserStyleChoix(v: unknown): PapierStyleChoix {
  const s = String(v ?? "").trim();
  return estStyleChoix(s) ? s : "revelation";
}
