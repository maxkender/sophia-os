/**
 * Séquence « Mettre à jour les sources » persistée dans reglages.
 *
 * Le client ne fait que démarrer / annuler / lire. Chaque tick (worker idle
 * ou cron minute) enfile AU PLUS un compte, et seulement si la file globale
 * est vide — fermer l'onglet n'interrompt rien.
 */
import type { Supabase } from "./import_contenu.ts";
import {
  enqueueImportUrls,
  listerUrlsCompteReference,
} from "./import_contenu.ts";
import {
  STAGNATION_MS,
  deciderTick,
  type MajCompte,
  type MajJournalLigne,
  type MajSourcesRun,
  type MesureFile,
} from "./maj_sequentielle.ts";

export const CLE_MAJ_SOURCES = "maj_sources_run";
const JOURNAL_MAX = 80;
const LEASE_SEC = 8 * 60;
/** Âge minimal d'un slideshow source pour être enfilé, par défaut (`reglages.bleo.sources.age_min_jours`, 0667). */
export const AGE_MIN_JOURS_DEFAUT = 7;

/**
 * L'âge minimal d'un post source à la mise à jour (0667) : ses vues doivent
 * être faites avant que le score d'import le juge. 0 : désactivé.
 */
async function lireReglagesMaj(supabase: Supabase): Promise<{ ageMinJours: number; maxParMaj: number | null }> {
  const { data } = await supabase.from("reglages").select("valeur").eq("cle", "bleo").maybeSingle();
  const sources = (data?.valeur as { sources?: { age_min_jours?: unknown; posts_max_par_maj?: unknown } } | null)?.sources;
  const age = Number(sources?.age_min_jours);
  // 0686 : au plus tant de slideshows par source et par mise à jour. Absent ou 0 : pas de plafond.
  const max = Number(sources?.posts_max_par_maj);
  return {
    ageMinJours: Number.isFinite(age) && age >= 0 ? age : AGE_MIN_JOURS_DEFAUT,
    maxParMaj: Number.isFinite(max) && max > 0 ? Math.floor(max) : null,
  };
}

function pousserJournal(
  run: MajSourcesRun,
  niveau: MajJournalLigne["niveau"],
  message: string,
  detail?: string,
): MajSourcesRun {
  const ligne: MajJournalLigne = {
    at: new Date().toISOString(),
    niveau,
    message,
    ...(detail ? { detail } : {}),
  };
  return {
    ...run,
    journal: [...run.journal, ligne].slice(-JOURNAL_MAX),
  };
}

export async function lireMajSourcesRun(
  supabase: Supabase,
): Promise<MajSourcesRun | null> {
  const { data } = await supabase
    .from("reglages")
    .select("valeur")
    .eq("cle", CLE_MAJ_SOURCES)
    .maybeSingle();
  return (data?.valeur as MajSourcesRun | null) ?? null;
}

export async function ecrireMajSourcesRun(
  supabase: Supabase,
  valeur: MajSourcesRun,
): Promise<void> {
  const { error } = await supabase.from("reglages").upsert(
    {
      cle: CLE_MAJ_SOURCES,
      valeur,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "cle" },
  );
  if (error) throw error;
}

/**
 * Reste-à-faire ET travail achevé. Les deux sont nécessaires : un scrape qui
 * finit déplace une unité d'`import_file` vers `contenus`, donc le reste seul
 * paraît figé pendant toute la phase de scrape.
 */
async function mesurerFile(supabase: Supabase): Promise<MesureFile> {
  const [scrapes, pipelines, scrapesFinis, pipelinesFinis] = await Promise.all([
    supabase
      .from("import_file")
      .select("id", { count: "exact", head: true })
      .in("statut", ["pending", "running"]),
    supabase
      .from("contenus")
      .select("id", { count: "exact", head: true })
      .in("import_statut", ["pending", "running"]),
    supabase
      .from("import_file")
      .select("id", { count: "exact", head: true })
      .in("statut", ["done", "failed", "skipped"]),
    supabase
      .from("contenus")
      .select("id", { count: "exact", head: true })
      .in("import_statut", ["done", "failed"]),
  ]);
  if (scrapes.error) throw scrapes.error;
  if (pipelines.error) throw pipelines.error;
  if (scrapesFinis.error) throw scrapesFinis.error;
  if (pipelinesFinis.error) throw pipelinesFinis.error;
  return {
    file: scrapes.count ?? 0,
    pipeline: pipelines.count ?? 0,
    faits: (scrapesFinis.count ?? 0) + (pipelinesFinis.count ?? 0),
  };
}

/**
 * L'échec d'une source se voit dans la file (0698) : la décision de la semaine
 * garde la raison et la source repart au lot suivant. `null` : l'échec est levé.
 * Jamais bloquant : la séquence continue même si l'écriture rate.
 */
async function noterEchec(supabase: Supabase, compteId: string, message: string | null): Promise<void> {
  try {
    await supabase.rpc("maj_sources_echec", { p_compte: compteId, p_message: message });
  } catch {
    /* best-effort */
  }
}

type Claim =
  | { action: "idle" }
  | { action: "busy"; etat: MajSourcesRun }
  | { action: "claimed"; etat: MajSourcesRun };

async function claimTick(supabase: Supabase): Promise<Claim> {
  const { data, error } = await supabase.rpc("maj_sources_claim", {
    p_lease_seconds: LEASE_SEC,
  });
  if (error) throw error;
  return data as Claim;
}

/** Écrit l'état et libère le lease : le prochain tick peut reprendre la main. */
async function relacherLease(supabase: Supabase, run: MajSourcesRun): Promise<void> {
  const reste = { ...(run as MajSourcesRun & { leaseUntil?: string }) };
  delete reste.leaseUntil;
  await ecrireMajSourcesRun(supabase, reste);
}

