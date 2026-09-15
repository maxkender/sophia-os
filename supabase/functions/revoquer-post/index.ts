import { assignerTousComptes } from "../_shared/assignation_contenu.ts";
import { assertRole, json, messageErreur, serviceClient } from "../_shared/supabase.ts";

const MAX_RECHARGES_CREATEUR = 2;

/**
 * Révoque un post inutilisable et en refabrique un autre pour le MÊME créateur
 * et la MÊME date.
 *
 *   Admin  : { postId } → { ok, newPostId }
 *   Poster : { postId } → { ok, newPostId, recharges_createur, restantes }
 *            — max 2 recharges, uniquement si non publié.
 *
 * v-next (`type=contenu`) : supprime le passage lié + le post, puis relance
 * l'assignation forcée (labels ∩ score). Le pont post est déjà
 * `pipeline_statut=done` (pas de boucle composition).
 *
 * Le contenu n'est rejeté globalement QUE sur révocation admin. Une recharge
 * créateur l'écarte seulement de ce tirage-là : le slideshow reste disponible
 * pour les autres créateurs et les autres langues.
 *
 * Legacy (sujet) : idem — rejet du sujet sur révocation admin seulement.
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

    // Une recharge créateur n'est PAS un verdict sur le slideshow : le créateur
    // dit « pas celui-là, pas maintenant ». Le rejeter globalement le retirait
    // de toute la flotte, toutes langues, définitivement — c'est ce qui vidait
    // les pools (243 slideshows perdus ainsi). Seule une révocation admin
    // condamne le contenu.
    const estRechargeCreateur = acces.role === "poster";
    const raisonRejet = estRechargeCreateur
      ? "Rechargé par le créateur : slideshow buggé (texte décalé / incohérent)"
      : "Révoqué à la main : incohérent / non intégrable pour Sophia";

    if (contenuRejete) {
      if (!estRechargeCreateur) {
        await supabase
          .from("contenus")
          .update({
            statut: "rejete",
            pertinence_raison: raisonRejet,
          })
          .eq("id", contenuRejete);
      }
      if (passage) {
        await supabase.from("passages").delete().eq("id", passage.id);
      }
    } else if (post.sujet_id && !estRechargeCreateur) {
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

    // Assignation forcée in-process (évite un fetch HTTP imbriqué + timeout 150s
    // sur la boucle composition). ignorerWarmup : un créateur en warmup doit
    // quand même pouvoir recharger un slideshow buggé.
    const resultats = await assignerTousComptes(supabase, jour, compteId, {
      forcer: true,
      ignorerWarmup: true,
      // Écarte le slideshow refusé de CE tirage seulement — sans le condamner
      // pour les autres créateurs.
      exclureContenus: contenuRejete ? [contenuRejete] : [],
    });
    const assign = resultats[0];
    if (assign?.erreur) {
      return json({
        ok: true,
        newPostId: null,
        error: "RECHARGE_AUCUN",
        detail: assign.erreur,
        recharges_createur: acces.role === "poster" ? rechargesSuivantes : undefined,
        restantes:
          acces.role === "poster"
            ? Math.max(0, MAX_RECHARGES_CREATEUR - rechargesSuivantes)
            : undefined,
      });
    }
    if (!assign || (assign.crees ?? 0) < 1) {
      return json({
        ok: true,
        newPostId: null,
        error: "RECHARGE_AUCUN",
        detail: assign?.raison ?? "Aucun passage créé",
        recharges_createur: acces.role === "poster" ? rechargesSuivantes : undefined,
        restantes:
          acces.role === "poster"
            ? Math.max(0, MAX_RECHARGES_CREATEUR - rechargesSuivantes)
            : undefined,
      });
    }

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
      await supabase.from("posts").delete().eq("id", neuf.id);
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

    // v-next : le post est déjà pipeline done à la matérialisation.
    // Pas de boucle composition ici (c'était la cause principale des timeouts
    // Edge 150s → bouton créateur « Load an entirely new post » cassé).

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
