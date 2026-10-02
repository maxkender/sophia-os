import {
  chargerApplicationsMoteur,
  schemaMultiAppPretSinonSophia,
} from "../_shared/applications_moteur.ts";
import { assignerTousComptes } from "../_shared/assignation_contenu.ts";
import { ID_SOPHIA } from "../_shared/multi_app.ts";
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
 * Multi-applications (0256) : un post promeut une application. La révocation
 * admin d'un post d'une application AUTRE que Sophia ne condamne pas le
 * slideshow — c'est le placement de CETTE application qui est en cause, pas le
 * contenu : il sort seulement de la réserve de l'application
 * (`contenu_pertinences.eligible = false`) et reste servi à Sophia. La recharge
 * refait un post de la MÊME application (répartition tenue), sous réserve
 * d'éligibilité du compte et avec le repli Sophia habituel.
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

    // `application_id` n'existe qu'avec 0256 : sans elle, le select d'avant
    // (une colonne inconnue ferait échouer la lecture, donc la révocation).
    // Sonde illisible : le select d'avant (la révocation passe, comme avant).
    const multiApp = await schemaMultiAppPretSinonSophia(supabase);
    const colonnesPassage = multiApp ? "id, contenu_id, application_id" : "id, contenu_id";

    // Passage v-next lié (pont post)
    const { data: passageBrut } = await supabase
      .from("passages")
      .select(colonnesPassage)
      .eq("post_id", post.id)
      .maybeSingle();
    const passage = passageBrut as unknown as PassageRevoque | null;

    let contenuRejete: string | null = passage?.contenu_id ?? null;
    let applicationRevoquee: string | null = passage?.application_id ?? null;

    // Post vide sans lien : retrouver un passage orphelin du même créateur/jour
    // (créé juste avant l'échec de matérialisation).
    if (!passage) {
      const { data: orphelinBrut } = await supabase
        .from("passages")
        .select(colonnesPassage)
        .eq("compte_id", compteId)
        .eq("date_publication_prevue", jour)
        .is("post_id", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const orphelin = orphelinBrut as unknown as PassageRevoque | null;
      if (orphelin) {
        contenuRejete = orphelin.contenu_id as string;
        applicationRevoquee = orphelin.application_id ?? null;
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

    // Application du post révoqué (chemin 0256 seulement). Sophia ou inconnue :
    // la révocation d'avant, au mot près.
    const application = multiApp && applicationRevoquee
      ? (await chargerApplicationsMoteur(supabase)).find((a) => a.id === applicationRevoquee) ??
        null
      : null;
    const autreApplication = application !== null && application.id !== ID_SOPHIA;

    if (contenuRejete) {
      if (!estRechargeCreateur && autreApplication) {
        // Le placement de CETTE application est en cause, pas le slideshow :
        // il sort de sa réserve, Sophia continue de le servir.
        await retirerDeLaReserve(
          supabase,
          contenuRejete,
          application.id,
          `Révoqué à la main : placement ${application.nom} incohérent`,
        );
      } else if (!estRechargeCreateur) {
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
      // Un post Unswipe révoqué est remplacé par un post Unswipe : la
      // répartition du compte reste tenue (repli Sophia si impossible).
      applicationImposee: application?.slug ?? null,
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

interface PassageRevoque {
  id: string;
  contenu_id: string | null;
  /** Présent seulement quand 0256 est passée. */
  application_id?: string | null;
}

/**
 * Sort un contenu de la réserve d'une application (hors Sophia) :
 * `contenu_pertinences.eligible = false` pour (contenu, application).
 *
 * Mise à jour d'abord, insertion sinon — et pas un upsert : `score` est NOT
 * NULL sans défaut, un upsert partiel lèverait même quand la ligne existe
 * (Postgres vérifie le tuple proposé avant le conflit), et un upsert complet
 * écraserait la note d'import qu'on veut garder pour l'historique. La ligne
 * existe presque toujours : la réserve d'une autre application l'exige.
 *
 * L'erreur est REMONTÉE : une révocation qui croit avoir sorti le contenu de
 * la réserve et ne l'a pas fait le resservirait dès la nuit suivante.
 */
async function retirerDeLaReserve(
  supabase: ReturnType<typeof serviceClient>,
  contenuId: string,
  applicationId: string,
  raison: string,
): Promise<void> {
  const { data: majs, error } = await supabase
    .from("contenu_pertinences")
    .update({ eligible: false, raison, updated_at: new Date().toISOString() })
    .eq("contenu_id", contenuId)
    .eq("application_id", applicationId)
    .select("contenu_id");
  if (error) throw new Error(`retrait de la réserve : ${error.message}`);
  if ((majs ?? []).length > 0) return;
  const { error: errIns } = await supabase.from("contenu_pertinences").insert({
    contenu_id: contenuId,
    application_id: applicationId,
    score: 0,
    eligible: false,
    raison,
  });
  if (errIns) throw new Error(`retrait de la réserve : ${errIns.message}`);
}
