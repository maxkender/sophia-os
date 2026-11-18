/**
 * 17/11 (Max) : corrections du bot support (Help, Slack, Upwork, email). Partie sans réseau ni base (testée) :
 * la détection des cas réglés par une réponse fixe, les textes fixes (en anglais, traduits ensuite dans la langue
 * du message), et la vraie situation du posteur (actif / kill / arrêt en cours / incohérence) lue dans
 * support_etat_reel, la même source que le dashboard.
 */

export const TEXTES = {
  /** 1. Lien de post impossible à ajouter : jamais « We're checking », jamais d'escalade individuelle. */
  lien_post: "As long as you posted, it's fine. We have people checking that you posted when the link is not there. But make sure to always add the link when you can.",
  /** 2. Le dashboard et nos données ne concordent pas. */
  ecart_dashboard: "We see a mismatch on our side, we're fixing it. Keep posting as usual.",
  /** 3. Exception Upwork. */
  upwork_demande: "No problem. Please reply here with the link to your Upwork freelancer profile and we'll send you an offer on Upwork.",
  upwork_lien_ok: "Thanks, we'll send you an offer on Upwork soon.",
  upwork_lien_invalide: "Please send the link to your Upwork freelancer profile. It looks like this: https://www.upwork.com/freelancers/...",
  /** 4. Parrainage. */
  parrainage_cash: "Referrals are always paid directly by us, never in cash and never through you. Your friend just needs to sign up and get set up like any other poster.",
  /** 6. Arrêts et kills. */
  actif: "Your account is still active, please keep posting.",
  arret_recu: "Request received, the team will confirm the end of your contract.",
  arret_confirme: "Your contract has now ended. Thank you for your work with us.",
  inactif_sans_raison: "Your account is no longer active. The team will confirm the details with you today.",
  /** 7. Message vide ou flou. */
  flou: "What exactly is happening? You can send a screenshot.",
  meme_probleme: "Thanks, we've added you to the same issue. We'll update you there.",
  /** 18/11 (Max) : le posteur se plaint de ne pas avoir de réponse : il escalade lui-même ou passe par Slack. */
  pas_de_reponse: "Sorry for the wait. To escalate, click « I still need help » under our answer in Help, or post your question in Slack in #posting-help. The team will pick it up there.",
  /** 8. Le posteur dit que ce n'est pas réglé. */
  rouverte: "Sorry it's still not fixed. The team is looking at it again with everything you sent.",
  /** 7. Le minimum quand l'équipe doit regarder. */
  equipe: "Thanks, the team is looking into it. We'll get back to you here.",
} as const;

export type CasFixe = "lien_post" | "upwork_demande" | "upwork_lien" | "parrainage_cash" | "flou" | "meme_probleme" | "pas_de_reponse" | "pas_regle" | null;

/** 1. Le lien d'un post impossible à ajouter (plusieurs langues) : erreur sur « Mark as published », 2e post pas compté… */
const LIEN_POST = new RegExp([
  "mark(ed)?\\s+as\\s+published", "i\\s+posted\\s+it", "can'?t\\s+(add|paste|put|submit|enter|save)\\s+(the\\s+|my\\s+)?link",
  "(add|paste|put|submit|enter|save)\\w*\\s+(the\\s+|my\\s+)?link", "link\\s+(field|box|button)", "no\\s+(field|place|box)\\s+(for|to\\s+(add|put))\\s+(the\\s+)?link",
  "(second|2nd|2)\\s+post\\s+(is\\s+)?(not|isn'?t|wasn'?t|didn'?t)\\s+(count|show|register)", "nothing\\s+planned\\s+(for\\s+)?today",
  "(images?|slides?|pictures?)\\s+(changed|change|are\\s+different)\\s+after", "post\\s+(not|isn'?t)\\s+(counted|showing|registered)",
  "lien\\s+(du|de\\s+mon)\\s+post", "ajouter\\s+(le\\s+)?lien", "enlace\\s+(del|de\\s+la)\\s+publicaci", "link\\s+(del|al)\\s+post", "link\\s+do\\s+post",
  "link\\s+(zum|des)\\s+post", "link\\s+do\\s+posta", "linkul\\s+postăr", "link(et|je)?\\s+(a\\s+)?(poszt|bejegyz)", "gönderi\\s+bağlant",
].join("|"), "i");

