import { integrateSophia, translateSlideshow } from "./gemini.ts";
import { chargerPrompt, messageErreur, serviceClient } from "./supabase.ts";

type Supabase = ReturnType<typeof serviceClient>;

/** Nombre d'essais de placement Sophia répartis sur les passages du cron (1/min)
 *  avant de renoncer au VRAI placement. 15 minutes de reprises absorbent large
 *  n'importe quel pic de surcharge Gemini ; le repli par défaut ne sert donc
 *  qu'en cas de panne Gemini durable, quasi jamais. */
const MAX_TENTATIVES_SOPHIA = 15;

/**
 * Texte Sophia de repli, par langue, quand l'intégration intelligente échoue.
 * Volontairement simple et honnête (une accroche + l'appli) : mieux vaut une
 * mention par défaut, présente et modifiable, que pas de Sophia du tout. Repli
 * anglais pour toute langue non prévue.
 */
function sophiaParDefaut(langue: string): string {
  const par: Record<string, string> = {
    fr: "Envie d'en apprendre plus chaque jour ? L'appli Sophia t'apprend une culture générale de dingue en quelques minutes. Teste-la 👀",
    en: "Want to learn something new every day? The Sophia app teaches you wild general knowledge in minutes. Give it a try 👀",
    es: "¿Quieres aprender algo nuevo cada día? La app Sophia te enseña cultura general increíble en minutos. Pruébala 👀",
    de: "Lust, jeden Tag etwas Neues zu lernen? Die Sophia-App bringt dir in wenigen Minuten richtig gutes Allgemeinwissen bei. Probier's aus 👀",
    it: "Vuoi imparare qualcosa di nuovo ogni giorno? L'app Sophia ti insegna una cultura generale pazzesca in pochi minuti. Provala 👀",
    pt: "Queres aprender algo novo todos os dias? A app Sophia ensina-te cultura geral incrível em poucos minutos. Experimenta 👀",
    cs: "Chceš se každý den naučit něco nového? Aplikace Sophia tě naučí skvělé všeobecné znalosti za pár minut. Vyzkoušej ji 👀",
    nl: "Wil je elke dag iets nieuws leren? De Sophia-app leert je in een paar minuten waanzinnige algemene kennis. Probeer het 👀",
    el: "Θέλεις να μαθαίνεις κάτι νέο κάθε μέρα; Η εφαρμογή Sophia σου μαθαίνει απίστευτη γενική γνώση σε λίγα λεπτά. Δοκίμασέ την 👀",
    hu: "Szeretnél minden nap valami újat tanulni? A Sophia app perceken belül vad általános műveltséget ad. Próbáld ki 👀",
    pl: "Chcesz codziennie uczyć się czegoś nowego? Aplikacja Sophia uczy szalonej wiedzy ogólnej w kilka minut. Wypróbuj 👀",
    ro: "Vrei să înveți ceva nou în fiecare zi? Aplicația Sophia te învață cultură generală tare în câteva minute. Încearc-o 👀",
    sv: "Vill du lära dig något nytt varje dag? Sophia-appen lär dig galen allmänbildning på några minuter. Testa den 👀",
    tr: "Her gün yeni bir şey öğrenmek ister misin? Sophia uygulaması dakikalar içinde efsane genel kültür öğretir. Dene 👀",
  };
  return par[langue] ?? par.en;
}

interface Slide {
  position: number;
  raw_url: string;
  texte_original: string | null;
  media_id: string | null;
}

/** Une seule slide par `position` (la dernière gagne). Évite le
 *  `post_slides_post_id_position_key` quand `structure_slides` a des doublons. */
function slidesParPositionUnique(slides: Slide[]): Slide[] {
  const parPos = new Map<number, Slide>();
  for (const s of slides) parPos.set(s.position, s);
  return [...parPos.values()].sort((a, b) => a.position - b.position);
}

