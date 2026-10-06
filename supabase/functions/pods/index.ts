/**
 * Pods — guichet entre les ateliers de production et l'OS (migration 0259).
 *
 *   { action: "deposer", pod, source_url, source_id, source_vues, titre,
 *     langue_source, musique_url, musique_titre, textes, decks }
 *       Agent du pod, en-tête `x-pod-jeton` (comparé à pods.jeton_hash).
 *       Range les images finies (JPEG sans métadonnées) dans le stockage et
 *       met la livraison dans la file de validation. Ne crée AUCUN contenu.
 *
 *   { action: "deposer", type: "original", pod, source_id, titre,
 *     langue_source, musique_url?, musique_titre?, inspirations?, slides }
 *       ORIGINAL écrit par l'agent : texte de base dans la langue source (sans
 *       appli), une slide avec sa version Sophia, images propres de la banque
 *       du label (media_id) et slide TikTok d'inspiration par position
 *       (reference_url). Validé, il devient un contenu CLASSIQUE au rang
 *       TIER_ORIGINAL : images sans texte, texte à part, traduit et placé à
 *       l'assignation pour les autres langues.
 *
 *   { action: "label", pod, limite? }   — agent : contenus du label avec texte
 *       source, rang et vues chez nous (de quoi voir ce qui marche).
 *   { action: "images", pod }   — agent : banque d'images propres du label.
 *   { action: "top_posts", pod, compte?, limite? }   — agent : nos posts
 *       publiés (avec la slide Sophia) les plus vus, avec leur texte, leurs
 *       images et les slides TikTok d'origine du contenu (modèles de mise en page).
 *
 *   { action: "valider", id, tier? }   — admin (tier A/B/C : rang imposé)
 *       Note d'import classique (30 % pertinence + 70 % vues, prompt
 *       `pertinence`), rang d'entrée C/B/A — ou écartée sous le seuil ; un
 *       original en images finies (sans source_url) entre au rang
 *       TIER_ORIGINAL. Crée un
 *       contenu `livre` dans le label du pod, avec un deck par langue livrée.
 *
 *   { action: "rejeter", id, motif? }   — admin
 *
 *   { action: "etat", pod }   — agent du pod (lecture seule) : file, rangs et
 *       vues des contenus en ligne, comptes du label par langue.
 *
 * Redéposer un post en attente remplace ses langues redéposées. Déposer une
 * langue pour un post déjà validé crée une livraison « langues » (à valider)
 * qui l'ajoutera au contenu existant.
 *
 * Le pod ne choisit ni les comptes ni la fréquence : c'est la tierlist qui
 * diffuse le contenu validé, comme n'importe quel autre.
 */

import { genererHashtagsSlideshow, scoreRelevance } from "../_shared/gemini.ts";
import { eloParLangue, lireScoring } from "../_shared/import_contenu.ts";
import {
  CHEMIN_POD,
  metadonneesJpeg,
  prochainJour,
  sha256Hex,
  TIER_ORIGINAL,
  verifierVideo,
  type ItemVideo,
  verifierDepot,
  verifierOriginal,
  type DeckDepose,
  type SlideOriginale,
} from "../_shared/pods.ts";
import { lireParLots, lireTout } from "../_shared/lots.ts";
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
    if (body?.action === "deposer" && body?.type === "original") return await deposerOriginal(request, supabase, body);
    if (body?.action === "deposer" && body?.type === "video") return await deposerVideo(request, supabase, body);
    if (body?.action === "upload_url") return await urlEnvoi(request, supabase, body);
    if (body?.action === "persona") return await enregistrerPersona(request, supabase, body);
    if (body?.action === "comptes") return await comptesDuPod(request, supabase, body);
    if (body?.action === "valider_persona" || body?.action === "rejeter_persona") {
      const acces = await assertRole(request, ["admin"]);
      if (acces instanceof Response) return acces;
      return await deciderPersona(supabase, String(body.id ?? ""), body.action === "valider_persona", body.motif ? String(body.motif) : null);
    }
    if (body?.action === "deposer") return await deposer(request, supabase, body);
    if (body?.action === "etat") return await etat(request, supabase, String(body.pod ?? ""));
    if (body?.action === "label") return await contenusDuLabel(request, supabase, body);
    if (body?.action === "images") return await imagesDuLabel(request, supabase, String(body.pod ?? ""));
    if (body?.action === "top_posts") return await topPosts(request, supabase, body);
    if (body?.action === "valider" || body?.action === "rejeter") {
      const acces = await assertRole(request, ["admin"]);
      if (acces instanceof Response) return acces;
      const userId = acces.userId === "cron" ? null : acces.userId;
      // Rang imposé par l'admin (« Tout valider en B ») : la note est calculée
      // et gardée, mais ne décide plus du rang ni n'écarte la livraison.
      const tierForce = TIERS_FORCABLES.find((t) => t === body.tier) ?? null;
      return body.action === "valider"
        ? await valider(supabase, String(body.id ?? ""), userId, tierForce)
        : await rejeter(supabase, String(body.id ?? ""), userId, body.motif ? String(body.motif) : null);
    }
    return json({ ok: false, error: "action inconnue (deposer | etat | label | images | top_posts | upload_url | persona | comptes | valider | rejeter | valider_persona | rejeter_persona)" }, 400);
  } catch (e) {
    return json({ ok: false, error: messageErreur(e) }, 500);
  }
});

// ---------------------------------------------------------------------------

// deno-lint-ignore no-explicit-any
type Supabase = any;

/**
 * Légende d'un deck : 3 hashtags dans la langue du compte, générés comme pour
 * un contenu classique à partir du texte des slides. Repli : la légende fournie
 * par le pod (jamais vide si on peut l'éviter : le poster la recopie telle quelle).
 */
async function legendeLocale(textes: string[], titre: string | null, langue: string, repli: string): Promise<string> {
  const genere = await genererHashtagsSlideshow({
    slides: textes.map((texte, i) => ({ position: i + 1, texte })),
    sourceTitle: titre,
    langue,
  }).catch(() => "");
  return genere || repli.trim();
}

