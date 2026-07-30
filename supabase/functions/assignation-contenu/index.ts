import { assignerTousComptes } from "../_shared/assignation_contenu.ts";
import {
  assertAuthorised,
  aujourdhuiParis,
  json,
  messageErreur,
  serviceClient,
} from "../_shared/supabase.ts";

/**
 * Assignation v-next : pioche dans le pool `contenus` via labels ∩ score ×
 * exploration top-K. Crée des `passages` déjà cuits (trad + Sophia) et un
 * post pont (`type=contenu`, pipeline done) pour le calendrier poster.
 *
 *   {}             → tous les comptes, jour Paris
 *   { compteId, date, forcer }
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

  const jour = body?.date ?? aujourdhuiParis();

  try {
    const resultats = await assignerTousComptes(
      supabase,
      jour,
      body?.compteId ?? null,
      Boolean(body?.forcer),
    );
    return json({ ok: true, jour, resultats });
  } catch (error) {
    return json({ ok: false, error: messageErreur(error) }, 500);
  }
});
