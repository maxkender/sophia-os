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
export type ActionBot = "lien_mot_de_passe" | "renvoi_parrainage" | "pseudo_tiktok" | "email_ruul" | "invitation_ruul" | "arret" | "lien_slack" | "prevenir_max";

export const ACTIONS: readonly ActionBot[] = ["lien_mot_de_passe", "renvoi_parrainage", "pseudo_tiktok", "email_ruul", "invitation_ruul", "arret", "lien_slack", "prevenir_max"];
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
  historique: { cree_at: string; categorie: string | null; texte: string; bot_reponse?: string | null }[];
  /** Personne introuvable dans l'OS (Slack). */
  inconnu?: boolean;
  /** 0677 : les consignes de Max (page Support › Consignes), à respecter avant tout le reste. */
  consignes?: string[];
  /** 0680 : les documents de Support › Documents (Comment fonctionne Vik Studios, Poster Guide…). */
  documents?: { titre: string; texte: string }[];
}

export function promptBot(e: EntreeBot): string {
  const plateforme = e.plateforme === "ruul" ? "Ruul" : e.plateforme === "upwork" ? "Upwork" : "inconnue";
  const infos = e.infos.map((i) => `- ${i.titre} : ${i.valeur}`).join("\n");
  const catalogue = e.catalogue.map((c) =>
    `### [${c.id}] ${c.question}${c.formulations.length ? ` (aussi : ${c.formulations.join(" / ")})` : ""}\nRéponse : ${c.reponse}\nAction : ${c.action ?? "aucune"} · Niveau : ${c.niveau}`
  ).join("\n\n");
  const historique = e.historique.length
    ? e.historique.map((h) => `- ${h.cree_at.slice(0, 10)} [${h.categorie ?? "?"}] ${h.texte.slice(0, 160)}${h.bot_reponse ? `\n  → on a répondu : ${h.bot_reponse.slice(0, 200)}` : ""}`).join("\n")
    : "(aucune)";
  return `Tu réponds aux posteurs (créateurs TikTok payés chaque semaine) au nom de « the Vik Studios team ».
Canal : ${e.source === "slack_salon" ? "un salon Slack public (tout le monde lit)" : "la page Help du dashboard (privée)"}.
Plateforme de paie du posteur : ${plateforme}.${e.inconnu ? "\nCette personne est INTROUVABLE dans l'OS : demande-lui l'email utilisé pour s'inscrire." : ""}

PROCÉDURE
1. Lis sa fiche, ses données et ses demandes passées (ci-dessous).
2. Classe le message (categorie).
3. Réponds dans la langue du message (anglais par défaut), en 3 phrases au plus, simple, avec l'étape exacte qui lui manque d'après sa fiche.
4. Si une action de la liste règle le cas, choisis-la et dis-le dans la réponse. Actions possibles :
   lien_mot_de_passe (il n'arrive pas à se connecter : l'OS lui donne un nouveau mot de passe unique et lui renvoie par email son login et ce mot de passe ; il n'y a JAMAIS de lien « Set my password »), renvoi_parrainage (renvoyer l'email d'un parrainage),
   pseudo_tiktok (noter un nouveau pseudo TikTok ; action_valeur = le pseudo sans @),
   email_ruul (posteur Ruul qui donne une NOUVELLE adresse email pour Ruul ; action_valeur = l'email ; réponds en répétant l'adresse : « We've updated your Ruul email to X. You'll receive a new invitation from Ruul at this address. »),
   invitation_ruul (posteur Ruul qui n'a pas reçu l'invitation Ruul ; s'il est déjà « Invited » dans Ruul (13/11, confirmé par Ruul), réponds : « You don't need to wait for an email from Ruul. Go to app.ruul.io and sign up with this exact email: <son email Ruul>. Then add your ID and bank details (5 minutes). » ; sinon réponds : « Please check your spam folder for an email from Ruul. If it's not there, we'll send you a new invitation at <son email Ruul> within 24 hours. »),
   arret (SEULEMENT s'il demande clairement d'arrêter : STOP, fin du contrat, supprimer son compte, dans n'importe quelle langue ; une question, un voyage ou un doute ne suffisent pas),
   lien_slack (donner le lien d'invitation Slack),
   prevenir_max (un bug du dashboard que le catalogue couvre : tu donnes le contournement du catalogue, niveau "bot", et Max est prévenu).
5. Si AUCUNE règle (catalogue ou infos) ne couvre le cas : reponse = "${TEXTE_ON_VERIFIE}" et niveau = "adrien". N'invente JAMAIS une règle, une date ou un montant.

NIVEAUX (un seul)
- "bot" : tu as répondu et c'est réglé (questions du guide, étapes, TikTok, warm-up, login, Slack, quand/combien je suis payé avec les chiffres de l'OS, parrainage, arrêt, malade/absent, posts manqués selon la règle, statut, messages vides).
- "adrien" : pas de règle, bug du dashboard que le catalogue ne couvre pas, personne introuvable après l'email, offre de HM mal faite, recrue à relier, demande de 2e compte TikTok, même problème pour la 3e fois.
- "max" : SEULEMENT paiement non reçu alors que les données montrent la semaine payée ou due ; risque de double paie ; montant contesté après explication du calcul ; menace, litige, plainte publique, fraude (compte d'un ami, cash, plusieurs comptes, paiement hors plateforme).

VÉRIFIER AVANT D'AFFIRMER (obligatoire)
- N'affirme JAMAIS un fait sur la personne (payé ou pas, montant, compte Ruul prêt, nombre de posts, date) sans l'avoir lu dans SA FICHE ou ses DONNÉES ci-dessous. Une réponse type ne remplace jamais ses données.
- Si la donnée manque ou date de plus de 7 jours : dis honnêtement « We're checking this, you'll get an answer today. » et niveau "adrien" (ou "max" si c'est l'argent). N'invente rien.
- « Je n'ai pas été payé » : regarde ses semaines (paie_ruul / paie_upwork / paie_semaines, milestones).
  · Semaine due (terminée, posts faits, lundi passé) et non payée → niveau "max", risque "paiement".
  · Pas encore due → donne la date exacte (le lundi qui suit la semaine postée) et le montant d'après son tarif.
  · Bloquée par Ruul (compte pas prêt, « reporte ») → dis exactement ce qui manque d'après sa fiche Ruul. Ne promets jamais que « ça sera débloqué » sans dire quoi faire.
- Une réponse type (catalogue, FAQ par situation) ne règle JAMAIS une plainte « pas payé / milestone pas financé » : seules ses semaines de paie le peuvent. Paie ou milestones absents de ses données → niveau "max".
- Posteur Ruul qui parle d'Upwork (milestone, contrat Upwork) : réponds qu'il est payé chaque lundi par Ruul, sans JAMAIS écrire le mot « Upwork ».
- Un compte Ruul « Active » n'est PAS à créer : ne lui dis jamais de finir ou créer son compte Ruul.
- DÉJÀ RÉPONDU : lis « demandes_help » (ce qu'il a demandé et ce qu'on lui a répondu). Ne te contredis jamais. S'il revient avec le même problème, ne répète pas la même réponse : cherche plus loin dans ses données ; à la 3e fois, niveau "adrien".
- En salon Slack : rien de personnel (ni paie, ni montant, ni compte) : renvoie vers Help.

RÈGLES
- Ruul : jamais d'Upwork. Upwork : jamais de Ruul, ne propose jamais Ruul.
- Recrue Ruul qui veut être payée par Upwork, en cash ou via un ami : refus poli (la paie passe par Ruul, il peut arrêter avec STOP) ; ami ou cash = risque.
- Kill confirmé sur sa fiche (inactif) : message de fin poli.
- Message vide (« Hii???? », « Hello hiring manager ») : bonjour + ses étapes restantes.
- personnel = true si le message parle de SON compte, SA paie, SON contrat.
- risque : liste parmi ${RISQUES.join(", ")} (vide si rien).
- Ne dis jamais que tu es un bot, une IA ou un assistant automatique.

CONSIGNES DE MAX (elles passent avant tout le reste, y compris le catalogue)
${(e.consignes ?? []).length ? e.consignes!.map((c) => `- ${c}`).join("\n") : "(aucune)"}

INFOS À CONNAÎTRE (prioritaires, à jour)
${infos || "(aucune)"}

ORDRE QUAND DEUX SOURCES SE CONTREDISENT : consignes > infos > documents > catalogue. Un fait sur la personne (paie, Ruul, posts) se lit dans SA FICHE et ses données, jamais dans une réponse type.

DOCUMENTS (fonctionnement et guides ; à lire pour comprendre, pas à recopier)
${(e.documents ?? []).length ? e.documents!.map((d) => `### ${d.titre}\n${d.texte}`).join("\n\n") : "(aucun)"}

CATALOGUE (réponses types : officielles, du bot FAQ, et la FAQ pour sa situation)
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

const PARLE_DE_BOT = /\b(bot|chatbot|a\.?i\.?|artificial intelligence|intelligence artificielle|assistant automatique|automated assistant|language model|automatic(ally)?|automated|automation|automatique(ment)?|automatisation|automatisé)\b/i;
const MONTANT = /(\$\s?\d|\d\s?\$|€\s?\d|\d\s?€|\b\d+(?:[.,]\d+)?\s?(?:usd|eur|dollars?|euros?)\b)/i;

/**
 * Les garde-fous du code, après la décision du modèle. `nbMemeSujet` : ses demandes
 * passées de la même catégorie (2 avant celle-ci = la 3e fois).
 */
/** 0683 : « je n'ai pas été payé », « milestone pas financé »… (plusieurs langues courantes). */
export const PLAINTE_PAIE = /(not|n't|never|no)\s+(been\s+)?(paid|received|funded)|(haven't|have not|didn't|did not)\s+(get|got|receive)|where\s+is\s+my\s+(pay|payment|money|milestone)|pas\s+(été\s+)?pay|pas\s+reçu|no\s+(he\s+)?recibido|no\s+me\s+(han\s+)?pagado|non\s+(sono\s+stato\s+)?pagat|nicht\s+bezahlt|nie\s+otrzyma/i;

/**
 * 0683 : une plainte de paie d'un posteur Upwork dont l'OS n'a AUCUNE paie enregistrée (ni semaine
 * payée, ni milestone lisible) ne peut pas être réglée par une réponse type : elle va à Max.
 */
export function plainteSansDonnees(message: string, plateforme: "ruul" | "upwork" | null, aucunePaie: boolean): boolean {
  return plateforme === "upwork" && aucunePaie && PLAINTE_PAIE.test(message);
}

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
  if (/^(ok(ay)?|k|thanks?|thank you|thank u|thx|ty|merci|danke|grazie|gracias|obrigad[oa]|dzięki|perfect|great|cool|nice|got it|noted|alright|sure|yes|yep|done)( (thanks?|thank you|you|a lot|so much))*$/u.test(t)) return true;
  // 13/11 (Max) : « I'll do it tonight », « will do », « on it », « understood »… : pas de demande, « vu » dans le fil.
  if (t.length > 90 || /\?/.test(t)) return false;
  const u = t.replace(/[,.!;:]+/g, " ").replace(/\s+/g, " ").trim()
    .replace(/^((thank you( so much| a lot)?|thanks?|ok(ay)?|alright|sure|yes|yep|perfect|great|noted|got it|thx|ty|hi|hello|dear \w+) )+/u, "");
  if (/^(will do|on it|noted|understood|i understand|no problem|no worries|sounds good|all good|of course|for sure|with pleasure|you're welcome|have a (nice|good) (day|evening|night|weekend)|see you)( (thanks?|thank you|you))*$/u.test(u)) return true;
  return /^(i('ll| will| am going to|'m going to)|i'm|i am|will|gonna) (do(ing)?|finish(ing)?|complet(e|ing)|start(ing)?|check(ing)?|try(ing)?|fix(ing)?|set(ting)?|send(ing)?|join(ing)?|creat(e|ing)|post(ing)?|mak(e|ing)|work(ing)? on)( it| that| this| them| everything| all| up| the rest)?( (now|today|tonight|tomorrow|later|soon|asap|right away|this evening|this weekend|in a (few|couple of) (minutes|hours)|in the evening|in the morning))?( (thanks?|thank you|you))*$/u.test(u);
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

/** 12/11 : le DM à Max pour un bug du dashboard (le posteur a déjà reçu le contournement). */
export function texteBugMax(b: { nom: string; plateforme: "ruul" | "upwork"; message: string; reponse: string; raison: string }, osUrl: string): string {
  return [
    `🛠️ Bug du dashboard — ${b.nom} (${b.plateforme === "ruul" ? "Ruul" : "Upwork"})`,
    `Le posteur : « ${b.message.replace(/\s+/g, " ").slice(0, 300)} »`,
    `Réponse envoyée : ${b.reponse}`,
    ...(b.raison ? [`L'OS : ${b.raison}`] : []),
    `${osUrl.replace(/\/+$/, "")}/admin/bot`,
  ].join("\n");
}
