// Usage : npm run sophia
//
// Les trois captures de Sophia (assets/sophia/ecran-1 à 3 : l'accueil « For
// you », une question de quiz, « Course complete! ») dans chaque langue du
// podz (demande d'Adrien du 15/11) : on recouvre chaque texte de l'interface
// par sa traduction, dans la police de l'appli (Plus Jakarta Sans, SIL OFL,
// polices/PlusJakartaSans-OFL.txt), à la même place. Sortie :
// assets/sophia/<langue>/ecran-<n>.jpg, que le rendu prend tout seul.
// À REGARDER après chaque changement (outil Read).

import { createCanvas, GlobalFonts, loadImage } from "@napi-rs/canvas";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { retirerMetadonnees } from "./metadonnees.ts";

const RACINE = join(import.meta.dirname, "..");
for (const g of [400, 500, 600, 700]) GlobalFonts.registerFromPath(join(RACINE, "polices", `PlusJakartaSans-${g}.woff2`), `PJ${g}`);

type Texte = {
  /** Le rectangle à effacer (x, y, largeur, hauteur) et sa couleur de fond. */
  efface: [number, number, number, number];
  fond?: string;
  /** Le texte, sa position (x ; base), sa graisse, sa taille, sa couleur, son alignement. */
  t: string;
  x: number;
  base: number;
  g: 400 | 500 | 600 | 700;
  taille: number;
  couleur: string;
  align?: "left" | "center";
  espace?: number;
  /** Une pastille arrondie redessinée à la taille du texte (« +10 XP earned ») : couleur, y, hauteur. */
  pilule?: { couleur: string; y: number; h: number };
  /** Largeur au plus : la taille baisse un peu au-delà. */
  max?: number;
};

const NOIR = "#16171c";
const GRIS = "#6f7279";
const BLEU = "#3462c6";

type Langue = "es" | "it" | "pt-BR";
const T: Record<Langue, Record<string, string | string[]>> = {
  es: { pourtoi: "Para ti", suivis: "Siguiendo", science: "Ciencia", titre: "¿Por qué soñamos?", desc: ["Pasas unos seis años de tu vida", "soñando. Y olvidas casi todo."], equipe: "El equipo de Sophia", onglets: ["Inicio", "Explorar", "Duelos", "Perfil"], entete: "CIENCIA · PREGUNTA 6 DE 8", question: ["¿Qué elemento, al acumularse", "en el núcleo de una estrella", "masiva, anuncia su colapso?"], reponses: ["Carbono", "Hidrógeno", "Helio", "Hierro"], fini: "¡Curso completado!", vers: "· 62 para LVL 5", gagne: "+10 XP ganados", aime: "Me gusta el curso", suivre: "Seguir a Muha…" },
  it: { pourtoi: "Per te", suivis: "Seguiti", science: "Scienza", titre: "Perché sogniamo?", desc: ["Passi circa sei anni della tua vita", "a sognare. E dimentichi quasi tutto."], equipe: "Il team di Sophia", onglets: ["Home", "Esplora", "Sfide", "Profilo"], entete: "SCIENZA · DOMANDA 6 DI 8", question: ["Quale elemento, accumulandosi", "nel nucleo di una stella massiccia,", "ne segnala il collasso?"], reponses: ["Carbonio", "Idrogeno", "Elio", "Ferro"], fini: "Corso completato!", vers: "· 62 al LVL 5", gagne: "+10 XP guadagnati", aime: "Mi piace il corso", suivre: "Segui Muhamm…" },
  "pt-BR": { pourtoi: "Pra você", suivis: "Seguindo", science: "Ciência", titre: "Por que sonhamos?", desc: ["Você passa uns seis anos da vida", "sonhando. E esquece quase tudo."], equipe: "A equipe Sophia", onglets: ["Início", "Explorar", "Duelos", "Perfil"], entete: "CIÊNCIA · PERGUNTA 6 DE 8", question: ["Qual elemento, ao se acumular", "no núcleo de uma estrela", "massiva, sinaliza seu colapso?"], reponses: ["Carbono", "Hidrogênio", "Hélio", "Ferro"], fini: "Curso concluído!", vers: "· 62 para o LVL 5", gagne: "+10 XP ganhos", aime: "Curtir o curso", suivre: "Seguir Muham…" },
};

