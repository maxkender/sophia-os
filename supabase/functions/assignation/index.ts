import { assignerTousComptes } from "../_shared/assignation_contenu.ts";
import {
  assertAuthorised,
  aujourdhuiParis,
  json,
  messageErreur,
  serviceClient,
} from "../_shared/supabase.ts";

/**
 * Assignation quotidienne — CUTOVER v-next.
 *
 * Ancien chemin recycle/remanie/nouveau abandonné. Cette Edge Function
 * (encore appelée par le front prod / anciens crons) délègue à
 * `assignerTousComptes` : labels ∩ + score → passages + posts pont
 * (`type=contenu`, déjà traduits + Sophia).
 *
 *   {}               → tous les comptes (respecte pause assignation_auto)
 *   { compteId }     → ce seul compte
 *   { date }         → jour Paris cible
 *   { manuel: true } → contourne la pause (lancement admin Minuit)
 *   { forcer: true } → crée 1 passage même si quota atteint
 */
Deno.serve(async (request) => {
  const denied = await assertAuthorised(request);
  if (denied) return denied;

  const supabase = serviceClient();

  let compteId: string | null = null;
  let date: string | null = null;
  let forcer = false;
  let manuel = false;
  try {
    const body = await request.json();
    compteId = body?.compteId ?? null;
    date = body?.date ?? null;
    forcer = Boolean(body?.forcer);
    manuel = Boolean(body?.manuel);
  } catch {
    // Corps vide : tous les comptes, aujourd'hui.
  }

  const jour = date ?? aujourdhuiParis();

  try {
    if (!manuel) {
      const { data: flag } = await supabase
        .from("reglages")
        .select("valeur")
        .eq("cle", "assignation_auto")
        .maybeSingle();
      const actif = (flag?.valeur as { actif?: boolean } | null)?.actif !== false;
      if (!actif) {
        return json({
          ok: true,
          saute: true,
          raison: "assignation_auto en pause",
          jour,
        });
      }
    }

    const resultats = await assignerTousComptes(supabase, jour, compteId, forcer);
    return json({ ok: true, jour, resultats });
  } catch (error) {
    return json({ ok: false, error: messageErreur(error) }, 500);
  }
});