export interface DemandeComposition {
  compteId: string;
  sujetId: string;
  type: "recycle" | "remanie" | "nouveau";
  date: string | null;
  /** Post dont celui-ci est une variante (remaniés). */
  sourcePostId?: string | null;
  /** Post de TEST : fabriqué pour prévisualiser, pas assigné au calendrier. */
  estTest?: boolean;
}

/**
 * Crée la coquille du post, sans aucun appel IA. La fabrication elle-même est
 * l'affaire d'`avancerPost`, appelé ensuite par petits pas : traduction et
 * placement dans la même invocation dépassaient les ressources d'une Edge
 * Function.
 */
export async function creerPost(
  supabase: Supabase,
  demande: DemandeComposition,
): Promise<string> {
  const { data: sujet, error: sujetErreur } = await supabase
    .from("sujets")
    .select("id, preparation_statut, musique_url, musique_titre, musique_plateforme")
    .eq("id", demande.sujetId)
    .single();
  if (sujetErreur || !sujet) throw new Error("Sujet introuvable");
  // On crée la coquille même si le sujet n'est pas encore préparé (import
  // manuel récent) : la fabrication (avancerPost) attendra que la préparation
  // soit finie avant de créer les slides. Ça permet d'assigner un TikTok à un
  // créateur immédiatement, sans attendre le nettoyage.

  const { data: post, error } = await supabase
    .from("posts")
    .insert({
      compte_id: demande.compteId,
      sujet_id: sujet.id,
      type: demande.type,
      statut: "brouillon",
      date_publication_prevue: demande.date,
      source_post_id: demande.sourcePostId ?? null,
      est_test: demande.estTest ?? false,
      musique_url: sujet.musique_url,
      musique_titre: sujet.musique_titre,
      musique_plateforme: sujet.musique_plateforme,
      pipeline_statut: "pending",
    })
    .select()
    .single();

  if (error || !post) throw error ?? new Error("Création du post échouée");
  return post.id;
}

/**
 * Fait avancer un post d'une étape et rend la main. Renvoie l'étape effectuée.
 *
 * Traduction puis placement de l'appli Sophia, chacun dans son propre passage :
 * les deux prompts sont volumineux et les enchaîner épuisait le worker.
 */
