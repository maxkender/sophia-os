/**
 * 15/11 (Max) : le questionnaire « top posters ». Une seule définition, lue par le formulaire public et par
 * la page admin (tableau, CSV). Textes en anglais (posteurs). Jamais « bot » ni « AI ».
 */

export type TypeQuestion = "choix" | "multi" | "texte" | "pays" | "capture";

export interface Question {
  id: string;
  /** Numéro affiché (1, 2, 12a…). */
  n: string;
  texte: string;
  type: TypeQuestion;
  options?: readonly string[];
  optionnel?: boolean;
  /** Un champ texte en plus (ex. la ville après le pays). */
  detail?: { id: string; libelle: string };
  /** Question posée seulement si la réponse à `question` est l'une de `valeurs`. */
  si?: { question: string; valeurs: readonly string[] };
  /** Mini-guide pour les captures. */
  guide?: string;
}

export interface Section {
  id: string;
  titre: string;
  questions: readonly Question[];
}

export const SLUG_TOP_POSTERS = "top-posters";

export const INTRO =
  "Thanks for taking 5 minutes to help us! We'd like to understand what you do on your account, so we can help everyone do as well. Your answers stay private. Questions marked (optional) can be skipped.";

export const MERCI = "Thank you!";

export const SECTIONS: readonly Section[] = [
  {
    id: "vous",
    titre: "About you",
    questions: [
      { id: "genre", n: "1", texte: "Gender", type: "choix", options: ["Woman", "Man", "Prefer not to say"], optionnel: true },
      { id: "age", n: "2", texte: "Age", type: "choix", options: ["under 20", "20–25", "26–30", "31–40", "over 40"], optionnel: true },
      { id: "pays", n: "3", texte: "Country you live in", type: "pays", detail: { id: "ville", libelle: "City" } },
      { id: "niveau_langue", n: "4", texte: "Level in the language of your account", type: "choix", options: ["Native", "Fluent", "Basic", "Not at all"] },
    ],
  },
  {
    id: "telephone",
    titre: "Your phone and connection",
    questions: [
      { id: "telephone", n: "5", texte: "Phone model", type: "texte" },
      { id: "usage_telephone", n: "6", texte: "This phone is used for", type: "choix", options: ["Only this account", "Also my personal phone", "Several TikTok accounts"] },
      { id: "sim", n: "7", texte: "SIM card country", type: "pays", options: ["No SIM"] },
      { id: "internet", n: "8", texte: "Internet on TikTok", type: "choix", options: ["Wi-Fi", "Mobile data", "Both"] },
      { id: "vpn", n: "9", texte: "VPN on TikTok", type: "choix", options: ["Never", "Sometimes", "Always"] },
      { id: "vpn_app", n: "9", texte: "Which VPN app?", type: "texte", si: { question: "vpn", valeurs: ["Sometimes", "Always"] } },
      { id: "vpn_pays", n: "9", texte: "Which VPN country?", type: "pays", si: { question: "vpn", valeurs: ["Sometimes", "Always"] } },
      { id: "region", n: "10", texte: "Phone region setting", type: "pays", detail: { id: "langue_telephone", libelle: "Phone language" } },
      { id: "creation", n: "11", texte: "Account created with", type: "choix", options: ["New email", "Phone number", "Google or Apple login"] },
    ],
  },
  {
    id: "warmup",
    titre: "Your warm-up (before your first post)",
    questions: [
      { id: "warmup_jours", n: "12a", texte: "How many days did your warm-up last?", type: "choix", options: ["1–2", "3–4", "5–7", "More than 7"] },
      { id: "warmup_minutes", n: "12b", texte: "Minutes of scrolling per day", type: "choix", options: ["Less than 15", "15–30", "30–60", "More than 60"] },
      {
        id: "warmup_videos", n: "12c", texte: "What did you watch?", type: "choix",
        options: ["Mostly videos in the account's language", "Mixed", "Mostly my own language", "Didn't pay attention"],
      },
      { id: "warmup_recherche", n: "12d", texte: "Did you search for topics or hashtags?", type: "choix", options: ["No", "Yes"] },
      { id: "warmup_recherche_quoi", n: "12d", texte: "Which ones?", type: "texte", si: { question: "warmup_recherche", valeurs: ["Yes"] } },
      {
        id: "warmup_actions", n: "12e", texte: "What did you do?", type: "multi",
        options: ["Like", "Comment", "Follow", "Share", "Save", "Watch videos to the end", "Watch LIVEs"],
      },
      { id: "warmup_suivis", n: "12f", texte: "How many accounts did you follow?", type: "choix", options: ["5", "6–20", "21–50", "More than 50"] },
      { id: "warmup_suivis_type", n: "12g", texte: "What kind of accounts did you follow?", type: "texte" },
      { id: "warmup_profil", n: "12h", texte: "Before your first post, did you set", type: "multi", options: ["Picture", "Bio", "Name", "None"] },
      { id: "warmup_poste", n: "12i", texte: "Did you post anything during the warm-up?", type: "choix", options: ["No", "Yes"] },
      { id: "warmup_poste_quoi", n: "12i", texte: "What did you post?", type: "texte", si: { question: "warmup_poste", valeurs: ["Yes"] } },
      {
        id: "warmup_fyp", n: "12j", texte: "When your first posts went live, your \"For You\" page was", type: "choix",
        options: ["Mostly the account's topic", "Mixed", "Random", "Don't know"],
      },
    ],
  },
  {
    id: "habitudes",
    titre: "Your habits",
    questions: [
      { id: "temps_jour", n: "13", texte: "Time on the account per day besides posting", type: "choix", options: ["Less than 15 min", "15–30 min", "30–60 min", "More than 1 h"] },
      { id: "heures", n: "14", texte: "When do you post (local time)?", type: "texte" },
      { id: "rythme", n: "14", texte: "Your two posts", type: "choix", options: ["Both at once", "Spread out"] },
      { id: "changements", n: "15", texte: "Before posting you change", type: "multi", options: ["Music", "Caption", "Hashtags", "Cover", "Nothing"] },
      { id: "musique", n: "15", texte: "How do you choose the music?", type: "texte" },
      { id: "commentaires", n: "16", texte: "Do you reply to comments?", type: "choix", options: ["Never", "Sometimes", "Often"] },
      { id: "astuces", n: "17", texte: "Anything else you think helps your views?", type: "texte", optionnel: true },
    ],
  },
  {
    id: "captures",
    titre: "Screenshots",
    questions: [
      {
        id: "capture_temps", n: "18", texte: "TikTok screen time, last 7 days", type: "capture",
        guide: "TikTok → Profile → ☰ (top right) → Settings and privacy → Time and well-being → Screen time. Take a screenshot of the last 7 days.",
      },
      {
        id: "capture_audience", n: "19", texte: "TikTok Analytics → Viewers (top countries, gender, age)", type: "capture",
        guide: "TikTok → Profile → ☰ → Creator tools → Analytics → Viewers. Take a screenshot showing top countries, gender and age.",
      },
      {
        id: "capture_abonnements", n: "20", texte: "Your \"Following\" list", type: "capture",
        guide: "TikTok → Profile → tap \"Following\". Take one or two screenshots of the list.",
      },
    ],
  },
];

