/**
 * Fermeture des labels faibles, à l'assignation de nuit (minuit-vnext, juste
 * avant de remplir la journée).
 *
 * POURQUOI À L'ASSIGNATION. Fermer un label aux seules créations ne change
 * rien aux comptes qui le portent : ils continuent de poster un contenu qui
 * fait moins bien que la flotte. Le 15/10, il a fallu sortir à la main les dix
 * comptes d'alpha_male_film (0,58 de la flotte sur 245 posts) ; une heure plus
 * tard, le choix à la création en recréait un dedans (`sam.focus429`).
 *
 * CHAQUE NUIT :
 *   1. pour chaque application active, les chiffres de ses labels slideshow
 *      (`stats_choix_label`, 0287) ; un label sous `fermeturePerf` de la flotte
 *      sur au moins `fermetureMinPosts` posts est FERMÉ, et la fermeture est
 *      mémorisée dans `reglages.choix_labels.fermes_auto` (un label fermé ne
 *      poste plus, ses chiffres s'éteignent : il ne doit pas se rouvrir seul) ;
 *   2. chaque compte actif qui porte un label fermé pour son application
 *      principale le perd ; s'il ne lui reste aucun label, il en reçoit un
 *      nouveau, choisi comme à la création (`choisirLabel` : performance,
 *      réserve, langue et pays du compte) ;
 *   3. au plus `relabelsMaxParNuit` comptes touchés par nuit (garde-fou d'un
 *      réglage mal posé), et pas plus de `BUDGET_LABELS_MS` (20 s) passées à
 *      déplacer : l'étape tourne AVANT le drain de l'assignation Sophia, elle
 *      ne doit pas le retarder (même borne que `tierlist_applications`). Le
 *      reste attend la nuit suivante.
 *
 * DANS LE MÊME THÈME (0794, décision d'Adrien du 20/11). Le nouveau label est
 * cherché d'abord parmi ceux du même thème que le label quitté (études,
 * carrière, running, alpha… : `themeMotsDuLabel`) et d'un genre compatible,
 * puis parmi ceux d'un genre compatible, puis parmi tous. Un palier ne sert
 * que s'il a un label qui n'est pas « à sec » ; le choix dans le palier reste
 * celui de la création (`classerLabels`, places libres des podz d'abord).
 *
 * TOUT DE SUITE (0794). `labels` : ferme et réaffecte les comptes de CES labels
 * maintenant, sans attendre la nuit, sans le plafond de la nuit, et sans
 * refaire les fermetures automatiques. C'est le bouton « Fermé » de la page
 * Allocation ; il rappelle la fonction tant qu'il reste des comptes
 * (`reportes`). Chaque déplacement passe par `compte_deplacer` (journal
 * `comptes_deplacements`, annulable).
 *
 * Un compte UGC (persona IA) qui n'aurait plus de label n'est pas réaffecté :
 * son label doit porter des contenus UGC, c'est un choix humain. Il est
 * signalé. Réouvrir un label : l'ajouter à `labels_ouverts` (ou retirer sa clé
 * de `fermes_auto`) dans `reglages.choix_labels`.
 */

import {
  classerLabels,
  cleFermeture,
  doitFermer,
  estFerme,
  type FermetureAuto,
  lireReglagesChoixLabel,
  normaliserStatLabel,
  perfRelative,
  type ReglagesChoixLabel,
  type StatLabelCreation,
} from "./choix_label_equilibre.ts";
import { estLabelFileSlideshow } from "./labels_file.ts";
import { genreDuLabel, themeMotsDuLabel } from "./label_theme.ts";
import { labelsServantApplication } from "./labels_repli.ts";
import { ID_SOPHIA, type LienLabelApplication, normaliserParts } from "./multi_app.ts";

type Supabase = ReturnType<typeof import("./supabase.ts").serviceClient>;

export const CLE_REGLAGES_CHOIX_LABELS = "choix_labels";
/** Fenêtre anti-rafale lue par la RPC (les 3 derniers comptes de la langue / du pays). */
export const RECENTS_CHOIX_LABEL = 3;
/** Temps maximal passé à déplacer des comptes, la nuit, avant le drain. */
export const BUDGET_LABELS_MS = 20_000;

export interface ApplicationRef {
  id: string;
  slug: string;
}

export interface CompteLabels {
  id: string;
  handle: string | null;
  langue: string | null;
  pays: string | null;
  ugc: boolean;
  partsApplications: unknown;
  labels: string[];
}

