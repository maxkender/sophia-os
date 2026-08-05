import {
  annulerAssignationTest,
  assignerTousComptes,
  type AssignationCompteResultat,
} from "../_shared/assignation_contenu.ts";
import { reponseNdjson, veutStream } from "../_shared/nettoyage_etapes.ts";
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
 *   { test: true, compteId, date, manuel: true, stream? }
 *     → assignation test (est_test, sans filtre ELO, ignore warmup)
 *     → NDJSON si stream / Accept ndjson (évite idle Edge 150s)
 *   { action: "annuler_test", compteId, date }
 *     → rollback des posts test de ce compte/jour
 */
Deno.serve(async (request) => {
  const denied = await assertAuthorised(request);
  if (denied) return denied;

  const supabase = serviceClient();

  // deno-lint-ignore no-explicit-any
  let body: any = {};
  let compteId: string | null = null;
  let date: string | null = null;
  let forcer = false;
  let manuel = false;
  let test = false;
  let action: string | null = null;
  try {
    body = await request.json();
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
  // Test = toujours stream (Face swap / deck > 150s idle sinon).
  const stream = test || veutStream(request, body);

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

    const opts = {
      forcer,
      test,
      ignorerElo: test,
      ignorerWarmup: test,
    };

    if (stream) {
      return reponseNdjson(async (emit) => {
        const log = (detail: string) =>
          emit({
            etape: "assignation",
            statut: "en_cours",
            detail,
            at: new Date().toISOString(),
          });

        // Keepalive si une sous-étape reste silencieuse trop longtemps.
        const hb = setInterval(() => log("… encore en cours"), 25_000);
        try {
          log(
            test
              ? `Assignation TEST · ${jour} · compte ${String(compteId).slice(0, 8)}`
              : `Assignation · ${jour}${compteId ? ` · compte ${String(compteId).slice(0, 8)}` : ""}`,
          );
          const resultats = await assignerTousComptes(supabase, jour, compteId, {
            ...opts,
            onLog: log,
          });
          const crees = resultats.reduce((n, r) => n + (r.crees ?? 0), 0);
          const quotasBaisses = synthetiserQuotasBaisses(resultats);
          const avertissement =
            quotasBaisses.length > 0
              ? `Lowered quota (${quotasBaisses.length}) — pool trop mince : ` +
                quotasBaisses
                  .map((q) => `${q.nom} ${q.avant}→${q.apres}`)
                  .join(" · ")
              : undefined;
          if (!test && quotasBaisses.length > 0) {
            await persisterQuotasBaisses(supabase, jour, resultats, quotasBaisses, avertissement);
          }
          const detail =
            avertissement ??
            (crees > 0
              ? `Terminé — ${crees} passage(s)`
              : resultats[0]?.erreur ?? resultats[0]?.raison ?? "Aucun passage créé");
          emit({
            etape: "ready",
            statut: resultats.some((r) => r.erreur) && crees === 0 ? "echec" : "ok",
            ok: true,
            jour,
            resultats,
            test,
            detail,
            quotasBaisses,
            avertissement,
          });
        } finally {
          clearInterval(hb);
        }
      });
    }

    const resultats = await assignerTousComptes(supabase, jour, compteId, opts);
    const quotasBaisses = synthetiserQuotasBaisses(resultats);
    const avertissement =
      quotasBaisses.length > 0
        ? `Lowered quota (${quotasBaisses.length}) — pool trop mince : ` +
          quotasBaisses.map((q) => `${q.nom} ${q.avant}→${q.apres}`).join(" · ")
        : undefined;
    if (!test && quotasBaisses.length > 0) {
      await persisterQuotasBaisses(supabase, jour, resultats, quotasBaisses, avertissement);
    }
    return json({
      ok: true,
      jour,
      resultats,
      test,
      quotasBaisses,
      avertissement,
    });
  } catch (error) {
    return json({ ok: false, error: messageErreur(error) }, 500);
  }
});

function synthetiserQuotasBaisses(
  resultats: AssignationCompteResultat[],
): Array<{ compteId: string; nom: string; avant: number; apres: number; raison: string }> {
  return resultats
    .filter((r) => r.quotaBaisse)
    .map((r) => ({
      compteId: r.compteId,
      nom: r.quotaBaisse!.nom ?? r.compteId.slice(0, 8),
      avant: r.quotaBaisse!.avant,
      apres: r.quotaBaisse!.apres,
      raison: r.quotaBaisse!.raison,
    }));
}

async function persisterQuotasBaisses(
  supabase: ReturnType<typeof serviceClient>,
  jour: string,
  resultats: AssignationCompteResultat[],
  quotasBaisses: Array<{
    compteId: string;
    nom: string;
    avant: number;
    apres: number;
    raison: string;
  }>,
  avertissement: string | undefined,
): Promise<void> {
  await supabase.from("reglages").upsert(
    {
      cle: "minuit_dernier_run",
      valeur: {
        jour,
        at: new Date().toISOString(),
        avertissement: avertissement ?? null,
        quotasBaisses,
        crees: resultats.reduce((n, r) => n + (r.crees ?? 0), 0),
      },
    },
    { onConflict: "cle" },
  );
}
