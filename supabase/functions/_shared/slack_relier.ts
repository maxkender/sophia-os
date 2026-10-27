/**
 * Relier les posteurs à leur compte Slack (sophia-system, 0381).
 *
 * Ordre : email perso, puis email de connexion, puis nom complet (sans
 * accents, sans casse, ponctuation ignorée). Un lien n'est posé que s'il est
 * unique des deux côtés : un nom porté par deux membres Slack, ou par deux
 * posteurs, ne relie personne (le posteur reste « à relier » dans l'OS).
 *
 * Lecture : users.list demande `users:read`, et `users:read.email` pour les
 * emails. On lit avec SLACK_BOT_TOKEN2 (qui a les emails, voir
 * slack_posteur.ts) et, à défaut, avec SLACK_HM_BOT_TOKEN : l'ID d'un membre
 * est le même pour tous les bots du workspace.
 */

type Fetch = typeof fetch;

export interface MembreSlack {
  slack_user_id: string;
  nom_reel: string | null;
  nom_affiche: string | null;
  email: string | null;
  bot: boolean;
  supprime: boolean;
}

export interface PosteurSlack {
  id: string;
  prenom: string | null;
  nom: string | null;
  email_perso: string | null;
  email: string | null;
  slack_user_id: string | null;
}

export type Par = "email" | "nom" | "team_join";

export interface Lien {
  profile_id: string;
  slack_user_id: string;
  par: Par;
}

