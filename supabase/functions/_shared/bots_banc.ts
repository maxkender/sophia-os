/**
 * 0567 : le banc d'essai des bots (logique pure, testée côté front aussi).
 */

export interface ExempleBot {
  id: string;
  cle: string;
  bot: string | null;
  categorie: string | null;
  situation: string;
  message_posteur: string | null;
  bonne_decision: string;
  bonne_reponse: string | null;
  pourquoi: string | null;
  source: string;
  cree_at: string;
}

/** « Lui répondre et garder » == « lui repondre et garder ». */
export function normaliser(s: string | null | undefined): string {
  return String(s ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[«»"'.!?]/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Les 30 cas réels : d'abord les corrections de Max sur les cartes (modifier,
 * ignorer, autre choix, annulation), puis les décisions Weekly, les plus
 * récentes ; complétés par les exemples de départ s'il en manque.
 */
export function casDuBanc(exemples: ExempleBot[], n = 30): ExempleBot[] {
  const recents = (a: ExempleBot, b: ExempleBot) => b.cree_at.localeCompare(a.cree_at);
  const cartes = exemples.filter((e) => !["depart", "weekly"].includes(e.source)).sort(recents);
  const weekly = exemples.filter((e) => e.source === "weekly").sort(recents);
  const depart = exemples.filter((e) => e.source === "depart");
  // Au plus 10 Weekly, pour que les cas des bots dominent.
  const choisis = [...cartes.slice(0, n), ...weekly.slice(0, Math.min(10, n))].slice(0, n);
  for (const d of depart) {
    if (choisis.length >= n) break;
    choisis.push(d);
  }
  return choisis.slice(0, n);
}

/** Les décisions possibles : celles des cas, plus les étiquettes de base. */
export function etiquettes(cas: ExempleBot[]): string[] {
  const base = ["kill_samedi", "decision_doute", "repondre_garder", "ignorer", "reponse"];
  const vues = new Map<string, string>();
  for (const s of [...cas.map((c) => c.bonne_decision), ...base]) {
    if (!vues.has(normaliser(s))) vues.set(normaliser(s), s);
  }
  return [...vues.values()];
}

/** Les exemples les plus proches d'un cas (même catégorie, même bot), sans le cas lui-même. */
export function choisirExemples(exemples: ExempleBot[], cas: ExempleBot, n = 15): ExempleBot[] {
  const score = (e: ExempleBot) =>
    (e.categorie && e.categorie === cas.categorie ? 3 : 0) + (e.bot === cas.bot ? 2 : e.bot === null ? 1 : 0) + (e.source === "depart" ? 0 : 1);
  return exemples.filter((e) => e.id !== cas.id).sort((a, b) => score(b) - score(a) || b.cree_at.localeCompare(a.cree_at)).slice(0, n);
}

export function promptCas(
  cas: ExempleBot,
  consignes: { regle: string; exemple: string | null }[],
  exemples: ExempleBot[],
  choix: string[],
): string {
  const lignes = [
    `Tu es ${cas.bot ?? "le bot de décision"} de l'OS Sophia (recrutement et suivi de posteurs TikTok).`,
    "Tes consignes :",
    ...(consignes.length ? consignes.map((r) => `- ${r.regle}${r.exemple ? ` (exemple : ${r.exemple})` : ""}`) : ["- (aucune)"]),
    "",
    "Exemples tranchés par Max :",
    ...exemples.map((e) => `- Situation : ${e.situation}${e.message_posteur ? ` | Message : « ${e.message_posteur.slice(0, 200)} »` : ""} → décision : ${e.bonne_decision}${e.pourquoi ? ` (${e.pourquoi.slice(0, 120)})` : ""}`),
    "",
    "Le cas à décider :",
    `Situation : ${cas.situation}`,
    cas.message_posteur ? `Message du posteur : « ${cas.message_posteur.slice(0, 600)} »` : "",
    "",
    `Choisis UNE décision parmi : ${choix.join(" | ")}.`,
    'Réponds seulement en JSON : {"decision": "<une des décisions ci-dessus, recopiée exactement>"}',
  ];
  return lignes.filter((l) => l !== "").join("\n");
}
