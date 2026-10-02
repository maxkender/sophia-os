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

export interface ApplicationMulti extends ApplicationOs {
  /** Langues de compte ciblées ; `null` = toutes. */
  langues: string[] | null;
  actif: boolean;
}

export interface LienLabelApplicationRow {
  label_id: string;
  application_id: string;
  angle: string | null;
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
  angles: string | null;
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
    .select("label_id, application_id, angle")
    .order("created_at");
  if (error) throw error;
  return (data ?? []) as LienLabelApplicationRow[];
}

/**
 * Remplace l'ensemble des applications servies par un label (angles des liens
 * conservés). Au moins une : un label sans lien retomberait sur Sophia en
 * silence, ce qui ne doit jamais arriver par un décochage.
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

/** Angle d'un label pour une application (vide = pas d'angle). Le lien doit exister. */
export async function majAngleLabel(
  labelId: string,
  applicationId: string,
  angle: string,
): Promise<void> {
  const valeur = angle.trim() || null;
  const { data, error } = await supabase
    .from("label_applications")
    .update({ angle: valeur, updated_at: new Date().toISOString() })
    .eq("label_id", labelId)
    .eq("application_id", applicationId)
    .select("label_id");
  if (error) throw error;
  if ((data ?? []).length === 0) throw new Error("Ce label ne sert pas cette application.");
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
    .select("application_id, score, raison, note, eligible, angles, prompt_cle, updated_at")
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
