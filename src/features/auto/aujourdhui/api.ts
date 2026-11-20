import { supabase } from "@/lib/supabase/client";

/** 12/11 (OS clair, 0677) : les chiffres de la page « Aujourd'hui ». */
export interface ChiffresAujourdhui {
  pour_max: number;
  pour_adrien: number;
  ruul_a_inviter: number;
  /** 0678 : seulement pays introuvable ou fermé (la règle tranche le reste). */
  contrats_a_relier: number;
  /** 0681 : heures depuis le dernier import des statuts Ruul (null : jamais). */
  ruul_import_heures: number | null;
  /** 0690 : signés dont le compte n'a pas pu être créé (7 derniers jours). */
  creations_echouees: number;
  /** 0690 : emails du parcours Ruul en erreur (24 h). */
  parcours_erreurs: number;
  /** 0700 : le suivi des emails (Brevo). */
  emails_en_file: number;
  emails_non_delivres: number;
  brevo_sans_credit: boolean;
  brevo_cle_absente: boolean;
  /** 0701 : crédits Brevo restants (null : inconnus). */
  brevo_credits: number | null;
}

export async function lireAujourdhui(): Promise<ChiffresAujourdhui> {
  const { data, error } = await supabase.rpc("os_aujourdhui");
  if (error) throw new Error(error.message);
  const d = (data ?? {}) as Partial<ChiffresAujourdhui>;
  return { pour_max: Number(d.pour_max ?? 0), pour_adrien: Number(d.pour_adrien ?? 0), ruul_a_inviter: Number(d.ruul_a_inviter ?? 0), contrats_a_relier: Number(d.contrats_a_relier ?? 0),
    ruul_import_heures: d.ruul_import_heures === null || d.ruul_import_heures === undefined ? null : Number(d.ruul_import_heures),
    creations_echouees: Number(d.creations_echouees ?? 0), parcours_erreurs: Number(d.parcours_erreurs ?? 0),
    emails_en_file: Number(d.emails_en_file ?? 0), emails_non_delivres: Number(d.emails_non_delivres ?? 0),
    brevo_sans_credit: d.brevo_sans_credit === true, brevo_cle_absente: d.brevo_cle_absente === true,
    brevo_credits: d.brevo_credits === null || d.brevo_credits === undefined ? null : Number(d.brevo_credits) };
}

// ── 21/11 (Max, points 7 et 10) : la vraie page « Aujourd'hui » (0805 : aujourdhui_lire, aujourdhui_details, support_qualite) ──

export type Ton = "rouge" | "orange" | "gris";
export type CleSection = "valider" | "argent" | "posteurs" | "contenu" | "technique";

export interface LigneJour {
  id: string;
  titre: string;
  detail: string | null;
  ton: Ton;
  depuis: string | null;
  nb: number | null;
  montant: number | null;
  posteurs: string[];
  demandes: string[];
  lien: string | null;
  lien_label: string | null;
  categorie: string | null;
  plateforme: "upwork" | "ruul" | null;
}

export interface SectionJour {
  cle: CleSection;
  titre: string;
  lignes: LigneJour[];
}

export interface Jour {
  resume: { a_valider: number; cas: number; problemes: number; reponses: number; corrections: number };
  sections: SectionJour[];
  chiffres: {
    comptes_actifs: number; posts_jour: number; ruul: number; upwork: number;
    support_sans_humain: number | null; demandes_24h: number;
  };
}

export async function lireJour(): Promise<Jour> {
  const { data, error } = await supabase.rpc("aujourdhui_lire");
  if (error) throw new Error(error.message);
  const j = data as Jour;
  return { ...j, sections: (j.sections ?? []).map((s) => ({ ...s, lignes: s.lignes ?? [] })) };
}

export interface PosteurJour {
  id: string;
  nom: string | null;
  email: string | null;
  plateforme: string;
  handles: string[];
}

export interface DemandeJour {
  id: string;
  poster_id: string | null;
  source: string | null;
  categorie: string | null;
  plateforme: string | null;
  cree_at: string;
  statut: string;
  texte: string | null;
  proposition: string | null;
}

export async function lireDetails(posteurs: string[], demandes: string[] | null): Promise<{ posteurs: PosteurJour[]; demandes: DemandeJour[] }> {
  const { data, error } = await supabase.rpc("aujourdhui_details", { p_posteurs: posteurs, p_demandes: demandes });
  if (error) throw new Error(error.message);
  const d = (data ?? {}) as { posteurs?: PosteurJour[]; demandes?: DemandeJour[] };
  return { posteurs: d.posteurs ?? [], demandes: d.demandes ?? [] };
}

export interface QualiteSemaine {
  lundi: string;
  demandes: number;
  sans_humain: number;
  pct_sans_humain: number | null;
  objectif: number;
  delai_premiere_reponse_min: number | null;
  delai_reponse_humaine_min: number | null;
  rouverts: number;
  niveau2_par_sujet: Record<string, number>;
  emails: { envoyes: number; delivres: number; refuses: number };
  emails_entrants_non_relies: number;
  a_relire: { id: string; categorie: string | null; langue: string | null; demande: string | null; reponse: string | null }[];
}

export async function lireQualite(lundi: string | null): Promise<QualiteSemaine> {
  const { data, error } = await supabase.rpc("support_qualite", { p_lundi: lundi });
  if (error) throw new Error(error.message);
  return data as QualiteSemaine;
}
