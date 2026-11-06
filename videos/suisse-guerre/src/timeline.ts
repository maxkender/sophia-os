// Minutage calé sur la voix off : durée des scènes, déformation du temps de chaque scène,
// sous-titres et bruitages. Tout se recalcule à partir de script.json + voix-*.json.
import script from './script.json';
import voixRecit from './voix-recit.json';
import voixOutro from './voix-outro.json';
import {warpAt, type Warp} from './lib';

export const FPS = 30;
export const T = 10; // transition entre scènes (images)
export const VOICE_START = 6; // la voix démarre à 0,2 s
export const OUTRO_D = 275;
export const OUTRO_VOICE = 8; // la phrase de fin démarre 8 images après le début de la séquence Sophia

type Voix = {texte: string; caracteres: string[]; debuts: number[]; fins: number[]};
export type Mot = {texte: string; debut: number; fin: number; index: number};

const mots = (v: Voix): Mot[] => {
  const out: Mot[] = [];
  const t = v.texte;
  let i = 0;
  while (i < t.length) {
    if (/\s/.test(t[i])) {
      i++;
      continue;
    }
    let j = i;
    while (j < t.length && !/\s/.test(t[j])) j++;
    out.push({texte: t.slice(i, j), debut: v.debuts[i], fin: v.fins[j - 1], index: i});
    i = j;
  }
  return out;
};

const MOTS_RECIT = mots(voixRecit as Voix);
const MOTS_OUTRO = mots(voixOutro as Voix);

// Plage de caractères de chaque scène dans le texte du récit
const plages: [number, number][] = [];
{
  let off = 0;
  for (const s of script.scenes) {
    const a = voixRecit.texte.indexOf(s.texte, off);
    plages.push([a, a + s.texte.length]);
    off = a + s.texte.length;
  }
}
const motsScene = (i: number) => MOTS_RECIT.filter((m) => m.index >= plages[i][0] && m.index < plages[i][1]);
const motDansScene = (i: number, mot: string) => {
  const m = motsScene(i).find((w) => w.texte === mot);
  if (!m) throw new Error(`Repère introuvable : « ${mot} » dans ${script.scenes[i].id}`);
  return m;
};
const vers = (s: number) => s * FPS + VOICE_START; // seconde de voix → image globale

// Durée de chaque scène dans sa conception d'origine (images « scène »)
const BASE = [94, 128, 128, 158, 188, 128, 124];
// Repères : [mot, image de la scène qui doit tomber dessus]
const REPERES: [string, number][][] = [
  [['Why?', 70]],
  [],
  [['neutrality.', 80]],
  [['rifle', 106]],
  [
    ['explosives.', 98],
    ['Invade,', 122],
  ],
  [
    ['diplomacy,', 46],
    ['Geneva.', 82],
  ],
  [
    ['Leaving', 46],
    ['more.', 78],
  ],
];

// Coupes : un poil avant le premier mot de chaque scène ; la fin Sophia après le dernier mot
const coupes: number[] = [0];
for (let i = 1; i < script.scenes.length; i++) coupes.push(Math.round(vers(motsScene(i)[0].debut) - 4));
coupes.push(Math.round(vers(MOTS_RECIT[MOTS_RECIT.length - 1].fin) + 18));

const inverse = (pts: Warp, s: number) =>
  warpAt(
    pts.map(([a, b]) => [b, a]),
    s,
  );

export type SceneTiming = {id: string; from: number; d: number; warp: Warp};

export const SCENES_T: SceneTiming[] = script.scenes.map((s, i) => {
  const from = i === 0 ? 0 : coupes[i] - T / 2;
  const d = i === 0 ? coupes[1] + T / 2 : coupes[i + 1] - coupes[i] + T;
  const reps = REPERES[i];
  let warp: Warp;
  if (reps.length === 0) {
    warp = [
      [0, 0],
      [d, BASE[i]],
    ];
  } else {
    warp = [[0, 0], ...reps.map(([m, sf]): [number, number] => [vers(motDansScene(i, m).debut) - from, sf])];
    const [rl, sl] = warp[warp.length - 1];
    warp.push([Math.max(d, rl + 1), sl + Math.max(d, rl + 1) - rl]);
  }
  return {id: s.id, from, d, warp};
});

export const OUTRO_FROM = coupes[coupes.length - 1] - T / 2;
export const TOTAL = OUTRO_FROM + OUTRO_D;

/** Image globale d'un événement d'une scène (image « scène ») */
export const globalDe = (scene: number, s: number) => {
  const st = SCENES_T[scene];
  return Math.round(st.from + inverse(st.warp, s));
};

// ---------- Sous-titres (pages de 1 à 3 mots, coupées sur la ponctuation) ----------
export type MotSousTitre = {texte: string; de: number; a: number};
export type Page = {mots: MotSousTitre[]; de: number; a: number; zone: 'recit' | 'outro'};

const paginer = (ms: Mot[], decalage: number, zone: Page['zone']): Page[] => {
  const pages: Page[] = [];
  let cur: MotSousTitre[] = [];
  const pousser = () => {
    if (cur.length) pages.push({mots: cur, de: cur[0].de, a: cur[cur.length - 1].a, zone});
    cur = [];
  };
  ms.forEach((m, k) => {
    const de = Math.round(m.debut * FPS + decalage);
    const a = Math.round(m.fin * FPS + decalage);
    const prec = ms[k - 1];
    if (cur.length && (cur.length >= 3 || (prec && m.debut - prec.fin > 0.35))) pousser();
    cur.push({texte: m.texte, de, a});
    if (/[.?!:,…—]$/.test(m.texte)) pousser();
  });
  pousser();
  // chaque page reste affichée jusqu'à la suivante (max 0,5 s de blanc)
  for (let k = 0; k < pages.length; k++) {
    const suiv = pages[k + 1];
    pages[k].a = suiv && suiv.zone === pages[k].zone ? Math.min(suiv.de, pages[k].a + 15) : pages[k].a + 15;
  }
  return pages;
};

export const PAGES: Page[] = [
  ...paginer(MOTS_RECIT, VOICE_START, 'recit'),
  ...paginer(MOTS_OUTRO, OUTRO_FROM + OUTRO_VOICE, 'outro'),
];

/** La voix parle-t-elle à cette image ? (pour baisser les bruitages dessous) */
export const parle = (f: number) =>
  MOTS_RECIT.some((m) => f >= vers(m.debut) - 2 && f <= vers(m.fin) + 2) ||
  MOTS_OUTRO.some((m) => f >= (m.debut * FPS + OUTRO_FROM + OUTRO_VOICE) - 2 && f <= m.fin * FPS + OUTRO_FROM + OUTRO_VOICE + 2);
