/**
 * Pods — guichet entre les ateliers de production et l'OS (migration 0259).
 *
 *   { action: "deposer", pod, source_url, source_id, source_vues, titre,
 *     langue_source, musique_url, musique_titre, textes, decks }
 *       Agent du pod, en-tête `x-pod-jeton` (comparé à pods.jeton_hash).
 *       Range les images finies (JPEG sans métadonnées) dans le stockage et
 *       met la livraison dans la file de validation. Ne crée AUCUN contenu.
 *
 *   { action: "valider", id }   — admin
 *       Note d'import classique (30 % pertinence + 70 % vues, prompt
 *       `pertinence`), rang d'entrée C/B/A — ou écartée sous le seuil. Crée un
 *       contenu `livre` dans le label du pod, avec un deck par langue livrée.
 *
 *   { action: "rejeter", id, motif? }   — admin
 *
 * Le pod ne choisit ni les comptes ni la fréquence : c'est la tierlist qui
 * diffuse le contenu validé, comme n'importe quel autre.
 */

import { scoreRelevance } from "../_shared/gemini.ts";
import { eloParLangue, lireScoring } from "../_shared/import_contenu.ts";
import { metadonneesJpeg, sha256Hex, verifierDepot, type DeckDepose } from "../_shared/pods.ts";
import { assertRole, chargerPrompt, corsHeaders, json, messageErreur, serviceClient } from "../_shared/supabase.ts";
import { passagesPourTier, tierImport } from "../_shared/tierlist.ts";

const BUCKET = "medias";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: { ...corsHeaders, "access-control-allow-headers": `${corsHeaders["access-control-allow-headers"]}, x-pod-jeton` },
    });
  }

  // Sans aucune forme d'authentification : 401 d'emblée, comme les autres
  // fonctions (le test de fumée du déploiement s'appuie dessus).
  const authentifie = request.headers.get("x-pod-jeton") || request.headers.get("Authorization") ||
    request.headers.get("x-cron-secret");
  if (!authentifie) return json({ ok: false, error: "unauthorized" }, 401);

  // deno-lint-ignore no-explicit-any
  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "corps JSON requis" }, 400);
  }

  const supabase = serviceClient();
  try {
    if (body?.action === "deposer") return await deposer(request, supabase, body);
    if (body?.action === "valider" || body?.action === "rejeter") {
      const acces = await assertRole(request, ["admin"]);
      if (acces instanceof Response) return acces;
      const userId = acces.userId === "cron" ? null : acces.userId;
      return body.action === "valider"
        ? await valider(supabase, String(body.id ?? ""), userId)
        : await rejeter(supabase, String(body.id ?? ""), userId, body.motif ? String(body.motif) : null);
    }
    return json({ ok: false, error: "action inconnue (deposer | valider | rejeter)" }, 400);
  } catch (e) {
    return json({ ok: false, error: messageErreur(e) }, 500);
  }
});

// ---------------------------------------------------------------------------

// deno-lint-ignore no-explicit-any
type Supabase = any;

