/**
 * Espace support (0671) : « Help » côté posteur, « Support » côté admin.
 * Partie sans réseau ni base (testée) : catégories, plateforme, fiche pour le
 * bot, garde-fou Ruul / Upwork, questions personnelles sur Slack, textes.
 *
 * Question = besoin d'une info (le bot répond). Problème = quelque chose est
 * cassé ou bloqué pour CE posteur (une action humaine ou automatique).
 */

export type Plateforme = "ruul" | "upwork";
export type TypeDemande = "question" | "probleme";

/** Les catégories (les mêmes pour les problèmes et les Official answers). */
export const CATEGORIES = ["paiement", "connexion", "compte", "tiktok", "posting", "parrainage", "arret", "autre"] as const;
export type Categorie = (typeof CATEGORIES)[number];

/** Les catégories d'un problème, dans l'ordre de la page Help. */
export const CATEGORIES_PROBLEME: readonly Categorie[] = ["paiement", "connexion", "compte", "tiktok", "arret", "autre"];

/** Le libellé anglais d'une catégorie : « compte » dit Ruul ou Upwork selon la plateforme, jamais l'autre. */
export function libelleCategorie(c: string | null | undefined, plateforme: Plateforme): string {
  switch (c) {
    case "paiement":
      return "Payment";
    case "connexion":
      return "Login & account";
    case "compte":
      return plateforme === "ruul" ? "Ruul account" : "Upwork contract";
    case "tiktok":
      return "TikTok account blocked";
    case "posting":
      return "Posting";
    case "parrainage":
      return "Referral";
    case "arret":
      return "Stop or pause";
    default:
      return "Other";
  }
}

export function estCategorie(c: unknown): c is Categorie {
  return typeof c === "string" && (CATEGORIES as readonly string[]).includes(c);
}

/** Rouge = paiement ; orange = compte (Ruul, Upwork, login) ; gris = le reste (comme support_urgence). */
export function urgence(c: string | null | undefined): "rouge" | "orange" | "gris" {
  if (c === "paiement") return "rouge";
  if (c === "compte" || c === "connexion") return "orange";
  return "gris";
}

export interface Fiche {
  nom?: string | null;
  plateforme?: Plateforme;
  debut?: string | null;
  premiere_connexion?: string | null;
  slack_relie?: boolean;
  tiktok?: string | null;
  warmup_debut?: string | null;
  warmup_fin?: string | null;
  ruul?: {
    statut?: string | null;
    email_ruul?: boolean;
    ajoute_at?: string | null;
    pret_at?: string | null;
    premier_paiement_at?: string | null;
    /** 0681 : le statut lu dans Ruul (import) et sa date. */
    compte_ruul?: string | null;
    compte_ruul_vu_at?: string | null;
    email_a_at?: string | null;
    email_b_at?: string | null;
  } | null;
  /** 0682 */
  statut?: string | null;
  zone?: string | null;
  tarif?: number | null;
  hm?: string | null;
  prochain_lundi?: string | null;
  contrat_upwork?: string | null;
  parrainages?: { declares?: number; invites?: number; recrues?: number } | null;
  derniere_paie?: { semaine?: string | null; statut?: string | null; montant?: number | null; paye_at?: string | null } | null;
  manque?: string[];
}

/**
 * La fiche du posteur pour le bot (bloc « live » du prompt). La plateforme
 * dicte une règle : jamais Upwork pour un posteur Ruul, jamais Ruul pour un
 * posteur Upwork.
 */
