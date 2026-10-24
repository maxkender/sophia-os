// Usage : node atelier/cli-playbook.ts [--mesurer]
// Le playbook (playbook.json) : schémas d'accroche gagnants et leurs preuves.
// Un schéma n'est ACTIF que s'il a encore une preuve valable aujourd'hui :
// un post de la niche à 200 k vues ou plus publié il y a 30 jours au plus, ou
// un contenu du label relevé à r ≥ 2 (l'OS le recalcule au dépôt).
// Affiche pour chacun son statut (actif, en attente de 3 passages mûrs, expiré)
// et la date où sa dernière preuve TikTok expire.
// --mesurer (POD_JETON) : remet à jour le r et les passages de chaque preuve
// « os » avec les chiffres de l'OS (action label), puis réécrit playbook.json.
import { readFileSync, writeFileSync } from "node:fs";
import { appelPod, aujourdhui, jours, osSuffit, PREUVE_JOURS_MAX, tiktokSuffit, type Playbook } from "./api.ts";

const p = JSON.parse(readFileSync("playbook.json", "utf8")) as Playbook;
const jour = aujourdhui();
if (process.argv.includes("--mesurer")) {
  const r = await appelPod<{ contenus: { id: string; chez_nous: { publies: number; r_median: number | null } | null }[] }>({
    action: "label",
    limite: 1000,
  });
  if (!r.ok) throw new Error(r.error);
  const mesures = new Map(r.contenus.map((c) => [c.id, c.chez_nous]));
  let n = 0;
  for (const preuves of [...p.schemas.map((s) => s.preuves), ...p.a_eviter.map((a) => a.preuves)]) {
    for (const ref of preuves) {
      if (ref.type !== "os") continue;
      const m = mesures.get(ref.contenu_id);
      if (!m) {
        console.log(`  ${ref.contenu_id.slice(0, 8)} : plus dans le label (ou plus valide), à retirer`);
        continue;
      }
      ref.r_median = m.r_median;
      ref.publies = m.publies;
      ref.releve_le = jour;
      n++;
    }
  }
  p.maj_le = jour;
  writeFileSync("playbook.json", `${JSON.stringify(p, null, 2)}\n`);
  console.log(`${n} preuve(s) « os » remesurée(s), playbook.json réécrit\n`);
}
console.log(`Playbook mis à jour le ${p.maj_le} (${jours(p.maj_le, jour)} j)\n`);
const fmt = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} M` : `${Math.round(n / 1e3)} k`);
for (const s of p.schemas) {
  const tiktok = s.preuves.filter((r) => tiktokSuffit(r, jour));
  const os = s.preuves.filter(osSuffit);
  const expire = tiktok
    .map((r) => (r.type === "tiktok" ? r.publie_le : ""))
    .sort()
    .pop();
  const fin = expire ? new Date(Date.parse(`${expire}T00:00:00Z`) + PREUVE_JOURS_MAX * 86_400_000).toISOString().slice(0, 10) : null;
  // Un contenu du label sans r (moins de 3 passages mûrs) peut encore devenir la preuve.
  const enAttente = s.preuves.some((r) => r.type === "os" && r.r_median == null);
  // Mesuré sous r 2 : le schéma marche un peu chez nous, sans preuve suffisante.
  const rMax = Math.max(...s.preuves.map((r) => (r.type === "os" ? r.r_median ?? 0 : 0)));
  const statut = tiktok.length || os.length
    ? "ACTIF"
    : enAttente
    ? "EN ATTENTE (r pas encore mesurable)"
    : rMax > 0
    ? `PAS PROUVÉ (r ${rMax} chez nous, il faut 2 ; ou un post de la niche à 200 k)`
    : "EXPIRÉ (refaire la veille)";
  console.log(`[${statut}] ${s.id} : ${s.schema}`);
  for (const r of tiktok) if (r.type === "tiktok") console.log(`    tiktok ${fmt(r.vues)} vues le ${r.publie_le} ${r.url}`);
  for (const r of os) if (r.type === "os") console.log(`    os     r ${r.r_median} (${r.publies ?? "?"} passages) contenu ${r.contenu_id.slice(0, 8)}`);
  if (fin) console.log(`    preuve TikTok valable jusqu'au ${fin}${os.length ? " (puis par le r chez nous)" : ""}`);
}
console.log(`\nÀ éviter : ${p.a_eviter.map((a) => a.schema).join(" · ")}`);
