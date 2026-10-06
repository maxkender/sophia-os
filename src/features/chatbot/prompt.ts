export const QUESTION_MAX = 1_500;
export const CONTEXTE_MAX = 24_000;

/** HM, DM et COS partagent le périmètre manager du chatbot. */
function estManager(role: ChatRole): boolean {
  return (
    role === "hiring_manager" ||
    role === "directing_manager" ||
    role === "chief_of_staff"
  );
}

export type ChatRole =
  | "admin"
  | "poster"
  | "hiring_manager"
  | "directing_manager"
  | "chief_of_staff";
export type ChatLocale = string;
export type AudienceSnippet = "admin" | "hiring_manager" | "poster" | "all";

export const LANGUES_CHAT = [
  "fr",
  "en",
  "de",
  "it",
  "es",
  "pt",
  "cs",
  "nl",
  "el",
  "hu",
  "pl",
  "ro",
  "sv",
  "tr",
] as const;

const NOM_LANGUE_CHAT: Record<string, string> = {
  fr: "français",
  en: "English",
  de: "Deutsch",
  it: "italiano",
  es: "español",
  pt: "português",
  cs: "čeština",
  nl: "Nederlands",
  el: "ελληνικά",
  hu: "magyar",
  pl: "polski",
  ro: "română",
  sv: "svenska",
  tr: "Türkçe",
};

export const SALUTATION_CHAT: Record<string, string> = {
  fr: "Pose ta question. Je m'appuie sur les docs et sur ce qui se passe sur Sophia, dans ton périmètre.",
  en: "Ask your question. I use the docs and what's happening on Sophia, within your scope.",
  de: "Stell deine Frage. Ich nutze die Docs und das, was auf Sophia in deinem Bereich passiert.",
  it: "Fai la tua domanda. Uso i documenti e ciò che succede su Sophia, nel tuo perimetro.",
  es: "Haz tu pregunta. Uso los docs y lo que pasa en Sophia, en tu perímetro.",
  pt: "Faz a tua pergunta. Uso os docs e o que se passa na Sophia, no teu perímetro.",
  cs: "Polož otázku. Vycházím z dokumentů a z toho, co se děje na Sophii v tvém rozsahu.",
  nl: "Stel je vraag. Ik gebruik de docs en wat er op Sophia gebeurt, binnen jouw bereik.",
  el: "Κάνε την ερώτησή σου. Βασίζομαι στα docs και σε ό,τι γίνεται στη Sophia, στο δικό σου πεδίο.",
  hu: "Tedd fel a kérdésed. A dokumentumokra és arra támaszkodom, ami a Sophián a te körödben történik.",
  pl: "Zadaj pytanie. Korzystam z dokumentów i z tego, co dzieje się na Sophii w twoim zakresie.",
  ro: "Pune întrebarea. Folosesc documentele și ce se întâmplă pe Sophia, în perimetrul tău.",
  sv: "Ställ din fråga. Jag utgår från docs och det som händer på Sophia, inom ditt område.",
  tr: "Sorunu sor. Dokümanlara ve Sophia'da senin kapsamındaki duruma dayanıyorum.",
};

export const PLACEHOLDER_CHAT: Record<string, string> = {
  fr: "Ta question…",
  en: "Your question…",
  de: "Deine Frage…",
  it: "La tua domanda…",
  es: "Tu pregunta…",
  pt: "A tua pergunta…",
  cs: "Tvoje otázka…",
  nl: "Jouw vraag…",
  el: "Η ερώτησή σου…",
  hu: "A kérdésed…",
  pl: "Twoje pytanie…",
  ro: "Întrebarea ta…",
  sv: "Din fråga…",
  tr: "Sorun…",
};

export const ATTENTE_CHAT: Record<string, string> = {
  fr: "Je cherche…",
  en: "Looking…",
  de: "Ich suche…",
  it: "Cerco…",
  es: "Busco…",
  pt: "A procurar…",
  cs: "Hledám…",
  nl: "Ik zoek…",
  el: "Ψάχνω…",
  hu: "Keresek…",
  pl: "Szukam…",
  ro: "Caut…",
  sv: "Söker…",
  tr: "Bakıyorum…",
};

export interface DocumentContexte {
  titre: string;
  titre_en: string | null;
  contenu: string;
  contenu_en: string | null;
  audience: "manager" | "poster" | "all";
}

