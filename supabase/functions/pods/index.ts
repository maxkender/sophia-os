/**
 * Pods — guichet entre les ateliers de production et l'OS (migration 0259).
 *
 *   { action: "deposer", pod, source_url, source_id, source_vues, titre,
 *     langue_source, musique_url, musique_titre, textes, decks }
 *       Agent du pod, en-tête `x-pod-jeton` (comparé à pods.jeton_hash).
 *       Range les images finies (JPEG sans métadonnées) dans le stockage et
 *       met la livraison dans la file de validation. Ne crée AUCUN contenu.
 *       `decks_applications` (facultatif, 0276) : variantes du deck pour une
 *       autre application que Sophia, servies sur SES seuls créneaux :
 *         { "unswipe": { "fr": { "hashtags": "…", "slides": [
 *             { "position": 1, "reprendre": true },        ← image Sophia fr #1
 *             { "position": 6, "position_app": true, "jpeg_base64": "…" } ] } } }
 *       Mêmes positions que le deck Sophia de la langue, une seule slide de
 *       l'app (jamais la couverture), label du pod lié à l'application. Un
 *       post déjà validé peut ne recevoir QUE des decks d'application.
 *       Label qui ne sert PAS Sophia (pod 6, UnSwipe seul) : un seul deck par
 *       langue dans `decks`, la slide de l'application marquée `position_app`
 *       (jamais la couverture), sans `decks_applications` : l'OS en tire la
 *       variante de l'application. La validation note alors la pertinence
 *       avec `pertinence_<app>`, laisse le rang Sophia à D / 0 et donne le
 *       rang calculé à l'application.
 *
 *   { action: "deposer", type: "original", pod, source_id, titre,
 *     langue_source, musique_url?, musique_titre?, inspirations?, slides }
 *       ORIGINAL écrit par l'agent : texte de base dans la langue source (sans
 *       appli), une slide avec sa version Sophia, images propres de la banque
 *       du label (media_id) et slide TikTok d'inspiration par position
 *       (reference_url). Validé, il devient un contenu CLASSIQUE au rang
 *       TIER_ORIGINAL : images sans texte, texte à part, traduit et placé à
 *       l'assignation pour les autres langues.
 *       Pods de PODS_AVEC_PREUVE (pods 4, 5, 7, 8 et 9) : `preuve` obligatoire,
 *         { schema, references: [{ type: "tiktok", url, vues, publie_le },
 *                                { type: "os", contenu_id }] }
 *       Il faut un post de la niche à 200 k vues ou plus publié dans les
 *       30 derniers jours, ou un contenu du label à r ≥ 2 (recalculé ici).
 *
 *   { action: "label", pod, limite? }   — agent : contenus du label avec texte
 *       source, rang et vues chez nous (de quoi voir ce qui marche).
 *   { action: "images", pod }   — agent : banque d'images propres du label.
 *   { action: "photos", pod, cherche, limite? }   — agent : photos propres de
 *       TOUTE la banque dont la description (en anglais) contient chaque mot
 *       cherché, sans visage reconnaissable ni texte restant (pod 10 : son
 *       label n'a pas de banque à lui).
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
 *   { action: "auto_valider" }   — cron horaire `pods-auto-validation` (0323)
 *       Podz sûrs (`pods.auto_validation`) : chaque livraison en attente depuis
 *       `auto_validation_heures` (12 h) après son dépôt est validée au rang B,
 *       comme « Tout valider en B ». Un échec est noté dans `auto_erreur` et
 *       n'est plus retenté : la livraison reste à décider à la main.
 *
 *   { action: "ouvrir_applications_originaux" }   — admin, rattrapage rejouable
 *       Ouvre les originaux déjà validés aux applications de leur label autres
 *       que Sophia (UnSwipe, Micabo), comme le fait désormais la validation.
 *
 *   { action: "etat", pod }   — agent du pod (lecture seule) : file, rangs et
 *       vues des contenus en ligne (avec le r de chaque passage mûr), comptes
 *       du label par langue.
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
  applicationsHorsSophia,
  CHEMIN_POD,
  decksApplicationDepuisBase,
  livraisonsAutoValidables,
  type LivraisonEnAttente,
  ouvrirApplicationsOriginal,
  ecrireDecksApplications,
  estSlideApp,
  LEGENDE_A_ECARTER,
  metadonneesJpeg,
  PODS_AVEC_PREUVE,
  PREUVE_JOURS_MAX,
  PREUVE_R_MIN,
  PREUVE_VUES_MIN,
  prochainJour,
  motsCherches,
  sha256Hex,
  TIER_ORIGINAL,
  verifierVideo,
  type ItemVideo,
  verifierDepot,
  verifierOriginal,
  verifierPreuve,
  type DeckDepose,
  type DecksApplicationsDeposes,
  type DecksApplicationsLivres,
  type SlideAppLivree,
  type SlideEnvoyee,
  type PreuveOriginal,
  type SlideOriginale,
  verifierDecksApplications,
} from "../_shared/pods.ts";
import { applicationsDuLabel, ID_SOPHIA } from "../_shared/multi_app.ts";
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
    if (body?.action === "photos") return await photosDeLaBanque(request, supabase, body);
    if (body?.action === "top_posts") return await topPosts(request, supabase, body);
    if (body?.action === "auto_valider" || body?.action === "ouvrir_applications_originaux") {
      const acces = await assertRole(request, ["admin"]);
      if (acces instanceof Response) return acces;
      return body.action === "auto_valider" ? await autoValider(supabase) : await ouvrirApplicationsOriginaux(supabase);
    }
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
    return json({ ok: false, error: "action inconnue (deposer | etat | label | images | photos | top_posts | upload_url | persona | comptes | valider | rejeter | auto_valider | ouvrir_applications_originaux | valider_persona | rejeter_persona)" }, 400);
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

/**
 * Application du label d'un pod quand ce label ne sert PAS Sophia (pod 6,
 * label UnSwipe seul) : son id et son slug. `null` : le label sert Sophia, le
 * cas de tous les pods d'avant (ou aucune application cochée : deck Sophia). Un label hors
 * Sophia qui sert plusieurs applications lève : un deck déposé ne porte qu'une
 * pub.
 */
