/**
 * Les règles natives de chaque langue (migration 0734).
 *
 * Les corrections retenues des relecteurs (0630) sont fusionnées par Gemini
 * en règles sans doublon : la version validée précédente + les corrections
 * retenues qu'elle ne couvre pas encore. La nouvelle version arrive
 * « proposee » dans `regles_natives` ; l'admin la valide dans Relecture
 * native → Règles, et `corrections_natives_bloc` la donne alors à la
 * traduction de production.
 *
 * Appelée par `ab-traduction`, action `regles_consolider` : le cron
 * `regles-natives` (le lundi) ou le bouton « Consolider maintenant ».
 */
import { callWithFallback, LANGUES, TEXT_MODELS, textOf } from "./gemini.ts";
import { messageErreur, type serviceClient } from "./supabase.ts";
import { parseJsonModele } from "./traduction_native.ts";

type Supabase = ReturnType<typeof serviceClient>;

/** Budget d'un appel : sous la limite d'une fonction Edge, une langue par appel modèle. */
const BUDGET_MS = 110_000;
const CONTENU_MAX = 30_000;
/** En dessous de cette part de la version précédente, la fusion a perdu des règles : on refuse. */
const PART_MIN_PRECEDENTE = 0.6;

export interface CorrectionRetenue {
  id: string;
  type: string;
  fautif: string;
  corrige: string | null;
  explication: string | null;
  created_at: string;
}

export interface ReglesPrecedentes {
  version: number;
  contenu: string;
  corrections_ids: string[];
}

/** Une correction retenue, sur une ligne, comme dans le bloc de traduction. */
export function ligneCorrection(c: Pick<CorrectionRetenue, "type" | "fautif" | "corrige" | "explication">): string {
  const corrige = (c.corrige ?? "").trim();
  const explication = (c.explication ?? "").trim();
  return `- [${c.type}] ${corrige ? `au lieu de « ${c.fautif.trim()} », écris « ${corrige} »` : `évite « ${c.fautif.trim()} »`}${
    explication ? ` (${explication})` : ""
  }`;
}

/** Le prompt de la consolidation. Exporté pour le lire dans les tests. */
export function promptConsolidation(entree: {
  langue: string;
  precedentes: string | null;
  nouvelles: Array<Pick<CorrectionRetenue, "type" | "fautif" | "corrige" | "explication">>;
}): string {
  const nomLangue = LANGUES[entree.langue] ?? entree.langue;
  const precedentes = (entree.precedentes ?? "").trim();
  return `Tu tiens les règles natives du ${nomLangue} pour nos slideshows TikTok. Des relecteurs natifs relisent chaque semaine nos posts publiés en ${nomLangue} et relèvent ce qui sonne traduit ; chaque relevé validé par l'admin devient une correction (un fragment fautif, ce qu'il faut écrire à la place, un type, une explication). Ces règles sont données telles quelles au modèle qui traduit nos slideshows en ${nomLangue}.

Ta tâche : écrire la nouvelle version des règles, en fusionnant ${precedentes ? "les règles actuelles et les nouvelles corrections" : "les corrections"} ci-dessous.

Règles d'écriture :
- Ne perds RIEN. Chaque point des règles actuelles et chaque nouvelle correction doit se retrouver dans la nouvelle version, au moins comme exemple d'une règle.
- Regroupe ce qui se répète en une règle générale (« ne calque pas X : en ${nomLangue}, on dit Y »), suivie de ses exemples réels « au lieu de « … », écris « … » ». Les exemples gardent leurs fragments mot pour mot.
- Pas de doublon : deux corrections qui disent la même chose donnent une seule ligne.
- Si une nouvelle correction contredit une règle actuelle, la nouvelle l'emporte : réécris la règle dans son sens.
- Rubriques, dans cet ordre, seulement celles qui ont du contenu : « Calques à éviter », « Registre et ton », « Vocabulaire », « Longueur des slides », « Majuscules et ponctuation », « Sens », « Divers ».
- Les règles en français ; les exemples dans leur langue (${nomLangue}). Prescriptif, court, concret. N'invente aucune règle qui ne vienne pas des relevés.
- Ces règles servent à toutes nos applications : n'écris aucune règle sur la slide de l'appli, et ne cite le nom d'aucune application.
- Markdown simple : un titre « ### » par rubrique, une puce par règle, les exemples en sous-puces.

${precedentes ? `Règles actuelles :\n"""\n${precedentes}\n"""\n\n` : ""}Nouvelles corrections (${entree.nouvelles.length}) :
${entree.nouvelles.map(ligneCorrection).join("\n")}

Réponds uniquement en JSON, sans bloc de code :
{"regles":"### Calques à éviter\\n- …"}`;
}

