import {
  backfillSnapshotVuesJour,
  DRAIN_MAX_CHAIN_ELO,
  ecrireEloDernierRun,
  eloDrainBusyStale,
  eloDrainEstVerrouille,
  kickRattrapageElo,
  lireEloDernierRunReglage,
  rattrapageElo,
  rattrapageEloDrainLot,
  type EloDernierRun,
} from "../_shared/rattrapage_elo.ts";
import { assertAuthorised, json, messageErreur, serviceClient } from "../_shared/supabase.ts";

/**
 * Rattrapage ELO (admin / cron minuit / cron minute) — fenêtre Paris (défaut 4 jours) :
 *   1) stats TikTok des passages publiés (publie_url)
 *   2) ELO langue en deltas ↑/↓ (vues seules), idempotent
 *   3) snapshot vues_globales_jour (fin de drain + tous les 10 comptes)
 *   4) fin de file : requalification du classement des comptes (INACTIF → STAR),
 *      sur les vues qui viennent d'être relevées
 *
 * Contourne PAUSE_ELO_RUNTIME.
 *
 *   {} | { drain: true }     → 1 compte / invoke ; reprend elo_dernier_run si !done
 *                              (cron `rattrapage-elo-drain` * * * * * = filet)
 *   { drain: true, offset }  → force le curseur (kick auto-chaîne)
 *   { restart: true }        → repart de offset 0 (minuit)
 *   { compteId, jours, forcer, dryRun }
 *   { snapshot: true }       → fige seulement vues_globales_jour
 *   { backfillJour: "YYYY-MM-DD" }
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
    if (typeof body?.backfillJour === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.backfillJour)) {
      const snapshot = await backfillSnapshotVuesJour(supabase, body.backfillJour);
      return json({ ok: true, snapshot, backfill: true });
    }

    const joursBody = typeof body?.jours === "number" ? body.jours : undefined;
    const forcer = Boolean(body?.forcer);
    const dryRun = Boolean(body?.dryRun);
    const compteId = body?.compteId ? String(body.compteId) : null;
    const restart = body?.restart === true || body?.restart === "true";
    // Cron minute envoie {} → drain mode. Kick minuit envoie drain:true.
    const drainExplicit = body?.drain === true || body?.drain === "true";
    const drain =
      drainExplicit ||
      restart ||
      (!compteId &&
        body?.snapshot !== true &&
        typeof body?.backfillJour !== "string" &&
        (body == null || Object.keys(body).length === 0));

    if (drain && !compteId) {
      const prev = await lireEloDernierRunReglage(supabase);

      // Idle (cron minute) : rien enfilé / déjà fini — ne lance PAS un drain spontané.
      // Minuit (ou restart) doit poser done=false pour ouvrir la file.
      if (!restart && body?.offset == null && (prev == null || prev.done === true)) {
        return json({
          ok: true,
          drain: true,
          idle: true,
          done: prev?.done === true,
          detail: prev?.done === true
            ? "drain ELO déjà terminé — rien à faire"
            : "aucun drain ELO enfilé — attente minuit",
          at: prev?.at ?? null,
        });
      }

      // Un autre worker (kick) est encore vivant → laisse-le finir.
      if (!restart && eloDrainEstVerrouille(prev) && !eloDrainBusyStale(prev)) {
        return json({
          ok: true,
          drain: true,
          busy: true,
          skipped: true,
          detail: "drain ELO déjà en cours (lock)",
          offset: prev?.offset ?? 0,
          at: prev?.at ?? null,
        });
      }

      const offset =
        typeof body?.offset === "number"
          ? Math.max(0, Math.floor(body.offset))
          : restart
            ? 0
            : Math.max(0, Math.floor(prev?.offset ?? 0));
      const drainGen = Math.max(0, Math.floor(Number(body?.drainGen) || 0));
      const jours = joursBody ?? (typeof prev?.jours === "number" ? prev.jours : 4);
      const source = String(body?.source ?? prev?.source ?? "cron");

      // Heartbeat AVANT le scrape — si timeout 150s, le cron minute reprend.
      const heartbeat: EloDernierRun = {
        ...(prev ?? {}),
        at: new Date().toISOString(),
        busy: true,
        drain: true,
        drainGen,
        offset,
        done: false,
        jours,
        source,
        kick: Boolean(prev?.kick),
        detail: `busy offset=${offset}`,
      };
      await ecrireEloDernierRun(supabase, heartbeat);

      let lot: Awaited<ReturnType<typeof rattrapageEloDrainLot>>;
      try {
        lot = await rattrapageEloDrainLot(supabase, {
          offset,
          jours,
          forcer,
          dryRun,
        });
      } catch (error) {
        // Libère le lock pour que le cron minute puisse retenter.
        await ecrireEloDernierRun(supabase, {
          ...heartbeat,
          at: new Date().toISOString(),
          busy: false,
          done: false,
          detail: `erreur lot: ${messageErreur(error)}`,
        });
        throw error;
      }

      const done = lot.restants === 0;
      await ecrireEloDernierRun(supabase, {
        at: new Date().toISOString(),
        busy: false,
        drain: true,
        drainGen,
        offset: lot.nextOffset,
        total: lot.total,
        traitesCumules: lot.nextOffset,
        restants: lot.restants,
        done,
        comptesLot: lot.comptes,
        erreurs: lot.erreurs,
        snapshot: lot.snapshot ?? null,
        classement: lot.classement
          ? {
            examines: lot.classement.examines,
            changes: lot.classement.changes,
            verrous: lot.classement.verrous,
            parCase: lot.classement.parCase,
          }
          : null,
        jours,
        source,
        kick: Boolean(prev?.kick),
        detail: done
          ? "drain terminé"
          : `ok · next=${lot.nextOffset}/${lot.total}`,
      });

      // Auto-chaîne rapide (filet = cron minute si waitUntil meurt).
      if (lot.restants > 0 && drainGen < DRAIN_MAX_CHAIN_ELO) {
        kickRattrapageElo(request, {
          drain: true,
          drainGen: drainGen + 1,
          offset: lot.nextOffset,
          jours,
          forcer,
          dryRun,
          source,
        });
      }

      return json({
        ok: true,
        drain: true,
        drainGen,
        traites: lot.traites,
        restants: lot.restants,
        nextOffset: lot.nextOffset,
        total: lot.total,
        comptes: lot.comptes,
        erreurs: lot.erreurs,
        snapshot: lot.snapshot,
        classement: lot.classement,
        kick: lot.restants > 0 && drainGen < DRAIN_MAX_CHAIN_ELO,
        done,
      });
    }

    const r = await rattrapageElo(supabase, {
      compteId,
      jours: joursBody,
      forcer,
      dryRun,
      snapshot: Boolean(body?.snapshot),
    });
    return json({ ok: true, ...r });
  } catch (error) {
    return json({ ok: false, error: messageErreur(error) }, 500);
  }
});
