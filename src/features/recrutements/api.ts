import { supabase } from "@/lib/supabase/client";
import { SLUG_SOPHIA } from "@/features/moteur/applications";
import { compteEnProcessus } from "@/features/moteur/warmup";
import { estCompteTestRecrutement } from "./constantes";
import { assemblerStatsCreateur, derniersJoursParis, jourParisIso } from "./stats";
import type {
  RecrutementCreateur,
  RecrutementHm,
  RecrutementRun,
  RecrutementSuggestion,
  StatsCreateur10j,
  StatutSuggestion,
} from "./types";

const HM_SELECT =
  "id, profile_id, upwork_freelancer_id, upwork_profile_url, avatar_url, prenom, nom, nom_affiche, pays, email_os, email_perso, slack_user_id, talks_at, contrat_envoye_at, contrat_signe_at, codes_envoyes_at, slack_invite_envoyee_at, email_perso_demandee_at, rejoint_slack_at, rejoint_os_at, ajoute_upwork_at, job_post_at, job_post_id, job_post_titre, notes, created_at, updated_at";

const CRE_SELECT =
  "id, hm_id, profile_id, pays, upwork_freelancer_id, upwork_profile_url, avatar_url, prenom, nom, nom_affiche, email_os, email_perso, slack_user_id, talks_at, contrat_envoye_at, contrat_signe_at, codes_envoyes_at, slack_invite_envoyee_at, rejoint_os_at, rejoint_slack_at, warmup_at, premier_post_at, created_at, updated_at";

const SUG_SELECT =
  "id, hm_id, createur_id, pays, phase, kind, canal, titre, corps, prompt_autom, empreinte, statut, validee_at, ignoree_at, executee_at, execution_log, created_at, updated_at";

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
  const dansFenetre = (iso: string | null) => {
    if (!iso) return false;
    const j = jourParisIso(iso);
    return j >= debut && j <= fin;
  };

  const { data: comptes, error: eComptes } = await supabase
    .from("comptes")
    .select(
      "id, poster_id, langue, application_id, warmup_started_at, warmup_ends_at, applications(slug)",
    )
    .in("poster_id", posterIds)
    .eq("is_active", true);
  if (eComptes) throw eComptes;

  type CompteRow = {
    id: string;
    poster_id: string;
    langue: string | null;
    warmup_started_at: string | null;
    warmup_ends_at: string | null;
    applications?: { slug?: string } | null;
  };
  const comptesSophia = ((comptes ?? []) as CompteRow[]).filter((c) => {
    const slug = c.applications?.slug;
    return (slug ?? SLUG_SOPHIA) === SLUG_SOPHIA;
  });

  const comptesPour = (posterId: string, pays: string) =>
    comptesSophia.filter(
      (c) => c.poster_id === posterId && (c.langue ?? "").toLowerCase() === pays.toLowerCase(),
    );

  const compteIdsActifs = new Set(
    comptesSophia
      .filter((c) =>
        compteEnProcessus({
          warmup_started_at: c.warmup_started_at,
          warmup_ends_at: c.warmup_ends_at,
        }),
      )
      .map((c) => c.id),
  );
  const compteIds = [...compteIdsActifs];

  const prevus = new Map<string, number>();
  const postes = new Map<string, number>();
  const vues10 = new Map<string, number>();
  const derniersVues: Map<string, number[]> = new Map();

  if (compteIds.length > 0) {
    const { data: passages, error: ePas } = await supabase
      .from("passages")
      .select("compte_id, statut, date_publication_prevue")
      .in("compte_id", compteIds)
      .gte("date_publication_prevue", debut)
      .lte("date_publication_prevue", fin)
      .neq("statut", "brouillon");
    if (ePas) throw ePas;
    for (const p of passages ?? []) {
      const id = p.compte_id as string;
      prevus.set(id, (prevus.get(id) ?? 0) + 1);
    }

    const { data: posts, error: ePosts } = await supabase
      .from("posts")
      .select("id, compte_id, publie_at")
      .in("compte_id", compteIds)
      .eq("est_test", false)
      .not("publie_at", "is", null)
      .order("publie_at", { ascending: false })
      .limit(2000);
    if (ePosts) throw ePosts;
    const idsPublies = (posts ?? []).map((p) => p.id as string);
    for (const p of posts ?? []) {
      if (!dansFenetre(p.publie_at as string | null)) continue;
      const id = p.compte_id as string;
      postes.set(id, (postes.get(id) ?? 0) + 1);
    }

    if (idsPublies.length > 0) {
      const { data: recents, error: eRec } = await supabase
        .from("stats_posts")
        .select("id, compte_id, vues, publie_at")
        .in("id", idsPublies.slice(0, 800));
      if (eRec) throw eRec;
      const parCompte = new Map<string, Array<{ publie_at: string; vues: number }>>();
      for (const r of recents ?? []) {
        const publie = r.publie_at as string | null;
        if (!publie) continue;
        const id = r.compte_id as string;
        const liste = parCompte.get(id) ?? [];
        liste.push({ publie_at: publie, vues: Number(r.vues ?? 0) });
        parCompte.set(id, liste);
      }
      for (const [compteId, liste] of parCompte) {
        liste.sort((a, b) => (a.publie_at < b.publie_at ? 1 : -1));
        derniersVues.set(
          compteId,
          liste.slice(0, 10).map((x) => x.vues),
        );
        vues10.set(
          compteId,
          liste.filter((x) => dansFenetre(x.publie_at)).reduce((s, x) => s + x.vues, 0),
        );
      }
    }
  }

  const somme = (ids: string[], src: Map<string, number>) =>
    ids.reduce((s, id) => s + (src.get(id) ?? 0), 0);

  for (const cre of avecProfil) {
    const comptesPays = comptesPour(cre.profile_id!, cre.pays);
    const ids = comptesPays
      .filter((c) =>
        compteEnProcessus({
          warmup_started_at: c.warmup_started_at,
          warmup_ends_at: c.warmup_ends_at,
        }),
      )
      .map((c) => c.id);
    const essai = comptesPays.some(
      (c) =>
        !compteEnProcessus({
          warmup_started_at: c.warmup_started_at,
          warmup_ends_at: c.warmup_ends_at,
        }),
    ) && ids.length === 0;
    const vuesListe = ids.flatMap((id) => derniersVues.get(id) ?? []).slice(0, 10);
    const vuesMoy10 =
      vuesListe.length === 0
        ? null
        : vuesListe.reduce((a, b) => a + b, 0) / vuesListe.length;
    out.set(
      cre.id,
      assemblerStatsCreateur({
        posterId: cre.profile_id!,
        prevus: somme(ids, prevus),
        postes: somme(ids, postes),
        vuesMoy10,
        vues10j: somme(ids, vues10),
        coutMensuel: coutParPoster.get(cre.profile_id!) ?? null,
        essai,
      }),
    );
  }
  return out;
}
