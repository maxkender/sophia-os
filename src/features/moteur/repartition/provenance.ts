/**
 * Les recrues que le moteur ne place pas.
 *
 * Une partie des créateurs arrive par le site, pas par un Head Manager, et
 * c'est le SITE qui choisit leur application, candidat par candidat. Décision
 * du 18/10 : c'est voulu, et ça doit le rester. Il n'y a pas de règle « ces
 * créateurs vont sur Sophia » ; il y a des recrues dont la destination est
 * déjà décidée quand le moteur les voit.
 *
 * TANT QUE LA PAGE L'IGNORE, ELLE MENT. Elle montre « 60 % Sophia, 25 %
 * Unswipe, 15 % Micabo » comme si les trois applications se disputaient chaque
 * recrue. En français, sur 30 jours glissants, 5 recrues sur 11 viennent du
 * site : 45 % des prochains comptes sont attribués avant que le moindre
 * classement ne tourne. Si ces 45 % partent tous sur Sophia, viser 30 % de
 * Sophia sur ce marché n'est pas ambitieux, c'est impossible.
 *
 * CE QUE FAIT CE MODULE. Trois choses, et rien d'autre :
 *
 *  1. mesurer la part des recrues qui échappent au moteur, et leur
 *     répartition RÉELLE entre applications (`partSite`) ;
 *  2. en déduire ce que le moteur devrait viser pour les recrues qu'il place
 *     vraiment (`cibleHorsSite`), et surtout DIRE quand la cible de l'admin
 *     est impossible ;
 *  3. étaler ces recrues sur une suite de tirages, et dire où chacune va
 *     (`estTirageSite`, `prochaineAppSite`).
 *
 * RIEN N'EST ÉCRIT EN DUR. La version précédente de ce module posait
 * « cohorte => Sophia » en constante. C'était faux : le site sait demander
 * Unswipe, et un 50/50 existe dans son contrat. On MESURE donc où ces recrues
 * vont, et la page suit toute seule si le site change d'avis.
 *
 * ATTENTION, PIÈGE : `cibleHorsSite` SERT À EXPLIQUER, PAS À CALCULER.
 * La projection (`simulerTirages`) reçoit la cible de l'admin TELLE QUELLE et
 * compte les comptes venus du site comme les autres. Sainte-Laguë se corrige
 * alors tout seul : chaque compte attribué par le site fait baisser le score
 * de son application, qui reçoit d'autant moins de recrues placées par le
 * moteur. Lui passer en plus une cible déjà corrigée corrigerait DEUX FOIS.
 *
 * Module pur, aucune lecture réseau, aucun effet de bord. Comme le reste du
 * dossier, il alimente la page Répartition et RIEN d'autre : `manage-users`
 * continue de lire la case cochée par le recruteur, et le site continue de
 * choisir pour ses candidats.
 */
import type { CibleApplications } from "./scoreApplication";

/** Recrues d'un marché sur la fenêtre, et ce que le site en a fait. */
export interface RecruesMarche {
  langue: string;
  pays: string | null;
  /** Comptes créés sur la fenêtre, servis par l'assignation. */
  recrues: number;
  /** Parmi eux, ceux d'un poster venu du site. */
  recruesSite: number;
  /**
   * Comment ces recrues-là se répartissent entre applications, en comptes
   * fractionnaires : `{ sophia: 5 }`, ou `{ sophia: 4, unswipe: 1 }` si le
   * site a commencé à en envoyer ailleurs. Vide quand il n'y en a aucune.
   */
  siteParApp: Record<string, number>;
}

/**
 * En dessous de ce nombre de recrues (sur la fenêtre, 30 jours), un marché ne
 * dit rien de fiable : c'est un « petit pays », il prend la part de la flotte.
 *
 * 1 sur 1 ferait « 100 % hors moteur » et verrouillerait tout le marché dans
 * la projection, sur la foi d'un seul compte. Le seuil était à 5 ; le 24/10,
 * l'Espagne (3 recrues du site sur 11) projetait 5 recrues du site sur les 20
 * suivantes, ce qu'Adrien jugeait très au-dessus de la réalité. Décision : les
 * petits pays prennent le taux de la flotte, et un pays n'est « grand » qu'à
 * 20 recrues sur 30 jours. La page affiche d'où vient le chiffre.
 */
export const RECRUES_MINIMUM_MARCHE = 20;

export interface PartSite {
  /** Part des recrues que le moteur ne place pas, entre 0 et 1. */
  part: number;
  /** Sur quoi elle est mesurée : ce marché, la flotte entière, ou rien. */
  base: "marche" | "flotte" | "aucune";
  /** Effectifs ayant servi au calcul, pour que la page montre l'échantillon. */
  recrues: number;
  recruesSite: number;
  /** Répartition de ces recrues entre applications, normalisée à 1. */
  parApp: Record<string, number>;
}

