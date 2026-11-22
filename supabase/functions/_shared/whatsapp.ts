/**
 * WhatsApp (API Cloud de Meta) — la partie sans réseau ni base (testée dans whatsapp_test.ts) : numéros, signature
 * du webhook, lecture des événements, STOP, heures d'envoi, garde-fous, coût estimé.
 * Les secrets (WHATSAPP_*) ne passent jamais par ici sauf l'APP_SECRET pour la signature, jamais journalisé.
 */

export const GRAPH = "https://graph.facebook.com/v21.0";

/** Un numéro au format international E.164 (+ et 7 à 15 chiffres), ou null. Les espaces, tirets, points sautent ; 00 → +. */
export function e164(brut: string | null | undefined): string | null {
  if (!brut) return null;
  let s = String(brut).trim().replace(/[\s().-]/g, "");
  if (s.startsWith("00")) s = `+${s.slice(2)}`;
  if (!s.startsWith("+") && /^[1-9]\d{6,14}$/.test(s)) s = `+${s}`; // Meta envoie « 33612345678 » sans le +
  return /^\+[1-9]\d{6,14}$/.test(s) ? s : null;
}

/** Signature X-Hub-Signature-256 (« sha256=<hex> ») du corps brut avec l'App Secret, comparée en temps constant. */
export async function signatureValide(corps: string, entete: string | null, secret: string | undefined): Promise<boolean> {
  if (!secret || !entete || !entete.startsWith("sha256=")) return false;
  const cle = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", cle, new TextEncoder().encode(corps)));
  const attendu = Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
  const recu = entete.slice(7).toLowerCase();
  if (recu.length !== attendu.length) return false;
  let diff = 0;
  for (let i = 0; i < attendu.length; i++) diff |= attendu.charCodeAt(i) ^ recu.charCodeAt(i);
  return diff === 0;
}

export interface MessageRecu {
  wamid: string;
  de: string;
  type: string;
  texte: string | null;
  media: { id: string; mime: string | null; type: string } | null;
  contexte: string | null;
  at: string;
}
export interface StatutRecu {
  wamid: string;
  statut: "envoye" | "livre" | "lu" | "echec";
  at: string;
  erreur: string | null;
  categorie: string | null;
}

const STATUTS: Record<string, StatutRecu["statut"]> = { sent: "envoye", delivered: "livre", read: "lu", failed: "echec" };
const dateDe = (ts: unknown) => (typeof ts === "string" && /^\d+$/.test(ts) ? new Date(Number(ts) * 1000).toISOString() : new Date().toISOString());

/** Les messages reçus et les statuts d'un POST du webhook (objet whatsapp_business_account). */
export function lireWebhook(payload: unknown): { messages: MessageRecu[]; statuts: StatutRecu[] } {
  const messages: MessageRecu[] = [];
  const statuts: StatutRecu[] = [];
  const p = payload as { object?: string; entry?: { changes?: { field?: string; value?: Record<string, unknown> }[] }[] };
  if (p?.object !== "whatsapp_business_account") return { messages, statuts };
  for (const entree of p.entry ?? []) {
    for (const ch of entree.changes ?? []) {
      const v = ch.value ?? {};
      for (const m of (v.messages ?? []) as Record<string, unknown>[]) {
        const type = String(m.type ?? "");
        const de = e164(String(m.from ?? ""));
        if (!m.id || !de) continue;
        const bloc = (m[type] ?? {}) as Record<string, unknown>;
        let texte: string | null = null;
        if (type === "text") texte = String((m.text as { body?: string })?.body ?? "");
        else if (type === "button") texte = String((m.button as { text?: string })?.text ?? "");
        else if (type === "interactive") {
          const i = m.interactive as { button_reply?: { title?: string }; list_reply?: { title?: string } };
          texte = i?.button_reply?.title ?? i?.list_reply?.title ?? null;
        } else if (typeof bloc.caption === "string") texte = bloc.caption;
        const media = ["image", "audio", "video", "document", "sticker", "voice"].includes(type) && typeof bloc.id === "string"
          ? { id: bloc.id, mime: typeof bloc.mime_type === "string" ? bloc.mime_type : null, type }
          : null;
        messages.push({
          wamid: String(m.id), de, type, texte: texte?.trim() || null, media,
          contexte: (m.context as { id?: string } | undefined)?.id ?? null, at: dateDe(m.timestamp),
        });
      }
      for (const s of (v.statuses ?? []) as Record<string, unknown>[]) {
        const statut = STATUTS[String(s.status ?? "")];
        if (!s.id || !statut) continue;
        const err = (s.errors as { code?: number; title?: string; message?: string }[] | undefined)?.[0];
        statuts.push({
          wamid: String(s.id), statut, at: dateDe(s.timestamp),
          erreur: err ? `${err.code ?? ""} ${err.title ?? err.message ?? ""}`.trim() : null,
          categorie: (s.pricing as { category?: string } | undefined)?.category ?? null,
        });
      }
    }
  }
  return { messages, statuts };
}

