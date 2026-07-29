import { downloadImage, scrapePost } from "../_shared/apify.ts";
import { preparerAvatarReference } from "../_shared/avatar.ts";
import { mimeDepuisBase64, verifyClean } from "../_shared/gemini.ts";
import { assertAuthorised, json, messageErreur, serviceClient } from "../_shared/supabase.ts";

/**
 * Maintenance automatique (cron de nuit). À CHAQUE passage, elle répare un petit
 * lot — pour ne jamais dépasser le mur de 150 s de l'Edge Function :
 *  1. Liens musique « fichier » (CDN périmé) → lien stable vers la page son.
 *  2. Identités de compte incomplètes (pseudo/bio/avatar manquants) → génération.
 *
 * Bornée par passage, mais le cron repasse souvent : le retard se résorbe tout
 * seul en une nuit, sans que l'admin clique quoi que ce soit. Idempotente.
 */
const MUSIQUE_PAR_PASSAGE = 3;
const PERSONAS_PAR_PASSAGE = 1;
const AUDITS_PAR_PASSAGE = 2;
const AVATARS_REF_PAR_PASSAGE = 2;

Deno.serve(async (request) => {
  const denied = await assertAuthorised(request);
  if (denied) return denied;

  const supabase = serviceClient();
  const secret = Deno.env.get("CRON_SECRET") ?? "";
  const base = new URL(request.url);
  const rapport = { musique: 0, personas: 0, audits: 0, sales: 0, avatarsRef: 0 };

  try {
    // 1 — MUSIQUE : quelques sujets dont le lien est un fichier CDN → on re-scrape
    // le post source et on reconstruit le lien STABLE vers la page son.
    const { data: sujets } = await supabase
      .from("sujets")
      .select("id, source_url")
      .not("source_url", "is", null)
      .like("musique_url", "%tiktokcdn%")
      .limit(MUSIQUE_PAR_PASSAGE);

    for (const s of sujets ?? []) {
      try {
        const [post] = await scrapePost(s.source_url!);
        if (post?.musicUrl && !post.musicUrl.includes("tiktokcdn")) {
          await supabase
            .from("sujets")
            .update({ musique_url: post.musicUrl, musique_titre: post.musicTitle })
            .eq("id", s.id);
          await supabase
            .from("posts")
            .update({ musique_url: post.musicUrl, musique_titre: post.musicTitle })
            .eq("sujet_id", s.id);
          rapport.musique += 1;
        }
      } catch {
        // un échec isolé ne bloque pas le lot
      }
    }

    // 2 — IDENTITÉS : quelques comptes sans pseudo ou sans avatar → on génère et
    // on applique (via la fonction persona, qui porte toute la logique).
    const { data: comptes } = await supabase
      .from("comptes")
      .select("id")
      .or("persona_nom.is.null,avatar_url.is.null")
      .limit(PERSONAS_PAR_PASSAGE);

    for (const c of comptes ?? []) {
      try {
        const url = `${base.origin}${base.pathname.replace(/maintenance\/?$/, "")}persona`;
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-cron-secret": secret },
          body: JSON.stringify({ compteId: c.id, appliquer: true }),
        });
        const d = await res.json().catch(() => null);
        if (d?.applique) rapport.personas += 1;
      } catch {
        // idem
      }
    }

    // 3 — AUDIT BIBLIOTHÈQUE : quelques images « propres » jamais contrôlées.
    // Celles nettoyées AVANT l'ajout de la vérification peuvent encore porter du
    // texte. Texte trouvé → `texte_restant` : l'image sort du pipeline et
    // s'affiche « texte présent » dans la bibliothèque (re-nettoyable).
    const { data: aAuditer } = await supabase
      .from("media_library")
      .select("id, url")
      .like("storage_path", "propre/%")
      .is("verifie_le", null)
      .limit(AUDITS_PAR_PASSAGE);

    for (const m of aAuditer ?? []) {
      try {
        const bytes = await downloadImage(m.url);
        let bin = "";
        const CHUNK = 0x8000;
        for (let i = 0; i < bytes.length; i += CHUNK) {
          bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
        }
        // Mime réel (JPEG Fal souvent) — image/png forcé faussait l'audit.
        const b64 = btoa(bin);
        const { mime } = mimeDepuisBase64(b64, "image/jpeg");
        const propre = await verifyClean(b64, mime);
        await supabase
          .from("media_library")
          .update({ verifie_le: new Date().toISOString(), texte_restant: !propre })
          .eq("id", m.id);
        rapport.audits += 1;
        if (!propre) rapport.sales += 1;
      } catch {
        // un échec isolé (429, image inaccessible) : on réessaiera au prochain tour
      }
    }

    // 4 — AVATARS DE RÉFÉRENCE : on prépare À L'AVANCE une photo de profil sans
    // visage pour chaque source active qui n'en a pas encore. Ainsi la création
    // d'un poster n'a plus qu'à la copier — aucun appel Gemini au moment critique.
    const { data: refsSansAvatar } = await supabase
      .from("comptes_reference")
      .select("id")
      .eq("is_active", true)
      .is("avatar_url", null)
      .limit(AVATARS_REF_PAR_PASSAGE);

    for (const r of refsSansAvatar ?? []) {
      try {
        const url = await preparerAvatarReference(supabase, r.id);
        if (url) rapport.avatarsRef += 1;
      } catch {
        // source sans image exploitable pour l'instant : on réessaiera
      }
    }

    return json({ ok: true, ...rapport });
  } catch (error) {
    return json({ ok: false, error: messageErreur(error) }, 500);
  }
});
