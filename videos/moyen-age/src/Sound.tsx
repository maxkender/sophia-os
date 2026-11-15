import React from 'react';
import {Audio} from '@remotion/media';
import {interpolate, Sequence, staticFile} from 'remotion';
import {PUSH, TAPS} from './scenes/Outro';
import {plansAffiches, SONS, TABLEAUX} from './scenes/Tableaux';
import {NOUVELLE_VIE, OUTRO_VOICE, useTimeline, VOICE_START, type Timeline} from './timeline';

// Une ambiance douce par page (en boucle, sous la voix), et les bruitages des plans (scenes/Tableaux.tsx, SONS)
const AMBIANCES: (string | null)[] = [
  'countryside', 'countryside', 'fireplace', 'countryside', 'countryside', 'countryside', 'countryside', 'countryside',
  'fireplace', 'night', 'winter', 'fireplace', 'fireplace', 'town', 'town', 'fireplace', 'town', 'town', 'waves', 'night',
  'town', 'countryside', 'countryside', 'hall', 'winter', 'night', 'countryside', 'hall', 'hall', 'hall', 'winter',
  'countryside', null, null, 'countryside', 'fireplace',
];
const MASTER = 0.55;
const AMBIANCE = 0.16; // ambiance sous la voix

type Ev = {f: number; son: string; vol: number};

export const evenements = (tl: Timeline): Ev[] => {
  const {scenes, outroFrom, parle} = tl;
  return [
    ...scenes.flatMap((s, i): Ev[] => {
      const affiches = plansAffiches(TABLEAUX[i]?.nPlans ?? 1, s.plans);
      return (SONS[i] ?? []).flatMap(([plan, quand, son, vol]): Ev[] => {
        if (quand === 'm') return affiches.some((p) => p.idx === plan) || plan === 0 ? [{f: s.from + s.moment, son, vol}] : [];
        const p = affiches.find((x) => x.idx === plan);
        return p && p.de + quand < s.d ? [{f: s.from + p.de + quand, son, vol}] : [];
      });
    }),
    // coupe entre deux plans d'une même page : petit « swish »
    ...scenes.flatMap((s): Ev[] => s.plans.slice(1).map((p): Ev => ({f: s.from + p, son: 'whoosh', vol: 0.12}))),
    ...scenes.slice(1).map((s, i): Ev => (NOUVELLE_VIE.has(i) ? {f: s.from, son: 'tear', vol: 0.45} : {f: s.from, son: 'whoosh', vol: 0.28})),
    {f: outroFrom, son: 'whoosh', vol: 0.35},
    {f: outroFrom + 2, son: 'phone', vol: 0.5},
    ...TAPS.map((t): Ev => ({f: outroFrom + t.f - 1, son: 'click', vol: 0.7})),
    {f: outroFrom + TAPS[2].f + 1, son: 'correct', vol: 0.6},
    {f: outroFrom + TAPS[4].f + 1, son: 'correct', vol: 0.6},
    {f: outroFrom + PUSH.done + 8, son: 'sparkle', vol: 0.4},
    {f: outroFrom + PUSH.done + 14, son: 'confetti', vol: 0.5},
  ].map((e) => ({...e, f: Math.max(0, e.f), vol: e.vol * MASTER * (parle(e.f) ? 0.6 : 1)}));
};

/** Voix off, ambiances et bruitages de la langue en cours */
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
      {tl.scenes.map((s, i) => {
        const amb = AMBIANCES[i];
        if (!amb) return null;
        return (
          <Sequence key={`a${i}`} from={s.from} durationInFrames={s.d} layout="none" name={`ambiance ${amb}`}>
            <Audio
              src={staticFile(`sfx/${amb}.mp3`)}
              loop
              volume={(f) => interpolate(f, [0, 14, s.d - 14, s.d], [0, AMBIANCE * MASTER, AMBIANCE * MASTER, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}
            />
          </Sequence>
        );
      })}
      {evenements(tl).map((e, k) => (
        <Sequence key={k} from={e.f} layout="none" name={e.son}>
          <Audio src={staticFile(`sfx/${e.son}.mp3`)} volume={e.vol} />
        </Sequence>
      ))}
    </>
  );
};
