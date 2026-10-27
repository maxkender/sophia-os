/**
 * Check, Kill or Double (migrations 0326 à 0328) : les messages Slack aux HMs,
 * dans #managers-hq, et leur chargement depuis la base.
 *
 * Un contrôle poste UN message (le récap, pour Aram) ; le détail de chaque zone
 * est une réponse dans son fil, qui mentionne son HM, avec un bouton Done par
 * décision le samedi. Le rappel du lundi répond dans le même fil. Textes en
 * anglais : les HMs ne parlent pas tous français.
 */

import { drapeauPays } from "./comment_masters.ts";

// deno-lint-ignore no-explicit-any
type Supabase = any;
// deno-lint-ignore no-explicit-any
export type Bloc = Record<string, any>;

export type DecisionEnvoyee = "ne_pas_renouveler" | "recreer" | "doubler" | "nudge";
export const DECISIONS_ENVOYEES: readonly DecisionEnvoyee[] = ["ne_pas_renouveler", "recreer", "doubler", "nudge"];
export const ACTION_DONE = "ckd_fait";

export interface DecisionSlack {
  id: string;
  decision: DecisionEnvoyee;
  regle: string;
  handle: string | null;
  poster: string;
  pays: string | null;
  /** Le compte créé par Recréer ou Doubler. */
  nouveauHandle: string | null;
  /** Les autres comptes actifs du posteur (un Kill ne lui retire que celui-ci). */
  autresComptes: string[];
  motifs: string[];
  publies: number | null;
  attendus: number | null;
  note: string | null;
  /** Le message au HM modifié sur la page pour ce posteur (0339) : remplace la consigne par défaut d'un nudge. */
  texteHm: string | null;
  fait: { par: string; heure: string } | null;
  /** Le diagnostic du compte (0362, colonne calculée `diagnostic`). */
  diagnostic?: DiagnosticCkd | null;
}

/** Le diagnostic d'un compte, calculé par `ckd_diagnostic` (0362). */
export interface DiagnosticCkd {
  badge: "ok" | "posts_manquants" | "vues_basses" | "shadowban";
  attendus: number;
  publies: number;
  liens_manquants: string[];
  mediane: number | null;
  mediane_ref: number | null;
  morts: number;
  seuil_mort: number;
  shadowban: boolean;
  derniers_morts?: number | null;
  derniers_max?: number | null;
}

export interface ZoneSlack {
  hmId: string | null;
  hmNom: string;
  zone: string | null;
  slackId: string | null;
  decisions: DecisionSlack[];
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

/** Numéro de semaine ISO d'une date « AAAA-MM-JJ ». */
export function semaineIso(jour: string): number {
  const d = new Date(`${jour}T12:00:00Z`);
  const jeudi = new Date(d);
  jeudi.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7));
  const premier = new Date(Date.UTC(jeudi.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((jeudi.getTime() - premier.getTime()) / 86_400_000 - 3 + ((premier.getUTCDay() + 6) % 7)) / 7);
}

