/**
 * hub-posteurs — guichet du site (Sophia Culture Hub, Lovable) vers l'OS
 * (migration 0296, docs/hub-posteurs.md).
 *
 * Le site recrute les posters slideshow ; dès que l'un d'eux signe son
 * contrat, il l'envoie ici pour qu'il soit créé dans l'OS, rattaché au HM de
 * son pays, puis il lui envoie ses identifiants par email. Appels serveur à
 * serveur uniquement, en-tête `x-hub-secret` (secret `OS_HUB_SECRET`, le même
 * des deux côtés ; il ne descend jamais dans un navigateur).
 *
 *   { action: "ping" }
 *   { action: "zones" }
 *       Pays couverts par un HM : ouverts, ou fermés (langue du pays non gérée
 *       par le HM). Le site grise « Accepter » pour un pays non ouvert.
 *   { action: "creer_posteur", hub_id, prenom, nom, email_perso, pays_code,
 *     pays_nom, applications }
 *       Crée le poster par le MÊME chemin que l'admin (manage-users `create` :
 *       login @sophia.com, mot de passe 12345678 comme tout compte OS, premier
 *       compte perso, labels, persona), dans la langue de son pays, puis le
 *       rattache au profil « RUUL cohort » (réglage `hub_posteurs`), ou à
 *       défaut au HM de sa zone. Le warm-up n'est pas lancé :
 *       c'est le poster qui le démarre dans l'OS, comme aujourd'hui ; lancé
 *       avant son lundi de démarrage (`start_monday`), il dure jusqu'à ce
 *       lundi (trigger de 0296) — premiers posts et paie partent du lundi.
 *       Idempotent sur `hub_id` : un rejeu renvoie `existed: true` et, si le
 *       poster ne s'est jamais connecté, son mot de passe remis à 12345678
 *       (sinon `password: null`, `deja_connecte: true`).
 *   { action: "posts_semaine", profile_ids, lundi }
 *       Prévus / publiés / manqués de la semaine par poster (paie du site).
 *   { action: "stats_pays" }
 *       Posters actifs par langue de publication.
 *   { action: "identites", hub_ids }
 *       Prénom et nom légaux (pièce d'identité) saisis par le poster dans
 *       l'accueil de l'OS, pour l'ajouter dans Ruul. Seuls ceux qui les ont
 *       donnés sont rendus.
 *
 * Réponses `{ ok: true, … }` ou `{ ok: false, error }`. Un 4xx est un refus
 * définitif (le site ne réessaie pas et l'affiche sur la fiche), un 5xx est
 * réessayable.
 */

import {
  carteDesZones,
  codePays,
  dateIso,
  estUuid,
  idCohorteRuul,
  MOT_DE_PASSE_INITIAL,
  partsPourApplications,
  paysAEnvoyer,
  type Recruteur,
  reservationPerimee,
  resoudreAffectation,
  secretValide,
} from "../_shared/hub_posteurs.ts";
import { lireParLots } from "../_shared/lots.ts";
import { corsHeaders, json, messageErreur, serviceClient } from "../_shared/supabase.ts";

const VERSION = "2026-10-17c";
const POSTS_PAR_JOUR = 2;
const PROFILS_MAX = 500;

// deno-lint-ignore no-explicit-any
type Supabase = any;

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: { ...corsHeaders, "access-control-allow-headers": `${corsHeaders["access-control-allow-headers"]}, x-hub-secret` },
    });
  }

  // Sans en-tête : 401 d'emblée, avant même de lire la configuration (le test
  // de fumée du déploiement attend un 401/403 d'une fonction saine).
  const recu = request.headers.get("x-hub-secret");
  if (!recu) return json({ ok: false, error: "unauthorized" }, 401);
  const attendu = Deno.env.get("OS_HUB_SECRET") ?? "";
  if (!attendu) return json({ ok: false, error: "OS_HUB_SECRET non configuré" }, 500);
  if (!(await secretValide(recu, attendu))) return json({ ok: false, error: "unauthorized" }, 401);

  // deno-lint-ignore no-explicit-any
  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "corps JSON requis" }, 400);
  }

  const supabase = serviceClient();
  try {
    switch (body?.action) {
      case "ping":
        return json({ ok: true, version: VERSION });
      case "zones":
        return json({ ok: true, ...carteDesZones(await lireRecruteurs(supabase)) });
      case "creer_posteur":
        return await creerPosteur(supabase, body);
      case "posts_semaine":
        return await postsSemaine(supabase, body);
      case "stats_pays":
        return await statsPays(supabase);
      case "identites":
        return await identites(supabase, body);
      default:
        return json({ ok: false, error: "action inconnue (ping | zones | creer_posteur | posts_semaine | stats_pays | identites)" }, 400);
    }
  } catch (e) {
    return json({ ok: false, error: messageErreur(e) }, 500);
  }
});