async function applicationHorsSophiaDuPod(
  supabase: Supabase,
  labelId: string | null,
): Promise<{ id: string; slug: string } | null> {
  if (!labelId) return null;
  const { data: liens, error } = await supabase
    .from("label_applications")
    .select("label_id, application_id")
    .eq("label_id", labelId);
  if (error) throw new Error(`label_applications : ${messageErreur(error)}`);
  const horsSophia = applicationsHorsSophia(applicationsDuLabel(labelId, liens ?? []), ID_SOPHIA);
  if (!horsSophia) return null;
  if (horsSophia.length !== 1) {
    throw new Error(`le label du pod sert ${horsSophia.length} applications hors Sophia : non pris en charge`);
  }
  const { data: app, error: aErr } = await supabase.from("applications").select("id, slug").eq("id", horsSophia[0]).single();
  if (aErr || !app) throw new Error(`application ${horsSophia[0]} : ${messageErreur(aErr)}`);
  return app as { id: string; slug: string };
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
  const { data: pod } = await supabase.from("pods").select("slug, label_id, actif, jeton_hash").eq("slug", slug).maybeSingle();
  if (!pod || !jeton || !pod.jeton_hash || (await sha256Hex(jeton)) !== pod.jeton_hash) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }
  if (!pod.actif) return json({ ok: false, error: "pod en pause" }, 409);

  const sourceId = String(body.source_id ?? "");
  if (!sourceId) return json({ ok: false, error: "source_id requis" }, 400);
  const langueSource = String(body.langue_source ?? "fr");
  const decks = (body.decks ?? {}) as Record<string, DeckDepose>;
  // Variantes du deck par application (0276) : absentes, rien ne change.
  const decksApps = (body.decks_applications ?? {}) as DecksApplicationsDeposes;
  if (typeof decksApps !== "object" || Array.isArray(decksApps)) {
    return json({ ok: false, error: "decks_applications invalide" }, 400);
  }
  const avecApps = Object.keys(decksApps).length > 0;
  // Label hors Sophia (pod 6) : le deck déposé EST celui de l'application, sa
  // slide marquée `position_app` ; l'OS en tire la variante lui-même.
  const appLabel = await applicationHorsSophiaDuPod(supabase, pod.label_id);
  if (appLabel && avecApps) {
    return json({
      ok: false,
      error: `label hors Sophia : dépose un seul deck par langue, la slide ${appLabel.slug} marquée position_app (l'OS en tire la variante)`,
    }, 400);
  }
  const avecVariantes = avecApps || appLabel !== null;

  // Trois cas selon ce qui existe déjà pour ce post :
  //  - rien : nouvelle livraison (la langue source est obligatoire) ;
  //  - à valider : on remplace les langues redéposées, on garde les autres ;
  //  - validée : les langues déposées forment une livraison « langues »,
  //    à valider elle aussi, qui les ajoutera au contenu déjà en ligne.
  // `*` : lit `decks_applications` quand 0276 est passée, sans dépendre d'elle.
  const { data: existante } = await supabase
    .from("pod_livraisons")
    .select("*")
    .eq("pod", slug)
    .eq("source_id", sourceId)
    .maybeSingle();
  if (existante && !["a_valider", "validee"].includes(existante.statut)) {
    return json({ ok: false, error: `livraison déjà ${existante.statut}` }, 409);
  }
  const complement = existante?.statut === "validee";
  // Complément d'un post en ligne : un dépôt peut n'apporter QUE des decks d'application.
  const appsSeules = complement && avecApps && Object.keys(decks).length === 0;
  const erreurs = appsSeules
    ? []
    : verifierDepot(decks, existante ? Object.keys(decks)[0] : langueSource, appLabel ? "application" : "sophia");
  if (erreurs.length) return json({ ok: false, error: erreurs.join(" · ") }, 400);

  // Livraison « langues » de ce post (complément), lue avant les contrôles :
  // ses decks en attente comptent comme decks Sophia.
  const sourceLangues = `${sourceId}~langues`;
  const { data: attente } = complement
    ? await supabase.from("pod_livraisons").select("*").eq("pod", slug).eq("source_id", sourceLangues).maybeSingle()
    : { data: null };

  // Decks Sophia connus, par langue puis position (le plus récent l'emporte) :
  // de quoi contrôler les decks d'application et résoudre `reprendre`.
  const sophia = new Map<string, Map<number, RefSlide>>();
  const poser = (langue: string, slides: RefSlideDeck[] | null | undefined) => {
    sophia.set(
      langue,
      new Map(
        (slides ?? []).map((s) => [
          Number(s.position),
          { media_id: s.media_id ?? null, url: s.url ?? null, position_sophia: Boolean(s.position_sophia) },
        ]),
      ),
    );
  };
  if (avecVariantes) {
    const sonde = await supabase.from("pod_livraisons").select("decks_applications").limit(1);
    if (sonde.error) {
      return json({ ok: false, error: "decks_applications indisponible (migration 0276 non appliquée)" }, 409);
    }
  }
  if (avecApps) {
    for (const [langue, d] of Object.entries((existante?.decks ?? {}) as Record<string, { slides: RefSlideDeck[] }>)) {
      poser(langue, d.slides);
    }
    if (complement && existante?.contenu_id) {
      const { data: cls, error } = await supabase
        .from("contenu_langues")
        .select("langue, slides")
        .eq("contenu_id", existante.contenu_id);
      if (error) throw new Error(`contenu_langues : ${messageErreur(error)}`);
      for (const cl of (cls ?? []) as { langue: string; slides: RefSlideDeck[] | null }[]) {
        if ((cl.slides ?? []).length) poser(cl.langue, cl.slides);
      }
    }
    if (attente?.statut === "a_valider") {
      for (const [langue, d] of Object.entries((attente.decks ?? {}) as Record<string, { slides: RefSlideDeck[] }>)) {
        poser(langue, d.slides);
      }
    }
    // Ce dépôt : images pas encore envoyées, seules les positions et la slide Sophia comptent ici.
    for (const [langue, d] of Object.entries(decks)) {
      poser(langue, d.slides.map((s) => ({ position: s.position, position_sophia: Boolean(s.position_sophia || s.position_app) })));
    }
    const positions = new Map([...sophia].map(([l, m]) => [l, [...m.keys()]]));
    const pubs = new Map([...sophia].map(([l, m]) => [l, [...m].filter(([, r]) => r.position_sophia).map(([p]) => p)]));
    const erreursApps = verifierDecksApplications(decksApps, new Set(sophia.keys()), positions, pubs);
    if (erreursApps.length) return json({ ok: false, error: erreursApps.join(" · ") }, 400);

    // Applications servies par le label du pod, jamais Sophia.
    const slugsApps = Object.keys(decksApps);
    const { data: apps, error: aErr } = await supabase
      .from("applications")
      .select("id, slug")
      .in("slug", slugsApps)
      .neq("id", ID_SOPHIA);
    if (aErr) throw new Error(`applications : ${messageErreur(aErr)}`);
    const idParSlug = new Map(((apps ?? []) as { id: string; slug: string }[]).map((a) => [a.slug, a.id]));
    const inconnue = slugsApps.find((s) => !idParSlug.has(s));
    if (inconnue) return json({ ok: false, error: `application inconnue : ${inconnue}` }, 400);
    if (!pod.label_id) return json({ ok: false, error: "le pod n'a pas de label" }, 409);
    const { data: liens, error: lErr } = await supabase
      .from("label_applications")
      .select("application_id")
      .eq("label_id", pod.label_id)
      .in("application_id", [...idParSlug.values()]);
    if (lErr) throw new Error(`label_applications : ${messageErreur(lErr)}`);
    const servies = new Set(((liens ?? []) as { application_id: string }[]).map((l) => l.application_id));
    const nonServie = slugsApps.find((s) => !servies.has(idParSlug.get(s)!));
    if (nonServie) return json({ ok: false, error: `le label du pod ne sert pas ${nonServie}` }, 400);
  }

  // Images : contrôle complet AVANT le premier envoi (pas de dépôt à moitié).
  const binaires = new Map<string, Uint8Array>();
  const controler = (cle: string, quoi: string, base64: string): string | null => {
    let octets: Uint8Array;
    try {
      octets = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    } catch {
      return `${quoi} : base64 invalide`;
    }
    const restes = metadonneesJpeg(octets);
    if (restes === null) return `${quoi} : pas un JPEG`;
    if (restes.length) return `${quoi} : métadonnées ${restes.join(", ")}`;
    binaires.set(cle, octets);
    return null;
  };
  for (const [langue, deck] of Object.entries(decks)) {
    for (const s of deck.slides) {
      const erreur = controler(`${langue}/${s.position}`, `${langue} #${s.position}`, s.jpeg_base64);
      if (erreur) return json({ ok: false, error: erreur }, 400);
    }
  }
  for (const [app, parLangue] of Object.entries(decksApps)) {
    for (const [langue, deck] of Object.entries(parLangue)) {
      for (const s of deck.slides) {
        if (s.reprendre) continue;
        const erreur = controler(`${app}/${langue}/${s.position}`, `${app} ${langue} #${s.position}`, String(s.jpeg_base64));
        if (erreur) return json({ ok: false, error: erreur }, 400);
      }
    }
  }

  const version = Date.now();
  /** Envoie une image finie au stockage et l'inscrit dans la médiathèque. */
  const envoyer = async (path: string, octets: Uint8Array, langue: string) => {
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, octets, { contentType: "image/jpeg", upsert: true });
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
    return { media_id: media.id as string, url };
  };

  const sortie: Record<string, { hashtags: string; slides: unknown[] }> = {};
  const envoyees: Record<string, { hashtags: string; slides: SlideEnvoyee[] }> = {};
  for (const [langue, deck] of Object.entries(decks)) {
    const slides = [];
    const hashtags = String(deck.hashtags ?? "").trim();
    envoyees[langue] = { hashtags, slides: [] };
    for (const s of [...deck.slides].sort((a, b) => a.position - b.position)) {
      const path = `pods/${slug}/${sourceId}/${langue}/${s.position}.jpg`;
      const { media_id, url } = await envoyer(path, binaires.get(`${langue}/${s.position}`)!, langue);
      // Label hors Sophia : aucune slide Sophia dans le deck de base.
      slides.push({ position: s.position, media_id, url, position_sophia: appLabel ? false : Boolean(s.position_sophia) });
      envoyees[langue].slides.push({ position: Number(s.position), media_id, url, app: estSlideApp(s) });
      sophia.get(langue)?.set(Number(s.position), { media_id, url, position_sophia: Boolean(s.position_sophia || s.position_app) });
    }
    sortie[langue] = { hashtags, slides };
  }

  // Decks d'application : la slide de l'app (et toute autre image fournie) au
  // stockage, le reste repris du deck Sophia de même langue et position. Label
  // hors Sophia : la variante de son application, tirée du deck déposé.
  const sortieApps: DecksApplicationsLivres = appLabel ? decksApplicationDepuisBase(appLabel.slug, envoyees) : {};
  for (const [app, parLangue] of Object.entries(decksApps)) {
    sortieApps[app] = {};
    for (const [langue, deck] of Object.entries(parLangue)) {
      const slides: SlideAppLivree[] = [];
      for (const s of [...deck.slides].sort((a, b) => a.position - b.position)) {
        if (s.reprendre) {
          const ref = sophia.get(langue)?.get(Number(s.position));
          if (!ref?.media_id) throw new Error(`${app} ${langue} #${s.position} : image Sophia à reprendre introuvable`);
          slides.push({ position: Number(s.position), media_id: ref.media_id, url: ref.url, position_sophia: false });
          continue;
        }
        const path = `pods/${slug}/${sourceId}/${app}/${langue}/${s.position}.jpg`;
        const { media_id, url } = await envoyer(path, binaires.get(`${app}/${langue}/${s.position}`)!, langue);
        slides.push({ position: Number(s.position), media_id, url, position_sophia: estSlideApp(s) });
      }
      sortieApps[app][langue] = { hashtags: String(deck.hashtags ?? "").trim(), slides };
    }
  }
  // Images reprises du contenu en ligne : l'URL vient de la médiathèque.
  const sansUrl = Object.values(sortieApps)
    .flatMap((l) => Object.values(l).flatMap((d) => d.slides))
    .filter((s) => !s.url);
  if (sansUrl.length) {
    const { data: medias } = await supabase
      .from("media_library")
      .select("id, url")
      .in("id", [...new Set(sansUrl.map((s) => s.media_id))]);
    const urls = new Map(((medias ?? []) as { id: string; url: string }[]).map((m) => [m.id, m.url]));
    for (const s of sansUrl) s.url = urls.get(s.media_id) ?? null;
  }

  if (complement) {
    const ligneLangues: Record<string, unknown> = {
      pod: slug,
      type: "langues",
      source_id: sourceLangues,
      source_url: body.source_url ? String(body.source_url) : null,
      titre: body.titre ? String(body.titre).slice(0, 160) : null,
      langue_source: langueSource,
      contenu_id: existante!.contenu_id,
      decks: sortie,
      transcription: { textes: Array.isArray(body.textes) ? body.textes.map(String) : [] },
      statut: "a_valider",
      // 0323 : le délai de la validation automatique part du DERNIER dépôt.
      depose_le: new Date().toISOString(),
      auto_erreur: null,
    };
    // Une livraison « langues » encore en attente pour ce post : on y fusionne.
    const enAttente = attente?.statut === "a_valider";
    if (enAttente) ligneLangues.decks = { ...(attente.decks ?? {}), ...sortie };
    if (avecVariantes) {
      ligneLangues.decks_applications = enAttente ? fusionnerDecksApps(attente.decks_applications, sortieApps) : sortieApps;
    } else if (attente && !enAttente && attente.decks_applications) {
      // Livraison « langues » déjà validée, réutilisée : ses anciens decks
      // d'application ne repartent pas en validation avec les nouvelles langues.
      ligneLangues.decks_applications = null;
    }
    const { data: l, error } = await supabase
      .from("pod_livraisons")
      .upsert(ligneLangues, { onConflict: "pod,source_id" })
      .select("id")
      .single();
    if (error || !l) throw new Error(`livraison langues : ${messageErreur(error)}`);
    const appsFinales = "decks_applications" in ligneLangues
      ? ligneLangues.decks_applications
      : (enAttente ? attente.decks_applications : null);
    return json({
      ok: true,
      id: l.id,
      type: "langues",
      langues: Object.keys(ligneLangues.decks as Record<string, unknown>),
      applications: resumeDecksApps(appsFinales as DecksApplicationsLivres | null),
    });
  }

  const decksAppsFinal = avecVariantes ? fusionnerDecksApps(existante?.decks_applications, sortieApps) : null;
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
    // Colonne écrite seulement quand le dépôt en porte (0276 peut manquer).
    ...(decksAppsFinal ? { decks_applications: decksAppsFinal } : {}),
    transcription: { textes: Array.isArray(body.textes) ? body.textes.map(String) : [] },
    statut: "a_valider",
    depose_le: new Date().toISOString(),
    auto_erreur: null,
  };
  const { data: livraison, error } = await supabase
    .from("pod_livraisons")
    .upsert(ligne, { onConflict: "pod,source_id" })
    .select("id")
    .single();
  if (error || !livraison) throw new Error(`livraison : ${messageErreur(error)}`);
  return json({
    ok: true,
    id: livraison.id,
    type: "nouveau",
    langues: Object.keys(ligne.decks),
    applications: resumeDecksApps(decksAppsFinal ?? existante?.decks_applications ?? null),
  });
}

