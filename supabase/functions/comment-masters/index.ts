import { scrapeCommentaires, scrapeStatsPosts } from "../_shared/apify.ts";
import {
  blocsSlack,
  type DemandeSlack,
  idDuLien,
  lireReponse,
  nomAppli,
  problemesCommentaire,
  promptCommentaire,
  retrouverCommentaire,
  texteNotification,
} from "../_shared/comment_masters.ts";
import { assertAuthorised, json, messageErreur, serviceClient } from "../_shared/supabase.ts";

type Supabase = ReturnType<typeof serviceClient>;

interface Region {
  langue: string;
  slack_channel_id: string;
  seuil_vues: number;
  fenetre_heures: number;
}

// Relevé du commentaire 48 h après le « Done » : assez pour que les likes se
// soient posés, le post n'est plus poussé par TikTok au-delà.
const DELAI_MESURE_H = 48;
// TikTok sert d'abord les commentaires les plus likés : au-delà de 100, celui
// du comment master n'a de toute façon aucun like à relever.
const COMMENTAIRES_RELEVES = 100;
const ESSAIS_GENERATION = 3;
// Même ordre de repli que TEXT_MODELS (_shared/gemini.ts). Appel direct plutôt
// qu'import : gemini.ts tire tout le pipeline image (16 fichiers, 200 Ko) dans
// le paquet de la fonction, pour un seul appel texte.
const MODELES_TEXTE = ["gemini-3.5-flash", "gemini-2.0-flash", "gemini-3.1-flash-lite"];

/**
 * Comment masters (TICKET 002), appelée chaque heure par le cron `comment-masters`.
 *
 * 1. Relève les vues des posts DE / IT publiés depuis moins de 12 h (un seul
 *    run Apify, facturé au post) et, pour chaque post au-dessus de 8 000 vues,
 *    génère un commentaire et l'envoie dans le canal Slack de la région.
 * 2. Renvoie les messages Slack qui avaient échoué.
 * 3. 48 h après un « Done », retrouve le commentaire sous le post et relève
 *    ses likes, puis les annonce en réponse au message Slack.
 *
 *   {}              → le passage horaire
 *   { apercu: n }   → commentaires des n derniers posts DE / IT déjà au-dessus
 *                     de 8 000 vues, renvoyés en JSON : ni Slack, ni Apify,
 *                     rien d'écrit. Pour valider le ton avec Max.
 */
Deno.serve(async (request) => {
  const denied = await assertAuthorised(request);
  if (denied) return denied;

  let apercu = 0;
  try {
    apercu = Number((await request.json())?.apercu) || 0;
  } catch {
    // Corps vide : passage horaire.
  }
  if (apercu > 0) {
    try {
      return json({ ok: true, apercu: await apercuCommentaires(serviceClient(), Math.min(apercu, 20)) });
    } catch (error) {
      return json({ ok: false, error: messageErreur(error) }, 500);
    }
  }

  const slack = Deno.env.get("SLACK_BOT_TOKEN");
  // Sans Slack, inutile de payer le relevé Apify : rien ne pourrait partir.
  if (!slack) return json({ ok: false, error: "SLACK_BOT_TOKEN manquant" }, 500);

  const supabase = serviceClient();
  try {
    const { data: regions, error } = await supabase
      .from("comment_master_regions")
      .select("langue, slack_channel_id, seuil_vues, fenetre_heures")
      .eq("actif", true)
      .not("slack_channel_id", "is", null);
    if (error) throw error;
    if (!regions?.length) return json({ ok: true, info: "aucune région active avec un canal Slack" });

    const detection = await detecter(supabase, regions as Region[], slack);
    const renvois = await renvoyer(supabase, slack);
    const mesures = await mesurer(supabase, slack);
    return json({ ok: true, ...detection, renvois, mesures });
  } catch (error) {
    return json({ ok: false, error: messageErreur(error) }, 500);
  }
});