export async function demarrerMajSources(
  supabase: Supabase,
  comptes: MajCompte[],
): Promise<{ deja: boolean; etat: MajSourcesRun }> {
  const { data, error } = await supabase.rpc("maj_sources_demarrer", {
    p_comptes: comptes,
  });
  if (error) throw error;
  const r = data as { action: string; etat: MajSourcesRun };
  return { deja: r.action === "deja", etat: r.etat };
}

export async function annulerMajSources(supabase: Supabase): Promise<MajSourcesRun | null> {
  const { data, error } = await supabase.rpc("maj_sources_annuler");
  if (error) throw error;
  return (data as { etat: MajSourcesRun | null })?.etat ?? null;
}

/**
 * Un pas : si la file est vide, listing + enqueue du prochain compte.
 * Retourne `more` si un worker doit se réenchaîner (compte enfilé, ou encore
 * des comptes en attente après un listing vide).
 */
export async function tickMajSources(
  supabase: Supabase,
): Promise<{ more: boolean; action: string; etat: MajSourcesRun | null }> {
  const claim = await claimTick(supabase);
  if (claim.action === "idle") return { more: false, action: "idle", etat: null };
  if (claim.action === "busy") {
    return { more: false, action: "busy", etat: claim.etat };
  }

  let run = claim.etat;
  try {
    const mesure = await mesurerFile(supabase);
    const decision = deciderTick(run, mesure, Date.now(), STAGNATION_MS);

    if (decision.type === "rien") {
      await relacherLease(supabase, run);
      return { more: false, action: "rien", etat: run };
    }

    if (decision.type === "done") {
      run = pousserJournal(
        {
          ...run,
          statut: "done",
          phase: null,
          handle: null,
          restant: 0,
          faits: run.comptes.length,
        },
        "ok",
        `Séquence terminée — ${run.comptes.length} compte(s)`,
      );
      await relacherLease(supabase, run);
      return { more: false, action: "done", etat: run };
    }

    if (decision.type === "bloquee") {
      run = pousserJournal(
        {
          ...run,
          statut: "bloquee",
          restant: decision.restant,
          phase: "attente",
        },
        "error",
        `File figée à ${decision.restant} élément(s) depuis ${Math.round(
          decision.depuisMs / 60_000,
        )} min — séquence stoppée`,
        "Rien de neuf n'est enfilé tant que la file ne redescend pas.",
      );
      await relacherLease(supabase, run);
      return { more: false, action: "bloquee", etat: run };
    }

    if (decision.type === "attendre") {
      run = {
        ...run,
        phase: "attente",
        restant: decision.restant,
        minRestant: decision.etat.minRestant,
        maxFaits: decision.etat.maxFaits,
        dernierProgresAt: decision.etat.dernierProgresA,
      };
      await relacherLease(supabase, run);
      return { more: false, action: "attente", etat: run };
    }

    const { compte, index } = decision;
    const rang = `[${index + 1}/${run.comptes.length}]`;
    run = pousserJournal(
      {
        ...run,
        phase: "import",
        handle: compte.handle,
        restant: 0,
        // Nouveau compte : la fenêtre de stagnation repart de zéro.
        minRestant: null,
        maxFaits: null,
        dernierProgresAt: Date.now(),
      },
      "info",
      `${rang} @${compte.handle} — mise à jour`,
    );
    await ecrireMajSourcesRun(supabase, run);

    try {
      const listed = await listerUrlsCompteReference(supabase, compte.id, {
        nouveauxSeulement: true,
        marquerScrape: true,
        ...(await lireReglagesMaj(supabase)),
      });
      // 0698 : un profil que personne n'a pu lire est un échec, pas « rien à rattraper ».
      if (listed.illisible) throw new Error(listed.illisible);
      await noterEchec(supabase, compte.id, null);
      const r = await enqueueImportUrls(supabase, {
        urls: listed.urls,
        compteReferenceId: compte.id,
        labelIds: [],
        langue: compte.langue,
      });
      const detail = [
        `profil=${listed.total} slideshow(s) · déjà en stock=${listed.connus} · manquants=${listed.manquants}`,
        `enfilées=${r.enqueued} · déjà en file=${r.skipped} · source=${listed.source}`,
        ...(listed.diagnostic ?? []),
      ].join("\n");
      run = pousserJournal(
        {
          ...run,
          index: index + 1,
          faits: index + 1,
          phase: r.enqueued > 0 ? "attente" : "import",
          restant: r.enqueued,
          minRestant: null,
          maxFaits: null,
          dernierProgresAt: Date.now(),
        },
        r.enqueued > 0 ? "ok" : "info",
        r.enqueued > 0
          ? `${rang} @${compte.handle} — ${r.enqueued} slideshow(s) enfilé(s)`
          : `${rang} @${compte.handle} — rien à rattraper`,
        detail,
      );
      await relacherLease(supabase, run);
      // Enfilé → les workers drainent. Vide → enchaîner le compte suivant.
      return { more: true, action: r.enqueued > 0 ? "enfile" : "vide", etat: run };
    } catch (e) {
      run = pousserJournal(
        {
          ...run,
          index: index + 1,
          faits: index + 1,
          phase: "import",
        },
        "error",
        `${rang} @${compte.handle} — échec (on continue)`,
        (e as Error).message,
      );
      await noterEchec(supabase, compte.id, (e as Error).message);
      await relacherLease(supabase, run);
      return { more: true, action: "echec", etat: run };
    }
  } catch (e) {
    try {
      await relacherLease(
        supabase,
        pousserJournal(run, "error", "Tick interrompu", (e as Error).message),
      );
    } catch {
      /* best-effort */
    }
    throw e;
  }
}
