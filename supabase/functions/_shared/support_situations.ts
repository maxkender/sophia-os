/**
 * 21/11 (Max, « Les situations ») : les réponses fixes du bot, adaptées à la personne, sans « we're checking ».
 * Partie sans réseau ni base (testée) : la détection dans le message et le texte (anglais, traduit ensuite dans la
 * langue du posteur). Chaque situation dit si la demande se ferme tout de suite, si le contenu est signalé à la qualité
 * et si le jour compte comme fait.
 */
import { PAIE_RUUL_DEUX_COMPTES } from "./doublement.ts";

export type CleSituation =
  | "contenu_langue" | "contenu_texte_integre" | "contenu_police" | "contenu_texte_faux" | "contenu_hors_sujet" | "son_indisponible" | "petite_liberte"
  | "commentaires" | "frais_ruul" | "ruul_deux_comptes" | "pas_freelance" | "test_app" | "bon_avis" | "nom_compte" | "rien_prevu"
  | "assistant_boucle" | "reactiver_2e_compte";

export interface SituationFixe {
  cle: CleSituation;
  texte: string;
  categorie: string;
  /** La demande se ferme dès la réponse envoyée. */
  fermer: boolean;
  /** Le contenu est signalé à la qualité (jamais à Max). */
  qualite?: boolean;
  /** Le jour compte comme fait (paie, posts de la semaine, missed day, kill, doublement). */
  jourCompte?: boolean;
  /** Un ticket dans #a-os-tickets (bug technique) : la demande reste ouverte jusqu'à ce que ce soit réglé. */
  ticket?: string;
}

export const TEXTES_SITUATIONS = {
  /** 22/11 (Max) : les 4 réponses officielles aux problèmes de contenu. */
  langue: "Translate it into your language as best you can and post it.",
  texte_faux: "Please always post the text and images you are given. If there is really an issue with the post, edit the text so it makes sense, or post an old post that performed well.",
  texte_integre: "That's normal, the text is already on the images, just post the photos.",
  police: "That's fine.",
  hors_sujet: "Post it anyway. If it's really off-topic, post an old post that worked.",
  son: "Use the sound shown on your dashboard. If it's unavailable, pick a similar trending sound. A post already published with another sound can stay up, no need to delete it.",
  liberte: "That's fine, thanks for letting us know.",
  commentaires: "You can ignore or like those comments, no need to answer them. If someone asks for the link or what the app is, reply with the app link shown on your dashboard.",
  frais_ruul: "Vik Studios pays the Ruul fees, so your weekly pay arrives in full, nothing is deducted. After Monday's payment, the bank validation takes 1 to 2 business days (Tuesday or Wednesday).",
  /** 22/11 (Max) : un posteur Ruul à 2 comptes TikTok n'ouvre pas un 2e compte Ruul. */
  ruul_deux_comptes: PAIE_RUUL_DEUX_COMPTES,
  pas_freelance: "No need to be a freelancer, Ruul pays you as an individual. Just finish your Ruul sign-up.",
  test_app: "Thanks, but we only pay for posts.",
  bon_avis: "If you end properly, yes.",
  nom_compte: "Keep the assigned name, it's a themed account.",
  annule: "Your account has been cancelled.",
  verification: "We're checking the situation.",
  assistant_boucle: "Thanks for telling us. The team is fixing the Help assistant; you'll get a message here once it's done.",
  reactive: "Done, your second account is active again on your dashboard.",
} as const;

// 22/11 (Max) : un posteur Ruul à 2 comptes TikTok croit devoir ouvrir un 2e compte Ruul (2e email, 2e vérification).
const RUUL_DEUX_COMPTES = /(second|2nd|another|two|2|both|separate|new|other)\s+(different\s+|separate\s+|new\s+)?(ruul\s+)?(ruul|verifications?|kyc|e-?mails?|sign[\s-]?ups?|profiles?|ruul\s+accounts?)|(only|just)\s+(do\s+)?(one|1)\s+(ruul\s+)?(verification|kyc|account)|(paid|payments?|pay)\s+for\s+(both|two|2|my\s+(second|2nd|other))\s+accounts?/i;
const MENTION_RUUL = /\bruul\b/i;

