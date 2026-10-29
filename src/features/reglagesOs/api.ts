import { supabase } from "@/lib/supabase/client";

/**
 * Partie E (0411) : les réglages de l'OS modifiables depuis les pages, admin
 * seulement (politiques RESTRICTIVE), chaque changement noté dans
 * `reglages_journal` avec qui et quand.
 */

export async function lireReglagesBruts(cles: readonly string[]): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.from("reglages").select("cle, valeur").in("cle", [...cles]);
  if (error) throw error;
  return Object.fromEntries((data ?? []).map((r) => [r.cle as string, r.valeur]));
}

export async function ecrireReglages(valeurs: Record<string, unknown>): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const par = { updated_by: auth.user?.id ?? null, updated_at: new Date().toISOString() };
  const lignes = Object.entries(valeurs).map(([cle, valeur]) => ({ cle, valeur, ...par }));
  if (lignes.length === 0) return;
  const { error } = await supabase.from("reglages").upsert(lignes, { onConflict: "cle" });
  if (error) throw error;
}

export interface EntreeJournal {
  cle: string;
  ancienne: unknown;
  nouvelle: unknown;
  par_nom: string;
  at: string;
}

/** Le journal de ces clés (« zones_paie: » = toutes les zones), le plus récent d'abord. */
export async function lireJournal(cles: readonly string[], limite = 20): Promise<EntreeJournal[]> {
  const { data, error } = await supabase.rpc("reglages_journal_liste", { p_cles: [...cles], p_limite: limite });
  if (error) throw error;
  return (data ?? []) as EntreeJournal[];
}

/** Le texte d'une valeur de réglage, court, pour le journal. */
export function valeurCourte(v: unknown, max = 80): string {
  if (v === null || v === undefined) return "—";
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** Les {variables} d'un texte remplies ; une variable inconnue reste telle quelle (comme les fonctions). */
export function remplirVariables(modele: string, vars: Record<string, string>): string {
  return modele.replace(/\{(\w+)\}/g, (tout, k: string) => (k in vars ? vars[k]! : tout)).trim();
}

/** Les {variables} d'un texte qui ne seront pas remplies. */
export function variablesInconnues(modele: string, connues: readonly string[]): string[] {
  const vues = [...modele.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!);
  return [...new Set(vues.filter((v) => !connues.includes(v)))];
}

/** Les motifs de fin de contrat (reasons(reasonType: CONTRACT_END_FIXED), lus le 28/10). */
export const RAISONS_FIN_UPWORK: readonly { code: string; libelle: string }[] = [
  { code: "104", libelle: "Job completed successfully" },
  { code: "107", libelle: "Job canceled for other reasons" },
  { code: "235", libelle: "Job canceled due to freelancer performance" },
  { code: "236", libelle: "Another reason" },
];

/** ISO (UTC) → valeur d'un <input type="datetime-local"> à l'heure de Paris. */
export function isoVersLocalParis(iso: string): string {
  if (!iso) return "";
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour === "24" ? "00" : p.hour}:${p.minute}`;
}

/** L'inverse : une heure de Paris → ISO (UTC), changement d'heure compris. */
export function localParisVersIso(local: string): string {
  const naif = new Date(`${local}:00Z`).getTime();
  let t = naif;
  for (let i = 0; i < 2; i++) {
    const vu = new Date(`${isoVersLocalParis(new Date(t).toISOString())}:00Z`).getTime();
    t += naif - vu;
  }
  return new Date(t).toISOString();
}

// ---------------------------------------------------------------------------
// Les zones de paie (0361) : tarif par zone, pays → zone
// ---------------------------------------------------------------------------

export interface ZonesPaie {
  zones: { zone: string; tarif: number }[];
  pays: { pays: string; zone: string }[];
  /** Les pays des comptes actifs (un pays sans zone est à régler). */
  paysActifs: string[];
}

export async function lireZonesPaie(): Promise<ZonesPaie> {
  const [z, p, c] = await Promise.all([
    supabase.from("zones_paie").select("zone, tarif").order("zone"),
    supabase.from("zones_paie_pays").select("pays, zone").order("pays"),
    supabase.from("comptes").select("pays").eq("is_active", true).not("pays", "is", null),
  ]);
  if (z.error) throw z.error;
  if (p.error) throw p.error;
  if (c.error) throw c.error;
  return {
    zones: (z.data ?? []).map((x) => ({ zone: String(x.zone), tarif: Number(x.tarif) })),
    pays: (p.data ?? []).map((x) => ({ pays: String(x.pays), zone: String(x.zone) })),
    paysActifs: [...new Set((c.data ?? []).map((x) => String(x.pays)))].sort(),
  };
}

export async function enregistrerTarifZone(zone: string, tarif: number): Promise<void> {
  const { error } = await supabase.from("zones_paie").update({ tarif }).eq("zone", zone);
  if (error) throw error;
}

export async function enregistrerZonePays(pays: string, zone: string): Promise<void> {
  const { error } = await supabase.from("zones_paie_pays").upsert({ pays: pays.toUpperCase(), zone }, { onConflict: "pays" });
  if (error) throw error;
}

/** Tous les pays à afficher : ceux qui ont une zone et ceux des comptes actifs, triés. */
export function lignesPays(z: ZonesPaie): { pays: string; zone: string | null; actif: boolean }[] {
  const zoneDe = new Map(z.pays.map((x) => [x.pays, x.zone]));
  const actifs = new Set(z.paysActifs);
  const tous = [...new Set([...zoneDe.keys(), ...actifs])].sort();
  // Les pays sans zone d'abord : ce sont eux qu'il faut régler.
  return tous
    .map((pays) => ({ pays, zone: zoneDe.get(pays) ?? null, actif: actifs.has(pays) }))
    .sort((a, b) => Number(a.zone !== null) - Number(b.zone !== null) || a.pays.localeCompare(b.pays));
}
