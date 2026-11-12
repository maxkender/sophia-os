/**
 * Bot v2 « Support propre » (Max, 12/11). Partie sans réseau ni base (testée) :
 * le prompt (la procédure), la lecture de la décision du modèle, et les
 * garde-fous appliqués par le code, pas par le modèle :
 *   - 3 phrases au plus, au nom de « the Vik Studios team », jamais « bot » ni « IA » ;
 *   - jamais l'autre plateforme (Ruul / Upwork) ;
 *   - sujet perso dans un salon : « Please use Help on your dashboard », jamais de montant en public ;
 *   - pas de règle connue : « We're checking, you'll get an answer today » et Adrien ;
 *   - le risque d'argent ou de fraude va à Max, l'autre risque à Adrien ;
 *   - une seule action par message, choisie dans une liste fermée.
 */

export type Niveau = "bot" | "adrien" | "max";
export type SourceBot = "help" | "slack_salon";
export type ActionBot = "lien_mot_de_passe" | "renvoi_parrainage" | "pseudo_tiktok" | "email_ruul" | "arret" | "lien_slack";

export const ACTIONS: readonly ActionBot[] = ["lien_mot_de_passe", "renvoi_parrainage", "pseudo_tiktok", "email_ruul", "arret", "lien_slack"];
export const CATEGORIES_BOT = [
  "posting", "tiktok", "warmup", "login", "slack", "paie", "parrainage", "arret", "ruul", "upwork", "bug", "statut", "salutation", "autre",
] as const;
export const RISQUES = ["repetition", "enerve", "menace", "scam", "argent_tiers", "multi_comptes", "hors_plateforme"] as const;
export type Risque = (typeof RISQUES)[number];
/** Le risque d'argent ou de fraude : Max. Le reste (dont le mot « scam » d'un posteur méfiant) : Adrien. */
const RISQUES_MAX: readonly Risque[] = ["argent_tiers", "multi_comptes", "hors_plateforme"];

export const TEXTE_ON_VERIFIE = "We're checking, you'll get an answer today.";
export const SIGNATURE = "— the Vik Studios team";

export interface DecisionBot {
  langue: string;
  categorie: string;
  personnel: boolean;
  reponse: string;
  action: ActionBot | null;
  action_valeur: string | null;
  niveau: Niveau;
  regle: string | null;
  risque: Risque[];
  raison: string;
}

export interface EntreeBot {
  message: string;
  source: SourceBot;
  plateforme: "ruul" | "upwork" | null;
  fiche: string;
  contexte: string;
  infos: { titre: string; valeur: string }[];
  catalogue: { id: string; question: string; formulations: string[]; reponse: string; action: string | null; niveau: string; categorie: string | null }[];
  historique: { cree_at: string; categorie: string | null; texte: string }[];
  /** Personne introuvable dans l'OS (Slack). */
  inconnu?: boolean;
}

