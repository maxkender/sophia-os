import { scrapeStats } from "../_shared/apify.ts";
import {
  rattraperCreneauxNonDeclares,
  RATTRAPAGE_JOURS_DEFAUT,
} from "../_shared/resolution_publication.ts";
import { assertAuthorised, json, messageErreur, serviceClient } from "../_shared/supabase.ts";

type Supabase = ReturnType<typeof serviceClient>;

const POSTS_RELEVES = 30;

/**
 * Relève les performances des comptes tenus par les posters, pour alimenter le
 * recyclage « sur les meilleures perfs ». Sans ces chiffres, le tirage recyclé
 * n'a rien sur quoi trancher et retombe sur une composition normale.
 *
 * On rapproche par `publie_url` : c'est le lien que le poster colle lui-même
 * après publication, donc la seule correspondance fiable entre un de nos posts
 * et un post réellement en ligne.
 *
 * Le profil scrapé sert aussi de source de vérité pour les créneaux que le
 * créateur n'a jamais déclarés (voir `rattraperCreneauxNonDeclares`) : sans ça,
 * un compte qui publie sans cocher est compté 0 posté et tombe en INACTIF.
 *
 *   {}             → tous les comptes actifs ayant un pseudo TikTok
 *   { compteId }   → ce seul compte
 *   { jours }      → profondeur du rattrapage des non-déclarés (défaut 7)
 */
Deno.serve(async (request) => {
  const denied = await assertAuthorised(request);
  if (denied) return denied;

  const supabase = serviceClient();

  let compteId: string | null = null;
  let jours = RATTRAPAGE_JOURS_DEFAUT;
  try {
    const body = await request.json();
    compteId = body?.compteId ?? null;
    if (Number.isFinite(Number(body?.jours))) jours = Number(body.jours);
  } catch {
    // Corps vide : tous les comptes.
  }

  try {
    let query = supabase
      .from("comptes")
      .select("id, handle_tiktok")
      .eq("is_active", true)
      .not("handle_tiktok", "is", null);
    if (compteId) query = query.eq("id", compteId);

    const { data: comptes, error } = await query;
    if (error) throw error;

    const resultats: Array<{
      compteId: string;
      releves: number;
      rattrapes: number;
      erreur?: string;
    }> = [];

    for (const compte of comptes ?? []) {
      try {
        const r = await releverCompte(supabase, compte.id, compte.handle_tiktok!, jours);
        resultats.push({ compteId: compte.id, ...r });
      } catch (error) {
        resultats.push({
          compteId: compte.id,
          releves: 0,
          rattrapes: 0,
          erreur: messageErreur(error),
        });
      }
    }

    return json({ ok: true, resultats });
  } catch (error) {
    return json({ ok: false, error: messageErreur(error) }, 500);
  }
});

async function releverCompte(
  supabase: Supabase,
  compteId: string,
  handle: string,
  jours: number,
): Promise<{ releves: number; rattrapes: number }> {
  // On scrape TOUJOURS le profil du compte (tous ses posts), indépendamment des
  // liens collés : c'est la seule façon d'avoir des vues pour un compte qui a
  // publié sans donner de lien.
  const enLigne = await scrapeStats(handle, POSTS_RELEVES);

  // Total AU NIVEAU DU COMPTE : somme des posts scrapés. Alimente l'analytics
  // « par compte » même sans aucun lien.
  const somme = (f: (s: (typeof enLigne)[number]["stats"]) => number) =>
    enLigne.reduce((n, p) => n + (f(p.stats) || 0), 0);
  await supabase.from("compte_metrics").insert({
    compte_id: compteId,
    vues: somme((s) => s.vues),
    likes: somme((s) => s.likes),
    commentaires: somme((s) => s.commentaires),
    partages: somme((s) => s.partages),
    nb_posts: enLigne.length,
  });

  // Ce que le créateur n'a jamais déclaré : le profil fait foi. À faire AVANT le
  // relevé par lien — un créneau rattrapé repart avec son `publie_url`, donc ses
  // vues sont relevées dans la foulée.
  const rattrapage = await rattraperCreneauxNonDeclares(supabase, compteId, handle, enLigne, {
    jours,
  });

  // Relevé PAR POST pour ceux dont on a le lien (garde le détail par post :
  // viraux, meilleurs posts…).
  const { data: posts } = await supabase
    .from("posts")
    .select("id, publie_url")
    .eq("compte_id", compteId)
    .eq("statut", "publie")
    .not("publie_url", "is", null);

  if (!posts || posts.length === 0) return { releves: 0, rattrapes: rattrapage.rattrapes };

  // TikTok sert la même URL sous plusieurs formes (paramètres, redirections) :
  // on compare sur l'identifiant numérique du post, stable.
  const idDuLien = (url: string) => url.match(/\/(?:photo|video)\/(\d+)/)?.[1] ?? url;
  const parId = new Map(enLigne.map((p) => [idDuLien(p.webVideoUrl), p.stats]));

  let releves = 0;
  for (const post of posts) {
    // Le poster colle souvent un lien COURT (bouton « Partager » : vm./vt.tiktok.com)
    // qui ne contient pas l'ID numérique. On le résout d'abord en URL complète,
    // sinon rien ne matche (cause du « analytics à 0 » partout sauf 1 compte).
    const complet = await resoudreLien(post.publie_url!);
    const stats = parId.get(idDuLien(complet));
    if (!stats) continue;

    await supabase.from("post_metrics").insert({
      post_id: post.id,
      vues: stats.vues,
      likes: stats.likes,
      commentaires: stats.commentaires,
      partages: stats.partages,
    });
    releves += 1;
  }

  // Passages v-next : même rapprochement par publie_url.
  const { data: passages } = await supabase
    .from("passages")
    .select("id, publie_url")
    .eq("compte_id", compteId)
    .eq("statut", "publie")
    .not("publie_url", "is", null);

  for (const passage of passages ?? []) {
    const complet = await resoudreLien(passage.publie_url!);
    const stats = parId.get(idDuLien(complet));
    if (!stats) continue;
    await supabase
      .from("passages")
      .update({
        vues: stats.vues,
        likes: stats.likes,
        commentaires: stats.commentaires,
        partages: stats.partages,
        stats_maj_at: new Date().toISOString(),
      })
      .eq("id", passage.id);
    releves += 1;
  }

  return { releves, rattrapes: rattrapage.rattrapes };
}

/**
 * Résout un lien COURT TikTok (vm./vt.tiktok.com/XXX — ce que donne le bouton
 * « Partager ») en URL complète `/@compte/photo/ID`, en suivant la redirection.
 * Les liens déjà complets sont renvoyés tels quels. En cas d'échec, on renvoie
 * l'URL d'origine (le relevé de ce post est simplement sauté ce tour-ci).
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
