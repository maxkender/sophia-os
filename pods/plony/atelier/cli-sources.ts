// Usage : node atelier/cli-sources.ts [--top 20] [--cherche "mot"] [--planche <contenu_id8>]
//
// Les posts de @_plony_ importés par l'OS (sources/banque.json, écrit à la fin
// de l'import le 13/11) : ses vues, sa phrase (en espagnol, pour l'idée,
// jamais à recopier) et, slide par slide, l'image propre (media_id, sans son
// texte) et la slide d'origine (reference_url, avec son texte : elle montre au
// poster où poser le texte). Ses contenus sont rejetés dans l'OS : ils ne
// sont jamais diffusés, seules leurs images servent.
//   --top 20             les plus vus d'abord
//   --cherche "amor"     ceux dont la phrase contient chaque mot
//   --planche <id8>      la planche d'un post : images propres puis slides d'origine
import { existsSync, readFileSync } from "node:fs";
import { planche } from "./planche.ts";

type Slide = { position: number; media_id: string | null; propre_url: string | null; reference_url: string | null; texte: string | null; texte_restant: boolean | null };
type Post = { contenu_id: string; source_url: string; vues: number | null; slides: Slide[] };
type Banque = { compte: string; releve_le: string; posts: Post[] };

if (!existsSync("sources/banque.json")) throw new Error("sources/banque.json absent : l'import de @_plony_ n'est pas encore exporté");
const banque = JSON.parse(readFileSync("sources/banque.json", "utf8")) as Banque;
const args = process.argv.slice(2);
const opt = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const phrase = (p: Post) => p.slides.map((s) => (s.texte ?? "").replace(/\s+/g, " ").trim()).filter(Boolean).join(" / ");

const cible = opt("--planche");
if (cible) {
  const p = banque.posts.find((x) => x.contenu_id.startsWith(cible));
  if (!p) throw new Error(`aucun post ${cible}`);
  const propres = p.slides.filter((s) => s.media_id && s.propre_url).map((s) => ({
    id: s.media_id!,
    url: s.propre_url!,
    legende: `${s.media_id!.slice(0, 8)}${s.texte_restant ? " · TEXTE RESTANT" : ""}`,
  }));
  const origines = p.slides.filter((s) => s.reference_url).map((s) => ({ id: `ref-${p.contenu_id.slice(0, 8)}-${s.position}`, url: s.reference_url!, legende: `origine #${s.position}` }));
  const sortie = `sortie/sources/${p.contenu_id.slice(0, 8)}.jpg`;
  await planche([...propres, ...origines], sortie, Math.max(propres.length, 1), 240);
  console.log(`${sortie} · « ${phrase(p)} »`);
} else {
  const mots = (opt("--cherche") ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  const liste = banque.posts
    .filter((p) => mots.every((m) => phrase(p).toLowerCase().includes(m)))
    .sort((a, b) => (b.vues ?? 0) - (a.vues ?? 0))
    .slice(0, Number(opt("--top") ?? 20));
  console.log(`@${banque.compte} · ${banque.posts.length} posts relevés le ${banque.releve_le}`);
  for (const p of liste) {
    const k = p.vues == null ? "—" : `${Math.round(p.vues / 1000)} k`;
    const images = p.slides.map((s) => (s.media_id ? `${s.media_id.slice(0, 8)}${s.texte_restant ? "*" : ""}` : "—")).join(" ");
    console.log(`${p.contenu_id.slice(0, 8)} · ${k.padStart(6)} · ${images} · « ${phrase(p)} »`);
  }
  console.log("(* = texte restant : image écartée de la banque)");
}
