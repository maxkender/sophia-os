import { supabase } from "@/lib/supabase/client";

import { attendusJusquIci, type CompteSemaine } from "./semaineComptes";

/**
 * Prompts 12 et 14 : le statut de chaque compte le jeudi et le samedi, calculé
 * en direct. Rouge « À traiter » (un vrai problème, avec la proposition de
 * l'OS), orange « À surveiller » (un petit signal, Keep par défaut), vert « De
 * confiance » (rien à vérifier), sinon « Rien à signaler ». Ce module ne touche
 * ni la base ni le réseau, sauf les fonctions de lecture en bas.
 */
export interface ExtrasCompte {
  compte_id: string;
  poster_id: string;
  sans_contrat: boolean;
  contrat_id: string | null;
  freelance_nom: string | null;
  profil_nom: string | null;
  message_recu_at: string | null;
  message_apercu: string | null;
  reponse_apres_nudge: boolean;
  liens_a_verifier: number;
  vues_baisse: boolean;
  actif_semaines: number | null;
  fiable_semaines: number;
  dernier_nudge_at: string | null;
  needs_you_n: number;
  disputes_n: number;
  to_read_n: number;
  connecte: boolean;
  sur_slack: boolean;
  tiktok_trouve: boolean;
  start_warmup: boolean;
  abonnements: number | null;
  relances: number;
  derniere_reaction_at: string | null;
}

export type Statut = "rouge" | "orange" | "ok" | "vert";
export type Proposition = "kill" | "keep" | "double" | "recreate" | "repondre" | "reporter";

/** Un problème ou un signal, du plus grave au moins grave (clé i18n + valeurs). */
export interface Signal {
  cle:
    | "zero_post"
    | "jours_manques"
    | "shadowban"
    | "mort"
    | "liens_introuvables"
    | "sans_contrat"
    | "message_recu"
    | "recrue_sans_reaction"
    | "recrue_etapes"
    | "un_jour_manque"
    | "liens_a_verifier"
    | "vues_baisse"
    | "message_traite";
  valeurs?: Record<string, string | number>;
}

export interface EvaluationCompte {
  statut: Statut;
  /** 1 = le plus grave ; 99 = rien. */
  gravite: number;
  signaux: Signal[];
  proposition: Proposition;
  /** La clé i18n de la raison de la proposition. */
  raison: string;
  recrue: boolean;
  /** Le nom du freelance sur Upwork ne correspond pas au profil. */
  contratAVerifier: boolean;
}

export interface SeuilsConfiance {
  semaines: number;
  posts: number;
}

export const SEUILS_DEFAUT: SeuilsConfiance = { semaines: 3, posts: 6 };

const GRAVITE: Record<Signal["cle"], number> = {
  zero_post: 1,
  recrue_sans_reaction: 2,
  jours_manques: 3,
  shadowban: 4,
  mort: 4,
  liens_introuvables: 5,
  sans_contrat: 6,
  message_recu: 7,
  recrue_etapes: 20,
  un_jour_manque: 21,
  liens_a_verifier: 22,
  vues_baisse: 23,
  message_traite: 24,
};

const ROUGES = new Set<Signal["cle"]>([
  "zero_post", "recrue_sans_reaction", "jours_manques", "shadowban", "mort", "liens_introuvables", "sans_contrat", "message_recu",
]);

const normaliser = (s: string | null | undefined) =>
  (s ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z]+/g, " ").trim();

/** Le nom Upwork ressemble-t-il au profil ? (au moins un mot commun de 3 lettres ou plus) */
export function nomsConcordent(upwork: string | null, profil: string | null): boolean {
  if (!upwork || !profil) return true;
  const a = new Set(normaliser(upwork).split(" ").filter((m) => m.length >= 3));
  return normaliser(profil).split(" ").some((m) => m.length >= 3 && a.has(m));
}

/** Les jours passés où un post avec lien a manqué. */
export function joursManques(c: CompteSemaine, aujourdhui: string): number {
  return c.jours.filter((j) => j.jour < aujourdhui && j.lien < j.prevus).length;
}

const semainesDepuis = (iso: string | null, maintenant: Date) =>
  iso ? (maintenant.getTime() - new Date(iso).getTime()) / (7 * 86_400_000) : Infinity;

