/**
 * 21/11 (Max, « SUPPORT + BOTS », points 7 et 10) : les DM Slack de la page « Aujourd'hui » (à Max seulement).
 * Partie sans réseau ni base (testée) : l'alerte urgente, le résumé de 18 h et le rapport qualité du lundi.
 */

export interface LigneAujourdhui {
  id: string;
  titre: string;
  detail: string | null;
  ton: "rouge" | "orange" | "gris";
  depuis: string | null;
  nb: number | null;
}

export interface SectionAujourdhui {
  cle: string;
  titre: string;
  lignes: LigneAujourdhui[];
}

export interface Aujourdhui {
  resume: { a_valider: number; cas: number; problemes: number; reponses: number; corrections: number };
  sections: SectionAujourdhui[];
  chiffres: {
    comptes_actifs: number; posts_jour: number; ruul: number; upwork: number;
    support_sans_humain: number | null; demandes_24h: number;
  };
}

export interface QualiteSemaine {
  lundi: string;
  demandes: number;
  sans_humain: number;
  pct_sans_humain: number | null;
  objectif: number;
  delai_premiere_reponse_min: number | null;
  delai_reponse_humaine_min: number | null;
  rouverts: number;
  niveau2_par_sujet: Record<string, number>;
  emails: { envoyes: number; delivres: number; refuses: number };
  emails_entrants_non_relies: number;
  a_relire: { id: string; categorie: string | null; langue: string | null; demande: string; reponse: string }[];
}

/** « depuis 2 j », « depuis 5 h », « depuis 20 min » (rien sans date). */
export function depuisEnClair(depuis: string | null, maintenant = new Date()): string {
  if (!depuis) return "";
  const min = Math.max(0, Math.round((maintenant.getTime() - new Date(depuis).getTime()) / 60_000));
  if (min < 60) return `depuis ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `depuis ${h} h`;
  return `depuis ${Math.round(h / 24)} j`;
}

/** Une durée en minutes, lisible (« 42 s », « 12 min », « 3,5 h »). */
export function dureeEnClair(min: number | null): string {
  if (min === null || !Number.isFinite(min)) return "—";
  if (min < 1) return `${Math.round(min * 60)} s`;
  if (min < 90) return `${Math.round(min)} min`;
  return `${(Math.round(min / 6) / 10).toString().replace(".", ",")} h`;
}

const PASTILLE = { rouge: "🔴", orange: "🟠", gris: "⚪" } as const;

/** Le DM urgent (argent, ou bloqué depuis plus de 24 h) : les lignes pas encore signalées, en un seul message. */
export function texteAlertesUrgentes(lignes: LigneAujourdhui[], url: string, maintenant = new Date()): string | null {
  if (!lignes.length) return null;
  const l = lignes.slice(0, 12).map((x) => {
    const d = depuisEnClair(x.depuis, maintenant);
    return `${PASTILLE[x.ton] ?? "•"} ${x.titre}${d ? ` (${d})` : ""}`;
  });
  const reste = lignes.length > 12 ? `\n… et ${lignes.length - 12} autre(s)` : "";
  return `*Urgent sur Aujourd'hui* — ${lignes.length === 1 ? "1 ligne" : `${lignes.length} lignes`}\n${l.join("\n")}${reste}\n${url}`;
}

/** Le résumé de 18 h (Paris). */
export function texteResumeJour(a: Aujourdhui, url: string, maintenant = new Date()): string {
  const r = a.resume;
  const tete = `*Aujourd'hui, 18 h* — ${r.a_valider} à valider · ${r.cas} cas pour toi · ${r.problemes} problème(s) · ` +
    `${r.reponses} réponse(s) envoyée(s) par les bots · ${r.corrections} correction(s) faite(s)`;
  const sections = a.sections
    .filter((s) => s.lignes.some((l) => l.ton !== "gris"))
    .map((s) => {
      const lignes = s.lignes.filter((l) => l.ton !== "gris");
      const top = lignes.slice(0, 4).map((l) => {
        const d = depuisEnClair(l.depuis, maintenant);
        return `  ${PASTILLE[l.ton]} ${l.titre}${d ? ` (${d})` : ""}`;
      });
      const reste = lignes.length > 4 ? [`  … et ${lignes.length - 4} autre(s)`] : [];
      return [`*${s.titre}* (${lignes.length})`, ...top, ...reste].join("\n");
    });
  const c = a.chiffres;
  const chiffres = `Chiffres : ${c.comptes_actifs} comptes actifs · ${c.posts_jour} posts aujourd'hui · ` +
    `${c.upwork} Upwork / ${c.ruul} Ruul · support sans humain ${c.support_sans_humain ?? "—"} % (${c.demandes_24h} demandes en 24 h)`;
  return [tete, ...(sections.length ? sections : ["Rien d'urgent ✅"]), chiffres, url].join("\n\n");
}

/** Le rapport qualité du lundi. */
export function texteQualite(q: QualiteSemaine, url: string): string {
  const pct = q.pct_sans_humain;
  const objectif = pct === null ? "" : pct >= q.objectif ? " ✅" : ` (objectif ${q.objectif} %)`;
  const sujets = Object.entries(q.niveau2_par_sujet ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 6)
    .map(([s, n]) => `${s} ${n}`).join(" · ");
  const em = q.emails ?? { envoyes: 0, delivres: 0, refuses: 0 };
  return [
    `*Rapport support de la semaine du ${q.lundi.split("-").reverse().join("/")}*`,
    `• Réglé sans humain : ${pct ?? "—"} %${objectif} (${q.sans_humain} sur ${q.demandes})`,
    `• 1re réponse (médiane) : ${dureeEnClair(q.delai_premiere_reponse_min)} · quand un humain répond : ${dureeEnClair(q.delai_reponse_humaine_min)}`,
    `• Rouverts : ${q.rouverts}`,
    `• Cas pour toi par sujet : ${sujets || "aucun"}`,
    `• Emails : ${em.delivres} délivrés, ${em.refuses} refusés (sur ${em.envoyes})`,
    `• Emails reçus sans posteur relié : ${q.emails_entrants_non_relies}`,
    `• ${q.a_relire?.length ?? 0} réponses tirées au hasard à relire sur la page`,
    url,
  ].join("\n");
}
