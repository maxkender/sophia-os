// Minutage calé sur la voix off d'une langue : durée des scènes, déformation du temps de chaque scène,
// sous-titres. Tout se recalcule à partir du script et des voix horodatées de la langue (src/langues/<code>/).
import {createContext, useContext} from 'react';
import {warpAt, type Warp} from './lib';
import {LANGUES} from './langues';
import type {DonneesLangue, Voix} from './langues/types';

export const FPS = 30;
export const T = 12; // transition entre pages (images)
/** Transitions en déchirure (nouvelle vie) : index de la page qu'elles suivent */
export const NOUVELLE_VIE = new Set([0, 12, 20, 26, 31]);
export const VOICE_START = 6; // la voix démarre à 0,2 s
export const OUTRO_D = 275;
export const OUTRO_VOICE = 8; // la phrase de fin démarre 8 images après le début de la séquence Sophia


export type Mot = {texte: string; debut: number; fin: number; index: number};
export type SceneTiming = {id: string; from: number; d: number; warp: Warp; moment: number; plans: number[]};

/** Durée visée d'un plan (images) : une phrase est coupée en 1 à 3 plans, sur des débuts de mots */
export const PLAN_VISE = 62;
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
    // Pas d'accélération : le temps de la page est le temps réel ; l'instant fort tombe sur le mot repère
    const warp: Warp = [
      [0, 0],
      [d, d],
    ];
    const r = (s.reperes ?? [])[0];
    const moment = r ? Math.max(8, Math.round(vers(motDansScene(i, r.mot)[r.ou === 'fin' ? 'fin' : 'debut']) - from)) : Math.round(d * 0.4);
    // Plans : coupes sur le début d'un mot, au plus près de d·k/n
    const n = Math.max(1, Math.min(3, Math.round(d / PLAN_VISE)));
    const debuts = motsScene(i).map((m) => Math.round(vers(m.debut) - from));
    const plans = [0];
    for (let k = 1; k < n; k++) {
      const cible = (d * k) / n;
      const best = debuts.reduce((a, b) => (Math.abs(b - cible) < Math.abs(a - cible) ? b : a), debuts[0]);
      if (best > plans[plans.length - 1] + 30 && best < d - 30) plans.push(best);
    }
    return {id: s.id, from, d, warp, moment, plans};
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
