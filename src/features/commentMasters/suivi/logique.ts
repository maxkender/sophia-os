/**
 * Comment Masters · suivi : le compteur par Comment Master. Une demande compte
 * une seule fois, quelle que soit la façon dont le Done a été vu (bouton, fil,
 * réaction) ; un Done fait par quelqu'un d'autre ne compte qu'une fois validé.
 */
import { versCsv } from "@/lib/csv";

import type { DemandeCm } from "./api";

export interface LigneCm {
  /** Le Comment Master (profil), ou la langue si aucun mandat ne couvre la demande. */
  cle: string;
  nom: string | null;
  langue: string;
  region: string | null;
  canal: string | null;
  recues: number;
  /** Done qui comptent (fait par le Comment Master, ou validé). */
  done: number;
  pctDone: number | null;
  verifies: number;
  /** Done faits par quelqu'un d'autre, pas encore validés. */
  aValider: number;
  /** Délai moyen entre l'envoi et le Done, en minutes. */
  delaiMinutes: number | null;
  dernierDone: string | null;
  demandes: DemandeCm[];
}

export function parCommentMaster(demandes: DemandeCm[]): LigneCm[] {
  const groupes = new Map<string, DemandeCm[]>();
  for (const d of demandes) {
    const cle = d.cm_profile_id ?? `langue:${d.langue}`;
    groupes.set(cle, [...(groupes.get(cle) ?? []), d]);
  }
  return [...groupes.entries()]
    .map(([cle, ds]) => {
      const faites = ds.filter((d) => d.compte);
      const delais = faites
        .filter((d) => d.fait_at)
        .map((d) => (Date.parse(d.fait_at!) - Date.parse(d.envoye_at)) / 60_000)
        .filter((m) => m >= 0);
      const fins = faites.map((d) => d.fait_at!).sort();
      const dernier = fins.length > 0 ? fins[fins.length - 1]! : null;
      const d0 = ds[0]!;
      return {
        cle,
        nom: d0.cm_nom,
        langue: d0.langue,
        region: d0.region,
        canal: d0.canal,
        recues: ds.length,
        done: faites.length,
        pctDone: ds.length > 0 ? Math.round((faites.length / ds.length) * 100) : null,
        verifies: faites.filter((d) => d.verifie).length,
        aValider: ds.filter((d) => d.autre_personne && d.fait_at && !d.autre_valide_at).length,
        delaiMinutes: delais.length > 0 ? Math.round(delais.reduce((a, b) => a + b, 0) / delais.length) : null,
        dernierDone: dernier,
        demandes: [...ds].sort((a, b) => b.envoye_at.localeCompare(a.envoye_at)),
      };
    })
    .sort((a, b) => b.done - a.done || (a.nom ?? a.langue).localeCompare(b.nom ?? b.langue));
}

export function totaux(lignes: LigneCm[], parCommentaire: number) {
  const done = lignes.reduce((n, l) => n + l.done, 0);
  return {
    recues: lignes.reduce((n, l) => n + l.recues, 0),
    done,
    verifies: lignes.reduce((n, l) => n + l.verifies, 0),
    aValider: lignes.reduce((n, l) => n + l.aValider, 0),
    bonus: Math.round(done * parCommentaire * 100) / 100,
  };
}

/** « 1 h 25 », « 35 min », « 2 j 3 h ». */
export function delaiLisible(minutes: number | null): string {
  if (minutes === null) return "—";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  if (h < 24) return `${h} h ${String(minutes % 60).padStart(2, "0")}`;
  return `${Math.floor(h / 24)} j ${h % 24} h`;
}

/** Le CSV de la période : une ligne par demande. */
export function csvDemandes(demandes: DemandeCm[]): string {
  const entetes = [
    "comment_master", "language", "region", "sent_at", "tiktok_url", "slack_url",
    "done", "done_at", "done_by", "done_source", "done_by_someone_else", "validated", "counted", "verified_on_tiktok",
  ];
  return versCsv(
    entetes,
    demandes.map((d) => [
      d.cm_nom, d.langue, d.region, d.envoye_at, d.publie_url,
      d.slack_channel_id && d.slack_ts ? lienSlack(d.slack_channel_id, d.slack_ts) : null,
      Boolean(d.fait_at), d.fait_at, d.fait_par, d.fait_mode ?? d.fait_source ?? (d.fait_at ? "bouton" : null),
      d.autre_personne, d.autre_personne ? Boolean(d.autre_valide_at) : null, d.compte, d.verifie,
    ]),
  );
}

export function lienSlack(canal: string, ts: string): string {
  return `https://slack.com/archives/${canal}/p${ts.replace(".", "")}`;
}