async function deposer(request: Request, supabase: Supabase, body: Record<string, unknown>) {
  const slug = String(body.pod ?? "");
  const jeton = request.headers.get("x-pod-jeton") ?? "";
  const { data: pod } = await supabase.from("pods").select("slug, actif, jeton_hash").eq("slug", slug).maybeSingle();
  if (!pod || !jeton || !pod.jeton_hash || (await sha256Hex(jeton)) !== pod.jeton_hash) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }
  if (!pod.actif) return json({ ok: false, error: "pod en pause" }, 409);

  const sourceId = String(body.source_id ?? "");
  if (!sourceId) return json({ ok: false, error: "source_id requis" }, 400);
  const langueSource = String(body.langue_source ?? "fr");
  const decks = (body.decks ?? {}) as Record<string, DeckDepose>;
  const erreurs = verifierDepot(decks, langueSource);
  if (erreurs.length) return json({ ok: false, error: erreurs.join(" · ") }, 400);

  // Une livraison déjà décidée ne se redépose pas : elle a sa vie dans l'OS.
  const { data: existante } = await supabase
    .from("pod_livraisons")
    .select("id, statut")
    .eq("pod", slug)
    .eq("source_id", sourceId)
    .maybeSingle();
  if (existante && existante.statut !== "a_valider") {
    return json({ ok: false, error: `livraison déjà ${existante.statut}` }, 409);
  }

  // Images : contrôle complet AVANT le premier envoi (pas de dépôt à moitié).
  const binaires = new Map<string, Uint8Array>();
  for (const [langue, deck] of Object.entries(decks)) {
    for (const s of deck.slides) {
      const octets = Uint8Array.from(atob(s.jpeg_base64), (c) => c.charCodeAt(0));
      const restes = metadonneesJpeg(octets);
      if (restes === null) return json({ ok: false, error: `${langue} #${s.position} : pas un JPEG` }, 400);
      if (restes.length) {
        return json({ ok: false, error: `${langue} #${s.position} : métadonnées ${restes.join(", ")}` }, 400);
      }
      binaires.set(`${langue}/${s.position}`, octets);
    }
  }

  const sortie: Record<string, { hashtags: string; slides: unknown[] }> = {};
  const version = Date.now();
  for (const [langue, deck] of Object.entries(decks)) {
    const slides = [];
    for (const s of [...deck.slides].sort((a, b) => a.position - b.position)) {
      const path = `pods/${slug}/${sourceId}/${langue}/${s.position}.jpg`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, binaires.get(`${langue}/${s.position}`)!, { contentType: "image/jpeg", upsert: true });
      if (upErr) throw new Error(`stockage ${path} : ${messageErreur(upErr)}`);
      const url = `${supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl}?v=${version}`;
      // `pods/…` + texte_restant : jamais repris par les banques de photos
      // (avatars, images de repli), qui ne lisent que `propre/…` sans texte.
      const { data: media, error: mErr } = await supabase
        .from("media_library")
        .upsert(
          { storage_path: path, url, source: "genere_ia", langue, texte_restant: true },
          { onConflict: "storage_path" },
        )
        .select("id")
        .single();
      if (mErr || !media) throw new Error(`média ${path} : ${messageErreur(mErr)}`);
      slides.push({ position: s.position, media_id: media.id, url, position_sophia: Boolean(s.position_sophia) });
    }
    sortie[langue] = { hashtags: String(deck.hashtags ?? "").trim(), slides };
  }

  const ligne = {
    pod: slug,
    source_id: sourceId,
    source_url: body.source_url ? String(body.source_url) : null,
    source_vues: Number.isFinite(Number(body.source_vues)) ? Number(body.source_vues) : null,
    titre: body.titre ? String(body.titre).slice(0, 160) : null,
    langue_source: langueSource,
    musique_url: body.musique_url ? String(body.musique_url) : null,
    musique_titre: body.musique_titre ? String(body.musique_titre) : null,
    decks: sortie,
    transcription: { textes: Array.isArray(body.textes) ? body.textes.map(String) : [] },
    statut: "a_valider",
  };
  const { data: livraison, error } = await supabase
    .from("pod_livraisons")
    .upsert(ligne, { onConflict: "pod,source_id" })
    .select("id")
    .single();
  if (error || !livraison) throw new Error(`livraison : ${messageErreur(error)}`);
  return json({ ok: true, id: livraison.id, langues: Object.keys(sortie) });
}