/** Pod authentifié par son jeton, ou null. */
async function podDuJeton(request: Request, supabase: Supabase, slug: string) {
  const jeton = request.headers.get("x-pod-jeton") ?? "";
  const { data: pod } = await supabase
    .from("pods")
    .select("slug, label_id, actif, jeton_hash")
    .eq("slug", slug)
    .maybeSingle();
  if (!pod || !jeton || !pod.jeton_hash || (await sha256Hex(jeton)) !== pod.jeton_hash) return null;
  return pod as { slug: string; label_id: string | null; actif: boolean };
}

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

  // Trois cas selon ce qui existe déjà pour ce post :
  //  - rien : nouvelle livraison (la langue source est obligatoire) ;
  //  - à valider : on remplace les langues redéposées, on garde les autres ;
  //  - validée : les langues déposées forment une livraison « langues »,
  //    à valider elle aussi, qui les ajoutera au contenu déjà en ligne.
  const { data: existante } = await supabase
    .from("pod_livraisons")
    .select("id, statut, decks, contenu_id")
    .eq("pod", slug)
    .eq("source_id", sourceId)
    .maybeSingle();
  if (existante && !["a_valider", "validee"].includes(existante.statut)) {
    return json({ ok: false, error: `livraison déjà ${existante.statut}` }, 409);
  }
  const complement = existante?.statut === "validee";
  const erreurs = verifierDepot(decks, existante ? Object.keys(decks)[0] : langueSource);
  if (erreurs.length) return json({ ok: false, error: erreurs.join(" · ") }, 400);

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

  if (complement) {
    const ligneLangues = {
      pod: slug,
      type: "langues",
      source_id: `${sourceId}~langues`,
      source_url: body.source_url ? String(body.source_url) : null,
      titre: body.titre ? String(body.titre).slice(0, 160) : null,
      langue_source: langueSource,
      contenu_id: existante!.contenu_id,
      decks: sortie,
      transcription: { textes: Array.isArray(body.textes) ? body.textes.map(String) : [] },
      statut: "a_valider",
    };
    // Une livraison « langues » encore en attente pour ce post : on y fusionne.
    const { data: attente } = await supabase
      .from("pod_livraisons")
      .select("decks, statut")
      .eq("pod", slug)
      .eq("source_id", ligneLangues.source_id)
      .maybeSingle();
    if (attente?.statut === "a_valider") ligneLangues.decks = { ...(attente.decks ?? {}), ...sortie };
    const { data: l, error } = await supabase
      .from("pod_livraisons")
      .upsert(ligneLangues, { onConflict: "pod,source_id" })
      .select("id")
      .single();
    if (error || !l) throw new Error(`livraison langues : ${messageErreur(error)}`);
    return json({ ok: true, id: l.id, type: "langues", langues: Object.keys(ligneLangues.decks) });
  }

  const ligne = {
    pod: slug,
    type: "nouveau",
    source_id: sourceId,
    source_url: body.source_url ? String(body.source_url) : null,
    source_vues: Number.isFinite(Number(body.source_vues)) ? Number(body.source_vues) : null,
    titre: body.titre ? String(body.titre).slice(0, 160) : null,
    langue_source: langueSource,
    musique_url: body.musique_url ? String(body.musique_url) : null,
    musique_titre: body.musique_titre ? String(body.musique_titre) : null,
    // Redépôt d'une livraison en attente : les langues redéposées remplacent les
    // anciennes, les autres restent.
    decks: { ...((existante?.decks as Record<string, unknown>) ?? {}), ...sortie },
    transcription: { textes: Array.isArray(body.textes) ? body.textes.map(String) : [] },
    statut: "a_valider",
  };
  const { data: livraison, error } = await supabase
    .from("pod_livraisons")
    .upsert(ligne, { onConflict: "pod,source_id" })
    .select("id")
    .single();
  if (error || !livraison) throw new Error(`livraison : ${messageErreur(error)}`);
  return json({ ok: true, id: livraison.id, type: "nouveau", langues: Object.keys(ligne.decks) });
}

const TIERS_FORCABLES = ["A", "B", "C"] as const;

async function valider(
  supabase: Supabase,
  id: string,
  userId: string | null,
  tierForce: (typeof TIERS_FORCABLES)[number] | null = null,
) {
  const { data: l } = await supabase.from("pod_livraisons").select("*").eq("id", id).maybeSingle();
  if (!l) return json({ ok: false, error: "livraison introuvable" }, 404);
  if (l.statut !== "a_valider") return json({ ok: false, error: `déjà ${l.statut}` }, 409);
  if (l.type === "langues") return await validerLangues(supabase, l, userId);
  if (l.type === "original") return await validerOriginal(supabase, l, userId);
  if (l.type === "video") return await validerVideo(supabase, l, userId);
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
  // Original en images finies (pas de post source, donc pas de vues) : rang
  // fixe, comme les originaux traduisibles. La note seule l'écarterait toujours.
  const original = !l.source_url;
  const tier = tierForce ?? (original ? TIER_ORIGINAL : tierImport(elo, scoring.eloSeuil));
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
      tier_rapport: { origine: original ? "pod_original" : "pod", pod: l.pod, elo: note, seuil: scoring.eloSeuil, tier, force: Boolean(tierForce), passages: passagesPourTier(tier) },
      livre: true,
      pod: l.pod,
    })
    .select("id")
    .single();
  if (cErr || !contenu) throw new Error(`contenu : ${messageErreur(cErr)}`);

  const hashtags: Record<string, string> = {};
  for (const [langue, d] of Object.entries(decks)) {
    hashtags[langue] = await legendeLocale(textes, l.titre, langue, d.hashtags ?? "");
  }
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
      hashtags: hashtags[langue] || null,
      nb_passages: 0,
      // Toutes les lignes portent `score` : dans un insert groupé, une clé
      // absente d'une ligne part en null (et non au défaut de la colonne).
      score: eloParLangue({
        pertinence: pertinence.score,
        vues: l.source_vues,
        langue,
        langueSource: l.langue_source,
        prior: scoring.prior,
        k: scoring.k,
        poidsVues: scoring.poidsVues,
        vuesPlafond: scoring.vuesPlafond,
      }),
      score_maj_at: maintenant,
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

