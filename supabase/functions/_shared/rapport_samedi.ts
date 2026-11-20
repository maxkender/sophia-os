/**
 * 18/11 (Max) : le rapport des kills du samedi, en français, pour #a-os-tickets (même contenu que la page de l'OS).
 */
import { ligneRapportInactifs, type RapportInactifs } from "./inactifs.ts";

export interface EtapeRapport {
  etape: string;
  libelle: string;
  ok: number;
  echec: number;
  a_faire: number;
  noms: { nom: string; statut: string; detail: string | null }[];
}

export interface RapportSamedi {
  samedi: string;
  complets: number;
  comptes_partiels: number;
  par_hm: { hm: string; complets: number; partiels: number }[];
  par_pays: { pays: string; complets: number; partiels: number }[];
  etapes_complets: EtapeRapport[];
  etapes_partiels: EtapeRapport[];
  milestones_a_corriger: { nom: string; detail: string }[];
  controle: { type: string; libelle: string; nb: number; lignes: { nom: string; detail: string | null }[] }[];
  /** 0797 : les inactifs arrêtés automatiquement ce samedi (une ligne ; la liste reste dépliable dans l'OS). */
  inactifs?: RapportInactifs & { liste: unknown[] };
}

const MAX_NOMS = 8;

function liste(noms: { nom: string; detail?: string | null }[]): string {
  const vus = noms.slice(0, MAX_NOMS).map((n) => `${n.nom}${n.detail ? ` (${n.detail})` : ""}`);
  return vus.join(", ") + (noms.length > MAX_NOMS ? ` … +${noms.length - MAX_NOMS}` : "");
}

function etapes(titre: string, l: EtapeRapport[]): string[] {
  if (!l.length) return [];
  return [
    `*${titre}*`,
    ...l.map((e) => {
      const ko = e.echec + e.a_faire;
      const tete = `${ko ? "⚠️" : "✅"} ${e.etape}) ${e.libelle} : ${e.ok} OK${e.echec ? `, ${e.echec} en échec` : ""}${e.a_faire ? `, ${e.a_faire} à faire` : ""}`;
      return ko ? `${tete}\n      ${liste(e.noms)}` : tete;
    }),
  ];
}

/** Le message Slack (mrkdwn) du rapport. */
export function texteRapportSamedi(r: RapportSamedi, lien: string): string {
  const jour = new Date(`${r.samedi}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  const lignes = [
    `:bar_chart: *Kills du ${jour}* : ${r.complets} posteur${r.complets > 1 ? "s" : ""} killé${r.complets > 1 ? "s" : ""} (complets), ${r.comptes_partiels} compte${r.comptes_partiels > 1 ? "s" : ""} killé${r.comptes_partiels > 1 ? "s" : ""} chez des posteurs à 2 comptes.`,
  ];
  if (r.inactifs) lignes.push(ligneRapportInactifs(r.inactifs));
  if (r.par_hm.length) lignes.push(`Par HM : ${r.par_hm.map((h) => `${h.hm} ${h.complets}${h.partiels ? ` (+${h.partiels} compte)` : ""}`).join(" · ")}`);
  if (r.par_pays.length) lignes.push(`Par pays : ${r.par_pays.map((p) => `${p.pays} ${p.complets}${p.partiels ? ` (+${p.partiels})` : ""}`).join(" · ")}`);
  lignes.push("", ...etapes("Kills complets", r.etapes_complets), ...etapes("Un compte sur deux", r.etapes_partiels));
  if (r.milestones_a_corriger.length) {
    lignes.push("", `*Milestones à corriger (passage à 1 compte)* : ${r.milestones_a_corriger.length}`, `      ${liste(r.milestones_a_corriger)}`);
  }
  lignes.push("", "*Contrôle de toute la base*");
  if (!r.controle.length) lignes.push("✅ Aucune incohérence.");
  for (const c of r.controle) lignes.push(`⚠️ ${c.libelle} : ${c.nb}\n      ${liste(c.lignes)}`);
  lignes.push("", `Le détail : ${lien}`);
  return lignes.join("\n");
}

/** Le samedi (AAAA-MM-JJ) d'une date Paris : le samedi passé (ou aujourd'hui si samedi). */
export function samediDe(jour: string): string {
  const d = new Date(`${jour}T12:00:00Z`);
  const isodow = ((d.getUTCDay() + 6) % 7) + 1;
  d.setUTCDate(d.getUTCDate() - ((isodow + 1) % 7));
  return d.toISOString().slice(0, 10);
}
