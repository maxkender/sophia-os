import {
  assignerTousComptes,
  kickAssignationDrain,
  programmerRappelsJ7,
  type AssignationCompteResultat,
} from "../_shared/assignation_contenu.ts";
import { kickAssignationUgcVideo } from "../_shared/assignation_ugc_video.ts";
import { kickPapierCm } from "../_shared/papier_master.ts";
import { papierEstActif } from "../_shared/papier_reglages.ts";
import { scrapeStats } from "../_shared/apify.ts";
import {
  kickRattrapageElo,
  rattrapageElo,
  snapshotVuesGlobales,
} from "../_shared/rattrapage_elo.ts";
import { majScoresDepuisPassages } from "../_shared/scoring.ts";
import { requalifierContenus } from "../_shared/tierlist.ts";
import {
  kickUpscaleAssignes,
  listerMediasAssignesNonUpscales,
} from "../_shared/upscale_media_core.ts";
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
 *   2) REQUALIFICATION tierlist des contenus dont le cycle est terminé
 *   3) ASSIGNATION labels ∩ + budget de passages du rang + tirage au hasard
 *
 * Règles d'assignation (par compte actif, jour Paris) :
 *   - quota = posts_par_jour du compte (1–3, défaut 1 ; sinon réglage global)
 *   - non-écrasement : complète jusqu'au quota sans toucher aux passages déjà là
 *   - labels compte ∩ labels contenu requis
 *   - pool = contenus valide + import done + passages tierlist restants > 0
 *   - tirage au hasard dans le pool (le rang décide de la fréquence, pas d'un score)
 *   - préfère du jamais posté sur ce compte, mais un repassage est autorisé
 *   - pool épuisé → repêchage d'un contenu en D (+1 passage), par compte
 *   - deck : traduction + Sophia à la demande (assurerDeckPourLangue)
 *   - crée passages statut=assigne (musique + hashtags) estampillés du cycle
 *
 *   {}  → kick rattrapage (async) + tierlist + assignation + upscale + ugc
 *   { etapes?: ['stats'|'scores'|'tierlist'|'assignation'|'upscale'|'variations'|'rattrapage'|'ugc_ai_video'|'papier_cm'|'papier_assign'], compteId?, date?, forcer? }
 *   etape `tierlist` : requalification des contenus au bout de leurs passages
 *                      (m = moyenne des vues du cycle) + rappels J+7 des
 *                      passages au-delà de 50k vues
 *   etape `rattrapage` : stats 4j + ELO langue/compte + snapshot vues (contourne PAUSE_ELO_RUNTIME)
 *                        — kick async si tous comptes (évite timeout cron)
 *   etape `upscale` : SeedVR Fal sur photos assignées du jour sans upscale_le
 *                     (strip C2PA en fin dans le drain — pas de double strip)
 *   etape `ugc_ai_video` : kick drain assignation-ugc-video (NB→Kling→concat)
 *   etape `papier_cm` : plus de master du jour — original seulement si la bibliothèque est vide
   *   etape `papier_assign` : chaque CM tire au hasard un master FR inutilisé dans sa langue
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

    // Défaut : rattrapage ELO (vues + scores) en kick async — plus de scrape
    // synchrone « stats » qui faisait timeout Edge avant snapshot/assign.
    // scores runtime reste en pause (PAUSE_ELO_RUNTIME) ; le rattrapage contourne.
    // ugc_ai_video : TOUJOURS en dernier (après slideshow + upscale).
    const etapes: string[] = Array.isArray(body?.etapes)
      ? body.etapes
      : [
        "rattrapage",
        "tierlist",
        "assignation",
        "upscale",
        "ugc_ai_video",
        "papier_cm",
        "papier_assign",
      ];
    const jour = body?.date ?? aujourdhuiParis();
    const compteId: string | null = body?.compteId ?? null;

    const out: Record<string, unknown> = { ok: true, jour };

    if (etapes.includes("rattrapage")) {
      // Contourne PAUSE_ELO_RUNTIME — vues + ELO langue/compte + snapshot Pilotage.
      if (compteId) {
        // Compte isolé (manuel) : synchrone, résultat dans la réponse.
        out.rattrapage = await rattrapageElo(supabase, {
          compteId,
          jours: typeof body?.jours === "number" ? body.jours : undefined,
          forcer: Boolean(body?.forcerElo),
          dryRun: Boolean(body?.dryRun),
        });
      } else {
        // Tous comptes (cron minuit) : enqueue + kick 1 compte.
        // Filet durable : pg_cron `rattrapage-elo-drain` (* * * * *) reprend
        // tant que elo_dernier_run.done !== true (même si waitUntil meurt).
        const jours = typeof body?.jours === "number" ? body.jours : 4;
        const source = body?.manuel || body?.forcer ? "manuel" : "cron";
        await supabase.from("reglages").upsert(
          {
            cle: "elo_dernier_run",
            valeur: {
              at: new Date().toISOString(),
              kick: true,
              busy: false,
              drain: true,
              drainGen: 0,
              offset: 0,
              done: false,
              jours,
              source,
              detail: "enfilé par minuit — drain minute + kick",
            },
            updated_at: new Date().toISOString(),
          },
          { onConflict: "cle" },
        );
        kickRattrapageElo(request, {
          drain: true,
          restart: true,
          drainGen: 0,
          offset: 0,
          jours,
          forcer: Boolean(body?.forcerElo),
          dryRun: Boolean(body?.dryRun),
          source,
        });
        out.rattrapage = {
          ok: true,
          kick: true,
          drain: true,
          detail:
            "drain ELO enfilé (1 compte/tick + cron minute rattrapage-elo-drain → snapshot Pilotage)",
        };
      }
    } else if (etapes.includes("stats")) {
      // Chemin legacy / explicite (sans rattrapage).
      out.stats = await releverPassages(supabase, compteId);
      if (!compteId) {
        out.snapshotVues = await snapshotVuesGlobales(supabase);
      }
    }
    if (etapes.includes("scores")) {
      // No-op si PAUSE_ELO_RUNTIME (voir _shared/scoring.ts).
      out.scores = await majScoresDepuisPassages(supabase, { compteId });
    }
    if (etapes.includes("tierlist")) {
      // Requalification : les contenus qui ont fini leurs passages changent de
      // rang sur la moyenne des vues du cycle, et repartent avec le compteur
      // du nouveau rang. Un S+ débloque 3 remix (file `remix_debloques`).
      // Puis rappels J+7 des passages qui ont percé (> 50k vues).
      // Avant l'assignation : les nouveaux compteurs alimentent le pool du jour.
      out.tierlist = await requalifierContenus(supabase, {
        contenuId: body?.contenuId ?? null,
        dryRun: Boolean(body?.dryRun),
      });
      out.rappels = await programmerRappelsJ7(supabase, {
        dryRun: Boolean(body?.dryRun),
      });
    }
    if (etapes.includes("assignation")) {
      // Un seul compte : await synchrone. Tous les comptes : drain auto-chaîné
      // (évite timeout cron 280s qui laissait 50+ comptes sans post).
      if (compteId) {
        const resultats = await assignerTousComptes(
          supabase,
          jour,
          compteId,
          Boolean(body?.forcerAssignation),
        );
        out.assignation = resultats;
        const quotasBaisses = synthetiserQuotasBaisses(resultats);
        if (quotasBaisses.length > 0) {
          out.quotasBaisses = quotasBaisses;
          out.avertissement =
            `Lowered quota (${quotasBaisses.length}) — pool trop mince : ` +
            quotasBaisses
              .map((q) => `${q.nom} ${q.avant}→${q.apres}`)
              .join(" · ");
        }
        await supabase.from("reglages").upsert(
          {
            cle: "minuit_dernier_run",
            valeur: {
              jour,
              at: new Date().toISOString(),
              avertissement: (out.avertissement as string | undefined) ?? null,
              quotasBaisses,
              crees: resultats.reduce((n, r) => n + (r.crees ?? 0), 0),
            },
          },
          { onConflict: "cle" },
        );
      } else {
        kickAssignationDrain(request, {
          date: jour,
          drain: true,
          drainGen: 0,
          manuel: Boolean(body?.manuel || body?.forcer),
        });
        out.assignation = {
          ok: true,
          kick: true,
          drain: true,
          detail:
            "drain assignation démarré (lots de 8 comptes, auto-chaîne jusqu'à quota rempli)",
        };
      }
    }
    if (etapes.includes("upscale")) {
      // Ne bloque pas minuit : kick le drain SeedVR (1 à la fois + auto-chaîne).
      // Strip C2PA uniquement en fin d’upscale (dans upscale_media_core).
      const pending = await listerMediasAssignesNonUpscales(supabase, jour);
      if (pending.length > 0) {
        kickUpscaleAssignes(request, { date: jour });
      }
      out.upscale = {
        ok: true,
        kick: pending.length > 0,
        pending: pending.length,
        modele: "seedvr",
        detail:
          pending.length > 0
            ? `drain SeedVR démarré (${pending.length} photo(s)) — C2PA en fin`
            : "aucune photo assignée à upscaler",
      };
    }
    if (etapes.includes("variations")) {
      // Un candidat par passage minuit ; le drain `variations` en fait plus souvent.
      out.variations = await avancerVariations(supabase);
    }
    // Dernière étape : UGC AI VIDEO (Kling long → kick drain streamé).
    if (etapes.includes("ugc_ai_video")) {
      kickAssignationUgcVideo(request, {
        date: jour,
        ...(compteId ? { compteId } : {}),
        manuel: Boolean(body?.manuel || body?.forcer),
      });
      out.ugc_ai_video = {
        ok: true,
        kick: true,
        detail:
          "drain assignation-ugc-video démarré (Nano Banana → Kling → concat utilisation)",
      };
    }
    if (etapes.includes("papier_cm")) {
      out.papier_cm = {
        ok: true,
        saute: true,
        raison: "bibliothèque — un original naît seulement si plus aucun master libre",
      };
    }
    if (etapes.includes("papier_assign")) {
      if (!(await papierEstActif(supabase))) {
        out.papier_assign = { ok: true, saute: true, raison: "papier en pause" };
      } else {
        kickPapierCm(request, { action: "assigner", date: jour });
        out.papier_assign = {
          ok: true,
          kick: true,
          detail: "chaque CM tire au hasard un master FR inutilisé dans sa langue",
        };
      }
    }

    return json(out);
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