export function ficheTexte(f: Fiche | null): string {
  if (!f) return "Fiche du posteur : inconnue.";
  const ruul = f.plateforme === "ruul";
  const l: string[] = [
    `Posteur : ${f.nom ?? "?"}. Plateforme de paie : ${ruul ? "Ruul" : "Upwork"}.`,
    ruul
      ? "RÈGLE : ce posteur est payé par Ruul. Ne parle JAMAIS d'Upwork (ni contrat, ni milestone, ni message Upwork)."
      : "RÈGLE : ce posteur est payé par Upwork. Ne parle JAMAIS de Ruul.",
    `Date de début (premier lundi de posts) : ${f.debut ?? "pas encore fixée"}.`,
    `Connecté au dashboard : ${f.premiere_connexion ? "oui" : "pas encore"}. Slack relié : ${f.slack_relie ? "oui" : "non"}.`,
    `Compte TikTok : ${f.tiktok ? `@${String(f.tiktok).replace(/^@/, "")}` : "pas encore créé"}. Warm-up : ${
      f.warmup_debut ? (f.warmup_fin && new Date(f.warmup_fin).getTime() < Date.now() ? "terminé" : "en cours") : "pas commencé"
    }.`,
  ];
  l.push(`Statut : ${f.statut ?? "?"}. Zone ${f.zone ?? "?"}, tarif ${f.tarif != null ? `${f.tarif} $ par semaine` : "?"}. HM : ${f.hm ?? "?"}. Prochain lundi : ${f.prochain_lundi ?? "?"}.`);
  if (ruul && f.ruul) l.push(ligneRuul(f.ruul));
  if (!ruul && f.contrat_upwork) l.push(`Contrat Upwork : ${f.contrat_upwork}.`);
  const p = f.parrainages;
  if (p) l.push(`Parrainages : ${p.declares ?? 0} déclarés, ${p.invites ?? 0} invités, ${p.recrues ?? 0} recrutés.`);
  const d = f.derniere_paie;
  l.push(d ? `Dernière paie : semaine ${d.semaine ?? "?"}, statut ${d.statut ?? "?"}${d.montant != null ? `, ${d.montant} $` : ""}.` : "Dernière paie : aucune pour l'instant.");
  l.push(f.manque?.length ? `Étapes manquantes : ${f.manque.join(" ; ")}.` : "Étapes manquantes : aucune.");
  return l.join("\n");
}

/** 0682 : où en est la personne dans Ruul, d'après le dernier statut lu dans Ruul (avec sa date). */
export function ligneRuul(r: NonNullable<Fiche["ruul"]>, maintenant = new Date()): string {
  const jours = (iso: string | null | undefined) => (iso ? Math.floor((maintenant.getTime() - Date.parse(iso)) / 86_400_000) : null);
  const vu = jours(r.compte_ruul_vu_at);
  const lu = r.compte_ruul
    ? `statut lu dans Ruul : ${r.compte_ruul === "active" ? "Active (compte relié à Vik Studios)" : "Invited (invité, compte pas encore créé)"}, lu il y a ${vu} jour(s)${
      vu !== null && vu > 7 ? " — DONNÉE DE PLUS DE 7 JOURS : ne l'affirme pas, dis qu'on vérifie" : ""
    }`
    : r.ajoute_at ? "ajouté dans Ruul, statut Ruul pas encore lu" : "pas encore ajouté dans Ruul (Max l'ajoute)";
  return [
    `Ruul : ${lu}`,
    `email Ruul ${r.email_ruul ? "donné" : "pas encore donné"}`,
    r.pret_at ? "a cliqué « It's done » (prêt à être payé)" : "n'a pas encore cliqué « It's done »",
    r.premier_paiement_at ? "déjà payé une fois sur Ruul" : "jamais payé sur Ruul",
    r.email_a_at ? `email d'invitation envoyé le ${r.email_a_at.slice(0, 10)}` : "",
    r.email_b_at ? `email « compte relié » envoyé le ${r.email_b_at.slice(0, 10)}` : "",
  ].filter(Boolean).join(" ; ") + ".";
}

/** Garde-fou : une réponse qui parle de l'autre plateforme ne part pas (elle va à l'équipe). */
export function parleDeLAutrePlateforme(texte: string, plateforme: Plateforme): boolean {
  return plateforme === "ruul" ? /\bup\s?work\b/i.test(texte) : /\bruul\b/i.test(texte);
}

/**
 * Une question personnelle sur Slack (son compte, sa paie, son contrat) : le
 * bot répond court et renvoie vers Help. Mots simples, en anglais surtout.
 */
