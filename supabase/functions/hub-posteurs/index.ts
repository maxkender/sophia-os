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
 *       Pays ouverts = pays ouverts dans l'OS (zone de paie active dans
 *       `zones_paie_pays`), avec langue de publication, zone, HM de zone et
 *       `langue_os` (langue du pays connue et publiée par des comptes actifs).
 *       Le site grise « Accepter » pour tout autre pays.
 *   { action: "creer_posteur", hub_id, prenom, nom, email_perso, pays_code,
 *     pays_nom, applications, ruul_email?, ref?, plateforme_paie?, zone?,
 *     tarif_semaine?, start_monday?, application_id? }
 *       0589 : plateforme_paie (« ruul »), zone (A/B/C/US), tarif de la semaine
 *       (USD), email Ruul (peut être vide) et application du site sont gardés
 *       sur le profil. Un posteur Ruul n'a jamais de contrat Upwork. 0867 :
 *       sans zone ni tarif (ancien site), ceux du pays dans l'OS à la création
 *       sont figés sur la fiche (zoneEtTarifSignes).
 *       `applications` : gardé pour mémoire (`hub_posteurs.applications`) ;
 *       depuis le 19/11 c'est le moteur de l'OS qui choisit l'application du
 *       compte, comme pour toute autre recrue (cible de la page Allocation).
 *       Crée le poster par le MÊME chemin que l'admin (manage-users `create` :
 *       login @sophia.com, mot de passe unique et aléatoire (13/11 ; avant : 12345678 pour
 *       l'instant ; c'est CE mot de passe qui est renvoyé au site), premier
 *       compte perso, labels, persona), dans la langue de son pays, puis le
 *       rattache au profil « RUUL cohort » (réglage `hub_posteurs`), ou à
 *       défaut au HM de sa zone. Le warm-up n'est pas lancé :
 *       c'est le poster qui le démarre dans l'OS, comme aujourd'hui ; lancé
 *       avant son lundi de démarrage (`start_monday`), il dure jusqu'à ce
 *       lundi (trigger de 0296) — premiers posts et paie partent du lundi.
 *       Idempotent sur `hub_id` : un rejeu renvoie `existed: true` et, si le
 *       poster ne s'est jamais connecté, un mot de passe neuf remis et renvoyé (sinon
 *       `password: null`, `deja_connecte: true`).
 *   { action: "posts_semaine", profile_ids, lundi }
 *       Prévus / publiés / manqués de la semaine par poster (paie du site).
 *   { action: "stats_pays" }
 *       Posters actifs par langue de publication.
 *   { action: "maj_ruul", application_id, ruul_email }
 *       0589 : le site signale un nouvel email Ruul (vide : effacé). Le
 *       posteur est retrouvé par application_id (repli : hub_id, profile_id).
 *   { action: "parrainages", offset?, limit?, page? }
 *       0588 (lecture seule) : une ligne plate par filleul — id, ref,
 *       referrer_name, referrer_channel (upwork|ruul), friend_first_name,
 *       friend_last_name, friend_email, country, created_at, invitation_status,
 *       j0_sent_at, j2_sent_at, j5_sent_at, opened_at, clicked_at,
 *       unsubscribed_at, bounced_at, applied_at, recrue_id, first_login_at,
 *       first_post_at, bonus_status (none|pending|paid), bonus_paid_at.
 *       500 lignes au plus par appel : { rows, total, offset, next_offset }
 *       (next_offset null = dernière page). « page » (1, 2…) = offset (page-1)×500.
 *   { action: "identites", hub_ids }
 *       Prénom et nom légaux (pièce d'identité) saisis par le poster dans
 *       l'accueil de l'OS, pour l'ajouter dans Ruul. Seuls ceux qui les ont
 *       donnés sont rendus.
 *
 *   { action: "rejouer_bloques", simuler?, max?, hub_ids? }   (x-cron-secret SEULEMENT, 24/11)
 *       Les signés restés en « en_cours » (réservation périmée, candidature signée sans
 *       os_profile_id) : le corps du site est reconstruit (`corpsRejeu`) et passe par
 *       `creer_posteur`. `simuler` : la liste et les corps seulement. 40 au plus, en séquence.
 *
 * Réponses `{ ok: true, … }` ou `{ ok: false, error }`. Un 4xx est un refus
 * définitif (le site ne réessaie pas et l'affiche sur la fiche), un 5xx est
 * réessayable.
 *
 * 0848 (24/11) : chaque appel authentifié est noté dans `hub_pont_appels`
 * (action, ok = code < 500, code, erreur ≤ 300 car.), jamais le corps ni le
 * secret. Un cron (5 min) ouvre une alerte dans Control (Aujourd'hui ›
 * Technique, DM Slack à Max) quand une action échoue sans interruption depuis
 * plus de 15 min ; elle se ferme au premier succès.
 */

import {
  applicationsDemandees,
  carteDesZones,
  type CandidatureBloquee,
  codePays,
  corpsRejeu,
  dateIso,
  estUuid,
  idCohorteRuul,
  paysAEnvoyer,
  type LanguesComptes,
  LANGUE_PAR_PAYS,
  type PaysOuvert,
  type PaysRecrute,
  type Recruteur,
  reservationPerimee,
  type ReservationBloquee,
  resoudreAffectationSite,
  secretValide,
  zoneEtTarifSignes,
} from "../_shared/hub_posteurs.ts";
import { actionPourJournal, appelReussi, erreurPourJournal } from "../_shared/hub_pont.ts";
import { lireParLots, lireTout } from "../_shared/lots.ts";
import { motDePasseRecrue } from "../_shared/mot_de_passe.ts";
import { aujourdhuiParis, corsHeaders, estSecretCron, json, messageErreur, secretCron, serviceClient } from "../_shared/supabase.ts";

const VERSION = "2026-11-10-ruul-p1";
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

  // 24/11 : `rejouer_bloques` (signés restés bloqués en « en_cours ») : x-cron-secret seulement,
  // regardé AVANT le secret du site et seulement quand l'en-tête est là. Rien d'autre par ce chemin.
  const cron = request.headers.get("x-cron-secret");
  if (cron && !request.headers.get("x-hub-secret")) {
    if (!(await estSecretCron(cron))) return json({ ok: false, error: "unauthorized" }, 401);
    // deno-lint-ignore no-explicit-any
    let corps: any = {};
    try {
      corps = await request.json();
    } catch {
      return json({ ok: false, error: "corps JSON requis" }, 400);
    }
    if (corps?.action !== "rejouer_bloques") return json({ ok: false, error: "x-cron-secret : rejouer_bloques seulement" }, 403);
    const supabase = serviceClient();
    let reponse: Response;
    try {
      reponse = await rejouerBloques(supabase, corps);
    } catch (e) {
      reponse = json({ ok: false, error: messageErreur(e) }, 500);
    }
    journaliser(() => supabase, "rejouer_bloques", reponse);
    return reponse;
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
    const reponse = json({ ok: false, error: "corps JSON requis" }, 400);
    journaliser(serviceClient, "?", reponse);
    return reponse;
  }

  const supabase = serviceClient();
  const reponse = await traiter(supabase, body);
  // 0848 : chaque appel authentifié est noté (action, code, erreur), sans attendre ni jamais casser la réponse.
  journaliser(() => supabase, actionPourJournal(body?.action), reponse);
  return reponse;
});

