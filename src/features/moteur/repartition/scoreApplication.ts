/**
 * Répartition des comptes entre APPLICATIONS, par marché.
 *
 * Aujourd'hui, l'application d'un compte est cochée à la main par le
 * recruteur, et il n'existe AUCUNE cible : la répartition de la flotte
 * (79,5 % Sophia, 14,8 % Unswipe, 5,7 % Micabo au 18/10) est le résultat de
 * centaines de clics, jamais une décision. Ce module calcule ce que donnerait
 * une cible posée par les admins, marché par marché.
 *
 * MÊME RÈGLE QUE POUR LE LABEL, et c'est volontaire : un seul mécanisme à
 * comprendre pour les deux étages.
 *
 *     score = cible ÷ (1 + 2 × comptes de l'application sur ce marché)
 *
 * C'est la règle d'apportionnement de Sainte-Laguë. Elle donne le siège au
 * plus en retard sur sa cible sans jamais avoir besoin d'un seuil : dès qu'une
 * application prend un compte, son score baisse et une autre passe devant.
 * Elle suit les marchés, donc les LANGUES : viser 25 % d'Unswipe ne veut pas
 * dire 25 % partout, mais 25 % dans chaque marché où Unswipe est servie.
 *
 * Module pur, aucune lecture réseau. Rien de tout ça n'est branché : la page
 * Répartition l'affiche, `manage-users` continue de lire la case du recruteur.
 */

/** Une application candidate : son id, son slug, et les langues qu'elle sert. */
export interface ApplicationCandidate {
  id: string;
  slug: string;
  /** Langues servies ; `null` = toutes (c'est le cas de Sophia). */
  langues: string[] | null;
}

/**
 * Les applications qui servent cette langue.
 *
 * `applications.langues` n'est pas décoratif : Micabo ne sert que fr, tr, de
 * et es, Unswipe fr, en, de, it, es et tr. En polonais, seule Sophia est
 * candidate, et viser « 25 % Unswipe » n'y veut rien dire. La cible est donc
 * RENORMALISÉE sur les seules applications éligibles au marché, sinon la part
 * d'une application absente serait perdue et la somme ne ferait plus 100 %.
 */
export function applicationsEligibles(
  langue: string,
  applications: readonly ApplicationCandidate[],
): ApplicationCandidate[] {
  const lg = String(langue ?? "").trim().toLowerCase();
  return applications.filter(
    (a) => a.langues === null || a.langues.some((x) => String(x).trim().toLowerCase() === lg),
  );
}

/** Comptes d'une application sur un marché (part fractionnaire). */
export interface PartApplication {
  application_id: string;
  slug: string;
  comptes: number;
}

/** Un marché vu du côté applications. */
export interface MarcheApplications {
  langue: string;
  pays: string | null;
  parts: PartApplication[];
}

export interface CibleApplications {
  /** Part visée par slug, en pourcentage, somme 100. */
  parts: Record<string, number>;
  /** `reglage` : posée par un admin. `defaut` : parts égales, faute de cible. */
  source: "reglage" | "defaut";
}

/**
 * La cible lue dans `reglages.repartition_applications`.
 *
 * Absente, la page ne doit pas inventer une cible crédible : elle prend des
 * parts ÉGALES et le dit (`source: "defaut"`). Une cible par défaut qui
 * ressemblerait à la répartition actuelle masquerait justement ce qu'on veut
 * rendre visible, à savoir que personne n'a jamais décidé de cette
 * répartition.
 */
export function lireCibleApplications(
  valeur: unknown,
  slugsActifs: readonly string[],
): CibleApplications {
  const actifs = slugsActifs.filter(Boolean);
  const v = (valeur && typeof valeur === "object" && !Array.isArray(valeur)
    ? valeur
    : {}) as Record<string, unknown>;

  const lues: Record<string, number> = {};
  for (const slug of actifs) {
    const n = Number(v[slug]);
    if (Number.isFinite(n) && n > 0) lues[slug] = n;
  }

  const total = Object.values(lues).reduce((a, b) => a + b, 0);
  if (total > 0) {
    const parts: Record<string, number> = {};
    for (const slug of actifs) parts[slug] = ((lues[slug] ?? 0) * 100) / total;
    return { parts, source: "reglage" };
  }

  const parts: Record<string, number> = {};
  for (const slug of actifs) parts[slug] = actifs.length > 0 ? 100 / actifs.length : 0;
  return { parts, source: "defaut" };
}

export interface ApplicationClassee {
  application_id: string;
  slug: string;
  /** Comptes de l'application sur ce marché. */
  comptes: number;
  /** Part réelle sur ce marché, en pourcentage. */
  partReelle: number;
  /** Part visée, en pourcentage. */
  partVisee: number;
  /** `cible / (1 + 2 × comptes)`. Le plus gros gagne le prochain compte. */
  score: number;
}

