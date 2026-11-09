import React from 'react';
import {Audio} from '@remotion/media';
import {interpolate, Sequence, staticFile} from 'remotion';
import * as S1 from './scenes/S1Poids';
import * as S2 from './scenes/S2Pistes';
import * as S3 from './scenes/S3Manuel';
import * as S4 from './scenes/S4Aile';
import * as S5 from './scenes/S5Reaction';
import * as S6 from './scenes/S6Main';
import * as S7 from './scenes/S7Pression';
import * as S8 from './scenes/S8Decollage';
import * as S9 from './scenes/S9Plane';
import {PUSH, TAPS} from './scenes/Outro';
import {OUTRO_VOICE, useTimeline, VOICE_START, type Timeline} from './timeline';

type Ev = {f: number; son: string; vol: number; ambiance?: number};

type E = [number, string, number];
const serie = (fs: readonly number[], son: string, vol: number): E[] => fs.map((x): E => [x, son, vol]);

// Bruitages par scène : [image « scène », son, volume]
const PAR_SCENE: E[][] = [
  [
    [0, 'jet', 0.5],
    [S1.ARRIVE + 2, 'whoosh', 0.5],
    [S1.WEIGHT, 'whoosh', 0.4],
    [S1.TONNES, 'thud', 0.9],
    [S1.TONNES + 1, 'boomSmall', 0.4],
    ...serie([S1.CARS, S1.CARS + 4, S1.CARS + 8, S1.CARS + 12, S1.CARS + 16], 'pop', 0.35),
    [S1.FLOAT, 'sparkle', 0.4],
    [S1.FLOAT + 2, 'wind', 0.4],
  ],
  [
    [0, 'wind', 0.35],
    [S2.BALLOON, 'pop', 0.5],
    [S2.BALLOON_POP, 'boomSmall', 0.5],
    [S2.ROTOR, 'swirl', 0.5],
    [S2.ROTOR_NO, 'stamp', 0.6],
    [S2.NOTHING + 2, 'whoosh', 0.5],
    [S2.ZOOM + 6, 'whoosh', 0.5],
    [S2.ZOOM + 10, 'jet', 0.4],
    [S2.ENGINES, 'stamp', 0.7],
  ],
  [
    [S3.BOOK, 'pageFlip', 0.6],
    [S3.BOOK + 12, 'pageFlip', 0.4],
    [S3.DIAGRAM + 2, 'scribble', 0.45],
    [S3.WRONG, 'stamp', 0.85],
    [S3.SO + 2, 'whoosh', 0.5],
    [S3.SPOT, 'click', 0.6],
    [S3.THERE, 'tick', 0.5],
  ],
  [
    [S4.WINGS, 'sparkle', 0.6],
    [S4.MORPH + 4, 'whoosh', 0.55],
    [S4.TILT, 'swirl', 0.35],
    [S4.FLOW, 'wind', 0.55],
    [S4.DOWN - 6, 'whoosh', 0.4],
  ],
  [
    [0, 'wind', 0.4],
    ...serie([S5.DOWN - 6, S5.DOWN - 3, S5.DOWN], 'pop', 0.4),
    [S5.BACK - 2, 'pop', 0.5],
    [S5.UP, 'boomSmall', 0.45],
    [S5.UP + 1, 'whoosh', 0.4],
  ],
  [
    [0, 'car', 0.8],
    [4, 'wind', 0.5],
    [S6.HAND, 'whoosh', 0.45],
    [S6.TILT, 'swirl', 0.4],
    [S6.LIFTS, 'whoosh', 0.6],
    [S6.ZOOM, 'whoosh', 0.4],
    [S6.WING - 2, 'sparkle', 0.6],
  ],
  [
    [0, 'wind', 0.5],
    [S7.FASTER, 'whoosh', 0.55],
    ...serie([S7.BUBBLES, S7.BUBBLES + 4, S7.BUBBLES + 8], 'pop', 0.3),
    [S7.DROPS, 'swirl', 0.4],
    [S7.LIFT - 4, 'pop', 0.5],
    [S7.LIFT + 2, 'whoosh', 0.7],
  ],
  [
    [0, 'jet', 0.45],
    [S8.ENGINES, 'jet', 0.7],
    [S8.FORWARD, 'jet', 0.9],
    [S8.FORWARD + 1, 'boomSmall', 0.3],
    [S8.GAUGE, 'pop', 0.5],
    ...serie([124, 144, 164, 184], 'tick', 0.35),
    [S8.ROTATE, 'whoosh', 0.6],
  ],
  [
    [0, 'waves', 0.4],
    [S9.STOP, 'powerDown', 0.9],
    [S9.STOP + 2, 'boomSmall', 0.35],
    [S9.DROP, 'whoosh', 0.5],
    [S9.GLIDE, 'wind', 0.5],
    [150, 'waves', 0.35],
    [S9.LAND, 'thud', 0.8],
    [S9.EVERYONE, 'clap', 0.7],
    [S9.SURVIVED, 'correct', 0.8],
    [S9.SURVIVED + 2, 'sparkle', 0.5],
  ],
];
const AMBIANCES = new Set(['warAmb', 'wind', 'train', 'fuse', 'rumble', 'roar', 'magma', 'breath', 'blizzard', 'waves', 'birds', 'jet']);
const IMPACTS = new Set(['boom', 'stamp', 'clang', 'cannon', 'tankCrash', 'tear', 'eruption', 'crack', 'thunder']);
// Niveau général des bruitages (sources normalisées à -1 dB) et baisse sous la voix, par famille
const MASTER = 0.55;
const SOUS_VOIX = (son: string) => (IMPACTS.has(son) ? 0.65 : AMBIANCES.has(son) ? 0.3 : 0.45);
const HORS_VOIX = (son: string) => (AMBIANCES.has(son) ? 0.6 : 1);
const TRANSITIONS = ['whoosh', 'tear', 'tear', 'tear', 'whoosh', 'tear', 'whoosh', 'whoosh', 'tear'];