export function ajouterJours(jour: string, n: number): string {
  const d = new Date(`${jour}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** La semaine que les décisions du samedi `jour` concernent : celle du lundi d'après. */
export function semaineDesDecisions(jour: string): number {
  return semaineIso(ajouterJours(jour, 2));
}

/** « Sat 24 Oct ». */
export function jourCourt(jour: string): string {
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })
    .format(new Date(`${jour}T12:00:00Z`))
    .replace(",", "");
}

/** Heure et jour de la semaine à Paris (1 = lundi … 7 = dimanche). */
export function maintenantParis(d = new Date()): { jour: string; heure: number; isoJour: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Paris",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
      weekday: "short",
    }).formatToParts(d).map((p) => [p.type, p.value]),
  );
  const isoJour = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(parts.weekday) + 1;
  return { jour: `${parts.year}-${parts.month}-${parts.day}`, heure: Number(parts.hour), isoJour };
}

export function heureCourteParis(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" })
    .format(new Date(iso));
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

function compte(handle: string | null): string {
  return handle ? `@${handle}` : "account";
}

function lienTiktok(handle: string | null): string {
  return handle ? ` · <https://www.tiktok.com/@${handle}|TikTok>` : "";
}

const BADGE_SLACK: Record<DiagnosticCkd["badge"], string> = {
  ok: ":large_green_circle: OK",
  posts_manquants: ":large_orange_circle: Missing posts",
  vues_basses: ":large_yellow_circle: Low views",
  shadowban: ":red_circle: Shadowban",
};

const VERDICT_SLACK: Record<DiagnosticCkd["badge"], string> = {
  ok: "OK",
  posts_manquants: "missing posts → make sure they publish everything and paste each link",
  vues_basses: "views far below the country → go through their posts with them",
  shadowban: "probable shadowban → new account",
};

function nombre(n: number | null | undefined): string {
  return n === null || n === undefined ? "—" : Math.round(n).toLocaleString("en-US");
}

/** « 17, 18, 20, 21 Oct » */
function joursSlack(jours: string[]): string {
  if (jours.length === 0) return "";
  const mois = new Date(`${jours[jours.length - 1]}T12:00:00Z`).toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  return `${jours.map((j) => Number(j.slice(8, 10))).join(", ")} ${mois}`;
}

/** Le diagnostic en 3 lignes, en haut du message : posts, vues, verdict (0362). */
export function lignesDiagnosticSlack(d: DiagnosticCkd): string[] {
  const manquants = Math.max(0, d.attendus - d.publies);
  const liens = d.liens_manquants ?? [];
  const posts = `Posts: ${d.publies} published out of ${d.attendus} expected` +
    (manquants > 0 ? `, ${manquants} link${manquants > 1 ? "s" : ""} missing${liens.length ? ` (${joursSlack(liens)})` : ""}` : "");
  const vues = `Views: median ${nombre(d.mediane)} (country: ${nombre(d.mediane_ref)})` +
    (d.morts > 0 ? `, ${d.morts} dead post${d.morts > 1 ? "s" : ""} (< ${nombre(d.seuil_mort)} views)` : "");
  return [`${BADGE_SLACK[d.badge]} · ${posts}`, vues, `Verdict: ${VERDICT_SLACK[d.badge]}`];
}

function diagnosticEnTete(d: DecisionSlack): string[] {
  return d.diagnostic ? lignesDiagnosticSlack(d.diagnostic).map((l) => `> ${l}`) : [];
}

function quiHm(z: ZoneSlack, mention: boolean): string {
  if (z.slackId && mention) return `<@${z.slackId}>`;
  if (!z.hmId) return "No HM";
  return z.slackId ? z.hmNom : `${z.hmNom} (no Slack ID)`;
}

function titreZone(z: ZoneSlack, mention: boolean): string {
  return [quiHm(z, mention), z.zone ? `*${z.zone}*` : null].filter(Boolean).join(" · ");
}

/** Ce que le HM vérifie avec un nouveau posteur, motif par motif (jeudi). */
const SUIVI_MOTIF: Record<string, string> = {
  reveil: "None of their first posts took off. Go through them together: posting time, first slide, sound, " +
    "and that they post from the right account.",
  surveiller: "One of their first posts got almost no views. Look at that post with them: posting time, first slide, sound.",
  discipline: "Some posts are missing or have no link in the OS. Make sure they publish everything planned and paste each link.",
};

const LIBELLE_DECISION: Record<DecisionEnvoyee, string> = {
  ne_pas_renouveler: "don't renew",
  recreer: "recreate",
  doubler: "double",
  nudge: "nudge",
};

/**
 * Ce que le HM doit faire avec un posteur nudgé, sans l'en-tête ni la note :
 * le jeudi, quoi vérifier motif par motif ; le samedi (absent), la question à
 * lui poser. C'est le texte que la page pré-remplit et que l'admin peut
 * modifier pour ce posteur (`texteHm`).
 */
export function consigneNudge(d: Pick<DecisionSlack, "regle" | "motifs" | "publies" | "attendus">): string {
  if (d.regle === "jeudi") {
    const publies = d.attendus ? ` (${d.publies ?? 0}/${d.attendus} published)` : "";
    const lignes = d.motifs
      .filter((m) => SUIVI_MOTIF[m])
      .map((m) => `• ${SUIVI_MOTIF[m]}${m === "discipline" ? publies : ""}`);
    return lignes.length > 0 ? lignes.join("\n") : "• Check in with them: they got a message in the OS.";
  }
  const publies = d.attendus ? ` Posted ${d.publies ?? 0}/${d.attendus} this week.` : "";
  return `They got a message in the OS.${publies} Talk to them today: are they posting without pasting the links ` +
    "in the OS, or not posting at all?";
}

/** `&`, `<` et `>` sont des caractères de contrôle du mrkdwn de Slack. */
function echapperSlack(texte: string): string {
  return texte.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** La consigne qui part : celle modifiée sur la page (échappée), sinon celle par défaut. */
function consigneEnvoyee(d: DecisionSlack): string {
  const modifiee = d.texteHm?.trim();
  return modifiee ? echapperSlack(modifiee) : consigneNudge(d);
}

/** « 9 Nov » : le lundi de démarrage d'un 2ᵉ compte, en anglais. */
function jourAnglais(jour: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })
    .format(new Date(`${jour}T12:00:00Z`));
}

