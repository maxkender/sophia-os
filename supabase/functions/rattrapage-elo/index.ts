import { rattrapageElo } from "../_shared/rattrapage_elo.ts";
import { assertAuthorised, json, messageErreur, serviceClient } from "../_shared/supabase.ts";

/**
 * Rattrapage ELO manuel (admin) — fenêtre Paris (défaut 4 jours) :
 *   1) stats TikTok des passages publiés (publie_url)
 *   2) ELO langue en deltas ↑/↓ (vues seules), idempotent
 *   3) ELO compte = moyenne pondérée ≤10 posts mesurés
 *
 * Contourne PAUSE_ELO_RUNTIME (c’est le chemin volontaire de reprise).
 *
 *   {}                  → tous les comptes, 4 jours
 *   { compteId, jours, forcer, dryRun, snapshot }
 *   { snapshot: true }  → fige seulement vues_globales_jour (fin de run live)
 */
Deno.serve(async (request) => {
  const denied = await assertAuthorised(request);
  if (denied) return denied;

  const supabase = serviceClient();
  // deno-lint-ignore no-explicit-any
  let body: any = {};
  try {
    body = await request.json();
  } catch {
    // vide
  }

  try {
    const r = await rattrapageElo(supabase, {
      compteId: body?.compteId ?? null,
      jours: body?.jours ?? undefined,
      forcer: Boolean(body?.forcer),
      dryRun: Boolean(body?.dryRun),
      snapshot: Boolean(body?.snapshot),
    });
    return json({ ok: true, ...r });
  } catch (error) {
    return json({ ok: false, error: messageErreur(error) }, 500);
  }
});
