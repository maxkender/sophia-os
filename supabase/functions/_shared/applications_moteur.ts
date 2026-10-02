/**
 * Lectures base du multi-applications (labels → applications, applications
 * actives). La logique pure vit dans `multi_app.ts`, testée côté front.
 *
 * Tolérance de déploiement : les fonctions Edge se déploient au merge, les
 * migrations se passent à la main. Si le code arrive AVANT la migration 0256,
 * `schemaMultiAppPret` répond `false` et tout le moteur retombe sur le
 * comportement historique (100 % Sophia, aucune colonne nouvelle écrite) au
 * lieu de casser l'import ou la nuit d'assignation.
 */
import { lireParLots } from "./lots.ts";
import {
  ID_SOPHIA,
  SLUG_SOPHIA,
  type ApplicationMoteur,
  type LabelRef,
  type LienLabelApplication,
} from "./multi_app.ts";

type Supabase = ReturnType<typeof import("./supabase.ts").serviceClient>;

export const APPLICATION_SOPHIA_SECOURS: ApplicationMoteur = {
  id: ID_SOPHIA,
  slug: SLUG_SOPHIA,
  nom: "Sophia",
  langues: null,
  actif: true,
};

/**
 * Durée de vie d'un « 0256 absente ». Un « présente » vaut pour toute la vie de
 * l'isolate : la migration est additive et ne se défait pas.
 */
const TTL_SONDE_ABSENTE_MS = 5 * 60 * 1000;
let sonde: { pret: boolean; at: number } | null = null;

type ErreurSonde = { code?: string; message?: string } | null;

/**
 * « Cette table / colonne n'existe pas » — et RIEN d'autre (même règle que
 * `relationAbsente` de tierlist.ts). Un 500, un 502 ou une coupure réseau ne
 * disent rien du schéma : les prendre pour « 0256 absente » ferait publier en
 * Sophia des comptes 100 % Unswipe pendant 5 minutes.
 */
export function erreurSchemaAbsent(erreur: ErreurSonde, statut?: number): boolean {
  if (!erreur) return statut === 404;
  const code = String(erreur.code ?? "");
  if (["42P01", "PGRST205", "42703", "PGRST204"].includes(code)) return true;
  if (statut === 404) return true;
  return /does not exist|could not find the table|schema cache/i.test(
    String(erreur.message ?? ""),
  );
}

async function lireSonde(
  supabase: Supabase,
): Promise<{ pret: boolean } | { illisible: string }> {
  // GET borné, JAMAIS HEAD : sur une table absente PostgREST répond 404 sans
  // corps, et postgrest-js transforme « 404 + corps vide » en succès 204
  // (contournement de son issue #295). Mesuré sur ce projet avant 0256 : la
  // sonde HEAD disait « prête » — et toute la nuit d'assignation serait tombée.
  const lectures = [
    () => supabase.from("label_applications").select("label_id").limit(1),
    () => supabase.from("applications").select("id, langues, actif").limit(1),
    () => supabase.from("passages").select("application_id").limit(1),
  ];
  for (const lecture of lectures) {
    const { error, status } = await lecture();
    if (!error && status !== 404) continue;
    if (erreurSchemaAbsent(error, status)) return { pret: false };
    return { illisible: error?.message || `HTTP ${status}` };
  }
  return { pret: true };
}

/**
 * La migration 0256 est-elle passée ?
 *
 * - présente : vrai pour toute la vie de l'isolate ;
 * - absente (table ou colonne inconnue) : faux, revérifié toutes les 5 min ;
 * - illisible (réseau, 5xx) : une seconde tentative, puis on LÈVE sans rien
 *   mémoriser. L'appelant échoue et sera rejoué (compte de la nuit, pas
 *   d'import) plutôt que de basculer en silence sur le chemin 100 % Sophia.
 */
