/**
 * LE CATALOGUE DES APPLICATIONS : la liste des applications que l'OS promeut.
 *
 * Module source : la copie Deno `supabase/functions/_shared/catalogue_applications.ts`
 * doit rester identique (hors cet en-tête), `catalogueApplications.test.ts` le vérifie.
 * Le mode d'emploi complet (ajouter une application, ajouter un label) est dans
 * `docs/applications.md`.
 */

/**
 * Une application = UNE ligne ici. Tout le reste de l'OS part de cette liste :
 * les noms affichés, l'ordre et la couleur dans les graphes, les listes
 * d'applications des écrans (lien à 1 000 abonnés, banque de captures) et les
 * phrases « nos applis » des prompts.
 *
 * Ce qui ne tient pas dans une ligne vit à côté, et les tests du catalogue
 * refusent une application à qui il en manque un :
 *  - son logo : `src/assets/applications/<slug>.png` + `logosApplications.ts` ;
 *  - sa couleur : `--app-<slug>` (clair et sombre) dans `src/index.css` ;
 *  - ses concurrents : `_shared/concurrents.ts` (`MOTIFS_PAR_APPLICATION`) ;
 *  - son nom dans le suivi Notion : `_shared/notion.ts` (`APP_VERS_NOTION`).
 *
 * Ce qui se règle dans l'OS, sans code (page Labels & applications) : ses
 * langues, son interrupteur, ses deux prompts (`pertinence_<slug>`,
 * `placement_<slug>`), son lien à 1 000 abonnés et les labels qui la servent.
 */
export interface FicheApplication {
  /** La clé de l'application partout : `applications.slug`, prompts, répartition des comptes. */
  slug: string;
  /** Son id en base (`applications.id`), fixe : les migrations et les tests le citent. */
  id: string;
  /** Son nom dans l'OS, tel qu'en base (`applications.nom`). */
  nom: string;
  /** La marque telle qu'on l'écrit dans un post (« UnSwipe », « micabo »). */
  marque: string;
  /** Ce que fait l'appli, en quelques mots. */
  concept: string;
}

/**
 * L'ordre de cette liste est celui des graphes et des écrans : une application
 * garde sa place d'une page à l'autre. Une nouvelle s'ajoute à la fin.
 */
export const CATALOGUE_APPLICATIONS: readonly FicheApplication[] = [
  {
    slug: "sophia",
    id: "00000000-0000-4000-8000-000000000001",
    nom: "Sophia",
    marque: "Sophia",
    concept: "culture générale",
  },
  {
    slug: "micabo",
    id: "00000000-0000-4000-8000-000000000002",
    nom: "micabo",
    marque: "micabo",
    concept: "révisions pour les élèves et les étudiants",
  },
  {
    slug: "unswipe",
    id: "00000000-0000-4000-8000-000000000003",
    nom: "Unswipe",
    marque: "UnSwipe",
    concept: "ses réseaux sans les formats courts",
  },
  {
    slug: "atala",
    id: "00000000-0000-4000-8000-000000000004",
    nom: "Atala",
    marque: "Atala",
    concept: "course à pied (running)",
  },
  {
    slug: "artura",
    id: "00000000-0000-4000-8000-000000000005",
    nom: "Artura",
    marque: "Artura",
    concept: "histoire de l'art (une œuvre par jour)",
  },
];

/** Les slugs, dans l'ordre du catalogue. */
export const SLUGS_APPLICATIONS: readonly string[] = CATALOGUE_APPLICATIONS.map((a) => a.slug);

function cleSlug(slug: string | null | undefined): string {
  return String(slug ?? "").trim().toLowerCase();
}

/** La fiche d'une application, `null` pour un slug hors catalogue (créée à l'écran, pas encore déclarée ici). */
export function ficheApplication(slug: string | null | undefined): FicheApplication | null {
  const cle = cleSlug(slug);
  return CATALOGUE_APPLICATIONS.find((a) => a.slug === cle) ?? null;
}

/** La fiche d'une application par son id en base. */
export function ficheApplicationParId(id: string | null | undefined): FicheApplication | null {
  const cle = cleSlug(id);
  return CATALOGUE_APPLICATIONS.find((a) => a.id === cle) ?? null;
}

/** L'id en base d'une application du catalogue ; lève sur un slug inconnu (faute de frappe dans le code). */
export function idApplication(slug: string): string {
  const fiche = ficheApplication(slug);
  if (!fiche) throw new Error(`Application hors catalogue : ${slug}`);
  return fiche.id;
}

/** La marque telle qu'on l'écrit dans un post ; le slug tel quel hors catalogue. */
export function marqueApplication(slug: string | null | undefined): string {
  return ficheApplication(slug)?.marque ?? cleSlug(slug);
}

/** La marque avec une majuscule, pour une phrase ou un commentaire (« Micabo », « UnSwipe »). */
export function marqueCapitalisee(slug: string | null | undefined): string {
  const marque = marqueApplication(slug);
  return marque.charAt(0).toUpperCase() + marque.slice(1);
}

/**
 * « Sophia, Micabo, UnSwipe, Atala et Artura » : toutes nos applis dans une phrase de
 * prompt. `liaison` vide = une simple liste à virgules.
 */
export function enumererMarques(liaison: "et" | "ou" | "" = ""): string {
  const marques = CATALOGUE_APPLICATIONS.map((a) => marqueCapitalisee(a.slug));
  if (!liaison || marques.length < 2) return marques.join(", ");
  return `${marques.slice(0, -1).join(", ")} ${liaison} ${marques[marques.length - 1]}`;
}