// ---------------------------------------------------------------------------

/** HM actifs qui ont une zone, avec leur nombre de créateurs actifs. */
async function lireRecruteurs(supabase: Supabase): Promise<Recruteur[]> {
  const { data: roles, error: errRoles } = await supabase
    .from("user_roles")
    .select("user_id")
    .eq("role", "hiring_manager");
  if (errRoles) throw errRoles;
  const ids = [...new Set((roles ?? []).map((r: { user_id: string }) => r.user_id))] as string[];
  if (ids.length === 0) return [];

  const profils = await lireParLots<{
    id: string;
    prenom: string | null;
    nom: string | null;
    email: string | null;
    zone_recrutement: string | null;
    langues: string[] | null;
  }>(ids, "recruteurs", (lot) =>
    supabase
      .from("profiles")
      .select("id, prenom, nom, email, zone_recrutement, langues")
      .in("id", lot)
      .eq("is_active", true)
      .not("zone_recrutement", "is", null));

  return await Promise.all(profils.map(async (p) => {
    const { count, error } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("manager_id", p.id)
      .eq("is_active", true);
    if (error) throw error;
    return { ...p, posters_actifs: count ?? 0 };
  }));
}

function managerPublic(p: { id: string; prenom: string | null; nom: string | null; email: string | null } | null) {
  return p ? { id: p.id, prenom: p.prenom ?? "", nom: p.nom ?? "", email: p.email ?? "" } : null;
}