async function valider(supabase: Supabase, id: string, userId: string | null) {
  const { data: l } = await supabase.from("pod_livraisons").select("*").eq("id", id).maybeSingle();
  if (!l) return json({ ok: false, error: "livraison introuvable" }, 404);
  if (l.statut !== "a_valider") return json({ ok: false, error: `déjà ${l.statut}` }, 409);
  const { data: pod } = await supabase.from("pods").select("slug, label_id").eq("slug", l.pod).single();
  if (!pod?.label_id) return json({ ok: false, error: "le pod n'a pas de label" }, 409);

  // Note d'import CLASSIQUE, comme un slideshow importé.
  const textes: string[] = l.transcription?.textes ?? [];
  const pertinence = await scoreRelevance({
    caption: textes.join("\n"),
    hookText: textes[0] ?? l.titre ?? "",
    instructions: await chargerPrompt(supabase, "pertinence"),
  });
  const scoring = await lireScoring(supabase);
  const elo = eloParLangue({
    pertinence: pertinence.score,
    vues: l.source_vues,
    langue: l.langue_source,
    langueSource: l.langue_source,
    prior: scoring.prior,
    k: scoring.k,
    poidsVues: scoring.poidsVues,
    vuesPlafond: scoring.vuesPlafond,
  });
  const note = Math.round(elo * 100) / 100;
  const tier = tierImport(elo, scoring.eloSeuil);
  const maintenant = new Date().toISOString();
  if (!tier) {
    await supabase
      .from("pod_livraisons")
      .update({
        statut: "ecartee_note",
        note_import: note,
        motif: `note ${note} < ${scoring.eloSeuil} (pertinence ${pertinence.score} : ${pertinence.reason})`,
        decide_par: userId,
        decide_le: maintenant,
      })
      .eq("id", id);
    return json({ ok: true, statut: "ecartee_note", note });
  }

  const decks = l.decks as Record<string, { hashtags: string; slides: { position: number; media_id: string; position_sophia: boolean }[] }>;
  const deckSource = decks[l.langue_source];
  const { data: contenu, error: cErr } = await supabase
    .from("contenus")
    .insert({
      titre: (l.titre ?? textes[0] ?? "Pod").slice(0, 160),
      source_url: l.source_url,
      langue_source: l.langue_source,
      musique_url: l.musique_url,
      musique_titre: l.musique_titre,
      musique_plateforme: l.musique_url ? "tiktok" : null,
      vues_source: l.source_vues,
      pertinence_score: Math.round(pertinence.score),
      pertinence_raison: pertinence.reason,
      statut: "valide",
      import_statut: "done",
      // Visuels figés : la résolution d'images de l'assignation n'y touche pas.
      structure_slides: deckSource.slides.map((s) => ({
        position: s.position,
        media_id: s.media_id,
        pinned: true,
        raw_url: null,
        reference_url: null,
      })),
      tier,
      passages_prevus: passagesPourTier(tier),
      tier_cycle: 0,
      tier_maj_at: maintenant,
      tier_rapport: { origine: "pod", pod: l.pod, elo: note, seuil: scoring.eloSeuil, tier, passages: passagesPourTier(tier) },
      livre: true,
      pod: l.pod,
    })
    .select("id")
    .single();
  if (cErr || !contenu) throw new Error(`contenu : ${messageErreur(cErr)}`);

  try {
    const { error: lErr } = await supabase.from("contenu_labels").insert({ contenu_id: contenu.id, label_id: pod.label_id });
    if (lErr) throw lErr;
    const lignes = Object.entries(decks).map(([langue, d]) => ({
      contenu_id: contenu.id,
      langue,
      slides: d.slides.map((s) => ({
        position: s.position,
        media_id: s.media_id,
        texte_overlay: "",
        position_sophia: Boolean(s.position_sophia),
      })),
      hashtags: d.hashtags || null,
      nb_passages: 0,
      ...(langue === l.langue_source ? { score: elo, score_maj_at: maintenant } : {}),
    }));
    const { error: clErr } = await supabase.from("contenu_langues").insert(lignes);
    if (clErr) throw clErr;
    const medias = Object.values(decks).flatMap((d) => d.slides.map((s) => s.media_id));
    const { error: mErr } = await supabase.from("media_library").update({ contenu_id: contenu.id }).in("id", medias);
    if (mErr) throw mErr;
  } catch (e) {
    // Pas de contenu à moitié créé : il sortirait au tirage sans ses decks.
    await supabase.from("contenus").delete().eq("id", contenu.id);
    throw e;
  }

  await supabase
    .from("pod_livraisons")
    .update({ statut: "validee", contenu_id: contenu.id, note_import: note, tier, decide_par: userId, decide_le: maintenant, motif: null })
    .eq("id", id);
  return json({ ok: true, statut: "validee", contenu_id: contenu.id, tier, note });
}

async function rejeter(supabase: Supabase, id: string, userId: string | null, motif: string | null) {
  const { data, error } = await supabase
    .from("pod_livraisons")
    .update({ statut: "rejetee", motif, decide_par: userId, decide_le: new Date().toISOString() })
    .eq("id", id)
    .eq("statut", "a_valider")
    .select("id");
  if (error) throw error;
  if (!data?.length) return json({ ok: false, error: "livraison introuvable ou déjà décidée" }, 409);
  return json({ ok: true, statut: "rejetee" });
}