async function detecter(supabase: Supabase, regions: Region[], slack: string) {
  const parLangue = new Map(regions.map((r) => [r.langue, r]));
  const fenetreMax = Math.max(...regions.map((r) => r.fenetre_heures));
  const depuis = new Date(Date.now() - fenetreMax * 3600_000).toISOString();

  const { data: passages, error } = await supabase
    .from("passages")
    .select(
      "id, compte_id, application_id, publie_url, publie_at, tiktok_publie_at, slides, hashtags, comptes!inner(handle_tiktok, langue, application_id)",
    )
    .eq("statut", "publie")
    .not("publie_url", "is", null)
    .gte("publie_at", depuis)
    .in("comptes.langue", [...parLangue.keys()]);
  if (error) throw error;

  // L'heure TikTok réelle prime : un poster qui coche avec un jour de retard
  // ne doit pas faire passer un vieux post pour un post de l'heure.
  const maintenant = Date.now();
  const candidats = (passages ?? [])
    .map((p) => {
      const compte = p.comptes as unknown as { handle_tiktok: string | null; langue: string; application_id: string | null };
      const region = parLangue.get(compte.langue)!;
      const publieMs = new Date(p.tiktok_publie_at ?? p.publie_at!).getTime();
      return { p, compte, region, ageMin: Math.round((maintenant - publieMs) / 60_000) };
    })
    .filter((c) => c.ageMin >= 0 && c.ageMin <= c.region.fenetre_heures * 60);
  if (candidats.length === 0) return { suivis: 0, envoyes: 0 };

  const { data: deja, error: errDeja } = await supabase
    .from("comment_master_demandes")
    .select("passage_id")
    .in("passage_id", candidats.map((c) => c.p.id));
  if (errDeja) throw errDeja;
  const dejaEnvoyes = new Set((deja ?? []).map((d) => d.passage_id));
  const aSuivre = candidats.filter((c) => !dejaEnvoyes.has(c.p.id));
  if (aSuivre.length === 0) return { suivis: 0, envoyes: 0 };

  const liens = new Map<string, string>();
  for (const c of aSuivre) liens.set(c.p.id, await resoudreLien(c.p.publie_url!));
  const stats = await scrapeStatsPosts([...new Set(liens.values())]);
  const vuesParId = new Map(stats.map((s) => [s.postId, s.stats.vues]));

  const nomParId = await nomsApplications(supabase);

  let envoyes = 0;
  const erreurs: string[] = [];
  for (const c of aSuivre) {
    const vues = vuesParId.get(idDuLien(liens.get(c.p.id)!)) ?? 0;
    if (vues < c.region.seuil_vues) continue;
    try {
      const entree = entreeCommentaire(c.p, c.compte, nomParId);
      const application = entree.appli;
      const { commentaire, traduction } = await genererCommentaire(entree);

      // Insertion AVANT l'envoi : l'unicité sur passage_id garantit qu'un post
      // ne part qu'une fois, même si deux relevés se chevauchent.
      const { data: demande, error: errIns } = await supabase
        .from("comment_master_demandes")
        .insert({
          passage_id: c.p.id,
          compte_id: c.p.compte_id,
          langue: c.compte.langue,
          application,
          publie_url: c.p.publie_url,
          vues_declenchement: vues,
          age_minutes: c.ageMin,
          commentaire,
          traduction_en: traduction,
          slack_channel_id: c.region.slack_channel_id,
        })
        .select("id")
        .single();
      if (errIns) {
        if (errIns.code === "23505") continue;
        throw errIns;
      }

      const ok = await envoyer(supabase, slack, {
        id: demande.id,
        langue: c.compte.langue,
        handle: c.compte.handle_tiktok,
        application,
        publie_url: c.p.publie_url!,
        vues_declenchement: vues,
        age_minutes: c.ageMin,
        commentaire,
        traduction_en: traduction,
      }, c.region.slack_channel_id);
      if (ok) envoyes += 1;
    } catch (error) {
      erreurs.push(`${c.p.id}: ${messageErreur(error)}`);
    }
  }
  return { suivis: aSuivre.length, envoyes, ...(erreurs.length ? { erreurs } : {}) };
}

