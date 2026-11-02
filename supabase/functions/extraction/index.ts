import {
  downloadImage,
  listerDiaporamas,
  scrapePost,
  scrapeProfile,
  type ScrapedPost,
} from "../_shared/apify.ts";
import { scoreRelevance } from "../_shared/gemini.ts";
import { couperTexte, texteBienFormeOuNull } from "../_shared/texte_sur.ts";
import {
  assertAuthorised,
  chargerPrompt,
  json,
  messageErreur,
  serviceClient,
} from "../_shared/supabase.ts";

type Supabase = ReturnType<typeof serviceClient>;

// En dessous, le thème ne permet pas d'intégrer Sophia naturellement : on ne
// reprend pas le post (même s'il fait des vues).
const SEUIL_PERTINENCE = 50;

const BUCKET = "medias";
// On récupère largement de posts récents pour pouvoir garder les MEILLEURS (par
// vues) ET remplir le stock (objectif ≥ 10 slideshows reproductibles par source).
// Beaucoup sont écartés (vidéos, pertinence < seuil), d'où la marge.
const POSTS_PAR_COMPTE = 30;
// Profondeur MAX qu'on demande à Apify pour une source (plus on a déjà de posts,
// plus on descend loin dans le profil pour trouver de l'INÉDIT). Borne le coût.
const MAX_PROFONDEUR = 100;

/** Identifiant numérique stable d'un post, quelle que soit la forme de l'URL. */
const idDe = (url: string) => url.match(/\/(?:photo|video)\/(\d+)/)?.[1] ?? url;
/**
 * Nombre de sujets créés par passage. Le scrape lui-même est léger, mais
 * rapatrier les visuels ne l'est pas : sept images par post, et le worker
 * s'épuise avant la fin. Cinq tient dans une invocation (≈40 téléchargements)
 * et suffit à alimenter une source par nuit ; la dédup sur source_url évite
 * de repasser sur ce qui est déjà pris.
 */
const SUJETS_PAR_PASSAGE = 5;

/**
 * On ne re-scrape pas une source déjà vue dans les dernières 8 h : ça permet de
 * la réalimenter PLUSIEURS fois par nuit (le scrape descend plus profond à chaque
 * fois — cf. profondeur progressive — et ne rapporte que de l'inédit), pour ne
 * jamais rester à sec. Le garde-fou évite quand même la boucle serrée sur une
 * source épuisée.
 */
const RESCRAPE_APRES_H = 8;

/**
 * Extraction : récupère les posts passés d'un compte de référence (propriété de
 * l'entreprise) et en fait des `sujets` bruts, visuels stockés chez nous.
 *
 * Volontairement légère : elle ne fait que scraper et télécharger. L'OCR, la
 * notation et le nettoyage des images sont l'affaire de `preparation`, qui
 * travaille par petits lots — une Edge Function ne survit pas à trente appels
 * Gemini d'affilée.
 *
 *   {}                          → tous les comptes de référence actifs
 *   { compteReferenceId }       → ce seul compte (essai admin)
 *   { postUrl, compteReferenceId? } → un seul post (test ciblé)
 */
