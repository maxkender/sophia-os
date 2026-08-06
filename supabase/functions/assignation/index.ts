import {
  annulerAssignationTest,
  assignerDrainLot,
  assignerTousComptes,
  DRAIN_MAX_CHAIN,
  kickAssignationDrain,
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
 *   {}               → tous les comptes (respecte pause assignation_auto)
 *   { compteId }     → ce seul compte
 *   { date }         → jour Paris cible
 *   { manuel: true } → contourne la pause (lancement admin Minuit)
 *   { drain: true }  → lot de comptes sous-quota + auto-chaîne (évite timeout)
 *   { forcer: true } → crée 1 passage même si quota atteint
 *   { test: true, compteId, date, manuel: true, stream? }
 *   { action: "annuler_test", compteId, date }
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
  let drain = false;
  let drainGen = 0;
  let action: string | null = null;
  try {
    body = await request.json();
    compteId = body?.compteId ?? null;
    date = body?.date ?? null;
    forcer = Boolean(body?.forcer);
    manuel = Boolean(body?.manuel);
    test = Boolean(body?.test);
    drain = Boolean(body?.drain);
    drainGen = typeof body?.drainGen === "number" ? body.drainGen : 0;
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

    // Drain : petits lots + auto-chaîne (chemin minuit / gros backlog).
    if (drain && !compteId && !test) {
      const lot = await assignerDrainLot(supabase, jour, opts);
      const quotasBaisses = synthetiserQuotasBaisses(lot.resultats);
      const crees = lot.resultats.reduce((n, r) => n + (r.crees ?? 0), 0);
      await fusionnerDernierRun(supabase, jour, lot.resultats, quotasBaisses, {
        drainGen,
        traites: lot.traites,
        restants: lot.restants,
      });

      if (lot.restants > 0 && drainGen < DRAIN_MAX_CHAIN) {
        kickAssignationDrain(request, {
          date: jour,
          drain: true,
          drainGen: drainGen + 1,
          // Contourne la pause : le run a déjà été autorisé (cron / admin).
          manuel: true,
        });
      }

      const avertissement =
        quotasBaisses.length > 0
          ? `Lowered quota (${quotasBaisses.length}) — pool trop mince : ` +
            quotasBaisses.map((q) => `${q.nom} ${q.avant}→${q.apres}`).join(" · ")
          : undefined;

      return json({
        ok: true,
        jour,
        drain: true,
        drainGen,
        traites: lot.traites,
        restants: lot.restants,
        resultats: lot.resultats,
        quotasBaisses,
        avertissement,
        crees,
        kick: lot.restants > 0 && drainGen < DRAIN_MAX_CHAIN,
      });
    }

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
          if (!test) {
            await fusionnerDernierRun(supabase, jour, resultats, quotasBaisses, {});
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
    if (!test) {
      await fusionnerDernierRun(supabase, jour, resultats, quotasBaisses, {});
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

/** Merge cumulatif (drain multi-lots) dans reglages.minuit_dernier_run. */
async function fusionnerDernierRun(
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
  meta: Record<string, unknown>,
): Promise<void> {
  const creesLot = resultats.reduce((n, r) => n + (r.crees ?? 0), 0);
  const { data: prev } = await supabase
    .from("reglages")
    .select("valeur")
    .eq("cle", "minuit_dernier_run")
    .maybeSingle();
  const ancien = (prev?.valeur ?? {}) as {
    jour?: string;
    crees?: number;
    quotasBaisses?: Array<{
      compteId: string;
      nom: string;
      avant: number;
      apres: number;
      raison: string;
    }>;
  };
  const memeJour = ancien.jour === jour;
  const quotas = [
    ...(memeJour ? (ancien.quotasBaisses ?? []) : []),
    ...quotasBaisses,
  ];
  // Dédup par compteId (garde le dernier).
  const parId = new Map(quotas.map((q) => [q.compteId, q]));
  const quotasMerged = [...parId.values()];
  const avertissement =
    quotasMerged.length > 0
      ? `Lowered quota (${quotasMerged.length}) — pool trop mince : ` +
        quotasMerged.map((q) => `${q.nom} ${q.avant}→${q.apres}`).join(" · ")
      : null;

  await supabase.from("reglages").upsert(
    {
      cle: "minuit_dernier_run",
      valeur: {
        jour,
        at: new Date().toISOString(),
        avertissement,
        quotasBaisses: quotasMerged,
        crees: (memeJour ? (ancien.crees ?? 0) : 0) + creesLot,
        ...meta,
      },
    },
    { onConflict: "cle" },
  );
}
