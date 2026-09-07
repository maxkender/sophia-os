import { supabase } from "@/lib/supabase/client";
import { estSlugSophia } from "@/features/moteur/applications";
import { compteEnProcessus } from "@/features/moteur/warmup";
import { estCompteTestRecrutement } from "./constantes";
import { labelsDesComptes } from "@/features/moteur/api";
import {
  aggregerPassagesCompte,
  assemblerStatsCreateur,
  derniersJoursParis,
  type PassageStatsRow,
} from "./stats";
import { bornerCibleCreateurs } from "./constantes";
import type {
  ChampHorodatageCreateur,
  ChampHorodatageHm,
  FicheCreateurOs,
  RecrutementCreateur,
  RecrutementHm,
  RecrutementRun,
  RecrutementSuggestion,
  StatsCreateur10j,
  StatutSuggestion,
} from "./types";

const HM_SELECT =
  "id, profile_id, upwork_freelancer_id, upwork_profile_url, avatar_url, prenom, nom, nom_affiche, pays, email_os, email_perso, slack_user_id, talks_at, contrat_envoye_at, contrat_signe_at, codes_envoyes_at, slack_invite_envoyee_at, email_perso_demandee_at, rejoint_slack_at, rejoint_os_at, ajoute_upwork_at, job_post_at, job_post_id, job_post_titre, cible_createurs, notes, dernier_message, dernier_message_at, dernier_message_auteur, created_at, updated_at";

const CRE_SELECT =
  "id, hm_id, profile_id, pays, upwork_freelancer_id, upwork_profile_url, avatar_url, prenom, nom, nom_affiche, email_os, email_perso, slack_user_id, talks_at, contrat_envoye_at, contrat_signe_at, codes_envoyes_at, slack_invite_envoyee_at, rejoint_os_at, rejoint_slack_at, warmup_at, premier_post_at, dernier_message, dernier_message_at, dernier_message_auteur, created_at, updated_at";

const SUG_SELECT =
  "id, hm_id, createur_id, pays, phase, kind, canal, titre, corps, prompt_autom, empreinte, statut, validee_at, ignoree_at, executee_at, execution_log, created_at, updated_at";

const IN_CHUNK = 80;
const PAGE_PASSAGES = 1000;

async function slugParApplication(): Promise<Map<string, string>> {
  const { data, error } = await supabase.from("applications").select("id, slug");
  if (error) throw error;
  return new Map((data ?? []).map((a) => [a.id as string, a.slug as string]));
}

function estCompteSophia(applicationId: string | null | undefined, slugs: Map<string, string>): boolean {
  if (!applicationId) return true;
  return estSlugSophia(slugs.get(applicationId) ?? null);
}

async function listerPassagesStats(
  compteIds: string[],
  debut: string,
  fin: string,
): Promise<PassageStatsRow[]> {
  const parId = new Map<string, PassageStatsRow>();
  const ranger = async (
    chunk: string[],
    kind: "prevus" | "publies",
  ): Promise<void> => {
    let from = 0;
    for (;;) {
      const base = supabase
        .from("passages")
        .select("id, compte_id, statut, date_publication_prevue, publie_at, vues")
        .in("compte_id", chunk);
      const q =
        kind === "prevus"
          ? base
              .gte("date_publication_prevue", debut)
              .lte("date_publication_prevue", fin)
              .neq("statut", "brouillon")
          : base.not("publie_at", "is", null);
      const { data, error } = await q.range(from, from + PAGE_PASSAGES - 1);
      if (error) throw error;
      const rows = (data ?? []) as PassageStatsRow[];
      for (const r of rows) parId.set(r.id, r);
      if (rows.length < PAGE_PASSAGES) break;
      from += PAGE_PASSAGES;
    }
  };
  for (let i = 0; i < compteIds.length; i += IN_CHUNK) {
    const chunk = compteIds.slice(i, i + IN_CHUNK);
    await ranger(chunk, "prevus");
    await ranger(chunk, "publies");
  }
  return [...parId.values()];
}

export async function listerHmsRecrutement(): Promise<RecrutementHm[]> {
  const { data, error } = await supabase
    .from("recrutement_hms")
    .select(HM_SELECT)
    .order("nom_affiche");
  if (error) throw error;
  return ((data ?? []) as RecrutementHm[]).filter(
    (h) => !estCompteTestRecrutement({ email: h.email_os, prenom: h.prenom }),
  );
}

export async function listerCreateursRecrutement(): Promise<RecrutementCreateur[]> {
  const { data, error } = await supabase
    .from("recrutement_createurs")
    .select(CRE_SELECT)
    .order("nom_affiche");
  if (error) throw error;
  return (data ?? []) as RecrutementCreateur[];
}

