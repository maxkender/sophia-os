// Usage : POD_JETON=… node atelier/cli-etat.ts
// File de validation du pod, et rangs / vues / r de ses originaux en ligne.
import { appelPod } from "./api.ts";

type ChezNous = { publies: number; vues_mediane: number; r_median: number | null; r_passages: number[]; vues_passages: number[] };
type Etat = {
  comptes_du_label_par_langue: Record<string, number>;
  livraisons: { source_id: string; titre: string | null; statut: string; tier: string | null; contenu_id: string | null; motif: string | null }[];
  perfs: { contenu_id: string; tier: string; publies: number; restants: number; moyenne_vues: number | null; max_vues: number | null; chez_nous: ChezNous | null }[];
};
const e = await appelPod<Etat>({ action: "etat" });
if (!e.ok) throw new Error(e.error);
const comptes = Object.entries(e.comptes_du_label_par_langue).sort((a, b) => b[1] - a[1]);
const total = comptes.reduce((n, [, k]) => n + k, 0);
console.log(`Comptes du label : ${total} (${comptes.map(([l, n]) => `${l} ${n}`).join(" · ") || "aucun"})`);
const parStatut: Record<string, number> = {};
for (const l of e.livraisons) parStatut[l.statut] = (parStatut[l.statut] ?? 0) + 1;
console.log(`Livraisons : ${Object.entries(parStatut).map(([s, n]) => `${s} ${n}`).join(" · ") || "aucune"}`);
const perf = new Map(e.perfs.map((p) => [p.contenu_id, p]));
for (const l of e.livraisons) {
  const p = l.contenu_id ? perf.get(l.contenu_id) : undefined;
  const n = p?.chez_nous;
  const enLigne = p
    ? ` · rang ${p.tier} · ${p.publies} publié(s), ${p.restants} restant(s)` +
      (n ? ` · méd ${n.vues_mediane} vues · r ${n.r_median ?? "—"} (passages : ${n.r_passages.join(", ")})` : "")
    : "";
  console.log(`- ${l.source_id} ${l.statut}${l.tier ? ` rang ${l.tier}` : ""}${enLigne}${l.motif ? ` (${l.motif})` : ""} : ${l.titre ?? ""}`);
}
