/**
 * Choix de l'APPLICATION d'un nouveau compte.
 *
 * MIROIR de `src/features/moteur/repartition/scoreApplication.ts`, qui
 * alimente la page Répartition. Les trois fonctions ci-dessous y sont
 * identiques AU CARACTÈRE PRÈS et un test l'interdit de diverger
 * (`scoreApplication.test.ts`, bloc « copie Deno »). Si tu modifies l'une,
 * modifie l'autre dans le même commit, commentaires compris : le test compare
 * le texte source, pas le comportement.
 *
 * LA RÈGLE, en une ligne :
 *
 *     score = cible ÷ (1 + 2 × comptes de l'application sur ce marché)
 *
 * C'est l'apportionnement de Sainte-Laguë, le même mécanisme que pour le
 * label : un seul truc à comprendre pour les deux étages. Il donne le compte
 * à l'application la plus en retard sur sa cible, sans seuil, et il suit les
 * marchés donc les LANGUES : viser 20 % d'Unswipe ne veut pas dire 20 %
 * partout, mais 20 % dans chaque marché où Unswipe est servie.
 *
 * CE QUI N'EST PAS ICI. Les recrues venues du site : leur application est
 * choisie par le site, candidat par candidat, et le moteur ne les place pas.
 * Le garde est chez l'appelant, pas ici.
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
 * L'application qui prend ce compte, ou `null` si aucune ne peut le prendre.
 *
 * `null` arrive quand la cible n'accorde rien à aucune application servant la
 * langue. L'appelant doit alors REFUSER la création plutôt que de choisir à
 * l'aveugle : une cible qui ne couvre pas un marché est une erreur de réglage,
 * pas un cas limite à rattraper en silence.
 */
export function choisirApplication(
  marche: MarcheApplications,
  cible: CibleApplications,
  applications: readonly ApplicationCandidate[],
): ApplicationClassee | null {
  return classerApplications(marche, cible, applications)[0] ?? null;
}

/**
 * La valeur à écrire dans `comptes.parts_applications` pour cette application.
 *
 * Sophia rend `null`, et ce n'est pas un oubli : c'est le chemin historique,
 * `null` valant 100 % Sophia d'après le commentaire de colonne de 0256. Le
 * front fait déjà exactement ça (`optionsDuChoix`, choixCreation.ts), et on
 * garde la même forme pour que les comptes créés avant et après la bascule
 * soient indistinguables en base.
 */
export function partsPourApplication(slug: string, slugSophia: string): Record<string, number> | null {
  return slug === slugSophia ? null : { [slug]: 100 };
}
