/**
 * Banque d'images venues de l'extérieur (Pinterest, 0771, demande d'Adrien du
 * 19/11). Un agent cherche des images sur Pinterest, les trie à l'œil, les
 * recadre en 9:16 (dossier `banque/` du dépôt) et les verse ici sous un ou
 * plusieurs labels. Elles entrent dans la banque propre de ces labels : tout
 * podz du label les voit avec l'action `images` du guichet `pods` et les
 * dépose comme une image d'import nettoyée (`verifierImagesDuLabel`).
 *
 * Authentification : en-tête `x-banque-jeton`, comparé à `banque_jetons`
 * (empreinte SHA-256). Sans jeton valable : 401.
 *
 *   { action: "ajouter", labels: ["male_run", …], jpeg_base64, legende, visage?,
 *     origine: { site: "pinterest", image_url, page_url?, requete? } }
 *       → { id, url } ; ou { id, url, deja: true } si l'image est déjà en
 *       banque (ses labels sont complétés, rien n'est réécrit).
 *       L'image : JPEG vertical 9:16, 720 px de large au moins, sans
 *       métadonnées, légende en anglais (`controlerImageBanque`). Au plus
 *       `banque_jetons.par_jour` images neuves sur 24 h.
 *       `visage: true` : un visage est reconnaissable (`visage_identifiable`,
 *       l'image ne sert ni en photo de profil ni à `photos`, la recherche dans
 *       toute la banque).
 *
 *   { action: "connues", site: "pinterest", refs: ["<32 hex>", …] }
 *       → { connues: [...] } : les empreintes déjà en banque (à ne pas
 *       reproposer au tri). Lecture seule.
 *
 *   { action: "etat", application: "atala" }
 *       → { labels: [{ label, propres, pinterest }], versees_24h, par_jour }.
 *       Lecture seule.
 */

import { BANQUE_EXTERNE, lireDemandeBanque, lireRefs, rapprocherLabels, SITES_BANQUE } from "../_shared/banque.ts";
import { decouperEnLots } from "../_shared/lots.ts";
import { controlerImageBanque, sha256Hex } from "../_shared/pods.ts";
import { corsHeaders, json, messageErreur, serviceClient } from "../_shared/supabase.ts";

type Supabase = ReturnType<typeof serviceClient>;
type Agent = { nom: string; par_jour: number };

const BUCKET = "medias";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: { ...corsHeaders, "access-control-allow-headers": `${corsHeaders["access-control-allow-headers"]}, x-banque-jeton` },
    });
  }
  const jeton = request.headers.get("x-banque-jeton") ?? "";
  if (!jeton) return json({ ok: false, error: "unauthorized" }, 401);

  const supabase = serviceClient();
  try {
    const { data: agent } = await supabase
      .from("banque_jetons")
      .select("nom, par_jour, actif")
      .eq("jeton_hash", await sha256Hex(jeton))
      .maybeSingle();
    if (!agent) return json({ ok: false, error: "unauthorized" }, 401);
    if (!agent.actif) return json({ ok: false, error: "jeton en pause" }, 409);

    // deno-lint-ignore no-explicit-any
    let body: any = {};
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, error: "corps JSON requis" }, 400);
    }
    if (body?.action === "ajouter") return await ajouter(supabase, agent as Agent, body);
    if (body?.action === "connues") return await connues(supabase, body);
    if (body?.action === "etat") return await etat(supabase, agent as Agent, body);
    return json({ ok: false, error: "action inconnue (ajouter | connues | etat)" }, 400);
  } catch (e) {
    return json({ ok: false, error: messageErreur(e) }, 500);
  }
});

/** Images neuves versées par cet agent depuis 24 h. */
async function versees24h(supabase: Supabase, agent: Agent): Promise<number> {
  const { count, error } = await supabase
    .from("media_origines")
    .select("media_id", { count: "exact", head: true })
    .eq("jeton", agent.nom)
    .gte("created_at", new Date(Date.now() - 86_400_000).toISOString());
  if (error) throw new Error(`images du jour : ${messageErreur(error)}`);
  return count ?? 0;
}