export interface ActionCompte {
  compteId: string;
  /** Application sur laquelle la fermeture se mesure (la plus grosse part). */
  principale: string;
  /** Applications que le nouveau label doit toutes servir (parts > 0). */
  requises: string[];
  retirer: string[];
  garder: string[];
  /** Plus aucun label après retrait : il en faut un nouveau. */
  besoinNouveau: boolean;
  /** Raison d'un traitement laissé à un humain. */
  manuel?: string;
}

/**
 * Applications d'un compte d'après `parts_applications` : la principale (plus
 * grosse part, puis slug) et toutes celles à part > 0. Sans répartition, ou si
 * aucune n'est connue : Sophia, le défaut de la flotte.
 */
export function applicationsDuCompte(
  partsBrutes: unknown,
  applications: readonly ApplicationRef[],
): { principale: string; requises: string[] } {
  const parts = normaliserParts(partsBrutes);
  if (!parts) return { principale: ID_SOPHIA, requises: [ID_SOPHIA] };
  const parSlug = new Map(applications.map((a) => [a.slug, a.id]));
  const triees = Object.entries(parts)
    .filter(([slug]) => parSlug.has(slug))
    .sort(([a, pa], [b, pb]) => pb - pa || (a < b ? -1 : a > b ? 1 : 0));
  if (triees.length === 0) return { principale: ID_SOPHIA, requises: [ID_SOPHIA] };
  const ids = triees.map(([slug]) => parSlug.get(slug)!);
  return { principale: ids[0], requises: ids };
}

/** Ce que la nuit doit faire de chaque compte qui porte un label fermé. */
export function planifierReaffectations(
  comptes: readonly CompteLabels[],
  applications: readonly ApplicationRef[],
  ferme: (labelId: string, applicationId: string) => boolean,
): ActionCompte[] {
  const actions: ActionCompte[] = [];
  for (const c of [...comptes].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    const { principale, requises } = applicationsDuCompte(c.partsApplications, applications);
    const retirer = c.labels.filter((l) => ferme(l, principale));
    if (retirer.length === 0) continue;
    const garder = c.labels.filter((l) => !retirer.includes(l));
    const besoinNouveau = garder.length === 0;
    actions.push({
      compteId: c.id,
      principale,
      requises,
      retirer,
      garder,
      besoinNouveau,
      ...(besoinNouveau && c.ugc ? { manuel: "compte UGC : son label doit porter des contenus UGC" } : {}),
    });
  }
  return actions;
}

/** Les labels slideshow qui servent TOUTES les applications demandées. */
export function poolPourApplications(
  slideshow: readonly string[],
  liens: readonly LienLabelApplication[],
  requises: readonly string[],
): string[] {
  let pool = [...slideshow];
  for (const app of requises) pool = labelsServantApplication(pool, liens, app);
  return pool;
}

export interface LabelFerme {
  label_id: string;
  nom: string | null;
  application_id: string;
  perf: number | null;
  posts: number;
}

export interface ResultatFermeture {
  dryRun: boolean;
  /** Fermetures décidées cette nuit. */
  fermes: LabelFerme[];
  deplaces: Array<{
    compte_id: string;
    handle: string | null;
    /** Langue du compte (0794, pour l'aperçu de la page Allocation). */
    langue?: string | null;
    de: string[];
    vers: string;
    /** Le nouveau label est du même thème que le label quitté (0794). */
    meme_theme?: boolean;
  }>;
  retires: Array<{ compte_id: string; handle: string | null; labels: string[] }>;
  manuels: Array<{ compte_id: string; handle: string | null; raison: string }>;
  /** Comptes à traiter au-delà du plafond de la nuit. */
  reportes: number;
  erreurs: string[];
}