export function evaluerCompte(
  c: CompteSemaine,
  x: ExtrasCompte | undefined,
  o: { lundi: string; aujourdhui: string; maintenant: Date; page: "samedi" | "jeudi"; seuils?: SeuilsConfiance },
): EvaluationCompte {
  const seuils = o.seuils ?? SEUILS_DEFAUT;
  const recrue = Boolean(c.cohorte_lundi && c.cohorte_lundi > o.lundi);
  const signaux: Signal[] = [];
  const nudge = Boolean(c.nudge_envoye_at);
  if (recrue) {
    // La cohorte qui arrive : ses étapes, ses relances, sa dernière réaction.
    const pret = Boolean(x && x.connecte && x.tiktok_trouve && x.start_warmup && (x.abonnements ?? 0) >= 5);
    const sansReaction = Boolean(x && x.relances > 0 && !x.derniere_reaction_at && !pret);
    if (sansReaction) signaux.push({ cle: "recrue_sans_reaction", valeurs: { n: x!.relances } });
    else if (x && !pret) signaux.push({ cle: "recrue_etapes" });
  } else {
    const attendus = attendusJusquIci(c);
    // Les jours passés manqués ; à défaut, un manque dans les totaux (posts prévus avant aujourd'hui sans lien).
    const manques = Math.max(joursManques(c, o.aujourdhui), c.prevus_passes > c.lien_passes ? 1 : 0);
    if (attendus > 0 && c.lien_total === 0) {
      signaux.push({ cle: "zero_post", valeurs: { nudge: nudge ? (x?.reponse_apres_nudge ? "repondu" : "sans_reponse") : "non" } });
    } else if (manques >= 2) {
      signaux.push({ cle: "jours_manques", valeurs: { n: manques, faits: c.lien_total, attendus } });
    } else if (manques === 1) {
      signaux.push({ cle: "un_jour_manque" });
    }
    if (c.shadowban === "shadowban") signaux.push({ cle: "shadowban" });
    if (c.shadowban === "vues_basses") signaux.push({ cle: "mort" });
    if (c.liens_introuvables > 0) signaux.push({ cle: "liens_introuvables", valeurs: { n: c.liens_introuvables } });
    if ((x?.liens_a_verifier ?? 0) > 0) signaux.push({ cle: "liens_a_verifier", valeurs: { n: x!.liens_a_verifier } });
    if (x?.vues_baisse) signaux.push({ cle: "vues_baisse" });
  }
  if (x?.sans_contrat) signaux.push({ cle: "sans_contrat" });
  // Un message du posteur pas encore traité (To read) : à traiter ; déjà traité par l'OS : à surveiller.
  if (x?.message_recu_at) signaux.push({ cle: x.to_read_n > 0 ? "message_recu" : "message_traite" });
  signaux.sort((a, b) => GRAVITE[a.cle] - GRAVITE[b.cle]);

  const rouge = signaux.some((s) => ROUGES.has(s.cle));
  const confiance = o.page === "samedi" && !recrue && signaux.length === 0 && Boolean(x) &&
    (x!.actif_semaines ?? 0) >= seuils.semaines && x!.fiable_semaines >= seuils.semaines &&
    x!.needs_you_n === 0 && x!.disputes_n === 0 && semainesDepuis(x!.dernier_nudge_at, o.maintenant) >= seuils.semaines;
  const statut: Statut = rouge ? "rouge" : signaux.length > 0 ? "orange" : confiance ? "vert" : "ok";

  // La proposition, avec sa raison : celle du contrôle du samedi d'abord (Kill ou Double), sinon la règle.
  let proposition: Proposition = "keep";
  let raison = "rien";
  const premier = signaux[0]?.cle;
  if (o.page === "samedi" && c.ckd_samedi_action === "doubler" && !rouge) {
    proposition = "double";
    raison = "double";
  } else if (recrue) {
    if (premier === "recrue_sans_reaction") [proposition, raison] = ["kill", "recrue_sans_reaction"];
    else if (premier === "recrue_etapes") [proposition, raison] = ["reporter", "recrue_etapes"];
  } else if (premier === "zero_post") [proposition, raison] = ["kill", "zero_post"];
  else if (premier === "jours_manques") {
    [proposition, raison] = c.lien_total <= 2 ? ["kill", "jours_manques_kill"] : ["keep", "jours_manques_keep"];
  } else if (premier === "shadowban" || premier === "mort") [proposition, raison] = ["recreate", premier];
  else if (premier === "liens_introuvables") [proposition, raison] = ["repondre", "liens_introuvables"];
  else if (premier === "sans_contrat") [proposition, raison] = ["keep", "sans_contrat"];
  else if (premier === "message_recu") [proposition, raison] = ["repondre", "message_recu"];
  else if (statut === "orange") raison = "surveiller";
  else if (statut === "vert") raison = "confiance";
  if (o.page === "samedi" && c.ckd_samedi_action === "ne_pas_renouveler" && proposition === "keep" && rouge) {
    [proposition, raison] = ["kill", "controle_samedi"];
  }
  // Pas de contrat relié : jamais de Kill (bloqué tant que le contrat n'est pas relié).
  if (x?.sans_contrat && proposition === "kill") [proposition, raison] = ["keep", "sans_contrat"];

  return {
    statut,
    gravite: signaux.length ? GRAVITE[signaux[0].cle] : 99,
    signaux,
    proposition,
    raison,
    recrue,
    contratAVerifier: Boolean(x && !x.sans_contrat && !nomsConcordent(x.freelance_nom, x.profil_nom)),
  };
}

