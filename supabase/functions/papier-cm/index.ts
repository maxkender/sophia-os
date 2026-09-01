/**
 * Bibliothèque de masters papier FR + localisation à l'assignation.
 * Auth : JWT admin ou x-cron-secret.
 *
 *   tick | assurer | relancer | regenerer | voix
 *   proposer_topic | valider | arreter | regenerer_partie
 *   tick_locales (FR, ou une langue demandée) | relancer_langue
 *   assigner | annuler_test
 */

import {
  assignerPapierComptes,
  preparerAssignationPapierTest,
  supprimerPapierPostsTest,
} from "../_shared/papier_assignation.ts";
import { papierEstActif } from "../_shared/papier_reglages.ts";
import {
  assurerLangueMaster,
  avancerLangue,
  changerVoixMaster,
  relancerLangue,
} from "../_shared/papier_locales.ts";
import {
  avancerMaster,
  arreterMaster,
  kickPapierCm,
  masterEnCoursOuNouveau,
  regenererMaster,
  regenererPartieMaster,
  relancerMaster,
  tickPapierJour,
  validerEtapeMaster,
} from "../_shared/papier_master.ts";
import { proposerTopicPapier } from "../_shared/papier_script.ts";
import { chargerReglagesPapier } from "../_shared/papier_reglages.ts";
import { normaliserCategorie } from "../_shared/papier_sujets.ts";
import { resoudreApplication } from "../_shared/applications.ts";
import { assertAuthorised, json, messageErreur, serviceClient } from "../_shared/supabase.ts";