function normaliser(parApp: Record<string, number> | null | undefined): Record<string, number> {
  if (!parApp || typeof parApp !== "object") return {};
  const total = Object.values(parApp).reduce((a, b) => a + (b > 0 ? b : 0), 0);
  if (!(total > 0)) return {};
  const out: Record<string, number> = {};
  for (const [slug, v] of Object.entries(parApp)) if (v > 0) out[slug] = v / total;
  return out;
}

function borner(x: number): number {
  if (!Number.isFinite(x) || x <= 0) return 0;
  return x >= 1 ? 1 : x;
}

/**
 * La part des prochaines recrues que le moteur ne placera pas, sur un marché,
 * et où elles iront.
 *
 * On rend les EFFECTIFS avec la part : 5 sur 11 et 50 sur 110 valent le même
 * pourcentage et ne méritent pas la même confiance. C'est à la lecture de
 * trancher, et elle ne peut trancher que si elle voit les deux nombres.
 */
export function partSite(
  marche: RecruesMarche | undefined,
  flotte: readonly RecruesMarche[],
  seuil: number = RECRUES_MINIMUM_MARCHE,
): PartSite {
  if (marche && marche.recrues >= Math.max(1, seuil)) {
    return {
      part: borner(marche.recruesSite / marche.recrues),
      base: "marche",
      recrues: marche.recrues,
      recruesSite: marche.recruesSite,
      parApp: normaliser(marche.siteParApp),
    };
  }

  const recrues = flotte.reduce((a, m) => a + m.recrues, 0);
  const site = flotte.reduce((a, m) => a + m.recruesSite, 0);
  const cumul: Record<string, number> = {};
  for (const m of flotte) {
    for (const [slug, v] of Object.entries(m.siteParApp)) {
      cumul[slug] = (cumul[slug] ?? 0) + v;
    }
  }
  if (recrues <= 0) {
    return { part: 0, base: "aucune", recrues: 0, recruesSite: 0, parApp: {} };
  }
  return {
    part: borner(site / recrues),
    base: "flotte",
    recrues,
    recruesSite: site,
    parApp: normaliser(cumul),
  };
}

export interface CibleCorrigee {
  /**
   * Ce que le moteur devrait viser pour les recrues QU'IL PLACE, somme 100.
   * À AFFICHER, pas à passer à `simulerTirages` : voir l'en-tête du module.
   */
  parts: Record<string, number>;
  /** La cible de l'admin est-elle atteignable, recrues du site comprises ? */
  atteignable: boolean;
  /**
   * Par application, la part qu'on ne peut pas descendre : ce que le site
   * fournit déjà. En pourcentage de toutes les recrues.
   */
  planchers: Record<string, number>;
  /** La part hors moteur, en pourcentage, telle qu'affichée à côté. */
  partHorsMoteur: number;
}

/**
 * La cible à viser pour les recrues que le moteur place, site déduit.
 *
 * `cible.parts` est attendue DÉJÀ renormalisée sur les applications servies
 * par le marché (c'est ce que fait `classerApplications`) : corriger une cible
 * qui compterait une application absente donnerait un résultat faux.
 *
 * L'ARITHMÉTIQUE. Soit `p` la part hors moteur et `q_a` la part de ces
 * recrues qui va à l'application `a` (somme 1). Le site fournit `p × q_a` ;
 * les recrues que le moteur place valent `1 − p` du total. Pour que le total
 * fasse la cible `t_a` :
 *
 *     p × q_a + (1 − p) × h_a = t_a    d'où    h_a = (t_a − p × q_a) / (1 − p)
 *
 * La somme des `h` refait 100 toute seule, il n'y a rien à renormaliser
 * derrière. Si un `h_a` est négatif, le site fournit déjà plus de cette
 * application que la cible n'en demande : la cible est INATTEIGNABLE. On met
 * alors ces applications-là à zéro pour les recrues du moteur et on le dit.
 *
 * « Inatteignable » porte sur le RÉGIME PERMANENT, pas sur les vingt
 * prochaines recrues. Si une application est aujourd'hui sous-représentée
 * dans le stock du marché, le moteur peut lui envoyer beaucoup de monde
 * pendant un moment ; ce que le site interdit, c'est de la stabiliser sous
 * `p × q_a` à la longue.
 */