// deno-lint-ignore no-explicit-any
export async function avancerPost(supabase: Supabase, post: any): Promise<string> {
  let sophiaManquante = false;
  let sophiaRepli = false;
  try {
    const { data: compte } = await supabase
      .from("comptes")
      .select("*")
      .eq("id", post.compte_id)
      .single();
    if (!compte) throw new Error("Compte introuvable");

    const { data: sujet } = await supabase
      .from("sujets")
      .select("*")
      .eq("id", post.sujet_id)
      .single();
    if (!sujet) throw new Error("Sujet introuvable");

    const slides: Slide[] = slidesParPositionUnique(sujet.structure_slides ?? []);
    if (slides.length === 0) throw new Error("Sujet sans visuel");

    const { data: existantes } = await supabase
      .from("post_slides")
      .select("id, position, texte_overlay, position_sophia")
      .eq("post_id", post.id)
      .order("position");

    // Garde préparation : si les slides ne sont pas encore créées ET que le
    // sujet n'est pas encore nettoyé (import manuel récent), on ATTEND. On
    // relaisse le post en attente ; la préparation finit d'abord, puis la
    // fabrication reprend au passage suivant. Évite de créer des slides sans
    // visuel propre.
    if ((!existantes || existantes.length === 0) && sujet.preparation_statut !== "done") {
      await supabase
        .from("posts")
        .update({ pipeline_statut: "pending", pipeline_etape: "attente_preparation" })
        .eq("id", post.id);
      return "attente_preparation";
    }

    // 1 — traduction de tout le deck en une passe : seule façon de tenir la
    // persona et le genre d'une slide à l'autre.
    if (!existantes || existantes.length === 0) {
      await marquer(supabase, post.id, "traduction");

      // Les règles de traduction sont propres à une langue : listes noires de
      // tournures, tutoiement, registre. Appliquer les règles françaises à un
      // compte espagnol produisait du français. On prend donc le prompt dédié à
      // la langue s'il existe, le prompt général pour le français, et sinon les
      // règles neutres du code — à charge de l'admin d'écrire `traduction_es`
      // pour obtenir la même finesse qu'en français.
      const dedie = await chargerPrompt(supabase, `traduction_${compte.langue}`);
      const base = dedie ?? (compte.langue === "fr"
        ? await chargerPrompt(supabase, "traduction")
        : undefined);

      // Consignes propres au type de post : un recopiage doit rester fidèle,
      // un remaniement doit s'éloigner. Éditables depuis l'admin.
      const consignesType = await chargerPrompt(supabase, `composition_${post.type}`);

      // Le « prompt adapté » (voix/ton) est porté par le compte SOURCE : c'est
      // sa niche qui dicte le registre, pas le compte de publication du poster.
      let voixSource: string | null = null;
      if (sujet.compte_reference_id) {
        const { data: ref } = await supabase
          .from("comptes_reference")
          .select("style_profile")
          .eq("id", sujet.compte_reference_id)
          .single();
        voixSource = ref?.style_profile ?? null;
      }

      const regles = [
        base,
        consignesType,
        voixSource ? `Voix propre à cette source :\n${voixSource}` : null,
      ]
        .filter(Boolean)
        .join("\n\n");

      const traductions = await translateSlideshow({
        slides: slides.map((s) => ({ position: s.position, original: s.texte_original ?? "" })),
        sourceTitle: sujet.titre ?? "",
        rules: regles || undefined,
        langue: compte.langue,
        variation: post.type === "remanie",
      });
      const parPosition = new Map(traductions.map((t) => [t.position, t.translated]));

      // RECYCLÉ (défaut) : on reproduit FIDÈLEMENT le TikTok de référence — ses
      // images NETTOYÉES (le media_id du sujet pointe vers la version propre) et
      // son texte traduit. On ne substitue JAMAIS des images de la bibliothèque.
      // Seul le REMANIÉ (texte d'une autre source) prend d'autres visuels, par
      // définition (les images de l'autre source trahiraient le réseau).
      const visuels = post.type === "remanie"
        ? await visuelsAlternatifs(supabase, compte, slides)
        : new Map(slides.map((s) => [s.position, s.media_id]));

      // RÉPARE les images périmées : un media_id du sujet peut pointer vers une
      // image supprimée de la bibliothèque (violation de clé étrangère → l'insert
      // échouait et le post bloquait la file). On valide chaque image, et on
      // remplace les périmées par une image propre encore présente (sinon null).
      await reparerVisuelsPerimes(supabase, compte, slides, visuels);

      const rows = slides.map((s) => ({
        post_id: post.id,
        position: s.position,
        media_id: visuels.get(s.position) ?? null,
        texte_overlay: parPosition.get(s.position) ?? "",
        position_sophia: false,
        // Le visuel d'origine, texte encore incrusté : c'est le modèle de
        // placement que le poster recopie dans TikTok.
        reference_url: s.raw_url ?? null,
      }));

      // Upsert sur (post_id, position) : idempotent si deux workers traduisent
      // en parallèle, ou si un retry retombe sur des slides déjà créées.
      // (l'ancien `.insert` levait `post_slides_post_id_position_key`).
      const { data: creees, error: errUpsert } = await supabase
        .from("post_slides")
        .upsert(rows, { onConflict: "post_id,position" })
        .select("media_id");

      if (errUpsert) {
        // Filet : contrainte unique encore vue (course rare). Si les slides
        // sont là, on continue ; sinon on remonte l'erreur.
        const concurrent = errUpsert.code === "23505" ||
          /post_slides_post_id_position_key|duplicate key/i.test(errUpsert.message);
        if (concurrent) {
          const { data: deja } = await supabase
            .from("post_slides")
            .select("media_id")
            .eq("post_id", post.id);
          if (deja && deja.length > 0) {
            await marquerVisuelsUtilises(supabase, compte.id, post.id, deja);
            return "traduction";
          }
        }
        throw new Error(`Insertion des slides échouée : ${errUpsert.message}`);
      }

      await marquerVisuelsUtilises(supabase, compte.id, post.id, creees ?? []);

      return "traduction";
    }

    // 1.5 — GARANTIE VISUELS PROPRES : si une slide porte encore une image non
    // nettoyée (le nettoyage a lâché), on la remplace par une photo DÉJÀ propre
    // de la bibliothèque du compte, plutôt que de livrer au poster une image à
    // texte. Aucune alternative propre → on garde le brut, qui reste signalé.
    await garantirVisuelsPropres(supabase, compte, post.id);

    // 2 — placement de l'appli Sophia sur l'une des slides.
    if (!existantes.some((s) => s.position_sophia)) {
      await marquer(supabase, post.id, "placement_sophia");

      const { data: corrections } = await supabase
        .from("corrections")
        .select("texte_origine, texte_corrige")
        .order("created_at", { ascending: false })
        .limit(40);

      const placement = await integrateSophia({
        masterPrompt: (await chargerPrompt(supabase, "placement_sophia")) ?? "",
        corrections: (corrections ?? []).map((c) => ({
          original_text: c.texte_origine,
          corrected_text: c.texte_corrige,
        })),
        slides: existantes.map((s) => ({
          position: s.position,
          text: s.texte_overlay ?? "",
        })),
        caption: sujet.titre ?? "",
        langue: compte.langue,
      });

      const cible = placement
        ? existantes.find((s) => s.position === placement.chosenPosition)
        : undefined;

      if (placement && cible) {
        await supabase
          .from("post_slides")
          .update({
            texte_overlay: placement.variants[placement.bestIndex],
            position_sophia: true,
          })
          .eq("id", cible.id);
      } else {
        // L'intégration a échoué (Gemini surchargé, réponse illisible). On
        // n'ABANDONNE PAS : on relaisse le post en attente pour RE-TENTER le VRAI
        // placement au passage suivant du cron (chaque minute), le temps que
        // Gemini se dégage. C'est ça qui fait que Sophia finit toujours par être
        // intégrée pour de vrai, sans texte bidon.
        const tentatives = (post.pipeline_tentatives ?? 0) + 1;
        if (tentatives < MAX_TENTATIVES_SOPHIA) {
          await supabase
            .from("posts")
            .update({
              pipeline_tentatives: tentatives,
              pipeline_statut: "pending",
              pipeline_etape: "placement_sophia",
              pipeline_erreur: null,
            })
            .eq("id", post.id);
          return "placement_sophia";
        }
        // Dernier recours après de NOMBREUX essais réels (Gemini durablement HS) :
        // plutôt qu'un post promo sans aucune mention, on pose un texte Sophia par
        // défaut sur la dernière slide, signalé pour personnalisation.
        const derniere = existantes[existantes.length - 1];
        if (derniere) {
          await supabase
            .from("post_slides")
            .update({ texte_overlay: sophiaParDefaut(compte.langue), position_sophia: true })
            .eq("id", derniere.id);
          sophiaRepli = true;
        } else {
          sophiaManquante = true;
        }
      }
    }

    // 3 — RENUMÉROTATION déterministe. On ne fait PAS confiance à l'IA pour les
    // numéros : les slides qui commencent par un numéro deviennent 1, 2, 3… dans
    // l'ordre de position. Corrige les décalages (ex. le placement Sophia qui
    // reprenait « 2. » à la place de « 1. »). La slide d'accroche (sans numéro)
    // n'est pas touchée.
    await renumeroterSlides(supabase, post.id);

    await supabase
      .from("posts")
      .update({
        pipeline_statut: "done",
        pipeline_etape: null,
        pipeline_erreur: sophiaManquante
          ? "Placement Sophia à faire à la main"
          : sophiaRepli
            ? "Sophia placée en repli (texte par défaut, à personnaliser)"
            : null,
        statut: "assigne",
        // Description = hashtags dans la langue du compte (à copier dans TikTok).
        hashtags: post.hashtags ?? hashtagsPour(compte.langue, post.id),
      })
      .eq("id", post.id);

    // Le sujet est consommé : il ne sera plus proposé comme sujet inédit.
    await supabase.from("sujets").update({ statut: "utilise" }).eq("id", post.sujet_id);

    return "done";
  } catch (error) {
    await supabase
      .from("posts")
      .update({
        pipeline_statut: "failed",
        pipeline_erreur: messageErreur(error),
      })
      .eq("id", post.id);
    return "failed";
  }
}

