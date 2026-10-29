/**
 * Système du 2 nov., partie A : l'accueil automatique d'une recrue, dès son
 * contrat Upwork démarré. Rien ici ne touche la base ni le réseau : lire le
 * contrat, décider (relier, doublon, créer), composer le message.
 */

/** Interrupteur off | test | on ; défaut « test » (montre, n'envoie rien). */
export type ModeAuto = "off" | "test" | "on";

export function lireModeAuto(v: unknown): ModeAuto {
  return v === "off" || v === "on" ? v : "test";
}

/** Le contrat et son annonce (noms vérifiés à l'API le 28/10). Lecture seule. */
export const REQUETE_DETAILS_CONTRAT = `query DetailsContrat($id: ID!) {
  contractDetails(id: $id) {
    id status startDate offerId
    job { id content { title } }
    hiringManager { id name }
    freelancer { id name firstName lastName }
  }
}`;

export interface DetailsContrat {
  contrat_id: string;
  offre_id: string | null;
  job_id: string | null;
  job_titre: string | null;
  prenom: string | null;
  nom: string | null;
  debut_at: string | null;
  hm_upwork_id: string | null;
  statut: string | null;
}

// deno-lint-ignore no-explicit-any
export function lireDetailsContrat(c: any): DetailsContrat | null {
  if (!c?.id) return null;
  const nomComplet = String(c.freelancer?.name ?? "").trim();
  const prenom = String(c.freelancer?.firstName ?? "").trim() || nomComplet.split(/\s+/)[0] || null;
  const nom = String(c.freelancer?.lastName ?? "").trim() ||
    (nomComplet.split(/\s+/).slice(1).join(" ") || null);
  const debut = c.startDate ? new Date(c.startDate) : null;
  return {
    contrat_id: String(c.id),
    offre_id: c.offerId ? String(c.offerId) : null,
    job_id: c.job?.id ? String(c.job.id) : null,
    job_titre: c.job?.content?.title ?? null,
    prenom,
    nom,
    debut_at: debut && !isNaN(debut.getTime()) ? debut.toISOString() : null,
    hm_upwork_id: c.hiringManager?.id ? String(c.hiringManager.id) : null,
    statut: c.status ?? null,
  };
}

/** Minuscules, sans accents ni espaces doubles : pour comparer des noms. */
export function normaliserNom(s: string | null | undefined): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export interface Annonce {
  job_id: string;
  pays: string | null;
  langue: string | null;
  hm_id: string | null;
  tarif: number | null;
  generique: boolean;
}

export interface PosteurExistant {
  id: string;
  prenom: string | null;
  nom: string | null;
  /** Le pays de ses comptes (comptes.pays, ISO), null s'il n'en a pas. */
  pays: string | null;
  is_active: boolean;
  upwork_contract_id: string | null;
}

/** Ce qu'on sait déjà du contrat (accueils), pays choisi à la main compris. */
export interface AccueilConnu {
  statut: string;
  pays: string | null;
  langue: string | null;
  hm_id: string | null;
}

export interface PlanAccueil {
  statut: "a_relier" | "doublon" | "a_creer";
  raison: string | null;
  pays: string | null;
  langue: string | null;
  hm_id: string | null;
  tarif: number | null;
}

/**
 * Décide d'un contrat : doublon (contrat déjà relié, ou même nom et même pays
 * actif), à relier (annonce inconnue ou générique, pays pas encore choisi),
 * ou à créer (annonce connue, ou pays choisi à la main).
 */