/** Slide Sophia connue, pour contrôler et reprendre dans un deck d'application. */
type RefSlide = { media_id: string | null; url: string | null; position_sophia: boolean };
type RefSlideDeck = { position: number; media_id?: string | null; url?: string | null; position_sophia?: boolean };

/** Fusion par application PUIS par langue : une langue redéposée remplace l'ancienne. */
function fusionnerDecksApps(
  avant: DecksApplicationsLivres | null | undefined,
  nouveau: DecksApplicationsLivres,
): DecksApplicationsLivres {
  const r: DecksApplicationsLivres = { ...(avant ?? {}) };
  for (const [app, parLangue] of Object.entries(nouveau)) r[app] = { ...(r[app] ?? {}), ...parLangue };
  return r;
}

/** `{ unswipe: ["fr"] }` */
function resumeDecksApps(d: DecksApplicationsLivres | null | undefined): Record<string, string[]> {
  return Object.fromEntries(Object.entries(d ?? {}).map(([app, parLangue]) => [app, Object.keys(parLangue ?? {})]));
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
  // Label hors Sophia (pod 6) : la livraison ne sert que son application.
  const appLabel = await applicationHorsSophiaDuPod(supabase, pod.label_id);
  if (appLabel && !Object.keys(l.decks_applications?.[appLabel.slug] ?? {}).length) {
    return json({ ok: false, error: `livraison sans deck ${appLabel.slug} : rien à servir pour ce label` }, 409);
  }

  // Note d'import CLASSIQUE, comme un slideshow importé. Label hors Sophia :
  // pertinence notée par le prompt de SON application, jamais celui de Sophia.
  const textes: string[] = l.transcription?.textes ?? [];
  const clePrompt = appLabel ? `pertinence_${appLabel.slug}` : "pertinence";
  const instructions = await chargerPrompt(supabase, clePrompt);
  if (appLabel && !instructions) return json({ ok: false, error: `prompt ${clePrompt} manquant` }, 409);
  const pertinence = await scoreRelevance({
    caption: textes.join("\n"),
    hookText: textes[0] ?? l.titre ?? "",
    instructions,
  });
  const scoring = await lireScoring(supabase);
  // PAS de `pisteSource` ici, volontairement : une livraison de pod n'a pas de
  // compte de référence dont on aurait la piste. Le terme reste donc inactif et
  // la note garde exactement la forme d'avant la migration 0264.
  //
  // Conséquence assumée : 0265 baisse `elo_seuil_import` de 55 à 54 pour
  // compenser le déplacement de distribution côté import classique. Les pods
  // avec source subissent la baisse sans la compensation, donc passent un
  // point plus facilement. Marginal et dans le sens permissif ; si ça devenait
  // gênant, la correction est de résoudre leur compte de référence, pas de
  // rétablir le seuil (ça casserait l'import classique).
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
      // Hors Sophia : aucun rang Sophia (D / 0, comme un import « hors
      // Sophia ») ; le rang calculé va à l'application du label.
      tier: appLabel ? "D" : tier,
      passages_prevus: appLabel ? 0 : passagesPourTier(tier),
      tier_cycle: 0,
      tier_maj_at: maintenant,
      tier_rapport: {
        origine: original ? "pod_original" : "pod",
        pod: l.pod,
        elo: note,
        seuil: scoring.eloSeuil,
        tier,
        force: Boolean(tierForce),
        passages: passagesPourTier(tier),
        ...(appLabel ? { hors_sophia: true, application: appLabel.slug } : {}),
      },
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
    // Variantes par application fournies par le pod (0276) : decks prêts,
    // réserve et rang de chaque application.
    await ecrireDecksApplications(supabase, contenu.id, l, {
      tierForce,
      pertinenceScore: pertinence.score,
      pod: l.pod,
      tierApp: appLabel ? tier : null,
    });
  } catch (e) {
    // Pas de contenu à moitié créé : il sortirait au tirage sans ses decks.
    await supabase.from("contenus").delete().eq("id", contenu.id);
    throw e;
  }

  const { data: decidee } = await supabase
    .from("pod_livraisons")
    .update({ statut: "validee", contenu_id: contenu.id, note_import: note, tier, decide_par: userId, decide_le: maintenant, motif: null })
    .eq("id", id)
    .eq("statut", "a_valider")
    .select("id");
  if (!decidee?.length) return await defaireApresDecision(supabase, contenu.id);
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
  // son compteur de passages. (Vide : livraison qui n'apporte que des decks
  // d'application.)
  if (lignes.length) {
    const { error } = await supabase.from("contenu_langues").upsert(lignes, { onConflict: "contenu_id,langue" });
    if (error) throw new Error(`langues : ${messageErreur(error)}`);
    const medias = Object.values(decks).flatMap((d) => d.slides.map((s) => s.media_id));
    await supabase.from("media_library").update({ contenu_id: l.contenu_id }).in("id", medias);
  }
  const { data: contenu } = await supabase.from("contenus").select("pertinence_score").eq("id", l.contenu_id).maybeSingle();
  const applications = await ecrireDecksApplications(supabase, l.contenu_id, l, {
    tierForce: null,
    pertinenceScore: contenu?.pertinence_score ?? null,
    pod: l.pod,
  });
  const { data: decidee } = await supabase
    .from("pod_livraisons")
    .update({ statut: "validee", decide_par: userId, decide_le: new Date().toISOString(), motif: null })
    .eq("id", l.id)
    .eq("statut", "a_valider")
    .select("id");
  // Décidée pendant la validation : les langues sont déjà dans le contenu (rien
  // à défaire sans toucher au contenu en ligne), on le dit.
  if (!decidee?.length) return json({ ok: false, error: "livraison décidée pendant la validation (langues déjà ajoutées)" }, 409);
  return json({ ok: true, statut: "validee", contenu_id: l.contenu_id, langues: Object.keys(decks), applications });
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
  // Ce que vaut chaque contenu chez nous, à audience égale (r par passage mûr) :
  // de quoi couper tôt un original qui flop et décliner celui qui marche.
  const chezNous = contenuIds.length ? await statsPassages(supabase, contenuIds as string[]) : new Map();
  return json({
    ok: true,
    pod: { slug: pod.slug, actif: pod.actif },
    comptes_du_label_par_langue: parLangue,
    // deno-lint-ignore no-explicit-any
    livraisons: (livraisons ?? []).map((l: any) => ({ ...l, decks: undefined, langues: Object.keys(l.decks ?? {}) })),
    // deno-lint-ignore no-explicit-any
    perfs: (perfs ?? []).map((p: any) => ({ ...p, chez_nous: chezNous.get(p.contenu_id) ?? null })),
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
  // Un original traduisible porte une slide Sophia : sans objet pour un label
  // qui ne sert pas Sophia (ses originaux se déposent en images finies).
  const appLabel = await applicationHorsSophiaDuPod(supabase, pod.label_id);
  if (appLabel) {
    return json({
      ok: false,
      error: `label hors Sophia (${appLabel.slug}) : dépose l'original en images finies (deposer sans type ni source_url)`,
    }, 400);
  }

  const sourceId = String(body.source_id ?? "");
  if (!/^[a-z0-9][a-z0-9_-]{2,60}$/i.test(sourceId)) return json({ ok: false, error: "source_id requis (a-z0-9_-)" }, 400);
  const slides = (Array.isArray(body.slides) ? body.slides : []) as SlideOriginale[];
  const erreurs = verifierOriginal(slides);
  if (!erreurs.length) erreurs.push(...(await verifierImagesDuLabel(supabase, pod.label_id, slides.map((s) => s.media_id))));
  if (erreurs.length) return json({ ok: false, error: erreurs.join(" · ") }, 400);
  let preuve: Record<string, unknown> | null = null;
  if (PODS_AVEC_PREUVE.has(pod.slug)) {
    const p = await preuveVerifiee(supabase, pod.label_id, body.preuve);
    if ("erreur" in p) return json({ ok: false, error: p.erreur }, 400);
    preuve = p.preuve;
  }

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
      ...(preuve ? { preuve } : {}),
    },
    statut: "a_valider",
    depose_le: new Date().toISOString(),
    auto_erreur: null,
  };
  const { data: l, error } = await supabase
    .from("pod_livraisons")
    .upsert(ligne, { onConflict: "pod,source_id" })
    .select("id")
    .single();
  if (error || !l) throw new Error(`livraison : ${messageErreur(error)}`);
  return json({ ok: true, id: l.id, type: "original", ...(preuve ? { preuve } : {}) });
}