/**
 * Le texte d'une décision dans le fil de sa zone (samedi). `lundiDouble` : le
 * lundi où démarre le 2ᵉ compte d'un Double (samedi + 9 jours, 0369).
 */
export function texteDecision(d: DecisionSlack, semaine: number, lundiDouble?: string): string {
  const qui = `${compte(d.handle)} (${[d.poster, drapeauPays(d.pays)].filter(Boolean).join(" ")})${lienTiktok(d.handle)}`;
  const lignes: string[] = [];
  if (d.decision === "ne_pas_renouveler") {
    lignes.push(`:no_entry: *Don't renew* ${qui}`);
    lignes.push("Stops Sunday night: don't fund the next milestone.");
    if (d.autresComptes.length > 0) {
      lignes.push(`They keep ${d.autresComptes.map((h) => `@${h}`).join(", ")}: next milestone for 1 account less.`);
    }
  } else if (d.decision === "recreer") {
    lignes.push(`:repeat: *Recreate* ${qui}`);
    lignes.push(
      `New account ready in the OS: *${compte(d.nouveauHandle)}*. Ask the poster to create it on TikTok and to start ` +
        "the warm-up in the OS before Sunday midnight. The old account is already stopped (moved to the Archive); the milestone doesn't change.",
    );
  } else if (d.decision === "doubler" && !d.nouveauHandle) {
    // v3 (0382) : le posteur reçoit l'offre dans l'OS et répond lui-même. Pour la HM, de l'information.
    lignes.push(`:heavy_plus_sign: *Double offered* ${qui}`);
    lignes.push(
      "The poster gets a pop-up in the OS from Sunday (Yes / No, until Wednesday night). " +
        (lundiDouble
          ? `If they say yes, their 2nd account starts on Monday ${jourAnglais(lundiDouble)}` +
            ` (milestone "Week ${semaineIso(lundiDouble)} (2 acc)" from then on). `
          : "") +
        "Nothing to do for you.",
    );
  } else if (d.decision === "doubler") {
    lignes.push(`:heavy_plus_sign: *Double* ${qui}`);
    if (lundiDouble) {
      lignes.push(
        `2nd account *${compte(d.nouveauHandle)}*, starts on Monday ${jourAnglais(lundiDouble)}. ` +
          `From that week on: milestone "Week ${semaineIso(lundiDouble)} (2 acc)", pay × 2. ` +
          "The poster creates it on TikTok and starts the warm-up in the OS the week before.",
      );
    } else {
      lignes.push(
        `Second account ready in the OS: *${compte(d.nouveauHandle)}*. Ask the poster to create it on TikTok and to ` +
          `start the warm-up in the OS before Sunday midnight. Next milestone: "Week ${semaine} (2 acc)".`,
      );
    }
  } else {
    lignes.push(`:speech_balloon: *Follow up* ${qui}`);
    lignes.push(consigneEnvoyee(d));
  }
  // Le diagnostic juste sous le titre, avant le détail.
  lignes.splice(1, 0, ...diagnosticEnTete(d));
  if (d.note) lignes.push(`_Note: ${d.note}_`);
  return lignes.join("\n");
}

/** Le texte d'un nouveau posteur à relancer (jeudi) : quoi vérifier avec lui. */
export function texteSuiviJeudi(d: DecisionSlack): string {
  const qui = `${compte(d.handle)} (${[d.poster, drapeauPays(d.pays)].filter(Boolean).join(" ")})${lienTiktok(d.handle)}`;
  const lignes = [`:eyes: *Follow up* ${qui}`, ...diagnosticEnTete(d), consigneEnvoyee(d)];
  if (d.note) lignes.push(`_Note: ${d.note}_`);
  return lignes.join("\n");
}

