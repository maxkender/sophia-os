// Usage : POD_JETON=… node atelier/cli-suivi.ts
// Suivi à J+3 des originaux validés : le r de leurs premiers passages mûrs
// (vues / médiane du compte, relevé par l'OS vers J+2).
//   - au moins 2 passages mûrs, tous sous r 0,6  → PROPOSER LA COUPE à l'humain
//   - r médian ≥ 2 (3 passages au moins)          → DÉCLINER : 2 ou 3 variantes, même schéma
//   - sinon                                         → à suivre
// Et le bilan contre l'objectif : r médian ≥ 1,5 et ≥ 15 % des passages à 10 k vues.
import { appelPod } from "./api.ts";

type ChezNous = { publies: number; vues_mediane: number; r_median: number | null; r_passages: number[]; vues_passages: number[] };
type Etat = {
  livraisons: { source_id: string; titre: string | null; statut: string; contenu_id: string | null }[];
  perfs: { contenu_id: string; tier: string; restants: number; chez_nous: ChezNous | null }[];
};
const e = await appelPod<Etat>({ action: "etat" });
if (!e.ok) throw new Error(e.error);
const perf = new Map(e.perfs.map((p) => [p.contenu_id, p]));
const tousR: number[] = [];
const toutesVues: number[] = [];
const mediane = (v: number[]) => {
  const t = [...v].sort((a, b) => a - b);
  return t.length ? (t.length % 2 ? t[(t.length - 1) / 2] : (t[t.length / 2 - 1] + t[t.length / 2]) / 2) : null;
};
for (const l of e.livraisons.filter((x) => x.statut === "validee" && x.contenu_id)) {
  const p = perf.get(l.contenu_id!);
  const n = p?.chez_nous;
  let verdict = "en attente : aucun passage mûr";
  if (n?.r_passages.length) {
    tousR.push(...n.r_passages);
    toutesVues.push(...n.vues_passages);
    if (n.r_passages.length >= 2 && n.r_passages.every((r) => r < 0.6)) verdict = "PROPOSER LA COUPE (tous les passages sous r 0,6)";
    else if ((n.r_median ?? 0) >= 2) verdict = "DÉCLINER : écrire 2 ou 3 variantes sur le même schéma";
    else verdict = "à suivre";
  }
  console.log(`- ${l.source_id} · rang ${p?.tier ?? "?"} · ${p?.restants ?? "?"} restant(s) · r ${n?.r_median ?? "—"} [${n?.r_passages.join(", ") ?? ""}] → ${verdict}`);
  console.log(`    ${l.titre ?? ""}`);
}
if (tousR.length) {
  const part10k = Math.round((100 * toutesVues.filter((v) => v >= 10_000).length) / toutesVues.length);
  console.log(
    `\nOriginaux : ${tousR.length} passages mûrs · r médian ${mediane(tousR)?.toFixed(2)} (objectif ≥ 1,5) · ${part10k} % à 10 k vues ou plus (objectif ≥ 15 %)` +
      (tousR.length < 30 ? " · moins de 30 passages : c'est une piste, pas une preuve" : ""),
  );
} else console.log("\nAucun passage mûr pour l'instant (les vues sont relevées vers J+2).");