export interface SnippetContexte {
  titre: string;
  contenu: string;
  audience?: AudienceSnippet;
}

export interface TourChat {
  role: "user" | "assistant";
  content: string;
}

export interface CompteJour {
  date: string;
  prevus: number;
  publies: number;
}

export function htmlVersTexte(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/(div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Langue du bot = 1ʳᵉ langue du profil (cible de publication), sinon repli UI. */
export function langueDepuisProfil(
  langues: string[] | null | undefined,
  repli = "fr",
): string {
  const codes = (langues ?? []).map((l) => l.toLowerCase().slice(0, 2));
  const trouve = codes.find((l) => (LANGUES_CHAT as readonly string[]).includes(l));
  if (trouve) return trouve;
  const r = repli.toLowerCase().slice(0, 2);
  return (LANGUES_CHAT as readonly string[]).includes(r) ? r : "fr";
}

export function nomLangueChat(code: string): string {
  return NOM_LANGUE_CHAT[code] ?? code;
}

export function salutationChat(code: string): string {
  return SALUTATION_CHAT[code] ?? SALUTATION_CHAT.fr;
}

export function placeholderChat(code: string): string {
  return PLACEHOLDER_CHAT[code] ?? PLACEHOLDER_CHAT.fr;
}

export function attenteChat(code: string): string {
  return ATTENTE_CHAT[code] ?? ATTENTE_CHAT.fr;
}

export function audiencesDocuments(role: ChatRole): Array<DocumentContexte["audience"]> {
  if (role === "poster") return ["poster", "all"];
  if (estManager(role)) return ["manager", "all"];
  return ["manager", "poster", "all"];
}

/** Snippets admin : strictement le rôle + « tous ». L'admin ne voit pas les consignes poster. */
export function audiencesSnippets(role: ChatRole): AudienceSnippet[] {
  if (role === "poster") return ["poster", "all"];
  if (estManager(role)) return ["hiring_manager", "all"];
  return ["admin", "all"];
}

export function audiencesPour(role: ChatRole): Array<DocumentContexte["audience"]> {
  return audiencesDocuments(role);
}

function texteDocument(doc: DocumentContexte, locale: ChatLocale): { titre: string; texte: string } {
  const nonFr = locale !== "fr";
  const titre = nonFr && doc.titre_en?.trim() ? doc.titre_en : doc.titre;
  const brut = nonFr && doc.contenu_en?.trim() ? doc.contenu_en : doc.contenu;
  return { titre, texte: htmlVersTexte(brut) };
}

export function assemblerContexte(
  snippets: SnippetContexte[],
  docs: DocumentContexte[],
  role: ChatRole,
  locale: ChatLocale,
  plafond = CONTEXTE_MAX,
): string {
  const blocs: string[] = [];
  const snippetsOk = new Set(audiencesSnippets(role));
  const docsOk = new Set(audiencesDocuments(role));

  for (const s of snippets) {
    const aud = s.audience ?? "all";
    if (!snippetsOk.has(aud)) continue;
    const texte = htmlVersTexte(s.contenu);
    if (!texte) continue;
    blocs.push(`### ${s.titre.trim() || "Sans titre"}\n${texte}`);
  }

  for (const doc of docs) {
    if (!docsOk.has(doc.audience)) continue;
    const { titre, texte } = texteDocument(doc, locale);
    if (!texte) continue;
    blocs.push(`### ${titre}\n${texte}`);
  }

  const joint = blocs.join("\n\n");
  if (joint.length <= plafond) return joint;
  return `${joint.slice(0, Math.max(0, plafond))}\n\n[…contexte tronqué]`;
}

export function formaterJour(j: CompteJour): string {
  return `${j.date}: ${j.prevus} prévus, ${j.publies} publiés`;
}

export function formaterSnapshotAdmin(s: {
  aujourdHui: string;
  hier: string;
  postsHier: CompteJour;
  postsAuj: CompteJour;
  passagesHier?: CompteJour;
  passagesAuj?: CompteJour;
  postersActifs: number;
  postersTotal: number;
  hiringManagers: number;
  comptesActifs: number;
  parLangueHier: Record<string, number>;
}): string {
  const langues = Object.entries(s.parLangueHier)
    .sort((a, b) => b[1] - a[1])
    .map(([l, n]) => `${l} ${n}`)
    .join(", ");
  const lignes = [
    `Fuseau métier: Europe/Paris. Aujourd'hui ${s.aujourdHui}, hier ${s.hier}.`,
    `Posts (hors tests) hier: ${formaterJour(s.postsHier)}.`,
    `Posts (hors tests) aujourd'hui: ${formaterJour(s.postsAuj)}.`,
  ];
  if (s.passagesHier) lignes.push(`Passages v-next hier: ${formaterJour(s.passagesHier)}.`);
  if (s.passagesAuj) lignes.push(`Passages v-next aujourd'hui: ${formaterJour(s.passagesAuj)}.`);
  lignes.push(
    `Créateurs (rôle poster): ${s.postersActifs} actifs / ${s.postersTotal}.`,
    `Hiring managers: ${s.hiringManagers}. Comptes publication actifs: ${s.comptesActifs}.`,
  );
  if (langues) lignes.push(`Posts hier par langue du compte: ${langues}.`);
  return lignes.join("\n");
}

export function formaterSnapshotHm(s: {
  aujourdHui: string;
  hier: string;
  createurs: Array<{ nom: string; langue: string; handle: string | null; actifs: boolean }>;
  postsHier: CompteJour;
  postsAuj: CompteJour;
}): string {
  const liste =
    s.createurs.length === 0
      ? "Aucun créateur."
      : s.createurs
          .map((c) => `- ${c.nom} (${c.langue}${c.handle ? `, @${c.handle.replace(/^@/, "")}` : ""}${c.actifs ? "" : ", inactif"})`)
          .join("\n");
  return [
    `Fuseau métier: Europe/Paris. Aujourd'hui ${s.aujourdHui}, hier ${s.hier}.`,
    `TES créateurs seulement (${s.createurs.length}):`,
    liste,
    `Leurs posts hier: ${formaterJour(s.postsHier)}.`,
    `Leurs posts aujourd'hui: ${formaterJour(s.postsAuj)}.`,
    `Tu ne vois pas les autres équipes, ni les comptes sources.`,
  ].join("\n");
}

export function formaterSnapshotPoster(s: {
  aujourdHui: string;
  demain: string;
  nom: string;
  langue: string;
  handle: string | null;
  persona: string | null;
  postsParJour: number | null;
  warmup: "attente" | "en_cours" | "termine" | "pas_de_compte";
  postsAuj: CompteJour;
  postsDemain: CompteJour;
}): string {
  return [
    `Fuseau métier: Europe/Paris. Aujourd'hui ${s.aujourdHui}, demain ${s.demain}.`,
    `Toi: ${s.nom}. Langue de publication: ${s.langue}.`,
    s.handle ? `Compte TikTok: @${s.handle.replace(/^@/, "")}.` : `Compte TikTok: pas encore renseigné.`,
    s.persona ? `Persona: ${s.persona}.` : "",
    s.postsParJour != null ? `Quota: ${s.postsParJour} post(s)/jour.` : "",
    `Warmup: ${s.warmup}.`,
    `Tes posts aujourd'hui: ${formaterJour(s.postsAuj)}.`,
    `Tes posts demain: ${formaterJour(s.postsDemain)}.`,
    `Tu ne vois que TON calendrier. Pas les autres créateurs, pas les sources, pas les totaux plateforme.`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function cadreRole(role: ChatRole): string {
  if (role === "poster") {
    return `Périmètre CRÉATEUR: calendrier, posts assignés, identité TikTok, guides créateur.
Interdit: totaux plateforme, autres créateurs, comptes sources, outils admin, données HM.`;
  }
  if (estManager(role)) {
    return `Périmètre MANAGER${role === "directing_manager" ? " (DM)" : role === "chief_of_staff" ? " (COS)" : ""}: tes créateurs (ceux que tu as recrutés), leur calendrier, guides manager.
Interdit: autres équipes, comptes sources, pilotage moteur, chiffres globaux plateforme.`;
  }
  return `Périmètre ADMIN: toute la plateforme (posts, créateurs, HM, comptes, docs).
Tu peux donner des chiffres (ex. posts d'hier) s'ils sont dans le snapshot live.`;
}