/**
 * Pod 4 : la preuve que le schéma d'accroche fait des vues AUJOURD'HUI. Un post
 * de la niche à 200 k vues ou plus publié dans les 30 derniers jours (vues
 * déclarées par l'agent, lien cliquable dans la file), ou un contenu du label
 * à r ≥ 2 sur au moins 3 passages, recalculé ici. Rend la preuve telle
 * qu'affichée dans la file, mesures de l'OS comprises.
 */
async function preuveVerifiee(
  supabase: Supabase,
  labelId: string,
  brute: unknown,
): Promise<{ erreur: string } | { preuve: Record<string, unknown> }> {
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const { erreurs, tiktokSuffit, contenusOs } = verifierPreuve(brute, aujourdhui);
  if (erreurs.length) return { erreur: erreurs.join(" · ") };
  const p = brute as PreuveOriginal;
  const mesures = new Map<string, { publies: number; r_median: number | null }>();
  if (contenusOs.length) {
    const { data: liens } = await supabase
      .from("contenu_labels")
      .select("contenu_id")
      .eq("label_id", labelId)
      .in("contenu_id", contenusOs)
      .limit(contenusOs.length);
    const duLabel = new Set((liens ?? []).map((l: { contenu_id: string }) => l.contenu_id));
    const horsLabel = contenusOs.filter((id) => !duLabel.has(id));
    if (horsLabel.length) return { erreur: `preuve : contenu(s) hors du label : ${horsLabel.join(", ")}` };
    for (const [id, s] of await statsPassages(supabase, contenusOs)) {
      mesures.set(id, { publies: s.publies, r_median: s.r_median });
    }
  }
  const osSuffit = [...mesures.values()].some((m) => (m.r_median ?? 0) >= PREUVE_R_MIN);
  if (!tiktokSuffit && !osSuffit) {
    return {
      erreur:
        `preuve insuffisante : il faut un post de la niche à ${PREUVE_VUES_MIN} vues ou plus publié dans les ` +
        `${PREUVE_JOURS_MAX} derniers jours, ou un contenu du label à r ≥ ${PREUVE_R_MIN} (3 passages au moins)` +
        (mesures.size
          ? ` ; mesuré : ${[...contenusOs].map((id) => `${id.slice(0, 8)} r ${mesures.get(id)?.r_median ?? "—"}`).join(", ")}`
          : ""),
    };
  }
  return {
    preuve: {
      schema: p.schema.trim(),
      verifiee_le: aujourdhui,
      references: p.references.map((r) =>
        r.type === "os"
          ? {
            type: "os",
            contenu_id: r.contenu_id.toLowerCase(),
            ...(mesures.get(r.contenu_id.toLowerCase()) ?? { publies: 0, r_median: null }),
          }
          : {
            type: "tiktok",
            url: r.url,
            vues: Number(r.vues),
            publie_le: r.publie_le,
            enregistrements: r.enregistrements == null ? null : Number(r.enregistrements),
          }
      ),
    },
  };
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

  const { data: decidee } = await supabase
    .from("pod_livraisons")
    .update({ statut: "validee", contenu_id: contenu.id, tier, decide_par: userId, decide_le: maintenant, motif: null })
    .eq("id", l.id)
    .eq("statut", "a_valider")
    .select("id");
  if (!decidee?.length) return await defaireApresDecision(supabase, contenu.id);

  // UnSwipe, Micabo… : l'original entre aussi dans la réserve des autres
  // applications de son label. Jamais bloquant : le contenu Sophia est validé.
  let applications: Awaited<ReturnType<typeof ouvrirApplicationsOriginal>> = [];
  let applicationsErreur: string | null = null;
  try {
    applications = await ouvrirApplicationsOriginal(
      supabase,
      contenu.id,
      pod.label_id,
      { accroche: deck[0]?.texte_overlay ?? "", legende: legende || deck[0]?.texte_overlay || "", pod: l.pod },
      scoreRelevance,
    );
  } catch (e) {
    applicationsErreur = messageErreur(e);
  }
  return json({
    ok: true,
    statut: "validee",
    contenu_id: contenu.id,
    tier,
    applications,
    ...(applicationsErreur ? { applications_erreur: applicationsErreur } : {}),
  });
}

