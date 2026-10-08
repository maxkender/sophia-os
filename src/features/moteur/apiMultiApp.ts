/**
 * Accès base du multi-applications côté admin (applications, labels ×
 * applications, répartition des comptes, réserve et replis par application,
 * pertinences et decks par application, rattrapage de pertinence).
 *
 * Ces lectures visent des objets créés par la migration 0256 : elles lèvent
 * une erreur explicite si elle n'est pas passée, et chaque écran qui les
 * consomme doit l'afficher localement sans bloquer le reste de la page.
 */
import { supabase } from "@/lib/supabase/client";
import { invoke } from "./api";
import type { ApplicationOs } from "./applications";
import { ID_SOPHIA, normaliserParts, type PartsApplications } from "./multiApp";
import { estErreurSchemaAbsent } from "./multiapp/logique";
import {
  PASSAGES_PAR_TIER,
  type ContenuTierEtatApplication,
  type Tier,
  type TierRapport,
} from "./types";

export interface ApplicationMulti extends ApplicationOs {
  /** Langues de compte ciblées ; `null` = toutes. */
  langues: string[] | null;
  actif: boolean;
}

/**
 * Lien label → application. La colonne `angle` reste en base (nullable) mais
 * n'est plus ni lue ni écrite : pas d'angle par label, le prompt de placement
 * de l'application suffit.
 */
export interface LienLabelApplicationRow {
  label_id: string;
  application_id: string;
}

export interface ReserveLabelApplication {
  label_id: string;
  nom: string;
  slug: string;
  application_id: string;
  application_slug: string;
  contenus_prets: number;
  passages_restants: number;
  comptes: number;
  demande_jour: number;
  reserve_jours: number | null;
}

export interface RepliApplication {
  id: string;
  compte_id: string;
  date_publication_prevue: string | null;
  application_id: string;
  application_visee_id: string;
  repli_motif: string | null;
  compte: { handle_tiktok: string | null; persona_nom: string | null; langue: string | null } | null;
}

export interface PertinenceContenu {
  application_id: string;
  score: number;
  raison: string | null;
  note: number | null;
  eligible: boolean;
  prompt_cle: string | null;
  updated_at: string;
}

export interface DeckApplicationRow {
  id: string;
  langue: string;
  application_id: string;
  variante: string;
  statut: "pret" | "echec" | "ineligible";
  raison: string | null;
  slides: Array<{ position: number; texte_overlay: string | null; position_sophia: boolean }>;
  placement: Record<string, unknown> | null;
  updated_at: string;
}

export interface EtatBackfillPertinence {
  actif: boolean;
  /** Contenus prêts, servis par l'application, encore sans note pour elle. */
  restants: number;
  faits: number;
  erreurs: number;
  demarre_at: string | null;
  dernier_at: string | null;
}

/** Applications avec langues et interrupteur (Sophia : toutes langues, toujours active). */
export async function listerApplicationsMulti(): Promise<ApplicationMulti[]> {
  const { data, error } = await supabase
    .from("applications")
    .select("*")
    .order("created_at");
  if (error) throw error;
  return ((data ?? []) as Array<ApplicationOs & { langues?: string[] | null; actif?: boolean | null }>).map(
    (a) => ({
      id: a.id,
      slug: a.slug,
      nom: a.nom,
      created_at: a.created_at,
      langues: a.id === ID_SOPHIA ? null : (a.langues ?? null),
      actif: a.id === ID_SOPHIA ? true : a.actif !== false,
    }),
  );
}

/** Langues ciblées (`null` = toutes) et/ou interrupteur. Sophia n'est jamais restreinte. */
export async function majApplication(
  id: string,
  patch: { langues?: string[] | null; actif?: boolean },
): Promise<void> {
  if (id === ID_SOPHIA) throw new Error("Sophia ne se restreint pas : toutes langues, toujours active.");
  const { error } = await supabase.from("applications").update(patch).eq("id", id);
  if (error) throw error;
}

/** Tous les liens label → application (table de quelques dizaines de lignes). */
export async function listerLiensLabels(): Promise<LienLabelApplicationRow[]> {
  const { data, error } = await supabase
    .from("label_applications")
    .select("label_id, application_id")
    .order("created_at");
  if (error) throw error;
  return (data ?? []) as LienLabelApplicationRow[];
}

