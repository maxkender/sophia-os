import React from 'react';
import {Audio} from '@remotion/media';
import {interpolate, Sequence, staticFile} from 'remotion';
import * as S1 from './scenes/S1Sleep';
import * as S2 from './scenes/S2Flow';
import * as S3 from './scenes/S3Column';
import * as S4 from './scenes/S4Ashfall';
import * as S5 from './scenes/S5Veil';
import * as S6 from './scenes/S6Winter';
import * as S7 from './scenes/S7Tambora';
import * as S8 from './scenes/S8Calm';
import {PUSH, TAPS} from './scenes/Outro';
import {OUTRO_VOICE, useTimeline, VOICE_START, type Timeline} from './timeline';

type Ev = {f: number; son: string; vol: number; ambiance?: number};

type E = [number, string, number];
const serie = (fs: readonly number[], son: string, vol: number): E[] => fs.map((x): E => [x, son, vol]);

// Bruitages par scène : [image « scène », son, volume]
const PAR_SCENE: E[][] = [
  [
    [0, 'birds', 0.35],
    [12, 'whoosh', 0.5],
    [18, 'magma', 0.4],
    [34, 'breath', 0.75],
    [S1.GEYSER, 'geyser', 0.55],
    [S1.WAKE, 'rumble', 0.95],
    [S1.WAKE + 1, 'boomSmall', 0.7],
    [S1.WAKE + 4, 'magma', 0.5],
    [134, 'pop', 0.5],
    ...serie(S1.TICKS, 'tick', 0.6),
  ],
  [
    [S2.ERUPT, 'eruption', 0.55],
    [S2.ERUPT + 2, 'boom', 0.4],
    [S2.CLOUDS, 'roar', 0.9],
    [56, 'fuse', 0.35],
    [S2.RACE - 6, 'car', 0.8],
    [92, 'whoosh', 0.5],
    [S2.SWALLOW, 'boomSmall', 0.7],
    [126, 'whoosh', 0.5],
    ...serie([131, 135, 139, 143], 'pop', 0.3),
    ...serie(S2.RINGS, 'pop', 0.45),
    [S2.COVER, 'roar', 0.8],
    [S2.CHANCE, 'thud', 0.9],
  ],
  [
    [6, 'tick', 0.55],
    [22, 'tick', 0.45],
    [30, 'jet', 0.4],
    [S3.COLUMN, 'rumble', 0.6],
    [S3.SHOOT, 'eruption', 0.5],
    [S3.SHOOT + 2, 'whoosh', 0.4],
    [S3.TOP, 'boomSmall', 0.5],
    ...serie(S3.BOLTS, 'thunder', 0.4),
  ],
  [
    [6, 'pop', 0.4],
    ...serie(S4.TEARS, 'pageFlip', 0.5),
    [S4.ASH, 'wind', 0.5],
    [S4.ASH + 3, 'rumble', 0.35],
    [100, 'whoosh', 0.5],
    [S4.CRUSH[0], 'crack', 0.55],
    [S4.CRUSH[1], 'crack', 0.45],
    [S4.CRUSH[2], 'crack', 0.4],
    [174, 'whoosh', 0.5],
    [178, 'jet', 0.4],
    ...serie(S4.GROUNDED, 'stamp', 0.7),
  ],
  [
    [4, 'pop', 0.4],
    ...serie(S5.TEARS, 'pageFlip', 0.45),
    [S5.SULFUR, 'fuse', 0.45],
    [S5.SULFUR + 2, 'whoosh', 0.45],
    [S5.VEIL, 'wind', 0.5],
    [S5.DIM, 'powerDown', 0.9],
  ],
  [
    [S6.THERMO, 'pop', 0.5],
    ...serie(S6.DROP, 'pop', 0.3),
    [S6.FROST, 'freeze', 0.8],
    [S6.WINTER, 'blizzard', 0.8],
    [S6.FAIL, 'powerDown', 0.45],
    [S6.PLATE, 'thud', 0.6],
    ...serie(S6.BITES, 'pop', 0.5),
  ],
  [
    [2, 'swirl', 0.7],
    [S7.CRAZY, 'swirl', 0.6],
    [S7.OLD, 'unroll', 0.6],
    [S7.OLD + 2, 'waves', 0.3],
    [S7.GHOST, 'whoosh', 0.5],
    [S7.ERUPT, 'eruption', 0.5],
    [132, 'whoosh', 0.5],
    [138, 'waves', 0.5],
    [140, 'birds', 0.3],
    [S7.CLOUDS, 'powerDown', 0.6],
    [S7.SNOW, 'blizzard', 0.6],
    [S7.FROZEN, 'freeze', 0.55],
  ],
  [
    [2, 'birds', 0.5],
    [6, 'geyser', 0.4],
    [S8.SUN, 'sparkle', 0.5],
    [36, 'whoosh', 0.5],
    [S8.ICON, 'pop', 0.5],
    [S8.ERUPT, 'boomSmall', 0.6],
    [S8.PAN[0], 'whoosh', 0.6],
    ...serie([112, 124, 148], 'pop', 0.35),
    [S8.SCI, 'pop', 0.5],
    [S8.SCI + 4, 'scribble', 0.4],
    [S8.LENS, 'pop', 0.4],
    [S8.OK, 'correct', 0.8],
    [S8.OK + 2, 'sparkle', 0.5],
  ],
];
const AMBIANCES = new Set(['warAmb', 'wind', 'train', 'fuse', 'rumble', 'roar', 'magma', 'breath', 'blizzard', 'waves', 'birds', 'jet']);
const IMPACTS = new Set(['boom', 'stamp', 'clang', 'cannon', 'tankCrash', 'tear', 'eruption', 'crack', 'thunder']);
// Niveau général des bruitages (sources normalisées à -1 dB) et baisse sous la voix, par famille
const MASTER = 0.55;
const SOUS_VOIX = (son: string) => (IMPACTS.has(son) ? 0.65 : AMBIANCES.has(son) ? 0.3 : 0.45);
const HORS_VOIX = (son: string) => (AMBIANCES.has(son) ? 0.6 : 1);
const TRANSITIONS = ['tear', 'whoosh', 'tear', 'whoosh', 'tear', 'whoosh', 'whoosh', 'tear'];

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