export function promptBot(e: EntreeBot): string {
  const plateforme = e.plateforme === "ruul" ? "Ruul" : e.plateforme === "upwork" ? "Upwork" : "inconnue";
  const infos = e.infos.map((i) => `- ${i.titre} : ${i.valeur}`).join("\n");
  const catalogue = e.catalogue.map((c) =>
    `### [${c.id}] ${c.question}${c.formulations.length ? ` (aussi : ${c.formulations.join(" / ")})` : ""}\nRéponse : ${c.reponse}\nAction : ${c.action ?? "aucune"} · Niveau : ${c.niveau}`
  ).join("\n\n");
  const historique = e.historique.length
    ? e.historique.map((h) => `- ${h.cree_at.slice(0, 10)} [${h.categorie ?? "?"}] ${h.texte.slice(0, 160)}`).join("\n")
    : "(aucune)";
  return `Tu réponds aux posteurs (créateurs TikTok payés chaque semaine) au nom de « the Vik Studios team ».
Canal : ${e.source === "slack_salon" ? "un salon Slack public (tout le monde lit)" : "la page Help du dashboard (privée)"}.
Plateforme de paie du posteur : ${plateforme}.${e.inconnu ? "\nCette personne est INTROUVABLE dans l'OS : demande-lui l'email utilisé pour s'inscrire." : ""}

PROCÉDURE
1. Lis sa fiche, ses données et ses demandes passées (ci-dessous).
2. Classe le message (categorie).
3. Réponds dans la langue du message (anglais par défaut), en 3 phrases au plus, simple, avec l'étape exacte qui lui manque d'après sa fiche.
4. Si une action de la liste règle le cas, choisis-la et dis-le dans la réponse. Actions possibles :
   lien_mot_de_passe (renvoyer le lien « Set my password »), renvoi_parrainage (renvoyer l'email d'un parrainage),
   pseudo_tiktok (noter un nouveau pseudo TikTok ; action_valeur = le pseudo sans @), email_ruul (corriger l'email Ruul de la fiche ; action_valeur = l'email),
   arret (SEULEMENT s'il demande clairement d'arrêter : STOP, fin du contrat, supprimer son compte, dans n'importe quelle langue ; une question, un voyage ou un doute ne suffisent pas),
   lien_slack (donner le lien d'invitation Slack).
5. Si AUCUNE règle (catalogue ou infos) ne couvre le cas : reponse = "${TEXTE_ON_VERIFIE}" et niveau = "adrien". N'invente JAMAIS une règle, une date ou un montant.

NIVEAUX (un seul)
- "bot" : tu as répondu et c'est réglé (questions du guide, étapes, TikTok, warm-up, login, Slack, quand/combien je suis payé avec les chiffres de l'OS, parrainage, arrêt, malade/absent, posts manqués selon la règle, statut, messages vides).
- "adrien" : pas de règle, bug du dashboard qui persiste, personne introuvable après l'email, offre de HM mal faite, recrue à relier, demande de 2e compte TikTok, même problème pour la 3e fois.
- "max" : SEULEMENT paiement non reçu alors que les données montrent la semaine payée ou due ; risque de double paie ; montant contesté après explication du calcul ; menace, litige, plainte publique, fraude (compte d'un ami, cash, plusieurs comptes, paiement hors plateforme).

RÈGLES
- Ruul : jamais d'Upwork. Upwork : jamais de Ruul, ne propose jamais Ruul.
- Recrue Ruul qui veut être payée par Upwork, en cash ou via un ami : refus poli (la paie passe par Ruul, il peut arrêter avec STOP) ; ami ou cash = risque.
- Kill confirmé sur sa fiche (inactif) : message de fin poli.
- Message vide (« Hii???? », « Hello hiring manager ») : bonjour + ses étapes restantes.
- personnel = true si le message parle de SON compte, SA paie, SON contrat.
- risque : liste parmi ${RISQUES.join(", ")} (vide si rien).
- Ne dis jamais que tu es un bot, une IA ou un assistant automatique.

INFOS À CONNAÎTRE (prioritaires, à jour)
${infos || "(aucune)"}

CATALOGUE (réponses officielles)
${catalogue || "(vide)"}

SA FICHE
${e.fiche}

${e.contexte}

SES DEMANDES PASSÉES
${historique}

MESSAGE
« ${e.message} »

Réponds uniquement en JSON :
{"langue": "en", "categorie": "${CATEGORIES_BOT.join("|")}", "personnel": false, "reponse": "...", "action": null, "action_valeur": null, "niveau": "bot|adrien|max", "regle": "id du catalogue ou titre de l'info utilisée, ou null", "risque": [], "raison": "une phrase en français pour l'équipe"}`;
}

export function lireDecision(brut: string): DecisionBot | null {
  const debut = brut.indexOf("{");
  const fin = brut.lastIndexOf("}");
  if (debut < 0 || fin <= debut) return null;
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(brut.slice(debut, fin + 1));
  } catch {
    return null;
  }
  const niveau = o.niveau === "adrien" || o.niveau === "max" ? o.niveau : o.niveau === "bot" ? "bot" : null;
  if (!niveau) return null;
  const action = ACTIONS.includes(o.action as ActionBot) ? (o.action as ActionBot) : null;
  const risque = Array.isArray(o.risque) ? o.risque.filter((r): r is Risque => (RISQUES as readonly string[]).includes(String(r))) : [];
  return {
    langue: String(o.langue ?? "en").slice(0, 5) || "en",
    categorie: (CATEGORIES_BOT as readonly string[]).includes(String(o.categorie)) ? String(o.categorie) : "autre",
    personnel: o.personnel === true,
    reponse: String(o.reponse ?? "").trim(),
    action,
    action_valeur: action && o.action_valeur != null ? String(o.action_valeur).trim().slice(0, 200) || null : null,
    niveau,
    regle: o.regle == null || String(o.regle).trim().toLowerCase() === "null" ? null : String(o.regle).trim().slice(0, 200),
    risque: [...new Set(risque)],
    raison: String(o.raison ?? "").trim().slice(0, 400),
  };
}

