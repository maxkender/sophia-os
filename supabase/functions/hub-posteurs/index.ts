import { lireParLots, lireTout } from "../_shared/lots.ts";
import {
  agregerSemaine,
  bornesSemaineParis,
  genererMotDePasse,
  type LigneSemaine,
  type PassageSemaine,
  type RecruteurZone,
  secretsEgaux,
  trouverRecruteurPourPays,
} from "../_shared/hub_posteurs.ts";
import { corsHeaders, json, messageErreur, serviceClient } from "../_shared/supabase.ts";

/**
 * Point d'entrée du HUB (sophia-culture.com, projet Lovable) pour les posteurs
 * venus du site — ceux qui ne passent PAS par Upwork. Voir docs/hub-posteurs.md.
 *
 * Authentification : en-tête `x-hub-secret` égal au secret `HUB_SECRET` de la
 * fonction (comparaison en temps constant). Pas de JWT : l'appelant est un
 * autre serveur, jamais un navigateur. Sans secret configuré, tout est refusé.
 *
 * Corps JSON `{ action, ...params }`. Réponse `{ ok: true, ... }` ou
 * `{ ok: false, error }`. Actions :
 *   - ping            → { version }
 *   - stats_pays      → actifs par langue et par zone de recruteur
 *   - creer_posteur   → crée le posteur (login OS + 1er compte perso) via
 *                       manage-users, le rattache au recruteur de sa zone,
 *                       marque `source = site`. Idempotent sur `hub_id`.
 *   - posts_semaine   → prévus / publiés / manqués d'une semaine Paris
 *   - maj_posteur     → is_active, deux_telephones
 *
 * Création : on RÉUTILISE manage-users (appel HTTP interne avec CRON_SECRET)
 * plutôt que de recopier sa logique de file labels / persona / référence —
 * c'est un bundle figé (scripts/build-manage-users-bundle.sh) et la seule
 * source de vérité sur « comment naît un compte ».
 */

const VERSION = "1";
const ROLES_RECRUTEUR = ["hiring_manager", "directing_manager", "head_of_ops"];

type Supabase = ReturnType<typeof serviceClient>;

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  try {
    return await gererRequete(request);
  } catch (error) {
    return json({ ok: false, error: messageErreur(error) }, 500);
  }
});

async function gererRequete(request: Request): Promise<Response> {
  const attendu = Deno.env.get("HUB_SECRET");
  if (!attendu || !secretsEgaux(request.headers.get("x-hub-secret"), attendu)) {
    return json({ ok: false, error: "non autorisé" }, 401);
  }
  if (request.method !== "POST") {
    return json({ ok: false, error: "POST attendu" }, 405);
  }

  // deno-lint-ignore no-explicit-any
  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "corps JSON attendu" }, 400);
  }
  const action = String(body.action ?? "");
  const supabase = serviceClient();

  switch (action) {
    case "ping":
      return json({ ok: true, version: VERSION });
    case "stats_pays":
      return json({ ok: true, ...(await statsPays(supabase)) });
    case "creer_posteur":
      return await creerPosteur(supabase, body);
    case "posts_semaine":
      return await postsSemaine(supabase, body);
    case "maj_posteur":
      return await majPosteur(supabase, body);
    default:
      return json({ ok: false, error: `action inconnue : ${action || "(vide)"}` }, 400);
  }
}

// ---------------------------------------------------------------------------
// Lectures communes
// ---------------------------------------------------------------------------

interface ProfilLigne {
  id: string;
  prenom: string | null;
  nom: string | null;
  email: string | null;
  is_active: boolean | null;
  nationalite: string | null;
  manager_id: string | null;
  zone_recrutement: string | null;
}

async function rolesParUtilisateur(supabase: Supabase): Promise<Map<string, string[]>> {
  const lignes = await lireTout<{ id: string; user_id: string; role: string }>(
    "Rôles",
    (curseur, taille) => {
      let q = supabase.from("user_roles").select("id, user_id, role");
      if (curseur) q = q.gt("id", curseur.id);
      return q.order("id", { ascending: true }).limit(taille);
    },
    { ancre: (l) => l.id },
  );
  const out = new Map<string, string[]>();
  for (const l of lignes) {
    const liste = out.get(l.user_id) ?? [];
    liste.push(l.role);
    out.set(l.user_id, liste);
  }
  return out;
}