type Tick = {
  done?: boolean;
  idle?: boolean;
  statut?: string;
  kick?: boolean;
  masterId?: string;
  langueId?: string;
  langue?: string;
};

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

  const action = String(body?.action ?? "tick");
  const manuel = Boolean(body?.manuel || body?.forcer);

  try {
    if (!manuel && (action === "tick" || action === "tick_locales")) {
      if (!(await papierEstActif(supabase))) {
        return json({ ok: true, saute: true, idle: true, raison: "papier en pause" });
      }
    }

    if (action === "assigner") {
      const opts = {
        date: typeof body?.date === "string" ? body.date : undefined,
        masterId: typeof body?.masterId === "string" ? body.masterId : undefined,
        langueId: typeof body?.langueId === "string" ? body.langueId : undefined,
        fenetreJours: typeof body?.fenetreJours === "number" ? body.fenetreJours : undefined,
        compteId: typeof body?.compteId === "string" ? body.compteId : undefined,
        test: Boolean(body?.test),
      };
      if (opts.test) {
        const prep = await preparerAssignationPapierTest(supabase, opts);
        if (prep.langueId && !prep.ready && prep.masterId) {
          kickPapierCm(request, {
            action: "tick_locales",
            manuel: true,
            masterId: prep.masterId,
            langueId: prep.langueId,
          });
        }
      }
      const out = await assignerPapierComptes(supabase, opts);
      for (const langueId of out.kicksLangue ?? []) {
        kickPapierCm(request, { action: "tick_locales", manuel: true, langueId });
      }
      if (out.besoinOriginal) {
        kickPapierCm(request, { action: "assurer", manuel: Boolean(opts.test) || manuel });
      }
      return json(out);
    }

    if (action === "annuler_test") {
      const compteId = String(body?.compteId ?? "");
      if (!compteId) return json({ ok: false, error: "compteId requis" }, 400);
      const out = await supprimerPapierPostsTest(supabase, {
        compteId,
        date: typeof body?.date === "string" ? body.date : undefined,
      });
      return json(out);
    }

    if (action === "tick_locales") {
      if (typeof body?.langueId === "string" && body.langueId) {
        const tick = await avancerLangue(supabase, body.langueId);
        return json(enchainer(request, tick, tick.masterId));
      }
      const masterId = String(body?.masterId ?? "");
      if (!masterId) return json({ ok: false, error: "masterId requis" }, 400);
      const fr = await assurerLangueMaster(supabase, masterId, "fr");
      const tick = await avancerLangue(supabase, fr.id);
      return json(enchainer(request, tick, masterId));
    }

    if (action === "relancer_langue") {
      const id = String(body?.id ?? "");
      if (!id) return json({ ok: false, error: "id requis" }, 400);
      const row = await relancerLangue(supabase, id);
      if (row.statut === "ready") {
        if (row.langue !== "fr") {
          kickPapierCm(request, { action: "assigner" });
        }
        return json({ ok: true, done: true, langueId: id, statut: "ready" });
      }
      const tick = await avancerLangue(supabase, id);
      return json(enchainer(request, tick, row.master_id));
    }

    if (action === "voix") {
      const id = String(body?.id ?? "");
      const voice = String(body?.voice ?? "");
      if (!id) return json({ ok: false, error: "id requis" }, 400);
      const out = await changerVoixMaster(supabase, id, voice);
      if (out.rebuildFr && out.langueId) {
        kickPapierCm(request, { action: "tick_locales", manuel: true, langueId: out.langueId });
        return json({ ...out, kick: true });
      }
      return json(out);
    }

    if (action === "proposer_topic") {
      const reglages = await chargerReglagesPapier(supabase);
      const { data: recents } = await supabase
        .from("papier_masters")
        .select("topic")
        .not("topic", "is", null)
        .order("date_publication", { ascending: false })
        .limit(14);
      const topic = await proposerTopicPapier({
        style:
          typeof body?.narration_style === "string" ? body.narration_style : reglages.narration_style,
        categorie: normaliserCategorie(body?.topic_categorie ?? reglages.topic_categorie),
        recents: (recents ?? [])
          .map((r) => String((r as { topic?: string }).topic ?? "").trim())
          .filter(Boolean),
      });
      return json({ ok: true, topic });
    }

    if (action === "arreter") {
      const id = String(body?.id ?? body?.masterId ?? "");
      if (!id) return json({ ok: false, error: "id requis" }, 400);
      const master = await arreterMaster(supabase, id);
      return json({ ok: true, done: true, kick: false, masterId: id, statut: master.statut });
    }

    if (action === "valider") {
      const id = String(body?.id ?? body?.masterId ?? "");
      if (!id) return json({ ok: false, error: "id requis" }, 400);
      const master = await validerEtapeMaster(supabase, id, {
        topic: typeof body?.topic === "string" ? body.topic : undefined,
      });
      const tick = await avancerMaster(supabase, master.id);
      return json({ ok: true, masterId: master.id, ...enchainer(request, tick, master.id) });
    }

    if (action === "assurer") {
      const app = await resoudreApplication(supabase, body ?? {});
      const master = await masterEnCoursOuNouveau(supabase, {
        date: typeof body?.date === "string" ? body.date : undefined,
        topic: typeof body?.topic === "string" ? body.topic : undefined,
        voice: typeof body?.voice === "string" ? body.voice : undefined,
        applicationId: app.id,
        topicCategorie: typeof body?.topic_categorie === "string" ? body.topic_categorie : undefined,
        narrationStyle: typeof body?.narration_style === "string" ? body.narration_style : undefined,
        pipelineMode: typeof body?.pipeline_mode === "string" ? body.pipeline_mode : undefined,
        dureeCibleSec: typeof body?.duree_cible_sec === "number" ? body.duree_cible_sec : undefined,
        validerTopic: Boolean(body?.valider_topic),
      });
      const tick = await avancerMaster(supabase, master.id);
      return json({ ok: true, masterId: master.id, ...enchainer(request, tick, master.id) });
    }

    if (action === "relancer") {
      const id = String(body?.id ?? "");
      if (!id) return json({ ok: false, error: "id requis" }, 400);
      const master = await relancerMaster(supabase, id);
      if (master.statut === "ready") {
        return json({ ok: true, done: true, statut: "ready", masterId: id });
      }
      const tick = await avancerMaster(supabase, id);
      return json({ ok: true, ...enchainer(request, tick, id) });
    }

    if (action === "regenerer") {
      const id = String(body?.id ?? "");
      if (!id) return json({ ok: false, error: "id requis" }, 400);
      const master = await regenererMaster(
        supabase,
        id,
        typeof body?.topic === "string" ? body.topic : undefined,
      );
      const tick = await avancerMaster(supabase, master.id);
      return json({ ok: true, ...enchainer(request, tick, master.id) });
    }

    if (action === "regenerer_partie") {
      const id = String(body?.id ?? body?.masterId ?? "");
      if (!id) return json({ ok: false, error: "id requis" }, 400);
      const master = await regenererPartieMaster(supabase, id, body?.partie);
      const tick = await avancerMaster(supabase, master.id);
      return json({ ok: true, ...enchainer(request, tick, master.id) });
    }

    const tick = await tickPapierJour(supabase, {
      date: typeof body?.date === "string" ? body.date : undefined,
      topic: typeof body?.topic === "string" ? body.topic : undefined,
      masterId: typeof body?.masterId === "string" ? body.masterId : undefined,
      voice: typeof body?.voice === "string" ? body.voice : undefined,
      topicCategorie: typeof body?.topic_categorie === "string" ? body.topic_categorie : undefined,
      narrationStyle: typeof body?.narration_style === "string" ? body.narration_style : undefined,
      pipelineMode: typeof body?.pipeline_mode === "string" ? body.pipeline_mode : undefined,
      dureeCibleSec: typeof body?.duree_cible_sec === "number" ? body.duree_cible_sec : undefined,
    });
    return json(enchainer(request, tick, tick.masterId));
  } catch (error) {
    return json({ ok: false, error: messageErreur(error) }, 500);
  }
});

function enchainer(request: Request, tick: Tick, masterId?: string) {
  const id = masterId ?? tick.masterId;
  if (!id || tick.idle || tick.kick === false) return tick;

  if (tick.langueId) {
    if (!tick.done && tick.statut !== "failed") {
      kickPapierCm(request, { action: "tick_locales", masterId: id, langueId: tick.langueId });
      return { ...tick, kick: true };
    }
    if (tick.done && tick.statut === "ready" && tick.langue && tick.langue !== "fr") {
      kickPapierCm(request, { action: "assigner" });
      return { ...tick, kick: true };
    }
    return tick;
  }

  if (!tick.done && tick.statut !== "failed") {
    kickPapierCm(request, { masterId: id });
    return { ...tick, kick: true };
  }
  if (tick.done && tick.statut === "clips") {
    kickPapierCm(request, { action: "tick_locales", masterId: id });
    return { ...tick, kick: true };
  }
  return tick;
}