// deno-lint-ignore no-explicit-any
async function creerPosteur(supabase: Supabase, body: any): Promise<Response> {
  const hubId = String(body.hub_id ?? "").trim().toLowerCase();
  const prenom = String(body.prenom ?? "").trim();
  const nom = String(body.nom ?? "").trim();
  const emailPerso = String(body.email_perso ?? "").trim().toLowerCase() || null;
  if (!estUuid(hubId) || !prenom) {
    return json({ ok: false, error: "hub_id (uuid) et prenom requis" }, 400);
  }

  // 1. Déjà vu ? Un rejeu (retry du site, bouton « Retry ») ne crée jamais un second poster.
  const { data: lien, error: errLien } = await supabase
    .from("hub_posteurs")
    .select("*")
    .eq("hub_id", hubId)
    .maybeSingle();
  if (errLien) throw errLien;
  if (lien?.statut === "cree" && lien.profile_id) return await dejaCree(supabase, lien);
  if (lien?.statut === "en_cours" && !reservationPerimee(lien.reserve_at)) {
    return json({ ok: false, error: "creation_en_cours : réessayer dans quelques minutes" }, 409);
  }

  // 2. Pays → HM → langue de publication. Pas de HM = zone pas encore ouverte.
  const pays = codePays(body.pays_code, body.pays_nom);
  if (!pays) return json({ ok: false, error: "pays_inconnu" }, 422);
  const affectation = resoudreAffectation(pays, await lireRecruteurs(supabase));
  if (!affectation.ok) {
    return json({
      ok: false,
      error: affectation.raison,
      pays_code: pays,
      ...(affectation.raison === "langue_non_geree"
        ? { langue: affectation.langue, manager: managerPublic(affectation.hm) }
        : {}),
    }, 422);
  }
  // Le HM de la zone décide de la langue et de l'ouverture du pays ; le poster,
  // lui, est rattaché à la cohorte Ruul quand elle est configurée.
  const { hm, langue } = affectation;
  const rattachement = (await lireCohorteRuul(supabase)) ?? hm;
  const parts = partsPourApplications(body.applications);
  const applications = parts ? Object.keys(parts) : ["sophia"];

  // 3. Réserver la création (ou reprendre une réservation laissée par un appel mort).
  const reservation = {
    statut: "en_cours",
    email_perso: emailPerso,
    pays_code: pays,
    langue,
    applications,
    manager_id: rattachement.id,
    // Lundi fixe : le trigger de 0296 repousse la fin du warm-up à ce lundi.
    debut_le: dateIso(body.start_monday),
    reserve_at: new Date().toISOString(),
  };
  if (lien) {
    const { data: repris, error } = await supabase
      .from("hub_posteurs")
      .update(reservation)
      .eq("hub_id", hubId)
      .eq("statut", "en_cours")
      .eq("reserve_at", lien.reserve_at)
      .select("hub_id");
    if (error) throw error;
    if (!repris?.length) return json({ ok: false, error: "creation_en_cours : réessayer dans quelques minutes" }, 409);
  } else {
    const { error } = await supabase.from("hub_posteurs").insert({ hub_id: hubId, ...reservation });
    if (error?.code === "23505") {
      return json({ ok: false, error: "creation_en_cours : réessayer dans quelques minutes" }, 409);
    }
    if (error) throw error;
  }

  // 4. Création par le chemin de l'admin (manage-users), jamais un second chemin.
  const password = MOT_DE_PASSE_INITIAL;
  const paysCompte = paysAEnvoyer(langue, pays);
  const cree = await appelerManageUsers({
    action: "create",
    prenom,
    nom,
    password,
    langue,
    type_compte: "perso",
    posts_par_jour: POSTS_PAR_JOUR,
    ...(paysCompte ? { pays: paysCompte } : {}),
    ...(parts ? { parts_applications: parts } : {}),
  });
  if (!cree.ok) {
    if (cree.incertain) {
      // Issue inconnue (coupure, 5xx) : le login a pu être créé. On garde la
      // réservation : un rejeu dans les 5 min prend un 409, après il reprend.
      return json({ ok: false, error: `manage-users : ${cree.error}` }, 502);
    }
    await supabase.from("hub_posteurs").delete().eq("hub_id", hubId).eq("statut", "en_cours");
    return json({ ok: false, error: `creation_refusee : ${cree.error}` }, 422);
  }

  // 5. Le lien d'abord (un rejeu retrouvera le poster), puis le profil.
  const { error: errCree } = await supabase
    .from("hub_posteurs")
    .update({ statut: "cree", profile_id: cree.userId, compte_id: cree.compteId, email_os: cree.email, cree_at: new Date().toISOString() })
    .eq("hub_id", hubId);
  if (errCree) throw errCree;
  const { error: errProfil } = await supabase
    .from("profiles")
    .update({ manager_id: rattachement.id })
    .eq("id", cree.userId);
  if (errProfil) throw errProfil;

  return json({
    ok: true,
    existed: false,
    profile_id: cree.userId,
    compte_id: cree.compteId,
    email_os: cree.email,
    password,
    langue,
    manager: managerPublic(rattachement),
  });
}

/** Le profil « RUUL cohort » (réglage `hub_posteurs`), s'il existe et est actif. */
async function lireCohorteRuul(
  supabase: Supabase,
): Promise<{ id: string; prenom: string | null; nom: string | null; email: string | null } | null> {
  const { data: reglage, error } = await supabase
    .from("reglages")
    .select("valeur")
    .eq("cle", "hub_posteurs")
    .maybeSingle();
  if (error) throw error;
  const id = idCohorteRuul(reglage?.valeur);
  if (!id) return null;
  const { data: profil, error: errProfil } = await supabase
    .from("profiles")
    .select("id, prenom, nom, email")
    .eq("id", id)
    .eq("is_active", true)
    .maybeSingle();
  if (errProfil) throw errProfil;
  return profil ?? null;
}

/** Rejeu sur un poster déjà créé : rien n'est recréé, le rattachement au HM est revérifié. */
// deno-lint-ignore no-explicit-any
async function dejaCree(supabase: Supabase, lien: any): Promise<Response> {
  const { data: profil, error } = await supabase
    .from("profiles")
    .select("id, email, manager_id")
    .eq("id", lien.profile_id)
    .maybeSingle();
  if (error) throw error;
  if (!profil) return json({ ok: false, error: "poster supprimé dans l'OS" }, 409);

  let managerId = profil.manager_id as string | null;
  if (!managerId && lien.manager_id) {
    await supabase.from("profiles").update({ manager_id: lien.manager_id }).eq("id", profil.id);
    managerId = lien.manager_id;
  }
  const { data: manager } = managerId
    ? await supabase.from("profiles").select("id, prenom, nom, email").eq("id", managerId).maybeSingle()
    : { data: null };

  // Jamais connecté : ses identifiants ont pu se perdre en route, on remet le
  // mot de passe de départ pour que l'email renvoyé dise vrai. Déjà connecté :
  // on ne touche à rien.
  const { data: auth } = await supabase.auth.admin.getUserById(profil.id);
  const jamaisConnecte = !auth?.user?.last_sign_in_at;
  let password: string | null = null;
  if (jamaisConnecte) {
    password = MOT_DE_PASSE_INITIAL;
    const { error: errMdp } = await supabase.auth.admin.updateUserById(profil.id, { password });
    if (errMdp) throw errMdp;
  }

  return json({
    ok: true,
    existed: true,
    profile_id: profil.id,
    compte_id: lien.compte_id ?? null,
    email_os: profil.email,
    password,
    deja_connecte: !jamaisConnecte,
    langue: lien.langue ?? null,
    manager: managerPublic(manager),
  });
}

