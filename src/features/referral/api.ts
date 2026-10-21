import { supabase } from "@/lib/supabase/client";
import {
  texteOuNull,
  validerReferral,
  type ReferralPayload,
  type StatutReferral,
} from "./referral";

export type CreatorReferral = {
  id: string;
  referrer_id: string;
  prenom: string;
  nom: string | null;
  pays: string;
  contact_upwork: string | null;
  contact_email: string | null;
  contact_telephone: string | null;
  confirme_present: boolean;
  confirme_fiable: boolean;
  confirme_majeur: boolean;
  statut: StatutReferral;
  note_admin: string | null;
  decide_par: string | null;
  decide_at: string | null;
  recrue_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ReferralReferrer = {
  prenom: string | null;
  nom: string | null;
  email: string | null;
};

export type CreatorReferralAdmin = CreatorReferral & {
  referrer: ReferralReferrer | null;
};

const COLONNES =
  "id, referrer_id, prenom, nom, pays, contact_upwork, contact_email, contact_telephone, confirme_present, confirme_fiable, confirme_majeur, statut, note_admin, decide_par, decide_at, recrue_id, created_at, updated_at";

function corpsInsert(referrerId: string, payload: ReferralPayload) {
  const erreur = validerReferral(payload);
  if (erreur) throw new Error(erreur);
  return {
    referrer_id: referrerId,
    prenom: payload.prenom.trim(),
    nom: texteOuNull(payload.nom),
    pays: payload.pays,
    contact_upwork: texteOuNull(payload.contact_upwork),
    contact_email: texteOuNull(payload.contact_email),
    confirme_present: true,
    confirme_fiable: true,
    confirme_majeur: true,
  };
}

/** Propositions du créateur connecté (RLS = les siennes). */
export async function listerMesReferrals(): Promise<CreatorReferral[]> {
  const { data, error } = await supabase
    .from("creator_referrals")
    .select(COLONNES)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as CreatorReferral[];
}

export async function creerReferral(payload: ReferralPayload): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user?.id) throw new Error("referral.err.session");
  const { error } = await supabase.from("creator_referrals").insert(corpsInsert(auth.user.id, payload));
  if (error) throw error;
}

/** Toutes les propositions, avec le profil du parrain (admin). */
export async function listerReferralsAdmin(): Promise<CreatorReferralAdmin[]> {
  const { data, error } = await supabase
    .from("creator_referrals")
    .select(COLONNES)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as CreatorReferral[];
  const ids = [...new Set(rows.map((r) => r.referrer_id))];
  if (ids.length === 0) return [];

  const { data: profils, error: errProfils } = await supabase
    .from("profiles")
    .select("id, prenom, nom, email")
    .in("id", ids);
  if (errProfils) throw errProfils;
  const parId = new Map(
    (profils ?? []).map((p) => [
      p.id as string,
      {
        prenom: (p.prenom as string | null) ?? null,
        nom: (p.nom as string | null) ?? null,
        email: (p.email as string | null) ?? null,
      },
    ]),
  );
  return rows.map((r) => ({ ...r, referrer: parId.get(r.referrer_id) ?? null }));
}

export async function deciderReferral(
  id: string,
  statut: Exclude<StatutReferral, "en_attente">,
  note?: string,
): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("creator_referrals")
    .update({
      statut,
      note_admin: texteOuNull(note),
      decide_par: auth.user?.id ?? null,
      decide_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;
}
