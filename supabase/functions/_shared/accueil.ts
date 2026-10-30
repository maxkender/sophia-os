/**
 * Système du 2 nov., partie A : l'accueil automatique d'une recrue, dès son
 * contrat Upwork démarré. Rien ici ne touche la base ni le réseau : lire le
 * contrat, décider (relier, doublon, créer), composer le message.
 */
import { GUIDE_POSTER_PUBLIC } from "./guide_public.ts";

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
    supervisor { id name }
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
  /** 0470 : la HM du contrat (hiringManager), le superviseur, le freelance (pour sa localisation). */
  hm_upwork_nom?: string | null;
  superviseur_upwork_id?: string | null;
  superviseur_upwork_nom?: string | null;
  freelancer_id?: string | null;
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
    hm_upwork_nom: c.hiringManager?.name ?? null,
    superviseur_upwork_id: c.supervisor?.id ? String(c.supervisor.id) : null,
    superviseur_upwork_nom: c.supervisor?.name ?? null,
    freelancer_id: c.freelancer?.id ? String(c.freelancer.id) : null,
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
  /** 0470 : choisi à la main (carte « Contract to link ») : gardé même après une simulation. */
  relie_at?: string | null;
}

/** 0470 : ce que l'API dit du contrat : le pays du freelance et la HM du contrat (hiringManager / supervisor). */
export interface InfosApi {
  freelance_pays: string | null;
  /** La langue des comptes de ce pays (la plus fréquente), null si aucun compte de ce pays. */
  freelance_langue: string | null;
  /** La HM de l'OS qui correspond à la HM du contrat, null si aucune. */
  hm_id: string | null;
  /** Le nom de la HM du contrat sur Upwork (pour la raison). */
  hm_nom: string | null;
}

export interface PlanAccueil {
  statut: "a_relier" | "doublon" | "a_creer";
  raison: string | null;
  pays: string | null;
  langue: string | null;
  hm_id: string | null;
  tarif: number | null;
  /** 0470 : d'où vient le pays (choix à la main, annonce, freelance). */
  source?: "main" | "annonce" | "freelance";
  /** 0470 : le freelance vit ailleurs que le pays de l'annonce (créé avec celui de l'annonce). */
  ecart?: { vit: string; annonce: string };
  /**
   * Prompt 25 MAJ : le profil qui existe déjà (créé par la HM). Jamais un 2e
   * profil : l'OS relie le contrat à celui-ci et envoie quand même la bienvenue.
   */
  poster_id?: string;
}

/**
 * Décide d'un contrat : doublon (contrat déjà relié, ou même nom et même pays
 * actif), à relier (pays introuvable), ou à créer.
 *
 * 0470 : le pays : choisi à la main → annonce avec un pays → pays du freelance
 * (lu à l'API) → carte « Contract to link ». La HM : choisie à la main → celle
 * du contrat (hiringManager / supervisor), jamais le propriétaire de l'annonce.
 * Sans `api` (anciens appels), la HM reste celle de l'annonce.
 */
