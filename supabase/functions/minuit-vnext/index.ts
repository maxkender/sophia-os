import { assignerTousComptes } from "../_shared/assignation_contenu.ts";
import { scrapeStats } from "../_shared/apify.ts";
import { rattrapageElo, snapshotVuesGlobales } from "../_shared/rattrapage_elo.ts";
import { majScoresDepuisPassages } from "../_shared/scoring.ts";
import { avancerVariations } from "../_shared/variations.ts";
import {
  assertAuthorised,
  aujourdhuiParis,
  json,
  messageErreur,
  serviceClient,
} from "../_shared/supabase.ts";

type Supabase = ReturnType<typeof serviceClient>;

const POSTS_RELEVES = 30;

/**
 * Minuit v-next (manuel ou cron — l'heure importe peu) :
 *   1) FETCH stats des passages publiés (via publie_url) — optionnel
 *   2) MAJ ELO langue depuis stats — PAUSE (PAUSE_ELO_RUNTIME)
 *   3) ASSIGNATION labels ∩ + score langue (import) + top-K + softmax
 *
 * Règles d'assignation (par compte actif, jour Paris) :
 *   - quota = posts_par_jour du compte (1–3, défaut 1 ; sinon réglage global)
 *   - non-écrasement : complète jusqu'au quota sans toucher aux passages déjà là
 *   - labels compte ∩ labels contenu requis
 *   - pool = contenus valide + import done + ligne contenu_langues[langue du compte]
 *   - ranking = score langue − pénalité saturation (comptes distincts récents)
 *   - préfère jamais posté sur ce compte ; sinon le moins récent
 *   - tirage softmax top-K (température)
 *   - deck : traduction + Sophia à la demande (assurerDeckPourLangue)
 *   - crée passages statut=assigne (musique + hashtags)
 *
 *   {}  → stats + assignation (scores en pause) si moteur_vnext.actif
 *   { etapes?: ['stats'|'scores'|'assignation'|'variations'|'rattrapage'], compteId?, date?, forcer? }
 *   etape `rattrapage` : stats 4j + ELO langue (deltas) + ELO compte (contourne la pause)
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
    const { data: flag } = await supabase
      .from("reglages")
      .select("valeur")
      .eq("cle", "moteur_vnext")
      .maybeSingle();
    const actif = Boolean((flag?.valeur as { actif?: boolean } | null)?.actif);
    // forcer: true contourne le flag (tests admin)
    if (!actif && !body?.forcer) {
      return json({ ok: true, saute: true, raison: "moteur_vnext inactif" });
    }

    // Pause auto (réglage Pilotage) — manuel admin passe forcer / manuel.
    if (!body?.forcer && !body?.manuel) {
      const { data: pause } = await supabase
        .from("reglages")
        .select("valeur")
        .eq("cle", "assignation_auto")
        .maybeSingle();
      if ((pause?.valeur as { actif?: boolean } | null)?.actif === false) {
        return json({
          ok: true,
          saute: true,
          raison: "assignation_auto en pause",
        });
      }
    }

    // scores retiré du défaut tant que PAUSE_ELO_RUNTIME est true.
    const etapes: string[] = Array.isArray(body?.etapes)
      ? body.etapes
      : ["stats", "assignation"];
    const jour = body?.date ?? aujourdhuiParis();
    const compteId: string | null = body?.compteId ?? null;

    const out: Record<string, unknown> = { ok: true, jour };

    if (etapes.includes("stats")) {
      out.stats = await releverPassages(supabase, compteId);
      // Figé les vues globales (Pilotage Δ j0−j1) après le scrape de minuit.
      // Sur un run compte isolé, le rattrapage/snapshot dédié s'en charge.
      if (!compteId) {
        out.snapshotVues = await snapshotVuesGlobales(supabase);
      }
    }
    if (etapes.includes("scores")) {
      // No-op si PAUSE_ELO_RUNTIME (voir _shared/scoring.ts).
      out.scores = await majScoresDepuisPassages(supabase, { compteId });
    }
    if (etapes.includes("rattrapage")) {
      // Contourne PAUSE_ELO_RUNTIME — chemin volontaire de reprise ELO.
      // Inclut déjà snapshotVuesGlobales sur run tous comptes.
      out.rattrapage = await rattrapageElo(supabase, {
        compteId,
        jours: typeof body?.jours === "number" ? body.jours : undefined,
        forcer: Boolean(body?.forcerElo),
        dryRun: Boolean(body?.dryRun),
      });
    }
    if (etapes.includes("assignation")) {
      out.assignation = await assignerTousComptes(
        supabase,
        jour,
        compteId,
        Boolean(body?.forcerAssignation),
      );
    }
    if (etapes.includes("variations")) {
      // Un candidat par passage minuit ; le drain `variations` en fait plus souvent.
      out.variations = await avancerVariations(supabase);
    }

    return json(out);
  } catch (error) {
    return json({ ok: false, error: messageErreur(error) }, 500);
  }
});

async function releverPassages(
  supabase: Supabase,
  compteId: string | null,
): Promise<Array<{ compteId: string; releves: number; erreur?: string }>> {
  let query = supabase
    .from("comptes")
    .select("id, handle_tiktok")
    .eq("is_active", true)
    .not("handle_tiktok", "is", null);
  if (compteId) query = query.eq("id", compteId);

  const { data: comptes, error } = await query;
  if (error) throw error;

  const resultats: Array<{ compteId: string; releves: number; erreur?: string }> = [];

  for (const compte of comptes ?? []) {
    try {
      const releves = await releverComptePassages(
        supabase,
        compte.id,
        compte.handle_tiktok!,
      );
      resultats.push({ compteId: compte.id, releves });
    } catch (e) {
      resultats.push({
        compteId: compte.id,
        releves: 0,
        erreur: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return resultats;
}

async function releverComptePassages(
  supabase: Supabase,
  compteId: string,
  handle: string,
): Promise<number> {
  const enLigne = await scrapeStats(handle, POSTS_RELEVES);

  // Total profil → compte_metrics (alimente le snapshot Pilotage j0−j1).
  if (enLigne.length > 0) {
    const somme = (f: (s: (typeof enLigne)[number]["stats"]) => number) =>
      enLigne.reduce((n, p) => n + (f(p.stats) || 0), 0);
    await supabase.from("compte_metrics").insert({
      compte_id: compteId,
      vues: somme((s) => s.vues),
      likes: somme((s) => s.likes),
      commentaires: somme((s) => s.commentaires),
      partages: somme((s) => s.partages),
      nb_posts: enLigne.length,
    });
  }

  const { data: passages } = await supabase
    .from("passages")
    .select("id, publie_url")
    .eq("compte_id", compteId)
    .eq("statut", "publie")
    .not("publie_url", "is", null);

  if (!passages || passages.length === 0) return 0;

  const idDuLien = (url: string) => url.match(/\/(?:photo|video)\/(\d+)/)?.[1] ?? url;
  const parId = new Map(enLigne.map((p) => [idDuLien(p.webVideoUrl), p.stats]));

  let releves = 0;
  for (const passage of passages) {
    const complet = await resoudreLien(passage.publie_url!);
    const stats = parId.get(idDuLien(complet));
    if (!stats) continue;

    await supabase
      .from("passages")
      .update({
        vues: stats.vues,
        likes: stats.likes,
        commentaires: stats.commentaires,
        partages: stats.partages,
        stats_maj_at: new Date().toISOString(),
      })
      .eq("id", passage.id);
    releves += 1;
  }
  return releves;
}

async function resoudreLien(url: string): Promise<string> {
  if (!/\/\/(?:vm|vt)\.tiktok\.com/i.test(url)) return url;
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",
      },
    });
    return res.url || url;
  } catch {
    return url;
  }
}