Deno.serve(async (request) => {
  const denied = await assertAuthorised(request);
  if (denied) return denied;

  const supabase = serviceClient();

  let compteReferenceId: string | null = null;
  let postUrl: string | null = null;
  let testScrape: string | null = null;
  let reproductible = false;
  try {
    const body = await request.json();
    compteReferenceId = body?.compteReferenceId ?? null;
    postUrl = body?.postUrl ?? null;
    testScrape = body?.testScrape ?? null;
    // Import manuel dans le STOCK : l'admin colle un lien à garder en réserve.
    reproductible = Boolean(body?.reproductible);
  } catch {
    // Corps vide : extraction complète.
  }

  try {
    // TEST DU SCRAPE : on scrape le profil et on RENVOIE les posts avec leurs
    // vues, SANS rien créer — pour vérifier que le moteur repère bien les TikToks
    // qui performent. Trié par vues décroissantes (l'ordre de sélection réel).
    if (testScrape) {
      const { data: ref } = await supabase
        .from("comptes_reference")
        .select("handle_tiktok")
        .eq("id", testScrape)
        .single();
      if (!ref) return json({ error: "Compte de référence introuvable" }, 404);

      const posts = await scrapeProfile(ref.handle_tiktok, POSTS_PAR_COMPTE);
      const { data: connus } = await supabase.from("sujets").select("source_url");
      const dejaVus = new Set((connus ?? []).map((s) => idDe(s.source_url ?? "")));
      const instructions = await chargerPrompt(supabase, "pertinence");

      // On note aussi la PERTINENCE THÉMATIQUE (peut-on y intégrer Sophia ?), pas
      // seulement les vues — c'est le double critère de sélection.
      const noterTheme = async (p: ScrapedPost) => {
        if (p.imageUrls.length === 0) return { score: 0, reason: "Vidéo, pas un diaporama" };
        try {
          return await scoreRelevance({ caption: p.text, hookText: p.text, instructions });
        } catch {
          // Un aléa Gemini ne doit pas faire échouer tout le test.
          return { score: -1, reason: "Score indisponible (réessaie)" };
        }
      };

      const liste = await Promise.all(
        posts.map(async (p) => {
          const pert = await noterTheme(p);
          return {
            url: p.webVideoUrl,
            texte: couperTexte(p.text, 80),
            photos: p.imageUrls.length,
            vues: p.stats.vues,
            likes: p.stats.likes,
            estPhoto: p.imageUrls.length > 0,
            dejaVu: dejaVus.has(idDe(p.webVideoUrl)),
            pertinence: pert.score,
            raison: pert.reason,
            sophia: pert.score >= SEUIL_PERTINENCE,
          };
        }),
      );
      liste.sort((a, b) => b.vues - a.vues);

      return json({ ok: true, handle: ref.handle_tiktok, posts: liste });
    }

    if (postUrl) {
      const [post] = await scrapePost(postUrl);
      if (!post) return json({ ok: false, error: "Aucun post photo à cette URL" }, 400);

      const r = await creerSujet(supabase, post, compteReferenceId);

      // Import manuel « à garder en stock » : l'humain vouche pour ce lien, donc
      // on le marque RETENU tout de suite et on renseigne un score (la préparation
      // saute alors la porte de pertinence et passe direct au nettoyage). Une fois
      // nettoyé, il apparaît dans les posts reproduisibles de cette source.
      if (reproductible) {
        await supabase
          .from("sujets")
          .update({
            statut: "retenu",
            pertinence_score: SEUIL_PERTINENCE,
            pertinence_raison: "Ajouté manuellement au stock",
          })
          .eq("id", r.id);
      }

      return json({ ok: true, sujetId: r.id, reused: r.reused });
    }

    // Une source par passage. Scraper les huit d'un coup faisait plusieurs
    // centaines de téléchargements dans la même invocation et épuisait le
    // worker ; le cron repasse chaque minute et prend la suivante.
    //
    // La moins récemment scrapée d'abord, `nulls first` pour que celles jamais
    // vues soient servies avant les autres.
    let query = supabase
      .from("comptes_reference")
      .select("id, handle_tiktok")
      .eq("is_active", true)
      .order("dernier_scrape_at", { ascending: true, nullsFirst: true })
      .limit(1);
    // Une source déjà scrapée dans les 20 dernières heures est ignorée : on
    // n'en fait qu'UNE par nuit, et le cron sert les autres aux passages
    // suivants. Un appel ciblé (compteReferenceId) force le scrape, lui.
    if (compteReferenceId) {
      query = query.eq("id", compteReferenceId);
    } else {
      const seuil = new Date(Date.now() - RESCRAPE_APRES_H * 3600 * 1000).toISOString();
      query = query.or(`dernier_scrape_at.is.null,dernier_scrape_at.lt.${seuil}`);
    }

    const { data: comptes, error } = await query;
    if (error) throw error;

    let sujetsCrees = 0;

    for (const compte of comptes ?? []) {
      const { data: run } = await supabase
        .from("extractions")
        .insert({ compte_reference_id: compte.id })
        .select()
        .single();

      try {
        // Scrape léger : on rapatrie quelques diaporamas (bruts). La NOTATION
        // (pertinence Sophia) et le nettoyage se font ensuite à la préparation —
        // la notation d'abord (rapide, depuis la légende), pour que le stock se
        // remplisse vite, le nettoyage seulement après.
        const posts = await recupererPosts(supabase, compte.handle_tiktok);
        let crees = 0;
        let restants = false;

        for (const post of posts) {
          if (crees >= SUJETS_PAR_PASSAGE) {
            restants = true;
            break;
          }
          if (post.imageUrls.length === 0) continue; // pas un post photo
          if (!(await creerSujet(supabase, post, compte.id)).reused) crees += 1;
        }
        sujetsCrees += crees;

        // La NOTATION (pertinence Sophia) se fait à la préparation, depuis le
        // texte du HOOK (fiable), pas ici depuis la légende (souvent des hashtags
        // → rejets à tort). « Fetch more » enchaîne côté client sur la préparation
        // pour noter tout de suite, sans attendre le cron de nuit.

        await supabase
          .from("extractions")
          .update({
            statut: "done",
            termine_at: new Date().toISOString(),
            posts_recuperes: posts.length,
            medias_stockes: crees,
          })
          .eq("id", run?.id);

        // On date le scrape À CHAQUE passage : la source passe en fin de file et
        // le garde-fou des 20 h l'exclut jusqu'à la nuit suivante. Ainsi on
        // alimente TOUTES les sources tour à tour (5 sujets chacune/nuit) plutôt
        // que d'en vider une seule pendant que les autres crèvent de faim.
        // `restants` (posts non encore rapatriés) est repris la nuit d'après.
        void restants;
        await supabase
          .from("comptes_reference")
          .update({ dernier_scrape_at: new Date().toISOString() })
          .eq("id", compte.id);
      } catch (error) {
        await supabase
          .from("extractions")
          .update({
            statut: "failed",
            termine_at: new Date().toISOString(),
            erreur: messageErreur(error),
          })
          .eq("id", run?.id);
      }
    }

    return json({ ok: true, comptes: comptes?.length ?? 0, sujetsCrees });
  } catch (error) {
    return json({ ok: false, error: messageErreur(error) }, 500);
  }
});

