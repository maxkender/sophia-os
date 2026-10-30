/**
 * A/B traduction (0620) : la cuisson des decks du bras natif, l'après-midi.
 *
 * Le plan BLEO du lendemain (tirage de 14 h) dit quels contenus partiront sur
 * quels comptes. Pour chaque créneau d'une langue en test dont le post tombe
 * dans le bras `natif` (même tirage qu'à minuit), le circuit de production
 * écrit le deck du contenu × langue × appli, une seule fois, et le range dans
 * `decks_natifs`. À minuit, l'assignation le sert ; un deck pas cuit à temps
 * laisse partir l'ancien.
 *
 * Un appel cuit ce que son budget de temps permet (3 decks à la fois) et dit
 * ce qui reste : on le rappelle jusqu'à `restants = 0`.
 */
import { circuitDeVersion, circuitServiceApplication, commanderCta, lireSourceContenu } from "./ab_circuits.ts";
import { brasDuPost, chargerReglageAbTraduction } from "./ab_traduction.ts";
import { lirePlanBleoJour } from "./bleo_plan.ts";
import { ID_SOPHIA } from "./multi_app.ts";
import { messageErreur, type serviceClient } from "./supabase.ts";

type Supabase = ReturnType<typeof serviceClient>;

const EN_PARALLELE = 3;
const PAGE = 1000;
/** Un échec n'est retenté qu'après ce délai : un deck qui rate à 15 h ne bloque pas la file. */
const DELAI_REESSAI_MS = 2 * 3_600_000;

export interface BilanCuisson {
  ok: boolean;
  ignore?: string;
  jour?: string;
  version?: string;
  a_cuire?: number;
  cuits?: number;
  echecs?: Array<{ contenu_id: string; langue: string; raison: string }>;
  restants?: number;
}

/** Jour Paris de demain (AAAA-MM-JJ). */
export function demainParis(maintenant: Date = new Date()): string {
  const jour = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(maintenant);
  const d = new Date(`${jour}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export async function cuireDecksNatifs(
  supabase: Supabase,
  opts: { jour?: string; budgetMs?: number } = {},
): Promise<BilanCuisson> {
  const debut = Date.now();
  const budget = opts.budgetMs ?? 100_000;
  const reglage = await chargerReglageAbTraduction(supabase);
  if (!reglage.actif) return { ok: true, ignore: "A/B coupé" };
  const circuit = circuitDeVersion(reglage.circuitProduction);
  if (!circuit) return { ok: false, ignore: `circuit ${reglage.circuitProduction} non enregistré dans CIRCUITS` };

  const jour = opts.jour ?? demainParis();
  const plan = await lirePlanBleoJour(supabase, jour);
  if (!plan) return { ok: true, ignore: `pas de plan BLEO à suivre pour le ${jour}`, jour };

  // Les créneaux du plan (rappels exclus, comme à minuit).
  const lignes: Array<{ compte_id: string; contenu_id: string; langue: string; application_id: string | null }> = [];
  for (let page = 0;; page++) {
    const { data, error } = await supabase
      .from("bleo_ombre_passages")
      .select("compte_id, contenu_id, langue, application_id")
      .eq("run_id", plan.runId)
      .in("file_bleo", ["juger", "valeur"])
      .order("compte_id")
      .order("creneau")
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw error;
    lignes.push(...((data ?? []) as typeof lignes));
    if ((data ?? []).length < PAGE) break;
  }

  const { data: apps, error: errApps } = await supabase.from("applications").select("id, slug, nom");
  if (errApps) throw errApps;
  const appParId = new Map((apps ?? []).map((a) => [a.id as string, a]));

  // Un deck par contenu × langue × appli, pour les posts tirés `natif`.
  const commandes = new Map<string, { contenuId: string; langue: string; applicationId: string }>();
  for (const l of lignes) {
    const bras = brasDuPost(reglage, { compteId: l.compte_id, contenuId: l.contenu_id, jour, langue: l.langue });
    if (bras !== "natif") continue;
    const applicationId = l.application_id ?? ID_SOPHIA;
    const app = appParId.get(applicationId);
    if (!app || !circuitServiceApplication(circuit, app.slug as string)) continue;
    commandes.set(`${l.contenu_id}|${l.langue}|${applicationId}`, { contenuId: l.contenu_id, langue: l.langue, applicationId });
  }

  // Déjà cuits pour cette version (ou ratés il y a moins de 2 h).
  const ids = [...new Set([...commandes.values()].map((c) => c.contenuId))];
  const faits = new Set<string>();
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await supabase
      .from("decks_natifs")
      .select("contenu_id, langue, application_id, version, statut, cuit_le")
      .in("contenu_id", ids.slice(i, i + 100));
    if (error) throw error;
    for (const d of data ?? []) {
      if (d.version !== circuit.version) continue;
      const recent = Date.now() - Date.parse(d.cuit_le as string) < DELAI_REESSAI_MS;
      if (d.statut === "pret" || recent) faits.add(`${d.contenu_id}|${d.langue}|${d.application_id}`);
    }
  }
  const aCuire = [...commandes.entries()].filter(([cle]) => !faits.has(cle)).map(([, c]) => c);

  let cuits = 0;
  const echecs: NonNullable<BilanCuisson["echecs"]> = [];
  let i = 0;
  for (; i < aCuire.length && Date.now() - debut < budget; i += EN_PARALLELE) {
    await Promise.all(aCuire.slice(i, i + EN_PARALLELE).map(async (c) => {
      const app = appParId.get(c.applicationId)!;
      const ligne = {
        contenu_id: c.contenuId,
        langue: c.langue,
        application_id: c.applicationId,
        circuit: circuit.id,
        version: circuit.version,
        cuit_le: new Date().toISOString(),
      };
      try {
        const source = await lireSourceContenu(supabase, c.contenuId);
        if ("raison" in source) throw new Error(source.raison);
        const application = { id: c.applicationId, slug: app.slug as string, nom: app.nom as string };
        const cta = await commanderCta(supabase, {
          contenuId: c.contenuId,
          langue: c.langue,
          application,
          deckSource: source.deckSource,
        });
        const sortie = await circuit.ecrire({
          supabase,
          contenuId: c.contenuId,
          titre: source.titre,
          langueSource: source.langueSource,
          langue: c.langue,
          application,
          deckSource: source.deckSource,
          cta,
        });
        const { error } = await supabase.from("decks_natifs").upsert({
          ...ligne,
          statut: "pret",
          raison: null,
          slides: sortie.slides,
          hashtags: sortie.hashtags,
          version_fiche: sortie.versionFiche,
          modele: sortie.modele,
          voie_cta: sortie.cta?.voie ?? null,
          forme_cta: sortie.cta?.forme ?? null,
          cta_refus: sortie.cta?.refus ?? null,
          controles: sortie.controles ?? null,
        }, { onConflict: "contenu_id,langue,application_id" });
        if (error) throw error;
        cuits++;
      } catch (e) {
        const raison = messageErreur(e);
        echecs.push({ contenu_id: c.contenuId, langue: c.langue, raison });
        await supabase.from("decks_natifs").upsert(
          { ...ligne, statut: "echec", raison, slides: [] },
          { onConflict: "contenu_id,langue,application_id" },
        );
      }
    }));
  }

  return {
    ok: true,
    jour,
    version: circuit.version,
    a_cuire: aCuire.length,
    cuits,
    echecs,
    restants: Math.max(0, aCuire.length - i),
  };
}