/**
 * La livraison a été décidée (rejetée à la main, par exemple) pendant que la
 * validation créait son contenu : on défait le contenu, comme sur une erreur.
 */
async function defaireApresDecision(supabase: Supabase, contenuId: string) {
  await supabase.from("contenus").delete().eq("id", contenuId);
  return json({ ok: false, error: "livraison décidée pendant la validation : contenu défait" }, 409);
}

/** Budget d'un passage de la validation automatique (la fonction est coupée vers 150 s). */
const BUDGET_AUTO_MS = 90_000;

/**
 * Validation automatique des podz sûrs (cron horaire, 0323). Une livraison à
 * la fois, par le même chemin que « Tout valider en B ». Ce qui dépasse le
 * budget attend le passage suivant ; un échec est noté (`auto_erreur`) et
 * n'est plus retenté.
 */
async function autoValider(supabase: Supabase) {
  const debut = Date.now();
  const { data: pods, error } = await supabase
    .from("pods")
    .select("slug, actif, auto_validation, auto_validation_heures")
    .eq("auto_validation", true);
  if (error) throw new Error(`pods : ${messageErreur(error)}`);
  if (!pods?.length) return json({ ok: true, validees: [], erreurs: [], reportees: 0 });
  const { data: attente, error: aErr } = await supabase
    .from("pod_livraisons")
    .select("id, pod, type, statut, titre, depose_le, auto_erreur")
    .in("pod", pods.map((p: { slug: string }) => p.slug))
    .eq("statut", "a_valider")
    .is("auto_erreur", null)
    .order("depose_le")
    .limit(100);
  if (aErr) throw new Error(`livraisons : ${messageErreur(aErr)}`);

  const validees: { id: string; pod: string; titre: string | null }[] = [];
  const erreurs: { id: string; pod: string; erreur: string }[] = [];
  let reportees = 0;
  const enAttente = (attente ?? []) as (LivraisonEnAttente & { titre: string | null })[];
  for (const l of livraisonsAutoValidables(pods, enAttente, new Date())) {
    if (Date.now() - debut > BUDGET_AUTO_MS) {
      reportees++;
      continue;
    }
    let erreur: string | null = null;
    try {
      const reponse = await valider(supabase, l.id, null, "B");
      const corps = await reponse.json();
      if (corps?.ok && corps.statut === "validee") {
        await supabase.from("pod_livraisons").update({ decide_auto: true }).eq("id", l.id);
        validees.push({ id: l.id, pod: l.pod, titre: l.titre ?? null });
        continue;
      }
      erreur = String(corps?.error ?? `statut ${corps?.statut ?? reponse.status}`);
    } catch (e) {
      erreur = messageErreur(e);
    }
    // Décidée entre-temps par une personne : rien à noter.
    await supabase.from("pod_livraisons").update({ auto_erreur: erreur.slice(0, 500) }).eq("id", l.id).eq("statut", "a_valider");
    erreurs.push({ id: l.id, pod: l.pod, erreur });
  }
  return json({ ok: true, validees, erreurs, reportees });
}