const n = (t: string) => t.replace(/[’‘`]/g, "'");

// 22/11 (Max) : 1. texte sans sens, mauvaise langue, mélange de langues.
const LANGUE = /\b(wrong|different|another|other)\s+language|not\s+in\s+my\s+language|in\s+english\s+(but|instead)|(mixed|mix\s+of|two|several|multiple)\s+languages|languages?\s+(are\s+)?mixed|(text|caption|it|this)\s+(doesn'?t|does\s+not)\s+make\s+(any\s+)?sense|makes\s+no\s+sense|nonsense|gibberish|doesn'?t\s+make\s+(any\s+)?sense/i;
// 3. post Fully Podz : le texte est déjà sur les images (rien à coller).
const TEXTE_INTEGRE = /(no|missing|without|there'?s\s+no|there\s+is\s+no|where('?s|\s+is)\s+(the\s+)?)\s*(text|caption)\s+(to\s+(paste|copy|add)|for\s+(the\s+)?(slides?|post|images?)|on\s+(my\s+)?dashboard)|text\s+is\s+(already\s+)?(on|in|written\s+on)\s+the\s+(images?|photos?|slides?)|(images?|photos?|slides?)\s+already\s+(have|has|contain)\s+(the\s+)?text/i;
// 2. texte beaucoup trop long, images sans rapport, image cassée, vrai problème sur TikTok → un ancien TikTok.
const ANCIEN_TIKTOK = /(text|caption|texte|texto|testo)[^.?!]{0,40}\b(wrong|too\s+long|doesn'?t\s+(match|fit)|does\s+not\s+(match|fit)|not\s+(matching|fit)|mistakes?|errors?|incorrect|cut\s+off|strangely\s+long)|(images?|pictures?|photos?)[^.?!]{0,30}\b(don'?t|do\s+not|doesn'?t|does\s+not)\s+match|\b(identical|same|duplicate)\s+(pictures?|images?|photos?|slides?)|nothing\s+to\s+do\s+with\s+(the\s+)?(caption|text|topic|post)|(images?|pictures?|photos?|slides?)[^.?!]{0,40}\b(worse|bad|low|poor)\s+quality|not\s+coherent|incoherent|(post|slideshow|content)\s+(is|looks)\s+(wrong|broken|bad|weird)|(images?|photos?|slides?|pictures?)[^.?!]{0,40}\b(no|without|have\s+no|don'?t\s+have|do\s+not\s+have|missing|has\s+no)\s+(any\s+)?(the\s+)?text|no\s+text\s+(on|in)\s+(the\s+)?(images?|slides?|photos?|pictures?)|none\s+of\s+the\s+(\w+\s+)?(images?|photos?|slides?|pictures?)\s+(have|has)\s+(any\s+)?text|(images?|photos?|pictures?|slides?)[^.?!]{0,15}\b(broken|corrupt(ed)?|not\s+loading|won'?t\s+load|doesn'?t\s+load|blank)|tiktok[^.?!]{0,50}\b(won'?t\s+let|doesn'?t\s+let|error|can'?t\s+(upload|post|publish)|fails?\s+to\s+(upload|post))/i;
// 4. police ou couleur changée pour que le texte soit lisible.
const POLICE = /\b(font|colou?r)\b[^.?!]{0,60}\b(read|readable|visible|see|legible)|\b(change|changed|use|used|put|chose|switched)\b[^.?!]{0,40}\b(font|colou?r)\b|\b(white|black)\s+(instead\s+of|font|text)/i;
const HORS_SUJET = /(content|posts?|slideshows?|topics?)[^.?!]{0,50}\b(doesn'?t|don'?t|do\s+not|does\s+not|not)\s+(fit|match|suit|correspond)[^.?!]{0,40}(profile|account|country|niche|persona)|my\s+(profile|account)\s+(identifies|is\s+(about|for)|shows)[^.?!]{0,80}\bbut\b|off[-\s]topic/i;
const SON = /(sound|song|music|audio|musique|sonido|música|suono|dźwięk|ses|hang)[^.?!]{0,40}\b(not\s+available|unavailable|isn'?t\s+available|wasn'?t\s+available|can'?t\s+(find|use)|doesn'?t\s+exist|no\s+longer|not\s+found|indisponible|no\s+disponible|non\s+disponibile|niedostępn|mevcut\s+değil|nem\s+elérhető)/i;
const LIBERTE = /\b(i\s+)?(used|changed|put|chose|picked|switched\s+to|replaced)\b[^.?!]{0,40}\b(font|colou?r|old(er)?\s+sound|previous\s+(sound|ones?|post)|one\s+of\s+the\s+(previous|old(er)?)\s+ones?|another\s+(sound|slide|font|image)|different\s+(sound|slide|font|image|colou?r)|white|black)\b/i;
const COMMENTAIRES = /\bcomments?\b|\bcommented\b|komment|yorum|comentario|commento|komentarz/i;
const COMMENTAIRE_SUJET = /\b(ai\b|a\.i\.|fake|not\s+true|isn'?t\s+true|wrong|hate|criticiz|negative|rude|link|what\s+(is\s+)?(the\s+)?app|which\s+app|app\s+name|answer|reply|respond)/i;
const FRAIS_RUUL = /(fees?|commission|charges?|kezelési|költség|komisyon|comisi[oó]n|commissione|gebühr|prowizj|taxa)[^.?!]{0,60}\bruul|\bruul[^.?!]{0,80}(fees?|commission|charges?|kezelési|költség|komisyon|comisi[oó]n|commissione|gebühr|prowizj|taxa)/i;
const PAS_FREELANCE = /\b(not|no|never\s+been)\s+(a\s+)?freelancer|i'?m\s+not\s+(a\s+)?freelance|i\s+am\s+not\s+(a\s+)?freelance|not\s+a\s+requirement|nem\s+vagyok\s+szabadúszó|no\s+soy\s+(un[ao]?\s+)?freelance|serbest\s+çalışan\s+değilim|non\s+sono\s+(un[ao]?\s+)?freelance|nie\s+jestem\s+freelancer/i;
const TEST_APP = /\b(test(ed|ing)?|tried|trying)\s+(out\s+)?(the\s+)?(sophia\s+|micabo\s+|unswipe\s+)?app\b|app\s+test(ing)?\b|additional\s+work[^.?!]{0,40}test/i;
const BON_AVIS = /\b(good|positive|nice|5[\s-]?star)\s+(review|feedback|rating)|\b(review|feedback|rating)\b[^.?!]{0,60}\b(if\s+i\s+(end|stop|quit|leave)|negative|first\s+week)/i;
const NOM_COMPTE = /\b(change|rename|modify)\b[^.?!]{0,40}\b(name|gender|persona)\b|\b(feminine|female|masculine|male|girl'?s|boy'?s|woman'?s|man'?s)\s+(name|account|persona)\b/i;
const RIEN_PREVU = /nothing\s+(is\s+)?(planned|scheduled|to\s+post)|no\s+(posts?|tasks?|slideshows?)\s+(planned|scheduled|today|for\s+today|to\s+post|yet)|(haven'?t|have\s+not|didn'?t)\s+(been\s+)?(assigned|received|got|get)\s+(any\s+)?(tasks?|posts?|slideshows?)|where\s+(are\s+)?(my|today'?s)\s+posts|nothing\s+to\s+post|no\s+postings?\s+available|(first|1st)\s+day[^.?!]{0,80}\b(nothing|no\s+posts?|empty)/i;

const ASSISTANT_BOUCLE = /(help|assistant|chat|bot|sophia\s+app)[^.?!]{0,80}\b(repeat(s|ing)?|keeps?\s+(saying|repeating|giving)|same\s+(answer|reply|message)|loop)/i;
const REACTIVER_2E = /(reactivate|re-?activate|turn\s+back\s+on|enable|activate\s+again)[^.?!]{0,60}\b(second|2nd|other|another)\s+(tiktok\s+)?account|(second|2nd)\s+(tiktok\s+)?account[^.?!]{0,60}\b(reactivat|back|disappear|missing|gone|deactivat|no\s+posts)/i;

/** Le posteur demande de réactiver son 2e compte (règle 17). */
export const estReactiver2eCompte = (message: string) => REACTIVER_2E.test(n(message));

/** Le message parle-t-il d'un jour sans posts (« nothing planned today ») ? */
export const estRienPrevu = (message: string) => RIEN_PREVU.test(n(message));

/**
 * La situation reconnue dans le message, ou null. Les cas de contenu passent avant les questions générales : une
 * image sans texte n'est jamais « we're checking ».
 */
export function situationFixe(message: string, o: { plateforme: "ruul" | "upwork" | null } = { plateforme: null }): SituationFixe | null {
  const t = n(message);
  if (ASSISTANT_BOUCLE.test(t)) {
    return { cle: "assistant_boucle", texte: TEXTES_SITUATIONS.assistant_boucle, categorie: "bug", fermer: false, ticket: "L'assistant Help du dashboard répète la même réponse en boucle." };
  }
  // 22/11 (Max) : les problèmes de contenu : réponse tout de suite, jamais « we're checking » ni ticket, signalés à Quality
  // Control ; le jour compte comme fait quand le post ne peut pas être publié tel quel.
  if (LANGUE.test(t)) return { cle: "contenu_langue", texte: TEXTES_SITUATIONS.langue, categorie: "contenu", fermer: true, qualite: true, jourCompte: true };
  if (TEXTE_INTEGRE.test(t)) return { cle: "contenu_texte_integre", texte: TEXTES_SITUATIONS.texte_integre, categorie: "contenu", fermer: true, qualite: true };
  if (ANCIEN_TIKTOK.test(t)) return { cle: "contenu_texte_faux", texte: TEXTES_SITUATIONS.texte_faux, categorie: "contenu", fermer: true, qualite: true, jourCompte: true };
  if (POLICE.test(t)) return { cle: "contenu_police", texte: TEXTES_SITUATIONS.police, categorie: "contenu", fermer: true, qualite: true };
  if (HORS_SUJET.test(t)) return { cle: "contenu_hors_sujet", texte: TEXTES_SITUATIONS.hors_sujet, categorie: "contenu", fermer: true, qualite: true };
  if (LIBERTE.test(t)) return { cle: "petite_liberte", texte: TEXTES_SITUATIONS.liberte, categorie: "posting", fermer: true };
  if (SON.test(t)) return { cle: "son_indisponible", texte: TEXTES_SITUATIONS.son, categorie: "posting", fermer: true };
  if (COMMENTAIRES.test(t) && COMMENTAIRE_SUJET.test(t)) return { cle: "commentaires", texte: TEXTES_SITUATIONS.commentaires, categorie: "posting", fermer: true };
  if ((MENTION_RUUL.test(t) || o.plateforme === "ruul") && RUUL_DEUX_COMPTES.test(t)) {
    return { cle: "ruul_deux_comptes", texte: TEXTES_SITUATIONS.ruul_deux_comptes, categorie: "ruul", fermer: true };
  }
  if (FRAIS_RUUL.test(t)) return { cle: "frais_ruul", texte: TEXTES_SITUATIONS.frais_ruul, categorie: "ruul", fermer: true };
  if (PAS_FREELANCE.test(t)) return { cle: "pas_freelance", texte: TEXTES_SITUATIONS.pas_freelance, categorie: "ruul", fermer: true };
  if (BON_AVIS.test(t)) return { cle: "bon_avis", texte: TEXTES_SITUATIONS.bon_avis, categorie: "upwork", fermer: true };
  if (TEST_APP.test(t)) return { cle: "test_app", texte: TEXTES_SITUATIONS.test_app, categorie: "paie", fermer: true };
  if (NOM_COMPTE.test(t)) return { cle: "nom_compte", texte: TEXTES_SITUATIONS.nom_compte, categorie: "tiktok", fermer: true };
  void o;
  return null;
}

const MOIS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const JOURS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const enClair = (jour: string) => {
  const d = new Date(`${jour}T12:00:00Z`);
  return `${JOURS[d.getUTCDay()]}, ${MOIS[d.getUTCMonth()]} ${d.getUTCDate()}`;
};

/**
 * Règles 1 et 2 : « first day but nothing planned ». Reporté (sa cohorte commence plus tard) → sa nouvelle date et ce
 * qui manquait ; killé → rien ; sinon un vrai incident → « We're checking the situation » (et un Slack à Max).
 */
export function reponseRienPrevu(o: {
  aujourdhui: string;
  actif: boolean;
  cohorte: string | null;
  warmup: { pret: boolean | null; existe: boolean | null; abonnements: number | null } | null;
}): { texte: string | null; incident: boolean } {
  if (!o.actif) return { texte: null, incident: false };
  if (o.cohorte && o.cohorte > o.aujourdhui) {
    const manque: string[] = [];
    if (o.warmup?.existe === false) manque.push("we couldn't find your TikTok account");
    else if (o.warmup?.pret === false) manque.push("your warm-up wasn't good enough yet (follow accounts in your niche, complete your profile, watch and like videos every day)");
    const pourquoi = manque.length ? ` because ${manque.join(" and ")}` : "";
    return { texte: `Your first posting day was moved to ${enClair(o.cohorte)}${pourquoi}. Your posts will appear on your dashboard that day.`, incident: false };
  }
  return { texte: TEXTES_SITUATIONS.verification, incident: true };
}