export async function schemaMultiAppPret(supabase: Supabase): Promise<boolean> {
  const maintenant = Date.now();
  if (sonde?.pret) return true;
  if (sonde && maintenant - sonde.at < TTL_SONDE_ABSENTE_MS) return false;

  let r = await lireSonde(supabase);
  if ("illisible" in r) {
    await new Promise((ok) => setTimeout(ok, 500));
    r = await lireSonde(supabase);
  }
  if ("illisible" in r) {
    throw new Error(`[multi-app] sonde du schéma 0256 illisible : ${r.illisible}`);
  }
  if (!r.pret) console.warn("[multi-app] schéma 0256 absent : chemin Sophia historique");
  sonde = { pret: r.pret, at: maintenant };
  return r.pret;
}

/** Pour les tests : oublie la sonde. */
export function oublierSondeMultiApp(): void {
  sonde = null;
}

/**
 * Toutes les applications (table minuscule, une requête). Sophia est toujours
 * présente, active et sans restriction de langue, quoi que dise la base : c'est
 * le repli universel du moteur.
 */
export async function chargerApplicationsMoteur(
  supabase: Supabase,
): Promise<ApplicationMoteur[]> {
  if (!(await schemaMultiAppPret(supabase))) return [APPLICATION_SOPHIA_SECOURS];
  const { data, error } = await supabase
    .from("applications")
    .select("id, slug, nom, langues, actif")
    .order("created_at", { ascending: true });
  if (error) throw new Error(`applications : ${error.message}`);
  const apps = ((data ?? []) as Array<{
    id: string;
    slug: string;
    nom: string;
    langues: string[] | null;
    actif: boolean | null;
  }>).map((a): ApplicationMoteur => ({
    id: a.id,
    slug: a.slug,
    nom: a.nom,
    langues: a.id === ID_SOPHIA ? null : (a.langues ?? null),
    actif: a.id === ID_SOPHIA ? true : Boolean(a.actif),
  }));
  if (!apps.some((a) => a.id === ID_SOPHIA)) apps.unshift(APPLICATION_SOPHIA_SECOURS);
  return apps;
}

/** Liens label → application (avec angle) pour ces labels. Erreur remontée. */
export async function chargerLiensLabels(
  supabase: Supabase,
  labelIds: readonly string[],
): Promise<LienLabelApplication[]> {
  const ids = [...new Set(labelIds.filter(Boolean))];
  if (ids.length === 0) return [];
  if (!(await schemaMultiAppPret(supabase))) return [];
  return await lireParLots<LienLabelApplication>(ids, "label_applications", (lot) =>
    supabase
      .from("label_applications")
      .select("label_id, application_id, angle")
      .in("label_id", lot),
  );
}

/** id, slug, nom des labels (pour écarter les labels système, nommer les angles). */
export async function chargerLabelsRefs(
  supabase: Supabase,
  labelIds: readonly string[],
): Promise<LabelRef[]> {
  const ids = [...new Set(labelIds.filter(Boolean))];
  if (ids.length === 0) return [];
  return await lireParLots<LabelRef>(ids, "labels", (lot) =>
    supabase.from("labels").select("id, slug, nom").in("id", lot),
  );
}

/** Labels d'un contenu (contenu_labels → labels). Erreur remontée. */
export async function chargerLabelsDuContenu(
  supabase: Supabase,
  contenuId: string,
): Promise<LabelRef[]> {
  const { data, error } = await supabase
    .from("contenu_labels")
    .select("label_id, labels(id, slug, nom)")
    .eq("contenu_id", contenuId);
  if (error) throw new Error(`contenu_labels : ${error.message}`);
  const out: LabelRef[] = [];
  for (const row of (data ?? []) as Array<{
    label_id: string;
    labels: LabelRef | LabelRef[] | null;
  }>) {
    const l = Array.isArray(row.labels) ? row.labels[0] : row.labels;
    out.push(l ? { id: l.id, slug: l.slug ?? null, nom: l.nom ?? null } : { id: row.label_id });
  }
  return out;
}
