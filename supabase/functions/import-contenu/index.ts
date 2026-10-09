import {
  avancerImport,
  claimContenu,
  claimImportFile,
  eloParLangue,
  enqueueImportUrls,
  forcerImportElo,
  importerCompteReference,
  importerLien,
  lirePisteSource,
  lireScoring,
  listerUrlsCompteReference,
  MAX_TENTATIVES_IMPORT,
  prochainContenu,
  statsImportBatch,
  STATUTS_REPRENABLES,
  traiterImportFile,
} from "../_shared/import_contenu.ts";
import { scoreRelevance } from "../_shared/gemini.ts";
import {
  etatBackfillPertinence,
  piloterBackfillPertinence,
  tickBackfillPertinence,
} from "../_shared/pertinence_apps.ts";
import {
  annulerMajSources,
  demarrerMajSources,
  lireMajSourcesRun,
  tickMajSources,
} from "../_shared/maj_sources.ts";
import { assertAuthorised, json, messageErreur, serviceClient } from "../_shared/supabase.ts";

/**
 * Import pré-calculé v-next — orchestration serveur :
 *
 *   { enqueueCompte: true, compteReferenceId, nouveauxSeulement? } → liste + file import_file
 *   { enqueueUrls: true, urls, compteReferenceId?, labelIds?, batchId? }
 *   { postUrl, ... } → enqueue 1 URL (ou scrape immédiat si scrapeNow)
 *   { worker: true } → claim 1 file OU 1 contenu, traite, rechaîne si file non vide
 *   { majSourcesDemarrer, comptes } → séquence persistée, 1 compte, file vidée entre chaque
 *   { majSourcesAnnuler: true } / { majSourcesEtat: true } / { majSourcesTick: true }
 *   { backfillPertinence: { applicationId, actif } } → rattrapage de pertinence
 *     d'une application sur le stock (jamais Sophia), drainé par les workers oisifs
 *   { etatBackfillPertinence: { applicationId } } → actif, restants, faits, erreurs
 *   { contenuId } / {} → un pas (compat)
 *   { batchId, stats: true } → progression batch
 *
 * Les workers cron (×12 / min) + auto-chaînage Edge drainent sans le navigateur.
 * La séquence « update all » vit dans reglages : fermer l'onglet ne l'arrête pas.
 *
 * `application_id` dans le corps : encore envoyé par l'ancien front, ignoré.
 * L'import n'est plus rattaché à une application (ce sont les labels du
 * contenu qui disent quelles applications il sert).
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
    // corps vide
  }

  try {
    if (body?.stats && body?.batchId) {
      const s = await statsImportBatch(supabase, String(body.batchId));
      return json({ ok: true, ...s });
    }

    if (body?.majSourcesEtat) {
      const etat = await lireMajSourcesRun(supabase);
      return json({ ok: true, etat });
    }

    if (body?.majSourcesAnnuler) {
      const etat = await annulerMajSources(supabase);
      return json({ ok: true, etat });
    }

    if (body?.majSourcesTick) {
      const tick = await tickMajSources(supabase);
      if (tick.more) kickWorkers(request, 1);
      return json({ ok: true, ...tick });
    }

    if (body?.majSourcesDemarrer && Array.isArray(body.comptes)) {
      const comptes = (body.comptes as Array<{ id?: string; handle?: string; langue?: string }>)
        .map((c) => ({
          id: String(c.id ?? ""),
          handle: String(c.handle ?? ""),
          langue: String(c.langue ?? ""),
        }))
        .filter((c) => c.id && c.handle);
      const r = await demarrerMajSources(supabase, comptes);
      const tick = await tickMajSources(supabase);
      if (tick.more) kickWorkers(request, AMORCE_WORKERS);
      return json({ ok: true, deja: r.deja, etat: tick.etat ?? r.etat });
    }

    // Rattrapage de pertinence d'une application (Pilotage → Applications).
    if (body?.backfillPertinence && typeof body.backfillPertinence === "object") {
      const actif = Boolean(body.backfillPertinence.actif);
      const r = await piloterBackfillPertinence(
        supabase,
        String(body.backfillPertinence.applicationId ?? ""),
        actif,
      );
      if (!r.ok) return json({ ok: false, error: r.erreur }, 400);
      if (actif) kickWorkers(request, 1);
      return json({ ok: true, etat: r.etat });
    }

    if (body?.etatBackfillPertinence && typeof body.etatBackfillPertinence === "object") {
      const r = await etatBackfillPertinence(
        supabase,
        String(body.etatBackfillPertinence.applicationId ?? ""),
      );
      if (!r.ok) return json({ ok: false, error: r.erreur }, 400);
      return json({ ok: true, etat: r.etat });
    }

    // Relance manuelle : boost ELO au seuil puis file nettoyage.
    if (body?.forcerElo && body?.contenuId) {
      const r = await forcerImportElo(supabase, String(body.contenuId));
      if (!r.ok) return json({ ok: false, error: r.erreur }, 400);
      kickWorkers(request, 2);
      return json({ ok: true, contenuId: String(body.contenuId), elo: r.elo, langues: r.langues });
    }

    // Enfile toutes les URLs d'un compte (listing rapide, pas de scrape lourd).
    if (body?.enqueueCompte && body?.compteReferenceId) {
      const compteId = String(body.compteReferenceId);
      const listed = await listerUrlsCompteReference(supabase, compteId, {
        nouveauxSeulement: Boolean(body.nouveauxSeulement),
        marquerScrape: true,
      });
      // Langue explicite, sinon celle du compte source.
      let langue: string | null =
        typeof body.langue === "string" ? body.langue : null;
      if (!langue) {
        const { data: ref } = await supabase
          .from("comptes_reference")
          .select("langue")
          .eq("id", compteId)
          .maybeSingle();
        langue = (ref?.langue as string | null) ?? null;
      }
      const r = await enqueueImportUrls(supabase, {
        urls: listed.urls,
        compteReferenceId: compteId,
        labelIds: Array.isArray(body.labelIds) ? body.labelIds : [],
        batchId: body.batchId ? String(body.batchId) : null,
        langue,
      });
      // Kick immédiat de workers (ne dépend pas du cron pour démarrer).
      kickWorkers(request, AMORCE_WORKERS);
      return json({
        ok: true,
        handle: listed.handle,
        total: listed.total,
        connus: listed.connus,
        manquants: listed.manquants,
        nouveaux: listed.nouveaux,
        source: listed.source,
        diagnostic: listed.diagnostic,
        batchId: r.batchId,
        enqueued: r.enqueued,
        skipped: r.skipped,
        invalides: r.invalides.length,
        langue,
      });
    }

    if (body?.enqueueUrls && Array.isArray(body.urls)) {
      const r = await enqueueImportUrls(supabase, {
        urls: body.urls.map(String),
        compteReferenceId: body.compteReferenceId ?? null,
        labelIds: Array.isArray(body.labelIds) ? body.labelIds : [],
        batchId: body.batchId ? String(body.batchId) : null,
        langue: typeof body.langue === "string" ? body.langue : null,
      });
      kickWorkers(request, Math.min(AMORCE_WORKERS, Math.max(1, r.enqueued)));
      return json({ ok: true, ...r });
    }

    // Worker : 1 scrape OU 1 pas de pipeline, puis rechaîne si encore du travail.
    if (body?.worker) {
      const result = await runWorker(supabase);
      if (result.more) {
        // Le worker se remplace, il ne se duplique pas : à 2 la file se
        // dédoublait à chaque pas et saturait les Edge Functions (tout le reste
        // se mettait alors à répondre « Failed to send a request »).
        kickWorkers(request, 1);
      }
      return json({ ok: true, ...result });
    }

    // Entrée : lien isolé → enqueue (serveur drain) sauf scrapeNow
    if (body?.postUrl) {
      const langue = typeof body.langue === "string" ? body.langue : null;
      if (body.scrapeNow) {
        const cree = await importerLien(
          supabase,
          String(body.postUrl),
          body.compteReferenceId ?? null,
          Array.isArray(body.labelIds) ? body.labelIds : null,
          langue,
        );
        const contenu = await prochainContenu(supabase, cree.id);
        if (!contenu) {
          return json({ ok: true, contenuId: cree.id, reused: cree.reused, idle: true });
        }
        const r = await avancerImport(supabase, contenu);
        return json({
          ok: true,
          contenuId: cree.id,
          reused: cree.reused,
          etape: r.etape,
          elo: r.elo ?? null,
          nettoyage: r.nettoyage ?? null,
          captions: r.captions ?? null,
        });
      }
      const r = await enqueueImportUrls(supabase, {
        urls: [String(body.postUrl)],
        compteReferenceId: body.compteReferenceId ?? null,
        labelIds: Array.isArray(body.labelIds) ? body.labelIds : [],
        langue,
      });
      if (r.invalides.length > 0) {
        return json(
          {
            ok: false,
            error:
              "Ce lien ne pointe pas vers un slideshow : colle l'URL d'un post (…/photo/… ou …/video/…), pas celle d'un profil.",
          },
          400,
        );
      }
      kickWorkers(request, 2);
      return json({ ok: true, batchId: r.batchId, enqueued: r.enqueued, skipped: r.skipped });
    }

    if (body?.compteReferenceId && body?.lister) {
      const r = await listerUrlsCompteReference(supabase, String(body.compteReferenceId));
      return json({
        ok: true,
        handle: r.handle,
        urls: r.urls,
        total: r.total,
        connus: r.connus,
        manquants: r.manquants,
        nouveaux: r.nouveaux,
        source: r.source,
        diagnostic: r.diagnostic,
      });
    }

    if (body?.compteReferenceId && body?.scrape) {
      const r = await importerCompteReference(supabase, String(body.compteReferenceId));
      return json({ ok: true, crees: r.crees, ids: r.ids, scrapes: r.scrapes });
    }

    // Compat : un pas ciblé ou prochain contenu
    const contenuId: string | null = body?.contenuId ?? null;
    let contenu = contenuId
      ? await prochainContenu(supabase, contenuId)
      : await claimContenu(supabase);

    if (!contenu && !contenuId) {
      contenu = await prochainBackfill(supabase);
    }

    if (!contenu) return json({ ok: true, idle: true });

    const r = await avancerImport(supabase, contenu);
    await supabase
      .from("contenus")
      .update({ import_lease_until: null })
      .eq("id", contenu.id);

    return json({
      ok: true,
      contenuId: contenu.id,
      etape: r.etape,
      elo: r.elo ?? null,
      nettoyage: r.nettoyage ?? null,
      captions: r.captions ?? null,
    });
  } catch (error) {
    return json({ ok: false, error: messageErreur(error) }, 500);
  }
});

async function continuer(
  supabase: ReturnType<typeof serviceClient>,
  extra: {
    action: string;
    contenuId?: string;
    etape?: string;
    fileId?: string;
    error?: string;
    elo?: unknown;
  },
): Promise<{
  action: string;
  more: boolean;
  contenuId?: string;
  etape?: string;
  fileId?: string;
  error?: string;
}> {
  if (await hasMoreWork(supabase)) return { ...extra, more: true };
  const tick = await tickMajSources(supabase);
  return { ...extra, more: tick.more };
}

async function runWorker(
  supabase: ReturnType<typeof serviceClient>,
): Promise<{
  action: string;
  more: boolean;
  contenuId?: string;
  etape?: string;
  fileId?: string;
  error?: string;
}> {
  // Priorité scrape (créer de la matière) puis drain pipeline.
  const file = await claimImportFile(supabase);
  if (file) {
    const r = await traiterImportFile(supabase, file);
    if (!r.ok) {
      return continuer(supabase, {
        action: r.reporte ? "scrape_reporte" : "scrape_failed",
        fileId: file.id,
        error: r.erreur,
      });
    }
    return continuer(supabase, {
      action: "scrape",
      fileId: file.id,
      contenuId: r.contenuId,
    });
  }

  const contenu = await claimContenu(supabase);
  if (!contenu) {
    const backfill = await prochainBackfill(supabase);
    if (!backfill) {
      // Rien d'autre à faire : rattrapage de pertinence d'une application (si
      // une campagne est allumée), puis la mise à jour des sources. Une panne
      // du rattrapage ne doit pas priver la séquence des sources de son tick.
      const pertinence = await tickBackfillPertinence(supabase, {
        scoreRelevance,
        lireScoring: () => lireScoring(supabase),
        noteImport: eloParLangue,
        // Même note qu'à l'étape 4 : piste du compte source comprise.
        lirePisteSource: (id) => lirePisteSource(supabase, id),
      }).catch((error) => {
        console.warn(`[backfill pertinence] ${messageErreur(error)}`);
        return null;
      });
      if (pertinence) return { action: pertinence.action, more: pertinence.more };
      const tick = await tickMajSources(supabase);
      return { action: tick.action, more: tick.more };
    }
    const r = await avancerImport(supabase, backfill);
    await supabase
      .from("contenus")
      .update({ import_lease_until: null })
      .eq("id", backfill.id);
    return continuer(supabase, {
      action: "backfill",
      contenuId: backfill.id,
      etape: r.etape,
    });
  }

  const r = await avancerImport(supabase, contenu);
  await supabase
    .from("contenus")
    .update({ import_lease_until: null })
    .eq("id", contenu.id);

  return continuer(supabase, {
    action: "pipeline",
    contenuId: contenu.id,
    etape: r.etape,
    ...(r.elo ? { elo: r.elo } : {}),
  });
}

async function hasMoreWork(
  supabase: ReturnType<typeof serviceClient>,
): Promise<boolean> {
  const now = new Date().toISOString();
  const [{ count: files }, { count: contenus }] = await Promise.all([
    // Même filtre que le claim, bail compris : sinon un worker se rechaîne
    // indéfiniment sur des lignes reportées qu'il ne peut pas prendre.
    supabase
      .from("import_file")
      .select("id", { count: "exact", head: true })
      .in("statut", STATUTS_REPRENABLES)
      .lt("tentatives", MAX_TENTATIVES_IMPORT)
      .or(`lease_until.is.null,lease_until.lt."${now}"`),
    supabase
      .from("contenus")
      .select("id", { count: "exact", head: true })
      .in("import_statut", ["pending", "running", "failed"])
      .or(`import_lease_until.is.null,import_lease_until.lt."${now}"`),
  ]);
  return (files ?? 0) + (contenus ?? 0) > 0;
}

/**
 * Workers amorcés à l'enfilage. La largeur vient surtout du cron (12/min) : en
 * amorcer trop ici, multiplié par le nombre de comptes mis à jour d'un coup,
 * dépasse la concurrence Edge et fait échouer les appels des autres pages.
 */
