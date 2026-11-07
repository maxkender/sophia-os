import React from 'react';
import {Audio} from '@remotion/media';
import {interpolate, Sequence, staticFile} from 'remotion';
import {PUSH, TAPS} from './scenes/Outro';
import {OUTRO_VOICE, useTimeline, VOICE_START, type Timeline} from './timeline';

// Son calme : une ambiance douce par page (en boucle, sous la voix) et un seul bruitage léger au moment fort.
type Page = [ambiance: string | null, moment: string | null];
const PAGES: Page[] = [
  ['countryside', 'bell'],
  ['countryside', 'chime'],
  ['fireplace', 'hooves'],
  ['countryside', 'birds'],
  ['countryside', 'bell'],
  ['countryside', 'chime'],
  ['countryside', 'cloth'],
  ['rain', null],
  ['fireplace', 'cloth'],
  ['night', null],
  ['winter', 'bell'],
  ['fireplace', 'cloth'],
  ['fireplace', null],
  ['town', 'chime'],
  ['countryside', 'pageSoft'],
  ['fireplace', 'cloth'],
  ['town', null],
  ['town', 'chime'],
  ['waves', 'bell'],
  ['night', null],
  ['winter', null],
  ['countryside', 'chime'],
  ['countryside', 'hooves'],
  ['hall', 'chime'],
  ['winter', 'cloth'],
  ['night', null],
  ['hall', null],
  ['hall', 'chime'],
  ['hall', 'cloth'],
  ['hall', 'cloth'],
  ['winter', 'hooves'],
  ['countryside', 'hooves'],
  ['hall', 'chime'],
  [null, 'chime'],
  ['countryside', 'bell'],
  ['fireplace', 'cloth'],
];
const MASTER = 0.55;
const AMBIANCE = 0.16; // ambiance sous la voix
const MOMENT = 0.32;

type Ev = {f: number; son: string; vol: number};

export const evenements = (tl: Timeline): Ev[] => {
  const {scenes, outroFrom, parle} = tl;
  return [
    ...scenes.flatMap((s, i): Ev[] => {
      const son = PAGES[i]?.[1];
      return son ? [{f: s.from + s.moment, son, vol: MOMENT}] : [];
    }),
    ...scenes.slice(1).map((s): Ev => ({f: s.from, son: 'pageSoft', vol: 0.18})),
    {f: outroFrom, son: 'pageSoft', vol: 0.25},
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
        const amb = PAGES[i]?.[0];
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
