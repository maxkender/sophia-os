import { assurerDeckPourLangue } from "./import_contenu.ts";
import { mapPool } from "./parallel.ts";
import { serviceClient } from "./supabase.ts";
import {
  appliquerFaceSwapUgcPost,
  chargerPersonaUgc,
} from "./ugc_face_swap.ts";

/** Comptes traités en parallèle. Gemini (trad + Sophia) est dans assurerDeck —
 *  trop large → 429 ; trop petit → assignation lente. */
const LARGEUR_ASSIGNATION = 4;

export type Supabase = ReturnType<typeof serviceClient>;

export interface AssignationReglages {
  postsParJour: number;
  top_k: number;
  temperature: number;
  saturation_jours: number;
  saturation_penalite: number;
}

export async function chargerAssignationReglages(
  supabase: Supabase,
): Promise<AssignationReglages> {
  const { data } = await supabase.from("reglages").select("cle, valeur");
  const map = new Map((data ?? []).map((r) => [r.cle, r.valeur]));
  const frequence = (map.get("frequence") ?? { posts_par_jour: 1 }) as {
    posts_par_jour?: number;
  };
  const scoring = (map.get("scoring") ?? {}) as Record<string, number>;
  return {
    postsParJour: Math.min(3, Math.max(1, frequence.posts_par_jour ?? 1)),
    top_k: scoring.top_k ?? 5,
    temperature: scoring.temperature ?? 0.7,
    saturation_jours: scoring.saturation_jours ?? 7,
    saturation_penalite: scoring.saturation_penalite ?? 0.2,
  };
}

const HASHTAGS: Record<string, string[]> = {
  fr: ["#apprendre", "#culturegenerale", "#developpementpersonnel", "#booktok", "#pourtoi", "#savoir", "#fyp"],
  en: ["#learning", "#selfimprovement", "#booktok", "#foryou", "#knowledge", "#fyp"],
  de: ["#lernen", "#selbstverbesserung", "#booktok", "#fürdich", "#wissen", "#fyp"],
  it: ["#imparare", "#crescitapersonale", "#booktok", "#perte", "#cultura", "#fyp"],
  es: ["#aprender", "#desarrollopersonal", "#booktok", "#parati", "#cultura", "#fyp"],
  pt: ["#aprender", "#desenvolvimentopessoal", "#booktok", "#paravoce", "#cultura", "#fyp"],
};

function hashtagsPour(langue: string, seed: string): string {
  const pool = HASHTAGS[langue] ?? HASHTAGS.fr;
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const debut = h % pool.length;
  return [0, 1, 2].map((i) => pool[(debut + i) % pool.length]).join(" ");
}

interface Candidat {
  contenuId: string;
  score: number;
  slides: unknown;
  musique_url: string | null;
  musique_titre: string | null;
  musique_plateforme: string | null;
  dejaPoste: boolean;
  derniereDate: string | null;
}

/** Tirage top-K pondéré (softmax). */
export function echantillonnerTopK(
  candidats: Candidat[],
  topK: number,
  temperature: number,
): Candidat | null {
  if (candidats.length === 0) return null;
  const slice = candidats.slice(0, Math.max(1, topK));
  const t = Math.max(temperature, 0.05);
  const maxS = Math.max(...slice.map((c) => c.score));
  const poids = slice.map((c) => Math.exp((c.score - maxS) / t));
  const total = poids.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < slice.length; i += 1) {
    r -= poids[i];
    if (r <= 0) return slice[i];
  }
  return slice[slice.length - 1];
}

export interface QuotaBaisse {
  avant: number;
  apres: number;
  /** Diagnostic pool qui a déclenché la baisse. */
  raison: string;
}

export interface AssignationCompteDetail {
  ids: string[];
  /** Motif si rien (ou pas assez) n'a pu être créé — pour l'UI admin. */
  raison?: string;
  /** Quota posts_par_jour baissé pour coller au pool disponible. */
  quotaBaisse?: QuotaBaisse;
}

/** Options d'assignation (test admin = posts invisibles + rollback). */
export interface AssignationOpts {
  forcer?: boolean;
  /** Posts `est_test` — hors calendriers créateurs. */
  test?: boolean;
  /** Ignore le filtre `contenu_langues` (seuil ELO à l'import). */
  ignorerElo?: boolean;
  /** Ignore `warmup_ends_at` (compte hors process OK). */
  ignorerWarmup?: boolean;
  /** Logs progression (stream NDJSON / UI test). */
  onLog?: (detail: string) => void;
}