/** 3. Être payé par Upwork plutôt que par Ruul. */
const PAYE_UPWORK = /(pa(id|y|yment)|money|salary|receive)[^.?!]{0,40}\b(via|through|by|on|with|over)\s+up\s?work|up\s?work\s+(instead|rather)|(prefer|want|rather|like|switch)[^.?!]{0,30}up\s?work|instead\s+of\s+ruul|(not|don'?t|can'?t|no)\s+(want\s+to\s+)?(use\s+)?ruul|(pay|payer|pagar|pagare|bezahlen)[^.?!]{0,30}up\s?work/i;
const LIEN_UPWORK = /https?:\/\/(?:www\.)?upwork\.com\/[^\s<>()"']+/i;
const PROFIL_UPWORK = /^https?:\/\/(?:www\.)?upwork\.com\/freelancers\/[~a-z0-9_./?=&-]+$/i;

/** 4. Le filleul payé en cash ou par le parrain. */
const PARRAINAGE_CASH = /(friend|referral|referred|refer|cousin|sister|brother|ami|amie|filleul|amigo|amica|amico|freund)[^.?!]{0,80}(cash|in\s+hand|through\s+me|via\s+me|by\s+me|pay\s+(him|her|them)\s+(myself|me)|i('ll|\s+will|\s+can)\s+pay|à\s+travers\s+moi|en\s+(espèces|liquide)|en\s+efectivo|in\s+contanti|bar(geld)?)|(cash|in\s+hand|through\s+me|en\s+(espèces|liquide)|en\s+efectivo|in\s+contanti)[^.?!]{0,80}(friend|referral|referred|ami|amie|filleul|amigo|amica|amico|freund)/i;

/** 7. Message vide ou flou (rien d'actionnable). */
const FLOU = /^(me\s+too|me\s+2|same(\s+(here|issue|problem|for\s+me))?|\+1|help(\s+me)?(\s+please|\s+pls)?|please\s+help|i\s+(have|got)\s+(a\s+)?(problem|issue)|(there\s+is\s+)?(a\s+)?problem|issue|not\s+working|it\s+doesn'?t\s+work|hello+|hi+|hey+|good\s+(morning|evening|afternoon)|moi\s+aussi|pareil|j'?ai\s+un\s+probl[eè]me|aide(\s+moi)?|bonjour|salut|yo\s+tambi[eé]n|igual|ayuda|hola|tengo\s+un\s+problema|anch'?io|aiuto|ciao|ho\s+un\s+problema|ich\s+auch|hilfe|hallo|eu\s+tamb[eé]m|ajuda|ol[aá]|ja\s+te[żz]|pomocy|cze[sś][cć]|[?!.\s]+)[\s!?.]*$/i;
/** « same issue as X » : rattacher à la demande d'origine. */
const MEME_QUE = /\bsame\s+(issue|problem|thing|bug)\s+(as|like)\s+(@?[\p{L}][\p{L}' .-]{1,40})/iu;

/** 18/11 : « personne ne me répond » (plusieurs langues). */
const PAS_DE_REPONSE = /\b(no(body|\s+one)\s+(is\s+)?(answer|repl(y|ies|ied)|respond|help|get(s|ting)?\s+back)\w*|(no|not\s+(any|an?))\s+(answer|reply|response)s?\s+(yet|from\s+you|from\s+anyone|to\s+my)|(still\s+)?(waiting|wait(ed)?)\s+(for\s+)?(an?\s+)?(answer|reply|response)|didn'?t\s+(get|receive)\s+(any\s+|an?\s+)?(answer|reply|response)|(never|nobody)\s+(answer|repl|respond)\w*|(you|team)\s+(are\s+)?(ignor|not\s+answer|not\s+repl|don'?t\s+answer|don'?t\s+repl|never\s+answer)\w*)|personne\s+ne\s+(me\s+)?r[ée]pond|pas\s+(de|eu\s+de)\s+r[ée]ponse|nadie\s+(me\s+)?(responde|contesta)|sin\s+respuesta|nessuno\s+(mi\s+)?risponde|nessuna\s+risposta|niemand\s+antwortet|keine\s+antwort|ningu[ée]m\s+(me\s+)?responde|sem\s+resposta/i;

/** 8. « Ce n'est pas réglé ». */
const PAS_REGLE = /(still|again|always)\s+(not|doesn'?t|isn'?t|can'?t|the\s+same|same\s+problem|broken|an?\s+(issue|error|problem))|(not|isn'?t|wasn'?t)\s+(fixed|solved|resolved|working)|didn'?t\s+(work|help|fix)|doesn'?t\s+work|same\s+(problem|issue|error)\s+(again|still)|toujours\s+(pas|le\s+même|un\s+probl)|pas\s+(réglé|résolu|corrigé)|sigue\s+(sin|igual|el\s+mismo)|no\s+(se\s+)?(ha\s+)?(resuelto|arreglado|funciona)|ancora\s+(non|lo\s+stesso)|non\s+(funziona|risolto)|immer\s+noch|funktioniert\s+(immer\s+)?nicht|ainda\s+n[aã]o/i;

/** 6. Questions sur l'arrêt, le kill, l'accès refusé, « est-ce que je suis toujours dedans ? ». */
const QUESTION_STATUT = /(still\s+(in|active|part|working|with\s+you|employed|on\s+the\s+team)|am\s+i\s+(fired|kicked|removed|out|stopped|done)|(was|were|been|got)\s+(i\s+)?(fired|kicked|removed|stopped|terminated|killed|deleted|deactivated|banned)|(account|contract|profile)\s+(was\s+|is\s+|has\s+been\s+)?(deleted|deactivated|disabled|closed|ended|stopped|terminated|removed)|access\s+(denied|refused|removed)|can'?t\s+(log\s?in|access)\s+(anymore|any\s+more)|why\s+(was|is)\s+my\s+(account|contract)|est-ce\s+que\s+je\s+(suis|fais)\s+toujours|compte\s+(supprimé|désactivé|bloqué)|contrat\s+(terminé|arrêté|fini)|sigo\s+(activo|dentro)|cuenta\s+(eliminada|desactivada)|ancora\s+attiv|account\s+(eliminato|disattivato)|noch\s+aktiv|konto\s+(gelöscht|deaktiviert))/i;

/** 6. Une demande d'arrêt claire (STOP, fin de contrat, supprimer le compte). */
const DEMANDE_ARRET = /^\s*stop\s*[.!]*\s*$|\b(i\s+(want|would\s+like|wish|need)\s+to\s+(stop|quit|leave|end|cancel|terminate)|please\s+(stop|end|close|cancel|terminate|delete)\s+(my\s+)?(contract|account|collaboration)|(delete|close|remove|deactivate|cancel)\s+my\s+(account|contract|profile)|i\s+(quit|resign)|i('m|\s+am)\s+(quitting|leaving|out)|je\s+(veux|souhaite)\s+(arr[eê]ter|quitter|supprimer)|(quiero|deseo)\s+(dejar|parar|cancelar|eliminar)|voglio\s+(smettere|lasciare|cancellare)|ich\s+(möchte|will)\s+(aufhören|kündigen|löschen))/i;

export function lienUpwork(texte: string): string | null {
  const m = texte.match(LIEN_UPWORK);
  return m ? m[0].replace(/[.,;!?)\]]+$/, "") : null;
}

export function estProfilUpwork(lien: string): boolean {
  return PROFIL_UPWORK.test(lien);
}

/**
 * Le cas réglé par une réponse fixe, d'après le message seul (le modèle peut aussi l'avoir classé : voir
 * casDeCategorie). `attenteLienUpwork` : le posteur a demandé l'exception Upwork et on attend son lien.
 */
export function detecterCas(message: string, o: { plateforme: "ruul" | "upwork" | null; attenteLienUpwork: boolean }): { cas: CasFixe; lien?: string; meme_que?: string } {
  const t = message.trim();
  const lien = lienUpwork(t);
  if (lien && (o.attenteLienUpwork || o.plateforme === "ruul")) return { cas: "upwork_lien", lien };
  if (o.plateforme === "ruul" && PAYE_UPWORK.test(t)) return { cas: "upwork_demande" };
  if (PARRAINAGE_CASH.test(t)) return { cas: "parrainage_cash" };
  const meme = t.match(MEME_QUE);
  if (meme) return { cas: "meme_probleme", meme_que: meme[3]!.trim().replace(/^@/, "") };
  if (PAS_DE_REPONSE.test(t)) return { cas: "pas_de_reponse" };
  if (FLOU.test(t)) return { cas: "flou" };
  if (LIEN_POST.test(t)) return { cas: "lien_post" };
  return { cas: null };
}

/** Le cas d'après la catégorie donnée par le modèle (quand le message n'a pas été reconnu par les règles). */
export function casDeCategorie(categorie: string, plateforme: "ruul" | "upwork" | null): CasFixe {
  if (categorie === "lien_post") return "lien_post";
  if (categorie === "paie_upwork" && plateforme === "ruul") return "upwork_demande";
  if (categorie === "parrainage_cash") return "parrainage_cash";
  if (categorie === "flou") return "flou";
  return null;
}

export const estPasRegle = (t: string) => PAS_REGLE.test(t);
export const estQuestionStatut = (t: string) => QUESTION_STATUT.test(t);
export const estDemandeArret = (t: string) => DEMANDE_ARRET.test(t);

// ---------------------------------------------------------------------------------------------------------------
// 6. La vraie situation (support_etat_reel).
// ---------------------------------------------------------------------------------------------------------------

export interface EtatReel {
  actif: boolean;
  canal_paie: "ruul" | "upwork";
  cohorte: string | null;
  comptes: { handle: string | null; actif: boolean; non_renouveler: boolean | null; raison: string | null; le: string | null }[];
  comptes_actifs: number;
  warmup: { pret: boolean | null; abonnements: number | null; existe: boolean | null; releve_at: string | null; debut: string | null } | null;
  posts_aujourdhui: { prevus: number; publies: number } | null;
  posts_semaine: { prevus: number; publies: number; liens: number } | null;
  arret: { source: string | null; motif: string | null; le: string | null; statut: string | null; semaine: string | null } | null;
  contrat_upwork: { id: string | null; etat: string | null; actif: boolean | null; lu_at: string | null } | null;
  ruul: { onboarding: string | null; statut: string | null; compte: string | null } | null;
  paie: { semaine: string; total?: number; montant?: number; statut: string | null; ruul_statut?: string | null; action?: string | null; paye_at: string | null }[];
  upwork_exception: { statut: string; lien: boolean } | null;
}

export interface Situation {
  statut: "actif" | "kill" | "arret_en_cours" | "pause";
  le: string | null;
  raison: string | null;
  /** Ce qui reste à payer (semaines dues et pas encore payées). */
  a_payer: { semaine: string; montant: number }[];
  incoherences: string[];
}

const ARRET_FINI = new Set(["fait", "termine", "annule"]);

export function situation(e: EtatReel, dejaAnnonceArret = false): Situation {
  const inactif = !e.actif || e.comptes_actifs === 0;
  const arretEnCours = !!e.arret && !ARRET_FINI.has(e.arret.statut ?? "");
  const desactive = e.comptes.filter((c) => !c.actif && (c.raison || c.le)).sort((a, b) => (b.le ?? "").localeCompare(a.le ?? ""))[0];
  const le = e.arret?.le ?? desactive?.le ?? null;
  const raison = e.arret?.motif ?? desactive?.raison ?? null;
  const a_payer = e.paie
    .filter((p) => !p.paye_at && (e.canal_paie === "ruul" ? ["a_payer", "reporte"].includes(p.statut ?? "") : p.action === "payer"))
    .map((p) => ({ semaine: p.semaine, montant: Number(p.total ?? p.montant ?? 0) }))
    .filter((p) => p.montant > 0);
  const incoherences: string[] = [];
  if (inactif && e.contrat_upwork?.actif) incoherences.push(`compte désactivé dans l'OS mais contrat Upwork ${e.contrat_upwork.id ?? "?"} encore actif (${e.contrat_upwork.etat ?? "?"})`);
  if (!inactif && dejaAnnonceArret && !arretEnCours) incoherences.push("compte actif dans l'OS alors qu'un arrêt lui a déjà été annoncé");
  if (inactif && !raison) incoherences.push("compte désactivé sans arrêt ni raison enregistrés dans l'OS");
  const statut = inactif ? "kill" : arretEnCours ? "arret_en_cours" : "actif";
  return { statut, le, raison, a_payer, incoherences };
}

/** « 16 Nov » (heure de Paris). */
export function dateCourte(iso: string): string {
  return new Date(iso.length <= 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/Paris" });
}

/** Le lundi qui suit une semaine (le jour de paie). */
export function lundiDePaie(semaine: string): string {
  const d = new Date(`${semaine}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 7);
  return d.toISOString().slice(0, 10);
}

/**
 * La réponse vraie sur son statut (en anglais) : kill avec la date et la raison en clair (`raisonClaire`, déjà
 * traduite du motif) et ce qui sera payé ; actif ; arrêt en cours. null : pas de réponse sûre (l'équipe confirme).
 */
export function texteStatut(s: Situation, raisonClaire: string | null): string | null {
  if (s.statut === "actif") return TEXTES.actif;
  if (s.statut === "arret_en_cours") return TEXTES.arret_recu;
  if (!raisonClaire || !s.le) return null;
  const paie = s.a_payer.length
    ? ` You will still be paid ${s.a_payer.reduce((t, p) => t + p.montant, 0)} $ for ${s.a_payer.map((p) => `the week of ${dateCourte(p.semaine)}`).join(" and ")}, on Monday ${dateCourte(lundiDePaie(s.a_payer[0]!.semaine))}.`
    : " There is no payment left for your last weeks.";
  return `Your account was stopped on ${dateCourte(s.le)} because ${raisonClaire.replace(/[.\s]+$/, "")}.${paie}`;
}

/** Le statut du posteur en une ligne pour l'équipe (escalade). */
export function ligneStatut(e: EtatReel | null): string {
  if (!e) return "posteur inconnu";
  const s = situation(e);
  const warmup = e.warmup ? (e.warmup.pret ? "warm-up fini" : e.warmup.debut ? `warm-up en cours (${e.warmup.abonnements ?? 0} abonnements)` : "warm-up pas lancé") : null;
  return [
    s.statut === "kill" ? `kill${s.le ? ` le ${s.le.slice(0, 10)}` : ""}${s.raison ? ` (${s.raison})` : ""}` : s.statut === "arret_en_cours" ? "arrêt en cours" : "actif",
    warmup,
    e.cohorte ? `cohorte du ${e.cohorte}` : null,
    e.canal_paie === "ruul" ? `Ruul${e.ruul?.onboarding ? ` ${e.ruul.onboarding}` : ""}` : "Upwork",
    e.posts_semaine ? `posts semaine ${e.posts_semaine.publies}/${e.posts_semaine.prevus}` : null,
  ].filter(Boolean).join(" · ");
}

/** Ce que le dashboard montre au posteur, en clair pour le modèle (il ne doit jamais le contredire). */
export function etatDashboardTexte(e: EtatReel | null): string {
  if (!e) return "ÉTAT DU DASHBOARD : posteur inconnu.";
  const w = e.warmup;
  return [
    "ÉTAT DU DASHBOARD (ce que le posteur voit, même source que sa page ; ne jamais le contredire) :",
    `- compte : ${e.actif && e.comptes_actifs > 0 ? "actif" : "désactivé"} (${e.comptes_actifs} compte(s) actif(s))`,
    `- warm-up : ${w ? (w.pret ? "validé" : w.debut ? `en cours, ${w.abonnements ?? 0} abonnements relevés` : "pas lancé") : "aucun compte actif"}`,
    `- posts aujourd'hui : ${e.posts_aujourdhui?.publies ?? 0} publiés sur ${e.posts_aujourdhui?.prevus ?? 0} prévus`,
    `- posts cette semaine : ${e.posts_semaine?.publies ?? 0} publiés sur ${e.posts_semaine?.prevus ?? 0} prévus (${e.posts_semaine?.liens ?? 0} avec lien)`,
    `- canal de paie : ${e.canal_paie}${e.ruul ? ` (Ruul : ${e.ruul.onboarding ?? "?"})` : ""}`,
    `- paiements : ${e.paie.length ? e.paie.map((p) => `semaine ${p.semaine} ${p.total ?? p.montant ?? 0} $ ${p.paye_at ? "payé" : p.statut ?? ""}`).join(" ; ") : "aucun"}`,
    `- arrêt : ${e.arret ? `${e.arret.source ?? ""} ${e.arret.statut ?? ""} le ${(e.arret.le ?? "").slice(0, 10)} (${e.arret.motif ?? "sans motif"})` : "aucun"}`,
  ].join("\n");
}