/**
 * Remplace l'ensemble des applications servies par un label. Au moins une :
 * un label sans lien retomberait sur Sophia en silence, ce qui ne doit jamais
 * arriver par un décochage.
 */
export async function definirApplicationsLabel(
  labelId: string,
  applicationIds: string[],
): Promise<void> {
  const voulues = [...new Set(applicationIds)];
  if (voulues.length === 0) throw new Error("Un label doit servir au moins une application.");
  const { error: errIns } = await supabase
    .from("label_applications")
    .upsert(
      voulues.map((application_id) => ({ label_id: labelId, application_id })),
      { onConflict: "label_id,application_id", ignoreDuplicates: true },
    );
  if (errIns) throw errIns;
  const { error: errDel } = await supabase
    .from("label_applications")
    .delete()
    .eq("label_id", labelId)
    .not("application_id", "in", `(${voulues.join(",")})`);
  if (errDel) throw errDel;
}

export async function listerReserveLabelsApplications(): Promise<ReserveLabelApplication[]> {
  const { data, error } = await supabase
    .from("label_application_reserve")
    .select(
      "label_id, nom, slug, application_id, application_slug, contenus_prets, passages_restants, comptes, demande_jour, reserve_jours",
    );
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    label_id: String(r.label_id),
    nom: String(r.nom ?? ""),
    slug: String(r.slug ?? ""),
    application_id: String(r.application_id),
    application_slug: String(r.application_slug ?? ""),
    contenus_prets: Number(r.contenus_prets ?? 0),
    passages_restants: Number(r.passages_restants ?? 0),
    comptes: Number(r.comptes ?? 0),
    demande_jour: Number(r.demande_jour ?? 0),
    reserve_jours: r.reserve_jours == null ? null : Number(r.reserve_jours),
  }));
}

/** Répartition d'un compte ; `null` = 100 % Sophia. Réservé admin (trigger en base). */
export async function majPartsApplicationsCompte(
  compteId: string,
  parts: PartsApplications | null,
): Promise<void> {
  const valeur = normaliserParts(parts);
  const { error } = await supabase
    .from("comptes")
    .update({ parts_applications: valeur })
    .eq("id", compteId);
  if (error) throw error;
}

/**
 * Créneaux où l'application demandée par la répartition n'a pas pu être
 * servie (repli sur Sophia), depuis `depuis` (YYYY-MM-DD) inclus.
 */
export async function listerReplisApplications(depuis: string): Promise<RepliApplication[]> {
  const { data, error } = await supabase
    .from("passages")
    .select(
      "id, compte_id, date_publication_prevue, application_id, application_visee_id, repli_motif, comptes(handle_tiktok, persona_nom, langue)",
    )
    .not("application_visee_id", "is", null)
    .gte("date_publication_prevue", depuis)
    .order("date_publication_prevue", { ascending: false })
    .limit(500);
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => {
    const c = Array.isArray(r.comptes) ? r.comptes[0] : r.comptes;
    return {
      id: String(r.id),
      compte_id: String(r.compte_id),
      date_publication_prevue: (r.date_publication_prevue as string | null) ?? null,
      application_id: String(r.application_id),
      application_visee_id: String(r.application_visee_id),
      repli_motif: (r.repli_motif as string | null) ?? null,
      compte: (c as RepliApplication["compte"]) ?? null,
    };
  });
}

export async function listerPertinencesContenu(contenuId: string): Promise<PertinenceContenu[]> {
  const { data, error } = await supabase
    .from("contenu_pertinences")
    .select("application_id, score, raison, note, eligible, prompt_cle, updated_at")
    .eq("contenu_id", contenuId);
  if (error) throw error;
  return ((data ?? []) as PertinenceContenu[]).map((p) => ({
    ...p,
    note: p.note == null ? null : Number(p.note),
  }));
}

export async function listerDecksApplicationsContenu(contenuId: string): Promise<DeckApplicationRow[]> {
  const { data, error } = await supabase
    .from("contenu_langue_decks")
    .select("id, langue, application_id, variante, statut, raison, slides, placement, updated_at")
    .eq("contenu_id", contenuId)
    .order("langue");
  if (error) throw error;
  return (data ?? []) as DeckApplicationRow[];
}