/**
 * Matérialisation ratée = passage sans `post_id` + post sans slides.
 * Sans purge, le quota compte ces passages et le Planning affiche des
 * slideshows « assignés » vides.
 */
async function purgerAssignationIncomplete(
  supabase: Supabase,
  compteId: string,
  jour: string,
): Promise<void> {
  const { data: orphelins } = await supabase
    .from("passages")
    .select("id")
    .eq("compte_id", compteId)
    .eq("date_publication_prevue", jour)
    .is("post_id", null);
  for (const o of orphelins ?? []) {
    await supabase.from("passages").delete().eq("id", o.id);
  }

  const { data: posts } = await supabase
    .from("posts")
    .select("id")
    .eq("compte_id", compteId)
    .eq("date_publication_prevue", jour)
    .eq("est_test", false)
    .in("statut", ["brouillon", "assigne"]);
  for (const p of posts ?? []) {
    const { count } = await supabase
      .from("post_slides")
      .select("id", { count: "exact", head: true })
      .eq("post_id", p.id);
    if ((count ?? 0) > 0) continue;
    const { data: lie } = await supabase
      .from("passages")
      .select("id")
      .eq("post_id", p.id)
      .maybeSingle();
    if (!lie) {
      await supabase.from("posts").delete().eq("id", p.id);
    }
  }
}

/**
 * Assignation v-next pour un compte : labels ∩, score langue, top-K,
 * pénalité saturation, non-écrasement, fallbacks.
 */
