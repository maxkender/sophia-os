import { scrapePost } from "../_shared/apify.ts";
import { preparerAvatarReference } from "../_shared/avatar.ts";
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
const AVATARS_REF_PAR_PASSAGE = 0; // pause : Gemini avatar en cron = dépenses sans action admin

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

    // 3 — AUDIT BIBLIOTHÈQUE : PAUSE (verifyClean Gemini désactivé — plus de
    // dépenses vision en boucle via le cron maintenance).

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
