import { assertRole, json, messageErreur, serviceClient } from "../_shared/supabase.ts";

const MAX_RECHARGES_CREATEUR = 2;

/**
 * Révoque un post inutilisable et en refabrique un autre pour le MÊME créateur
 * et la MÊME date.
 *
 *   Admin  : { postId } → { ok, newPostId }
 *   Poster : { postId } → { ok, newPostId, recharges_createur, restantes }
 *            — max 2 recharges, uniquement si non publié ; le nouveau post
 *              reçoit le compteur incrémenté ; fabrication avancée jusqu'à done.
 *
 * v-next (`type=contenu`) : rejette le contenu, supprime le passage lié + le
 * post, puis relance l'assignation forcée (labels ∩ score).
 *
 * Legacy (sujet) : rejette le sujet puis même flux.
 *
 * Gère aussi les coquilles « slideshow vide » : post sans slides / passage
 * orphelin (matérialisation ratée) qui bloquaient le quota.
 */
Deno.serve(async (request) => {
  const acces = await assertRole(request, ["admin", "poster"]);
  if (acces instanceof Response) return acces;

  const supabase = serviceClient();

  try {
    const body = await request.json();
    const postId = body?.postId;
    if (!postId) return json({ error: "postId requis" }, 400);

    const { data: post } = await supabase
      .from("posts")
      .select(
        "id, compte_id, date_publication_prevue, sujet_id, type, publie_at, recharges_createur, est_test",
      )
      .eq("id", postId)
      .single();
    if (!post) return json({ error: "Post introuvable" }, 404);

    const rechargesActuelles = Math.min(
      MAX_RECHARGES_CREATEUR,
      Math.max(0, Number(post.recharges_createur) || 0),
    );

    if (acces.role === "poster" && acces.userId !== "cron") {
      const { data: compte } = await supabase
        .from("comptes")
        .select("poster_id")
        .eq("id", post.compte_id)
        .maybeSingle();
      if (!compte?.poster_id || compte.poster_id !== acces.userId) {
        return json({ error: "forbidden" }, 403);
      }
      if (post.publie_at) {
        return json({ error: "RECHARGE_PUBLIE" }, 409);
      }
      if (post.est_test) {
        return json({ error: "RECHARGE_TEST" }, 409);
      }
      if (rechargesActuelles >= MAX_RECHARGES_CREATEUR) {
        return json({ error: "RECHARGE_LIMITE", recharges_createur: rechargesActuelles }, 409);
      }
    }

    const compteId = post.compte_id as string;
    const jour = post.date_publication_prevue as string;
    const rechargesSuivantes =
      acces.role === "poster" ? rechargesActuelles + 1 : 0;

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

    const raisonRejet =
      acces.role === "poster"
        ? "Rechargé par le créateur : slideshow buggé (texte décalé / incohérent)"
        : "Révoqué à la main : incohérent / non intégrable pour Sophia";

    if (contenuRejete) {
      await supabase
        .from("contenus")
        .update({
          statut: "rejete",
          pertinence_raison: raisonRejet,
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
          pertinence_raison: raisonRejet,
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
    const prefix = base.pathname.replace(/revoquer-post\/?$/, "");
    const urlAssign = `${base.origin}${prefix}assignation`;
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
      .select("id, pipeline_statut")
      .eq("compte_id", compteId)
      .eq("date_publication_prevue", jour)
      .eq("est_test", false)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!neuf?.id) {
      return json({ ok: true, newPostId: null, error: "RECHARGE_AUCUN" });
    }

    // Transférer / poser le compteur créateur sur le nouveau post
    if (acces.role === "poster") {
      await supabase
        .from("posts")
        .update({ recharges_createur: rechargesSuivantes })
        .eq("id", neuf.id);
    }

    // Vérifie qu'on n'a pas re-créé une coquille vide
    const { count } = await supabase
      .from("post_slides")
      .select("id", { count: "exact", head: true })
      .eq("post_id", neuf.id);
    if ((count ?? 0) === 0) {
      return json({
        ok: true,
        newPostId: null,
        error: "RECHARGE_AUCUN",
        recharges_createur: acces.role === "poster" ? rechargesSuivantes : undefined,
        restantes:
          acces.role === "poster"
            ? Math.max(0, MAX_RECHARGES_CREATEUR - rechargesSuivantes)
            : undefined,
      });
    }

    // Côté créateur : fabriquer jusqu'à done (sinon posts_poster le masque).
    if (acces.role === "poster") {
      const urlComp = `${base.origin}${prefix}composition`;
      for (let i = 0; i < 40; i += 1) {
        const r = await fetch(urlComp, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-cron-secret": secret ?? "",
          },
          body: JSON.stringify({ postId: neuf.id }),
        }).catch(() => null);
        if (!r) break;
        const bodyComp = await r.json().catch(() => ({}));
        if (bodyComp?.etape === "done" || bodyComp?.etape === "failed") break;
      }
    }

    return json({
      ok: true,
      newPostId: neuf.id,
      recharges_createur: acces.role === "poster" ? rechargesSuivantes : undefined,
      restantes:
        acces.role === "poster"
          ? Math.max(0, MAX_RECHARGES_CREATEUR - rechargesSuivantes)
          : undefined,
    });
  } catch (error) {
    return json({ ok: false, error: messageErreur(error) }, 500);
  }
});
