/**
 * 23/11 (Max) : les modèles WhatsApp v2, développés comme les emails de l'OS (étapes, Slack, Ruul, niche du warm-up,
 * vidéo). Textes validés par Max ; soumis à Meta par l'action soumettre_modeles_v2. Ils ne remplacent les anciens
 * dans les envois qu'avec l'OK de Max.
 */

export const DASHBOARD_V2 = "https://sophia-marketing-orga.vercel.app";
export const SLACK_V2 = "https://join.slack.com/t/sophia-system/shared_invite/zt-4hweboq01-NKLzgvGLbJMHBtoB7N0iBQ";
const VIDEO_EXEMPLE = "https://drive.google.com/file/d/vikstudios-guide/view";

export interface BoutonUrl {
  texte: string;
  url: string;
}

export interface ModeleV2 {
  nom: string;
  /** Ce que remplit l'OS, dans l'ordre des {{n}}. */
  variables: string[];
  corps: string;
  exemples: string[];
  boutons: BoutonUrl[];
}

const DASH: BoutonUrl = { texte: "Open my dashboard", url: DASHBOARD_V2 };
const SLACK: BoutonUrl = { texte: "Join Slack", url: SLACK_V2 };

export const MODELES_V2: ModeleV2[] = [
  {
    nom: "welcome_start",
    variables: ["prénom", "lundi de début", "échéance", "handle TikTok", "lien vidéo"],
    corps: "Hi {{1}}, welcome to Vik Studios! 🎉\n\n" +
      "Your job: post 2 slideshows a day on TikTok. Everything you post is ready for you on your dashboard. You start on {{2}}.\n\n" +
      "Before {{3}}:\n" +
      "1. Log in to your dashboard (button below) and set your password.\n" +
      "2. Create your TikTok account with this exact name: @{{4}}. The name, bio and photo are on your dashboard.\n" +
      "3. Click \"Start warmup\", follow at least 5 accounts and use TikTok normally for a few minutes a day.\n" +
      "4. Join our Slack (button below) with your personal email and your full name. That's where you get news, tips and help.\n\n" +
      "Watch our short video guide: {{5}}\n\n" +
      "Payment: every Monday, through Ruul, for the week you posted. Finish your Ruul setup (ID + bank) so we can pay you.\n\n" +
      "Any question? Just reply to this message.",
    exemples: ["Ana", "Monday, December 1", "Sunday, November 30 at midnight (Paris time)", "ana.study", VIDEO_EXEMPLE],
    boutons: [DASH, SLACK],
  },
  {
    nom: "warmup_start",
    variables: ["prénom", "lundi de début", "niche", "échéance"],
    corps: "Hi {{1}}, you start posting on {{2}}, but your TikTok warm-up isn't started yet.\n\n" +
      "Why it matters: a new account that posts straight away gets almost no views. The warm-up shows TikTok you're a real user.\n\n" +
      "What to do (5 min a day until Monday):\n" +
      "1. Open your dashboard and click \"Start warmup\".\n" +
      "2. Follow at least 5 accounts about {{3}}: that's what you'll post about.\n" +
      "3. Scroll, like and watch videos like a normal user. Don't post anything yet.\n\n" +
      "Do it before {{4}}, or your start moves one week later.\n\n" +
      "Stuck? Reply here or ask in Slack.",
    exemples: ["Ana", "Monday, December 1", "studying and self-improvement", "Sunday, November 30 at midnight (Paris time)"],
    boutons: [DASH, SLACK],
  },
  {
    nom: "ruul_payment_setup",
    variables: ["prénom"],
    corps: "Hi {{1}}, to get paid you need a Ruul account. It takes about 10 minutes:\n" +
      "1. Tap the button below to open your Ruul setup.\n" +
      "2. Create your account using your real name, as on your ID.\n" +
      "3. Verify your identity (ID + selfie).\n" +
      "4. Add your bank account.\n\n" +
      "You're paid every Monday for the week you posted (Monday to Sunday). Until Ruul is ready, your payment waits, but you keep earning.\n\n" +
      "Ruul technical issue? Contact Ruul support in their app. Other question? Reply here.",
    exemples: ["Ana"],
    boutons: [{ texte: "Finish my Ruul setup", url: `${DASHBOARD_V2}/ruul` }],
  },
  {
    nom: "no_posts_week",
    variables: ["prénom"],
    corps: "Hi {{1}}, we haven't seen any posts from you this week.\n\n" +
      "Your 2 slideshows a day are ready on your dashboard: open it, download the slides, post them on TikTok with the caption shown, then paste the link of each post on your dashboard.\n\n" +
      "You're only paid for the posts you publish. If something is blocking you (TikTok issue, no time, account problem), reply here and we'll help.",
    exemples: ["Ana"],
    boutons: [DASH, SLACK],
  },
  {
    nom: "start_posting_today",
    variables: ["prénom", "lien vidéo"],
    corps: "Hi {{1}}, great news: your account is ready and you start posting today! 🚀\n\n" +
      "Every day, 2 slideshows are waiting for you on your dashboard:\n" +
      "1. Open your dashboard (button below).\n" +
      "2. Download the slides of each post.\n" +
      "3. Post them on TikTok as a photo carousel, with the caption and music shown.\n" +
      "4. Paste the link of each TikTok post on your dashboard.\n\n" +
      "Watch the short video to see how it works: {{2}}\n\n" +
      "You're paid every Monday for the posts you published the week before, so post every day.\n\n" +
      "Any question? Reply here or ask in Slack.",
    exemples: ["Ana", VIDEO_EXEMPLE],
    boutons: [DASH, SLACK],
  },
];