function boutonDone(d: DecisionSlack): Bloc {
  return d.fait
    ? { type: "context", elements: [{ type: "mrkdwn", text: `✅ Done by <@${d.fait.par}> at ${d.fait.heure}` }] }
    : {
      type: "actions",
      elements: [{
        type: "button",
        style: "primary",
        action_id: ACTION_DONE,
        value: d.id,
        text: { type: "plain_text", text: "✅ Done" },
      }],
    };
}

/** Le message d'une zone, le samedi : une section et un bouton Done par décision. */
export function blocsZoneSamedi(z: ZoneSlack, semaine: number, lundiDouble?: string): Bloc[] {
  const blocs: Bloc[] = [{
    type: "section",
    text: {
      type: "mrkdwn",
      text: `${titreZone(z, true)}: ${z.decisions.length} decision${z.decisions.length > 1 ? "s" : ""} for week ${semaine}`,
    },
  }];
  for (const d of z.decisions) {
    blocs.push({ type: "divider" });
    blocs.push({ type: "section", text: { type: "mrkdwn", text: texteDecision(d, semaine, lundiDouble) } });
    blocs.push(boutonDone(d));
  }
  return blocs;
}

/**
 * Le message d'une zone, le jeudi : les nouveaux posteurs qui démarrent mal. Ils
 * ont eu un nudge dans l'OS ; le HM les relance le jour même, puis clique Done.
 */
export function blocsZoneJeudi(z: ZoneSlack): Bloc[] {
  const n = z.decisions.length;
  const blocs: Bloc[] = [{
    type: "section",
    text: {
      type: "mrkdwn",
      text: `${titreZone(z, true)}: ${n} new poster${n > 1 ? "s" : ""} to follow up today`,
    },
  }];
  for (const d of z.decisions) {
    blocs.push({ type: "divider" });
    blocs.push({ type: "section", text: { type: "mrkdwn", text: texteSuiviJeudi(d) } });
    blocs.push(boutonDone(d));
  }
  return blocs;
}

/** Le message d'une zone selon le contrôle. */
export function blocsZone(type: "jeudi" | "samedi", z: ZoneSlack, jour: string): Bloc[] {
  return type === "samedi"
    ? blocsZoneSamedi(z, semaineDesDecisions(jour), ajouterJours(jour, 9))
    : blocsZoneJeudi(z);
}

function comptes(type: "jeudi" | "samedi", z: ZoneSlack): string {
  if (type === "jeudi") return `${z.decisions.length} to follow up`;
  const parDecision = new Map<DecisionEnvoyee, number>();
  for (const d of z.decisions) parDecision.set(d.decision, (parDecision.get(d.decision) ?? 0) + 1);
  return DECISIONS_ENVOYEES.filter((k) => parDecision.has(k))
    .map((k) => `${parDecision.get(k)} ${LIBELLE_DECISION[k]}`)
    .join(", ");
}

/** Le message principal du contrôle : le récap de toutes les zones envoyées. */
export function blocsRecap(type: "jeudi" | "samedi", jour: string, zones: ZoneSlack[]): Bloc[] {
  const tete = type === "samedi"
    ? `:clipboard: *Check, Kill or Double · week ${semaineDesDecisions(jour)}*\n` +
      `Decisions of ${jourCourt(jour)} for next week. Each zone's details are in the thread: click Done once it's handled.`
    : `:eyes: *Check, Kill or Double · Thursday check* (accounts that started ${jourCourt(ajouterJours(jour, -3))})\n` +
      "New posters off to a weak start. They got a nudge in the OS: now follow up with each of them today. " +
      "What to check is in the thread: click Done once you've talked to them.";
  const lignes = zones.map((z) => {
    const faits = z.decisions.filter((d) => d.fait).length;
    const suivi = ` · ${faits === z.decisions.length ? "✅" : "⏳"} ${faits}/${z.decisions.length} done`;
    return `• ${titreZone(z, false)}: ${comptes(type, z)}${suivi}`;
  });
  return [
    { type: "section", text: { type: "mrkdwn", text: tete } },
    { type: "section", text: { type: "mrkdwn", text: lignes.join("\n") || "_Nothing sent yet._" } },
  ];
}