/** Vérifie la sortie du modèle ; renvoie le texte des règles, ou lève l'erreur à garder. */
export function verifierRegles(brut: string, precedentes: string | null): string {
  const sortie = parseJsonModele<{ regles?: unknown }>(brut);
  const texte = typeof sortie?.regles === "string" ? sortie.regles.trim() : "";
  if (!texte) throw new Error("réponse du modèle illisible ou vide");
  if (texte.length > CONTENU_MAX) throw new Error(`règles trop longues (${texte.length} caractères)`);
  const avant = (precedentes ?? "").trim().length;
  if (avant > 0 && texte.length < avant * PART_MIN_PRECEDENTE) {
    throw new Error(`règles plus courtes de ${Math.round((1 - texte.length / avant) * 100)} % que la version validée : fusion refusée, des règles se seraient perdues`);
  }
  return texte;
}

export interface BilanConsolidation {
  faites: Array<{ langue: string; version: number; nouvelles: number }>;
  sautees: Array<{ langue: string; raison: string }>;
  echecs: Array<{ langue: string; raison: string }>;
  restantes: string[];
}

/**
 * Consolide les langues qui ont des corrections retenues hors de leurs règles
 * validées (toutes, ou `langue`). Une langue dont une version attend déjà la
 * validation est sautée, sauf `remplacer` (le bouton) : la version en attente
 * passe alors « remplacee ».
 */
export async function consoliderRegles(
  supabase: Supabase,
  options: { langue?: string | null; remplacer?: boolean; auteur?: string } = {},
): Promise<BilanConsolidation> {
  const debut = Date.now();
  const bilan: BilanConsolidation = { faites: [], sautees: [], echecs: [], restantes: [] };

  let requete = supabase
    .from("corrections_natives")
    .select("id, langue, type, fautif, corrige, explication, created_at")
    .eq("statut", "retenue")
    // 0743 : les règles d'une langue valent pour toutes les applications. Une
    // correction propre à une application n'y entre pas : elle va au placement
    // de son application (`chargerRetoursApplication`).
    .is("application_id", null)
    .order("created_at", { ascending: true })
    .limit(5000);
  if (options.langue) requete = requete.eq("langue", options.langue.toLowerCase());
  const { data: retenues, error } = await requete;
  if (error) throw error;

  const parLangue = new Map<string, CorrectionRetenue[]>();
  for (const c of (retenues ?? []) as Array<CorrectionRetenue & { langue: string }>) {
    const l = c.langue.toLowerCase();
    parLangue.set(l, [...(parLangue.get(l) ?? []), c]);
  }
  if (options.langue && !parLangue.has(options.langue.toLowerCase())) {
    bilan.sautees.push({ langue: options.langue.toLowerCase(), raison: "aucune correction retenue" });
  }

  for (const [langue, corrections] of [...parLangue.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (Date.now() - debut > BUDGET_MS) {
      bilan.restantes.push(langue);
      continue;
    }
    try {
      const { data: versions, error: errV } = await supabase
        .from("regles_natives")
        .select("id, version, statut, contenu, corrections_ids")
        .eq("langue", langue)
        .order("version", { ascending: false });
      if (errV) throw errV;
      const lignes = (versions ?? []) as Array<{ id: string; version: number; statut: string; contenu: string; corrections_ids: string[] }>;
      const enAttente = lignes.find((v) => v.statut === "proposee");
      if (enAttente && !options.remplacer) {
        bilan.sautees.push({ langue, raison: `la version ${enAttente.version} attend ta validation` });
        continue;
      }
      const validee = lignes.find((v) => v.statut === "validee") ?? null;
      const couvertes = new Set(validee?.corrections_ids ?? []);
      const nouvelles = corrections.filter((c) => !couvertes.has(c.id));
      if (nouvelles.length === 0) {
        bilan.sautees.push({ langue, raison: "rien de neuf depuis les règles validées" });
        continue;
      }

      const prompt = promptConsolidation({ langue, precedentes: validee?.contenu ?? null, nouvelles });
      const parts = await callWithFallback(TEXT_MODELS, [{ text: prompt }]);
      const contenu = verifierRegles(textOf(parts), validee?.contenu ?? null);

      if (enAttente) {
        const { error: errR } = await supabase.from("regles_natives").update({ statut: "remplacee" }).eq("id", enAttente.id);
        if (errR) throw errR;
      }
      const version = (lignes[0]?.version ?? 0) + 1;
      const ids = [...new Set([...(validee?.corrections_ids ?? []), ...nouvelles.map((c) => c.id)])];
      const { error: errI } = await supabase.from("regles_natives").insert({
        langue,
        version,
        contenu,
        statut: "proposee",
        corrections_ids: ids,
        auteur: options.auteur ?? "consolidation",
        modele: TEXT_MODELS[0],
      });
      if (errI) throw errI;
      bilan.faites.push({ langue, version, nouvelles: nouvelles.length });
    } catch (e) {
      bilan.echecs.push({ langue, raison: messageErreur(e) });
    }
  }
  return bilan;
}
