import { signalerTexte, type CodeRefus } from "../_shared/signalement_texte.ts";
import { assertRole, json, messageErreur, serviceClient } from "../_shared/supabase.ts";

/**
 * Un poster signale qu'une photo « propre » de son post porte encore du texte :
 * elle sort des pools, sa slide reçoit un remplaçant du même label, et le
 * remplaçant suit la photo dans les autres posts non publiés et les contenus.
 * Détail et garde-fous dans `_shared/signalement_texte.ts` et la migration 0255.
 *
 *   { postSlideId } → { ok, signalee, remplacee, mediaId, url, slidesPropagees, contenusPropages }
 *
 * Admin, ou poster propriétaire du post. Jamais sur un post publié.
 */

const STATUTS: Record<CodeRefus, number> = {
  SLIDE_INTROUVABLE: 404,
  INTERDIT: 403,
  POST_PUBLIE: 409,
  SANS_PHOTO: 409,
};

Deno.serve(async (request) => {
  const acces = await assertRole(request, ["admin", "poster"]);
  if (acces instanceof Response) return acces;

  let corps: { postSlideId?: string } = {};
  try {
    corps = await request.json();
  } catch {
    // corps vide
  }
  const postSlideId = corps.postSlideId ?? null;
  if (!postSlideId) return json({ error: "postSlideId requis" }, 400);

  try {
    const resultat = await signalerTexte(serviceClient(), {
      postSlideId,
      userId: acces.userId,
      role: acces.role,
    });
    if (!resultat.ok) return json({ error: resultat.code }, STATUTS[resultat.code]);
    return json(resultat);
  } catch (error) {
    console.error(`[signaler-texte] slide=${postSlideId} ${messageErreur(error)}`);
    return json({ error: messageErreur(error) }, 500);
  }
});