interface PostScrape {
  postId: string;
  webVideoUrl: string;
  text: string;
  imageUrls: string[];
  musicUrl: string | null;
  musicTitle: string | null;
}

/**
 * Récupère les diaporamas d'un compte, avec un repli.
 *
 * L'acteur Apify cale parfois sur un compte précis — 500 à répétition, ou zéro
 * post alors que la page en affiche seize. Dans ce cas on lit la page publique
 * pour lister les diaporamas, puis on les scrape un par un : un post isolé
 * passe là où le compte entier échoue.
 *
 * Le repli ne traite que quelques posts par passage. Chaque post est un run
 * Apify à lui seul, et le worker n'en supporte pas davantage ; le cron repasse
 * chaque minute pour la suite.
 */
async function recupererPosts(
  supabase: Supabase,
  handle: string,
): Promise<PostScrape[]> {
  // Ce qu'on a DÉJÀ de cette source : on ne le reprend pas (dédup par l'id du
  // post). Sert aussi à mesurer la profondeur déjà couverte.
  const { data: connus } = await supabase
    .from("sujets")
    .select("source_url")
    .ilike("source_url", `%/@${handle}/%`);
  const dejaVus = new Set((connus ?? []).map((s) => idDe(s.source_url ?? "")));

  // PROFONDEUR PROGRESSIVE : l'acteur Apify renvoie toujours le HAUT du profil,
  // donc sans ça on re-scrapait les mêmes liens à chaque demande. Plus on a déjà
  // de posts de cette source, plus on demande loin — pour tomber sur de l'inédit.
  const profondeur = Math.min(POSTS_PAR_COMPTE + dejaVus.size, MAX_PROFONDEUR);

  let direct: ScrapedPost[] = [];
  let echec: string | null = null;

  try {
    direct = await scrapeProfile(handle, profondeur);
  } catch (error) {
    echec = messageErreur(error);
  }

  if (direct.length > 0) {
    // On ÉCARTE ce qu'on a déjà (pas de re-traitement), et on garde les plus vus
    // d'abord parmi les INÉDITS.
    return direct
      .filter((p) => !dejaVus.has(idDe(p.webVideoUrl)))
      .sort((a, b) => (b.stats?.vues ?? 0) - (a.stats?.vues ?? 0));
  }

  const urls = await listerDiaporamas(handle);

  const aFaire = urls
    .filter((u) => !dejaVus.has(idDe(u)))
    .slice(0, SUJETS_PAR_PASSAGE);

  if (aFaire.length === 0) {
    if (echec) throw new Error(`${echec} — et la page ne liste aucun diaporama inédit`);
    return [];
  }

  const recuperes: PostScrape[] = [];
  for (const url of aFaire) {
    const [post] = await scrapePost(url);
    if (post) recuperes.push(post);
  }

  return recuperes;
}

