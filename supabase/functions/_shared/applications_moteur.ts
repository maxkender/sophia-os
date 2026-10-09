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
 *
 * Le piège mesuré : quand la base ne répond plus, PostgREST rend 503 PGRST002
 * « Could not query the database for the schema cache. Retrying. ». Le message
 * parle du cache de schéma, pas d'une table absente — l'ancienne règle (« schema
 * cache » quelque part dans le message) y lisait une absence. Désormais un
 * statut ≥ 500 ou un code PGRST000–PGRST003 (connexion, cache de schéma
 * indisponible) n'est JAMAIS une absence, et le message ne compte que s'il dit
 * explicitement qu'une table ou une colonne n'existe pas.
 */
export function erreurSchemaAbsent(erreur: ErreurSonde, statut?: number): boolean {
  if (typeof statut === "number" && statut >= 500) return false;
  if (!erreur) return statut === 404;
  const code = String(erreur.code ?? "");
  if (/^PGRST00[0-3]$/.test(code)) return false;
  if (["42P01", "PGRST205", "42703", "PGRST204"].includes(code)) return true;
  if (statut === 404) return true;
  return /relation .* does not exist|column .* does not exist|could not find the table|could not find the .* column/i
    .test(String(erreur.message ?? ""));
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

export type EtatSchemaMultiApp = "pret" | "absent" | "illisible";

/**
 * État de la migration 0256, sans jamais lever :
 *
 * - `pret` : mémorisé pour toute la vie de l'isolate ;
 * - `absent` (table ou colonne inconnue) : revérifié toutes les 5 min ;
 * - `illisible` (réseau, 5xx — après une seconde tentative) : JAMAIS mémorisé.
 *
 * C'est à l'appelant de décider ce que vaut `illisible` : un compte 100 %
 * Sophia reste sur le chemin d'avant (une panne passagère ne doit pas lui coûter
 * sa nuit), un compte qui demande une autre application échoue et sera rejoué.
 */
export async function sonderSchemaMultiApp(supabase: Supabase): Promise<EtatSchemaMultiApp> {
  const maintenant = Date.now();
  if (sonde?.pret) return "pret";
  if (sonde && maintenant - sonde.at < TTL_SONDE_ABSENTE_MS) return "absent";

  let r = await lireSonde(supabase);
  if ("illisible" in r) {
    await new Promise((ok) => setTimeout(ok, 500));
    r = await lireSonde(supabase);
  }
  if ("illisible" in r) {
    console.warn(`[multi-app] sonde du schéma 0256 illisible : ${r.illisible}`);
    return "illisible";
  }
  if (!r.pret) console.warn("[multi-app] schéma 0256 absent : chemin Sophia historique");
  sonde = { pret: r.pret, at: maintenant };
  return r.pret ? "pret" : "absent";
}

/**
 * La migration 0256 est-elle passée ? STRICT : une sonde illisible LÈVE —
 * pour les chemins qui écrivent des données d'application (import, decks,
 * rattrapage) et qu'il vaut mieux rejouer que de faire à moitié.
 */
export async function schemaMultiAppPret(supabase: Supabase): Promise<boolean> {
  const etat = await sonderSchemaMultiApp(supabase);
  if (etat === "illisible") {
    throw new Error("[multi-app] sonde du schéma 0256 illisible — opération à rejouer");
  }
  return etat === "pret";
}

/**
 * Variante TOLÉRANTE : une sonde illisible vaut « pas prête », donc le chemin
 * Sophia d'avant. Pour les chemins où ce repli est sans risque (recharge
 * posteur, qui ne rejette rien) et où un échec coûterait plus qu'il ne protège.
 * Pas pour une révocation admin : prise pour Sophia, elle rejetterait pour
 * toute la flotte le slideshow d'un post d'une autre application.
 */
export async function schemaMultiAppPretSinonSophia(supabase: Supabase): Promise<boolean> {
  return (await sonderSchemaMultiApp(supabase)) === "pret";
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

/** Liens label → application pour ces labels. Erreur remontée. */
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
      .select("label_id, application_id")
      .in("label_id", lot),
  );
}

/** id, slug, nom des labels (pour écarter les labels système). */
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
