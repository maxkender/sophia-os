// Usage : POD_JETON=… node atelier/cli-etat.ts
// File de validation du pod : livraisons vidéo et leur statut.
import { appelPod } from "./api.ts";

type Etat = {
  livraisons: { source_id: string; type: string; titre: string | null; statut: string; motif: string | null; decks: Record<string, { langue: string }> | null }[];
};
const e = await appelPod<Etat>({ action: "etat" });
if (!e.ok) throw new Error(e.error);
const parStatut: Record<string, number> = {};
for (const l of e.livraisons) parStatut[l.statut] = (parStatut[l.statut] ?? 0) + 1;
console.log(`Livraisons : ${Object.entries(parStatut).map(([s, n]) => `${s} ${n}`).join(" · ") || "aucune"}`);
for (const l of e.livraisons) {
  const langues = Object.values(l.decks ?? {}).map((d) => d.langue);
  console.log(`- ${l.source_id} ${l.statut} · ${langues.length} compte(s) [${[...new Set(langues)].join(", ")}]${l.motif ? ` (${l.motif})` : ""} : ${l.titre ?? ""}`);
}
