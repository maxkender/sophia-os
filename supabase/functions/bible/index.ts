/**
 * bible — la « Bible des comptes » (18/11, Max), admin au sens strict seulement.
 *
 *   POST { action: "miniatures", id }
 *       19/11 : les 3 DERNIERS TikToks du compte (scraper Apify, ~12 derniers lus), avec les stats du profil ;
 *       chaque miniature est téléchargée tout de suite et copiée dans medias/bible/<handle>/ (une URL TikTok
 *       expire). Les liens déjà enregistrés servent en secours ; sinon l'erreur est notée sur la fiche.
 *   POST { action: "miniatures_propositions", ids }
 *       24/11 : l'aperçu des propositions de l'éclaireur (sources_candidats). Les posts d'exemple de chaque
 *       proposition (3 au plus, 5 propositions par appel) sont relevés en UN appel Apify, leur couverture copiée
 *       dans medias/bible/<handle>/ et notée dans `exemples` (miniature_url, ou erreur : pas de nouvel essai).
 *   POST { action: "resoudre", urls }
 *       Les liens courts (vm.tiktok.com, vt.tiktok.com, tiktok.com/t/…) suivis jusqu'au vrai lien
 *       (@handle et, pour un post, son /video/ ou /photo/). 50 liens au plus ; rien n'est écrit.
 *
 * N'écrit que dans bible_comptes (posts, miniatures, stats auto) et dans `sources_candidats.exemples` (les
 * miniatures). Ne touche ni à l'import ni à rien d'autre.
 */
import { downloadMedia, postsAvecImage } from "../_shared/apify.ts";
import { cheminMiniature, estLienCourt, estLienPost, exemplesSansApercu, idPost, type PostBible, statsProfil, troisDerniers } from "../_shared/bible.ts";
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
    if (body?.action === "miniatures_propositions") {
      const ids = (Array.isArray(body.ids) ? body.ids : []).filter((x: unknown): x is string => typeof x === "string" && /^[0-9a-f-]{36}$/.test(x)).slice(0, 5);
      if (!ids.length) return json({ ok: false, error: "ids manquants" }, 400);
      return json(await miniaturesPropositions(db, ids));
    }
    if (body?.action === "resoudre") {
      const urls = (Array.isArray(body.urls) ? body.urls : []).filter((u: unknown): u is string => typeof u === "string").slice(0, 50);
      return json({ ok: true, liens: await Promise.all(urls.map(resoudre)) });
    }
    if (body?.action === "apercu") {
      // Les miniatures déjà copiées, en data URL (admin) : pour un aperçu de la page hors du navigateur de l'OS.
      const paths = (Array.isArray(body.paths) ? body.paths : [])
        .filter((p: unknown): p is string => typeof p === "string" && p.startsWith("bible/")).slice(0, 40);
      const images: Record<string, string> = {};
      for (const p of paths) {
        const { data } = await db.storage.from("medias").download(p);
        if (!data) continue;
        const octets = new Uint8Array(await data.arrayBuffer());
        let binaire = "";
        for (let i = 0; i < octets.length; i += 0x8000) binaire += String.fromCharCode(...octets.subarray(i, i + 0x8000));
        images[p] = `data:${data.type || "image/jpeg"};base64,${btoa(binaire)}`;
      }
      return json({ ok: true, images });
    }
    return json({ ok: false, error: "action inconnue" }, 400);
  } catch (erreur) {
    console.error("[bible]", messageErreur(erreur));
    return json({ ok: false, error: messageErreur(erreur) }, 500);
  }
});

/** Un lien court TikTok suivi jusqu'au vrai lien (sans les paramètres de suivi). */
async function resoudre(url: string): Promise<{ url: string; resolu: string | null; erreur: string | null }> {
  if (!estLienCourt(url)) return { url, resolu: null, erreur: "pas un lien court TikTok" };
  try {
    const r = await fetch(url, { redirect: "follow", headers: { "user-agent": NAVIGATEUR }, signal: AbortSignal.timeout(15_000) });
    await r.body?.cancel();
    const final = r.url.split("?")[0]!;
    return /tiktok\.com\/@[A-Za-z0-9._]+/.test(final) ? { url, resolu: final, erreur: null } : { url, resolu: null, erreur: `redirigé vers ${final.slice(0, 80)}` };
  } catch (e) {
    return { url, resolu: null, erreur: messageErreur(e).slice(0, 120) };
  }
}