export function texteRecap(type: "jeudi" | "samedi", jour: string): string {
  return type === "samedi"
    ? `Check, Kill or Double: week ${semaineDesDecisions(jour)} decisions`
    : "Check, Kill or Double: Thursday follow-ups";
}

/**
 * Le rappel du lundi 9 h, avant le financement des jalons : par HM, qui ne pas
 * financer et qui passe à 2 comptes. `null` s'il n'y a rien à rappeler.
 */
export function texteRappel(jour: string, zones: ZoneSlack[]): string | null {
  const semaine = semaineDesDecisions(jour);
  const lignes: string[] = [];
  for (const z of zones) {
    const kills = z.decisions.filter((d) => d.decision === "ne_pas_renouveler");
    const doubles = z.decisions.filter((d) => d.decision === "doubler");
    if (kills.length === 0 && doubles.length === 0) continue;
    const morceaux: string[] = [];
    if (kills.length > 0) morceaux.push(`don't fund ${kills.map((d) => `${compte(d.handle)} (${d.poster})`).join(", ")}`);
    if (doubles.length > 0) {
      // Le 2ᵉ compte d'un Double démarre le lundi J+9 (0369) : × 2 à partir de là.
      const lundi = ajouterJours(jour, 9);
      morceaux.push(
        `fund 1 account this week, then "Week ${semaineIso(lundi)} (2 acc)" from Monday ${jourAnglais(lundi)} for ` +
          doubles.map((d) => `${compte(d.handle)} (${d.poster})`).join(", "),
      );
    }
    lignes.push(`• ${titreZone(z, true)}: ${morceaux.join(" · ")}`);
  }
  if (lignes.length === 0) return null;
  return `:moneybag: *Before funding this week's milestones (week ${semaine})*\n${lignes.join("\n")}`;
}

// ---------------------------------------------------------------------------
// Chargement
// ---------------------------------------------------------------------------

export interface PropositionSlack {
  id: string;
  controle_id: string;
  regle: string;
  decision: string | null;
  compte_id: string;
  poster_id: string;
  hm_id: string | null;
  pays: string | null;
  donnees: { handle?: string | null; motifs?: string[]; periode?: { publies?: number; attendus?: number } };
  note: string | null;
  hm_texte: string | null;
  nouveau_compte_id: string | null;
  envoye_at: string | null;
  fait_at: string | null;
  fait_par: string | null;
  slack_ts: string | null;
  diagnostic?: DiagnosticCkd | null;
}

export const COLONNES_PROPOSITION =
  "id, controle_id, regle, decision, compte_id, poster_id, hm_id, pays, donnees, note, hm_texte, nouveau_compte_id, envoye_at, fait_at, fait_par, slack_ts, diagnostic";

function nom(p: { prenom: string | null; nom: string | null } | undefined): string {
  return [p?.prenom, p?.nom].filter(Boolean).join(" ").trim();
}