async function tousLesProfils(supabase: Supabase): Promise<ProfilLigne[]> {
  return await lireTout<ProfilLigne>(
    "Profils",
    (curseur, taille) => {
      let q = supabase
        .from("profiles")
        .select("id, prenom, nom, email, is_active, nationalite, manager_id, zone_recrutement");
      if (curseur) q = q.gt("id", curseur.id);
      return q.order("id", { ascending: true }).limit(taille);
    },
    { ancre: (l) => l.id },
  );
}

function nomProfil(p: { prenom: string | null; nom: string | null; email: string | null }): string {
  return [p.prenom, p.nom].filter(Boolean).join(" ") || p.email || "—";
}

// ---------------------------------------------------------------------------
// stats_pays
// ---------------------------------------------------------------------------

async function statsPays(supabase: Supabase) {
  const [profils, roles] = await Promise.all([tousLesProfils(supabase), rolesParUtilisateur(supabase)]);
  const parId = new Map(profils.map((p) => [p.id, p]));
  const parLangue = new Map<string, number>();
  const parZone = new Map<string, { zone: string; recruteur: string; actifs: number }>();
  for (const p of profils) {
    const r = roles.get(p.id) ?? [];
    if (!r.includes("poster") || !p.is_active) continue;
    const langue = (p.nationalite ?? "?").toLowerCase();
    parLangue.set(langue, (parLangue.get(langue) ?? 0) + 1);
    const recruteur = p.manager_id ? parId.get(p.manager_id) : null;
    const zone = recruteur?.zone_recrutement ?? "(sans zone)";
    const nom = recruteur ? nomProfil(recruteur) : "(sans recruteur)";
    const cle = `${zone}::${nom}`;
    const entree = parZone.get(cle) ?? { zone, recruteur: nom, actifs: 0 };
    entree.actifs += 1;
    parZone.set(cle, entree);
  }
  return {
    by_langue: [...parLangue.entries()]
      .map(([langue, actifs]) => ({ langue, actifs }))
      .sort((a, b) => b.actifs - a.actifs),
    by_zone: [...parZone.values()].sort((a, b) => b.actifs - a.actifs),
  };
}

// ---------------------------------------------------------------------------
// creer_posteur
// ---------------------------------------------------------------------------

function texte(v: unknown, max = 120): string {
  return String(v ?? "").trim().slice(0, max);
}

