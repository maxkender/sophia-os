import { assertRole, json, messageErreur } from "../_shared/supabase.ts";

/**
 * Résout un lien TikTok (court vm/vt/t → URL canonique) et récupère id +
 * miniature oEmbed pour l'aperçu admin.
 *
 *   { url }  → { ok, url, id, thumbnail }
 */
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36";

function idPost(url: string): string | null {
  return (
    url.match(/\/(?:photo|video|embed\/v2)\/(\d+)/)?.[1] ??
    url.match(/\/v\/(\d+)/)?.[1] ??
    url.match(/[?&]item_id=(\d+)/)?.[1] ??
    null
  );
}

function estCourt(url: string): boolean {
  return /\/\/(?:vm|vt)\.tiktok\.com\//i.test(url) || /tiktok\.com\/t\//i.test(url);
}

async function resoudre(url: string): Promise<string> {
  const brut = url.trim();
  if (!estCourt(brut)) return brut;
  try {
    const res = await fetch(brut, { redirect: "follow", headers: { "user-agent": UA } });
    return res.url || brut;
  } catch {
    return brut;
  }
}

function idDepuisHtml(html: string | undefined): string | null {
  return html?.match(/data-video-id="(\d+)"/)?.[1] ?? null;
}

async function oembed(url: string): Promise<{ id: string | null; thumbnail: string | null }> {
  try {
    const oe = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`, {
      headers: { "user-agent": UA },
    });
    if (!oe.ok) return { id: null, thumbnail: null };
    const data = (await oe.json()) as { thumbnail_url?: string; html?: string };
    return {
      thumbnail: data.thumbnail_url?.trim() || null,
      id: idDepuisHtml(data.html),
    };
  } catch {
    return { id: null, thumbnail: null };
  }
}

Deno.serve(async (request) => {
  const acces = await assertRole(request, ["admin"]);
  if (acces instanceof Response) return acces;

  try {
    const body = await request.json();
    const brut = (body?.url ?? "").toString().trim();
    if (!brut) return json({ error: "URL vide" }, 400);

    // oEmbed accepte souvent le lien court : on l'essaie avant la redirection,
    // pour récupérer la miniature du post publié (pas nos slides nettoyées).
    let oe = await oembed(brut);
    const canon = await resoudre(brut);
    if ((!oe.id || !oe.thumbnail) && canon !== brut) {
      const oeCanon = await oembed(canon);
      oe = {
        id: oe.id ?? oeCanon.id,
        thumbnail: oe.thumbnail ?? oeCanon.thumbnail,
      };
    }

    const id = idPost(brut) ?? idPost(canon) ?? oe.id;
    return json({ ok: true, url: canon, id, thumbnail: oe.thumbnail });
  } catch (error) {
    return json({ ok: false, error: messageErreur(error) }, 500);
  }
});