export function questionPersonnelle(texte: string): boolean {
  const t = texte.toLowerCase();
  // 12/11 (Max) : une question sur TikTok, les posts ou l'app n'est PAS perso, même avec « my account » /
  // « I can't log in » : le bot y répond directement. Seule la paie reste perso dans ce cas.
  if (parleDeTikTokPostsOuApp(t) && !PAIE.test(t)) return false;
  // 12/11 : « my account » seul ne compte plus — dans les salons, c'est presque toujours le compte
  // TikTok (cas de Noemi : le champ « Links » à 1 000 abonnés). Seul un compte Upwork / Ruul / dashboard est personnel.
  return /\b(my|i)\b[^.?!]{0,40}\b(pay|paid|payment|money|salary|milestone|contract|password|login|log in|ruul|invoice|bonus)\b/.test(t) ||
    /\b(upwork|ruul|sophia|dashboard)\s+account\b/.test(t) ||
    /\b(not|never|haven'?t|didn'?t|wasn'?t)\b[^.?!]{0,20}\b(paid|received|got)\b/.test(t);
}

/** La paie : toujours une question perso. */
const PAIE = /\b(pay|paid|payment|money|salary|milestone|invoice|bonus|fund(ed|s)?|ruul|upwork|contract)\b/;

/** TikTok, les posts, les photos, l'app, le dashboard des posts : des questions générales. */
export function parleDeTikTokPostsOuApp(texte: string): boolean {
  return /\b(tiktok|tik tok|post|posts|posted|posting|slide|slides|slideshow|photo|photos|picture|video|caption|hashtags?|sound|music|followers?|views?|likes?|bio|links?|profile|warm ?up|handle|username|app|sophia app)\b/
    .test(texte.toLowerCase());
}

/** 12/11 : une question perso venue d'un salon Slack, notée dans Support — la paie va à Max, le reste à Adrien. */
export function niveauQuestionPersonnelle(texte: string): { categorie: "paiement" | "compte"; niveau: "max" | "adrien" } {
  const t = texte.toLowerCase();
  const paie = /\b(pay|paid|payment|money|salary|milestone|invoice|bonus|fund(ed|s)?)\b/.test(t);
  return paie ? { categorie: "paiement", niveau: "max" } : { categorie: "compte", niveau: "adrien" };
}

export const LIEN_HELP = "/createur/help";

export function texteRenvoiHelp(osUrl: string): string {
  return `For anything personal (your account, your pay), please use Help on your dashboard: ${osUrl.replace(/\/+$/, "")}${LIEN_HELP}`;
}

/** Ce que voit le posteur quand le bot ne sait pas : la question part à l'équipe. */
export const TEXTE_ENVOYE_EQUIPE = "I'm not sure about this one, so I've sent your question to the team. You'll get an answer here and by email.";

/** Ce que voit le posteur après « Report a problem », selon ce que l'OS a pu faire seul. */
export function texteProblemeRecu(categorie: string, auto: "lien_envoye" | "arret" | null): string {
  if (auto === "lien_envoye") {
    return "We've just emailed you your login and a new password. If it still doesn't work, reply here.";
  }
  if (auto === "arret") return "We've received your request. The team will confirm the next steps here.";
  if (categorie === "paiement") return "Thanks, we've received it. Payment issues are checked first: the team will answer you here.";
  return "Thanks, we've received it. The team will answer you here, and you'll get an email.";
}

/** La catégorie d'une demande « I need help » de Slack (fenêtre du 6/11) : type et catégorie Support. */
export function depuisAideSlack(choix: string): { type: TypeDemande; categorie: Categorie } {
  switch (choix) {
    case "paie":
      return { type: "probleme", categorie: "paiement" };
    case "connexion":
      return { type: "probleme", categorie: "connexion" };
    case "tiktok":
      return { type: "probleme", categorie: "tiktok" };
    case "post":
    case "lien":
      return { type: "question", categorie: "posting" };
    default:
      return { type: "question", categorie: "autre" };
  }
}

/** L'alerte Slack à Max (en français), avec le lien de la page Support. */
export function texteAlerteMax(
  d: { nom: string; plateforme: Plateforme; categorie: string | null; texte: string; raison: "paiement" | "compte_24h" | "urgent"; os?: string | null; action?: string | null },
  osUrl: string,
): string {
  const tete = d.raison === "paiement" ? "🔴 Support : paiement / urgent" : d.raison === "urgent" ? "🔴 Support : urgent" : "🟠 Support : compte bloqué depuis plus de 24 h";
  if (d.os || d.action) {
    return [
      `${tete} — ${d.nom} (${d.plateforme === "ruul" ? "Ruul" : "Upwork"}, ${libelleCategorie(d.categorie, d.plateforme)})`,
      `Le posteur : « ${d.texte.slice(0, 300)} »`,
      ...(d.os ? [`L'OS : ${d.os}`] : []),
      ...(d.action ? [`Action proposée : ${d.action}`] : []),
      `${osUrl.replace(/\/+$/, "")}/admin/auto/support`,
    ].join("\n");
  }
  return `${tete} — ${d.nom} (${d.plateforme === "ruul" ? "Ruul" : "Upwork"}, ${libelleCategorie(d.categorie, d.plateforme)})\n« ${d.texte.slice(0, 300)} »\n${osUrl.replace(/\/+$/, "")}/admin/auto/support`;
}

/** L'email au posteur quand l'équipe répond. */
export function texteEmailReponse(prenom: string | null, reponse: string, osUrl: string): { objet: string; corps: string; lien: string } {
  return {
    objet: "The team answered your request",
    corps: `Hi ${prenom || "there"},\n\nThe team answered your request:\n\n${reponse}\n\nYou can reply from the Help page of your dashboard.`,
    lien: `${osUrl.replace(/\/+$/, "")}${LIEN_HELP}`,
  };
}

/** 0673 : tout ce que l'OS sait du posteur (messages, paie, milestones, posts), pour le bot. Coupé à `plafond`. */
export function contexteTexte(c: Record<string, unknown> | null, plafond = 20_000): string {
  if (!c) return "";
  // Les faits d'abord (paie, milestones, posts), puis les messages : une coupe ne perd que les plus vieux messages.
  const ordre = ["paie_semaines", "paie_ruul", "paie_upwork", "milestones", "posts", "demandes_help", "decisions", "posts_recents", "ruul_dernier_import",
    "envoye_par_os", "messages_au_bot", "messages_slack", "messages_upwork"];
  const range = Object.fromEntries([...ordre.filter((k) => k in c).map((k) => [k, c[k]]), ...Object.entries(c).filter(([k]) => !ordre.includes(k))]);
  const t = `DONNÉES DE L'OS SUR CE POSTEUR (montants en dollars ; « de » : posteur, hm, max, os, nous) :\n${JSON.stringify(range)}`;
  return t.length > plafond ? `${t.slice(0, plafond)}…` : t;
}

export type Verdict = "probleme_confirme" | "pas_de_probleme" | "incertain";

/** Le prompt du verdict : le problème signalé, comparé aux données de l'OS. Réponse en JSON, phrase en français. */
export function promptVerdict(o: { categorie: string; texte: string; fiche: string; contexte: string }): string {
  return `Tu vérifies un problème signalé par un posteur (créateur TikTok payé chaque semaine). Tu ne fais rien : tu compares ce qu'il dit aux données de l'OS.

Catégorie : ${o.categorie}
Ce qu'il dit : « ${o.texte} »

${o.fiche}

${o.contexte}

Règles :
- "probleme_confirme" : les données montrent le problème (ex. semaine terminée, posts faits, paie pas partie ; milestone pas financée ; compte bloqué).
- "pas_de_probleme" : les données le contredisent clairement (ex. payé le 10/11, 25 $).
- "incertain" : les données ne suffisent pas.
- Une phrase courte en français pour l'équipe, avec les faits (dates, montants en dollars, semaines). Jamais d'invention : seulement ce qui est dans les données.

Réponds uniquement en JSON : {"verdict": "probleme_confirme" | "pas_de_probleme" | "incertain", "phrase": "..."}`;
}

export function lireVerdict(brut: string): { verdict: Verdict; phrase: string } | null {
  const debut = brut.indexOf("{");
  const fin = brut.lastIndexOf("}");
  if (debut < 0 || fin <= debut) return null;
  try {
    const o = JSON.parse(brut.slice(debut, fin + 1)) as { verdict?: unknown; phrase?: unknown };
    const v = String(o.verdict ?? "");
    if (v !== "probleme_confirme" && v !== "pas_de_probleme" && v !== "incertain") return null;
    const phrase = String(o.phrase ?? "").trim().slice(0, 400);
    return phrase ? { verdict: v, phrase } : null;
  } catch {
    return null;
  }
}
