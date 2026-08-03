import {
  annulerAssignationTest,
  assignerTousComptes,
} from "../_shared/assignation_contenu.ts";
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
 *   { test: true, compteId, date, manuel: true }
 *     → assignation test (est_test, sans filtre ELO, ignore warmup)
 *   { action: "annuler_test", compteId, date }
 *     → rollback des posts test de ce compte/jour
 */
Deno.serve(async (request) => {
  const denied = await assertAuthorised(request);
  if (denied) return denied;

  const supabase = serviceClient();

  let compteId: string | null = null;
  let date: string | null = null;
  let forcer = false;
  let manuel = false;
  let test = false;
  let action: string | null = null;
  try {
    const body = await request.json();
    compteId = body?.compteId ?? null;
    date = body?.date ?? null;
    forcer = Boolean(body?.forcer);
    manuel = Boolean(body?.manuel);
    test = Boolean(body?.test);
    action = typeof body?.action === "string" ? body.action : null;
  } catch {
    // Corps vide : tous les comptes, aujourd'hui.
  }

  const jour = date ?? aujourdhuiParis();

  try {
    if (action === "annuler_test") {
      if (!compteId) return json({ error: "compteId requis" }, 400);
      const resultat = await annulerAssignationTest(supabase, compteId, jour);
      return json({ ok: true, jour, compteId, ...resultat });
    }

    if (test && !compteId) {
      return json({ error: "compteId requis pour une assignation test" }, 400);
    }

    if (!manuel && !test) {
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

    const resultats = await assignerTousComptes(supabase, jour, compteId, {
      forcer,
      test,
      ignorerElo: test,
      ignorerWarmup: test,
    });
    return json({ ok: true, jour, resultats, test });
  } catch (error) {
    return json({ ok: false, error: messageErreur(error) }, 500);
  }
});
