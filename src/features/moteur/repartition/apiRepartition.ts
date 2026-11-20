/**
 * Lectures et écritures de la page Allocation.
 *
 * ELLE N'EST PLUS EN LECTURE SEULE. Elle pose la cible entre applications,
 * l'interrupteur du choix automatique, la File, les réglages du choix de
 * label et l'ouverture ou la fermeture d'un label. Ce qu'elle ne fait
 * toujours pas : créer un compte, ou déplacer un compte existant.
 *
 * Les chiffres viennent de `simulation_repartition` (migration 0305), qui rend
 * pour chaque marché (langue × pays) les mêmes entrées que le moteur reçoit à
 * la création d'un compte. La fonction est réservée à l'admin : un rôle sans
 * droit reçoit une erreur `42501`, que la page affiche telle quelle plutôt que
 * de montrer un tableau vide qui aurait l'air normal.
 *
 * TOUTE ÉCRITURE DANS `choix_labels` FUSIONNE. La nuit écrit dans la même clé
 * (`dernier_run`, `fermes_auto`, via `fusionnerReglages` côté serveur) : poser
 * l'objet entier depuis un instantané de page effacerait sa mémoire des
 * fermetures, et des labels fermés hier rouvriraient sans que personne l'ait
 * demandé.
 */
import { supabase } from "@/lib/supabase/client";

import { ecrireReglage, invoke } from "../api";

import {
  lireCibleApplications,
  type CibleApplications,
  type MarcheApplications,
} from "./scoreApplication";
import {
  CLES_BASE_REGLAGE_LABEL,
  poserEtatManuelLabel,
  versCleBase,
  type EtatManuelLabel,
  type ValeursReglageLabel,
} from "./reglagesLabel";
import {
  lireReglagesChoixLabel,
  type ReglagesChoixLabel,
  type StatLabel,
} from "./scoreLabel";

/** Un marché : une langue, son pays, et les candidats avec leurs chiffres. */
export interface MarcheRepartition {
  langue: string;
  pays: string | null;
  /** Comptes actifs servis par l'assignation sur ce marché. */
  comptes: number;
  stats: StatLabel[];
}

interface LigneSimulation {
  langue: string;
  pays: string | null;
  label_id: string;
  label_nom: string;
  comptes_langue: number;
  comptes_pays: number;
  comptes_total: number;
  passages_restants: number | string;
  demande_jour: number | string;
  passages: number;
  perf_label: number | string | null;
  perf_flotte: number | string | null;
  recents_langue: number;
  recence_langue: number;
  recents_pays: number;
  recence_pays: number;
  pod_seul?: boolean | null;
  livre_langue?: boolean | null;
  niveau_pod?: number | string | null;
  comptes_app?: number | string | null;
}

