// Usage : npm run mesure -- <id>
// Mesure, sans rien rendre, chaque texte de posts/<id>.json dans chaque langue :
// les lignes de la description (6 au plus), la largeur du nom, les lignes de
// chaque bulle et du titre de couverture. Signale ce qui ne tiendra pas, pour
// écrire les traductions avant de rendre les planches.
import { createCanvas } from "@napi-rs/canvas";
import { policeMain, policeTitre, POLICE } from "./polices.ts";
import { lirePost, type Slide } from "./slides.ts";

const id = process.argv[2];
if (!id) throw new Error("usage : npm run mesure -- <id>");
const post = lirePost(id);
const ctx = createCanvas(10, 10).getContext("2d");
function couper(t: string, largeur: number): string[] {
  const lignes: string[] = [];
  for (const para of t.split("\n")) {
    let ligne = "";
    for (const mot of para.split(/[ \t]+/).filter(Boolean)) {
      const essai = ligne ? `${ligne} ${mot}` : mot;
      if (ligne && ctx.measureText(essai).width > largeur) {
        lignes.push(ligne);
        ligne = mot;
      } else ligne = essai;
    }
    if (ligne) lignes.push(ligne);
  }
  return lignes;
}
let ko = 0;
for (const langue of Object.keys(post.titre)) {
  const notes: string[] = [];
  for (const [i, s] of post.slides.entries()) {
    const c = s[langue] as Record<string, string> | undefined;
    if (!c) { notes.push(`#${i + 1} sans texte`); ko++; continue; }
    const bulles = (s.elements ?? []).filter((e) => e.type === "bulle") as Extract<NonNullable<Slide["elements"]>[number], { type: "bulle" }>[];
    for (const b of bulles) {
      ctx.font = `${langue === "en" ? 46 : 42}px "${policeMain(langue)}"`;
      ctx.letterSpacing = "1px";
      const n = c.bulle ? couper(c.bulle, b.l * 0.66).length : 0;
      const ok = c.bulle && (n - 1) * 44 + 46 <= b.h * 0.75 && n <= 5;
      if (!ok) { ko++; notes.push(`#${i + 1} bulle ${n} l. (max ${Math.floor((b.h * 0.75 - 46) / 44) + 1})`); }
    }
    if (s.type === "couverture") {
      const k = s.carte ?? { l: 600 };
      ctx.letterSpacing = "-2px";
      ctx.font = `92px "${policeTitre(langue)}"`;
      ctx.letterSpacing = "-2px";
      ctx.font = `92px "${policeTitre(langue)}"`;
      const libre = s.titre_largeur ?? k.l - 70;
      const large = Math.max(...c.titre.split("\n").map((l) => ctx.measureText(l).width));
      const taille = Math.max(72, Math.min(92, Math.floor((92 * libre) / large)));
      if (taille < 92) notes.push(`(titre réduit à ${taille} px)`);
      ctx.font = `${taille}px "${policeTitre(langue)}"`;
      const t = couper(c.titre, k.l - 70);
      ctx.letterSpacing = "1.5px";
      ctx.font = `52px "${policeMain(langue)}"`;
      const so = c.sous ? couper(c.sous, k.l - 120) : [];
      const tropLarge = c.titre.split("\n").some((l) => { ctx.letterSpacing = "-2px"; ctx.font = `${taille}px "${policeTitre(langue)}"`; return ctx.measureText(l).width > libre + 1; });
      if (t.length > 4 || so.length > 3 || tropLarge) { ko++; notes.push(`#1 titre ${t.length} l.${tropLarge ? " (une ligne trop large)" : ""}, sous-titre ${so.length} l.`); }
    } else {
      ctx.letterSpacing = "0px";
      ctx.font = `50px "${POLICE.texte}"`;
      const n = couper(c.texte, 610).length;
      const max = s.max_lignes ?? 6;
      if (n > max) { ko++; notes.push(`#${i + 1} ${c.nom} : ${n} lignes`); }
    }
  }
  console.log(`${langue.padEnd(6)} ${notes.length ? notes.join(" · ") : "ok"}`);
}
if (ko) process.exitCode = 1;