/**
 * Remplace toute slide encore illustrée d'une image NON nettoyée (chemin
 * `brut/…`) par une photo DÉJÀ propre de la bibliothèque du compte de référence
 * (la moins utilisée, pas déjà sur ce post). On coupe aussi `reference_url` :
 * l'image de remplacement n'a pas de texte à placer, le guide d'origine n'a plus
 * lieu d'être. Sans alternative propre disponible, on laisse le brut (il reste
 * signalé « texte non retiré » côté poster et admin).
 */
// deno-lint-ignore no-explicit-any
async function garantirVisuelsPropres(supabase: Supabase, compte: any, postId: string) {
  const { data: slides } = await supabase
    .from("post_slides")
    .select("id, media_id")
    .eq("post_id", postId);
  if (!slides || slides.length === 0) return;

  const ids = slides.map((s) => s.media_id).filter(Boolean);
  const { data: medias } = await supabase
    .from("media_library")
    .select("id, storage_path, texte_restant")
    .in("id", ids);
  const chemin = new Map((medias ?? []).map((m) => [m.id, m.storage_path as string]));
  const sales = new Set(
    (medias ?? []).filter((m) => m.texte_restant).map((m) => m.id as string),
  );

  // À remplacer : image hors `propre/` OU signalée par l'audit (texte encore
  // présent malgré son rangement en propre).
  const aRemplacer = slides.filter(
    (s) => !chemin.get(s.media_id)?.startsWith("propre/") || sales.has(s.media_id),
  );
  if (aRemplacer.length === 0) return;

  const dejaSurPost = new Set(slides.map((s) => s.media_id).filter(Boolean));
  let query = supabase
    .from("media_library")
    .select("id")
    .like("storage_path", "propre/%")
    .eq("texte_restant", false)
    .order("used_count", { ascending: true })
    .limit(60);
  if (compte.compte_reference_id) query = query.eq("compte_reference_id", compte.compte_reference_id);

  const { data: propres } = await query;
  const dispo = (propres ?? []).map((m) => m.id).filter((id) => !dejaSurPost.has(id));

  for (const slide of aRemplacer) {
    const remplacant = dispo.shift();
    if (!remplacant) break; // plus d'alternative propre : on garde le brut signalé
    await supabase
      .from("post_slides")
      .update({ media_id: remplacant, reference_url: null })
      .eq("id", slide.id);
  }
}