async function ajouter(supabase: Supabase, agent: Agent, body: Record<string, unknown>) {
  const demande = lireDemandeBanque(body);
  if ("erreur" in demande) return json({ ok: false, error: demande.erreur }, 400);
  let octets: Uint8Array;
  try {
    octets = Uint8Array.from(atob(String(body.jpeg_base64 ?? "")), (c) => c.charCodeAt(0));
  } catch {
    return json({ ok: false, error: "jpeg_base64 invalide" }, 400);
  }
  const legende = String(body.legende ?? "").trim();
  const erreurs = controlerImageBanque(octets, legende);
  if (erreurs.length) return json({ ok: false, error: erreurs.join(" · ") }, 400);

  const { data: enBase, error: lErr } = await supabase
    .from("labels")
    .select("id, nom, slug, application_id")
    .or(`nom.in.(${demande.labels.join(",")}),slug.in.(${demande.labels.join(",")})`);
  if (lErr) throw new Error(`labels : ${messageErreur(lErr)}`);
  const rapproches = rapprocherLabels(
    demande.labels,
    (enBase ?? []) as { id: string; nom: string; slug: string; application_id: string | null }[],
  );
  if ("inconnu" in rapproches) return json({ ok: false, error: `label inconnu : ${rapproches.inconnu}` }, 400);
  const labels = rapproches.labels;
  const lier = async (mediaId: string) => {
    const { error } = await supabase
      .from("media_labels")
      .upsert(labels.map((l) => ({ media_id: mediaId, label_id: l.id })), { onConflict: "media_id,label_id" });
    if (error) throw new Error(`banque des labels : ${messageErreur(error)}`);
  };
  /** L'image est déjà en banque : on complète ses labels, sans rien réécrire. */
  const dejaLa = async () => {
    const { data: origine } = await supabase
      .from("media_origines")
      .select("media_id, media_library(url)")
      .eq("site", demande.origine.site)
      .eq("ref", demande.origine.ref)
      .maybeSingle();
    if (!origine) return null;
    await lier(origine.media_id as string);
    const media = origine.media_library as unknown as { url: string } | { url: string }[] | null;
    return json({ ok: true, id: origine.media_id, url: (Array.isArray(media) ? media[0]?.url : media?.url) ?? null, deja: true });
  };

  const existante = await dejaLa();
  if (existante) return existante;
  if ((await versees24h(supabase, agent)) >= agent.par_jour) {
    return json({ ok: false, code: "quota_images", error: `quota_images : ${agent.par_jour} images versées en 24 h au plus` }, 429);
  }

  const chemin = `propre/banque/${demande.origine.site}/${crypto.randomUUID()}.jpg`;
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(chemin, octets, { contentType: "image/jpeg", upsert: false });
  if (upErr) throw new Error(`stockage ${chemin} : ${messageErreur(upErr)}`);
  const url = supabase.storage.from(BUCKET).getPublicUrl(chemin).data.publicUrl as string;
  const applicationId = labels.find((l) => l.application_id)?.application_id ?? null;
  const { data: media, error: mErr } = await supabase
    .from("media_library")
    .insert({
      storage_path: chemin,
      url,
      source: demande.origine.site,
      texte_restant: false,
      caption: legende,
      caption_statut: "ok",
      caption_modele: "banque",
      caption_le: new Date().toISOString(),
      ...(body.visage === true ? { visage_identifiable: true } : {}),
      ...(applicationId ? { application_id: applicationId } : {}),
    })
    .select("id")
    .single();
  if (mErr || !media) {
    await supabase.storage.from(BUCKET).remove([chemin]);
    throw new Error(`média ${chemin} : ${messageErreur(mErr)}`);
  }
  const defaire = async () => {
    await supabase.from("media_library").delete().eq("id", media.id);
    await supabase.storage.from(BUCKET).remove([chemin]);
  };
  const { error: oErr } = await supabase.from("media_origines").insert({
    media_id: media.id,
    site: demande.origine.site,
    ref: demande.origine.ref,
    image_url: demande.origine.image_url,
    page_url: demande.origine.page_url,
    requete: demande.origine.requete,
    jeton: agent.nom,
  });
  if (oErr) {
    await defaire();
    // Deux versements de la même image en même temps : l'autre a gagné.
    const gagnante = await dejaLa();
    if (gagnante) return gagnante;
    throw new Error(`origine ${demande.origine.ref} : ${messageErreur(oErr)}`);
  }
  try {
    await lier(media.id);
  } catch (e) {
    await defaire();
    throw e;
  }
  return json({ ok: true, id: media.id, url });
}

async function connues(supabase: Supabase, body: Record<string, unknown>) {
  const site = String(body.site ?? "pinterest");
  if (!(SITES_BANQUE as readonly string[]).includes(site)) return json({ ok: false, error: `site : ${SITES_BANQUE.join(" | ")}` }, 400);
  const refs = lireRefs(body.refs);
  const trouvees: string[] = [];
  for (const lot of decouperEnLots(refs, 200)) {
    const { data, error } = await supabase.from("media_origines").select("ref").eq("site", site).in("ref", lot).limit(lot.length);
    if (error) throw new Error(`origines : ${messageErreur(error)}`);
    trouvees.push(...((data ?? []) as { ref: string }[]).map((o) => o.ref));
  }
  return json({ ok: true, demandees: refs.length, max: BANQUE_EXTERNE.refsMax, connues: trouvees });
}

async function etat(supabase: Supabase, agent: Agent, body: Record<string, unknown>) {
  const application = String(body.application ?? "").trim().toLowerCase();
  if (!/^[a-z0-9_-]{2,40}$/.test(application)) return json({ ok: false, error: "application : son slug (« atala »)" }, 400);
  const { data, error } = await supabase.rpc("banque_etat", { p_application: application });
  if (error) throw new Error(`banque_etat : ${messageErreur(error)}`);
  return json({ ok: true, application, labels: data ?? [], versees_24h: await versees24h(supabase, agent), par_jour: agent.par_jour });
}