/** Une ligne lisible pour l'avertissement du run (vide = rien à dire). */
export function ligneFermetureLabels(res: ResultatFermeture): string {
  const morceaux: string[] = [];
  const pct = (x: number | null) => (x === null ? "?" : x.toFixed(2).replace(".", ","));
  if (res.fermes.length > 0) {
    morceaux.push(
      `fermé${res.fermes.length > 1 ? "s" : ""} : ` +
        res.fermes.map((f) => `${f.nom ?? f.label_id} (${pct(f.perf)} de la flotte sur ${f.posts} posts)`).join(", "),
    );
  }
  if (res.deplaces.length > 0) {
    morceaux.push(
      `${res.deplaces.length} compte(s) déplacé(s) : ` +
        res.deplaces.map((d) => `${d.handle ?? d.compte_id} ${d.de.join("+")} → ${d.vers}`).join(", "),
    );
  }
  if (res.retires.length > 0) morceaux.push(`${res.retires.length} label(s) fermé(s) retiré(s) sans remplacement`);
  if (res.manuels.length > 0) morceaux.push(`${res.manuels.length} compte(s) à traiter à la main`);
  if (res.reportes > 0) morceaux.push(`${res.reportes} reporté(s) à la nuit suivante`);
  if (res.erreurs.length > 0) morceaux.push(`erreurs : ${res.erreurs.join(" · ")}`);
  if (morceaux.length === 0) return "";
  return `labels${res.dryRun ? " (à blanc)" : ""} — ${morceaux.join(" ; ")}`;
}

async function lireReglagesBruts(supabase: Supabase): Promise<Record<string, unknown>> {
  const { data, error } = await supabase
    .from("reglages")
    .select("valeur")
    .eq("cle", CLE_REGLAGES_CHOIX_LABELS)
    .maybeSingle();
  if (error) throw new Error(`reglages.${CLE_REGLAGES_CHOIX_LABELS} : ${error.message}`);
  const v = data?.valeur;
  return v && typeof v === "object" && !Array.isArray(v) ? { ...(v as Record<string, unknown>) } : {};
}

/** Réglages du choix de label ; une lecture ratée rend les défauts (jamais bloquant). */
export async function chargerReglagesChoixLabel(supabase: Supabase): Promise<ReglagesChoixLabel> {
  try {
    return lireReglagesChoixLabel(await lireReglagesBruts(supabase));
  } catch (e) {
    console.warn(`[choix label] réglages illisibles, défauts : ${e instanceof Error ? e.message : String(e)}`);
    return lireReglagesChoixLabel(null);
  }
}

/** Réécrit la ligne en relisant juste avant : seules les clés passées changent. */
async function fusionnerReglages(supabase: Supabase, maj: (v: Record<string, unknown>) => Record<string, unknown>) {
  const actuel = await lireReglagesBruts(supabase);
  const { error } = await supabase
    .from("reglages")
    .upsert({ cle: CLE_REGLAGES_CHOIX_LABELS, valeur: maj(actuel) }, { onConflict: "cle" });
  if (error) throw new Error(`écriture reglages.${CLE_REGLAGES_CHOIX_LABELS} : ${error.message}`);
}

export async function statsChoixLabel(
  supabase: Supabase,
  args: { labels: string[]; application: string; langue: string | null; pays: string | null; recents: number },
): Promise<StatLabelCreation[]> {
  if (args.labels.length === 0) return [];
  const { data, error } = await supabase.rpc("stats_choix_label", {
    p_labels: args.labels,
    p_application: args.application,
    p_langue: args.langue,
    p_pays: args.pays,
    p_recents: args.recents,
  });
  if (error) throw new Error(`stats_choix_label : ${error.message}`);
  const stats = ((data ?? []) as Record<string, unknown>[]).map(normaliserStatLabel);
  const ouverts = await labelsLangueOuverte(supabase, args.langue);
  return ouverts.size === 0 ? stats : stats.map((s) => (ouverts.has(s.label_id) ? { ...s, langue_ouverte: true } : s));
}

/**
 * Les labels dont un podz ACTIF a ouvert cette langue (0794) : la « place
 * libre » qui passe avant tout au choix de label. Ne lève jamais : sans
 * réponse (fonction pas encore en base, panne), aucune place, et le choix se
 * fait comme avant.
 */
export async function labelsLangueOuverte(supabase: Supabase, langue: string | null): Promise<Set<string>> {
  if (!langue) return new Set();
  try {
    const { data, error } = await supabase.rpc("podz_labels_langue_ouverte", { p_langue: langue });
    if (error) {
      console.warn(`[choix label] podz_labels_langue_ouverte : ${error.message}`);
      return new Set();
    }
    return new Set(((data ?? []) as Array<{ label_id: string }>).map((l) => String(l.label_id)));
  } catch (e) {
    console.warn(`[choix label] podz_labels_langue_ouverte : ${e instanceof Error ? e.message : String(e)}`);
    return new Set();
  }
}