// deno-lint-ignore no-explicit-any
async function creerPosteur(supabase: Supabase, body: any): Promise<Response> {
  const hubId = texte(body.hub_id, 64);
  const prenom = texte(body.prenom, 60);
  const nom = texte(body.nom, 80);
  const langue = texte(body.langue, 8).toLowerCase();
  const paysCode = texte(body.pays_code, 2).toUpperCase();
  const paysNom = texte(body.pays_nom, 80);
  const emailPerso = texte(body.email_perso, 200).toLowerCase() || null;
  const deuxTelephones = Boolean(body.deux_telephones);
  const applications: string[] = Array.isArray(body.applications)
    ? (body.applications as unknown[]).map((a) => texte(a, 30).toLowerCase()).filter(Boolean)
    : [];

  if (!/^[0-9a-f-]{36}$/i.test(hubId)) return json({ ok: false, error: "hub_id (uuid) requis" }, 400);
  if (!prenom) return json({ ok: false, error: "prenom requis" }, 400);
  if (!langue) return json({ ok: false, error: "langue requise" }, 400);
  if (paysCode && !/^[A-Z]{2}$/.test(paysCode)) return json({ ok: false, error: "pays_code : ISO alpha-2" }, 400);
  if (applications.some((a) => a !== "sophia" && a !== "unswipe")) {
    return json({ ok: false, error: "applications : sophia et/ou unswipe" }, 400);
  }

  // Idempotence : la candidature a déjà produit un posteur → on le rend tel quel.
  const { data: existant, error: errExist } = await supabase
    .from("profiles")
    .select("id, email, manager_id")
    .eq("hub_id", hubId)
    .maybeSingle();
  if (errExist) throw errExist;
  if (existant) {
    return json({
      ok: true,
      existed: true,
      profile_id: existant.id,
      email_os: existant.email,
      password: null,
      manager: await managerDe(supabase, existant.manager_id as string | null),
    });
  }

  // Recruteur de la zone : les recruteurs actifs, dans l'ordre alphabétique
  // de leur email (stable d'un appel à l'autre).
  const [profils, roles] = await Promise.all([tousLesProfils(supabase), rolesParUtilisateur(supabase)]);
  const recruteurs: RecruteurZone[] = profils
    .filter((p) => (roles.get(p.id) ?? []).some((r) => ROLES_RECRUTEUR.includes(r)))
    .sort((a, b) => (a.email ?? "").localeCompare(b.email ?? ""));
  const recruteur = paysNom ? trouverRecruteurPourPays(recruteurs, paysNom) : null;

  // Création par manage-users (bundle figé, seule vérité sur la naissance d'un
  // compte). Le secret des crons lui donne le rôle admin ; `parts_applications`
  // suit le contrat de _shared/creation_compte_apps.ts.
  const cronSecret = Deno.env.get("CRON_SECRET");
  const urlBase = Deno.env.get("SUPABASE_URL");
  if (!cronSecret || !urlBase) return json({ ok: false, error: "CRON_SECRET ou SUPABASE_URL manquant" }, 500);
  const password = genererMotDePasse();
  const unswipeSeul = applications.length === 1 && applications[0] === "unswipe";
  const reponse = await fetch(`${urlBase}/functions/v1/manage-users`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-cron-secret": cronSecret },
    body: JSON.stringify({
      action: "create",
      prenom,
      nom,
      password,
      langue,
      type_compte: "perso",
      ...(unswipeSeul ? { parts_applications: { unswipe: 100 } } : {}),
    }),
  });
  const cree = (await reponse.json().catch(() => ({}))) as {
    ok?: boolean;
    userId?: string;
    email?: string;
    error?: string;
  };
  if (!reponse.ok || !cree.ok || !cree.userId) {
    return json({ ok: false, error: `manage-users : ${cree.error ?? reponse.status}` }, 502);
  }

  const { error: errMaj } = await supabase
    .from("profiles")
    .update({
      source: "site",
      hub_id: hubId,
      email_perso: emailPerso,
      pays: paysCode || null,
      deux_telephones: deuxTelephones,
      must_change_password: true,
      ...(recruteur ? { manager_id: recruteur.id } : {}),
    })
    .eq("id", cree.userId);
  if (errMaj) throw errMaj;

  return json({
    ok: true,
    existed: false,
    profile_id: cree.userId,
    email_os: cree.email,
    password,
    manager: recruteur
      ? { id: recruteur.id, prenom: recruteur.prenom, nom: recruteur.nom, email: recruteur.email }
      : null,
  });
}

async function managerDe(supabase: Supabase, managerId: string | null) {
  if (!managerId) return null;
  const { data } = await supabase
    .from("profiles")
    .select("id, prenom, nom, email")
    .eq("id", managerId)
    .maybeSingle();
  return data ?? null;
}

// ---------------------------------------------------------------------------
// posts_semaine
// ---------------------------------------------------------------------------