export function planAccueil(
  d: DetailsContrat,
  annonce: Annonce | null,
  connu: AccueilConnu | null,
  posteurs: PosteurExistant[],
): PlanAccueil {
  const relie = posteurs.find((p) => p.upwork_contract_id === d.contrat_id);
  if (relie) {
    return { statut: "doublon", raison: "contrat déjà relié à un posteur", pays: relie.pays, langue: null, hm_id: null, tarif: null };
  }
  const choisi = connu?.statut === "a_creer" && connu.pays && connu.langue
    ? { pays: connu.pays, langue: connu.langue, hm_id: connu.hm_id, tarif: annonce?.tarif ?? null }
    : annonce && !annonce.generique && annonce.pays && annonce.langue
    ? { pays: annonce.pays, langue: annonce.langue, hm_id: annonce.hm_id, tarif: annonce.tarif }
    : null;
  if (!choisi) {
    return {
      statut: "a_relier",
      raison: !annonce ? "annonce inconnue" : annonce.generique ? "annonce générique" : "pays de l'annonce pas encore choisi",
      pays: null,
      langue: null,
      hm_id: annonce?.hm_id ?? null,
      tarif: null,
    };
  }
  const meme = posteurs.find((p) =>
    p.is_active &&
    normaliserNom(p.prenom) === normaliserNom(d.prenom) &&
    normaliserNom(p.nom) === normaliserNom(d.nom) &&
    (p.pays ?? "") === choisi.pays
  );
  if (meme) {
    return { statut: "doublon", raison: "même nom et même pays qu'un posteur actif", ...choisi };
  }
  return { statut: "a_creer", raison: null, ...choisi };
}

/** « 2 November » : le texte dit déjà « Monday ». */
export function dateAnglaise(jour: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: "UTC" })
    .format(new Date(`${jour}T12:00:00Z`));
}

/** Le message de bienvenue, depuis le réglage ; une variable inconnue reste telle quelle. */
export function messageAccueil(
  modele: string,
  v: { prenom: string | null; url: string; email: string; mot_de_passe: string; slack: string; guide: string; cohorte_lundi: string },
): string {
  const vars: Record<string, string> = {
    prenom: (v.prenom ?? "").trim() || "there",
    url: v.url,
    email: v.email,
    mot_de_passe: v.mot_de_passe,
    slack: v.slack,
    guide: v.guide,
    date: dateAnglaise(v.cohorte_lundi),
  };
  return modele.replace(/\{(\w+)\}/g, (tout, k: string) => (k in vars ? vars[k]! : tout)).trim();
}

/** Un posteur déjà embauché, relié à l'annonce de son contrat. */
export interface PosteurAnnonce {
  job_id: string;
  titre: string | null;
  pays: string | null;
  langue: string | null;
  hm_id: string | null;
  tarif: number | null;
}

export interface AnnonceDeduite {
  job_id: string;
  titre: string | null;
  pays: string | null;
  langue: string | null;
  hm_id: string | null;
  tarif: number | null;
  generique: boolean;
  posteurs: number;
}

/**
 * Les annonces déduites des posteurs déjà embauchés : un seul pays et une
 * seule langue → l'annonce les prend (la HM la plus fréquente, le tarif s'il
 * est le même pour tous) ; plusieurs pays ou langues → générique (chaque
 * contrat passera par « Contrats à relier ») ; aucun pays connu → rien dit.
 */
export function annoncesDepuisPosteurs(lignes: PosteurAnnonce[]): AnnonceDeduite[] {
  const parJob = new Map<string, PosteurAnnonce[]>();
  for (const l of lignes) {
    if (!l.job_id) continue;
    parJob.set(l.job_id, [...(parJob.get(l.job_id) ?? []), l]);
  }
  const distincts = <T>(xs: (T | null)[]) => [...new Set(xs.filter((x): x is T => x !== null && x !== undefined))];
  return [...parJob.entries()].map(([job_id, ls]) => {
    const pays = distincts(ls.map((l) => l.pays?.toUpperCase() ?? null));
    const langues = distincts(ls.map((l) => l.langue));
    const tarifs = distincts(ls.map((l) => l.tarif));
    const compte = new Map<string, number>();
    for (const l of ls) if (l.hm_id) compte.set(l.hm_id, (compte.get(l.hm_id) ?? 0) + 1);
    const hm = [...compte.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const unique = pays.length === 1 && langues.length === 1;
    return {
      job_id,
      titre: ls.find((l) => l.titre)?.titre ?? null,
      pays: unique ? pays[0]! : null,
      langue: unique ? langues[0]! : null,
      hm_id: hm,
      tarif: tarifs.length === 1 ? tarifs[0]! : null,
      generique: pays.length > 1 || langues.length > 1,
      posteurs: ls.length,
    };
  });
}