/** Ce qu'il faut d'un label pour le rapprocher d'un autre : son nom et son genre. */
export interface LabelTheme {
  id: string;
  nom: string | null;
  genre: string | null;
}

/**
 * Les labels du pool, du plus proche au plus large du label quitté (0794) :
 * même thème et genre compatible, puis genre compatible, puis tous. Un genre
 * inconnu (d'un côté ou de l'autre) est compatible avec tout. Les paliers vides
 * ou identiques au précédent sont retirés ; le dernier est toujours le pool.
 */
export function paliersTheme(depart: LabelTheme | null, pool: readonly LabelTheme[]): string[][] {
  const tous = pool.map((l) => l.id);
  if (!depart) return tous.length > 0 ? [tous] : [];
  const genreDe = (l: LabelTheme) => (l.genre === "homme" || l.genre === "femme" ? l.genre : genreDuLabel(l.nom));
  const theme = themeMotsDuLabel(depart.nom);
  const genre = genreDe(depart);
  const compatible = (l: LabelTheme) => {
    const g = genreDe(l);
    return !genre || !g || g === genre;
  };
  const paliers = [
    pool.filter((l) => themeMotsDuLabel(l.nom) === theme && compatible(l)).map((l) => l.id),
    pool.filter(compatible).map((l) => l.id),
    tous,
  ];
  const out: string[][] = [];
  for (const p of paliers) {
    if (p.length === 0) continue;
    const avant = out[out.length - 1];
    if (avant && avant.length === p.length && avant.every((id, i) => id === p[i])) continue;
    out.push(p);
  }
  return out;
}

/**
 * Le label à donner, palier par palier : le premier label pas « à sec » du
 * palier le plus proche ; sinon, au dernier palier, le premier tout court (ou
 * rien si aucun label n'est ouvert). `meme` : pris dans le premier palier.
 */
export function choisirDansLeTheme(
  stats: readonly StatLabelCreation[],
  paliers: readonly string[][],
  r: ReglagesChoixLabel,
  applicationId: string,
): { vers: string | null; meme: boolean } {
  for (const [i, ids] of paliers.entries()) {
    const garde = new Set(ids);
    const classes = classerLabels(stats.filter((s) => garde.has(s.label_id)), r, { applicationId });
    const bon = classes.find((c) => !c.aSec);
    if (bon) return { vers: bon.label_id, meme: i === 0 && paliers.length > 1 };
    if (i === paliers.length - 1 && classes.length > 0) return { vers: classes[0].label_id, meme: false };
  }
  return { vers: null, meme: false };
}

/**
 * L'étape de nuit. Lève si une lecture indispensable échoue AVANT toute
 * écriture (réglages, labels, chiffres) ; une fois les déplacements commencés,
 * une erreur sur un compte est notée et la suite continue.
 */