// deno-lint-ignore no-explicit-any
async function validerLangues(supabase: Supabase, l: any, userId: string | null) {
  if (!l.contenu_id) return json({ ok: false, error: "contenu d'origine introuvable" }, 409);
  const decks = l.decks as Record<string, { hashtags: string; slides: { position: number; media_id: string; position_sophia: boolean }[] }>;
  const textes: string[] = l.transcription?.textes ?? [];
  const hashtags: Record<string, string> = {};
  for (const [langue, d] of Object.entries(decks)) {
    hashtags[langue] = await legendeLocale(textes, l.titre, langue, d.hashtags ?? "");
  }
  const lignes = Object.entries(decks).map(([langue, d]) => ({
    contenu_id: l.contenu_id,
    langue,
    slides: d.slides.map((s) => ({
      position: s.position,
      media_id: s.media_id,
      texte_overlay: "",
      position_sophia: Boolean(s.position_sophia),
    })),
    hashtags: hashtags[langue] || null,
  }));
  // Une langue déjà présente est remplacée (nouvelle version), sans toucher à
  // son compteur de passages.
  const { error } = await supabase.from("contenu_langues").upsert(lignes, { onConflict: "contenu_id,langue" });
  if (error) throw new Error(`langues : ${messageErreur(error)}`);
  const medias = Object.values(decks).flatMap((d) => d.slides.map((s) => s.media_id));
  await supabase.from("media_library").update({ contenu_id: l.contenu_id }).in("id", medias);
  await supabase
    .from("pod_livraisons")
    .update({ statut: "validee", decide_par: userId, decide_le: new Date().toISOString(), motif: null })
    .eq("id", l.id);
  return json({ ok: true, statut: "validee", contenu_id: l.contenu_id, langues: Object.keys(decks) });
}

/**
 * État du pod pour son agent (jeton du pod, lecture seule) : la file, les
 * contenus en ligne avec leur rang et leurs vues, et les comptes qui portent
 * son label, par langue — de quoi décider quoi produire ensuite.
 */
async function etat(request: Request, supabase: Supabase, slug: string) {
  const jeton = request.headers.get("x-pod-jeton") ?? "";
  const { data: pod } = await supabase.from("pods").select("slug, label_id, actif, jeton_hash").eq("slug", slug).maybeSingle();
  if (!pod || !jeton || !pod.jeton_hash || (await sha256Hex(jeton)) !== pod.jeton_hash) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }
  const { data: livraisons } = await supabase
    .from("pod_livraisons")
    .select("id, type, source_id, titre, statut, motif, decks, tier, note_import, contenu_id, created_at, decide_le")
    .eq("pod", slug)
    .order("created_at", { ascending: false })
    .limit(200);
  const contenuIds = [...new Set((livraisons ?? []).map((l: { contenu_id: string | null }) => l.contenu_id).filter(Boolean))];
  const { data: perfs } = contenuIds.length
    ? await supabase
        .from("contenu_tier_etat")
        .select("contenu_id, tier, passages_prevus, publies, en_vol, restants, moyenne_vues, max_vues, mesures")
        .in("contenu_id", contenuIds)
    : { data: [] };
  const { data: comptes } = await supabase
    .from("compte_labels")
    .select("comptes(langue)")
    .eq("label_id", pod.label_id);
  const parLangue: Record<string, number> = {};
  for (const c of comptes ?? []) {
    // deno-lint-ignore no-explicit-any
    const langue = (c as any).comptes?.langue ?? "?";
    parLangue[langue] = (parLangue[langue] ?? 0) + 1;
  }
  return json({
    ok: true,
    pod: { slug: pod.slug, actif: pod.actif },
    comptes_du_label_par_langue: parLangue,
    // deno-lint-ignore no-explicit-any
    livraisons: (livraisons ?? []).map((l: any) => ({ ...l, decks: undefined, langues: Object.keys(l.decks ?? {}) })),
    perfs: perfs ?? [],
  });
}

// ---------------------------------------------------------------------------
// Originaux traduisibles
// ---------------------------------------------------------------------------

/** Les images doivent être propres (sans texte), dans la banque du label. */
async function verifierImagesDuLabel(supabase: Supabase, labelId: string, ids: string[]): Promise<string[]> {
  const { data: medias } = await supabase
    .from("media_library")
    .select("id, storage_path, texte_restant")
    .in("id", ids);
  const { data: liens } = await supabase
    .from("media_labels")
    .select("media_id")
    .eq("label_id", labelId)
    .in("media_id", ids);
  const duLabel = new Set((liens ?? []).map((l: { media_id: string }) => l.media_id));
  const parId = new Map((medias ?? []).map((m: { id: string }) => [m.id, m]));
  const erreurs: string[] = [];
  for (const id of ids) {
    const m = parId.get(id) as { storage_path: string; texte_restant: boolean } | undefined;
    if (!m) erreurs.push(`${id} : image introuvable`);
    else if (!String(m.storage_path).startsWith("propre/") || m.texte_restant) erreurs.push(`${id} : image pas propre`);
    else if (!duLabel.has(id)) erreurs.push(`${id} : hors de la banque du label`);
  }
  return erreurs;
}

