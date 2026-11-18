/**
 * bible — la « Bible des comptes » (18/11, Max), admin au sens strict seulement.
 *
 *   POST { action: "miniatures", id }
 *       Les 3 posts de référence d'une fiche : pour chaque lien de post, la miniature (oEmbed TikTok,
 *       champ thumbnail_url) est téléchargée tout de suite et copiée dans medias/bible/<handle>/ ; on
 *       n'affiche jamais une URL TikTok (elles expirent). Sans lien de post : les 3 posts les plus vus
 *       parmi les ~12 derniers du profil (scraper Apify déjà branché), avec les stats du profil.
 *
 * N'écrit que dans bible_comptes (posts, miniatures, stats auto). Ne touche ni à l'import ni à rien d'autre.
 */
import { scrapeStats } from "../_shared/apify.ts";
import { cheminMiniature, estLienPost, type PostBible, statsProfil, troisMeilleurs } from "../_shared/bible.ts";
import { assertRole, json, messageErreur, serviceClient } from "../_shared/supabase.ts";

type Db = ReturnType<typeof serviceClient>;

const NAVIGATEUR = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36";

Deno.serve(async (request) => {
  const acces = await assertRole(request, ["admin"]);
  if (acces instanceof Response) return acces;
  try {
    const body = await request.json().catch(() => ({}));
    const db = serviceClient();
    if (body?.action === "miniatures") {
      const id = String(body.id ?? "");
      if (!/^[0-9a-f-]{36}$/.test(id)) return json({ ok: false, error: "id invalide" }, 400);
      return json(await miniatures(db, id));
    }
    return json({ ok: false, error: "action inconnue" }, 400);
  } catch (erreur) {
    console.error("[bible]", messageErreur(erreur));
    return json({ ok: false, error: messageErreur(erreur) }, 500);
  }
});

/** La miniature d'un post par oEmbed (sans clé), téléchargée aussitôt. */
async function miniatureOembed(lien: string): Promise<{ octets: Uint8Array; type: string }> {
  const r = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(lien)}`, {
    headers: { "user-agent": NAVIGATEUR }, signal: AbortSignal.timeout(20_000),
  });
  if (!r.ok) throw new Error(`oEmbed ${r.status}`);
  const o = (await r.json()) as { thumbnail_url?: string };
  if (!o.thumbnail_url) throw new Error("oEmbed sans miniature");
  return await telecharger(o.thumbnail_url);
}

async function telecharger(url: string): Promise<{ octets: Uint8Array; type: string }> {
  const r = await fetch(url, { headers: { "user-agent": NAVIGATEUR }, signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`image ${r.status}`);
  const type = r.headers.get("content-type")?.split(";")[0] ?? "image/jpeg";
  if (!type.startsWith("image/")) throw new Error(`pas une image (${type})`);
  return { octets: new Uint8Array(await r.arrayBuffer()), type };
}

async function copier(db: Db, chemin: string, image: { octets: Uint8Array; type: string }): Promise<string> {
  const { error } = await db.storage.from("medias").upload(chemin, image.octets, { contentType: image.type, upsert: true });
  if (error) throw new Error(`stockage : ${error.message}`);
  // Le paramètre change à chaque copie : le navigateur ne garde pas l'ancienne image après un rafraîchissement.
  return `${db.storage.from("medias").getPublicUrl(chemin).data.publicUrl}?v=${Date.now()}`;
}

async function miniatures(db: Db, id: string) {
  const { data: fiche, error } = await db.from("bible_comptes").select("id, handle, posts").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!fiche) return { ok: false, error: "fiche introuvable" };
  const handle = fiche.handle as string;
  let posts = ((fiche.posts ?? []) as PostBible[]).filter((p) => p?.url && estLienPost(p.url)).slice(0, 3);
  let stats: Record<string, unknown> | null = null;
  let source = "liens";

  if (!posts.length) {
    // Sans lien de post : les 3 plus vus des ~12 derniers, si le scraper répond.
    if (!Deno.env.get("APIFY_TOKEN")) {
      await db.rpc("bible_miniatures_ecrire", { p_id: id, p_posts: null, p_statut: "sans_liens", p_erreur: "ajouter 3 liens de posts", p_stats: null });
      return { ok: true, statut: "sans_liens" };
    }
    try {
      const recents = await scrapeStats(handle, 12);
      const profil = recents.map((p) => ({ url: p.webVideoUrl, vues: p.stats.vues, createTime: p.createTime }));
      stats = statsProfil(profil, recents.find((p) => p.auteur.abonnes != null)?.auteur.abonnes ?? null);
      posts = troisMeilleurs(profil).map((p) => ({ url: p.url, vues: p.vues }));
      source = "scraper";
    } catch (e) {
      await db.rpc("bible_miniatures_ecrire", { p_id: id, p_posts: null, p_statut: "sans_liens", p_erreur: `ajouter 3 liens de posts (profil illisible : ${messageErreur(e).slice(0, 120)})`, p_stats: null });
      return { ok: true, statut: "sans_liens" };
    }
    if (!posts.length) {
      await db.rpc("bible_miniatures_ecrire", { p_id: id, p_posts: null, p_statut: "sans_liens", p_erreur: "ajouter 3 liens de posts", p_stats: stats });
      return { ok: true, statut: "sans_liens" };
    }
  }

  const sortie: PostBible[] = [];
  for (const [i, p] of posts.entries()) {
    try {
      const image = await miniatureOembed(p.url);
      const chemin = cheminMiniature(handle, p.url, i);
      sortie.push({ url: p.url, vues: p.vues ?? null, miniature_path: chemin, miniature_url: await copier(db, chemin, image), erreur: null });
    } catch (e) {
      // On garde l'ancienne copie si elle existe : une miniature qui a marché une fois reste affichée.
      sortie.push({ url: p.url, vues: p.vues ?? null, miniature_path: p.miniature_path ?? null, miniature_url: p.miniature_url ?? null, erreur: messageErreur(e).slice(0, 160) });
    }
  }
  const ok = sortie.filter((p) => p.miniature_url).length;
  const statut = ok === sortie.length ? "ok" : ok > 0 ? "partiel" : "erreur";
  const erreurs = sortie.filter((p) => p.erreur).map((p) => p.erreur).join(" ; ") || null;
  const { error: e2 } = await db.rpc("bible_miniatures_ecrire", { p_id: id, p_posts: sortie, p_statut: statut, p_erreur: erreurs, p_stats: stats });
  if (e2) throw new Error(e2.message);
  return { ok: true, statut, source, miniatures: ok, posts: sortie.length };
}
