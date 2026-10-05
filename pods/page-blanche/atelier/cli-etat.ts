// Usage : POD_JETON=… node atelier/cli-etat.ts [--json]
// État du pod vu par l'OS (fonction Edge `pods`, action `etat`, lecture seule) :
// la file de validation, les contenus en ligne (rang, passages, vues) et les
// comptes qui portent le label du pod, par langue.

const URL_DEFAUT = "https://mbikecieskoobeizixig.supabase.co";
const jeton = process.env.POD_JETON;
if (!jeton) throw new Error("POD_JETON manquant");

const r = await fetch(`${process.env.SUPABASE_URL ?? URL_DEFAUT}/functions/v1/pods`, {
  method: "POST",
  headers: { "content-type": "application/json", "x-pod-jeton": jeton },
  body: JSON.stringify({ action: "etat", pod: "page_blanche" }),
});
const e = (await r.json()) as {
  ok: boolean;
  error?: string;
  comptes_du_label_par_langue: Record<string, number>;
  livraisons: { source_id: string; type: string; titre: string | null; statut: string; langues: string[]; tier: string | null; note_import: number | null; contenu_id: string | null; motif: string | null }[];
  perfs: { contenu_id: string; tier: string; publies: number; restants: number; moyenne_vues: number | null; max_vues: number | null }[];
};
if (!e.ok) throw new Error(e.error ?? `HTTP ${r.status}`);

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(e, null, 1));
} else {
  const comptes = Object.entries(e.comptes_du_label_par_langue);
  console.log(`Comptes du label : ${comptes.length ? comptes.map(([l, n]) => `${l} ${n}`).join(" · ") : "aucun"}`);
  const parStatut: Record<string, number> = {};
  for (const l of e.livraisons) parStatut[l.statut] = (parStatut[l.statut] ?? 0) + 1;
  console.log(`Livraisons : ${Object.entries(parStatut).map(([s, n]) => `${s} ${n}`).join(" · ") || "aucune"}`);
  const perf = new Map(e.perfs.map((p) => [p.contenu_id, p]));
  for (const l of e.livraisons) {
    const p = l.contenu_id ? perf.get(l.contenu_id) : undefined;
    const enLigne = p ? ` · rang ${p.tier} · ${p.publies} publié(s) · moy ${Math.round(p.moyenne_vues ?? 0)} vues · max ${p.max_vues ?? 0}` : "";
    console.log(`- ${l.source_id} [${l.type}] ${l.statut} (${l.langues.join(",")})${l.tier ? ` rang ${l.tier}` : ""}${enLigne}${l.motif ? ` — ${l.motif}` : ""}`);
  }
}
