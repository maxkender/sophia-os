/**
 * Charge les réglages papier et réserve le quota Fal du jour Paris.
 */

import {
  erreurQuotaFal,
  normaliserReglagesPapier,
  peutReserverFal,
  usageFalDuJour,
  type PapierFalUsage,
  type ReglagesPapier,
} from "./papier_reglages_core.ts";
import { aujourdhuiParis, serviceClient } from "./supabase.ts";

type Supabase = ReturnType<typeof serviceClient>;

export {
  dureeCibleClipReglee,
  estErreurQuotaFal,
  estVoixPapier,
  voixEffectiveMaster,
  voixPourLangue,
  type ReglagesPapier,
} from "./papier_reglages_core.ts";

export async function chargerReglagesPapier(supabase: Supabase): Promise<ReglagesPapier> {
  const { data, error } = await supabase
    .from("reglages")
    .select("valeur")
    .eq("cle", "papier")
    .maybeSingle();
  if (error) throw error;
  return normaliserReglagesPapier(data?.valeur);
}

export async function papierEstActif(supabase: Supabase): Promise<boolean> {
  const r = await chargerReglagesPapier(supabase);
  return r.actif;
}

/** Coupe cron + auto-chaîne. L'admin peut encore forcer (manuel). */
export async function pauserPapier(supabase: Supabase): Promise<void> {
  const cur = await chargerReglagesPapier(supabase);
  if (!cur.actif) return;
  const { error } = await supabase.from("reglages").upsert(
    {
      cle: "papier",
      valeur: { ...cur, actif: false },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "cle" },
  );
  if (error) throw error;
}

export async function reserverFalPapier(supabase: Supabase, n = 1): Promise<number> {
  const jour = aujourdhuiParis();
  const reglages = await chargerReglagesPapier(supabase);
  const { data, error } = await supabase
    .from("reglages")
    .select("valeur")
    .eq("cle", "papier_fal_usage")
    .maybeSingle();
  if (error) throw error;
  const usage = usageFalDuJour((data?.valeur as PapierFalUsage | null) ?? null, jour);
  if (!peutReserverFal(usage, reglages.fal_quota_jour, n)) {
    throw erreurQuotaFal(usage, reglages.fal_quota_jour);
  }
  const suivant = usage + n;
  const { error: errU } = await supabase.from("reglages").upsert(
    {
      cle: "papier_fal_usage",
      valeur: { date: jour, appels: suivant },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "cle" },
  );
  if (errU) throw errU;
  return suivant;
}