export function planAccueil(
  d: DetailsContrat,
  annonce: Annonce | null,
  connu: AccueilConnu | null,
  posteurs: PosteurExistant[],
  api?: InfosApi,
): PlanAccueil {
  const relie = posteurs.find((p) => p.upwork_contract_id === d.contrat_id);
  if (relie) {
    return { statut: "doublon", raison: "contrat déjà relié à un posteur", pays: relie.pays, langue: null, hm_id: null, tarif: null, poster_id: relie.id };
  }
  const main = (connu?.statut === "a_creer" || Boolean(connu?.relie_at)) && connu?.pays && connu.langue ? connu : null;
  const annonceOk = annonce && !annonce.generique && annonce.pays && annonce.langue ? annonce : null;
  const freelanceOk = api?.freelance_pays && api.freelance_langue ? api : null;
  const hmApi = api ? api.hm_id : undefined;
  const choisi: Omit<PlanAccueil, "statut" | "raison"> | null = main
    ? { pays: main.pays, langue: main.langue, hm_id: main.hm_id ?? hmApi ?? annonce?.hm_id ?? null, tarif: annonce?.tarif ?? null, source: "main" }
    : annonceOk
    ? { pays: annonceOk.pays, langue: annonceOk.langue, hm_id: hmApi === undefined ? annonceOk.hm_id : hmApi, tarif: annonceOk.tarif, source: "annonce" }
    : freelanceOk
    ? { pays: freelanceOk.freelance_pays, langue: freelanceOk.freelance_langue, hm_id: freelanceOk.hm_id, tarif: annonce?.tarif ?? null, source: "freelance" }
    : null;
  if (!choisi) {
    return {
      statut: "a_relier",
      raison: api?.freelance_pays && !api.freelance_langue
        ? `le freelance vit en ${api.freelance_pays}, aucune langue connue pour ce pays`
        : !annonce
        ? "annonce inconnue, pays du freelance illisible"
        : annonce.generique
        ? "annonce générique, pays du freelance illisible"
        : "pays de l'annonce pas encore choisi, pays du freelance illisible",
      pays: null,
      langue: null,
      hm_id: api ? api.hm_id : annonce?.hm_id ?? null,
      tarif: null,
    };
  }
  if (choisi.source === "annonce" && api?.freelance_pays && api.freelance_pays !== choisi.pays) {
    choisi.ecart = { vit: api.freelance_pays, annonce: choisi.pays as string };
  }
  // La HM du contrat n'est pas dans l'OS (ni choisie à la main) : la carte, pour la choisir.
  if (api && !choisi.hm_id) {
    return {
      statut: "a_relier",
      raison: `HM du contrat (${api.hm_nom ?? "inconnue"}) pas dans l'OS : choisis la HM`,
      ...choisi,
    };
  }
  const meme = posteurs.find((p) =>
    p.is_active &&
    normaliserNom(p.prenom) === normaliserNom(d.prenom) &&
    normaliserNom(p.nom) === normaliserNom(d.nom) &&
    (p.pays ?? "") === choisi.pays
  );
  if (meme) {
    return { statut: "doublon", raison: "même nom et même pays qu'un posteur actif", ...choisi, poster_id: meme.id };
  }
  return { statut: "a_creer", raison: null, ...choisi };
}

/**
 * 0470 : la HM de l'OS qui correspond à un nom Upwork (« Lucia D. » → Lucia D…) :
 * même prénom et même initiale du nom, une seule HM active. Sinon null.
 */
export function hmDeNomUpwork(nom: string | null | undefined, hms: { id: string; prenom: string | null; nom: string | null }[]): string | null {
  const mots = normaliserNom(nom).split(" ").filter(Boolean);
  if (mots.length === 0) return null;
  const [prenom, ...reste] = mots;
  const initiale = reste.join(" ").charAt(0);
  const trouves = hms.filter((h) =>
    normaliserNom(h.prenom) === prenom && (!initiale || normaliserNom(h.nom).startsWith(initiale))
  );
  return trouves.length === 1 ? trouves[0].id : null;
}

