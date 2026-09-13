/**
 * Drain de résolution des publications.
 *
 * Retrouve le post TikTok derrière chaque créneau que le créateur a coché
 * « publié ». Sans ça, le relevé de vues dépend entièrement du lien collé à la
 * main — et un lien de profil, un lien d'un autre compte ou un lien oublié
 * coûtent le créneau : ni vues, ni classement.
 *
 *   {} | { compteId?, dryRun? }
 *
 * Déclenché par le cron `resolution-publication-drain` (chaque minute). La file
 * est alimentée par le trigger `passages_file_resolution` : cocher « publié »
 * programme une première tentative 5 minutes plus tard, puis 10, 20 et 120 —
 * le temps que TikTok expose le post.
 */

import { resoudrePublicationsLot } from "../_shared/resolution_publication.ts";
import { assertAuthorised, json, messageErreur, serviceClient } from "../_shared/supabase.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  const denied = await assertAuthorised(request);
  if (denied) return denied;

  let body: { dryRun?: unknown; compteId?: unknown } = {};
  try {
    body = (await request.json()) ?? {};
  } catch {
    // corps vide : toute la file
  }

  try {
    const resultat = await resoudrePublicationsLot(serviceClient(), {
      dryRun: Boolean(body?.dryRun),
      compteId: body?.compteId ? String(body.compteId) : null,
    });
    if (resultat.dus > 0) {
      console.log(
        `[resolution-publication] ${resultat.comptes} compte(s) · ${resultat.resolus} résolu(s)` +
          ` (${resultat.parLien} par lien, ${resultat.parScrape} par scrape)` +
          ` · ${resultat.reprogrammes} reprogrammé(s) · ${resultat.introuvables} introuvable(s)`,
      );
      for (const d of resultat.details) {
        console.log(`[resolution-publication] @${d.handle} ${d.issue} — ${d.detail}`);
      }
      for (const e of resultat.erreurs) {
        console.log(`[resolution-publication] ERR ${e}`);
      }
    }
    return json({ ok: true, ...resultat });
  } catch (error) {
    return json({ ok: false, error: messageErreur(error) }, 500);
  }
});