/** Au plus `n` phrases. */
export function troisPhrases(texte: string, n = 3): string {
  // Une fin de phrase = . ! ? suivi d'un espace (les liens, « 14.5 $ » ou « e.g. » au milieu ne coupent pas).
  const phrases = texte.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+(?=[A-ZÀ-ÖØ-Þ0-9"'(])/);
  return phrases.slice(0, n).join(" ").trim();
}

const PARLE_DE_BOT = /\b(bot|chatbot|a\.?i\.?|artificial intelligence|intelligence artificielle|assistant automatique|automated assistant|language model)\b/i;
const MONTANT = /(\$\s?\d|\d\s?\$|€\s?\d|\d\s?€|\b\d+(?:[.,]\d+)?\s?(?:usd|eur|dollars?|euros?)\b)/i;

/**
 * Les garde-fous du code, après la décision du modèle. `nbMemeSujet` : ses demandes
 * passées de la même catégorie (2 avant celle-ci = la 3e fois).
 */
export function appliquerGardeFous(
  d: DecisionBot,
  o: { source: SourceBot; plateforme: "ruul" | "upwork" | null; lienHelp: string; nbMemeSujet: number },
): DecisionBot {
  const r: DecisionBot = { ...d, risque: [...d.risque] };
  if (o.nbMemeSujet >= 2 && !r.risque.includes("repetition")) r.risque.push("repetition");
  // Le risque : argent ou fraude → Max ; le reste → Adrien (jamais moins haut que le modèle).
  if (r.risque.some((x) => RISQUES_MAX.includes(x))) r.niveau = "max";
  else if (r.risque.length && r.niveau === "bot") r.niveau = "adrien";
  // Jamais l'autre plateforme.
  const autre = o.plateforme === "ruul" ? /\bup\s?work\b/i : o.plateforme === "upwork" ? /\bruul\b/i : null;
  if (autre && autre.test(r.reponse)) {
    r.reponse = TEXTE_ON_VERIFIE;
    if (r.niveau === "bot") r.niveau = "adrien";
    r.raison = `${r.raison} (réponse retenue : elle citait l'autre plateforme)`.trim();
  }
  // Jamais « bot » ni « IA ».
  if (PARLE_DE_BOT.test(r.reponse)) {
    r.reponse = r.reponse.split(/(?<=[.!?])\s+/).filter((p) => !PARLE_DE_BOT.test(p)).join(" ").trim();
  }
  // Salon public : sujet perso → Help ; jamais de montant.
  if (o.source === "slack_salon" && (r.personnel || MONTANT.test(r.reponse))) {
    r.reponse = `Please use Help on your dashboard: ${o.lienHelp}`;
    if (r.action !== "lien_slack") r.action = null;
  }
  if (!r.reponse || (r.niveau !== "bot" && r.reponse.length < 3)) r.reponse = TEXTE_ON_VERIFIE;
  r.reponse = troisPhrases(r.reponse);
  return r;
}

/** Le texte envoyé : la réponse, puis la signature (une fois). */
export function signer(reponse: string): string {
  return reponse.includes("Vik Studios team") ? reponse : `${reponse}\n\n${SIGNATURE}`;
}

/** Un test : le niveau attendu et les mots attendus dans la réponse (insensible à la casse). */
export function testOk(d: Pick<DecisionBot, "niveau" | "reponse" | "action">, t: { attendu_niveau: string | null; attendu_contient: string[]; attendu_action: string | null }): boolean {
  if (t.attendu_niveau && d.niveau !== t.attendu_niveau) return false;
  if (t.attendu_action && d.action !== t.attendu_action) return false;
  const rep = d.reponse.toLowerCase();
  return t.attendu_contient.every((m) => rep.includes(m.toLowerCase()));
}

// ---------------------------------------------------------------------------
// 0675 : mise en ligne (messages repris, liste d'Adrien, top 10 du lundi).
// ---------------------------------------------------------------------------

/** Un simple accusé de réception (« ok », « thanks », un emoji) : rien à répondre. */
export function accuseReception(texte: string): boolean {
  const t = texte.trim().toLowerCase().replace(/[!.\s]+$/gu, "");
  if (t.length < 2) return true;
  if (/^(:[a-z0-9_+-]+:\s*)+$/.test(t)) return true;
  if (/^[\p{Extended_Pictographic}\s\u200d\ufe0f]+$/u.test(t)) return true;
  return /^(ok(ay)?|k|thanks?|thank you|thank u|thx|ty|merci|danke|grazie|gracias|obrigad[oa]|dzięki|perfect|great|cool|nice|got it|noted|alright|sure|yes|yep|done)( (thanks?|thank you|you|a lot|so much))*$/u.test(t);
}

/** Une ligne de la liste du soir d'Adrien. */
export interface LigneAdrien {
  nom: string;
  plateforme: string;
  categorie: string | null;
  texte: string;
  attente: boolean;
  heures: number;
}

export function texteListeAdrien(lignes: LigneAdrien[], osUrl: string): string {
  const lien = `${osUrl.replace(/\/+$/, "")}/admin/auto/support`;
  if (!lignes.length) return `Support : rien d'ouvert pour toi ce soir 👌\n${lien}`;
  const age = (h: number) => (h < 24 ? `${h} h` : `${Math.round(h / 24)} j`);
  return [
    `Support : ta liste du soir (${lignes.length})`,
    ...lignes.slice(0, 40).map((l, i) =>
      `${i + 1}. ${l.nom} (${l.plateforme === "ruul" ? "Ruul" : "Upwork"}${l.categorie ? `, ${l.categorie}` : ""}, ${age(l.heures)})${l.attente ? " · attend le posteur" : ""} : « ${l.texte.replace(/\s+/g, " ").slice(0, 140)} »`
    ),
    ...(lignes.length > 40 ? [`… et ${lignes.length - 40} de plus`] : []),
    lien,
  ].join("\n");
}

export interface Top10 {
  question: string;
  fois: number;
  reponse: string;
}

export function promptTop10(questions: string[], infos: { titre: string; valeur: string }[]): string {
  return `Voici les questions de posteurs TikTok de la semaine que le bot du support n'a pas su régler seul.
Regroupe celles qui demandent la même chose et donne les 10 plus fréquentes (moins s'il y en a moins).
Pour chacune : la question type en anglais (courte), combien de fois elle revient, et une réponse proposée en anglais
(3 phrases au plus, simple, signée par personne), qui s'appuie UNIQUEMENT sur les infos ci-dessous ; si les infos ne suffisent pas,
écris « À compléter : » puis ce que l'équipe doit décider. Jamais de montant ni de date inventés.

INFOS À CONNAÎTRE :
${infos.map((i) => `- ${i.titre} : ${i.valeur}`).join("\n")}

QUESTIONS :
${questions.map((q, i) => `${i + 1}. ${q}`).join("\n")}

Réponds en JSON seul : {"top": [{"question": "...", "fois": 3, "reponse": "..."}]}`;
}

export function lireTop10(brut: string): Top10[] {
  const m = brut.match(/\{[\s\S]*\}/);
  if (!m) return [];
  try {
    const o = JSON.parse(m[0]) as { top?: unknown };
    if (!Array.isArray(o.top)) return [];
    return o.top.slice(0, 10).map((x) => x as Record<string, unknown>)
      .filter((x) => typeof x.question === "string" && typeof x.reponse === "string")
      .map((x) => ({ question: String(x.question).slice(0, 300), fois: Math.max(1, Number(x.fois) || 1), reponse: String(x.reponse).slice(0, 800) }));
  } catch {
    return [];
  }
}

export function texteTop10(top: Top10[], osUrl: string): string {
  const lien = `${osUrl.replace(/\/+$/, "")}/admin/bot`;
  if (!top.length) return `Support : aucune question sans réponse cette semaine.\n${lien}`;
  return [
    "Support : les questions de la semaine sans réponse du bot (à ajouter au catalogue)",
    ...top.map((t, i) => `${i + 1}. ${t.question} (${t.fois}×)\n   → ${t.reponse}`),
    `Catalogue : ${lien}`,
  ].join("\n");
}