function nombre(v: number | string | null | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function nombreOuNull(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Les marchés d'une application, triés du plus peuplé au moins peuplé.
 *
 * `comptes` est pris sur la dimension PAYS quand le pays est connu, sinon sur
 * la langue : c'est le nombre de comptes que la page affiche à côté du marché,
 * et il doit correspondre à ce que le classement a réellement regardé.
 */
export async function lireMarchesRepartition(
  applicationId: string,
): Promise<MarcheRepartition[]> {
  const { data, error } = await supabase.rpc("simulation_repartition", {
    p_application: applicationId,
  });
  if (error) throw error;

  const parMarche = new Map<string, MarcheRepartition>();
  for (const l of (data ?? []) as LigneSimulation[]) {
    const pays = l.pays ?? null;
    const k = `${l.langue}|${pays ?? ""}`;
    let m = parMarche.get(k);
    if (!m) {
      m = { langue: l.langue, pays, comptes: 0, stats: [] };
      parMarche.set(k, m);
    }
    m.stats.push({
      label_id: l.label_id,
      label_nom: l.label_nom,
      comptes_langue: nombre(l.comptes_langue),
      comptes_pays: nombre(l.comptes_pays),
      comptes_total: nombre(l.comptes_total),
      passages_restants: nombre(l.passages_restants),
      demande_jour: nombre(l.demande_jour),
      passages: nombre(l.passages),
      perf_label: nombreOuNull(l.perf_label),
      perf_flotte: nombreOuNull(l.perf_flotte),
      recents_langue: nombre(l.recents_langue),
      recence_langue: nombre(l.recence_langue),
      recents_pays: nombre(l.recents_pays),
      recence_pays: nombre(l.recence_pays),
      pod_seul: l.pod_seul === true,
      livre_langue: l.livre_langue !== false,
      niveau_pod: nombreOuNull(l.niveau_pod),
      // Absent avant 0352 : on retombe sur le total, l'affichage d'avant.
      comptes_app: l.comptes_app === undefined || l.comptes_app === null ? nombre(l.comptes_total) : nombre(l.comptes_app),
    });
  }

  for (const m of parMarche.values()) {
    const parPays = m.stats.reduce((a, s) => a + s.comptes_pays, 0);
    const parLangue = m.stats.reduce((a, s) => a + s.comptes_langue, 0);
    m.comptes = parPays > 0 ? parPays : parLangue;
  }

  return [...parMarche.values()].sort(
    (a, b) => b.comptes - a.comptes || a.langue.localeCompare(b.langue),
  );
}

interface LigneApps {
  langue: string;
  pays: string | null;
  application_id: string;
  slug: string;
  comptes: number | string;
}

/**
 * Les comptes par marché et par application. Même découpage (langue × pays)
 * que `lireMarchesRepartition`, pour que les deux tableaux de la page
 * s'alignent ligne à ligne.
 */
export async function lireMarchesApplications(): Promise<MarcheApplications[]> {
  const { data, error } = await supabase.rpc("simulation_repartition_apps");
  if (error) throw error;

  const parMarche = new Map<string, MarcheApplications>();
  for (const l of (data ?? []) as LigneApps[]) {
    const pays = l.pays ?? null;
    const k = `${l.langue}|${pays ?? ""}`;
    let m = parMarche.get(k);
    if (!m) {
      m = { langue: l.langue, pays, parts: [] };
      parMarche.set(k, m);
    }
    m.parts.push({
      application_id: l.application_id,
      slug: l.slug,
      comptes: nombre(l.comptes),
    });
  }
  return [...parMarche.values()];
}

interface LigneRecrues {
  langue: string;
  pays: string | null;
  recrues: number | string;
  recrues_site: number | string;
}

/** Recrues d'un marché sur la fenêtre, et combien venaient du site. */
export interface RecruesMarche {
  langue: string;
  pays: string | null;
  /** Comptes créés sur la fenêtre, servis par l'assignation. */
  recrues: number;
  /** Parmi eux, ceux d'un poster venu du site de recrutement. */
  recruesSite: number;
}

/** Nombre de jours sur lesquels on mesure la provenance des recrues. */
export const PROVENANCE_JOURS = 30;

/**
 * Combien de recrues par marché, et combien venaient du site de recrutement.
 *
 * UN CHIFFRE D'INFORMATION, plus une contrainte. Jusqu'au 19/11 le site
 * choisissait l'application de ses candidats : ces recrues échappaient au
 * moteur, et la page en déduisait un plancher par application et une cible
 * « impossible ». Depuis, le moteur les place comme les autres
 * (`choisirApplicationPourCompte`, manage-users) : la page dit seulement
 * combien elles sont. La fonction SQL (0310, 0337) rend toujours leur
 * ancienne répartition entre applications ; elle n'est plus lue.
 */
export async function lireRecruesSite(
  jours: number = PROVENANCE_JOURS,
): Promise<RecruesMarche[]> {
  const { data, error } = await supabase.rpc("simulation_recrues_site", {
    p_jours: jours,
  });
  if (error) throw error;

  return ((data ?? []) as LigneRecrues[]).map((l) => ({
    langue: l.langue,
    pays: l.pays ?? null,
    recrues: nombre(l.recrues),
    recruesSite: nombre(l.recrues_site),
  }));
}

/**
 * La cible de répartition entre applications, si un admin en a posé une.
 * `slugs` : les applications qui peuvent recevoir un compte (`candidates.ts`).
 */
export async function lireCibleRepartitionApps(
  slugs: readonly string[],
): Promise<CibleApplications> {
  const { data, error } = await supabase
    .from("reglages")
    .select("valeur")
    .eq("cle", "repartition_applications")
    .maybeSingle();
  if (error) throw error;
  return lireCibleApplications(data?.valeur, slugs);
}

/** La fonction SQL n'existe pas (encore) : PostgREST ne la trouve pas, ou Postgres. */
function estFonctionAbsente(err: unknown): boolean {
  const code = String((err as { code?: unknown } | null)?.code ?? "");
  return code === "PGRST202" || code === "42883";
}

/**
 * Les applications EN PRÉPARATION : inactives, mais déjà servies par au moins
 * un label slideshow (`applications_en_preparation`, migration 0770). Elles
 * peuvent recevoir de nouveaux comptes sans rien publier avant leur
 * activation.
 *
 * La règle vit en SQL et le moteur lit LA MÊME fonction
 * (`stats_choix_application`) : la page ne peut pas proposer une application
 * que la création de compte ignorerait, ni l'inverse.
 *
 * Migration pas encore passée : aucune. La page se comporte alors comme avant
 * (applications actives seules), ce qui est aussi ce que fait le moteur. Toute
 * autre erreur lève : une panne ne doit pas faire disparaître une application
 * de la cible sans le dire.
 */
export async function lireApplicationsEnPreparation(): Promise<string[]> {
  const { data, error } = await supabase.rpc("applications_en_preparation");
  if (error) {
    if (estFonctionAbsente(error)) return [];
    throw error;
  }
  return ((data ?? []) as Array<{ application_id?: unknown }>)
    .map((l) => String(l.application_id ?? ""))
    .filter(Boolean);
}



/** `reglages.choix_application_auto` : l'interrupteur de la bascule. */
export const CLE_CHOIX_APPLICATION_AUTO = "choix_application_auto";

/**
 * Le moteur choisit-il l'application à la création ?
 *
 * Éteint par défaut, et éteint aussi si la valeur est illisible : la même
 * règle que côté serveur (`manage-users`), pour que les deux ne puissent pas
 * se contredire. Les deux lisent CETTE clé, et c'est ce qui garantit qu'ils
 * basculent ensemble : si le front cachait la case sans que le serveur
 * décide, tout partirait sur Sophia ; si le serveur décidait sans que le
 * front cache la case, le recruteur continuerait d'imposer son choix.
 */
export async function lireChoixApplicationAuto(): Promise<boolean> {
  const { data, error } = await supabase
    .from("reglages")
    .select("valeur")
    .eq("cle", CLE_CHOIX_APPLICATION_AUTO)
    .maybeSingle();
  if (error) throw error;
  const v = data?.valeur;
  return !!(v && typeof v === "object" && !Array.isArray(v) && (v as { actif?: unknown }).actif === true);
}

/**
 * Allume ou éteint le choix automatique. C'est LA bascule : à partir de là,
 * l'application d'un nouveau compte n'est plus cochée par le recruteur mais
 * décidée par la cible ci-dessus. Les comptes existants ne bougent pas.
 */
export async function ecrireChoixApplicationAuto(actif: boolean): Promise<void> {
  await ecrireReglage(CLE_CHOIX_APPLICATION_AUTO, { actif });
}

/** `reglages.choix_labels`. Absent en base : les valeurs par défaut du moteur. */
export async function lireReglagesRepartition(): Promise<ReglagesChoixLabel> {
  const { data, error } = await supabase
    .from("reglages")
    .select("valeur")
    .eq("cle", "choix_labels")
    .maybeSingle();
  if (error) throw error;
  return lireReglagesChoixLabel(data?.valeur);
}

/**
 * Pose la cible de répartition entre applications.
 *
 * Écrit des pourcentages entiers par slug dans `reglages.repartition_applications`.
 * Depuis que le choix automatique est allumé, le moteur LIT cette clé à chaque
 * création : la poser ne change plus seulement ce que la page projette, elle
 * change où part la prochaine recrue.
 */
export async function ecrireCibleRepartitionApps(
  parts: Readonly<Record<string, number>>,
): Promise<void> {
  const propre: Record<string, number> = {};
  for (const [slug, v] of Object.entries(parts)) {
    const n = Math.round(Number(v));
    if (slug && Number.isFinite(n) && n > 0) propre[slug] = n;
  }
  await ecrireReglage("repartition_applications", propre);
}

/** `reglages.choix_labels` : les réglages du choix de label, et les fermetures. */
export const CLE_CHOIX_LABELS = "choix_labels";

/**
 * Relit la clé, applique la mutation, réécrit. Jamais un `set` sec.
 *
 * Deux écrivains se partagent `choix_labels` : cette page, et l'assignation de
 * nuit qui y pose `dernier_run` et `fermes_auto` (`fermeture_labels.ts`).
 * Écrire l'objet entier depuis ce que la page avait chargé effacerait la
 * mémoire des fermetures automatiques, et tous les labels fermés
 * rouvriraient d'un coup. La relecture juste avant l'écriture laisse une
 * fenêtre de quelques millisecondes, qu'on accepte : la nuit tourne à 22:00
 * UTC et personne n'édite ces réglages à ce moment-là.
 */
async function fusionnerChoixLabels(
  muter: (valeur: Record<string, unknown>) => Record<string, unknown>,
): Promise<void> {
  const { data, error } = await supabase
    .from("reglages")
    .select("valeur")
    .eq("cle", CLE_CHOIX_LABELS)
    .maybeSingle();
  if (error) throw error;
  const brut = data?.valeur;
  const actuel =
    brut && typeof brut === "object" && !Array.isArray(brut)
      ? { ...(brut as Record<string, unknown>) }
      : {};
  await ecrireReglage(CLE_CHOIX_LABELS, muter(actuel));
}

/**
 * Pose les douze réglages du choix de label.
 *
 * Ils ne s'éditaient qu'en SQL, donc en pratique jamais : la clé ne portait
 * que la trace des runs de nuit et le moteur tournait sur les valeurs par
 * défaut du code. Les écrire les fige en base, ce qui est le but — mais c'est
 * aussi pour ça que `remettreReglagesChoixLabelDefaut` existe : retirer les
 * clés rend la main au code, alors que réécrire les mêmes nombres gèlerait des
 * défauts qui pourraient changer.
 */
export async function ecrireReglagesChoixLabel(valeurs: ValeursReglageLabel): Promise<void> {
  const champs = versCleBase(valeurs);
  await fusionnerChoixLabels((v) => ({ ...v, ...champs }));
}

/** Retire les douze clés : le moteur reprend ses valeurs par défaut. */
export async function remettreReglagesChoixLabelDefaut(): Promise<void> {
  await fusionnerChoixLabels((v) => {
    for (const cle of CLES_BASE_REGLAGE_LABEL) delete v[cle];
    return v;
  });
}

/**
 * Ouvre, ferme ou rend à l'automatique un label, POUR UNE APPLICATION.
 *
 * Les listes par application gagnent sur les listes globales et sur la
 * mémoire de la nuit (`estFerme` les lit en premier), donc ce geste est
 * toujours effectif — y compris sur un label que la nuit avait fermé. Il ne
 * déplace aucun compte : un label fermé ici cesse d'être choisi à la création,
 * et c'est la nuit qui sortira les comptes qui le portent.
 */
export async function ecrireEtatManuelLabel(args: {
  applicationId: string;
  labelId: string;
  etat: EtatManuelLabel;
}): Promise<void> {
  await fusionnerChoixLabels((v) => {
    const r = lireReglagesChoixLabel(v);
    const { ouvertsApp, fermesApp } = poserEtatManuelLabel(
      r,
      args.applicationId,
      args.labelId,
      args.etat,
    );
    return { ...v, labels_ouverts_app: ouvertsApp, labels_fermes_app: fermesApp };
  });
}

/**
 * Les douze réglages sont-ils POSÉS en base, ou le moteur tourne-t-il sur les
 * valeurs par défaut du code ?
 *
 * `lireReglagesRepartition` ne peut pas répondre : elle rend des valeurs
 * complètes dans les deux cas, c'est tout son intérêt. Or l'écran doit le
 * dire, sinon « Réglages en vigueur » laisse croire que quelqu'un a choisi ces
 * nombres alors que personne n'y a jamais touché.
 */
export async function lireReglagesChoixLabelPoses(): Promise<boolean> {
  const { data, error } = await supabase
    .from("reglages")
    .select("valeur")
    .eq("cle", CLE_CHOIX_LABELS)
    .maybeSingle();
  if (error) throw error;
  const v = data?.valeur;
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  return CLES_BASE_REGLAGE_LABEL.some((cle) => (v as Record<string, unknown>)[cle] !== undefined);
}

/** Ce que rend la fermeture d'un label avec réaffectation (0794, `fermeture_labels.ts`). */
export interface ReaffectationLabel {
  dryRun: boolean;
  deplaces: Array<{ compte_id: string; handle: string | null; langue?: string | null; de: string[]; vers: string; meme_theme?: boolean }>;
  retires: Array<{ compte_id: string; handle: string | null; labels: string[] }>;
  manuels: Array<{ compte_id: string; handle: string | null; raison: string }>;
  /** Comptes pas encore traités (budget de temps) : rappeler. */
  reportes: number;
  erreurs: string[];
}

/**
 * Réaffecte tout de suite les comptes d'un label fermé, dans le même thème
 * d'abord (0794). `dryRun` : l'aperçu, rien n'est écrit. L'appel réel est borné
 * en temps : tant que `reportes` n'est pas nul, il faut rappeler.
 */
export async function reaffecterLabelFerme(labelId: string, dryRun: boolean): Promise<ReaffectationLabel> {
  const out = await invoke<{ ok: boolean; saute?: boolean; raison?: string; labels?: ReaffectationLabel; erreurs?: unknown }>(
    "minuit-vnext",
    { etapes: ["labels"], labels: [labelId], dryRun, forcer: true },
  );
  if (!out.labels) throw new Error(out.raison ?? "minuit-vnext : l'étape labels n'a rien rendu");
  return out.labels;
}

/** Tous les comptes d'un label fermé, en plusieurs appels si besoin (6 au plus). */
export async function reaffecterLabelFermeEnEntier(labelId: string): Promise<ReaffectationLabel> {
  const total: ReaffectationLabel = { dryRun: false, deplaces: [], retires: [], manuels: [], reportes: 0, erreurs: [] };
  for (let i = 0; i < 6; i++) {
    const r = await reaffecterLabelFerme(labelId, false);
    total.deplaces.push(...r.deplaces);
    total.retires.push(...r.retires);
    total.manuels.push(...r.manuels);
    total.erreurs.push(...r.erreurs);
    total.reportes = r.reportes;
    // Plus rien à faire, ou un tour qui n'avance pas (que des comptes à voir à la main).
    if (r.reportes === 0 || r.deplaces.length + r.retires.length === 0) break;
  }
  return total;
}