/**
 * Force une numérotation propre : les slides dont le texte commence par un
 * numéro (« 2. », « 3) »…) sont renumérotées 1, 2, 3… dans l'ordre de position.
 * On ne remplace QUE le chiffre, en gardant le séparateur et le reste du texte
 * intacts. Les slides sans numéro (accroche) sont ignorées. Déterministe : ça
 * corrige tout décalage laissé par la traduction ou le placement Sophia.
 */
// Réserve de hashtags par langue (culture générale / self-improvement / booktok /
// pour toi). Chaque post en tire ~7, variés d'un post à l'autre — aucun appel IA.
const HASHTAGS: Record<string, string[]> = {
  fr: ["#apprendre", "#culturegenerale", "#developpementpersonnel", "#booktok", "#pourtoi", "#savoir", "#apprendresurtiktok", "#culture", "#motivation", "#connaissances", "#fyp", "#anecdotes"],
  en: ["#learning", "#selfimprovement", "#booktok", "#foryou", "#knowledge", "#learnontiktok", "#growthmindset", "#facts", "#motivation", "#studytok", "#fyp", "#smart"],
  de: ["#lernen", "#selbstverbesserung", "#booktok", "#fürdich", "#wissen", "#bildung", "#persönlichkeitsentwicklung", "#motivation", "#fakten", "#allgemeinwissen", "#fyp", "#lernenmittiktok"],
  it: ["#imparare", "#crescitapersonale", "#booktok", "#perte", "#cultura", "#conoscenza", "#sapere", "#motivazione", "#curiosità", "#studytok", "#fyp", "#impararesutiktok"],
  es: ["#aprender", "#desarrollopersonal", "#booktok", "#parati", "#cultura", "#conocimiento", "#superacionpersonal", "#motivacion", "#datoscuriosos", "#aprendeentiktok", "#fyp", "#sabiduria"],
  pt: ["#aprender", "#desenvolvimentopessoal", "#booktok", "#paravoce", "#cultura", "#conhecimento", "#crescimento", "#motivacao", "#curiosidades", "#aprendanotiktok", "#fyp", "#sabedoria"],
};