/**
 * STOP : le message entier est une demande d'arrêt (« STOP », « stop working », « I want to end », dans les langues
 * de nos posteurs). Jamais un « stop » au milieu d'une phrase sur autre chose (« the sound stops », « stop motion »).
 */
const STOP_SEUL = new RegExp(
  "^(?:please\\s+)?(?:" + [
    "stop", "stop working", "stop it", "stop please", "stop all", "unsubscribe", "quit", "i quit", "end", "cancel",
    "i want to (?:end|stop|quit|leave)(?: (?:working|this|the collaboration|the job|everything))?",
    "i (?:don'?t|do not) want to (?:continue|work anymore|do this anymore)",
    "arr[êe]t(?:e|er)?", "je veux arr[êe]ter", "stopp(?:en)?", "aufh[öo]ren", "ich (?:will|möchte) aufh[öo]ren",
    "basta", "voglio smettere", "parar?", "quiero (?:parar|dejar(?:lo)?)", "quero parar", "dur", "b[ıi]rak[ıi]yorum",
    "durdur", "koniec", "chc[ęe] (?:zako[ńn]czy[ćc]|przesta[ćc])", "prestani", "stani", "hoću prestati", "le[áa]ll[ií]tom",
    "abbahagyom", "opresc", "vreau s[ăa] (?:opresc|renun[țt])", "σταμάτα", "θέλω να σταματήσω", "стоп", "хватит",
    "хочу (?:закончить|остановиться)", "ukončit", "chci skon[čc]it", "zastav", "lopeta", "sluta", "stopp", "stop maar",
    "ik wil stoppen",
  ].join("|") + ")[\\s.!🛑✋❌]*$",
  "iu",
);
export function estStopWhatsApp(texte: string | null | undefined): boolean {
  if (!texte) return false;
  const t = texte.trim().replace(/[’`]/g, "'");
  return t.length <= 80 && STOP_SEUL.test(t);
}

/** La fenêtre de 24 h de Meta : on peut répondre en texte libre si le dernier message reçu a moins de 24 h. */
export function fenetreOuverte(dernierRecu: string | null | undefined, maintenant = new Date()): boolean {
  if (!dernierRecu) return false;
  return maintenant.getTime() - new Date(dernierRecu).getTime() < 24 * 3600_000 - 60_000;
}

/** Le fuseau du pays (ISO 2) ; Europe/Paris par défaut. */
const FUSEAUX: Record<string, string> = {
  FR: "Europe/Paris", BE: "Europe/Brussels", LU: "Europe/Luxembourg", CH: "Europe/Zurich", DE: "Europe/Berlin", AT: "Europe/Vienna",
  IT: "Europe/Rome", ES: "Europe/Madrid", PT: "Europe/Lisbon", NL: "Europe/Amsterdam", PL: "Europe/Warsaw", CZ: "Europe/Prague",
  SK: "Europe/Bratislava", HU: "Europe/Budapest", RO: "Europe/Bucharest", MD: "Europe/Chisinau", BG: "Europe/Sofia", GR: "Europe/Athens",
  CY: "Asia/Nicosia", HR: "Europe/Zagreb", SI: "Europe/Ljubljana", RS: "Europe/Belgrade", ME: "Europe/Podgorica", BA: "Europe/Sarajevo",
  MK: "Europe/Skopje", AL: "Europe/Tirane", XK: "Europe/Belgrade", TR: "Europe/Istanbul", GB: "Europe/London", IE: "Europe/Dublin",
  SE: "Europe/Stockholm", NO: "Europe/Oslo", DK: "Europe/Copenhagen", FI: "Europe/Helsinki", EE: "Europe/Tallinn", LV: "Europe/Riga",
  LT: "Europe/Vilnius", UA: "Europe/Kyiv", IL: "Asia/Jerusalem", MA: "Africa/Casablanca", TN: "Africa/Tunis", BR: "America/Sao_Paulo",
  MX: "America/Mexico_City", AR: "America/Argentina/Buenos_Aires", CO: "America/Bogota", US: "America/New_York", JP: "Asia/Tokyo",
};
export const fuseauDuPays = (pays: string | null | undefined) => FUSEAUX[String(pays ?? "").toUpperCase()] ?? "Europe/Paris";

/** L'heure (0-23) dans le fuseau du pays. */
export function heureLocale(pays: string | null | undefined, maintenant = new Date()): number {
  const h = new Intl.DateTimeFormat("en-GB", { timeZone: fuseauDuPays(pays), hour: "2-digit", hour12: false }).format(maintenant);
  return Number(h) % 24;
}

/** Entre 9 h et 21 h, heure du pays du posteur. */
export const heureOk = (pays: string | null | undefined, maintenant = new Date()) => {
  const h = heureLocale(pays, maintenant);
  return h >= 9 && h < 21;
};

/** Les garde-fous d'une relance automatique : la raison du refus, ou null si l'envoi est permis. */
export function refusRelance(o: {
  optin: boolean; optout: boolean; envoisJour: number; envoisSemaine: number; heureOk: boolean;
  absent: boolean; arrete: boolean; panne: boolean; modeAutorise: boolean;
}): string | null {
  if (!o.modeAutorise) return "mode test : numéro non autorisé";
  if (!o.optin || o.optout) return "pas d'accord WhatsApp";
  if (o.arrete) return "posteur arrêté ou killé";
  if (o.absent) return "absence déclarée";
  if (o.panne) return "jour de panne de notre côté";
  if (o.envoisJour >= 1) return "déjà 1 message WhatsApp aujourd'hui";
  if (o.envoisSemaine >= 4) return "déjà 4 messages WhatsApp cette semaine";
  if (!o.heureOk) return "hors 9 h – 21 h (heure du posteur)";
  return null;
}

/**
 * Le coût estimé d'un message modèle Utility (USD), barème Meta par pays (approximatif ; tarif « reste du monde »
 * sinon). Une réponse dans la fenêtre de 24 h (service) ne coûte rien.
 */
const UTILITY_USD: Record<string, number> = {
  FR: 0.03, DE: 0.055, IT: 0.03, ES: 0.02, PT: 0.02, NL: 0.05, BE: 0.03, GB: 0.022, IE: 0.03, PL: 0.022, RO: 0.022, HU: 0.022,
  CZ: 0.022, SK: 0.022, BG: 0.022, GR: 0.022, HR: 0.022, SI: 0.022, RS: 0.022, ME: 0.022, BA: 0.022, TR: 0.0053, IL: 0.0053,
  BR: 0.008, MX: 0.01, AR: 0.026, CO: 0.0002, US: 0.004,
};
export function coutEstime(pays: string | null | undefined, type: "modele" | "texte"): number {
  if (type === "texte") return 0;
  return UTILITY_USD[String(pays ?? "").toUpperCase()] ?? 0.022;
}

/** Le pays d'un numéro (indicatif), pour les candidats sans fiche. */
const INDICATIFS: [string, string][] = [
  ["+33", "FR"], ["+32", "BE"], ["+352", "LU"], ["+41", "CH"], ["+49", "DE"], ["+43", "AT"], ["+39", "IT"], ["+34", "ES"],
  ["+351", "PT"], ["+31", "NL"], ["+48", "PL"], ["+420", "CZ"], ["+421", "SK"], ["+36", "HU"], ["+40", "RO"], ["+373", "MD"],
  ["+359", "BG"], ["+30", "GR"], ["+357", "CY"], ["+385", "HR"], ["+386", "SI"], ["+381", "RS"], ["+382", "ME"], ["+387", "BA"],
  ["+389", "MK"], ["+90", "TR"], ["+44", "GB"], ["+353", "IE"], ["+46", "SE"], ["+47", "NO"], ["+45", "DK"], ["+358", "FI"],
  ["+372", "EE"], ["+371", "LV"], ["+370", "LT"], ["+380", "UA"], ["+972", "IL"], ["+212", "MA"], ["+55", "BR"], ["+52", "MX"],
  ["+54", "AR"], ["+57", "CO"], ["+1", "US"], ["+81", "JP"],
];
export function paysDuNumero(numero: string | null | undefined): string | null {
  const n = e164(numero);
  if (!n) return null;
  const trouve = INDICATIFS.filter(([p]) => n.startsWith(p)).sort((a, b) => b[0].length - a[0].length)[0];
  return trouve?.[1] ?? null;
}

/** Les modèles de l'OS : nom chez Meta et nombre de variables du corps (prénom, puis lien…). */
export const MODELES = {
  contract_to_sign: 2,
  account_ready: 2,
  warmup_reminder: 2,
  no_posts_this_week: 2,
  ruul_setup: 2,
} as const;
export type NomModele = keyof typeof MODELES;

/** Le texte anglais du modèle ruul_setup (soumis par l'OS ; les 4 autres ont été soumis par Max). */
export const CORPS_RUUL_SETUP =
  "Hi {{1}}, to get paid, finish your Ruul setup (ID + bank) here: {{2}}. Ruul technical issue? Contact Ruul support.";

/** Le corps d'un message modèle pour l'API (variables du corps, dans l'ordre). */
export function corpsModele(to: string, nom: string, langue: string, variables: string[]) {
  return {
    messaging_product: "whatsapp", to: to.replace(/^\+/, ""), type: "template",
    template: {
      name: nom, language: { code: langue },
      ...(variables.length ? { components: [{ type: "body", parameters: variables.map((v) => ({ type: "text", text: v.slice(0, 900) })) }] } : {}),
    },
  };
}

/** Le corps d'un message texte libre (seulement dans la fenêtre de 24 h). */
export function corpsTexte(to: string, texte: string) {
  return { messaging_product: "whatsapp", to: to.replace(/^\+/, ""), type: "text", text: { body: texte.slice(0, 4000), preview_url: true } };
}

/** Le mode et les numéros autorisés (réglage whatsapp_mode). En test, seuls les numéros autorisés reçoivent. */
export function numeroAutorise(reglage: unknown, numero: string): boolean {
  const r = (reglage ?? {}) as { mode?: string; numeros_autorises?: string[] };
  if (r.mode === "live") return true;
  return (r.numeros_autorises ?? []).map((x) => e164(x)).includes(e164(numero));
}
export const modeLive = (reglage: unknown) => (reglage as { mode?: string } | null)?.mode === "live";

/** La confirmation de fin envoyée après un STOP (traduite ensuite dans la langue du posteur). */
export function texteFinWhatsApp(resteAPayer: boolean): string {
  return "Your collaboration with Vik Studios has ended, thank you!" +
    (resteAPayer ? " Your last week will be paid." : "") +
    " If you only wanted to stop WhatsApp messages, reply here within 24h.";
}