type ResultatCreation =
  | { ok: true; userId: string; email: string; compteId: string | null }
  | { ok: false; incertain: boolean; error: string };

async function appelerManageUsers(corps: Record<string, unknown>): Promise<ResultatCreation> {
  const url = Deno.env.get("SUPABASE_URL");
  const cron = Deno.env.get("CRON_SECRET");
  if (!url || !cron) return { ok: false, incertain: false, error: "SUPABASE_URL ou CRON_SECRET manquant" };

  let reponse: Response;
  try {
    reponse = await fetch(`${url}/functions/v1/manage-users`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-cron-secret": cron },
      body: JSON.stringify(corps),
      signal: AbortSignal.timeout(90_000),
    });
  } catch (e) {
    return { ok: false, incertain: true, error: messageErreur(e) };
  }
  // deno-lint-ignore no-explicit-any
  const charge: any = await reponse.json().catch(() => null);
  if (reponse.ok && charge?.ok && charge.userId) {
    return { ok: true, userId: String(charge.userId), email: String(charge.email ?? ""), compteId: charge.compte?.id || null };
  }
  const erreur = String(charge?.error ?? `HTTP ${reponse.status}`).slice(0, 300);
  // Un 5xx (ou une réponse illisible) peut arriver APRÈS createUser : issue inconnue.
  return { ok: false, incertain: reponse.status >= 500 || !charge, error: erreur };
}

// deno-lint-ignore no-explicit-any
async function postsSemaine(supabase: Supabase, body: any): Promise<Response> {
  const lundi = dateIso(body.lundi);
  const brut = Array.isArray(body.profile_ids) ? body.profile_ids : null;
  if (!lundi || !brut) return json({ ok: false, error: "profile_ids (uuid[]) et lundi (YYYY-MM-DD) requis" }, 400);
  const ids = [...new Set(brut.filter(estUuid).map((s: string) => s.toLowerCase()))] as string[];
  if (ids.length > PROFILS_MAX) return json({ ok: false, error: `au plus ${PROFILS_MAX} profils par appel` }, 400);
  if (ids.length === 0) return json({ ok: true, rows: [] });

  const { data, error } = await supabase.rpc("hub_posts_semaine", { p_profile_ids: ids, p_lundi: lundi });
  if (error) throw error;
  return json({ ok: true, rows: data ?? [] });
}

async function statsPays(supabase: Supabase): Promise<Response> {
  const { data, error } = await supabase.rpc("hub_stats_langues");
  if (error) throw error;
  return json({ ok: true, by_langue: data ?? [] });
}

/** Nom légal saisi dans l'accueil de l'OS, pour l'ajout dans Ruul. Absent tant que le poster ne l'a pas donné. */
// deno-lint-ignore no-explicit-any
async function identites(supabase: Supabase, body: any): Promise<Response> {
  const brut = Array.isArray(body.hub_ids) ? body.hub_ids : null;
  if (!brut) return json({ ok: false, error: "hub_ids (uuid[]) requis" }, 400);
  const ids = [...new Set(brut.filter(estUuid).map((s: string) => s.toLowerCase()))] as string[];
  if (ids.length > PROFILS_MAX) return json({ ok: false, error: `au plus ${PROFILS_MAX} hub_ids par appel` }, 400);
  if (ids.length === 0) return json({ ok: true, rows: [] });

  const { data, error } = await supabase
    .from("hub_posteurs")
    .select("hub_id, prenom_legal, nom_legal, identite_le")
    .in("hub_id", ids)
    .not("identite_le", "is", null);
  if (error) throw error;
  return json({ ok: true, rows: data ?? [] });
}
