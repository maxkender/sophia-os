import { assertAuthorised, json, messageErreur, serviceClient } from "../_shared/supabase.ts";

/**
 * Révoque un post inutilisable et en refabrique un autre pour le MÊME créateur
 * et la MÊME date.
 *
 * v-next (`type=contenu`) : rejette le contenu, supprime le passage lié + le
 * post, puis relance l'assignation forcée (labels ∩ score).
 *
 * Legacy (sujet) : rejette le sujet puis même flux.
 *
 * Gère aussi les coquilles « slideshow vide » : post sans slides / passage
 * orphelin (matérialisation ratée) qui bloquaient le quota.
 *
 *   { postId }  → { ok, newPostId }
 */
Deno.serve(async (request) => {
  const denied = await assertAuthorised(request);
  if (denied) return denied;

  const supabase = serviceClient();

  try {
    const body = await request.json();
    const postId = body?.postId;
    if (!postId) return json({ error: "postId requis" }, 400);

    const { data: post } = await supabase
      .from("posts")
      .select("id, compte_id, date_publication_prevue, sujet_id, type")
      .eq("id", postId)
      .single();
    if (!post) return json({ error: "Post introuvable" }, 404);

    const compteId = post.compte_id as string;
    const jour = post.date_publication_prevue as string;

    // Passage v-next lié (pont post)
    const { data: passage } = await supabase
      .from("passages")
      .select("id, contenu_id")
      .eq("post_id", post.id)
      .maybeSingle();

    let contenuRejete: string | null = passage?.contenu_id ?? null;

    // Post vide sans lien : retrouver un passage orphelin du même créateur/jour
    // (créé juste avant l'échec de matérialisation).
    if (!passage) {
      const { data: orphelin } = await supabase
        .from("passages")
        .select("id, contenu_id")
        .eq("compte_id", compteId)
        .eq("date_publication_prevue", jour)
        .is("post_id", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (orphelin) {
        contenuRejete = orphelin.contenu_id as string;
        await supabase.from("passages").delete().eq("id", orphelin.id);
      }
    }

    if (contenuRejete) {
      await supabase
        .from("contenus")
        .update({
          statut: "rejete",
          pertinence_raison: "Révoqué à la main : incohérent / non intégrable pour Sophia",
        })
        .eq("id", contenuRejete);
      if (passage) {
        await supabase.from("passages").delete().eq("id", passage.id);
      }
    } else if (post.sujet_id) {
      await supabase
        .from("sujets")
        .update({
          statut: "rejete",
          pertinence_raison: "Révoqué à la main : incohérent / non intégrable pour Sophia",
        })
        .eq("id", post.sujet_id);
    }

    await supabase.from("posts").delete().eq("id", post.id);

    // Autres coquilles du même jour (orphelins / posts sans slides)
    const { data: autresOrphelins } = await supabase
      .from("passages")
      .select("id")
      .eq("compte_id", compteId)
      .eq("date_publication_prevue", jour)
      .is("post_id", null);
    for (const o of autresOrphelins ?? []) {
      await supabase.from("passages").delete().eq("id", o.id);
    }

    // Assignation forcée v-next (même endpoint — cutover)
    const secret = Deno.env.get("CRON_SECRET");
    const base = new URL(request.url);
    const urlAssign = `${base.origin}${base.pathname.replace(/revoquer-post\/?$/, "")}assignation`;
    await fetch(urlAssign, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-cron-secret": secret ?? "" },
      body: JSON.stringify({
        compteId,
        date: jour,
        forcer: true,
        manuel: true,
      }),
    }).catch(() => null);

    const { data: neuf } = await supabase
      .from("posts")
      .select("id")
      .eq("compte_id", compteId)
      .eq("date_publication_prevue", jour)
      .eq("est_test", false)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Vérifie qu'on n'a pas re-créé une coquille vide
    if (neuf?.id) {
      const { count } = await supabase
        .from("post_slides")
        .select("id", { count: "exact", head: true })
        .eq("post_id", neuf.id);
      if ((count ?? 0) === 0) {
        return json({ ok: true, newPostId: null });
      }
    }

    return json({ ok: true, newPostId: neuf?.id ?? null });
  } catch (error) {
    return json({ ok: false, error: messageErreur(error) }, 500);
  }
});