const AMORCE_WORKERS = 3;

/** Déclenche N workers en parallèle — fire-and-forget (pas d'attente). */
function kickWorkers(request: Request, n: number): void {
  const url = Deno.env.get("SUPABASE_URL");
  if (!url) return;
  const secret = Deno.env.get("CRON_SECRET");
  const auth = request.headers.get("Authorization");
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (secret) headers["x-cron-secret"] = secret;
  else if (auth) headers.Authorization = auth;

  const target = `${url}/functions/v1/import-contenu`;
  const edge = (globalThis as {
    EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void };
  }).EdgeRuntime;

  for (let i = 0; i < Math.max(1, n); i += 1) {
    const p = fetch(target, {
      method: "POST",
      headers,
      body: JSON.stringify({ worker: true }),
    }).catch(() => null);
    if (edge?.waitUntil) edge.waitUntil(p);
  }
}

/**
 * Remet en file un contenu valide auquel il manque le deck SOURCE (OCR).
 * Sophia + traductions → assignation minuit ; pas de backfill ici.
 */
async function prochainBackfill(
  supabase: ReturnType<typeof serviceClient>,
  // deno-lint-ignore no-explicit-any
): Promise<any | null> {
  const { data: candidats } = await supabase
    .from("contenus")
    .select("id, langue_source")
    .eq("statut", "valide")
    .eq("import_statut", "done")
    .order("created_at")
    .limit(20);

  for (const c of candidats ?? []) {
    const { data: source } = await supabase
      .from("contenu_langues")
      .select("langue, slides")
      .eq("contenu_id", c.id)
      .eq("langue", c.langue_source)
      .maybeSingle();

    const slides = (source?.slides ?? []) as Array<{
      texte_overlay?: string;
      position_sophia?: boolean;
    }>;
    const manque = slides.length === 0 || slides.every((s) => !s.texte_overlay);

    if (!manque) continue;

    await supabase
      .from("contenus")
      .update({
        import_statut: "pending",
        import_etape: "backfill",
        import_erreur: null,
      })
      .eq("id", c.id);

    const { data: full } = await supabase.from("contenus").select("*").eq("id", c.id).single();
    return full;
  }
  return null;
}