export const evenements = (tl: Timeline): Ev[] => {
  const {globalDe, scenes, outroFrom, parle} = tl;
  return [
    ...PAR_SCENE.flatMap((evs, i) => evs.map(([s, son, vol]): Ev => ({f: globalDe(i, s), son, vol}))),
    ...TRANSITIONS.map((son, i): Ev => ({f: i + 1 < scenes.length ? scenes[i + 1].from : outroFrom, son, vol: son === 'tear' ? 0.6 : 0.45})),
    {f: outroFrom + 2, son: 'phone', vol: 0.6},
    ...TAPS.map((t): Ev => ({f: outroFrom + t.f - 1, son: 'click', vol: 0.8})),
    {f: outroFrom + TAPS[2].f + 1, son: 'correct', vol: 0.7},
    {f: outroFrom + TAPS[4].f + 1, son: 'correct', vol: 0.7},
    {f: outroFrom + PUSH.done + 8, son: 'sparkle', vol: 0.5},
    {f: outroFrom + PUSH.done + 14, son: 'confetti', vol: 0.7},
  ].map((e) => ({
    ...e,
    f: Math.max(0, e.f),
    vol: e.vol * MASTER * (parle(e.f) || parle(e.f + 8) ? SOUS_VOIX(e.son) : HORS_VOIX(e.son)),
    ambiance: AMBIANCES.has(e.son) ? 1 : undefined,
  }));
};

/** Voix off + bruitages de la langue en cours */
export const Sound: React.FC = () => {
  const tl = useTimeline();
  const code = tl.langue.code;
  return (
    <>
      <Sequence from={VOICE_START} layout="none" name="Voix récit">
        <Audio src={staticFile(`audio/${code}/recit.mp3`)} />
      </Sequence>
      <Sequence from={tl.outroFrom + OUTRO_VOICE} layout="none" name="Voix fin">
        <Audio src={staticFile(`audio/${code}/outro.mp3`)} />
      </Sequence>
      {evenements(tl).map((e, k) => (
        <Sequence key={k} from={e.f} layout="none" name={e.son}>
          <Audio
            src={staticFile(`sfx/${e.son}.mp3`)}
            volume={(f) => (e.ambiance ? interpolate(f, [0, 10], [0, e.vol], {extrapolateRight: 'clamp'}) : e.vol)}
          />
        </Sequence>
      ))}
    </>
  );
};