export function cibleHorsSite(
  cible: CibleApplications,
  part: number,
  parApp: Readonly<Record<string, number>>,
): CibleCorrigee {
  const q = normaliser(parApp as Record<string, number>);
  const p = Object.keys(q).length > 0 ? borner(part) : 0;
  const total = Object.values(cible.parts).reduce((a, b) => a + b, 0);
  const partHorsMoteur = 100 * p;

  const slugs = new Set([...Object.keys(cible.parts), ...Object.keys(q)]);
  const planchers: Record<string, number> = {};
  for (const slug of slugs) planchers[slug] = 100 * p * (q[slug] ?? 0);

  // Aucune recrue hors moteur : rien à corriger, la cible passe telle quelle.
  if (p <= 0) {
    return { parts: { ...cible.parts }, atteignable: true, planchers, partHorsMoteur: 0 };
  }

  // Tout est décidé par le site : le moteur ne place plus personne. Les
  // seules parts encore vraies sont celles qu'il applique.
  if (p >= 1) {
    const parts: Record<string, number> = {};
    for (const slug of slugs) parts[slug] = 100 * (q[slug] ?? 0);
    const atteignable = [...slugs].every(
      (slug) => Math.abs((total > 0 ? (100 * (cible.parts[slug] ?? 0)) / total : 0) - parts[slug]) < 1e-6,
    );
    return { parts, atteignable, planchers, partHorsMoteur: 100 };
  }

  const brut: Record<string, number> = {};
  let negatif = false;
  for (const slug of slugs) {
    const t = total > 0 ? (cible.parts[slug] ?? 0) / total : 0;
    const h = (t - p * (q[slug] ?? 0)) / (1 - p);
    if (h < -1e-9) negatif = true;
    brut[slug] = h;
  }

  if (!negatif) {
    const parts: Record<string, number> = {};
    for (const slug of slugs) parts[slug] = 100 * Math.max(0, brut[slug]);
    return { parts, atteignable: true, planchers, partHorsMoteur };
  }

  // Inatteignable : on met à zéro les applications déjà sur-servies par le
  // site et on renormalise les autres. `classerApplications` écarte d'elle-même
  // une application à cible nulle, la suite se tient.
  const restants = [...slugs].filter((slug) => brut[slug] > 0);
  const somme = restants.reduce((a, slug) => a + brut[slug], 0);
  const parts: Record<string, number> = {};
  for (const slug of slugs) {
    parts[slug] = somme > 0 && brut[slug] > 0 ? (100 * brut[slug]) / somme : 0;
  }
  return { parts, atteignable: false, planchers, partHorsMoteur };
}

/**
 * Le rang `i` (à partir de 0) sur une suite de tirages est-il une recrue que
 * le moteur ne place pas ?
 *
 * Pas de hasard : la page doit donner le même tableau à chaque ouverture,
 * sinon personne ne peut s'en servir pour décider. On répartit `floor(n×p)`
 * recrues régulièrement sur la suite, à la façon d'un tracé de droite : le
 * tirage `i` en est une dès que la part cumulée franchit un entier de plus
 * qu'au tirage précédent.
 *
 * `floor` et pas `round` : on préfère sous-estimer la contrainte. Annoncer une
 * recrue hors moteur de plus qu'il n'y en aura fermerait une place que le
 * moteur avait le droit d'attribuer.
 */
export function estTirageSite(i: number, part: number): boolean {
  const p = borner(part);
  if (p <= 0) return false;
  if (p >= 1) return true;
  return Math.floor((i + 1) * p) > Math.floor(i * p);
}

/**
 * Où va la prochaine recrue du site, vu ce qu'il a déjà attribué.
 *
 * Méthode du plus fort reste : on donne la recrue à l'application dont le dû
 * (`q_a × (n+1)`) dépasse le plus ce qu'elle a déjà reçu. Déterministe,
 * égalités tranchées par ordre alphabétique, et la suite converge vers la
 * répartition observée sans jamais donner trois comptes d'affilée à une
 * application qui n'en mérite qu'un tiers.
 *
 * `null` si le site n'envoie nulle part, ce qui ne devrait pas arriver quand
 * la part est non nulle, mais vaut mieux qu'un tirage attribué au hasard.
 */
export function prochaineAppSite(
  deja: Readonly<Record<string, number>>,
  parApp: Readonly<Record<string, number>>,
): string | null {
  const q = normaliser(parApp as Record<string, number>);
  const slugs = Object.keys(q).sort();
  if (slugs.length === 0) return null;
  const n = slugs.reduce((a, slug) => a + (deja[slug] ?? 0), 0);

  let gagnant = slugs[0];
  let meilleur = -Infinity;
  for (const slug of slugs) {
    const du = q[slug] * (n + 1) - (deja[slug] ?? 0);
    if (du > meilleur + 1e-12) {
      meilleur = du;
      gagnant = slug;
    }
  }
  return gagnant;
}