// deno-lint-ignore no-explicit-any
async function traiter(supabase: Supabase, body: any): Promise<Response> {
  try {
    switch (body?.action) {
      case "ping":
        return json({ ok: true, version: VERSION });
      case "zones": {
        const ouverts = await lirePaysOuverts(supabase);
        return json({
          ok: true,
          ...carteDesZones(
            ouverts,
            await lireRecruteurs(supabase),
            await lirePaysRecrutes(supabase),
            await lireLanguesComptes(supabase, ouverts.map((o) => o.pays)),
            await lireLanguesOs(supabase),
          ),
        });
      }
      case "creer_posteur":
        return await creerPosteur(supabase, body);
      case "posts_semaine":
        return await postsSemaine(supabase, body);
      case "stats_pays":
        return await statsPays(supabase);
      case "identites":
        return await identites(supabase, body);
      case "maj_ruul": {
        const { data, error } = await supabase.rpc("ruul_maj_email_app", {
          p_application_id: body.application_id ? String(body.application_id) : null,
          p_hub: body.hub_id ? String(body.hub_id) : null,
          p_profile: estUuid(body.profile_id) ? body.profile_id : null,
          p_email: String(body.ruul_email ?? ""),
        });
        if (error) throw error;
        const r = data as { ok: boolean; error?: string };
        return json(r, r.ok ? 200 : r.error === "posteur introuvable" ? 404 : 422);
      }
      case "parrainages": {
        // 0588 : lecture seule, paginée par 500.
        const limite = Math.min(Math.max(Number(body.limit) || 500, 1), 500);
        const page = Number(body.page);
        const offset = Number.isFinite(page) && page >= 1 ? (Math.floor(page) - 1) * limite : Math.max(Number(body.offset) || 0, 0);
        const { data, error } = await supabase.rpc("hub_parrainages_page", { p_offset: offset, p_limite: limite });
        if (error) throw error;
        return json({ ok: true, ...(data as Record<string, unknown>) });
      }
      case "candidature": {
        // 0561 : un candidat vient de postuler sur le site (email, code ?ref=) : les relances
        // de parrainage s'arrêtent et l'ami est noté « a postulé » chez son parrain.
        const { data, error } = await supabase.rpc("parrainage_rapprocher", {
          p_email: String(body.email ?? ""), p_ref: body.ref ? String(body.ref) : null, p_recrue: null,
        });
        return json(error ? { ok: false, error: error.message } : { ok: true, ...(data ?? {}) });
      }
      default:
        return json({ ok: false, error: "action inconnue (ping | zones | creer_posteur | posts_semaine | stats_pays | identites | candidature)" }, 400);
    }
  } catch (e) {
    return json({ ok: false, error: messageErreur(e) }, 500);
  }
}

