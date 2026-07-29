import {
  avancerImport,
  importerCompteReference,
  importerLien,
  listerUrlsCompteReference,
  prochainContenu,
} from "../_shared/import_contenu.ts";
import { assertAuthorised, json, messageErreur, serviceClient } from "../_shared/supabase.ts";

/**
 * Import pré-calculé v-next :
 *   scrape (tous / lien) → OCR → pertinence + vues + langue
 *   → ELO par langue → si aucune ≥ seuil : rejeté (non importé)
 *   → sinon nettoyage 1× + traduction / Sophia des langues retenues → valide.
 *
 * Ne réécrit pas les posts du jour ni les stocks déjà `done`.
 *
 *   {}                              → prochain contenu en file
 *   { contenuId }                   → ce contenu
 *   { postUrl, compteReferenceId?, labelIds? } → TikTok isolé + file
 *   { compteReferenceId, lister: true } → liste URLs photo (sans scrape lourd)
 *   { compteReferenceId, scrape: true } → legacy : scrape+crée en série
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
    // Entrée : lien isolé
    if (body?.postUrl) {
      const cree = await importerLien(
        supabase,
        String(body.postUrl),
        body.compteReferenceId ?? null,
        Array.isArray(body.labelIds) ? body.labelIds : null,
      );
      // Enchaîne un pas tout de suite pour ne pas attendre le cron.
      const contenu = await prochainContenu(supabase, cree.id);
      if (!contenu) return json({ ok: true, contenuId: cree.id, reused: cree.reused, idle: true });
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

    // Entrée : lister les URLs à importer (1 agent scrapePost / URL côté client)
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

    // Entrée : scrape compte de référence (legacy, série)
    if (body?.compteReferenceId && body?.scrape) {
      const r = await importerCompteReference(supabase, String(body.compteReferenceId));
      return json({ ok: true, crees: r.crees, ids: r.ids, scrapes: r.scrapes });
    }

    const contenuId: string | null = body?.contenuId ?? null;
    let contenu = await prochainContenu(supabase, contenuId);

    // Backfill : contenus déjà « done » (ex. migrés) mais langues cibles vides.
    if (!contenu && !contenuId) {
      contenu = await prochainBackfill(supabase);
    }

    if (!contenu) return json({ ok: true, idle: true });

    const r = await avancerImport(supabase, contenu);
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
    const manque =
      slides.length === 0 || slides.every((s) => !s.texte_overlay);

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