export async function listerSuggestionsRecrutement(
  statuts: StatutSuggestion[] = ["en_attente", "validee", "a_reproposer"],
): Promise<RecrutementSuggestion[]> {
  const { data, error } = await supabase
    .from("recrutement_suggestions")
    .select(SUG_SELECT)
    .in("statut", statuts)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as RecrutementSuggestion[];
}

export async function dernierRunRecrutement(): Promise<RecrutementRun | null> {
  const { data, error } = await supabase
    .from("recrutement_runs")
    .select("id, started_at, finished_at, resume")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as RecrutementRun | null) ?? null;
}

export async function marquerAjoutUpwork(hmId: string, fait: boolean): Promise<void> {
  const { error } = await supabase
    .from("recrutement_hms")
    .update({
      ajoute_upwork_at: fait ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", hmId);
  if (error) throw error;
}

export async function majCibleCreateurs(hmId: string, cible: number): Promise<void> {
  const { error } = await supabase
    .from("recrutement_hms")
    .update({
      cible_createurs: bornerCibleCreateurs(cible),
      updated_at: new Date().toISOString(),
    })
    .eq("id", hmId);
  if (error) throw error;
}

export async function chargerFichesCreateurs(
  createurs: RecrutementCreateur[],
): Promise<Map<string, FicheCreateurOs>> {
  const out = new Map<string, FicheCreateurOs>();
  for (const c of createurs) {
    out.set(c.id, {
      email: (c.email_perso || c.email_os || "").trim() || null,
      handle: null,
      urlTiktok: null,
      compteId: null,
      labels: [],
    });
  }
  const posterIds = [...new Set(createurs.map((c) => c.profile_id).filter(Boolean))] as string[];
  if (posterIds.length === 0) return out;

  const slugs = await slugParApplication();
  const { data: comptes, error } = await supabase
    .from("comptes")
    .select("id, poster_id, langue, handle_tiktok, is_active, application_id")
    .in("poster_id", posterIds)
    .eq("is_active", true);
  if (error) throw error;

  type CompteRow = {
    id: string;
    poster_id: string;
    langue: string | null;
    handle_tiktok: string | null;
    application_id: string | null;
  };
  const sophia = ((comptes ?? []) as CompteRow[]).filter((c) =>
    estCompteSophia(c.application_id, slugs),
  );

  const compteParCreateur = new Map<string, CompteRow>();
  for (const cre of createurs) {
    if (!cre.profile_id) continue;
    const match = sophia.find(
      (c) =>
        c.poster_id === cre.profile_id &&
        (c.langue ?? "").toLowerCase() === cre.pays.toLowerCase(),
    );
    if (match) compteParCreateur.set(cre.id, match);
  }

  const labelsParCompte = await labelsDesComptes([...new Set([...compteParCreateur.values()].map((c) => c.id))]);

  for (const [creId, compte] of compteParCreateur) {
    const handle = (compte.handle_tiktok ?? "").replace(/^@/, "").trim() || null;
    const actuelle = out.get(creId)!;
    out.set(creId, {
      ...actuelle,
      handle,
      urlTiktok: handle ? `https://www.tiktok.com/@${handle}` : null,
      compteId: compte.id,
      labels: (labelsParCompte.get(compte.id) ?? []).map((l) => l.nom).filter(Boolean),
    });
  }
  return out;
}

export async function enregistrerEmailPerso(hmId: string, email: string): Promise<void> {
  const { error } = await supabase
    .from("recrutement_hms")
    .update({
      email_perso: email.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", hmId);
  if (error) throw error;
}

const CHAMPS_HM = new Set<ChampHorodatageHm>([
  "talks_at",
  "contrat_envoye_at",
  "contrat_signe_at",
  "codes_envoyes_at",
  "slack_invite_envoyee_at",
  "email_perso_demandee_at",
  "rejoint_slack_at",
  "rejoint_os_at",
  "ajoute_upwork_at",
  "job_post_at",
]);

const CHAMPS_CRE = new Set<ChampHorodatageCreateur>([
  "talks_at",
  "contrat_envoye_at",
  "contrat_signe_at",
  "codes_envoyes_at",
  "slack_invite_envoyee_at",
  "rejoint_os_at",
  "rejoint_slack_at",
  "warmup_at",
  "premier_post_at",
]);

export async function majChampHm(
  hmId: string,
  champ: ChampHorodatageHm,
  fait: boolean,
): Promise<void> {
  if (!CHAMPS_HM.has(champ)) throw new Error("champ HM invalide");
  const { error } = await supabase
    .from("recrutement_hms")
    .update({
      [champ]: fait ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", hmId);
  if (error) throw error;
}

export async function majChampCreateur(
  createurId: string,
  champ: ChampHorodatageCreateur,
  fait: boolean,
): Promise<void> {
  if (!CHAMPS_CRE.has(champ)) throw new Error("champ créateur invalide");
  const { error } = await supabase
    .from("recrutement_createurs")
    .update({
      [champ]: fait ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", createurId);
  if (error) throw error;
}

export async function majStatutSuggestion(
  id: string,
  statut: StatutSuggestion,
): Promise<void> {
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { statut, updated_at: now };
  if (statut === "validee") patch.validee_at = now;
  if (statut === "ignoree") patch.ignoree_at = now;
  if (statut === "executee") patch.executee_at = now;
  const { error } = await supabase.from("recrutement_suggestions").update(patch).eq("id", id);
  if (error) throw error;
}

export async function creerSuggestionManuelle(input: {
  hm_id: string;
  createur_id?: string | null;
  pays: string;
  phase: 0 | 1 | 2;
  kind: "relance" | "pression";
  titre: string;
  corps: string;
  prompt_autom: Record<string, unknown>;
}): Promise<void> {
  const empreinte = `manuel:${input.kind}:${input.hm_id}:${input.createur_id ?? ""}:${Date.now()}`;
  const { error } = await supabase.from("recrutement_suggestions").insert({
    hm_id: input.hm_id,
    createur_id: input.createur_id ?? null,
    pays: input.pays,
    phase: input.phase,
    kind: input.kind,
    canal: "upwork",
    titre: input.titre,
    corps: input.corps,
    prompt_autom: input.prompt_autom,
    empreinte,
    statut: "validee",
    validee_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function chargerStatsCreateurs(
  createurs: RecrutementCreateur[],
): Promise<Map<string, StatsCreateur10j>> {
  const out = new Map<string, StatsCreateur10j>();
  const avecProfil = createurs.filter((c) => Boolean(c.profile_id));
  if (avecProfil.length === 0) return out;

  const posterIds = [...new Set(avecProfil.map((c) => c.profile_id!))];

  const { data: profilsCout } = await supabase
    .from("profiles")
    .select("id, cout_mensuel")
    .in("id", posterIds);
  const coutParPoster = new Map(
    (profilsCout ?? []).map((p) => [p.id as string, (p.cout_mensuel as number | null) ?? null]),
  );

  const jours = derniersJoursParis();
  const debut = jours[0]!;
  const fin = jours[jours.length - 1]!;

  const slugs = await slugParApplication();
  const { data: comptes, error: eComptes } = await supabase
    .from("comptes")
    .select("id, poster_id, langue, application_id, warmup_started_at, warmup_ends_at")
    .in("poster_id", posterIds)
    .eq("is_active", true);
  if (eComptes) throw eComptes;

  type CompteRow = {
    id: string;
    poster_id: string;
    langue: string | null;
    application_id: string | null;
    warmup_started_at: string | null;
    warmup_ends_at: string | null;
  };
  const comptesSophia = ((comptes ?? []) as CompteRow[]).filter((c) =>
    estCompteSophia(c.application_id, slugs),
  );

  const comptesPour = (posterId: string, pays: string) =>
    comptesSophia.filter(
      (c) => c.poster_id === posterId && (c.langue ?? "").toLowerCase() === pays.toLowerCase(),
    );

  const compteIds = [...new Set(comptesSophia.map((c) => c.id))];
  const parCompte = new Map<string, PassageStatsRow[]>();
  if (compteIds.length > 0) {
    const passages = await listerPassagesStats(compteIds, debut, fin);
    for (const p of passages) {
      const liste = parCompte.get(p.compte_id) ?? [];
      liste.push(p);
      parCompte.set(p.compte_id, liste);
    }
  }

  for (const cre of avecProfil) {
    const comptesPays = comptesPour(cre.profile_id!, cre.pays);
    const idsProcess = comptesPays.filter((c) =>
      compteEnProcessus({
        warmup_started_at: c.warmup_started_at,
        warmup_ends_at: c.warmup_ends_at,
      }),
    );
    const essai = comptesPays.length > 0 && idsProcess.length === 0;
    let prevus = 0;
    let postes = 0;
    let vues10j = 0;
    const passagesPays: PassageStatsRow[] = [];
    for (const compte of comptesPays) {
      const apresWarmup = compteEnProcessus({
        warmup_started_at: compte.warmup_started_at,
        warmup_ends_at: compte.warmup_ends_at,
      });
      const rows = parCompte.get(compte.id) ?? [];
      passagesPays.push(...rows);
      const agg = aggregerPassagesCompte(rows, {
        debut,
        fin,
        apresWarmup,
      });
      prevus += agg.prevus;
      postes += agg.postes;
      vues10j += agg.vues10j;
    }
    const vuesMoy10 = aggregerPassagesCompte(passagesPays, {
      debut,
      fin,
      apresWarmup: true,
    }).vuesMoy10;
    out.set(
      cre.id,
      assemblerStatsCreateur({
        posterId: cre.profile_id!,
        prevus,
        postes,
        vuesMoy10,
        vues10j,
        coutMensuel: coutParPoster.get(cre.profile_id!) ?? null,
        essai,
      }),
    );
  }
  return out;
}