/**
 * Rattrapage, rejouable : ouvre aux autres applications de leur label les
 * originaux validés avant que la validation le fasse. Un score déjà mesuré est
 * repris sans appel ; ce qui dépasse le budget attend l'appel suivant.
 */
async function ouvrirApplicationsOriginaux(supabase: Supabase) {
  const debut = Date.now();
  const { data: pods, error } = await supabase.from("pods").select("slug, label_id");
  if (error) throw new Error(`pods : ${messageErreur(error)}`);
  const labelDuPod = new Map(((pods ?? []) as { slug: string; label_id: string | null }[]).map((p) => [p.slug, p.label_id]));
  const { data: originaux, error: oErr } = await supabase
    .from("pod_livraisons")
    .select("id, pod, contenu_id, titre, langue_source, decks, transcription")
    .eq("type", "original")
    .eq("statut", "validee")
    .not("contenu_id", "is", null)
    .order("decide_le")
    .limit(500);
  if (oErr) throw new Error(`originaux : ${messageErreur(oErr)}`);

  const resultats: { contenu_id: string; pod: string; applications?: unknown; erreur?: string }[] = [];
  let restants = 0;
  for (const l of originaux ?? []) {
    const labelId = labelDuPod.get(l.pod);
    if (!labelId) continue;
    if (Date.now() - debut > BUDGET_AUTO_MS) {
      restants++;
      continue;
    }
    const deck = (l.decks?.[l.langue_source]?.slides ?? []) as SlideOriginale[];
    const accroche = [...deck].sort((a, b) => a.position - b.position)[0]?.texte_overlay ?? "";
    const legende = String(l.transcription?.legende ?? l.titre ?? "").trim() || accroche;
    try {
      const applications = await ouvrirApplicationsOriginal(supabase, l.contenu_id, labelId, { accroche, legende, pod: l.pod }, scoreRelevance);
      if (applications.length) resultats.push({ contenu_id: l.contenu_id, pod: l.pod, applications });
    } catch (e) {
      resultats.push({ contenu_id: l.contenu_id, pod: l.pod, erreur: messageErreur(e) });
    }
  }
  return json({ ok: true, ouverts: resultats.length, restants, resultats });
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

/**
 * Photos propres de toute la banque de l'OS dont la description contient
 * chaque mot cherché (les descriptions sont en anglais), les moins utilisées
 * d'abord. Jamais une personne entière (une main ou des pieds au plus), ni
 * texte, ni collage : c'est la description qui les écarte, les drapeaux de
 * visage n'étant remplis que pour l'UGC. Pour un pod dont le label n'a pas
 * encore de banque (pod 10) : fonds et photos de ses remakes. Lecture seule.
 */
async function photosDeLaBanque(request: Request, supabase: Supabase, body: Record<string, unknown>) {
  const pod = await podDuJeton(request, supabase, String(body.pod ?? ""));
  if (!pod) return json({ ok: false, error: "unauthorized" }, 401);
  const mots = motsCherches(String(body.cherche ?? ""));
  if (!mots.length) return json({ ok: false, error: "cherche : au moins un mot de 3 lettres (en anglais)" }, 400);
  const limite = Math.min(Math.max(Number(body.limite) || 48, 1), 120);
  let q = supabase
    .from("media_library")
    .select("id, url, caption, used_count")
    .like("storage_path", "propre/%")
    .not("caption", "imatch", LEGENDE_A_ECARTER)
    .not("visage_identifiable", "is", true)
    .not("visage_premier_plan", "is", true)
    .not("texte_restant", "is", true);
  for (const m of mots) q = q.ilike("caption", `%${m}%`);
  const { data, error } = await q.order("used_count", { ascending: true }).order("id").limit(limite);
  if (error) return json({ ok: false, error: messageErreur(error) }, 500);
  return json({ ok: true, photos: data ?? [] });
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
  const sortie = new Map<
    string,
    {
      publies: number;
      vues_mediane: number;
      vues_moyenne: number;
      vues_max: number;
      r_median: number | null;
      r_passages: number[];
      vues_passages: number[];
    }
  >();
  for (const [id, e] of parContenu) {
    sortie.set(id, {
      publies: e.vues.length,
      vues_mediane: Math.round(mediane(e.vues)),
      vues_moyenne: Math.round(e.vues.reduce((a, b) => a + b, 0) / e.vues.length),
      vues_max: Math.max(...e.vues),
      // Sous 3 passages, le r n'est pas significatif.
      r_median: e.r.length >= 3 ? Math.round(mediane(e.r) * 100) / 100 : null,
      // Chaque passage, pour juger un contenu dès ses premiers passages.
      r_passages: e.r.map((r) => Math.round(r * 100) / 100),
      vues_passages: e.vues,
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
  if (!CHEMIN_POD.test(relatif)) return json({ ok: false, error: "chemin : personas/<compte>.jpg|png, reactions/<source>/<compte>.mp4, sources/<source>/reaction.mp4 ou sources/<source>/<compte>.jpg|png" }, 400);
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
    .select("id, langue, persona_nom, handle_tiktok, handle_instagram, videos_uniquement, warmup_ends_at, is_active")
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
    .select("id, compte_id");
  if (error) throw error;
  if (!data?.length) return json({ ok: false, error: "persona introuvable ou déjà décidé" }, 409);
  // Persona validé : le compte passe en vidéos uniquement (plus de slideshows).
  if (valide) {
    const { error: e } = await supabase.from("comptes").update({ videos_uniquement: true }).eq("id", data[0].compte_id);
    if (e) throw new Error(`compte : ${messageErreur(e)}`);
  }
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
    supabase.from("comptes").select("id, langue, persona_nom, videos_uniquement, warmup_ends_at").in("id", ids).limit(ids.length),
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
  // Une vidéo ne part que vers un compte UGC vidéo dont le warmup est fini :
  // un compte slideshow ou encore en warmup ne reçoit jamais de vidéo du pod.
  const maintenant = Date.now();
  const nonPrets = (comptes ?? [])
    .filter((c: { videos_uniquement: boolean; warmup_ends_at: string | null }) =>
      !c.videos_uniquement || !c.warmup_ends_at || new Date(c.warmup_ends_at).getTime() > maintenant
    )
    .map((c: { id: string }) => c.id);
  if (nonPrets.length) {
    return json({ ok: false, error: `compte pas en vidéos uniquement ou warmup pas fini : ${nonPrets.join(", ")}` }, 409);
  }

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
    depose_le: new Date().toISOString(),
    auto_erreur: null,
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
    source_url: l.source_url,
  }));
  const { error } = await supabase.from("pod_videos").insert(lignes);
  if (error) throw new Error(`vidéos : ${messageErreur(error)}`);
  await supabase
    .from("pod_livraisons")
    .update({ statut: "validee", decide_par: userId, decide_le: new Date().toISOString(), motif: null })
    .eq("id", l.id);
  return json({ ok: true, statut: "validee", videos: lignes.length });
}