async function deposerOriginal(request: Request, supabase: Supabase, body: Record<string, unknown>) {
  const pod = await podDuJeton(request, supabase, String(body.pod ?? ""));
  if (!pod) return json({ ok: false, error: "unauthorized" }, 401);
  if (!pod.actif) return json({ ok: false, error: "pod en pause" }, 409);
  if (!pod.label_id) return json({ ok: false, error: "le pod n'a pas de label" }, 409);

  const sourceId = String(body.source_id ?? "");
  if (!/^[a-z0-9][a-z0-9_-]{2,60}$/i.test(sourceId)) return json({ ok: false, error: "source_id requis (a-z0-9_-)" }, 400);
  const slides = (Array.isArray(body.slides) ? body.slides : []) as SlideOriginale[];
  const erreurs = verifierOriginal(slides);
  if (!erreurs.length) erreurs.push(...(await verifierImagesDuLabel(supabase, pod.label_id, slides.map((s) => s.media_id))));
  if (erreurs.length) return json({ ok: false, error: erreurs.join(" · ") }, 400);

  const { data: existante } = await supabase
    .from("pod_livraisons")
    .select("id, statut")
    .eq("pod", pod.slug)
    .eq("source_id", sourceId)
    .maybeSingle();
  if (existante && existante.statut !== "a_valider") {
    return json({ ok: false, error: `livraison déjà ${existante.statut}` }, 409);
  }

  const { data: medias } = await supabase.from("media_library").select("id, url").in("id", slides.map((s) => s.media_id));
  const urls = new Map((medias ?? []).map((m: { id: string; url: string }) => [m.id, m.url]));
  const langue = String(body.langue_source ?? "en");
  const titre = String(body.titre ?? "").trim();
  const deck = [...slides]
    .sort((a, b) => a.position - b.position)
    .map((s) => {
      const sophia = String(s.texte_sophia ?? "").trim();
      return {
        position: Number(s.position),
        media_id: s.media_id,
        url: urls.get(s.media_id) ?? null,
        texte_overlay: String(s.texte_overlay).trim(),
        texte_sophia: sophia || null,
        position_sophia: Boolean(sophia),
        reference_url: String(s.reference_url),
      };
    });
  const ligne = {
    pod: pod.slug,
    type: "original",
    source_id: sourceId,
    source_url: null,
    source_vues: null,
    titre: titre.slice(0, 160) || deck[0].texte_overlay.slice(0, 160),
    langue_source: langue,
    musique_url: body.musique_url ? String(body.musique_url) : null,
    musique_titre: body.musique_titre ? String(body.musique_titre) : null,
    decks: { [langue]: { hashtags: titre, slides: deck } },
    transcription: {
      textes: deck.map((s) => s.texte_overlay),
      legende: titre,
      inspirations: Array.isArray(body.inspirations) ? body.inspirations.map(String).slice(0, 20) : [],
    },
    statut: "a_valider",
  };
  const { data: l, error } = await supabase
    .from("pod_livraisons")
    .upsert(ligne, { onConflict: "pod,source_id" })
    .select("id")
    .single();
  if (error || !l) throw new Error(`livraison : ${messageErreur(error)}`);
  return json({ ok: true, id: l.id, type: "original" });
}

/**
 * Original validé → contenu CLASSIQUE : une seule langue (la source), sans app,
 * images épinglées. Les autres langues et le placement naissent à
 * l'assignation (assurerDeckPourLangue). Rang fixe : il n'y a pas de vues
 * source, la note d'import classique l'écarterait toujours.
 */