async function nomsApplications(supabase: Supabase): Promise<Map<string, string>> {
  const { data, error } = await supabase.from("applications").select("id, nom");
  if (error) throw error;
  return new Map((data ?? []).map((a) => [a.id as string, a.nom as string]));
}

/** Ce que voit le modèle : la langue du compte, l'appli du post, ses slides et ses hashtags. */
function entreeCommentaire(
  p: { application_id: string | null; slides: unknown; hashtags: string | null },
  compte: { langue: string; application_id: string | null },
  nomParId: Map<string, string>,
) {
  return {
    langue: compte.langue,
    appli: nomAppli(nomParId.get(p.application_id ?? compte.application_id ?? "") ?? null),
    slides: ((p.slides ?? []) as Array<{ texte_overlay?: string }>)
      .map((s) => s.texte_overlay ?? "")
      .filter((t) => t.trim()),
    hashtags: p.hashtags,
  };
}

async function apercuCommentaires(supabase: Supabase, n: number) {
  const { data, error } = await supabase
    .from("passages")
    .select("id, application_id, publie_url, vues, slides, hashtags, comptes!inner(handle_tiktok, langue, application_id)")
    .eq("statut", "publie")
    .gte("vues", 8000)
    .in("comptes.langue", ["de", "it"])
    .order("publie_at", { ascending: false })
    .limit(n);
  if (error) throw error;

  const nomParId = await nomsApplications(supabase);
  return await Promise.all((data ?? []).map(async (p) => {
    const compte = p.comptes as unknown as { handle_tiktok: string | null; langue: string; application_id: string | null };
    const entree = entreeCommentaire(p, compte, nomParId);
    const { commentaire, traduction } = await genererCommentaire(entree);
    return {
      lien: p.publie_url,
      langue: compte.langue,
      appli: entree.appli,
      vues: p.vues,
      accroche: entree.slides[0] ?? null,
      commentaire,
      traduction,
      problemes: problemesCommentaire(commentaire, entree.appli),
    };
  }));
}

async function genererCommentaire(input: {
  langue: string;
  appli: string;
  slides: string[];
  hashtags: string | null;
}): Promise<{ commentaire: string; traduction: string }> {
  const prompt = promptCommentaire(input);
  let meilleur: { commentaire: string; traduction: string; problemes: number } | null = null;
  for (let i = 0; i < ESSAIS_GENERATION; i++) {
    const r = lireReponse(await genererTexte(prompt));
    if (!r) continue;
    const commentaire = r.comment.replace(/["“”«»„]/g, "").replace(/\s*#\S+/g, "").trim();
    const problemes = problemesCommentaire(commentaire, input.appli).length;
    if (!meilleur || problemes < meilleur.problemes) {
      meilleur = { commentaire, traduction: r.translation_en, problemes };
    }
    if (problemes === 0) break;
  }
  if (!meilleur) throw new Error("Gemini n'a renvoyé aucun commentaire lisible");
  return meilleur;
}

async function genererTexte(prompt: string): Promise<string> {
  const cle = Deno.env.get("GEMINI_API_KEY");
  if (!cle) throw new Error("GEMINI_API_KEY manquant");
  const echecs: string[] = [];
  for (const modele of MODELES_TEXTE) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modele}:generateContent?key=${cle}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.9, responseMimeType: "application/json" },
        }),
      },
    );
    if (!res.ok) {
      echecs.push(`${modele} ${res.status}: ${(await res.text()).slice(0, 200)}`);
      continue;
    }
    const data = await res.json();
    const parts = (data?.candidates?.[0]?.content?.parts ?? []) as Array<{ text?: string }>;
    return parts.map((p) => p.text ?? "").join("");
  }
  throw new Error(echecs.join(" | "));
}

