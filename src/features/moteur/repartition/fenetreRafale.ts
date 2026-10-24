/**
 * La fenêtre anti-rafale, pendant une projection.
 *
 * POURQUOI ELLE EXISTE. `stats_choix_label` (0287) rend `recents_langue` et
 * `recence_langue` : combien des `fenetre` derniers comptes de la langue
 * portent ce label, et à quel point le plus récent d'entre eux est récent
 * (`fenetre + 1 − rang`, donc 3 pour le dernier compte créé, 0 hors fenêtre).
 * Le moteur s'en sert pour deux choses : une BARRIÈRE — un label vu au moins
 * `rafaleRecents` fois dans la fenêtre passe derrière tous les autres — et un
 * départage à égalité de retard.
 *
 * CE QUI ÉTAIT FAUX. La projection gelait ces deux chiffres sur toute la
 * série : les comptes qu'elle venait d'attribuer n'entraient jamais dans la
 * fenêtre. La barrière ne se déclenchait donc jamais, et un label pouvait
 * prendre dix tirages d'affilée là où le moteur l'aurait écarté au troisième.
 *
 * CE QU'ON SAIT ET CE QU'ON NE SAIT PAS. Des comptes DÉJÀ en base, la fonction
 * SQL ne rend que des agrégats : on connaît le rang du plus récent porteur de
 * chaque label (par `recence`), pas celui des porteurs plus anciens. On
 * reconstruit donc la fenêtre de départ par ce rang-là, exact, et on fait
 * décroître le reste d'un cran par tirage simulé — un tirage chasse un compte
 * réel de la fenêtre. Dès `fenetre` tirages, plus rien d'estimé : la fenêtre
 * est entièrement faite de comptes que la projection a posés.
 */
export interface FenetreRafale {
  /** Labels tirés par la projection, du plus récent au plus ancien. */
  tires: string[];
  /** Taille de la fenêtre, celle que la fonction SQL a utilisée. */
  taille: number;
}

export function fenetreVide(taille: number): FenetreRafale {
  return { tires: [], taille: Math.max(0, Math.floor(taille)) };
}

export function avecTirage(f: FenetreRafale, labelId: string): FenetreRafale {
  return { ...f, tires: [labelId, ...f.tires].slice(0, Math.max(f.taille, 0)) };
}

/**
 * Les deux chiffres du label après `tires.length` tirages.
 *
 * `recentsBase` et `recenceBase` sont ceux de la base. Le compte rendu est la
 * somme des porteurs simulés et de ceux de la base qui n'ont pas encore été
 * chassés ; la récence est celle du plus récent des deux, le simulé gagnant
 * toujours puisqu'il est postérieur.
 */
export function rafale(
  f: FenetreRafale,
  labelId: string,
  recentsBase: number,
  recenceBase: number,
): { recents: number; recence: number } {
  const taille = f.taille;
  if (taille <= 0) return { recents: 0, recence: 0 };
  const tires = f.tires.slice(0, taille);
  const simules = tires.filter((id) => id === labelId).length;
  const pousses = tires.length;

  // Ce qu'il reste des porteurs de la base : chaque tirage en chasse un.
  const restantsBase = Math.max(0, Math.min(recentsBase, taille - pousses));
  // Le rang du plus récent porteur de la base, décalé d'autant de tirages.
  const rangBase = recenceBase > 0 ? taille + 1 - recenceBase + pousses : 0;
  const recenceBaseDecalee = rangBase > 0 && rangBase <= taille ? taille + 1 - rangBase : 0;

  const premierSimule = tires.indexOf(labelId);
  const recenceSimulee = premierSimule >= 0 ? taille - premierSimule : 0;

  return {
    recents: Math.min(taille, simules + restantsBase),
    recence: Math.max(recenceSimulee, recenceBaseDecalee),
  };
}