/** Les règles de Meta (et les nôtres) qu'un modèle doit respecter avant d'être soumis. */
export function problemesModele(m: ModeleV2): string[] {
  const p: string[] = [];
  if (!/^[a-z0-9_]{1,512}$/.test(m.nom)) p.push("nom invalide");
  if (m.corps.length > 1024) p.push(`corps trop long (${m.corps.length})`);
  const nums = [...m.corps.matchAll(/\{\{(\d+)\}\}/g)].map((x) => Number(x[1]));
  const attendus = m.exemples.map((_, i) => i + 1);
  if ([...new Set(nums)].sort((a, b) => a - b).join() !== attendus.join()) p.push("variables pas dans l'ordre ou exemples manquants");
  if (m.variables.length !== m.exemples.length) p.push("variables et exemples ne correspondent pas");
  if (/^\s*\{\{/.test(m.corps) || /\{\{\d+\}\}\s*$/.test(m.corps)) p.push("commence ou finit par une variable");
  if (/\{\{\d+\}\}\s*\{\{\d+\}\}/.test(m.corps)) p.push("deux variables collées");
  if (/\b(bot|AI|automat\w*)\b/i.test(m.corps)) p.push("mot interdit (bot / AI / automatique)");
  if (m.boutons.length > 2) p.push("plus de 2 boutons lien");
  for (const b of m.boutons) {
    if (b.texte.length > 25) p.push(`bouton trop long : ${b.texte}`);
    if (!/^https:\/\//.test(b.url)) p.push(`lien invalide : ${b.url}`);
  }
  return p;
}

/** Le corps de la requête POST {waba}/message_templates. */
export function requeteModele(m: ModeleV2, langue = "en") {
  return {
    name: m.nom,
    language: langue,
    category: "UTILITY",
    components: [
      { type: "BODY", text: m.corps, ...(m.exemples.length ? { example: { body_text: [m.exemples] } } : {}) },
      ...(m.boutons.length ? [{ type: "BUTTONS", buttons: m.boutons.map((b) => ({ type: "URL", text: b.texte, url: b.url })) }] : []),
    ],
  };
}