/** Lance / met en pause le rattrapage de pertinence d'une application sur le stock. */
export async function piloterBackfillPertinence(
  applicationId: string,
  actif: boolean,
): Promise<EtatBackfillPertinence> {
  const r = await invoke<{ ok: boolean; etat: EtatBackfillPertinence }>("import-contenu", {
    backfillPertinence: { applicationId, actif },
  });
  return r.etat;
}

export async function lireEtatBackfillPertinence(
  applicationId: string,
): Promise<EtatBackfillPertinence> {
  const r = await invoke<{ ok: boolean; etat: EtatBackfillPertinence }>("import-contenu", {
    etatBackfillPertinence: { applicationId },
  });
  return r.etat;
}

// ---------------------------------------------------------------------------
// Tiers PAR APPLICATION (migration 0270)
// ---------------------------------------------------------------------------
//
// Sophia garde `contenus.tier & co` (fiche slideshow, inchangée). Les autres
// applications ont leur tier, leur budget et leur cycle dans
// `contenu_tiers_application` ; la vue `contenu_application_tier_etat` rend
// leur état (tier d'entrée « paresseux » tant qu'aucune ligne n'est écrite).
// Le front part au merge, 0270 se passe à la main : un schéma absent se lit
// avec `estErreurSchemaAbsent` et l'écran n'affiche alors rien.

const VUE_TIER_APPLICATION = "contenu_application_tier_etat";
const TABLE_TIERS_APPLICATION = "contenu_tiers_application";
const COLONNES_TIER_APPLICATION =
  "contenu_id, application_id, tier, passages_prevus, tier_cycle, tier_maj_at, publies, en_vol, restants, moyenne_vues, max_vues, nb_150k, mesures, introuvables, en_attente_mesure, dernier_publie_at, eligible, materialise, note";

/** État tierlist de ce contenu pour chaque application autre que Sophia. */
export async function listerTiersApplicationsContenu(
  contenuId: string,
): Promise<ContenuTierEtatApplication[]> {
  const { data, error } = await supabase
    .from(VUE_TIER_APPLICATION)
    .select(COLONNES_TIER_APPLICATION)
    .eq("contenu_id", contenuId);
  if (error) throw error;
  const etats = (data ?? []) as unknown as ContenuTierEtatApplication[];
  if (etats.length === 0) return [];
  // Rapport de la dernière écriture : dans la table (RLS admin), pas dans la vue.
  const { data: lignes, error: errT } = await supabase
    .from(TABLE_TIERS_APPLICATION)
    .select("application_id, tier_rapport")
    .eq("contenu_id", contenuId);
  if (errT) throw errT;
  const rapportPar = new Map(
    ((lignes ?? []) as Array<{ application_id: string; tier_rapport: TierRapport | null }>).map(
      (l) => [l.application_id, l.tier_rapport] as const,
    ),
  );
  return etats.map((e) => ({
    ...e,
    note: e.note == null ? null : Number(e.note),
    moyenne_vues: e.moyenne_vues == null ? null : Number(e.moyenne_vues),
    tier_rapport: rapportPar.get(e.application_id) ?? null,
  }));
}

/**
 * Change à la main le rang d'un contenu POUR UNE APPLICATION (hors Sophia).
 * Même règle que `majTierContenu` côté Sophia — compteur plein sur un cycle
 * neuf, la prochaine requalification reprend la main —, mais gardée : une
 * ligne paresseuse est d'abord écrite telle quelle (cycle 0), puis l'UPDATE ne
 * passe que si le cycle lu n'a pas bougé. Sinon : erreur, rien n'est écrasé.
 */
