import React from 'react';
import {Audio} from '@remotion/media';
import {interpolate, Sequence, staticFile} from 'remotion';
import {BOMBS, coinStart, COINS, TIP} from './scenes/S7Punch';
import {TANKS} from './scenes/S2Alps';
import {PUSH, TAPS} from './scenes/Outro';
import {globalDe, OUTRO_FROM, OUTRO_VOICE, parle, SCENES_T, VOICE_START} from './timeline';

type Ev = {f: number; son: string; vol: number; ambiance?: number};

// Bruitages par scène : [image « scène », son, volume]
const PAR_SCENE: [number, string, number][][] = [
  [
    [0, 'whoosh', 0.5],
    [1, 'warAmb', 0.5],
    ...[0, 2, 4, 6, 8, 10].map((i): [number, string, number] => [7 + i * 3, 'boomSmall', 0.32]),
    ...[52, 58, 64, 70].map((s): [number, string, number] => [s, 'boomSmall', 0.28]),
    [54, 'whoosh', 0.45],
    [72, 'pop', 0.5],
    [74, 'flag', 0.45],
  ],
  [
    [2, 'rumble', 0.7],
    [3, 'wind', 0.3],
    [14, 'thud', 0.4],
    [26, 'pop', 0.4],
    [27, 'flag', 0.4],
    ...TANKS.flatMap((t): [number, string, number][] => [
      [t.start + 24, 'clang', 0.35],
      [t.start + 33, 'tankCrash', 0.45],
    ]),
  ],
  [
    [2, 'unroll', 0.7],
    ...[8, 11, 14, 17, 20].map((s): [number, string, number] => [s, 'pop', 0.28]),
    [14, 'scribble', 0.6],
    [40, 'scribble', 0.6],
    [72, 'whoosh', 0.35],
    [80, 'stamp', 0.95],
    [86, 'whoosh', 0.3],
  ],
  [
    [2, 'whoosh', 0.4],
    [7, 'thud', 0.7],
    [12, 'door', 0.6],
    ...[20, 24, 28, 32].map((s, k): [number, string, number] => [s, 'pop', k ? 0.35 : 0.45]),
    [36, 'march', 0.5],
    ...[50, 54, 58, 62].map((s): [number, string, number] => [s, 'pop', 0.3]),
    [88, 'whoosh', 0.55],
    [104, 'whoosh', 0.3],
    [110, 'rifle', 0.9],
    [112, 'pop', 0.3],
    [116, 'pop', 0.3],
    [118, 'sparkle', 0.4],
  ],
  [
    [0, 'train', 0.6],
    [42, 'fold', 0.7],
    ...[52, 55, 58].map((s): [number, string, number] => [s, 'pop', 0.3]),
    [61, 'click', 0.6],
    [64, 'fuse', 0.6],
    [80, 'fuse', 0.5],
    [98, 'boom', 1.0],
    [101, 'boomSmall', 0.6],
    [104, 'rumble', 0.4],
    [112, 'fold', 0.5],
    [142, 'clang', 0.9],
    [146, 'sparkle', 0.35],
    [152, 'fold', 0.5],
    [160, 'whoosh', 0.3],
    [176, 'cannon', 0.8],
  ],
  [
    [0, 'whoosh', 0.4],
    [5, 'thud', 0.7],
    [16, 'coins', 0.5],
    [30, 'coins', 0.5],
    [44, 'coin', 0.4],
    [46, 'flag', 0.5],
    [47, 'pop', 0.35],
    [50, 'doves', 0.55],
    [72, 'pin', 0.6],
    [82, 'clap', 0.8],
    [84, 'sparkle', 0.4],
  ],
  [
    [0, 'pop', 0.5],
    ...BOMBS.map((b): [number, string, number] => [b.s + 6, 'thud', 0.6]),
    ...COINS.map((_, i): [number, string, number] => [coinStart(i) + 6, 'coin', 0.35]),
    [TIP, 'scale', 0.9],
    [TIP + 1, 'whoosh', 0.45],
    [TIP + 6, 'sparkle', 0.5],
  ],
];
const AMBIANCES = new Set(['warAmb', 'wind', 'train', 'fuse']);
const TRANSITIONS = ['tear', 'whoosh', 'tear', 'whoosh', 'tear', 'whoosh', 'tear'];

export const EVENEMENTS: Ev[] = [
  ...PAR_SCENE.flatMap((evs, i) => evs.map(([s, son, vol]): Ev => ({f: globalDe(i, s), son, vol}))),
  ...TRANSITIONS.map((son, i): Ev => ({f: i + 1 < SCENES_T.length ? SCENES_T[i + 1].from : OUTRO_FROM, son, vol: son === 'tear' ? 0.6 : 0.45})),
  {f: OUTRO_FROM + 2, son: 'phone', vol: 0.6},
  ...TAPS.map((t): Ev => ({f: OUTRO_FROM + t.f - 1, son: 'click', vol: 0.8})),
  {f: OUTRO_FROM + TAPS[2].f + 1, son: 'correct', vol: 0.7},
  {f: OUTRO_FROM + TAPS[4].f + 1, son: 'correct', vol: 0.7},
  {f: OUTRO_FROM + PUSH.done + 8, son: 'sparkle', vol: 0.5},
  {f: OUTRO_FROM + PUSH.done + 14, son: 'confetti', vol: 0.7},
].map((e) => ({...e, f: Math.max(0, e.f), vol: e.vol * (parle(e.f) ? 0.6 : 1), ambiance: AMBIANCES.has(e.son) ? 1 : undefined}));

/** Voix off + bruitages */
export const Sound: React.FC = () => (
  <>
    <Sequence from={VOICE_START} layout="none" name="Voix récit">
      <Audio src={staticFile('audio/recit.mp3')} />
    </Sequence>
    <Sequence from={OUTRO_FROM + OUTRO_VOICE} layout="none" name="Voix fin">
      <Audio src={staticFile('audio/outro.mp3')} />
    </Sequence>
    {EVENEMENTS.map((e, k) => (
      <Sequence key={k} from={e.f} layout="none" name={e.son}>
        <Audio
          src={staticFile(`sfx/${e.son}.mp3`)}
          volume={(f) => (e.ambiance ? interpolate(f, [0, 10], [0, e.vol], {extrapolateRight: 'clamp'}) : e.vol)}
        />
      </Sequence>
    ))}
  </>
);