/** 0470 : la langue d'un pays : la plus fréquente parmi les comptes de ce pays. */
export function langueDePays(pays: string | null, comptes: { pays: string | null; langue: string | null }[]): string | null {
  if (!pays) return null;
  const n = new Map<string, number>();
  for (const c of comptes) if (c.pays === pays && c.langue) n.set(c.langue, (n.get(c.langue) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
}

/** Codes retirés ou réservés qu'Intl nomme comme un pays d'aujourd'hui (DD « Germany », FX « France »…). */
const CODES_RETIRES = new Set(["AN", "BU", "CS", "DD", "DY", "EU", "EZ", "FX", "HV", "NH", "NT", "QO", "RH", "SU", "TP", "UK", "UN", "VD", "YD", "YU", "ZR"]);
const CODE_ACTUEL: Record<string, string> = { FX: "FR", DD: "DE", UK: "GB", ZR: "CD", TP: "TL", BU: "MM", YU: "RS", CS: "RS", SU: "RU" };

const CODES_PAYS = (() => {
  const m = new Map<string, string>();
  const noms = new Intl.DisplayNames(["en"], { type: "region" });
  for (let a = 65; a <= 90; a++) {
    for (let b = 65; b <= 90; b++) {
      const code = String.fromCharCode(a, b);
      if (CODES_RETIRES.has(code)) continue;
      try {
        const nom = noms.of(code);
        if (nom && nom !== code && !m.has(normaliserNom(nom))) m.set(normaliserNom(nom), code);
      } catch { /* code invalide */ }
    }
  }
  // Les noms qu'Upwork écrit autrement qu'Intl.
  for (const [nom, code] of [["united states", "US"], ["usa", "US"], ["united kingdom", "GB"], ["uk", "GB"], ["czech republic", "CZ"], ["czechia", "CZ"], ["turkey", "TR"], ["turkiye", "TR"], ["russia", "RU"], ["south korea", "KR"], ["korea republic of", "KR"], ["vietnam", "VN"], ["viet nam", "VN"], ["macedonia", "MK"], ["north macedonia", "MK"], ["bosnia and herzegovina", "BA"], ["moldova", "MD"], ["palestinian territories", "PS"]] as const) {
    m.set(nom, code);
  }
  return m;
})();

/** 0470 : « Croatia » ou « HR » → « HR » ; inconnu → null. */
export function codePays(v: string | null | undefined): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  if (/^[A-Za-z]{2}$/.test(s)) return CODE_ACTUEL[s.toUpperCase()] ?? s.toUpperCase();
  return CODES_PAYS.get(normaliserNom(s)) ?? null;
}

/**
 * 0470 : où vit le freelance, par l'API (lecture seule), avec l'id freelancer du
 * contrat. Plusieurs requêtes du schéma, essayées dans l'ordre ; la première qui
 * rend un pays gagne (et le journal upwork_appels dit laquelle). 30/10 :
 * talentProfile répond (pays et ville) ; userDetails répond 403.
 */
// deno-lint-ignore no-explicit-any
export const REQUETES_LOCALISATION: { nom: string; query: string; variable: "freelancer" | "contrat"; lire: (data: any) => { pays: string | null; ville: string | null } }[] = [
  {
    nom: "talentProfile.personalData.location",
    variable: "freelancer",
    query: `query Localisation($id: ID!) { talentProfile(personId: $id) { profiles { personalData { location { country city } } } } }`,
    lire: (d) => {
      const l = d?.talentProfile?.profiles?.[0]?.personalData?.location ?? d?.talentProfile?.profiles?.personalData?.location;
      return { pays: l?.country ?? null, ville: l?.city ?? null };
    },
  },
  {
    nom: "userDetails.location",
    variable: "freelancer",
    query: `query Localisation($id: ID!) { userDetails(id: $id) { id location { countryName cityName } } }`,
    lire: (d) => ({ pays: d?.userDetails?.location?.countryName ?? null, ville: d?.userDetails?.location?.cityName ?? null }),
  },
  {
    nom: "contractDetails.offer.freelancer.countryDetails",
    variable: "contrat",
    query: `query Localisation($id: ID!) { contractDetails(id: $id) { offer { freelancer { countryDetails { name twoLetterAbbreviation } } } } }`,
    lire: (d) => {
      const c = d?.contractDetails?.offer?.freelancer?.countryDetails;
      return { pays: c?.twoLetterAbbreviation ?? c?.name ?? null, ville: null };
    },
  },
];

/** Les raisons d'un doublon qui est la recrue elle-même (profil créé par la HM), à accueillir sur On. */
const RAISONS_PROFIL_HM = ["contrat déjà relié à un posteur", "même nom et même pays qu'un posteur actif"];

/** Prompt 25, 16 : un « doublon » profil HM, noté avant On et jamais accueilli, est repris sur On. */
export function bienvenueARattraper(connu: { statut: string; raison: string | null; message_at: string | null }, mode: string): boolean {
  return mode === "on" && connu.statut === "doublon" && !connu.message_at && RAISONS_PROFIL_HM.includes(connu.raison ?? "");
}

/** « 2 November » : le texte dit déjà « Monday ». */
export function dateAnglaise(jour: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: "UTC" })
    .format(new Date(`${jour}T12:00:00Z`));
}

/** Le guide du posteur, dans la bienvenue : le lien public (les posteurs n'ont pas accès à app.notion.com). */
export const GUIDE_POSTER = GUIDE_POSTER_PUBLIC;

/** Le message de bienvenue, depuis le réglage ; une variable inconnue reste telle quelle. */
export function messageAccueil(
  modele: string,
  v: {
    prenom: string | null; url: string; email: string; mot_de_passe: string; slack: string; guide: string; cohorte_lundi: string;
    /** Prompt 13 : le @ TikTok à créer ; inconnu → la ligne qui le cite est retirée. */
    handle?: string | null;
  },
): string {
  const handle = (v.handle ?? "").trim().replace(/^@+/, "");
  const vars: Record<string, string> = {
    prenom: (v.prenom ?? "").trim() || "there",
    url: v.url,
    email: v.email,
    mot_de_passe: v.mot_de_passe,
    slack: v.slack,
    guide: v.guide,
    date: dateAnglaise(v.cohorte_lundi),
    ...(handle ? { handle } : {}),
  };
  const lignes = handle ? modele : modele.split("\n").filter((l) => !l.includes("{handle}")).join("\n");
  return lignes.replace(/\{(\w+)\}/g, (tout, k: string) => (k in vars ? vars[k]! : tout)).trim();
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