/** MAX 3 hashtags de la langue du compte, variés par post (offset déterministe
 *  tiré de l'id du post) — pas deux posts avec exactement la même description. */
function hashtagsPour(langue: string, postId: string): string {
  const pool = HASHTAGS[langue] ?? HASHTAGS.fr;
  let h = 0;
  for (const c of postId) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const debut = h % pool.length;
  const choix: string[] = [];
  for (let i = 0; i < 3 && i < pool.length; i += 1) choix.push(pool[(debut + i) % pool.length]);
  return choix.join(" ");
}

async function renumeroterSlides(supabase: Supabase, postId: string) {
  const { data: slides } = await supabase
    .from("post_slides")
    .select("id, texte_overlay, position_sophia")
    .eq("post_id", postId)
    .order("position");
  if (!slides || slides.length === 0) return;

  const detecteNumero = /^\s*\d+\s*[.)]/;
  const remplaceNumero = /^(\s*)\d+(\s*[.)])\s?/;
  const aNumero = (t: string) => detecteNumero.test(t);

  // Convention du diaporama, lue sur les slides de CONTENU (on écarte la 1re =
  // accroche, et la slide Sophia). Si la plupart portent un numéro, le diaporama
  // est numéroté ; sinon il ne l'est pas.
  const contenu = slides.filter((s, i) => i !== 0 && !s.position_sophia);
  const numerotes = contenu.filter((s) => aNumero(s.texte_overlay ?? "")).length;
  const conventionNumerotee = numerotes > 0 && numerotes >= contenu.length - numerotes;

  if (!conventionNumerotee) {
    // Diaporama non numéroté : on RETIRE tout numéro en tête (y compris celui que
    // l'IA aurait collé sur la slide Sophia) — sinon une seule slide numérotée
    // dépareille au milieu de slides qui n'en ont pas.
    for (const s of slides) {
      const texte = s.texte_overlay ?? "";
      const nouveau = texte.replace(remplaceNumero, "$1");
      if (nouveau !== texte) {
        await supabase.from("post_slides").update({ texte_overlay: nouveau }).eq("id", s.id);
      }
    }
    return;
  }

  // Diaporama numéroté : 1, 2, 3… dans l'ordre, sur chaque slide numérotée.
  let n = 0;
  for (const s of slides) {
    const texte = s.texte_overlay ?? "";
    if (!aNumero(texte)) continue; // pas de numéro (accroche) = intacte
    n += 1;
    const nouveau = texte.replace(/^(\s*)\d+(\s*[.)])/, `$1${n}$2`);
    if (nouveau !== texte) {
      await supabase.from("post_slides").update({ texte_overlay: nouveau }).eq("id", s.id);
    }
  }
}

