// Usage : POD_JETON=… node atelier/cli-top-posts.ts [--compte mentoridaily] [--top 20]
//
// Nos posts PUBLIÉS les plus vus du label, tels que postés (traduits, AVEC la
// slide Sophia) : c'est ce qui a vraiment marché chez nous. Écrit tout dans
// donnees/top_posts.json (slides, images, slides TikTok d'origine par position).
import { mkdirSync, writeFileSync } from "node:fs";
import { appelPod } from "./api.ts";

type Post = {
  vues: number;
  langue: string | null;
  contenu_id: string;
  compte_source: string | null;
  slides: { position: number; texte_overlay: string; position_sophia: boolean; media_id: string | null }[];
  references: { position: number; media_id: string | null; reference_url: string | null }[];
};
const args = process.argv.slice(2);
const opt = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const r = await appelPod<{ posts: Post[] }>({ action: "top_posts", compte: opt("--compte") ?? null, limite: Number(opt("--top") ?? 20) });
if (!r.ok) throw new Error(r.error);
mkdirSync("donnees", { recursive: true });
writeFileSync("donnees/top_posts.json", JSON.stringify(r.posts, null, 1));
for (const [i, p] of r.posts.entries()) {
  const sophia = p.slides.find((s) => s.position_sophia);
  console.log(`${String(i + 1).padStart(2)}. ${p.vues} vues · ${p.langue} · contenu ${p.contenu_id.slice(0, 8)} · @${p.compte_source}`);
  console.log(`    accroche : ${p.slides[0]?.texte_overlay.replace(/\n/g, " ")}`);
  console.log(`    sophia #${sophia?.position} : ${sophia?.texte_overlay.replace(/\n+/g, " / ")}`);
}
console.log("\n(détail complet : donnees/top_posts.json)");