export async function fermerLabelsEtReaffecter(
  supabase: Supabase,
  opts: {
    jour: string;
    dryRun?: boolean;
    budgetMs?: number;
    maintenant?: () => number;
    /** 0794 : ne traiter QUE ces labels, tenus pour fermés, tout de suite et sans plafond. */
    labels?: string[];
  },
): Promise<ResultatFermeture> {
  const dryRun = Boolean(opts.dryRun);
  const maintenant = opts.maintenant ?? (() => Date.now());
  const fin = maintenant() + (opts.budgetMs ?? BUDGET_LABELS_MS);
  const res: ResultatFermeture = { dryRun, fermes: [], deplaces: [], retires: [], manuels: [], reportes: 0, erreurs: [] };

  const brut = await lireReglagesBruts(supabase);
  let r = lireReglagesChoixLabel(brut);

  const [labelsLus, liensLus, appsLues] = await Promise.all([
    supabase.from("labels").select("id, slug, nom, manuel, genre"),
    supabase.from("label_applications").select("label_id, application_id"),
    supabase.from("applications").select("id, slug, actif"),
  ]);
  if (labelsLus.error) throw new Error(`labels : ${labelsLus.error.message}`);
  if (liensLus.error) throw new Error(`label_applications : ${liensLus.error.message}`);
  if (appsLues.error) throw new Error(`applications : ${appsLues.error.message}`);
  const nomDe = new Map((labelsLus.data ?? []).map((l) => [l.id as string, (l.nom as string | null) ?? null]));
  const themeDe = new Map<string, LabelTheme>((labelsLus.data ?? []).map((l) => [
    l.id as string,
    { id: l.id as string, nom: (l.nom as string | null) ?? (l.slug as string | null) ?? null, genre: (l.genre as string | null) ?? null },
  ]));
  const demandes = new Set((opts.labels ?? []).map(String).filter(Boolean));
  const cible = demandes.size > 0;
  const slideshow = (labelsLus.data ?? []).filter((l) => estLabelFileSlideshow(l)).map((l) => l.id as string);
  const liens = (liensLus.data ?? []) as LienLabelApplication[];
  const applications = (appsLues.data ?? []) as Array<ApplicationRef & { actif: boolean }>;

  // 1. Fermetures du jour, application par application (jamais sur une demande ciblée).
  const nouvelles: Record<string, FermetureAuto> = {};
  for (const app of cible ? [] : applications.filter((a) => a.actif)) {
    const pool = labelsServantApplication(slideshow, liens, app.id);
    const stats = await statsChoixLabel(supabase, {
      labels: pool,
      application: app.id,
      langue: null,
      pays: null,
      recents: 0,
    });
    for (const s of stats) {
      if (estFerme(s.label_id, app.id, r) || r.ouverts.includes(s.label_id) || !doitFermer(s, r)) continue;
      const perf = perfRelative(s);
      nouvelles[cleFermeture(app.id, s.label_id)] = {
        depuis: opts.jour,
        perf: perf === null ? null : Math.round(perf * 1000) / 1000,
        posts: s.passages,
        nom: nomDe.get(s.label_id) ?? null,
      };
      res.fermes.push({ label_id: s.label_id, nom: nomDe.get(s.label_id) ?? null, application_id: app.id, perf, posts: s.passages });
    }
  }
  if (Object.keys(nouvelles).length > 0) {
    r = { ...r, fermesAuto: { ...r.fermesAuto, ...nouvelles } };
    if (!dryRun) {
      await fusionnerReglages(supabase, (v) => ({
        ...v,
        fermes_auto: { ...((v.fermes_auto as Record<string, unknown>) ?? {}), ...nouvelles },
      }));
    }
  }

  // 2. Comptes qui portent un label fermé pour leur application principale.
  const fermesConnus = new Set<string>(r.fermes);
  for (const k of Object.keys(r.fermesAuto)) fermesConnus.add(k.split(":")[1]);
  for (const id of r.ouverts) fermesConnus.delete(id);
  if (cible) {
    fermesConnus.clear();
    for (const id of demandes) fermesConnus.add(id);
  }
  if (fermesConnus.size === 0) return res;

  const { data: porteurs, error: errPorteurs } = await supabase
    .from("compte_labels")
    .select("compte_id")
    .in("label_id", [...fermesConnus]);
  if (errPorteurs) throw new Error(`porteurs des labels fermés : ${errPorteurs.message}`);
  const idsComptes = [...new Set((porteurs ?? []).map((p) => p.compte_id as string))];
  if (idsComptes.length === 0) return res;

  const [comptesLus, liensComptes] = await Promise.all([
    supabase
      .from("comptes")
      .select("id, handle_tiktok, langue, pays, ugc_ai, ugcv, videos_uniquement, type_compte, is_active, parts_applications")
      .in("id", idsComptes),
    supabase.from("compte_labels").select("compte_id, label_id").in("compte_id", idsComptes),
  ]);
  if (comptesLus.error) throw new Error(`comptes : ${comptesLus.error.message}`);
  if (liensComptes.error) throw new Error(`labels des comptes : ${liensComptes.error.message}`);
  const labelsDe = new Map<string, string[]>();
  for (const l of liensComptes.data ?? []) {
    const liste = labelsDe.get(l.compte_id as string) ?? [];
    liste.push(l.label_id as string);
    labelsDe.set(l.compte_id as string, liste);
  }
  // Même périmètre que l'assignation slideshow : ni CM, ni UGC vidéo, ni vidéo seule.
  const comptes: CompteLabels[] = (comptesLus.data ?? [])
    .filter((c) => c.is_active && c.type_compte !== "cm" && !c.ugcv && !c.videos_uniquement)
    .map((c) => ({
      id: c.id as string,
      handle: (c.handle_tiktok as string | null) ?? null,
      langue: (c.langue as string | null) ?? null,
      pays: (c.pays as string | null) ?? null,
      ugc: Boolean(c.ugc_ai),
      partsApplications: c.parts_applications,
      labels: labelsDe.get(c.id as string) ?? [],
    }));
  const handleDe = new Map(comptes.map((c) => [c.id, c.handle]));
  const nom = (id: string) => nomDe.get(id) ?? id;

  // Demande ciblée : ses labels sont tenus pour fermés, quelle que soit l'application.
  const ferme = (l: string, app: string) => (cible ? demandes.has(l) : estFerme(l, app, r));
  const toutes = planifierReaffectations(comptes, applications, ferme);
  const actions = cible ? toutes : toutes.slice(0, r.relabelsMaxParNuit);
  res.reportes = toutes.length - actions.length;

  // 3. Un compte après l'autre : chaque choix lit les comptes déjà déplacés.
  for (const [i, a] of actions.entries()) {
    if (maintenant() > fin) {
      res.reportes += actions.length - i;
      break;
    }
    const compte = comptes.find((c) => c.id === a.compteId)!;
    const handle = handleDe.get(a.compteId) ?? null;
    try {
      if (a.manuel) {
        res.manuels.push({ compte_id: a.compteId, handle, raison: a.manuel });
        continue;
      }
      if (!a.besoinNouveau) {
        if (!dryRun) await retirerLabels(supabase, a.compteId, a.retirer);
        res.retires.push({ compte_id: a.compteId, handle, labels: a.retirer.map(nom) });
        continue;
      }
      const pool = poolPourApplications(slideshow, liens, a.requises)
        .filter((l) => !estFerme(l, a.principale, r) && !demandes.has(l));
      const stats = await statsChoixLabel(supabase, {
        labels: pool,
        application: a.principale,
        langue: compte.langue ? compte.langue.toLowerCase() : null,
        pays: compte.pays,
        recents: RECENTS_CHOIX_LABEL,
      });
      // 0794 : d'abord dans le thème du label quitté.
      const paliers = paliersTheme(
        themeDe.get(a.retirer[0]) ?? null,
        pool.map((id) => themeDe.get(id) ?? { id, nom: null, genre: null }),
      );
      const { vers, meme } = choisirDansLeTheme(stats, paliers, r, a.principale);
      if (!vers) {
        res.manuels.push({ compte_id: a.compteId, handle, raison: "aucun label ouvert pour son application" });
        continue;
      }
      if (!dryRun) {
        // Un seul label quitté : le geste journalisé (0782), annulable. Sinon, ou
        // s'il échoue, l'écriture directe d'avant : un compte ne reste pas en plan.
        let journalise = false;
        if (a.retirer.length === 1) {
          const { error: errRpc } = await supabase.rpc("compte_deplacer", {
            p_compte: a.compteId,
            p_de: a.retirer[0],
            p_vers: vers,
            p_raison: `label ${nom(a.retirer[0])} fermé`,
          });
          if (errRpc) console.warn(`[labels] compte_deplacer ${handle ?? a.compteId} : ${errRpc.message}`);
          journalise = !errRpc;
        }
        if (!journalise) {
          const { error } = await supabase
            .from("compte_labels")
            .upsert({ compte_id: a.compteId, label_id: vers }, { onConflict: "compte_id,label_id", ignoreDuplicates: true });
          if (error) throw new Error(`ajout de ${nom(vers)} : ${error.message}`);
          await retirerLabels(supabase, a.compteId, a.retirer);
        }
      }
      res.deplaces.push({
        compte_id: a.compteId,
        handle,
        langue: compte.langue,
        de: a.retirer.map(nom),
        vers: nom(vers),
        meme_theme: meme,
      });
    } catch (e) {
      res.erreurs.push(`${handle ?? a.compteId} : ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (!dryRun && (res.deplaces.length || res.retires.length || res.manuels.length || res.erreurs.length || res.fermes.length)) {
    try {
      await fusionnerReglages(supabase, (v) => ({
        ...v,
        dernier_run: { jour: opts.jour, at: new Date().toISOString(), ...res },
      }));
    } catch (e) {
      res.erreurs.push(`trace non écrite : ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return res;
}

async function retirerLabels(supabase: Supabase, compteId: string, labels: string[]): Promise<void> {
  if (labels.length === 0) return;
  const { error } = await supabase.from("compte_labels").delete().eq("compte_id", compteId).in("label_id", labels);
  if (error) throw new Error(`retrait de ${labels.length} label(s) : ${error.message}`);
}