/**
 * 0848 : note l'appel dans `hub_pont_appels` (action, ok, code, erreur tronquée) pour l'alerte
 * « Pont Hub ↔ OS » de Control. Jamais le corps de la requête ni le secret. « Fire and forget » :
 * l'écriture part après la réponse et un échec d'écriture est seulement loggé.
 */
function journaliser(client: () => Supabase, action: string, reponse: Response): void {
  const code = reponse.status;
  const lecture = code >= 400
    ? reponse.clone().json().then((c: { error?: unknown }) => c?.error ?? null, () => null)
    : Promise.resolve(null);
  const ecrit = (async () => {
    try {
      const erreur = erreurPourJournal(await lecture);
      const { error } = await client().from("hub_pont_appels").insert({ action, ok: appelReussi(code), code, erreur });
      if (error) console.error("[hub-posteurs] hub_pont_appels", error.message);
    } catch (e) {
      console.error("[hub-posteurs] hub_pont_appels", messageErreur(e));
    }
  })();
  const edge = (globalThis as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (edge) edge.waitUntil(ecrit);
}

// ---------------------------------------------------------------------------

/**
 * HM actifs qui ont une zone, avec leur nombre de créateurs actifs. Un Head of
 * Ops cumule l'espace HM et garde sa zone et ses créateurs : il compte aussi
 * (sinon passer HM → Head of Ops fermait ses pays au site, Italie le 22/10).
 */
async function lireRecruteurs(supabase: Supabase): Promise<Recruteur[]> {
  const { data: roles, error: errRoles } = await supabase
    .from("user_roles")
    .select("user_id")
    .in("role", ["hiring_manager", "head_of_ops"]);
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

/** Le tarif de la semaine (USD) de chaque zone de paie (`zones_paie` : A, B, C, US…). */
async function lireTarifsZones(supabase: Supabase): Promise<Record<string, number | null>> {
  const { data, error } = await supabase.from("zones_paie").select("zone, tarif");
  if (error) throw error;
  return Object.fromEntries(
    ((data ?? []) as { zone: string; tarif: number | string | null }[]).map((z) => [z.zone, z.tarif == null ? null : Number(z.tarif)]),
  );
}

/** Pays ouverts dans l'OS : zone de paie active (`zones_paie_pays`, `retire_at` nul). */
async function lirePaysOuverts(supabase: Supabase): Promise<PaysOuvert[]> {
  const { data, error } = await supabase.from("zones_paie_pays").select("pays, zone").is("retire_at", null);
  if (error) throw error;
  return (data ?? []) as PaysOuvert[];
}

/**
 * Langues des comptes de l'OS pour les pays sans langue fixée
 * (`LANGUE_PAR_PAYS`) : la plus fréquente sert de langue de publication.
 */
async function lireLanguesComptes(supabase: Supabase, pays: string[]): Promise<LanguesComptes> {
  const sansLangue = pays.filter((p) => !LANGUE_PAR_PAYS[p]);
  if (sansLangue.length === 0) return {};
  // 24/11 : plus de 1000 comptes : lus par pages (le plafond PostgREST cassait « zones » depuis 01:17 UTC).
  const data = await lireTout<{ id: string; pays: string | null; langue: string | null }>(
    "hub zones : langues des comptes",
    (curseur, taille) => {
      let q = supabase.from("comptes").select("id, pays, langue").in("pays", sansLangue);
      if (curseur) q = q.gt("id", curseur.id);
      return q.order("id", { ascending: true }).limit(taille);
    },
    { ancre: (l) => l.id },
  );
  const parPays: Record<string, Record<string, number>> = {};
  for (const c of data) {
    if (!c.pays || !c.langue) continue;
    const l = (parPays[c.pays] ??= {});
    l[c.langue] = (l[c.langue] ?? 0) + 1;
  }
  return parPays;
}

/** Langues dans lesquelles publient les comptes actifs de l'OS. */
async function lireLanguesOs(supabase: Supabase): Promise<Set<string>> {
  const data = await lireTout<{ id: string; langue: string | null }>(
    "hub zones : langues de l'OS",
    (curseur, taille) => {
      let q = supabase.from("comptes").select("id, langue").eq("is_active", true);
      if (curseur) q = q.gt("id", curseur.id);
      return q.order("id", { ascending: true }).limit(taille);
    },
    { ancre: (l) => l.id },
  );
  return new Set(data.map((c) => c.langue).filter((l): l is string => !!l));
}

/** Pays recrutés (`hm_pays`, 0516), avec leur HM quand elle a un compte OS. */
async function lirePaysRecrutes(supabase: Supabase): Promise<PaysRecrute[]> {
  const { data, error } = await supabase.from("hm_pays").select("pays, hm_id");
  if (error) throw error;
  return (data ?? []) as PaysRecrute[];
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

  // 2. Pays ouvert dans l'OS (zone de paie active) → langue de publication.
  //    Tout autre pays : « zone_non_ouverte ».
  const pays = codePays(body.pays_code, body.pays_nom);
  if (!pays) return json({ ok: false, error: "pays_inconnu" }, 422);
  const affectation = resoudreAffectationSite(
    pays,
    await lirePaysOuverts(supabase),
    await lireRecruteurs(supabase),
    await lirePaysRecrutes(supabase),
    await lireLanguesComptes(supabase, [pays]),
  );
  if (!affectation.ok) return json({ ok: false, error: affectation.raison, pays_code: pays }, 422);
  // 0867 : les tarifs des zones, lus AVANT toute création (une panne ici ne laisse rien à moitié fait).
  const tarifsZones = await lireTarifsZones(supabase);
  // Le poster est rattaché à la cohorte Ruul ; la HM de la zone n'est qu'une
  // information (page Posters), et le rattachement de repli sans cohorte.
  const { hm, langue } = affectation;
  const rattachement = (await lireCohorteRuul(supabase)) ?? hm;
  if (!rattachement) {
    return json({ ok: false, error: "sans_rattachement : cohorte Ruul non configurée et pas de HM pour ce pays", pays_code: pays }, 422);
  }
  // Ce que le site demande, pour mémoire seulement : c'est le moteur qui
  // choisit l'application du compte (voir l'appel à manage-users plus bas).
  const applications = applicationsDemandees(body.applications);

  // 3. Réserver la création (ou reprendre une réservation laissée par un appel mort).
  const reservation = {
    statut: "en_cours",
    email_perso: emailPerso,
    pays_code: pays,
    langue,
    applications,
    manager_id: rattachement.id,
    // HM de la zone du pays : la page Posters range le poster dans sa zone.
    hm_zone_id: hm?.id ?? null,
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

  // 4. Reprise d'une réservation laissée par un appel à l'issue inconnue : le posteur a pu être créé. On le
  //    cherche avant d'en créer un autre (24/11 : sans ce contrôle, chaque reprise recréait un posteur complet,
  //    jusqu'à 23 profils pour une même recrue, voir 0851).
  let reprise: ResultatCreation | null = null;
  if (lien) {
    const orphelin = await posteurOrphelin(supabase, String(lien.created_at ?? lien.reserve_at), prenom, nom);
    if (orphelin.statut === "incomplet") {
      const erreur = `creation_incertaine : un essai précédent a créé ${orphelin.profileIds.length} posteur(s) sans compte complet, ` +
        `à vérifier avant d'en créer un autre (${orphelin.profileIds.join(", ")})`;
      await noterEchec(supabase, hubId, emailPerso, `${prenom} ${nom}`.trim(), erreur);
      return json({ ok: false, error: erreur }, 409);
    }
    if (orphelin.statut === "complet") {
      reprise = { ok: true, userId: orphelin.profileId, email: orphelin.email, compteId: orphelin.compteId, password: null };
    }
  }

  // 5. Création par le chemin de l'admin (manage-users), jamais un second chemin.
  const paysCompte = paysAEnvoyer(langue, pays);
  const cree = reprise ?? await appelerManageUsers({
    action: "create",
    prenom,
    nom,
    // 13/11 (Réparer Ruul, point 5) : plus jamais de mot de passe par défaut : un mot de passe unique et
    // aléatoire par compte. Le site le reçoit dans la réponse (son email de bienvenue dit le bon).
    password: motDePasseRecrue(),
    langue,
    type_compte: "perso",
    posts_par_jour: POSTS_PAR_JOUR,
    // AUCUNE application ici (19/11) : le corps est celui d'un recruteur qui
    // n'a rien coché, et c'est le moteur de manage-users qui choisit
    // l'application du compte d'après la cible de la page Allocation
    // (`choisirApplicationPourCompte`), comme pour toute autre recrue. Avant,
    // le site décidait (18/10) : il demandait toujours Sophia, et une recrue
    // sur trois échappait à la cible.
    ...(paysCompte ? { pays: paysCompte } : {}),
  });
  if (!cree.ok) {
    if (cree.incertain) {
      // Issue inconnue (coupure, 5xx) : le login a pu être créé. On garde la
      // réservation : un rejeu dans les 5 min prend un 409, après il reprend.
      return json({ ok: false, error: `manage-users : ${cree.error}` }, 502);
    }
    await supabase.from("hub_posteurs").delete().eq("hub_id", hubId).eq("statut", "en_cours");
    await noterEchec(supabase, hubId, emailPerso, `${prenom} ${nom}`.trim(), `creation_refusee : ${cree.error}`);
    // 24/11 : une panne côté OS que manage-users a annulée (rien n'a été créé) se réessaie : 502, pas 422.
    return json({ ok: false, error: `creation_refusee : ${cree.error}` }, cree.reessayable ? 502 : 422);
  }

  // Sans mot de passe dans la réponse (ne devrait pas arriver ; jamais pour une reprise) : on en met un en place nous-mêmes.
  let password = cree.password;
  if (!password) {
    password = motDePasseRecrue();
    const { error: errMdp } = await supabase.auth.admin.updateUserById(cree.userId, { password });
    if (errMdp) throw errMdp;
  }

  // 6. Le lien d'abord (un rejeu retrouvera le poster), puis le profil.
  const { error: errCree } = await supabase
    .from("hub_posteurs")
    // 0583 : mdp_reel = le mot de passe renvoyé au site est bien celui en place (le rattrapage n'y touche pas).
    .update({ statut: "cree", profile_id: cree.userId, compte_id: cree.compteId, email_os: cree.email, cree_at: new Date().toISOString(), mdp_reel: true })
    .eq("hub_id", hubId);
  if (errCree) throw errCree;
  // 0690 : un échec passé pour ce signé est réglé.
  await supabase.from("hub_echecs").update({ resolu_at: new Date().toISOString() }).eq("hub_id", hubId).is("resolu_at", null);
  // 0574 : tous les posteurs du site sont payés par Ruul ; l'email Ruul vient de la page de signature.
  // 0589 : il peut être vide (le site l'enverra par maj_ruul, ou le posteur l'ajoute sur son dashboard) ;
  // zone, tarif de la semaine (USD) et application du site sont gardés sur le profil.
  const emailRuul = String(body.ruul_email ?? "").trim().toLowerCase();
  // 0867 (26/11) : la zone et le tarif de la signature sont figés sur la fiche (Join les envoie ; pour l'ancien site,
  // ceux du pays dans l'OS à cette heure) : un changement de zone plus tard (États-Unis à 30 $) ne touche que les
  // nouvelles recrues. Zones lues dans zones_paie (A, B, C, US…), plus de liste en dur.
  const signes = zoneEtTarifSignes(body, affectation.zone, tarifsZones);
  const { error: errProfil } = await supabase
    .from("profiles")
    .update({
      manager_id: rattachement.id,
      canal_paie: "ruul",
      ruul_statut: "a_ajouter",
      ruul_email: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(emailRuul) ? emailRuul : null,
      ruul_zone: signes.zone,
      ruul_tarif_semaine: signes.tarif,
      site_application_id: body.application_id ? String(body.application_id).slice(0, 120) : null,
      ruul_jeton: crypto.randomUUID(),
    })
    .eq("id", cree.userId);
  if (errProfil) throw errProfil;

  // 0561 : un ami parrainé (son email, ou le code ?ref= transmis par le site) est relié à son parrain.
  const { error: errParrain } = await supabase.rpc("parrainage_rapprocher", {
    p_email: String(body.email_perso ?? ""), p_ref: body.ref ? String(body.ref) : null, p_recrue: cree.userId,
  });
  if (errParrain) console.error("parrainage_rapprocher", errParrain.message);

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

const REJEU_MAX = 40;

/**
 * 24/11 : les signés du site restés bloqués (l'appel `creer_posteur` échouait, le site ne réessaie plus) :
 * `hub_posteurs` en « en_cours », réservation périmée, candidature signée sans `os_profile_id`. Pour chacun,
 * le corps que le site aurait envoyé est reconstruit (`corpsRejeu`) et passe par LA MÊME `creerPosteur`
 * (idempotente par hub_id). `simuler: true` : la liste et les corps, rien n'est créé. `hub_ids` : se limiter
 * à ceux-là ; `max` : 40 au plus par appel, en séquence. Un signé à qui il manque un champ est écarté.
 * Créé : `ruul_candidatures.os_cree_at` / `os_profile_id` notés (le site ne les écrira pas, il n'a pas eu
 * la réponse). La bienvenue part ensuite par le parcours Ruul (cron horaire de la fonction ruul).
 */
// deno-lint-ignore no-explicit-any
async function rejouerBloques(supabase: Supabase, body: any): Promise<Response> {
  const simuler = body?.simuler === true;
  const max = Math.min(Math.max(Number(body?.max) || REJEU_MAX, 1), REJEU_MAX);
  const filtre = Array.isArray(body?.hub_ids) ? new Set(body.hub_ids.filter(estUuid).map((s: string) => s.toLowerCase())) : null;

  const { data: liens, error } = await supabase
    .from("hub_posteurs")
    .select("hub_id, email_perso, pays_code, applications, debut_le, reserve_at")
    .eq("statut", "en_cours")
    .is("profile_id", null);
  if (error) throw error;
  const perimes = ((liens ?? []) as (ReservationBloquee & { reserve_at: string | null })[])
    .filter((l) => reservationPerimee(l.reserve_at) && estUuid(l.hub_id) && (!filtre || filtre.has(l.hub_id.toLowerCase())));
  if (perimes.length === 0) return json({ ok: true, simuler, total: 0, bilan: [] });

  const { data: cands, error: errCands } = await supabase
    .from("ruul_candidatures")
    .select("site_id, nom, email, pays, pays_brut, ref, ruul_email, start_monday")
    .in("site_id", perimes.map((l) => l.hub_id))
    .not("signe_at", "is", null)
    .is("os_profile_id", null);
  if (errCands) throw errCands;
  const parId = new Map(((cands ?? []) as CandidatureBloquee[]).map((c) => [String(c.site_id).toLowerCase(), c]));

  const ouverts = await lirePaysOuverts(supabase);
  const tarifs = await lireTarifsZones(supabase);
  const aujourdhui = aujourdhuiParis();

  const aTraiter = perimes.filter((l) => parId.has(l.hub_id.toLowerCase()));
  const bilan: Record<string, unknown>[] = [];
  for (const l of aTraiter.slice(0, max)) {
    const { corps, manques } = corpsRejeu(parId.get(l.hub_id.toLowerCase())!, l, ouverts, tarifs, aujourdhui);
    if (manques.length) {
      bilan.push({ hub_id: l.hub_id, resultat: "ecarte", manques, corps });
      continue;
    }
    if (simuler) {
      bilan.push({ hub_id: l.hub_id, resultat: "a_creer", corps });
      continue;
    }
    try {
      const reponse = await creerPosteur(supabase, corps);
      // deno-lint-ignore no-explicit-any
      const r: any = await reponse.json().catch(() => null);
      if (reponse.ok && r?.ok && r.profile_id) {
        const { error: errCand } = await supabase
          .from("ruul_candidatures")
          .update({ os_cree_at: new Date().toISOString(), os_profile_id: r.profile_id })
          .eq("site_id", l.hub_id)
          .is("os_profile_id", null);
        if (errCand) console.error("[hub-posteurs] rejouer ruul_candidatures", errCand.message);
        bilan.push({ hub_id: l.hub_id, resultat: r.existed ? "deja_cree" : "cree", profile_id: r.profile_id, email_os: r.email_os ?? null });
      } else {
        bilan.push({ hub_id: l.hub_id, resultat: "erreur", code: reponse.status, erreur: r?.error ?? `HTTP ${reponse.status}` });
      }
    } catch (e) {
      bilan.push({ hub_id: l.hub_id, resultat: "erreur", erreur: messageErreur(e) });
    }
  }
  const compte = (x: string) => bilan.filter((b) => b.resultat === x).length;
  return json({
    ok: true, simuler, total: aTraiter.length, traites: bilan.length, reste: Math.max(aTraiter.length - max, 0),
    a_creer: compte("a_creer"), cree: compte("cree"), deja_cree: compte("deja_cree"), ecarte: compte("ecarte"), erreur: compte("erreur"),
    sans_candidature_signee: perimes.length - aTraiter.length, bilan,
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

/** 0690 : une création refusée laisse une trace (une ligne par signé), pour « Aujourd'hui ». */
async function noterEchec(supabase: Supabase, hubId: string, email: string | null, nom: string, erreur: string): Promise<void> {
  const { data } = await supabase.from("hub_echecs").select("essais").eq("hub_id", hubId).maybeSingle();
  const maintenant = new Date().toISOString();
  const { error } = data
    ? await supabase.from("hub_echecs").update({ erreur: erreur.slice(0, 500), essais: (data.essais as number) + 1, dernier_at: maintenant, resolu_at: null }).eq("hub_id", hubId)
    : await supabase.from("hub_echecs").insert({ hub_id: hubId, email, nom: nom.slice(0, 200), erreur: erreur.slice(0, 500) });
  if (error) console.error("[hub-posteurs] hub_echecs", error.message);
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

  // Jamais connecté : ses identifiants ont pu se perdre en route, on pose un mot de
  // passe neuf, unique et aléatoire (13/11 : plus de 12345678) et on renvoie CELUI-LÀ,
  // pour que l'email dise vrai. Déjà connecté : on ne touche à rien.
  const { data: auth } = await supabase.auth.admin.getUserById(profil.id);
  const jamaisConnecte = !auth?.user?.last_sign_in_at;
  let password: string | null = null;
  if (jamaisConnecte) {
    const neuf = motDePasseRecrue();
    const { error: errMdp } = await supabase.auth.admin.updateUserById(profil.id, { password: neuf });
    if (errMdp) throw errMdp;
    password = neuf;
    await supabase.from("hub_posteurs").update({ mdp_reel: true }).eq("hub_id", lien.hub_id);
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
  | { ok: true; userId: string; email: string; compteId: string | null; password: string | null }
  | { ok: false; incertain: boolean; reessayable?: boolean; error: string };

type Orphelin =
  | { statut: "aucun" }
  | { statut: "complet"; profileId: string; email: string; compteId: string }
  | { statut: "incomplet"; profileIds: string[] };

/**
 * 24/11 : un posteur créé par un essai précédent pour ce signé, dont la réponse s'est perdue : même prénom et
 * même nom (manage-users les enregistre tels qu'on les envoie), actif, sans contrat Upwork, créé depuis la
 * première réservation, et relié à aucun signé du Hub. « complet » : il a un compte actif avec son identité, on
 * le reprend tel quel. « incomplet » : il existe mais sans compte complet, un humain tranche (rien n'est créé).
 */
async function posteurOrphelin(supabase: Supabase, depuis: string, prenom: string, nom: string): Promise<Orphelin> {
  let requete = supabase
    .from("profiles")
    .select("id, email")
    .eq("prenom", prenom)
    .eq("is_active", true)
    .is("upwork_contract_id", null)
    // manage-users appelé par le Hub (cron) ne pose pas de manager : celui-ci est posé à l'étape 6.
    .is("manager_id", null)
    .gte("created_at", depuis)
    .order("created_at", { ascending: false })
    .limit(50);
  requete = nom ? requete.eq("nom", nom) : requete.is("nom", null);
  const { data, error } = await requete;
  if (error) throw error;
  const profils = (data ?? []) as { id: string; email: string | null }[];
  if (!profils.length) return { statut: "aucun" };

  const { data: lies, error: errLies } = await supabase
    .from("hub_posteurs")
    .select("profile_id")
    .in("profile_id", profils.map((p) => p.id));
  if (errLies) throw errLies;
  const dejaLies = new Set(((lies ?? []) as { profile_id: string | null }[]).map((l) => l.profile_id));
  const libres = profils.filter((p) => !dejaLies.has(p.id));
  if (!libres.length) return { statut: "aucun" };

  const { data: lus, error: errComptes } = await supabase
    .from("comptes")
    .select("id, poster_id, persona_nom")
    .in("poster_id", libres.map((p) => p.id))
    .eq("is_active", true);
  if (errComptes) throw errComptes;
  const comptes = (lus ?? []) as { id: string; poster_id: string; persona_nom: string | null }[];
  for (const p of libres) {
    const compte = comptes.find((c) => c.poster_id === p.id && (c.persona_nom ?? "").trim() !== "");
    if (compte) return { statut: "complet", profileId: p.id, email: p.email ?? "", compteId: compte.id };
  }
  return { statut: "incomplet", profileIds: libres.map((p) => p.id) };
}

async function appelerManageUsers(corps: Record<string, unknown>): Promise<ResultatCreation> {
  const url = Deno.env.get("SUPABASE_URL");
  const cron = await secretCron();
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
    // 9/11 : le mot de passe réellement mis en place par manage-users (aléatoire depuis le 31/10).
    const password = typeof charge.password === "string" && charge.password.length >= 8 ? charge.password : null;
    return { ok: true, userId: String(charge.userId), email: String(charge.email ?? ""), compteId: charge.compte?.id || null, password };
  }
  const erreur = String(charge?.error ?? `HTTP ${reponse.status}`).slice(0, 300);
  // 24/11 : manage-users annule désormais ce qu'il a créé quand il échoue après createUser, et le dit
  // (`annule`) : l'issue est alors connue, rien n'a été créé, et la panne se réessaie.
  if (charge?.annule === "supprime" || charge?.annule === "desactive" || charge?.annule === "rien_cree") {
    return { ok: false, incertain: false, reessayable: true, error: erreur };
  }
  // Un 5xx (ou une réponse illisible) peut arriver APRÈS createUser : issue inconnue.
  return { ok: false, incertain: reponse.status >= 500 || !charge, reessayable: reponse.status >= 500, error: erreur };
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