// deno-lint-ignore no-explicit-any
export async function assignerCompteJour(
  supabase: Supabase,
  compte: any,
  jour: string,
  reglages: AssignationReglages,
  opts: AssignationOpts | boolean = {},
): Promise<AssignationCompteDetail> {
  const o: AssignationOpts = typeof opts === "boolean" ? { forcer: opts } : (opts ?? {});
  const forcer = Boolean(o.forcer);
  const estTest = Boolean(o.test);
  const ignorerElo = Boolean(o.ignorerElo ?? estTest);
  const log = (detail: string) => {
    try {
      o.onLog?.(detail);
    } catch {
      // ignore
    }
  };

  const brut = Number(compte.posts_par_jour ?? reglages.postsParJour ?? 1);
  // 0 autorisé (fallback pool mince) → skip ; sinon clamp 1–3 (défaut 1).
  const quota = !Number.isFinite(brut)
    ? 1
    : brut <= 0
      ? 0
      : Math.min(3, Math.max(1, brut));
  const langue: string = compte.langue ?? "fr";
  const ugcAiVideo = Boolean(compte.ugc_ai_video);
  const ugcAi = Boolean(compte.ugc_ai) && !ugcAiVideo;
  const ugcPersonaId = (compte.ugc_persona_id as string | null) ?? null;
  const nomCompte =
    (compte.persona_nom as string | null) ??
    (compte.handle_tiktok as string | null) ??
    String(compte.id).slice(0, 8);

  // UGC AI VIDEO : hors assignation slideshow minuit (pipeline vidéos à part).
  if (ugcAiVideo) {
    log(`Compte ${nomCompte} · UGC AI VIDEO — skip assignation slideshow`);
    return {
      ids: [],
      raison: "Compte UGC AI VIDEO — hors assignation slideshow.",
    };
  }

  if (quota <= 0) {
    log(`Compte ${nomCompte} · quota=0 — skip`);
    return {
      ids: [],
      raison:
        "Quota 0 — pas d'assignation (pool trop mince précédemment ; remonte posts/jour).",
    };
  }

  log(`Compte ${nomCompte} · langue=${langue} · quota=${quota}${ugcAi ? " · UGC" : ""}${estTest ? " · test" : ""}`);

  if (ugcAi && !ugcPersonaId) {
    log("Échec : compte UGC sans persona");
    return {
      ids: [],
      raison:
        "Compte UGC AI sans persona — assigne un persona UGC (4 angles) sur le créateur.",
    };
  }

  // Purge les coquilles legacy recycle/remanie/nouveau du jour (non publiées,
  // sans passage) — sinon « Assigner » empile du Recyclé à côté du v-next.
  if (!forcer && !estTest) {
    const { data: legacy } = await supabase
      .from("posts")
      .select("id, type, statut")
      .eq("compte_id", compte.id)
      .eq("date_publication_prevue", jour)
      .eq("est_test", false)
      .in("type", ["recycle", "remanie", "nouveau"])
      .in("statut", ["brouillon", "assigne"]);
    for (const lp of legacy ?? []) {
      const { data: lie } = await supabase
        .from("passages")
        .select("id")
        .eq("post_id", lp.id)
        .maybeSingle();
      if (!lie) {
        await supabase.from("posts").delete().eq("id", lp.id);
      }
    }
  }

  // Toujours : passages orphelins / posts sans slides ne doivent pas
  // bloquer le quota ni apparaître comme « assignés ».
  if (!estTest) {
    await purgerAssignationIncomplete(supabase, compte.id as string, jour);
  }

  // Quota prod / test séparés : les posts `est_test` n'entrent pas dans le
  // calendrier ni le quota de minuit réel.
  const { data: existants } = await supabase
    .from("passages")
    .select("id, posts!inner(est_test)")
    .eq("compte_id", compte.id)
    .eq("date_publication_prevue", jour)
    .eq("posts.est_test", estTest);

  const dejaLa = existants?.length ?? 0;
  // Non-écrasement : on ne touche pas aux passages déjà là, on complète
  // seulement jusqu'au quota (1–3) du compte.
  const manquants = forcer ? 1 : Math.max(0, quota - dejaLa);
  log(`Passages déjà là : ${dejaLa}/${quota} → à créer : ${manquants}`);
  if (manquants <= 0) {
    return { ids: [], raison: `Quota déjà rempli (${dejaLa}/${quota} passage(s) ce jour).` };
  }

  const { data: labelsCompte } = await supabase
    .from("compte_labels")
    .select("label_id, labels(nom)")
    .eq("compte_id", compte.id);
  const labelIds = (labelsCompte ?? []).map((l) => l.label_id as string);
  // deno-lint-ignore no-explicit-any
  const labelNoms = (labelsCompte ?? [])
    .map((l: any) => l.labels?.nom as string | undefined)
    .filter(Boolean) as string[];
  // Sans labels : impossible d'intersecter → baisse le quota à ce qui est déjà là.
  if (labelIds.length === 0) {
    log("Échec : aucun label sur le compte");
    const diag =
      "Aucun label sur ce compte — ajoute un label (Bibliothèque / Compte) pour piocher.";
    const quotaBaisse = await baisserQuotaSiBesoin(
      supabase,
      compte.id as string,
      quota,
      dejaLa,
      diag,
      estTest,
      forcer,
      log,
    );
    return {
      ids: [],
      raison: quotaBaisse
        ? `Lowered quota ${quotaBaisse.avant}→${quotaBaisse.apres} — ${diag}`
        : diag,
      quotaBaisse,
    };
  }
  log(`Labels : ${labelNoms.length ? labelNoms.join(", ") : `${labelIds.length} id(s)`}`);

  const crees: string[] = [];
  /** Contenu IDs déjà pris / exclus cette session (choisirContenu filtre dessus). */
  const contenusSession: string[] = [];
  const maxTentatives = manquants + 8;

  let persona = null;
  if (ugcAi && ugcPersonaId) {
    log("Chargement persona UGC…");
    persona = await chargerPersonaUgc(supabase, ugcPersonaId);
    if (!persona) {
      log("Échec : persona UGC introuvable");
      return {
        ids: [],
        raison: "Persona UGC introuvable — recrée / réassigne le persona du créateur.",
      };
    }
    log(`Persona UGC OK (${persona.id.slice(0, 8)})`);
  }

  for (let t = 0; t < maxTentatives && crees.length < manquants; t += 1) {
    log(`Pioche contenu ${crees.length + 1}/${manquants} (tentative ${t + 1})…`);
    const choisi = await choisirContenu(
      supabase,
      compte.id,
      langue,
      labelIds,
      jour,
      reglages,
      contenusSession,
      ugcAi,
      { ignorerElo, exclureTestsHisto: true },
    );
    if (!choisi) {
      log("Plus de candidat dans le pool");
      break;
    }
    contenusSession.push(choisi.contenuId);
    log(`Contenu ${choisi.contenuId.slice(0, 8)} (score≈${Math.round(choisi.score)}) — deck ${langue}…`);

    // Traduction + Sophia à la demande (hors langue source) — pas à l'import.
    let slides: SlideLangue[];
    try {
      slides = await assurerDeckPourLangue(supabase, choisi.contenuId, langue);
    } catch (e) {
      log(`Deck échoué : ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    if (!slides.length) {
      log("Deck vide — contenu suivant");
      continue;
    }
    log(`Deck prêt (${slides.length} slides) — matérialisation…`);
    const hashtags = hashtagsPour(langue, `${compte.id}-${jour}-${crees.length}`);

    const { data: passage, error } = await supabase
      .from("passages")
      .insert({
        contenu_id: choisi.contenuId,
        compte_id: compte.id,
        langue,
        date_publication_prevue: jour,
        statut: "assigne",
        slides,
        musique_url: choisi.musique_url,
        musique_titre: choisi.musique_titre,
        musique_plateforme: choisi.musique_plateforme,
        hashtags,
      })
      .select("id")
      .single();
    if (error) throw error;

    // Pont poster : le calendrier / détail créateur lit encore `posts` +
    // `post_slides`. On matérialise un post déjà cuit (pipeline done) et on
    // le lie via passages.post_id — plus de type recycle/remanie/nouveau.
    let postId: string;
    try {
      postId = await materialiserPostDepuisPassage(supabase, {
        passageId: passage.id,
        compteId: compte.id as string,
        contenuId: choisi.contenuId,
        jour,
        slides,
        musique_url: choisi.musique_url,
        musique_titre: choisi.musique_titre,
        musique_plateforme: choisi.musique_plateforme,
        hashtags,
        estTest,
      });
    } catch (e) {
      // Pas de transaction multi-tables : nettoyer le passage pour ne pas
      // bloquer le quota, puis piocher un autre contenu.
      log(`Matérialisation échouée : ${e instanceof Error ? e.message : String(e)}`);
      await supabase.from("passages").delete().eq("id", passage.id);
      continue;
    }
    log(`Post ${postId.slice(0, 8)} créé`);

    // UGC AI : swap Nano Banana sur slides à visage (hors upscale ensuite).
    if (persona) {
      try {
        log("UGC face swap (Nano Banana)…");
        const swap = await appliquerFaceSwapUgcPost(supabase, {
          postId,
          compteId: compte.id as string,
          contenuId: choisi.contenuId,
          persona,
          onLog: log,
        });
        log(`Face swap : ${swap.swaps} ok · ${swap.echecs} échec(s)`);
      } catch (e) {
        // Post déjà utilisable avec médias d'origine — on ne rollback pas.
        log(`Face swap erreur (post gardé) : ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    crees.push(passage.id);
    log(`Passage ${crees.length}/${manquants} prêt`);
  }

  if (crees.length < manquants) {
    const diag = await diagnostiquerPoolVide(
      supabase,
      labelIds,
      labelNoms,
      langue,
      ugcAi,
      ignorerElo,
    );
    log(diag);

    // Fallback : baisser posts_par_jour au nombre réellement assigné aujourd'hui
    // (0–quota) pour que le jour ne reste pas « incomplet » faute de pool.
    const totalAssignes = dejaLa + crees.length;
    const quotaBaisse = estRaisonPoolPourBaisseQuota(diag)
      ? await baisserQuotaSiBesoin(
        supabase,
        compte.id as string,
        quota,
        totalAssignes,
        diag,
        estTest,
        forcer,
        log,
      )
      : undefined;

    const quotaEffectif = quotaBaisse?.apres ?? quota;
    if (totalAssignes >= quotaEffectif) {
      return {
        ids: crees,
        quotaBaisse,
        raison: quotaBaisse
          ? `Lowered quota ${quotaBaisse.avant}→${quotaBaisse.apres} — pool trop mince / déjà assigné.`
          : undefined,
      };
    }
    if (crees.length === 0) {
      return { ids: [], raison: diag, quotaBaisse };
    }
    return {
      ids: crees,
      raison: `${crees.length}/${manquants} créé(s). ${diag}`,
      quotaBaisse,
    };
  }
  log(`Terminé : ${crees.length} passage(s)`);
  return { ids: crees };
}

/** Pool labels×langue trop mince / épuisé → candidat au fallback baisse de quota. */
function estRaisonPoolPourBaisseQuota(diag: string): boolean {
  return (
    /trop mince|épuisé|déjà tout assigné|importe \/ labellise/i.test(diag) ||
    /aucun éligible|pas de ligne ELO|pas de score ELO/i.test(diag) ||
    /aucun valide \+ import/i.test(diag) ||
    /Aucun slideshow tagué/i.test(diag) ||
    /Aucun label sur ce compte/i.test(diag)
  );
}

/** Aligne posts_par_jour sur le nombre de posts réellement assignés ce jour. */
async function baisserQuotaSiBesoin(
  supabase: Supabase,
  compteId: string,
  quota: number,
  totalAssignes: number,
  diag: string,
  estTest: boolean,
  forcer: boolean,
  log: (detail: string) => void,
): Promise<QuotaBaisse | undefined> {
  if (estTest || forcer || totalAssignes >= quota) return undefined;
  const apres = Math.min(3, Math.max(0, totalAssignes));
  if (apres >= quota) return undefined;
  const { error: errQ } = await supabase
    .from("comptes")
    .update({ posts_par_jour: apres })
    .eq("id", compteId);
  if (errQ) {
    log(`Quota non baissé : ${errQ.message}`);
    return undefined;
  }
  log(`Quota baissé ${quota}→${apres} (pool trop mince)`);
  return { avant: quota, apres, raison: diag };
}

/** Explique pourquoi le pool labels ∩ langue est vide / trop petit. */
async function diagnostiquerPoolVide(
  supabase: Supabase,
  labelIds: string[],
  labelNoms: string[],
  langue: string,
  ugcAi = false,
  ignorerElo = false,
): Promise<string> {
  const labelsTxt = labelNoms.length > 0 ? labelNoms.join(", ") : `${labelIds.length} label(s)`;

  const { data: liens } = await supabase
    .from("contenu_labels")
    .select("contenu_id")
    .in("label_id", labelIds);
  const idsLabel = [...new Set((liens ?? []).map((l) => l.contenu_id as string))];
  if (idsLabel.length === 0) {
    return `Aucun slideshow tagué « ${labelsTxt} » dans la bibliothèque.`;
  }

  const { data: prets } = await supabase
    .from("contenus")
    .select("id")
    .eq("statut", "valide")
    .eq("import_statut", "done")
    .eq("ugc_compatible", ugcAi)
    .in("id", idsLabel);
  const idsPrets = (prets ?? []).map((c) => c.id as string);
  if (idsPrets.length === 0) {
    return (
      `${idsLabel.length} slideshow(s) « ${labelsTxt} » mais aucun valide + import terminé` +
      (ugcAi ? " + checkmark UGC" : " (non-UGC)") +
      "."
    );
  }

  if (ignorerElo) {
    return (
      `Pool « ${labelsTxt} » × ${langue.toUpperCase()} épuisé (mode test sans filtre ELO) — ` +
      `${idsPrets.length} slideshow(s) prêt(s), déjà tout assigné ou deck impossible.`
    );
  }

  const { count } = await supabase
    .from("contenu_langues")
    .select("contenu_id", { count: "exact", head: true })
    .eq("langue", langue)
    .in("contenu_id", idsPrets);
  const nLangue = count ?? 0;
  if (nLangue === 0) {
    return (
      `${idsPrets.length} slideshow(s) « ${labelsTxt} » prêts, mais aucun éligible en ` +
      `${langue.toUpperCase()} (pas de ligne ELO pour cette langue à l'import).`
    );
  }

  return (
    `Pool « ${labelsTxt} » × ${langue.toUpperCase()} trop mince ou déjà tout assigné ` +
    `(${nLangue} candidat(s) ELO) — importe / labellise d'autres slideshows ` +
    `(sinon minuit baisse le quota du créateur).`
  );
}

interface SlideStructure {
  position: number;
  media_id?: string | null;
  raw_url?: string | null;
  reference_url?: string | null;
}

interface SlideLangue {
  position: number;
  texte_overlay: string | null;
  position_sophia: boolean;
}

/**
 * Crée le `posts` + `post_slides` que le poster consomme, liés au passage.
 * Deck déjà traduit + Sophia (assurerDeckPourLangue) → pipeline_statut = done.
 *
 * Important : un `media_id` fantôme (média supprimé) faisait échouer l'INSERT
 * `post_slides` (FK) après création du post — passage orphelin + post vide.
 * On nullifie les médias absents, et on rollback le post si les slides
 * n'ont pas pu être écrites.
 */
async function materialiserPostDepuisPassage(
  supabase: Supabase,
  args: {
    passageId: string;
    compteId: string;
    contenuId: string;
    jour: string;
    slides: SlideLangue[];
    musique_url: string | null;
    musique_titre: string | null;
    musique_plateforme: string | null;
    hashtags: string;
    estTest?: boolean;
  },
): Promise<string> {
  const { data: contenu, error: errC } = await supabase
    .from("contenus")
    .select("id, sujet_id, structure_slides, titre")
    .eq("id", args.contenuId)
    .single();
  if (errC || !contenu) throw errC ?? new Error("Contenu introuvable pour pont post");

  if (!args.slides.length) {
    throw new Error("Deck vide — impossible de matérialiser le post");
  }

  const structure = (contenu.structure_slides ?? []) as SlideStructure[];
  // Positions parfois number / parfois string selon JSONB → clé normalisée.
  const parPos = new Map(structure.map((s) => [Number(s.position), s]));

  const mediaIds = [
    ...new Set(
      structure
        .map((s) => s.media_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];
  const mediaOk = new Set<string>();
  if (mediaIds.length > 0) {
    const { data: existants } = await supabase
      .from("media_library")
      .select("id")
      .in("id", mediaIds);
    for (const m of existants ?? []) mediaOk.add(m.id as string);
  }

  const { data: post, error: errP } = await supabase
    .from("posts")
    .insert({
      compte_id: args.compteId,
      sujet_id: contenu.sujet_id ?? null,
      type: "contenu",
      statut: "assigne",
      date_publication_prevue: args.jour,
      musique_url: args.musique_url,
      musique_titre: args.musique_titre,
      musique_plateforme: args.musique_plateforme,
      hashtags: args.hashtags,
      pipeline_statut: "done",
      pipeline_etape: null,
      pipeline_erreur: null,
      est_test: Boolean(args.estTest),
    })
    .select("id")
    .single();
  if (errP || !post) throw errP ?? new Error("Création post pont échouée");

  const rows = args.slides.map((s) => {
    const visuel = parPos.get(Number(s.position));
    const mid = visuel?.media_id ?? null;
    return {
      post_id: post.id,
      position: Number(s.position),
      media_id: mid && mediaOk.has(mid) ? mid : null,
      texte_overlay: s.texte_overlay ?? "",
      position_sophia: Boolean(s.position_sophia),
      reference_url: visuel?.reference_url ?? visuel?.raw_url ?? null,
    };
  });

  const { error: errS } = await supabase.from("post_slides").insert(rows);
  if (errS) {
    await supabase.from("posts").delete().eq("id", post.id);
    throw errS;
  }

  const { error: errL } = await supabase
    .from("passages")
    .update({ post_id: post.id })
    .eq("id", args.passageId);
  if (errL) {
    await supabase.from("posts").delete().eq("id", post.id);
    throw errL;
  }
  return post.id as string;
}

async function choisirContenu(
  supabase: Supabase,
  compteId: string,
  langue: string,
  labelIds: string[],
  jour: string,
  reglages: AssignationReglages,
  dejaCreesCetteSession: string[],
  ugcAi = false,
  opts: { ignorerElo?: boolean; exclureTestsHisto?: boolean } = {},
): Promise<Candidat | null> {
  const ignorerElo = Boolean(opts.ignorerElo);
  // Contenu IDs portant au moins un label du compte
  const { data: liens } = await supabase
    .from("contenu_labels")
    .select("contenu_id")
    .in("label_id", labelIds);
  const contenusLabel = [...new Set((liens ?? []).map((l) => l.contenu_id as string))];
  if (contenusLabel.length === 0) return null;

  // UGC AI ↔ slideshows ugc_compatible ; créateurs classiques ↔ non-UGC.
  const { data: contenus } = await supabase
    .from("contenus")
    .select("id, musique_url, musique_titre, musique_plateforme, ugc_compatible")
    .eq("statut", "valide")
    .eq("import_statut", "done")
    .eq("ugc_compatible", ugcAi)
    .in("id", contenusLabel);
  if (!contenus || contenus.length === 0) return null;

  const contenuIds = contenus.map((c) => c.id as string);
  const meta = new Map(contenus.map((c) => [c.id as string, c]));

  const { data: langues } = await supabase
    .from("contenu_langues")
    .select("contenu_id, score, slides")
    .eq("langue", langue)
    .in("contenu_id", contenuIds);
  const scoreParContenu = new Map(
    (langues ?? []).map((cl) => [cl.contenu_id as string, Number(cl.score ?? 50)]),
  );

  // Historique passages de CE compte (hors posts test si demandé).
  let histQuery = supabase
    .from("passages")
    .select("contenu_id, date_publication_prevue, posts(est_test)")
    .eq("compte_id", compteId)
    .in("contenu_id", contenuIds);
  const { data: hist } = await histQuery;
  const derniere = new Map<string, string>();
  for (const h of hist ?? []) {
    // deno-lint-ignore no-explicit-any
    const estTestHisto = Boolean((h as any).posts?.est_test);
    if (opts.exclureTestsHisto && estTestHisto) continue;
    const d = h.date_publication_prevue ?? "";
    const prev = derniere.get(h.contenu_id);
    if (!prev || d > prev) derniere.set(h.contenu_id, d);
  }

  // Saturation réseau : nb de comptes distincts (hors tests) ayant posté récemment
  const depuis = new Date(`${jour}T00:00:00Z`);
  depuis.setUTCDate(depuis.getUTCDate() - reglages.saturation_jours);
  const seuil = depuis.toISOString().slice(0, 10);
  const { data: recents } = await supabase
    .from("passages")
    .select("contenu_id, compte_id, posts(est_test)")
    .in("contenu_id", contenuIds)
    .gte("date_publication_prevue", seuil)
    .in("statut", ["assigne", "valide_par_poster", "publie"]);
  const saturation = new Map<string, Set<string>>();
  for (const r of recents ?? []) {
    // deno-lint-ignore no-explicit-any
    if (Boolean((r as any).posts?.est_test)) continue;
    let set = saturation.get(r.contenu_id);
    if (!set) {
      set = new Set();
      saturation.set(r.contenu_id, set);
    }
    set.add(r.compte_id);
  }

  const frais: Candidat[] = [];
  const deja: Candidat[] = [];

  const idsCandidats = ignorerElo
    ? contenuIds
    : (langues ?? []).map((cl) => cl.contenu_id as string);

  for (const cid of idsCandidats) {
    if (dejaCreesCetteSession.includes(cid)) continue;
    // Sans ignorerElo : ligne `contenu_langues` = ELO ≥ seuil à l'import.
    // Mode test : on pioche aussi les contenus sans ligne ELO (score 50).

    const m = meta.get(cid);
    if (!m) continue;
    const sat = saturation.get(cid)?.size ?? 0;
    const base = scoreParContenu.get(cid) ?? 50;
    const score = base - reglages.saturation_penalite * sat * 10;
    const candidat: Candidat = {
      contenuId: cid,
      score,
      slides: null,
      musique_url: m.musique_url,
      musique_titre: m.musique_titre,
      musique_plateforme: m.musique_plateforme,
      dejaPoste: derniere.has(cid),
      derniereDate: derniere.get(cid) ?? null,
    };
    if (candidat.dejaPoste) deja.push(candidat);
    else frais.push(candidat);
  }

  frais.sort((a, b) => b.score - a.score);
  const pickFrais = echantillonnerTopK(frais, reglages.top_k, reglages.temperature);
  if (pickFrais) return pickFrais;

  // Fallback 1 : déjà posté, le moins récemment
  deja.sort((a, b) => (a.derniereDate ?? "").localeCompare(b.derniereDate ?? ""));
  if (deja.length > 0) return deja[0];

  // Fallback final : laisse vide (pas de bouche-trou)
  return null;
}

/** Assigne tous les comptes actifs pour un jour. */
export type AssignationCompteResultat = {
  compteId: string;
  crees: number;
  passageIds?: string[];
  erreur?: string;
  raison?: string;
  quotaBaisse?: QuotaBaisse & { nom?: string };
};

export async function assignerTousComptes(
  supabase: Supabase,
  jour: string,
  compteId: string | null = null,
  opts: AssignationOpts | boolean = {},
): Promise<AssignationCompteResultat[]> {
  const o: AssignationOpts = typeof opts === "boolean" ? { forcer: opts } : (opts ?? {});
  const reglages = await chargerAssignationReglages(supabase);
  let query = supabase.from("comptes").select("*").eq("is_active", true);
  if (compteId) query = query.eq("id", compteId);
  const { data: comptesBruts, error } = await query;
  if (error) throw error;

  // Warmup : uniquement les comptes dont warmup_ends_at est passé (en process).
  // Mode test : on peut cibler un compte hors process (ignorerWarmup).
  // UGC AI VIDEO : hors pipeline slideshow (même en test ciblé on laisse
  // assignerCompteJour renvoyer la raison — sauf filtre batch minuit).
  const maintenant = Date.now();
  const comptes = (comptesBruts ?? []).filter((c) => {
    if (Boolean(c.ugc_ai_video) && !compteId) return false;
    if (o.ignorerWarmup) return true;
    const ends = c.warmup_ends_at as string | null | undefined;
    if (!ends) return false; // pas démarré → hors process
    return new Date(ends).getTime() <= maintenant;
  });

  return await mapPool(comptes, LARGEUR_ASSIGNATION, async (compte) => {
    const nom =
      (compte.persona_nom as string | null) ??
      (compte.handle_tiktok as string | null) ??
      String(compte.id).slice(0, 8);
    try {
      const detail = await assignerCompteJour(supabase, compte, jour, reglages, o);
      return {
        compteId: compte.id as string,
        crees: detail.ids.length,
        passageIds: detail.ids,
        raison: detail.raison,
        quotaBaisse: detail.quotaBaisse
          ? { ...detail.quotaBaisse, nom }
          : undefined,
      };
    } catch (e) {
      return {
        compteId: compte.id as string,
        crees: 0,
        erreur: e instanceof Error ? e.message : String(e),
      };
    }
  });
}

/**
 * Annule une assignation test : supprime posts `est_test` + passages liés
 * (+ médias UGC face-swap créés pour ces posts). Comme si rien n'avait existé.
 */
export async function annulerAssignationTest(
  supabase: Supabase,
  compteId: string,
  jour: string,
): Promise<{ posts: number; passages: number; medias: number }> {
  const { data: posts } = await supabase
    .from("posts")
    .select("id")
    .eq("compte_id", compteId)
    .eq("date_publication_prevue", jour)
    .eq("est_test", true);
  const postIds = (posts ?? []).map((p) => p.id as string);
  if (postIds.length === 0) {
    return { posts: 0, passages: 0, medias: 0 };
  }

  const { data: passages } = await supabase
    .from("passages")
    .select("id")
    .in("post_id", postIds);
  const passageIds = (passages ?? []).map((p) => p.id as string);

  const { data: slides } = await supabase
    .from("post_slides")
    .select("media_id")
    .in("post_id", postIds)
    .not("media_id", "is", null);
  const mediaIds = [...new Set((slides ?? []).map((s) => s.media_id as string).filter(Boolean))];

  let mediasUgc: string[] = [];
  if (mediaIds.length > 0) {
    const { data: medias } = await supabase
      .from("media_library")
      .select("id, ugc_face_regen, storage_path")
      .in("id", mediaIds)
      .eq("ugc_face_regen", true);
    mediasUgc = (medias ?? []).map((m) => m.id as string);
    const paths = (medias ?? [])
      .map((m) => m.storage_path as string | null)
      .filter((p): p is string => Boolean(p));
    if (paths.length > 0) {
      await supabase.storage.from("medias").remove(paths).catch(() => null);
    }
  }

  if (passageIds.length > 0) {
    await supabase.from("passages").delete().in("id", passageIds);
  }
  await supabase.from("posts").delete().in("id", postIds);
  if (mediasUgc.length > 0) {
    await supabase.from("media_library").delete().in("id", mediasUgc);
  }

  return {
    posts: postIds.length,
    passages: passageIds.length,
    medias: mediasUgc.length,
  };
}