/**
 * Cherche, pour chaque slide, un visuel que ce compte n'a pas encore publié.
 * Sans remplaçant disponible on garde l'original : mieux vaut un doublon visuel
 * qu'un post sans image.
 */
// deno-lint-ignore no-explicit-any
/**
 * Remplace, DANS la map de visuels, tout media_id qui n'existe plus dans la
 * bibliothèque (image supprimée → clé étrangère invalide). Sans ça, l'insert des
 * slides échouait et le post bloquait toute la file. On substitue une image propre
 * encore présente (la moins utilisée de la source du compte), sinon `null`.
 */
// deno-lint-ignore no-explicit-any
async function reparerVisuelsPerimes(
  supabase: Supabase,
  compte: any,
  slides: Slide[],
  visuels: Map<number, string | null>,
): Promise<void> {
  const voulus = [
    ...new Set(slides.map((s) => visuels.get(s.position)).filter((v): v is string => Boolean(v))),
  ];
  if (voulus.length === 0) return;

  const { data: presents } = await supabase
    .from("media_library")
    .select("id")
    .in("id", voulus);
  const ok = new Set((presents ?? []).map((m) => m.id as string));

  const perimes = slides.filter((s) => {
    const v = visuels.get(s.position);
    return v && !ok.has(v);
  });
  if (perimes.length === 0) return;

  let poolQ = supabase
    .from("media_library")
    .select("id")
    .eq("texte_restant", false)
    .order("used_count")
    .limit(200);
  if (compte.compte_reference_id) {
    poolQ = poolQ.eq("compte_reference_id", compte.compte_reference_id);
  }
  const { data: pool } = await poolQ;
  const dejaChoisies = new Set([...visuels.values()].filter(Boolean) as string[]);
  const libres = (pool ?? []).map((m) => m.id as string).filter((id) => !dejaChoisies.has(id));

  for (const s of perimes) {
    visuels.set(s.position, libres.shift() ?? null);
  }
}

// deno-lint-ignore no-explicit-any
async function visuelsAlternatifs(
  supabase: Supabase,
  compte: any,
  slides: Slide[],
): Promise<Map<number, string | null>> {
  const { data: dejaVus } = await supabase
    .from("media_usages")
    .select("media_id")
    .eq("compte_id", compte.id);
  const utilises = new Set((dejaVus ?? []).map((u) => u.media_id));

  let query = supabase
    .from("media_library")
    .select("id")
    .eq("texte_restant", false)
    .order("used_count")
    .limit(100);
  if (compte.compte_reference_id) {
    query = query.eq("compte_reference_id", compte.compte_reference_id);
  }

  const { data: disponibles } = await query;
  const libres = (disponibles ?? [])
    .map((m) => m.id)
    .filter((id) => !utilises.has(id));

  const choix = new Map<number, string | null>();
  for (const slide of slides) {
    const remplacant = libres.shift();
    choix.set(slide.position, remplacant ?? slide.media_id);
  }
  return choix;
}

/** Journalise l'usage pour que le prochain remaniement pioche ailleurs. */
async function marquerVisuelsUtilises(
  supabase: Supabase,
  compteId: string,
  postId: string,
  slides: Array<{ media_id: string | null }>,
) {
  const lignes = slides
    .filter((s) => s.media_id)
    .map((s) => ({ media_id: s.media_id, compte_id: compteId, post_id: postId }));

  if (lignes.length === 0) return;

  // Un même visuel peut resservir sur un autre post du compte : le conflit sur
  // (media, compte) est attendu, on l'ignore.
  await supabase.from("media_usages").upsert(lignes, {
    onConflict: "media_id,compte_id",
    ignoreDuplicates: true,
  });
}

async function marquer(supabase: Supabase, postId: string, etape: string) {
  await supabase
    .from("posts")
    .update({ pipeline_statut: "running", pipeline_etape: etape })
    .eq("id", postId);
}