// deno-lint-ignore no-explicit-any
async function postsSemaine(supabase: Supabase, body: any): Promise<Response> {
  const ids: string[] = Array.isArray(body.profile_ids)
    ? (body.profile_ids as unknown[]).map((v) => texte(v, 64)).filter((v) => /^[0-9a-f-]{36}$/i.test(v))
    : [];
  if (ids.length === 0) return json({ ok: false, error: "profile_ids requis" }, 400);
  if (ids.length > 500) return json({ ok: false, error: "500 profils maximum par appel" }, 400);
  let bornes;
  try {
    bornes = bornesSemaineParis(texte(body.lundi, 10));
  } catch (e) {
    return json({ ok: false, error: messageErreur(e) }, 400);
  }

  const profils = await lireParLots<{ id: string; is_active: boolean | null }>(
    ids,
    "Profils",
    (lot) => supabase.from("profiles").select("id, is_active").in("id", lot),
  );
  const comptes = await lireParLots<{ id: string; poster_id: string }>(
    ids,
    "Comptes",
    (lot) => supabase.from("comptes").select("id, poster_id").in("poster_id", lot),
  );
  const compteIds = comptes.map((c) => c.id);
  const posterDuCompte = new Map(comptes.map((c) => [c.id, c.poster_id]));

  // Deux requêtes par lot : par date prévue (prévus) et par date de
  // publication (publiés), puis dédoublonnage par id. Un passage publié hors
  // de sa semaine prévue compte dans la semaine où il est PUBLIÉ.
  const passages = new Map<string, PassageSemaine>();
  type LignePassage = PassageSemaine & { id: string };
  const ajouter = (l: LignePassage[]) => {
    for (const p of l) passages.set(p.id, p);
  };
  if (compteIds.length > 0) {
    ajouter(
      await lireParLots<LignePassage>(compteIds, "Passages prévus", (lot) =>
        supabase
          .from("passages")
          .select("id, compte_id, date_publication_prevue, statut, publie_at")
          .in("compte_id", lot)
          .gte("date_publication_prevue", bornes.jours[0])
          .lte("date_publication_prevue", bornes.jours[6])),
    );
    ajouter(
      await lireParLots<LignePassage>(compteIds, "Passages publiés", (lot) =>
        supabase
          .from("passages")
          .select("id, compte_id, date_publication_prevue, statut, publie_at")
          .in("compte_id", lot)
          .gte("publie_at", bornes.debut)
          .lt("publie_at", bornes.fin)),
    );
    // Vidéos du pod 3 : même grille (prévue / publiée).
    const videos = await lireParLots<
      { id: string; compte_id: string; date_publication_prevue: string | null; statut: string | null; publie_le: string | null }
    >(compteIds, "Vidéos pod", (lot) =>
      supabase
        .from("pod_videos")
        .select("id, compte_id, date_publication_prevue, statut, publie_le")
        .in("compte_id", lot)
        .or(
          `and(date_publication_prevue.gte.${bornes.jours[0]},date_publication_prevue.lte.${bornes.jours[6]}),and(publie_le.gte.${bornes.debut},publie_le.lt.${bornes.fin})`,
        ));
    ajouter(
      videos.map((v) => ({
        id: `video:${v.id}`,
        compte_id: v.compte_id,
        date_publication_prevue: v.date_publication_prevue,
        statut: v.statut,
        publie_at: v.publie_le,
      })),
    );
  }

  const parPoster = new Map<string, PassageSemaine[]>();
  for (const p of passages.values()) {
    const poster = posterDuCompte.get(p.compte_id);
    if (!poster) continue;
    const liste = parPoster.get(poster) ?? [];
    liste.push(p);
    parPoster.set(poster, liste);
  }
  const actif = new Map(profils.map((p) => [p.id, Boolean(p.is_active)]));
  const rows: LigneSemaine[] = ids
    .filter((id) => actif.has(id))
    .map((id) => agregerSemaine(id, actif.get(id) ?? false, parPoster.get(id) ?? [], bornes));
  return json({ ok: true, lundi: bornes.jours[0], rows });
}

// ---------------------------------------------------------------------------
// maj_posteur
// ---------------------------------------------------------------------------

// deno-lint-ignore no-explicit-any
async function majPosteur(supabase: Supabase, body: any): Promise<Response> {
  const id = texte(body.profile_id, 64);
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ ok: false, error: "profile_id requis" }, 400);
  const patch: Record<string, unknown> = {};
  if (typeof body.is_active === "boolean") patch.is_active = body.is_active;
  if (typeof body.deux_telephones === "boolean") patch.deux_telephones = body.deux_telephones;
  if (Object.keys(patch).length === 0) return json({ ok: false, error: "rien à mettre à jour" }, 400);
  const { data, error } = await supabase.from("profiles").update(patch).eq("id", id).select("id").maybeSingle();
  if (error) throw error;
  if (!data) return json({ ok: false, error: "posteur introuvable" }, 404);
  return json({ ok: true });
}
