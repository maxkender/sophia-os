import type { serviceClient } from "./supabase.ts";

type Supabase = ReturnType<typeof serviceClient>;

/**
 * Prompt 17, partie B (0392) : une recrue en rouge avant sa cohorte (accès,
 * TikTok ou warm-up pas faits à la fin du délai, `recrues_rouges`) ne reçoit
 * pas de posts tant que Max ou le Head of Ops n'a pas décidé (Reporter,
 * Arrêter) dans la page Cohortes. Le rouge du mercredi (posteur qui poste
 * déjà) ne bloque rien : il passe par Check, Kill or Double le samedi.
 *
 * Une lecture en échec ne bloque personne : le moteur continue comme avant.
 */
export const ETAPES_BLOQUANTES = ["acces", "tiktok", "warmup"] as const;

export async function posteursEnRouge(supabase: Supabase): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("recrues_rouges")
    .select("poster_id")
    .is("decision", null)
    .in("etape", [...ETAPES_BLOQUANTES]);
  if (error) {
    console.warn(`recrues_rouges illisible, personne n'est bloqué : ${error.message}`);
    return new Set();
  }
  const rouges = new Set((data ?? []).map((r) => r.poster_id as string));
  // 3/11 : un posteur qui a dit STOP (demande d'arrêt ouverte, Kill prévu samedi) ne reçoit plus de posts.
  const { data: stops, error: e2 } = await supabase.from("demandes_arret").select("poster_id").is("decision", null);
  if (e2) console.warn(`demandes_arret illisible : ${e2.message}`);
  for (const r of stops ?? []) rouges.add(r.poster_id as string);
  return rouges;
}

/** Le compte n'est pas servi : son posteur est un rouge pas encore décidé. */
export function compteBloque(compte: { poster_id?: unknown }, rouges: ReadonlySet<string>): boolean {
  return typeof compte.poster_id === "string" && rouges.has(compte.poster_id);
}