/** « José  María-López » → « jose maria lopez ». */
export function normaliserNom(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    // Les lettres que NFD ne décompose pas (polonais, nordique, turc…).
    .replace(/[łđøıßæœ]/g, (c) => ({ ł: "l", đ: "d", ø: "o", ı: "i", ß: "ss", æ: "ae", œ: "oe" })[c] ?? c)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function normaliserEmail(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

// deno-lint-ignore no-explicit-any
export function membreDepuisApi(u: any): MembreSlack {
  const profil = u?.profile ?? {};
  return {
    slack_user_id: String(u?.id ?? ""),
    nom_reel: (profil.real_name || u?.real_name || null) as string | null,
    nom_affiche: (profil.display_name || null) as string | null,
    email: (profil.email || null) as string | null,
    bot: Boolean(u?.is_bot || u?.is_app_user),
    supprime: Boolean(u?.deleted),
  };
}

/** Un membre qui peut être un posteur : ni bot, ni supprimé, ni Slackbot. */
export function membreHumain(m: MembreSlack): boolean {
  return Boolean(m.slack_user_id) && !m.bot && !m.supprime && m.slack_user_id !== "USLACKBOT";
}

/** Clé → valeurs (pour savoir si une clé est unique). */
function index<T>(elements: T[], cles: (e: T) => string[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const e of elements) {
    for (const c of new Set(cles(e).filter(Boolean))) {
      const liste = m.get(c) ?? [];
      liste.push(e);
      m.set(c, liste);
    }
  }
  return m;
}

/**
 * Les liens à poser pour les posteurs sans compte Slack. `pris` : les IDs
 * Slack déjà reliés (à un posteur ou à une HM), jamais reproposés.
 */
export function apparier(
  posteurs: PosteurSlack[],
  membres: MembreSlack[],
  pris: Set<string>,
  par: Par | null = null,
): { liens: Lien[]; ambigus: string[] } {
  const libres = membres.filter((m) => membreHumain(m) && !pris.has(m.slack_user_id));
  const aRelier = posteurs.filter((p) => !p.slack_user_id);
  const liens: Lien[] = [];
  const ambigus = new Set<string>();
  const relies = new Set<string>();
  const utilises = new Set<string>();

  const poser = (p: PosteurSlack, m: MembreSlack, comment: Par) => {
    liens.push({ profile_id: p.id, slack_user_id: m.slack_user_id, par: par ?? comment });
    relies.add(p.id);
    utilises.add(m.slack_user_id);
    ambigus.delete(p.id);
  };

  // 1. Emails : perso puis connexion.
  const membresParEmail = index(libres, (m) => [normaliserEmail(m.email)]);
  const posteursParEmail = index(aRelier, (p) => [normaliserEmail(p.email_perso), normaliserEmail(p.email)]);
  for (const champ of ["email_perso", "email"] as const) {
    for (const p of aRelier) {
      if (relies.has(p.id)) continue;
      const e = normaliserEmail(p[champ]);
      if (!e) continue;
      const ms = (membresParEmail.get(e) ?? []).filter((m) => !utilises.has(m.slack_user_id));
      const ps = posteursParEmail.get(e) ?? [];
      if (ms.length === 1 && ps.length === 1) poser(p, ms[0], "email");
      else if (ms.length > 1 || (ms.length === 1 && ps.length > 1)) ambigus.add(p.id);
    }
  }

  // 2. Nom complet, unique des deux côtés.
  const nomMembre = (m: MembreSlack) => [normaliserNom(m.nom_reel), normaliserNom(m.nom_affiche)];
  const membresParNom = index(
    libres.filter((m) => !utilises.has(m.slack_user_id)),
    nomMembre,
  );
  const nomPosteur = (p: PosteurSlack) => normaliserNom(`${p.prenom ?? ""} ${p.nom ?? ""}`);
  const posteursParNom = index(aRelier, (p) => [nomPosteur(p)]);
  for (const p of aRelier) {
    if (relies.has(p.id)) continue;
    const n = nomPosteur(p);
    // Un prénom seul ne suffit pas.
    if (!n || !n.includes(" ")) continue;
    const ms = membresParNom.get(n) ?? [];
    const ps = posteursParNom.get(n) ?? [];
    // Le membre ne doit, lui non plus, ressembler à aucun autre posteur (nom réel ou affiché).
    const autres = ms.length === 1
      ? new Set(nomMembre(ms[0]).flatMap((c) => (posteursParNom.get(c) ?? []).map((q) => q.id)))
      : new Set<string>();
    if (ms.length === 1 && ps.length === 1 && autres.size === 1 && !utilises.has(ms[0].slack_user_id)) {
      poser(p, ms[0], "nom");
    } else if (ms.length >= 1) ambigus.add(p.id);
  }

  return { liens, ambigus: [...ambigus] };
}

/** Tous les membres du workspace (users.list, paginé). */
export async function lireMembres(token: string, fetchFn: Fetch = fetch): Promise<MembreSlack[]> {
  const membres: MembreSlack[] = [];
  let curseur = "";
  for (let page = 0; page < 50; page++) {
    const url = new URL("https://slack.com/api/users.list");
    url.searchParams.set("limit", "200");
    if (curseur) url.searchParams.set("cursor", curseur);
    const reponse = await fetchFn(url, { headers: { authorization: `Bearer ${token}` } });
    if (!reponse.ok) throw new Error(`users.list : http_${reponse.status}`);
    // deno-lint-ignore no-explicit-any
    const r: any = await reponse.json();
    if (!r.ok) throw new Error(`users.list : ${r.error}`);
    for (const u of r.members ?? []) membres.push(membreDepuisApi(u));
    curseur = r.response_metadata?.next_cursor ?? "";
    if (!curseur) break;
  }
  return membres;
}

export function jetonLectureSlack(): string | null {
  return Deno.env.get("SLACK_BOT_TOKEN2") ?? Deno.env.get("SLACK_HM_BOT_TOKEN") ?? null;
}

// deno-lint-ignore no-explicit-any
type Db = any;

async function chargerPosteursEtPris(db: Db): Promise<{ posteurs: PosteurSlack[]; pris: Set<string> }> {
  const { data: posteurs, error } = await db.rpc("slack_posteurs");
  if (error) throw new Error(`slack_posteurs : ${error.message}`);
  const { data: hms, error: errH } = await db.from("hm_slack").select("slack_user_id");
  if (errH) throw new Error(`hm_slack : ${errH.message}`);
  const pris = new Set<string>();
  for (const p of posteurs ?? []) if (p.slack_user_id) pris.add(p.slack_user_id);
  for (const h of hms ?? []) if (h.slack_user_id) pris.add(h.slack_user_id);
  return { posteurs: posteurs ?? [], pris };
}

async function enregistrerMembres(db: Db, membres: MembreSlack[]): Promise<void> {
  const vu = new Date().toISOString();
  for (let i = 0; i < membres.length; i += 500) {
    const lot = membres.slice(i, i + 500).map((m) => ({ ...m, vu_at: vu }));
    const { error } = await db.from("slack_membres").upsert(lot, { onConflict: "slack_user_id" });
    if (error) throw new Error(`slack_membres : ${error.message}`);
  }
}

export interface ResultatSynchro {
  membres: number;
  posteurs: number;
  deja_relies: number;
  par_email: number;
  par_nom: number;
  poses: number;
  ambigus: number;
  restants: number;
}

/** Relit Slack et pose les liens sûrs. `simuler` : compte sans rien écrire. */
export async function synchroniser(
  db: Db,
  token: string,
  o: { simuler: boolean; source: string },
  fetchFn: Fetch = fetch,
): Promise<ResultatSynchro> {
  const membres = await lireMembres(token, fetchFn);
  const { posteurs, pris } = await chargerPosteursEtPris(db);
  const { liens, ambigus } = apparier(posteurs, membres, pris);
  let poses = 0;
  if (!o.simuler) {
    await enregistrerMembres(db, membres);
    const { data, error } = await db.rpc("slack_appliquer_liens", { p_liens: liens });
    if (error) throw new Error(`slack_appliquer_liens : ${error.message}`);
    poses = Number(data ?? 0);
  }
  const deja = posteurs.filter((p) => p.slack_user_id).length;
  const resultat: ResultatSynchro = {
    membres: membres.filter(membreHumain).length,
    posteurs: posteurs.length,
    deja_relies: deja,
    par_email: liens.filter((l) => l.par === "email").length,
    par_nom: liens.filter((l) => l.par === "nom").length,
    poses,
    ambigus: ambigus.length,
    restants: posteurs.length - deja - (o.simuler ? liens.length : poses),
  };
  await db.from("slack_synchros").insert({ source: o.source, simulation: o.simuler, resultat });
  return resultat;
}

/** Un membre arrive dans le workspace (team_join) : on le relie s'il est sûr. */
// deno-lint-ignore no-explicit-any
export async function relierNouveau(db: Db, user: any): Promise<Lien | null> {
  const membre = membreDepuisApi(user);
  if (!membreHumain(membre)) return null;
  await enregistrerMembres(db, [membre]);
  // Tout le workspace connu, pour qu'un homonyme déjà présent empêche le lien.
  const connus: MembreSlack[] = [];
  for (let debut = 0; ; debut += 1000) {
    const { data, error } = await db
      .from("slack_membres")
      .select("slack_user_id, nom_reel, nom_affiche, email, bot, supprime")
      .order("slack_user_id")
      .range(debut, debut + 999);
    if (error) throw new Error(`slack_membres : ${error.message}`);
    connus.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  const { posteurs, pris } = await chargerPosteursEtPris(db);
  const { liens } = apparier(posteurs, connus, pris, "team_join");
  const lien = liens.find((l) => l.slack_user_id === membre.slack_user_id);
  if (!lien) return null;
  const { error } = await db.rpc("slack_appliquer_liens", { p_liens: [lien] });
  if (error) throw new Error(`slack_appliquer_liens : ${error.message}`);
  return lien;
}