/**
 * Crée un sujet à partir d'un post scrapé. Renvoie son id, ou null si le post
 * était déjà connu — `source_url` sert de clé de déduplication entre passages.
 */
async function creerSujet(
  supabase: Supabase,
  post: PostScrape,
  compteReferenceId: string | null,
): Promise<{ id: string; reused: boolean }> {
  // Déjà importé : on renvoie l'id existant (et non null), pour qu'un import
  // manuel puisse composer dessus sans re-scraper.
  const { data: existant } = await supabase
    .from("sujets")
    .select("id")
    .eq("source_url", post.webVideoUrl)
    .maybeSingle();
  if (existant) return { id: existant.id, reused: true };

  // Les visuels d'Apify expirent et exigent un token : on les rapatrie tout de
  // suite dans notre Storage, sinon la bibliothèque pointerait dans le vide.
  const slides = [];
  for (const [index, url] of post.imageUrls.entries()) {
    const position = index + 1;
    slides.push({
      position,
      raw_url: await stockerVisuel(supabase, post.postId, position, url),
      texte_original: null,
      media_id: null,
    });
  }

  const { data: sujet, error } = await supabase
    .from("sujets")
    .insert({
      titre: couperTexte(post.text, 160) || "Sans titre",
      structure_slides: slides,
      compte_reference_id: compteReferenceId,
      source_url: post.webVideoUrl,
      musique_url: post.musicUrl,
      musique_titre: texteBienFormeOuNull(post.musicTitle),
      // Vues du TikTok d'origine : signal de « ça a bien marché » pour la page
      // Posts reproduisibles (tri + affichage).
      vues: post.stats?.vues ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return { id: sujet.id, reused: false };
}

/** Rapatrie un visuel ; en cas d'échec on garde l'URL d'origine plutôt que de
 *  perdre le sujet entier. */
async function stockerVisuel(
  supabase: Supabase,
  postId: string,
  position: number,
  sourceUrl: string,
): Promise<string> {
  try {
    const bytes = await downloadImage(sourceUrl);
    const path = `brut/${postId}/${position}.jpg`;

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: "image/jpeg", upsert: true });
    if (error) throw error;

    return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  } catch {
    return sourceUrl;
  }
}
