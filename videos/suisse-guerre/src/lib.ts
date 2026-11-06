import {createContext, useContext} from 'react';
import {Easing, interpolate, random, spring, useCurrentFrame} from 'remotion';
import {noise2D} from '@remotion/noise';

export const W = 1080;
export const H = 1920;
export const FPS = 30;

/** Le récit est ralenti d'un poil : 30 s → 36 s. Chaque scène lit son temps avec useFrame(). */
export const STRETCH = 1.2;

/** Déformation du temps d'une scène : points (image réelle locale, image « scène »), calés sur la voix */
export type Warp = [number, number][];
export const warpAt = (pts: Warp, r: number) => {
  for (let k = 1; k < pts.length; k++) {
    if (r <= pts[k][0] || k === pts.length - 1) {
      const [r0, s0] = pts[k - 1];
      const [r1, s1] = pts[k];
      return s0 + ((r - r0) * (s1 - s0)) / (r1 - r0);
    }
  }
  return r;
};
export const WarpContext = createContext<Warp | null>(null);
export const useFrame = () => {
  const f = useCurrentFrame();
  const w = useContext(WarpContext);
  return w ? warpAt(w, f) : f / STRETCH;
};

/** Force globale des tremblements de caméra (1 = version d'origine) */
export const SHAKE_K = 0.35;

// Palette papier
export const C = {
  kraft: '#E9DCC3',
  kraftDark: '#D9C7A4',
  cream: '#FBF6EA',
  red: '#D52B1E',
  redDark: '#A81E14',
  ink: '#2B2A33',
  sea: '#8DB8D8',
  seaDark: '#7AA6C8',
  sky: '#AFD8F0',
  skyLight: '#D5ECF7',
  snow: '#FBF7EE',
  m1: '#A9BEDD',
  m2: '#7F9DCB',
  m3: '#5B7AB2',
  m4: '#3E5C92',
  grass: '#7DB36A',
  grassDark: '#5E9450',
  olive: '#6B7444',
  oliveDark: '#4D5530',
  tread: '#34372B',
  wood: '#B5713E',
  woodDark: '#7A4423',
  roof: '#5E3218',
  skin: '#F2C9A0',
  green: '#5E7A4A',
  greenDark: '#3F5634',
  gold: '#E8B83A',
  goldDark: '#B98A1F',
  goldLight: '#F7DA7A',
  orange: '#F28C28',
  yellow: '#F6C64E',
  white: '#FFFFFF',
  grey: '#8C8C94',
  rock: '#6E6A78',
  rockDark: '#4A4656',
  night: '#1F1C2B',
  parchment: '#F1E2BC',
  parchmentDark: '#D9C08A',
};

export const cl = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

export const ease = {
  out: Easing.bezier(0.16, 1, 0.3, 1),
  inOut: Easing.bezier(0.7, 0, 0.2, 1),
  in: Easing.bezier(0.55, 0, 0.9, 0.35),
  back: Easing.bezier(0.34, 1.8, 0.64, 1),
  linear: Easing.linear,
};

/** interpolate bornée, avec une seule courbe pour tous les segments */
export const lerp = (
  f: number,
  input: readonly number[],
  output: readonly number[],
  easing: (t: number) => number = ease.out,
) => interpolate(f, input, output, {...cl, easing});

/** Ressort qui dépasse un peu : pour les apparitions "pop" */
export const pop = (frame: number, start: number, cfg?: {damping?: number; stiffness?: number; mass?: number}) => {
  if (frame < start) return 0;
  return spring({
    frame: frame - start,
    fps: FPS,
    config: {damping: cfg?.damping ?? 9, stiffness: cfg?.stiffness ?? 190, mass: cfg?.mass ?? 0.7},
  });
};

/** Pas d'animation stop-motion : le papier "vibre" toutes les 3 images */
export const step = (frame: number, every = 3) => Math.floor(frame / every);
export const boil = (frame: number, seed: string | number, amp: number, every = 3) =>
  (random(`${seed}-${step(frame, every)}`) - 0.5) * 2 * amp;

/** Tremblement de caméra à partir d'impacts [image, force] */
export const shake = (frame: number, impacts: readonly (readonly [number, number])[], decay = 7) => {
  let a = 0;
  for (const [t, amp] of impacts) {
    if (frame >= t) a += amp * SHAKE_K * Math.exp(-(frame - t) / decay);
  }
  return {
    x: noise2D('sx', frame * 0.85, 0) * a,
    y: noise2D('sy', frame * 0.85, 3) * a,
    r: noise2D('sr', frame * 0.85, 7) * a * 0.06,
  };
};

export type CamKey = {f: number; x: number; y: number; z: number; r?: number};

/** Caméra : un point de visée (x,y) amené au centre de l'écran, zoom z, rotation r */
export const camera = (
  frame: number,
  keys: readonly CamKey[],
  impacts: readonly (readonly [number, number])[] = [],
  easing: (t: number) => number = ease.inOut,
) => {
  const fs = keys.map((k) => k.f);
  const x = interpolate(frame, fs, keys.map((k) => k.x), {...cl, easing});
  const y = interpolate(frame, fs, keys.map((k) => k.y), {...cl, easing});
  const z = interpolate(frame, fs, keys.map((k) => k.z), {...cl, easing});
  const r = interpolate(frame, fs, keys.map((k) => k.r ?? 0), {...cl, easing});
  const s = shake(frame, impacts);
  return `translate(${W / 2 + s.x} ${H / 2 + s.y}) rotate(${r + s.r}) scale(${z}) translate(${-x} ${-y})`;
};

/** Étoile irrégulière (explosions, éclats) */
export const starPoints = (n: number, r1: number, r2: number, seed: string) => {
  const pts: string[] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2;
    const base = i % 2 === 0 ? r1 : r2;
    const r = base * (0.8 + random(`${seed}-${i}`) * 0.4);
    pts.push(`${(Math.cos(a) * r).toFixed(1)},${(Math.sin(a) * r).toFixed(1)}`);
  }
  return pts.join(' ');
};

export const deg = (r: number) => (r * 180) / Math.PI;
