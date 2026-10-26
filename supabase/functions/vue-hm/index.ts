import { createClient } from "jsr:@supabase/supabase-js@2";

import { assertRole, corsHeaders, json, messageErreur, serviceClient } from "../_shared/supabase.ts";
import { ROLES_VUE_HM, sessionDuJeton } from "../_shared/vue_hm.ts";

/**
 * « Voir la vue HM » (Admin → Tests, migration 0360).
 *
 *   { action: "ouvrir", hm_id }   admin
 *       Ouvre une vraie session de la HM, sans mot de passe ni email : lien
 *       magique généré côté serveur (`generateLink` n'envoie rien) et consommé
 *       ici même. La session est inscrite dans `vues_hm` AVANT d'être rendue au
 *       navigateur : dès sa première requête, la base la tient en lecture seule
 *       et l'arrête au bout d'1 h (`garde_vue_hm`).
 *
 *   { action: "fermer" }          jeton de la vue
 *       « Quitter » : marque la vue fermée (la base refuse alors toute
 *       requête) et révoque la session côté Auth. Pas de contrôle de rôle : la
 *       vue est en lecture seule, assertRole la refuserait, et fermer une vue
 *       n'ouvre aucun droit.
 */
Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  let body: { action?: string; hm_id?: string } = {};
  try {
    body = await request.json();
  } catch {
    return json({ error: "corps JSON requis" }, 400);
  }

  const supabase = serviceClient();
  try {
    if (body?.action === "fermer") return await fermer(supabase, request);
    if (body?.action !== "ouvrir") return json({ error: "action inconnue (ouvrir | fermer)" }, 400);

    const acces = await assertRole(request, ["admin"]);
    if (acces instanceof Response) return acces;
    if (acces.userId === "cron") return json({ error: "réservé à un admin connecté" }, 403);
    return await ouvrir(supabase, acces.userId, String(body.hm_id ?? ""));
  } catch (e) {
    return json({ error: messageErreur(e) }, 500);
  }
});

async function ouvrir(supabase: ReturnType<typeof serviceClient>, adminId: string, hmId: string) {
  if (!hmId) return json({ error: "hm_id requis" }, 400);

  const [{ data: roles, error: errRoles }, { data: profil, error: errProfil }] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", hmId),
    supabase.from("profiles").select("prenom, email, is_active").eq("id", hmId).maybeSingle(),
  ]);
  if (errRoles) throw errRoles;
  if (errProfil) throw errProfil;
  const estHm = (roles ?? []).some((r) => ROLES_VUE_HM.includes(r.role as string));
  const estAdmin = (roles ?? []).some((r) => r.role === "admin");
  if (!estHm || estAdmin || !profil?.is_active || !profil.email) {
    return json({ error: "Ce compte n'est pas une HM active." }, 400);
  }

  const { data: lien, error: errLien } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email: profil.email,
  });
  if (errLien) throw errLien;

  const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: verif, error: errVerif } = await anon.auth.verifyOtp({
    token_hash: lien.properties.hashed_token,
    type: "magiclink",
  });
  if (errVerif) throw errVerif;
  const session = verif.session;
  const sessionId = session ? sessionDuJeton(session.access_token) : null;
  if (!session || !sessionId) throw new Error("session de vue introuvable");

  // Une vue à la fois par admin : les précédentes se ferment.
  await supabase.from("vues_hm").update({ fermee_at: new Date().toISOString() })
    .eq("admin_id", adminId).is("fermee_at", null);

  const { data: vue, error: errVue } = await supabase.from("vues_hm")
    .insert({ admin_id: adminId, hm_id: hmId, session_id: sessionId })
    .select("expire_at")
    .single();
  if (errVue) {
    await revoquer(session.access_token);
    throw errVue;
  }

  // La session telle que supabase-js la stocke : l'onglet la pose dans son
  // sessionStorage et recharge, sans passer par un échange de jetons.
  return json({ session, expire_at: vue.expire_at, prenom: profil.prenom ?? profil.email });
}

async function fermer(supabase: ReturnType<typeof serviceClient>, request: Request) {
  const jeton = (request.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const sessionId = sessionDuJeton(jeton);
  if (!sessionId) return json({ error: "unauthorized" }, 401);

  const { data, error } = await supabase.from("vues_hm")
    .update({ fermee_at: new Date().toISOString() })
    .eq("session_id", sessionId)
    .is("fermee_at", null)
    .select("id");
  if (error) throw error;
  // Ce n'était pas une vue (ou déjà fermée) : on ne révoque rien.
  if ((data ?? []).length === 0) return json({ ok: true, deja_fermee: true });

  await revoquer(jeton);
  return json({ ok: true });
}

/** Révoque CETTE session seulement (scope local) — jamais celles de la HM. */
async function revoquer(jeton: string) {
  await fetch(`${Deno.env.get("SUPABASE_URL")}/auth/v1/logout?scope=local`, {
    method: "POST",
    headers: { apikey: Deno.env.get("SUPABASE_ANON_KEY")!, Authorization: `Bearer ${jeton}` },
  }).catch(() => undefined);
}
