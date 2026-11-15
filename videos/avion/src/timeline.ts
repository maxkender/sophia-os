// Minutage calé sur la voix off d'une langue : durée des scènes, déformation du temps de chaque scène,
// sous-titres. Tout se recalcule à partir du script et des voix horodatées de la langue (src/langues/<code>/).
import {createContext, useContext} from 'react';
import {warpAt, type Warp} from './lib';
import {LANGUES} from './langues';
import type {DonneesLangue, Voix} from './langues/types';

export const FPS = 30;
export const T = 10; // transition entre scènes (images)
export const VOICE_START = 6; // la voix démarre à 0,2 s
export const OUTRO_D = 275;
export const OUTRO_VOICE = 8; // la phrase de fin démarre 8 images après le début de la séquence Sophia

// Durée de chaque scène dans sa conception d'origine (images « scène »)
const BASE = [149, 172, 143, 147, 110, 195, 158, 215, 267];

export type Mot = {texte: string; debut: number; fin: number; index: number};
export type SceneTiming = {id: string; from: number; d: number; warp: Warp};
export type MotSousTitre = {texte: string; de: number; a: number};
export type Page = {mots: MotSousTitre[]; de: number; a: number; zone: 'recit' | 'outro'};

export type Timeline = {
  langue: DonneesLangue;
  scenes: SceneTiming[];
  outroFrom: number;
  total: number;
  pages: Page[];
  /** Image globale d'un événement d'une scène (image « scène ») */
  globalDe: (scene: number, s: number) => number;
  /** La voix parle-t-elle à cette image ? (pour baisser les bruitages dessous) */
  parle: (f: number) => boolean;
};

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

const inverse = (pts: Warp, s: number) =>
  warpAt(
    pts.map(([a, b]) => [b, a]),
    s,
  );

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

export const construireTimeline = (langue: DonneesLangue): Timeline => {
  const {script, recit, outro} = langue;
  const motsRecit = mots(recit);
  const motsOutro = mots(outro);

  // Plage de caractères de chaque scène dans le texte du récit
  const plages: [number, number][] = [];
  let off = 0;
  for (const s of script.scenes) {
    const a = recit.texte.indexOf(s.texte, off);
    if (a < 0) throw new Error(`${langue.code} : le texte de ${s.id} ne correspond pas à la voix (relancer la voix)`);
    plages.push([a, a + s.texte.length]);
    off = a + s.texte.length;
  }
  const motsScene = (i: number) => motsRecit.filter((m) => m.index >= plages[i][0] && m.index < plages[i][1]);
  const motDansScene = (i: number, mot: string) => {
    const m = motsScene(i).find((w) => w.texte === mot);
    if (!m) throw new Error(`${langue.code} : repère introuvable « ${mot} » dans ${script.scenes[i].id}`);
    return m;
  };
  const vers = (s: number) => s * FPS + VOICE_START; // seconde de voix → image globale

  // Coupes : un poil avant le premier mot de chaque scène ; la fin Sophia après le dernier mot
  const coupes: number[] = [0];
  for (let i = 1; i < script.scenes.length; i++) coupes.push(Math.round(vers(motsScene(i)[0].debut) - 4));
  coupes.push(Math.round(vers(motsRecit[motsRecit.length - 1].fin) + 18));

  const scenes: SceneTiming[] = script.scenes.map((s, i) => {
    const from = i === 0 ? 0 : coupes[i] - T / 2;
    const d = i === 0 ? coupes[1] + T / 2 : coupes[i + 1] - coupes[i] + T;
    const reps = s.reperes ?? [];
    let warp: Warp;
    if (reps.length === 0) {
      warp = [
        [0, 0],
        [d, BASE[i]],
      ];
    } else {
      warp = [[0, 0], ...reps.map((r): [number, number] => [vers(motDansScene(i, r.mot)[r.ou === 'fin' ? 'fin' : 'debut']) - from, r.image])];
      const [rl, sl] = warp[warp.length - 1];
      warp.push([Math.max(d, rl + 1), sl + Math.max(d, rl + 1) - rl]);
    }
    return {id: s.id, from, d, warp};
  });

  const outroFrom = coupes[coupes.length - 1] - T / 2;
  const outroVoix = outroFrom + OUTRO_VOICE;
  return {
    langue,
    scenes,
    outroFrom,
    total: outroFrom + OUTRO_D,
    pages: [...paginer(motsRecit, VOICE_START, 'recit'), ...paginer(motsOutro, outroVoix, 'outro')],
    globalDe: (scene, sf) => Math.round(scenes[scene].from + inverse(scenes[scene].warp, sf)),
    parle: (f) =>
      motsRecit.some((m) => f >= vers(m.debut) - 2 && f <= vers(m.fin) + 2) ||
      motsOutro.some((m) => f >= m.debut * FPS + outroVoix - 2 && f <= m.fin * FPS + outroVoix + 2),
  };
};

const cache = new Map<string, Timeline>();
export const timelineDe = (code: string): Timeline => {
  const donnees = LANGUES[code] ?? LANGUES.en;
  if (!donnees) throw new Error(`Langue inconnue : ${code}`);
  if (!cache.has(donnees.code)) cache.set(donnees.code, construireTimeline(donnees));
  return cache.get(donnees.code)!;
};

/** La langue de la vidéo en cours de rendu (anglais par défaut, pour les scènes vues seules) */
export const TimelineContext = createContext<Timeline | null>(null);
export const useTimeline = (): Timeline => useContext(TimelineContext) ?? timelineDe('en');