async function slackApi(token: string, methode: string, corps: Record<string, unknown>) {
  const res = await fetch(`https://slack.com/api/${methode}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(corps),
  });
  return (await res.json()) as { ok: boolean; ts?: string; error?: string };
}

async function envoyer(supabase: Supabase, slack: string, d: DemandeSlack, canal: string): Promise<boolean> {
  const r = await slackApi(slack, "chat.postMessage", {
    channel: canal,
    text: texteNotification(d),
    blocks: blocsSlack(d),
    unfurl_links: false,
    unfurl_media: false,
  });
  await supabase
    .from("comment_master_demandes")
    .update(
      r.ok
        ? { statut: "envoye", slack_ts: r.ts, slack_channel_id: canal, envoye_at: new Date().toISOString(), erreur: null }
        : { erreur: `Slack: ${r.error}` },
    )
    .eq("id", d.id);
  return r.ok;
}

/** Messages restés « à envoyer » (Slack en panne, canal mal réglé) : on retente tant que le post a moins de 12 h. */
async function renvoyer(supabase: Supabase, slack: string): Promise<number> {
  const { data, error } = await supabase
    .from("comment_master_demandes")
    .select(
      "id, langue, application, publie_url, vues_declenchement, age_minutes, commentaire, traduction_en, slack_channel_id, comptes(handle_tiktok)",
    )
    .eq("statut", "a_envoyer")
    .gte("created_at", new Date(Date.now() - 12 * 3600_000).toISOString());
  if (error) throw error;

  let n = 0;
  for (const d of data ?? []) {
    const canal = d.slack_channel_id;
    if (!canal) continue;
    const ok = await envoyer(supabase, slack, {
      ...d,
      handle: (d.comptes as unknown as { handle_tiktok: string | null } | null)?.handle_tiktok ?? null,
      age_minutes: d.age_minutes ?? 0,
    } as DemandeSlack, canal);
    if (ok) n += 1;
  }
  return n;
}

async function mesurer(supabase: Supabase, slack: string) {
  const { data, error } = await supabase
    .from("comment_master_demandes")
    .select("id, publie_url, commentaire, envoye_at, slack_channel_id, slack_ts")
    .not("fait_at", "is", null)
    .is("mesure_at", null)
    .lte("fait_at", new Date(Date.now() - DELAI_MESURE_H * 3600_000).toISOString())
    .limit(10);
  if (error) throw error;

  let mesures = 0;
  const erreurs: string[] = [];
  for (const d of data ?? []) {
    try {
      const commentaires = await scrapeCommentaires(await resoudreLien(d.publie_url), COMMENTAIRES_RELEVES);
      const trouve = retrouverCommentaire(commentaires, d.commentaire, d.envoye_at ?? new Date(0).toISOString());
      await supabase
        .from("comment_master_demandes")
        .update({
          mesure_at: new Date().toISOString(),
          mesure_statut: trouve ? "trouve" : "introuvable",
          likes_commentaire: trouve?.likes ?? null,
          commentaire_cid: trouve?.cid ?? null,
          commentaire_auteur: trouve?.auteur ?? null,
          commentaire_poste: trouve?.texte ?? null,
        })
        .eq("id", d.id);
      if (d.slack_channel_id && d.slack_ts) {
        await slackApi(slack, "chat.postMessage", {
          channel: d.slack_channel_id,
          thread_ts: d.slack_ts,
          text: trouve
            ? `📊 ${DELAI_MESURE_H}h later: your comment has *${trouve.likes} like${trouve.likes === 1 ? "" : "s"}*.`
            : `📊 ${DELAI_MESURE_H}h later: I couldn't find this comment under the post (deleted, or changed a lot?).`,
        });
      }
      mesures += 1;
    } catch (error) {
      erreurs.push(`${d.id}: ${messageErreur(error)}`);
    }
  }
  return { mesures, ...(erreurs.length ? { erreurs } : {}) };
}

/**
 * Lien COURT (vm./vt.tiktok.com, bouton « Partager ») → URL complète avec l'ID
 * numérique, en suivant la redirection. Même logique que `metriques`.
 */
async function resoudreLien(url: string): Promise<string> {
  if (!/\/\/(?:vm|vt)\.tiktok\.com/i.test(url)) return url;
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",
      },
    });
    return res.url || url;
  } catch {
    return url;
  }
}