function ecran1(l: Langue): Texte[] {
  const t = T[l];
  const o = t.onglets as string[];
  const d = t.desc as string[];
  return [
    { efface: [95, 188, 140, 38], t: t.pourtoi as string, x: 161, base: 216, g: 700, taille: 25, couleur: NOIR, align: "center" },
    { efface: [395, 188, 145, 38], t: t.suivis as string, x: 472, base: 216, g: 600, taille: 25, couleur: "#7c7f86", align: "center" },
    { efface: [96, 284, 86, 30], t: t.science as string, x: 99, base: 306, g: 700, taille: 19, couleur: NOIR },
    { efface: [96, 1227, 86, 30], t: t.science as string, x: 99, base: 1249, g: 700, taille: 19, couleur: NOIR },
    { efface: [60, 842, 500, 52], t: t.titre as string, x: 66, base: 880, g: 700, taille: 32, couleur: NOIR, max: 520 },
    { efface: [60, 898, 520, 40], t: d[0], x: 66, base: 928, g: 400, taille: 24, couleur: GRIS, max: 520 },
    { efface: [60, 937, 520, 40], t: d[1], x: 66, base: 965, g: 400, taille: 24, couleur: GRIS, max: 520 },
    { efface: [135, 1017, 240, 32], t: t.equipe as string, x: 139, base: 1040, g: 400, taille: 19, couleur: GRIS },
    ...o.map((m, i): Texte => ({ efface: [[30, 195, 358, 515][i], 1312, 100, 30], t: m, x: [80, 241, 403, 564][i], base: 1334, g: 500, taille: 18, couleur: i === 0 ? BLEU : "#61666b", align: "center" })),
  ];
}
function ecran2(l: Langue): Texte[] {
  const t = T[l];
  const q = t.question as string[];
  const r = t.reponses as string[];
  return [
    { efface: [186, 218, 330, 32], t: t.entete as string, x: 190, base: 242, g: 700, taille: 19, couleur: BLEU, espace: 0.8, max: 420 },
    ...q.map((m, i): Texte => ({ efface: [20, 268 + i * 55, 605, 54], t: m, x: 322, base: 309 + i * 55, g: 400, taille: 35, couleur: "#1c1d22", align: "center", max: 570 })),
    ...r.map((m, i): Texte => ({ efface: [60, 500 + i * 106, 300, 34], t: m, x: 66, base: 524 + i * 106, g: 600, taille: 22, couleur: NOIR })),
  ];
}
function ecran3(l: Langue): Texte[] {
  const t = T[l];
  return [
    { efface: [40, 630, 565, 60], t: t.fini as string, x: 322, base: 674, g: 600, taille: 42, couleur: NOIR, align: "center", max: 540 },
    { efface: [138, 754, 200, 36], t: t.science as string, x: 143, base: 780, g: 600, taille: 25, couleur: NOIR },
    { efface: [137, 816, 300, 34], t: t.vers as string, x: 140, base: 841, g: 400, taille: 22, couleur: GRIS },
    { efface: [62, 890, 300, 52], pilule: { couleur: "#fcf2ce", y: 894, h: 44 }, t: t.gagne as string, x: 86, base: 925, g: 700, taille: 20, couleur: "#5a4610" },
    { efface: [104, 1018, 200, 40], t: t.aime as string, x: 108, base: 1046, g: 600, taille: 22, couleur: NOIR, max: 196 },
    { efface: [402, 1018, 196, 40], t: t.suivre as string, x: 407, base: 1045, g: 600, taille: 19, couleur: NOIR, max: 185 },
  ];
}

const ECRANS = [ecran1, ecran2, ecran3];
for (const l of Object.keys(T) as Langue[]) {
  const dossier = join(RACINE, "assets", "sophia", l);
  mkdirSync(dossier, { recursive: true });
  for (const [i, f] of ECRANS.entries()) {
    const img = await loadImage(join(RACINE, "assets", "sophia", `ecran-${i + 1}.jpg`));
    const c = createCanvas(img.width, img.height);
    const g = c.getContext("2d");
    g.drawImage(img, 0, 0);
    for (const x of f(l)) {
      g.fillStyle = x.fond ?? "#ffffff";
      g.fillRect(...x.efface);
      let s = x.taille;
      const police = () => `${s}px PJ${x.g}`;
      g.font = police();
      g.letterSpacing = `${x.espace ?? -0.01 * s}px`;
      while (x.max && g.measureText(x.t).width > x.max && s > x.taille * 0.8) {
        s -= 1;
        g.font = police();
      }
      if (x.pilule) {
        g.fillStyle = x.pilule.couleur;
        g.beginPath();
        g.roundRect(x.x - 20, x.pilule.y, g.measureText(x.t).width + 40, x.pilule.h, x.pilule.h / 2);
        g.fill();
      }
      g.fillStyle = x.couleur;
      g.textAlign = x.align ?? "left";
      g.fillText(x.t, x.x, x.base);
      g.letterSpacing = "0px";
    }
    writeFileSync(join(dossier, `ecran-${i + 1}.jpg`), retirerMetadonnees(c.toBuffer("image/jpeg", 92)));
  }
  console.log(`assets/sophia/${l}/ : 3 captures`);
}