/** La miniature d'un post par oEmbed (sans clé), téléchargée aussitôt. */
async function miniatureOembed(lien: string, secours?: string | null): Promise<{ octets: Uint8Array; type: string }> {
  // L'image du scraper d'abord (oEmbed refuse souvent nos serveurs), puis oEmbed.
  if (secours) {
    try {
      return await telechargerImage(secours);
    } catch { /* oEmbed */ }
  }
  // Apify rend /video/ même pour un diaporama : on essaie aussi la forme /photo/, puis l'image du scraper.
  const essais = [lien, lien.includes("/video/") ? lien.replace("/video/", "/photo/") : lien.replace("/photo/", "/video/")];
  let derniere = "oEmbed sans miniature";
  for (const u of essais) {
    try {
      const r = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(u)}`, {
        headers: { "user-agent": NAVIGATEUR }, signal: AbortSignal.timeout(20_000),
      });
      if (!r.ok) {
        derniere = `oEmbed ${r.status}`;
        continue;
      }
      const o = (await r.json()) as { thumbnail_url?: string };
      if (o.thumbnail_url) return await telecharger(o.thumbnail_url);
    } catch (e) {
      derniere = messageErreur(e).slice(0, 80);
    }
  }
  throw new Error(derniere);
}

async function telecharger(url: string): Promise<{ octets: Uint8Array; type: string }> {
  const r = await fetch(url, { headers: { "user-agent": NAVIGATEUR }, signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`image ${r.status}`);
  const type = r.headers.get("content-type")?.split(";")[0] ?? "image/jpeg";
  if (!type.startsWith("image/")) throw new Error(`pas une image (${type})`);
  return { octets: new Uint8Array(await r.arrayBuffer()), type };
}

/** Une image du scraper : le stockage d'Apify demande le jeton (downloadMedia), le reste se télécharge tel quel. */
async function telechargerImage(url: string): Promise<{ octets: Uint8Array; type: string }> {
  if (url.startsWith("https://api.apify.com/")) {
    const octets = await downloadMedia(url);
    return { octets, type: "image/jpeg" };
  }
  return await telecharger(url);
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
  // 19/11 (Max) : les 3 DERNIERS TikToks du compte (le scraper lit les ~12 derniers), avec les stats du profil.
  // Les liens déjà enregistrés ne servent qu'en secours, si le scraper ne répond pas.
  const anciens = ((fiche.posts ?? []) as PostBible[]).filter((p) => p?.url && estLienPost(p.url)).slice(0, 3);
  let posts: PostBible[] = [];
  const imageScraper = new Map<string, string>();
  let stats: Record<string, unknown> | null = null;
  let source = "derniers";
  let erreurScraper: string | null = null;
  if (Deno.env.get("APIFY_TOKEN")) {
    try {
      const recents = await postsAvecImage({ profiles: [handle], resultsPerPage: 12 });
      for (const p of recents) if (p.image) imageScraper.set(p.url, p.image);
      const profil = recents.map((p) => ({ url: p.url, vues: p.vues, createTime: p.createTime }));
      stats = statsProfil(profil, recents.find((p) => p.abonnes != null)?.abonnes ?? null);
      posts = troisDerniers(profil).map((p) => ({ url: p.url, vues: p.vues }));
    } catch (e) {
      erreurScraper = `TikTok ne répond pas (${messageErreur(e).slice(0, 120)})`;
    }
  } else {
    erreurScraper = "scraper non configuré";
  }
  if (!posts.length && anciens.length) {
    posts = anciens;
    source = "liens";
  }
  if (!posts.length) {
    await db.rpc("bible_miniatures_ecrire", {
      p_id: id, p_posts: null, p_statut: "erreur", p_erreur: erreurScraper ?? "aucun TikTok trouvé sur ce compte", p_stats: stats,
    });
    return { ok: true, statut: "erreur" };
  }

  const sortie: PostBible[] = [];
  for (const [i, p] of posts.entries()) {
    try {
      const image = await miniatureOembed(p.url, imageScraper.get(p.url));
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

/**
 * 24/11 : les miniatures des posts d'exemple de quelques propositions. Un seul appel Apify pour tous les liens ;
 * si Apify ne répond pas, rien n'est écrit (on réessaiera à la prochaine visite). Un post sans image garde une
 * `erreur` : il n'est pas redemandé à chaque ouverture de la page.
 */
async function miniaturesPropositions(db: Db, ids: string[]) {
  const { data, error } = await db.from("sources_candidats").select("id, handle_tiktok, exemples").in("id", ids);
  if (error) throw new Error(error.message);
  const fiches = ((data ?? []) as { id: string; handle_tiktok: string; exemples: unknown }[])
    .map((f) => ({ ...f, exemples: (Array.isArray(f.exemples) ? f.exemples : []) as Record<string, unknown>[] }))
    .map((f) => ({ ...f, rangs: exemplesSansApercu(f.exemples) }))
    .filter((f) => f.rangs.length > 0);
  if (!fiches.length) return { ok: true, miniatures: 0, propositions: 0 };
  if (!Deno.env.get("APIFY_TOKEN")) return { ok: false, error: "scraper non configuré" };

  const liens = fiches.flatMap((f) => f.rangs.map((i) => String(f.exemples[i]!.url)));
  const images = new Map<string, string>();
  try {
    for (const p of await postsAvecImage({ postURLs: liens, resultsPerPage: 1 })) {
      const id = idPost(p.url);
      if (id && p.image) images.set(id, p.image);
    }
  } catch (e) {
    return { ok: false, error: `TikTok ne répond pas (${messageErreur(e).slice(0, 120)})` };
  }

  let ok = 0;
  for (const f of fiches) {
    const handle = f.handle_tiktok.trim().replace(/^@+/, "").toLowerCase();
    const exemples = [...f.exemples];
    for (const i of f.rangs) {
      const url = String(exemples[i]!.url);
      try {
        const image = await miniatureOembed(url, images.get(idPost(url) ?? ""));
        const chemin = cheminMiniature(handle, url, i);
        exemples[i] = { ...exemples[i], miniature_path: chemin, miniature_url: await copier(db, chemin, image), erreur: null };
        ok++;
      } catch (e) {
        exemples[i] = { ...exemples[i], erreur: messageErreur(e).slice(0, 160) };
      }
    }
    const { error: e2 } = await db.from("sources_candidats").update({ exemples }).eq("id", f.id);
    if (e2) throw new Error(e2.message);
  }
  return { ok: true, miniatures: ok, propositions: fiches.length };
}