/**
 * Les applications d'un marché, de la plus en retard à la moins en retard.
 * La première prendrait le prochain compte créé sur ce marché.
 *
 * Une application à cible nulle est écartée : viser 0 % quelque part veut dire
 * « pas ici », pas « en dernier ».
 */
export function classerApplications(
  marche: MarcheApplications,
  cible: CibleApplications,
  applications: readonly ApplicationCandidate[],
): ApplicationClassee[] {
  const comptesPar = new Map(marche.parts.map((p) => [p.slug, p.comptes]));
  const total = marche.parts.reduce((a, p) => a + p.comptes, 0);

  const candidates = applicationsEligibles(marche.langue, applications).filter(
    (a) => (cible.parts[a.slug] ?? 0) > 0,
  );
  // Renormalisation : les parts des applications qui ne servent pas cette
  // langue reviennent aux autres, au prorata.
  const sommeVisee = candidates.reduce((a, x) => a + (cible.parts[x.slug] ?? 0), 0);

  return candidates
    .map((a): ApplicationClassee => {
      const comptes = comptesPar.get(a.slug) ?? 0;
      const visee = sommeVisee > 0 ? (100 * (cible.parts[a.slug] ?? 0)) / sommeVisee : 0;
      return {
        application_id: a.id,
        slug: a.slug,
        comptes,
        partReelle: total > 0 ? (100 * comptes) / total : 0,
        partVisee: visee,
        score: visee / (1 + 2 * comptes),
      };
    })
    .sort((x, y) => y.score - x.score || x.slug.localeCompare(y.slug));
}

/**
 * L'écart d'une application à sa cible sur toute la flotte, en points de
 * pourcentage. Positif = sous-représentée, c'est là que vont les recrues.
 *
 * LA CIBLE DE LA FLOTTE N'EST PAS LA CIBLE SAISIE, et c'est tout l'objet de
 * cette fonction. La cible est une règle PAR MARCHÉ, et 24 des 36 marchés ne
 * sont servis que par Sophia : viser « 20 % Unswipe » n'y veut rien dire.
 * Au 19/10, 125 comptes sur 265 vivent dans un marché où Sophia est seule.
 *
 * Comparer la flotte réelle à la cible brute donnerait donc « Sophia 79 %
 * contre 70 % visés, 9 points de trop » alors que si CHAQUE marché atteignait
 * exactement sa cible, la flotte serait à 84 % de Sophia. On lirait un excès
 * là où il y a un manque, et on serait tenté de baisser encore la part de
 * Sophia — l'inverse de ce qu'il faut faire.
 *
 * On calcule donc la cible atteignable : pour chaque marché, la cible
 * renormalisée sur les applications qui le servent, pondérée par le nombre de
 * comptes du marché.
 */
export function ecartsFlotte(
  marches: readonly MarcheApplications[],
  cible: CibleApplications,
  applications: readonly ApplicationCandidate[],
): Array<{ slug: string; comptes: number; partReelle: number; partVisee: number; ecart: number }> {
  const comptesPar = new Map<string, number>();
  for (const m of marches) {
    for (const p of m.parts) {
      comptesPar.set(p.slug, (comptesPar.get(p.slug) ?? 0) + p.comptes);
    }
  }
  const total = [...comptesPar.values()].reduce((a, b) => a + b, 0);

  // Cible atteignable, pondérée par le poids de chaque marché.
  const viseePar = new Map<string, number>();
  let poids = 0;
  for (const m of marches) {
    const comptesMarche = m.parts.reduce((a, p) => a + p.comptes, 0);
    if (comptesMarche <= 0) continue;
    const candidats = applicationsEligibles(m.langue, applications).filter(
      (a) => (cible.parts[a.slug] ?? 0) > 0,
    );
    const somme = candidats.reduce((a, x) => a + (cible.parts[x.slug] ?? 0), 0);
    if (somme <= 0) continue;
    poids += comptesMarche;
    for (const a of candidats) {
      const visee = (100 * (cible.parts[a.slug] ?? 0)) / somme;
      viseePar.set(a.slug, (viseePar.get(a.slug) ?? 0) + visee * comptesMarche);
    }
  }

  const slugs = new Set([...comptesPar.keys(), ...Object.keys(cible.parts)]);
  return [...slugs]
    .map((slug) => {
      const comptes = comptesPar.get(slug) ?? 0;
      const partReelle = total > 0 ? (100 * comptes) / total : 0;
      const partVisee = poids > 0 ? (viseePar.get(slug) ?? 0) / poids : 0;
      return { slug, comptes, partReelle, partVisee, ecart: partVisee - partReelle };
    })
    .sort((a, b) => b.comptes - a.comptes);
}