export async function majTierContenuApplication(
  contenuId: string,
  applicationId: string,
  tier: Tier,
): Promise<void> {
  if (applicationId === ID_SOPHIA) throw new Error("Le rang Sophia se change sur la fiche (contenus.tier).");
  const { data: lu, error: errLire } = await supabase
    .from(VUE_TIER_APPLICATION)
    .select("contenu_id, application_id, tier, passages_prevus, tier_cycle, materialise, note")
    .eq("contenu_id", contenuId)
    .eq("application_id", applicationId)
    .maybeSingle();
  if (errLire) throw errLire;
  if (!lu) throw new Error("Ce contenu n'est pas noté pour cette application.");
  const courant = lu as {
    tier: Tier;
    passages_prevus: number;
    tier_cycle: number;
    materialise: boolean;
    note: number | null;
  };
  if (!courant.materialise) {
    const { error: errIns } = await supabase.from(TABLE_TIERS_APPLICATION).upsert(
      {
        contenu_id: contenuId,
        application_id: applicationId,
        tier: courant.tier,
        passages_prevus: courant.passages_prevus,
        tier_cycle: 0,
        tier_rapport: {
          origine: "entree_paresseuse",
          note: courant.note == null ? null : Number(courant.note),
          tier: courant.tier,
          passages: courant.passages_prevus,
        },
      },
      { onConflict: "contenu_id,application_id", ignoreDuplicates: true },
    );
    if (errIns) throw errIns;
  }
  const cycleLu = Number(courant.tier_cycle ?? 0);
  const maintenant = new Date().toISOString();
  const { data, error } = await supabase
    .from(TABLE_TIERS_APPLICATION)
    .update({
      tier,
      passages_prevus: PASSAGES_PAR_TIER[tier],
      tier_cycle: cycleLu + 1,
      tier_maj_at: maintenant,
      tier_rapport: {
        origine: "manuel",
        avant: courant.tier,
        apres: tier,
        regle: "changement manuel admin",
        passages: PASSAGES_PAR_TIER[tier],
        cycle: cycleLu + 1,
      },
      updated_at: maintenant,
    })
    .eq("contenu_id", contenuId)
    .eq("application_id", applicationId)
    .eq("tier_cycle", cycleLu)
    .select("contenu_id");
  if (error) throw error;
  if ((data ?? []).length === 0) {
    throw new Error("Rang modifié entre-temps (requalification ou autre admin) : recharge la fiche.");
  }
}

/** Requalifie ce contenu pour une application sans attendre minuit (action admin explicite). */
export const relancerRequalifContenuApplication = (contenuId: string, applicationId: string) =>
  invoke<{ ok: boolean; tierlist_applications?: unknown }>("minuit-vnext", {
    etapes: ["tierlist_applications"],
    contenuId,
    applicationId,
    forcer: true,
  });

/**
 * La migration 0270 est-elle passée ? « absent » sur une table / vue inconnue
 * seulement ; une panne LÈVE (jamais prise pour une absence).
 */
export async function sonderTiersApplication(): Promise<"pret" | "absent"> {
  const { error, status } = await supabase.from(VUE_TIER_APPLICATION).select("contenu_id").limit(1);
  if (!error && status !== 404) return "pret";
  if (!error) return "absent";
  if (estErreurSchemaAbsent({ ...error, status })) return "absent";
  throw error;
}

/** Bloc d'une application dans `reglages.tierlist_applications_dernier_run`. */
export interface RunTierlistApplication {
  at: string;
  examines: number;
  requalifies: number;
  enAttente: number;
  sansMesure: number;
  attendues: number | null;
  complet: boolean;
  repli: boolean;
  alerte: string | null;
  interrompu: boolean;
  dejaRequalifies: number;
  erreur: string | null;
}

/** Trace de l'étape de minuit `tierlist_applications`. */
export interface RunTiersApplications {
  jour: string;
  at: string;
  /** État de la sonde 0270 ; `null` quand l'étape a levé avant de sonder. */
  etat: "pret" | "absent" | "illisible" | null;
  /** slug → bloc. */
  applications: Record<string, RunTierlistApplication>;
  erreur: string | null;
}

export async function lireTiersApplicationsDernierRun(): Promise<RunTiersApplications | null> {
  const { data, error } = await supabase
    .from("reglages")
    .select("valeur")
    .eq("cle", "tierlist_applications_dernier_run")
    .maybeSingle();
  if (error) throw error;
  const v = data?.valeur as RunTiersApplications | null | undefined;
  return v && typeof v === "object" ? v : null;
}