export type Reponses = Record<string, string | string[] | undefined>;

/** La question est-elle posée, vu les réponses déjà données ? */
export function visible(q: Question, r: Reponses): boolean {
  if (!q.si) return true;
  const v = r[q.si.question];
  return typeof v === "string" && q.si.valeurs.includes(v);
}

/** Les questions obligatoires (visibles) d'une section qui n'ont pas de réponse. */
export function manquantes(s: Section, r: Reponses): Question[] {
  return s.questions.filter((q) => visible(q, r) && !q.optionnel && q.type !== "capture" && !aReponse(r[q.id]));
}

export function aReponse(v: Reponses[string]): boolean {
  return Array.isArray(v) ? v.length > 0 : typeof v === "string" && v.trim().length > 0;
}

/** Toutes les colonnes (réponses et détails), dans l'ordre : pour le tableau admin et le CSV. */
export function colonnes(): { id: string; libelle: string }[] {
  const out: { id: string; libelle: string }[] = [];
  for (const s of SECTIONS) {
    for (const q of s.questions) {
      out.push({ id: q.id, libelle: `${q.n}. ${q.texte}` });
      if (q.detail) out.push({ id: q.detail.id, libelle: `${q.n}. ${q.detail.libelle}` });
    }
  }
  return out;
}

/** Les codes pays ISO 3166-1, affichés en anglais. */
const CODES = (
  "AF AL DZ AD AO AG AR AM AU AT AZ BS BH BD BB BY BE BZ BJ BT BO BA BW BR BN BG BF BI CV KH CM CA CF TD CL CN CO KM CG CD CR CI HR CU CY CZ " +
  "DK DJ DM DO EC EG SV GQ ER EE SZ ET FJ FI FR GA GM GE DE GH GR GD GT GN GW GY HT HN HK HU IS IN ID IR IQ IE IL IT JM JP JO KZ KE KI XK KW KG " +
  "LA LV LB LS LR LY LI LT LU MO MG MW MY MV ML MT MH MR MU MX FM MD MC MN ME MA MZ MM NA NR NP NL NZ NI NE NG KP MK NO OM PK PW PS PA PG PY PE PH " +
  "PL PT PR QA RO RU RW KN LC VC WS SM ST SA SN RS SC SL SG SK SI SB SO ZA KR SS ES LK SD SR SE CH SY TW TJ TZ TH TL TG TO TT TN TR TM TV UG UA AE " +
  "GB US UY UZ VU VA VE VN YE ZM ZW"
).split(" ");

let paysCache: string[] | null = null;
export function listePays(): string[] {
  if (paysCache) return paysCache;
  let noms: string[];
  try {
    const d = new Intl.DisplayNames(["en"], { type: "region" });
    noms = CODES.map((c) => d.of(c) ?? c);
  } catch {
    noms = CODES;
  }
  paysCache = [...new Set(noms)].sort((a, b) => a.localeCompare(b, "en"));
  return paysCache;
}
