/**
 * Le contexte d'un posteur en une ligne : ce qui s'est dit avec la HM ou le bot
 * (Upwork, Slack, dashboard), et s'il ne répond pas, depuis quand (au jour près).
 * Sert à Onboarding posters et au jeudi (le nudger, ou il est parti de lui-même ?).
 */

export interface EvenementFil {
  sens: "recu" | "envoye";
  at: string;
  canal: string | null;
  texte: string | null;
  /** Le classement de l'OS pour un message reçu (stop, question…). */
  cas?: string | null;
}

export type Verdict = "stop" | "absent" | "silence" | "repondu" | "rien";

export interface ResumeContexte {
  verdict: Verdict;
  dernierRecu: { at: string; canal: string | null; extrait: string; cas: string | null } | null;
  /** Nos messages depuis sa dernière réponse (ou depuis le début s'il n'a jamais répondu). */
  sansReponse: { n: number; dates: string[] };
  /** Ses derniers échanges, du plus récent au plus ancien (6 au plus). */
  fil: EvenementFil[];
}

const CAS_STOP = new Set(["stop", "arret", "je_ne_veux_plus", "quitter"]);
const MOTS_STOP = /\b(stop|quit|cancel|not interested|end (the|my) contract|no longer|don'?t want)\b/i;

/** Un extrait court, sur une ligne. */
export function extrait(texte: string | null | undefined, n = 90): string {
  const t = String(texte ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

export function resumer(
  evenements: readonly EvenementFil[],
  o: { stop?: boolean; absentJusquA?: string | null } = {},
): ResumeContexte {
  const fil = [...evenements].filter((e) => e.at).sort((a, b) => b.at.localeCompare(a.at));
  const recu = fil.find((e) => e.sens === "recu") ?? null;
  const depuis = fil.filter((e) => e.sens === "envoye" && (!recu || e.at > recu.at));
  // Une date par jour, de la plus ancienne à la plus récente.
  const jours = [...new Set(depuis.map((e) => e.at.slice(0, 10)))].sort();
  const stop = Boolean(o.stop) || Boolean(recu && (CAS_STOP.has(String(recu.cas ?? "")) || MOTS_STOP.test(recu.texte ?? "")));
  const verdict: Verdict = stop
    ? "stop"
    : o.absentJusquA
    ? "absent"
    : depuis.length > 0
    ? "silence"
    : recu
    ? "repondu"
    : "rien";
  return {
    verdict,
    dernierRecu: recu ? { at: recu.at, canal: recu.canal, extrait: extrait(recu.texte), cas: recu.cas ?? null } : null,
    sansReponse: { n: depuis.length, dates: jours },
    fil: fil.slice(0, 6),
  };
}

/** « 28 Oct, 30 Oct » ; au-delà de 3 dates : les 3 dernières et « +n ». */
export function datesCourtes(jours: readonly string[], langue = "en-GB"): string {
  const f = new Intl.DateTimeFormat(langue, { day: "numeric", month: "short", timeZone: "UTC" });
  const d = jours.map((j) => f.format(new Date(`${j.slice(0, 10)}T12:00:00Z`)));
  return d.length > 3 ? `+${d.length - 3} · ${d.slice(-3).join(", ")}` : d.join(", ");
}
