import {
  avancerImport,
  claimContenu,
  claimImportFile,
  enqueueImportUrls,
  importerCompteReference,
  importerLien,
  listerUrlsCompteReference,
  prochainContenu,
  statsImportBatch,
  traiterImportFile,
} from "../_shared/import_contenu.ts";
import { assertAuthorised, json, messageErreur, serviceClient } from "../_shared/supabase.ts";

/**
 * Import pré-calculé v-next — orchestration serveur :
 *
 *   { enqueueCompte: true, compteReferenceId } → liste + file import_file
 *   { enqueueUrls: true, urls, compteReferenceId?, labelIds?, batchId? }
 *   { postUrl, ... } → enqueue 1 URL (ou scrape immédiat si scrapeNow)
 *   { worker: true } → claim 1 file OU 1 contenu, traite, rechaîne si file non vide
 *   { contenuId } / {} → un pas (compat)
 *   { batchId, stats: true } → progression batch
 *
 * Les workers cron (×12 / min) + auto-chaînage Edge drainent sans le navigateur.
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

    // Enfile toutes les URLs d'un compte (listing rapide, pas de scrape lourd).
    if (body?.enqueueCompte && body?.compteReferenceId) {
      const listed = await listerUrlsCompteReference(
        supabase,
        String(body.compteReferenceId),
      );
      const r = await enqueueImportUrls(supabase, {
        urls: listed.urls,
        compteReferenceId: String(body.compteReferenceId),
        labelIds: Array.isArray(body.labelIds) ? body.labelIds : [],
        batchId: body.batchId ? String(body.batchId) : null,
      });
      // Kick immédiat de workers (ne dépend pas du cron pour démarrer).
      kickWorkers(request, 10);
      return json({
        ok: true,
        handle: listed.handle,
        total: listed.total,
        connus: listed.connus,
        source: listed.source,
        batchId: r.batchId,
        enqueued: r.enqueued,
        skipped: r.skipped,
      });
    }

    if (body?.enqueueUrls && Array.isArray(body.urls)) {
      const r = await enqueueImportUrls(supabase, {
        urls: body.urls.map(String),
        compteReferenceId: body.compteReferenceId ?? null,
        labelIds: Array.isArray(body.labelIds) ? body.labelIds : [],
        batchId: body.batchId ? String(body.batchId) : null,
      });
      kickWorkers(request, Math.min(10, Math.max(2, r.enqueued)));
      return json({ ok: true, ...r });
    }

    // Worker : 1 scrape OU 1 pas de pipeline, puis rechaîne si encore du travail.
    if (body?.worker) {
      const result = await runWorker(supabase);
      if (result.more) {
        // Auto-chaîne (survit à la fermeture du navigateur).
        kickWorkers(request, 2);
      }
      return json({ ok: true, ...result });
    }

    // Entrée : lien isolé → enqueue (serveur drain) sauf scrapeNow
    if (body?.postUrl) {
      if (body.scrapeNow) {
        const cree = await importerLien(
          supabase,
          String(body.postUrl),
          body.compteReferenceId ?? null,
          Array.isArray(body.labelIds) ? body.labelIds : null,
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
        });
      }
      const r = await enqueueImportUrls(supabase, {
        urls: [String(body.postUrl)],
        compteReferenceId: body.compteReferenceId ?? null,
        labelIds: Array.isArray(body.labelIds) ? body.labelIds : [],
      });
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
        source: r.source,
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
    });
  } catch (error) {
    return json({ ok: false, error: messageErreur(error) }, 500);
  }
});

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
    const more = await hasMoreWork(supabase);
    if (!r.ok) {
      return { action: "scrape_failed", more, fileId: file.id, error: r.erreur };
    }
    return {
      action: "scrape",
      more,
      fileId: file.id,
      contenuId: r.contenuId,
    };
  }

  const contenu = await claimContenu(supabase);
  if (!contenu) {
    const backfill = await prochainBackfill(supabase);
    if (!backfill) return { action: "idle", more: false };
    const r = await avancerImport(supabase, backfill);
    await supabase
      .from("contenus")
      .update({ import_lease_until: null })
      .eq("id", backfill.id);
    return {
      action: "backfill",
      more: await hasMoreWork(supabase),
      contenuId: backfill.id,
      etape: r.etape,
    };
  }

  const r = await avancerImport(supabase, contenu);
  await supabase
    .from("contenus")
    .update({ import_lease_until: null })
    .eq("id", contenu.id);

  return {
    action: "pipeline",
    more: await hasMoreWork(supabase),
    contenuId: contenu.id,
    etape: r.etape,
  };
}

async function hasMoreWork(
  supabase: ReturnType<typeof serviceClient>,
): Promise<boolean> {
  const now = new Date().toISOString();
  const [{ count: files }, { count: contenus }] = await Promise.all([
    supabase
      .from("import_file")
      .select("id", { count: "exact", head: true })
      .in("statut", ["pending", "failed"])
      .lt("tentatives", 5),
    supabase
      .from("contenus")
      .select("id", { count: "exact", head: true })
      .in("import_statut", ["pending", "running", "failed"])
      .or(`import_lease_until.is.null,import_lease_until.lt."${now}"`),
  ]);
  return (files ?? 0) + (contenus ?? 0) > 0;
}

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
  for (let i = 0; i < Math.max(1, n); i += 1) {
    void fetch(target, {
      method: "POST",
      headers,
      body: JSON.stringify({ worker: true }),
    }).catch(() => null);
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
