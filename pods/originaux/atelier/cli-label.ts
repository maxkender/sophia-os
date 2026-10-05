// Usage : POD_JETON=… node atelier/cli-label.ts [--compte mentoridaily] [--top 20] [--texte]
//
// Contenus du label weird_alpha, classés par ce qui marche chez nous :
// r = vues / médiane des vues du compte (médiane des r sur ≥ 3 passages).
// Écrit tout dans donnees/label.json ; affiche le top (avec le texte : --texte).
import { mkdirSync, writeFileSync } from "node:fs";
import { appelPod } from "./api.ts";

type Contenu = {
  id: string;
  compte_source: string | null;
  source_url: string | null;
  vues_source: number | null;
  tier: string;
  pod: string | null;
  musique: { titre: string; url: string | null } | null;
  chez_nous: { publies: number; vues_mediane: number; vues_moyenne: number; vues_max: number; r_median: number | null } | null;
  slides: { position: number; texte: string; media_id: string | null }[];
};

const args = process.argv.slice(2);
const opt = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const compte = opt("--compte");
const top = Number(opt("--top") ?? 20);

const r = await appelPod<{ total: number; contenus: Contenu[] }>({ action: "label", limite: 1000 });
if (!r.ok) throw new Error(r.error);
mkdirSync("donnees", { recursive: true });
writeFileSync("donnees/label.json", JSON.stringify(r.contenus, null, 1));

const liste = r.contenus.filter((c) => !compte || c.compte_source === compte).filter((c) => c.chez_nous?.r_median != null);
console.log(`${r.total} contenus dans le label${compte ? `, ${liste.length} mesurés de @${compte}` : ""} (donnees/label.json)\n`);
for (const [i, c] of liste.slice(0, top).entries()) {
  const n = c.chez_nous!;
  console.log(
    `${String(i + 1).padStart(2)}. ${c.id.slice(0, 8)} r ${n.r_median} · ${n.publies} pass. · méd ${n.vues_mediane} · max ${n.vues_max} · rang ${c.tier} · @${c.compte_source} · ${c.musique?.titre ?? "-"}`,
  );
  console.log(`    ${c.slides[0]?.texte.replace(/\n/g, " ")}`);
  if (args.includes("--texte")) for (const s of c.slides.slice(1)) console.log(`      ${s.position}. ${s.texte.replace(/\n+/g, " / ")}`);
}