// deno-lint-ignore no-explicit-any
async function validerOriginal(supabase: Supabase, l: any, userId: string | null) {
  const { data: pod } = await supabase.from("pods").select("slug, label_id").eq("slug", l.pod).single();
  if (!pod?.label_id) return json({ ok: false, error: "le pod n'a pas de label" }, 409);
  const deck = (l.decks?.[l.langue_source]?.slides ?? []) as SlideOriginale[];
  const erreurs = verifierOriginal(deck);
  if (erreurs.length) return json({ ok: false, error: erreurs.join(" · ") }, 409);

  const tier = TIER_ORIGINAL;
  const maintenant = new Date().toISOString();
  const legende = String(l.transcription?.legende ?? l.titre ?? "").trim();
  const { data: contenu, error: cErr } = await supabase
    .from("contenus")
    .insert({
      titre: (legende || deck[0].texte_overlay).slice(0, 500),
      source_url: null,
      langue_source: l.langue_source,
      musique_url: l.musique_url,
      musique_titre: l.musique_titre,
      musique_plateforme: l.musique_url ? "tiktok" : null,
      statut: "valide",
      import_statut: "done",
      creation_mode: "manuel",
      structure_slides: deck.map((s) => ({
        position: s.position,
        media_id: s.media_id,
        pinned: true,
        critere: null,
        // Pas de raw_url : rien à re-nettoyer, l'image propre est épinglée.
        raw_url: null,
        // Slide TikTok d'inspiration : le modèle de mise en page du poster.
        reference_url: s.reference_url,
      })),
      tier,
      passages_prevus: passagesPourTier(tier),
      tier_cycle: 0,
      tier_maj_at: maintenant,
      tier_rapport: {
        origine: "pod_original",
        pod: l.pod,
        tier,
        passages: passagesPourTier(tier),
        inspirations: l.transcription?.inspirations ?? [],
      },
      livre: false,
      pod: l.pod,
    })
    .select("id")
    .single();
  if (cErr || !contenu) throw new Error(`contenu : ${messageErreur(cErr)}`);

  try {
    const { error: lErr } = await supabase.from("contenu_labels").insert({ contenu_id: contenu.id, label_id: pod.label_id });
    if (lErr) throw lErr;
    // Langue source : le deck Sophia écrit par le pod (servi tel quel), et la
    // base SANS appli, d'où l'OS traduit et place Sophia pour les autres langues.
    const base = deck.map((s) => ({ position: s.position, texte_overlay: s.texte_overlay, position_sophia: false }));
    const avecSophia = deck.map((s) => {
      const sophia = String(s.texte_sophia ?? "").trim();
      return { position: s.position, texte_overlay: sophia || s.texte_overlay, position_sophia: Boolean(sophia) };
    });
    const { error: clErr } = await supabase.from("contenu_langues").insert({
      contenu_id: contenu.id,
      langue: l.langue_source,
      slides: avecSophia,
      slides_base: base,
      hashtags: (await legendeLocale(base.map((b) => b.texte_overlay), legende, l.langue_source, legende.match(/#\S+/g)?.slice(0, 3).join(" ") ?? "")) || null,
      nb_passages: 0,
    });
    if (clErr) throw clErr;
  } catch (e) {
    await supabase.from("contenus").delete().eq("id", contenu.id);
    throw e;
  }

  await supabase
    .from("pod_livraisons")
    .update({ statut: "validee", contenu_id: contenu.id, tier, decide_par: userId, decide_le: maintenant, motif: null })
    .eq("id", l.id);
  return json({ ok: true, statut: "validee", contenu_id: contenu.id, tier });
}

/** Handle TikTok d'une URL source (« @compte »), ou null. */
function compteSource(url: string | null): string | null {
  return url?.match(/tiktok\.com\/@([^/?#]+)/i)?.[1] ?? null;
}

/**
 * Contenus du label, pour que l'agent voie ce qui marche : texte source (sans
 * pub), rang, vues source et vues chez nous. Lecture seule.
 */
async function contenusDuLabel(request: Request, supabase: Supabase, body: Record<string, unknown>) {
  const pod = await podDuJeton(request, supabase, String(body.pod ?? ""));
  if (!pod?.label_id) return json({ ok: false, error: "unauthorized" }, 401);
  const limite = Math.min(Math.max(Number(body.limite) || 300, 1), 1000);

  const ids = (
    await lireTout<{ contenu_id: string }>(
      "contenu_labels du label",
      (curseur, taille) => {
        let q = supabase.from("contenu_labels").select("contenu_id").eq("label_id", pod.label_id);
        if (curseur) q = q.gt("contenu_id", curseur.contenu_id);
        return q.order("contenu_id").limit(taille);
      },
      { ancre: (l) => l.contenu_id },
    )
  ).map((r) => r.contenu_id);

  const lignes = [];
  for (let i = 0; i < ids.length; i += 100) {
    const lot = ids.slice(i, i + 100);
    const [{ data: contenus }, { data: perfs }, { data: langues }] = await Promise.all([
      supabase
        .from("contenus")
        .select("id, titre, source_url, vues_source, langue_source, tier, statut, pod, structure_slides, musique_titre, musique_url")
        .in("id", lot)
        .eq("statut", "valide")
        .limit(100),
      supabase
        .from("contenu_tier_etat")
        .select("contenu_id, publies, restants, moyenne_vues, max_vues")
        .in("contenu_id", lot)
        .limit(100),
      // Une ligne par langue : jusqu'à ~25 par contenu, d'où des lots de 30.
      languesSource(supabase, lot),
    ]);
    const perf = new Map((perfs ?? []).map((p: { contenu_id: string }) => [p.contenu_id, p]));
    // deno-lint-ignore no-explicit-any
    for (const c of (contenus ?? []) as any[]) {
      // deno-lint-ignore no-explicit-any
      const ligne = (langues ?? []).find((x: any) => x.contenu_id === c.id && x.langue === c.langue_source);
      const base = (ligne?.slides_base?.length ? ligne.slides_base : ligne?.slides ?? []) as {
        position: number;
        texte_overlay?: string;
        position_sophia?: boolean;
      }[];
      lignes.push({
        id: c.id,
        compte_source: compteSource(c.source_url),
        source_url: c.source_url,
        vues_source: c.vues_source,
        tier: c.tier,
        pod: c.pod,
        musique: c.musique_titre ? { titre: c.musique_titre, url: c.musique_url } : null,
        perf: perf.get(c.id) ?? null,
        slides: base
          .filter((s) => !s.position_sophia)
          .map((s) => ({
            position: s.position,
            texte: s.texte_overlay ?? "",
            // deno-lint-ignore no-explicit-any
            media_id: (c.structure_slides ?? []).find((x: any) => x.position === s.position)?.media_id ?? null,
          })),
      });
    }
  }
  // Ce qui marche, à audience égale : r = vues / médiane des vues du compte
  // (un compte a sa propre audience). Un contenu est jugé sur la médiane de ses r.
  const stats = await statsPassages(supabase, lignes.map((l) => l.id));
  const lignesStats = lignes.map((l) => ({ ...l, chez_nous: stats.get(l.id) ?? null }));
  lignesStats.sort((a, b) => (b.chez_nous?.r_median ?? -1) - (a.chez_nous?.r_median ?? -1));
  return json({ ok: true, total: lignesStats.length, contenus: lignesStats.slice(0, limite) });
}

/** Banque d'images propres du label (sans texte), pour composer des originaux. */
async function imagesDuLabel(request: Request, supabase: Supabase, slug: string) {
  const pod = await podDuJeton(request, supabase, slug);
  if (!pod?.label_id) return json({ ok: false, error: "unauthorized" }, 401);
  const ids = (
    await lireTout<{ media_id: string }>(
      "media_labels du label",
      (curseur, taille) => {
        let q = supabase.from("media_labels").select("media_id").eq("label_id", pod.label_id);
        if (curseur) q = q.gt("media_id", curseur.media_id);
        return q.order("media_id").limit(taille);
      },
      { ancre: (l) => l.media_id },
    )
  ).map((r) => r.media_id);
  const medias = await lireParLots(ids, "media_library du label", (lot) =>
    supabase
      .from("media_library")
      .select("id, url, est_hook, used_count, contenu_id, storage_path, texte_restant")
      .in("id", lot)
      .limit(lot.length)
  );
  const images = [];
  // deno-lint-ignore no-explicit-any
  for (const m of medias as any[]) {
    if (!String(m.storage_path).startsWith("propre/") || m.texte_restant) continue;
    images.push({ id: m.id, url: m.url, est_hook: Boolean(m.est_hook), used_count: m.used_count ?? 0, contenu_id: m.contenu_id });
  }
  return json({ ok: true, total: images.length, images });
}

const mediane = (xs: number[]) => {
  if (!xs.length) return 0;
  const t = [...xs].sort((a, b) => a - b);
  const m = Math.floor(t.length / 2);
  return t.length % 2 ? t[m] : (t[m - 1] + t[m]) / 2;
};

/**
 * Passages publiés (depuis plus de 3 jours, vues mesurées) de ces contenus :
 * nombre, vues médiane / moyenne / max, et médiane des r (vues / médiane du compte).
 */
async function statsPassages(supabase: Supabase, contenuIds: string[]) {
  const limite = new Date(Date.now() - 3 * 86_400_000).toISOString();
  type Passage = { id: string; contenu_id: string; compte_id: string; vues: number };
  const passages: Passage[] = [];
  for (let i = 0; i < contenuIds.length; i += 100) {
    const lot = contenuIds.slice(i, i + 100);
    passages.push(
      ...(await lireTout<Passage>(
        "passages publiés des contenus",
        (curseur, taille) => {
          let q = supabase
            .from("passages")
            .select("id, contenu_id, compte_id, vues")
            .in("contenu_id", lot)
            .eq("statut", "publie")
            .not("vues", "is", null)
            .lt("date_publication_prevue", limite);
          if (curseur) q = q.gt("id", curseur.id);
          return q.order("id").limit(taille);
        },
        { ancre: (p) => p.id },
      )),
    );
  }
  const comptes = [...new Set(passages.map((p) => p.compte_id))];
  const vuesCompte = new Map<string, number[]>();
  for (let i = 0; i < comptes.length; i += 100) {
    const lot = comptes.slice(i, i + 100);
    const lignes = await lireTout<{ id: string; compte_id: string; vues: number }>(
      "passages publiés des comptes",
      (curseur, taille) => {
        let q = supabase
          .from("passages")
          .select("id, compte_id, vues")
          .in("compte_id", lot)
          .eq("statut", "publie")
          .not("vues", "is", null);
        if (curseur) q = q.gt("id", curseur.id);
        return q.order("id").limit(taille);
      },
      { ancre: (p) => p.id },
    );
    for (const p of lignes) vuesCompte.set(p.compte_id, [...(vuesCompte.get(p.compte_id) ?? []), Number(p.vues)]);
  }
  const medCompte = new Map([...vuesCompte].map(([c, v]) => [c, mediane(v)]));
  const parContenu = new Map<string, { vues: number[]; r: number[] }>();
  for (const p of passages) {
    const e = parContenu.get(p.contenu_id) ?? { vues: [], r: [] };
    e.vues.push(Number(p.vues));
    const m = medCompte.get(p.compte_id) ?? 0;
    if (m > 0) e.r.push(Number(p.vues) / m);
    parContenu.set(p.contenu_id, e);
  }
  const sortie = new Map<string, { publies: number; vues_mediane: number; vues_moyenne: number; vues_max: number; r_median: number | null }>();
  for (const [id, e] of parContenu) {
    sortie.set(id, {
      publies: e.vues.length,
      vues_mediane: Math.round(mediane(e.vues)),
      vues_moyenne: Math.round(e.vues.reduce((a, b) => a + b, 0) / e.vues.length),
      vues_max: Math.max(...e.vues),
      // Sous 3 passages, le r n'est pas significatif.
      r_median: e.r.length >= 3 ? Math.round(mediane(e.r) * 100) / 100 : null,
    });
  }
  return sortie;
}

/** Lignes de langue de contenus (toutes langues), lues par petits lots bornés. */
async function languesSource(supabase: Supabase, ids: string[]) {
  // deno-lint-ignore no-explicit-any
  const data: any[] = [];
  for (let i = 0; i < ids.length; i += 30) {
    const lot = ids.slice(i, i + 30);
    const { data: lignes, error } = await supabase
      .from("contenu_langues")
      .select("contenu_id, langue, slides, slides_base")
      .in("contenu_id", lot)
      .limit(999);
    if (error) throw new Error(`contenu_langues : ${messageErreur(error)}`);
    data.push(...(lignes ?? []));
  }
  return { data };
}

/**
 * Nos posts PUBLIÉS les plus vus du label (tels que postés : traduits, avec la
 * slide Sophia), éventuellement limités aux contenus d'un compte source. Pour
 * chacun : vues, langue, texte des slides, images, et les slides TikTok
 * d'origine du contenu (`reference_url`) qui servent de modèle au poster.
 */
async function topPosts(request: Request, supabase: Supabase, body: Record<string, unknown>) {
  const pod = await podDuJeton(request, supabase, String(body.pod ?? ""));
  if (!pod?.label_id) return json({ ok: false, error: "unauthorized" }, 401);
  const compte = body.compte ? String(body.compte).replace(/^@/, "").toLowerCase() : null;
  const limite = Math.min(Math.max(Number(body.limite) || 20, 1), 100);

  const ids = (
    await lireTout<{ contenu_id: string }>(
      "contenu_labels du label",
      (curseur, taille) => {
        let q = supabase.from("contenu_labels").select("contenu_id").eq("label_id", pod.label_id);
        if (curseur) q = q.gt("contenu_id", curseur.contenu_id);
        return q.order("contenu_id").limit(taille);
      },
      { ancre: (l) => l.contenu_id },
    )
  ).map((r) => r.contenu_id);
  type ContenuSource = { id: string; source_url: string | null; structure_slides: { position: number; media_id?: string; reference_url?: string; raw_url?: string }[] | null };
  const contenus = (await lireParLots(ids, "contenus du label", (lot) =>
    supabase.from("contenus").select("id, source_url, structure_slides").in("id", lot).limit(lot.length)
  )) as ContenuSource[];
  const retenus = new Map(
    contenus
      .filter((c) => !compte || (compteSource(c.source_url) ?? "").toLowerCase() === compte)
      .map((c) => [c.id, c]),
  );

  type Passage = { id: string; post_id: string; contenu_id: string; vues: number; compte_id: string };
  const passages: Passage[] = [];
  const cles = [...retenus.keys()];
  for (let i = 0; i < cles.length; i += 100) {
    const lot = cles.slice(i, i + 100);
    passages.push(
      ...(await lireTout<Passage>(
        "passages publiés",
        (curseur, taille) => {
          let q = supabase
            .from("passages")
            .select("id, post_id, contenu_id, vues, compte_id")
            .in("contenu_id", lot)
            .eq("statut", "publie")
            .not("vues", "is", null)
            .not("post_id", "is", null);
          if (curseur) q = q.gt("id", curseur.id);
          return q.order("id").limit(taille);
        },
        { ancre: (p) => p.id },
      )),
    );
  }
  passages.sort((a, b) => b.vues - a.vues);

  const sortie = [];
  for (const p of passages) {
    if (sortie.length >= limite) break;
    const { data: slides } = await supabase
      .from("post_slides")
      .select("position, texte_overlay, position_sophia, media_id")
      .eq("post_id", p.post_id)
      .order("position")
      .limit(20);
    // Seulement les posts AVEC la slide Sophia.
    if (!(slides ?? []).some((s: { position_sophia: boolean }) => s.position_sophia)) continue;
    const { data: compteRow } = await supabase.from("comptes").select("langue").eq("id", p.compte_id).maybeSingle();
    const c = retenus.get(p.contenu_id);
    sortie.push({
      vues: p.vues,
      langue: compteRow?.langue ?? null,
      contenu_id: p.contenu_id,
      compte_source: compteSource(c?.source_url ?? null),
      slides: slides ?? [],
      // deno-lint-ignore no-explicit-any
      references: (c?.structure_slides ?? []).map((s: any) => ({
        position: s.position,
        media_id: s.media_id ?? null,
        reference_url: s.reference_url ?? s.raw_url ?? null,
      })),
    });
  }
  return json({ ok: true, posts: sortie });
}

// ---------------------------------------------------------------------------
// Vidéos par compte (pod 3, réactions UGC)
// ---------------------------------------------------------------------------

const urlPublique = (supabase: Supabase, chemin: string) =>
  supabase.storage.from(BUCKET).getPublicUrl(chemin).data.publicUrl as string;

/**
 * URL d'envoi signée vers medias/pods/<pod>/<chemin> : l'agent y PUT ses
 * fichiers (persona, réactions MP4 déjà sans métadonnées) sans jamais avoir
 * de clé de stockage.
 */
async function urlEnvoi(request: Request, supabase: Supabase, body: Record<string, unknown>) {
  const pod = await podDuJeton(request, supabase, String(body.pod ?? ""));
  if (!pod) return json({ ok: false, error: "unauthorized" }, 401);
  const relatif = String(body.chemin ?? "");
  if (!CHEMIN_POD.test(relatif)) return json({ ok: false, error: "chemin : personas/<compte>.jpg|png ou reactions/<source>/<compte>.mp4" }, 400);
  const chemin = `pods/${pod.slug}/${relatif}`;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(chemin, { upsert: true });
  if (error || !data) throw new Error(`url d'envoi : ${messageErreur(error)}`);
  return json({ ok: true, chemin, upload_url: data.signedUrl, url: urlPublique(supabase, chemin) });
}

/** Comptes candidats (actifs) et persona du pod de chacun. Lecture seule. */
async function comptesDuPod(request: Request, supabase: Supabase, body: Record<string, unknown>) {
  const pod = await podDuJeton(request, supabase, String(body.pod ?? ""));
  if (!pod) return json({ ok: false, error: "unauthorized" }, 401);
  let q = supabase
    .from("comptes")
    .select("id, langue, persona_nom, handle_tiktok, is_active")
    .eq("is_active", true)
    .order("langue")
    .limit(500);
  if (body.langue) q = q.eq("langue", String(body.langue));
  const { data: comptes, error } = await q;
  if (error) throw new Error(`comptes : ${messageErreur(error)}`);
  const { data: personas } = await supabase
    .from("pod_personas")
    .select("compte_id, statut, image_url, description")
    .eq("pod", pod.slug)
    .limit(500);
  const parCompte = new Map((personas ?? []).map((p: { compte_id: string }) => [p.compte_id, p]));
  return json({
    ok: true,
    // deno-lint-ignore no-explicit-any
    comptes: (comptes ?? []).map((c: any) => ({ ...c, persona: parCompte.get(c.id) ?? null })),
  });
}

/** Le persona synthétique d'un compte (image déjà envoyée), en attente de validation. */
async function enregistrerPersona(request: Request, supabase: Supabase, body: Record<string, unknown>) {
  const pod = await podDuJeton(request, supabase, String(body.pod ?? ""));
  if (!pod) return json({ ok: false, error: "unauthorized" }, 401);
  const compteId = String(body.compte_id ?? "");
  const chemin = String(body.image_path ?? "");
  if (!new RegExp(`^pods/${pod.slug}/personas/${compteId}\\.(jpg|png)$`).test(chemin)) {
    return json({ ok: false, error: `image_path attendu pods/${pod.slug}/personas/<compte_id>.jpg` }, 400);
  }
  const { data: compte } = await supabase.from("comptes").select("id").eq("id", compteId).maybeSingle();
  if (!compte) return json({ ok: false, error: "compte introuvable" }, 404);
  const { data: existant } = await supabase
    .from("pod_personas")
    .select("statut")
    .eq("pod", pod.slug)
    .eq("compte_id", compteId)
    .maybeSingle();
  if (existant?.statut === "valide") {
    return json({ ok: false, error: "ce compte a déjà un persona validé : 1 compte = 1 persona" }, 409);
  }
  const { data, error } = await supabase
    .from("pod_personas")
    .upsert(
      {
        pod: pod.slug,
        compte_id: compteId,
        image_path: chemin,
        image_url: `${urlPublique(supabase, chemin)}?v=${Date.now()}`,
        description: String(body.description ?? "").slice(0, 1000),
        statut: "a_valider",
        motif: null,
        decide_le: null,
      },
      { onConflict: "pod,compte_id" },
    )
    .select("id")
    .single();
  if (error || !data) throw new Error(`persona : ${messageErreur(error)}`);
  return json({ ok: true, id: data.id });
}

async function deciderPersona(supabase: Supabase, id: string, valide: boolean, motif: string | null) {
  const { data, error } = await supabase
    .from("pod_personas")
    .update({ statut: valide ? "valide" : "rejete", motif, decide_le: new Date().toISOString() })
    .eq("id", id)
    .eq("statut", "a_valider")
    .select("id");
  if (error) throw error;
  if (!data?.length) return json({ ok: false, error: "persona introuvable ou déjà décidé" }, 409);
  return json({ ok: true, statut: valide ? "valide" : "rejete" });
}

/**
 * Une réaction source déclinée sur N comptes : pour chacun, la réaction refaite
 * avec SON persona (MP4 déjà envoyé), le texte à l'écran et la légende dans sa
 * langue. Chaque compte doit avoir un persona validé.
 */
async function deposerVideo(request: Request, supabase: Supabase, body: Record<string, unknown>) {
  const pod = await podDuJeton(request, supabase, String(body.pod ?? ""));
  if (!pod) return json({ ok: false, error: "unauthorized" }, 401);
  if (!pod.actif) return json({ ok: false, error: "pod en pause" }, 409);
  const sourceId = String(body.source_id ?? "");
  if (!/^[a-z0-9_-]{3,60}$/i.test(sourceId)) return json({ ok: false, error: "source_id requis (a-z0-9_-)" }, 400);
  const items = (Array.isArray(body.items) ? body.items : []) as ItemVideo[];
  const erreurs = verifierVideo(pod.slug, items);
  if (erreurs.length) return json({ ok: false, error: erreurs.join(" · ") }, 400);

  const ids = items.map((i) => i.compte_id);
  const [{ data: comptes }, { data: personas }] = await Promise.all([
    supabase.from("comptes").select("id, langue, persona_nom").in("id", ids).limit(ids.length),
    supabase.from("pod_personas").select("compte_id, statut").eq("pod", pod.slug).in("compte_id", ids).limit(ids.length),
  ]);
  const langues = new Map((comptes ?? []).map((c: { id: string; langue: string }) => [c.id, c.langue]));
  const valides = new Set(
    (personas ?? []).filter((p: { statut: string }) => p.statut === "valide").map((p: { compte_id: string }) => p.compte_id),
  );
  const manquants = ids.filter((id) => !langues.has(id));
  const sansPersona = ids.filter((id) => langues.has(id) && !valides.has(id));
  if (manquants.length) return json({ ok: false, error: `comptes introuvables : ${manquants.join(", ")}` }, 400);
  if (sansPersona.length) return json({ ok: false, error: `persona non validé : ${sansPersona.join(", ")}` }, 409);

  const { data: existante } = await supabase
    .from("pod_livraisons")
    .select("id, statut")
    .eq("pod", pod.slug)
    .eq("source_id", sourceId)
    .maybeSingle();
  if (existante && existante.statut !== "a_valider") return json({ ok: false, error: `livraison déjà ${existante.statut}` }, 409);

  const decks: Record<string, unknown> = {};
  for (const i of items) {
    decks[i.compte_id] = {
      langue: langues.get(i.compte_id),
      reaction_path: i.reaction_path,
      reaction_url: `${urlPublique(supabase, i.reaction_path)}?v=${Date.now()}`,
      texte_ecran: String(i.texte_ecran).trim(),
      legende: String(i.legende).trim(),
    };
  }
  const ligne = {
    pod: pod.slug,
    type: "video",
    source_id: sourceId,
    source_url: body.source_url ? String(body.source_url) : null,
    source_vues: Number.isFinite(Number(body.source_vues)) ? Number(body.source_vues) : null,
    titre: body.titre ? String(body.titre).slice(0, 160) : null,
    langue_source: String(body.langue_source ?? "en"),
    musique_url: body.musique_url ? String(body.musique_url) : null,
    musique_titre: body.musique_titre ? String(body.musique_titre) : null,
    decks,
    transcription: { texte_source: body.texte_source ? String(body.texte_source) : null },
    statut: "a_valider",
  };
  const { data: l, error } = await supabase
    .from("pod_livraisons")
    .upsert(ligne, { onConflict: "pod,source_id" })
    .select("id")
    .single();
  if (error || !l) throw new Error(`livraison : ${messageErreur(error)}`);
  return json({ ok: true, id: l.id, type: "video", comptes: ids.length });
}

/**
 * Validation d'une réaction déclinée : une vidéo par compte, posée sur le
 * premier jour libre du compte (à partir de demain), avec la démo Sophia de sa
 * langue. Toutes les langues doivent avoir leur démo, sinon rien n'est créé.
 */
// deno-lint-ignore no-explicit-any
async function validerVideo(supabase: Supabase, l: any, userId: string | null) {
  const decks = l.decks as Record<string, { langue: string; reaction_url: string; texte_ecran: string; legende: string }>;
  const langues = [...new Set(Object.values(decks).map((d) => d.langue))];
  const { data: demos } = await supabase
    .from("pod_demos")
    .select("langue, video_url")
    .eq("application", "sophia")
    .in("langue", langues)
    .limit(langues.length);
  const demo = new Map((demos ?? []).map((d: { langue: string; video_url: string }) => [d.langue, d.video_url]));
  const sansDemo = langues.filter((g) => !demo.has(g));
  if (sansDemo.length) {
    return json({ ok: false, error: `démo Sophia manquante pour : ${sansDemo.join(", ")} (Pilotage → Pods, pod Réactions UGC)` }, 409);
  }

  const comptes = Object.keys(decks);
  const { data: derniers } = await supabase
    .from("pod_videos")
    .select("compte_id, date_publication_prevue")
    .in("compte_id", comptes)
    .neq("statut", "annule")
    .order("date_publication_prevue", { ascending: false })
    .limit(500);
  const dernier = new Map<string, string>();
  for (const v of derniers ?? []) if (!dernier.has(v.compte_id)) dernier.set(v.compte_id, v.date_publication_prevue);
  const aujourdhui = new Date().toISOString().slice(0, 10);

  const lignes = Object.entries(decks).map(([compteId, d]) => ({
    livraison_id: l.id,
    pod: l.pod,
    compte_id: compteId,
    langue: d.langue,
    date_publication_prevue: prochainJour(dernier.get(compteId) ?? null, aujourdhui),
    reaction_url: d.reaction_url,
    demo_url: demo.get(d.langue),
    texte_ecran: d.texte_ecran,
    legende: d.legende,
    musique_titre: l.musique_titre,
    musique_url: l.musique_url,
  }));
  const { error } = await supabase.from("pod_videos").insert(lignes);
  if (error) throw new Error(`vidéos : ${messageErreur(error)}`);
  await supabase
    .from("pod_livraisons")
    .update({ statut: "validee", decide_par: userId, decide_le: new Date().toISOString(), motif: null })
    .eq("id", l.id);
  return json({ ok: true, statut: "validee", videos: lignes.length });
}