/** Les propositions, groupées par zone (HM), avec les noms, handles et ID Slack. */
export async function zonesDe(supabase: Supabase, props: PropositionSlack[]): Promise<ZoneSlack[]> {
  if (props.length === 0) return [];
  const personnes = [...new Set(props.flatMap((p) => [p.poster_id, p.hm_id]).filter(Boolean))] as string[];
  const nouveaux = props.map((p) => p.nouveau_compte_id).filter(Boolean) as string[];
  const posters = [...new Set(props.map((p) => p.poster_id))];

  const [{ data: profils, error: e1 }, { data: slack, error: e2 }, { data: crees, error: e3 }, { data: actifs, error: e4 }] =
    await Promise.all([
      supabase.from("profiles").select("id, prenom, nom, zone_recrutement").in("id", personnes),
      supabase.from("hm_slack").select("profile_id, slack_user_id").in("profile_id", personnes),
      nouveaux.length
        ? supabase.from("comptes").select("id, handle_tiktok").in("id", nouveaux)
        : Promise.resolve({ data: [], error: null }),
      supabase.from("comptes").select("id, poster_id, handle_tiktok").in("poster_id", posters).eq("is_active", true),
    ]);
  const erreur = e1 ?? e2 ?? e3 ?? e4;
  if (erreur) throw erreur;

  type Profil = { id: string; prenom: string | null; nom: string | null; zone_recrutement: string | null };
  const parId = new Map<string, Profil>((profils ?? []).map((p: Profil) => [p.id, p]));
  const slackDe = new Map<string, string | null>(
    (slack ?? []).map((s: { profile_id: string; slack_user_id: string | null }) => [s.profile_id, s.slack_user_id]),
  );
  const handleDe = new Map<string, string | null>(
    (crees ?? []).map((c: { id: string; handle_tiktok: string | null }) => [c.id, c.handle_tiktok]),
  );

  const zones = new Map<string, ZoneSlack>();
  for (const p of props) {
    const cle = p.hm_id ?? "";
    let z: ZoneSlack | undefined = zones.get(cle);
    if (!z) {
      const hm = p.hm_id ? parId.get(p.hm_id) : undefined;
      z = {
        hmId: p.hm_id,
        hmNom: nom(hm) || "No HM",
        zone: hm?.zone_recrutement ?? null,
        slackId: p.hm_id ? (slackDe.get(p.hm_id) ?? null) : null,
        decisions: [],
      };
      zones.set(cle, z);
    }
    const autres = (actifs ?? [])
      .filter((c: { id: string; poster_id: string }) =>
        c.poster_id === p.poster_id && c.id !== p.compte_id && c.id !== p.nouveau_compte_id
      )
      .map((c: { handle_tiktok: string | null }) => c.handle_tiktok)
      .filter(Boolean) as string[];
    z.decisions.push({
      id: p.id,
      decision: p.decision as DecisionEnvoyee,
      regle: p.regle,
      handle: p.donnees?.handle ?? null,
      poster: nom(parId.get(p.poster_id)),
      pays: p.pays,
      nouveauHandle: p.nouveau_compte_id ? (handleDe.get(p.nouveau_compte_id) ?? null) : null,
      autresComptes: autres,
      motifs: p.donnees?.motifs ?? [],
      publies: p.donnees?.periode?.publies ?? null,
      attendus: p.donnees?.periode?.attendus ?? null,
      note: p.note,
      texteHm: p.hm_texte ?? null,
      fait: p.fait_at && p.fait_par ? { par: p.fait_par, heure: heureCourteParis(p.fait_at) } : null,
      diagnostic: p.diagnostic ?? null,
    });
  }
  const ordre = (d: DecisionSlack) => DECISIONS_ENVOYEES.indexOf(d.decision);
  for (const z of zones.values()) {
    z.decisions.sort((a, b) => ordre(a) - ordre(b) || (a.handle ?? "").localeCompare(b.handle ?? ""));
  }
  return [...zones.values()].sort((a, b) => {
    if (!a.hmId) return 1;
    if (!b.hmId) return -1;
    return (a.zone ?? a.hmNom).localeCompare(b.zone ?? b.hmNom);
  });
}

export async function slackApi(token: string, methode: string, corps: Record<string, unknown>) {
  const res = await fetch(`https://slack.com/api/${methode}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(corps),
  });
  return (await res.json()) as { ok: boolean; ts?: string; error?: string; [cle: string]: unknown };
}

/** Réécrit le récap d'un contrôle (après un envoi ou un Done). */
export async function majRecap(supabase: Supabase, token: string, controleId: string): Promise<void> {
  const { data: c, error } = await supabase
    .from("ckd_controles")
    .select("id, type, jour, slack_canal, slack_ts")
    .eq("id", controleId)
    .single();
  if (error) throw error;
  if (!c.slack_canal || !c.slack_ts) return;
  const { data: props, error: e2 } = await supabase
    .from("ckd_propositions")
    .select(COLONNES_PROPOSITION)
    .eq("controle_id", controleId)
    .not("envoye_at", "is", null);
  if (e2) throw e2;
  const zones = await zonesDe(supabase, props ?? []);
  const r = await slackApi(token, "chat.update", {
    channel: c.slack_canal,
    ts: c.slack_ts,
    text: texteRecap(c.type, c.jour),
    blocks: blocsRecap(c.type, c.jour, zones),
  });
  if (!r.ok) throw new Error(`Slack chat.update : ${r.error}`);
}
