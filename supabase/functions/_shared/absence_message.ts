/**
 * 21/11 (Max, point 5) : un posteur Ruul écrit qu'il est absent, malade ou en voyage → l'OS crée l'absence avec les
 * dates dites (sans date : le jour du message et le lendemain). Un filtre de mots d'abord (toutes langues courantes),
 * puis le modèle lit le message et rend les dates.
 */

const MOTS = new RegExp(
  [
    "absent", "away", "sick", "\\bill\\b", "hospital", "travel", "trip", "vacation", "holiday", "can'?t post", "cannot post", "won'?t (be able to )?post",
    "funeral", "surgery", "fever", "malad", "voyage", "vacances", "hôpital", "hopital", "enferm", "viaj", "vacacion", "hospital",
    "krank", "urlaub", "reise", "doente", "viagem", "férias", "ferias", "malat", "viaggi", "vacanz", "ospedal",
    "chor", "wakacj", "podróż", "nemocn", "dovolen", "cestuj", "bolestan", "putuj", "godišnj", "beteg", "szabads", "utaz",
    "tatil", "seyahat", "bolnav", "concediu", "călători", "ziek", "vakantie", "sjuk", "semester", "resa", "syg", "ferie",
    "sairas", "loma", "matka", "болен", "больн", "отпуск", "поездк", "хвор", "відпуст", "άρρωσ", "διακοπ", "ταξίδ",
  ].join("|"),
  "i",
);

/** Le message parle-t-il peut-être d'une absence ? (sinon, pas d'appel au modèle) */
export function parleAbsence(texte: string | null | undefined): boolean {
  return MOTS.test(texte ?? "");
}

export function promptAbsence(texte: string, jour: string): string {
  return [
    "A content creator wrote this message to their team. Does the creator say they will NOT be able to post for some days",
    "because they are absent, sick, travelling, on holiday, at a funeral, in hospital, or similar?",
    `The message was sent on ${jour} (YYYY-MM-DD). Answer ONLY with JSON:`,
    '{"absent": true|false, "debut": "YYYY-MM-DD" or null, "fin": "YYYY-MM-DD" or null, "raison": short English reason or null}',
    "Use the dates the creator gives (resolve 'tomorrow', 'until Monday', 'for 3 days' from the message date). No date given: null.",
    "A question about absences, or a past absence that is over, is not an absence: absent=false.",
    "",
    `Message: """${texte.slice(0, 1500)}"""`,
  ].join("\n");
}

export interface AbsenceLue { absent: boolean; debut: string | null; fin: string | null; raison: string | null }

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function lireReponseAbsence(brut: string): AbsenceLue | null {
  const m = brut.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]) as Record<string, unknown>;
    const date = (v: unknown) => (typeof v === "string" && DATE.test(v) ? v : null);
    let debut = date(j.debut);
    let fin = date(j.fin);
    if (debut && fin && fin < debut) [debut, fin] = [fin, debut];
    return { absent: j.absent === true, debut, fin, raison: typeof j.raison === "string" && j.raison.trim() ? j.raison.trim().slice(0, 100) : null };
  } catch {
    return null;
  }
}