/** Rouge d'abord (du plus grave au moins grave), puis orange, rien à signaler, de confiance. */
export function ordreStatut(a: EvaluationCompte, b: EvaluationCompte): number {
  const rang: Record<Statut, number> = { rouge: 0, orange: 1, ok: 2, vert: 3 };
  return rang[a.statut] - rang[b.statut] || a.gravite - b.gravite;
}

export type Onglet = "recrues" | "premiere" | "anciens" | "tous";

export function ongletDe(c: CompteSemaine, lundi: string): Exclude<Onglet, "tous"> {
  if (c.cohorte_lundi && c.cohorte_lundi > lundi) return "recrues";
  if (c.cohorte_lundi === lundi) return "premiere";
  return "anciens";
}

/** Export CSV de la liste filtrée (séparateur virgule, guillemets doublés). */
export function csvMasterlist(lignes: { c: CompteSemaine; e: EvaluationCompte; choix: string; phrase: string }[]): string {
  const q = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const tete = ["handle", "poster", "hm", "pays", "cohorte", "posts_avec_lien", "attendus", "statut", "probleme", "proposition", "choix"];
  return [tete.join(","), ...lignes.map(({ c, e, choix, phrase }) =>
    [c.handle, c.poster_nom, c.hm_nom, c.pays, c.cohorte_lundi, c.lien_total, attendusJusquIci(c), e.statut, phrase, e.proposition, choix].map(q).join(","))].join("\n");
}

// ---------------------------------------------------------------------------
// Lectures (0454)
// ---------------------------------------------------------------------------

export async function lireExtras(lundi: string): Promise<Map<string, ExtrasCompte>> {
  const { data, error } = await supabase.rpc("semaine_extras", { p_lundi: lundi });
  if (error) throw error;
  return new Map(((data ?? []) as ExtrasCompte[]).map((x) => [x.compte_id, x]));
}

export async function lireSeuilsConfiance(): Promise<SeuilsConfiance> {
  const { data, error } = await supabase.from("reglages").select("valeur").eq("cle", "masterlist_confiance").maybeSingle();
  if (error) throw error;
  const v = (data?.valeur ?? {}) as Partial<SeuilsConfiance>;
  return { semaines: Number(v.semaines ?? SEUILS_DEFAUT.semaines), posts: Number(v.posts ?? SEUILS_DEFAUT.posts) };
}

export async function enregistrerSeuilsConfiance(s: SeuilsConfiance): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase.from("reglages").upsert({
    cle: "masterlist_confiance", valeur: s, updated_by: auth.user?.id ?? null, updated_at: new Date().toISOString(),
  }, { onConflict: "cle" });
  if (error) throw error;
}

/** « Autre → pause » : malade ou absent, la semaine est payée, pas de relance. */
export async function noterPause(posterId: string, jours: number, raison: string): Promise<void> {
  const { error } = await supabase.rpc("posteur_pause_noter", { p_poster: posterId, p_jours: jours, p_raison: raison });
  if (error) throw error;
}
