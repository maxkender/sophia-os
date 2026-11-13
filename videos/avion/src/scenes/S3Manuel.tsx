import React from 'react';
import {C, camera, ease, lerp, pop, useFrame} from '../lib';
import {Stage} from '../Stage';
import {A, Airliner, StampX, Textbook} from '../avion';

// « Even some textbooks get this wrong. So what's really keeping it up there? »
export const BOOK = 4;
export const DIAGRAM = 28;
export const WRONG = 57;
export const SO = 79;
export const SPOT = 94;
export const THERE = 122;

/** Projecteur : tout est dans le noir sauf un disque (cx, cy, r) */
export const Spot: React.FC<{id: string; cx: number; cy: number; r: number; dark: number}> = ({id, cx, cy, r, dark}) =>
  dark <= 0 ? null : (
    <g>
      <defs>
        <radialGradient id={`${id}g`}>
          <stop offset="0.75" stopColor="#000" />
          <stop offset="1" stopColor="#fff" />
        </radialGradient>
        <mask id={id}>
          <rect x={-2000} y={-2000} width={5000} height={6000} fill="#fff" />
          <circle cx={cx} cy={cy} r={r} fill={`url(#${id}g)`} />
        </mask>
      </defs>
      <rect x={-2000} y={-2000} width={5000} height={6000} fill={A.night} opacity={dark} mask={`url(#${id})`} />
    </g>
  );

export const S3Manuel: React.FC = () => {
  const f = useFrame();
  const book = pop(f, BOOK, {damping: 11});
  const open = lerp(f, [BOOK + 6, BOOK + 20], [0, 1], ease.inOut);
  const diagram = lerp(f, [DIAGRAM, WRONG - 6], [0, 1], ease.inOut);
  const stamp = f >= WRONG ? lerp(f, [WRONG, WRONG + 3], [2.4, 1], ease.in) : 0;
  const away = lerp(f, [SO, SO + 14], [0, 1], ease.in);
  const dark = lerp(f, [SO + 2, SO + 14], [0, 0.88]);
  const plane = pop(f, SPOT - 4, {damping: 12});
  const r = lerp(f, [SPOT, SPOT + 12, THERE - 2, THERE + 6], [0, 520, 520, 430], ease.out);
  const wig = f > THERE ? Math.sin((f - THERE) * 0.5) * 3 * lerp(f, [THERE, THERE + 20], [1, 0]) : 0;
  const cam = camera(
    f,
    [
      {f: 0, x: 540, y: 960, z: 1.05},
      {f: 70, x: 540, y: 960, z: 1},
      {f: 143, x: 540, y: 960, z: 1.08}, // = début de S4 : coupe franche sans saut
    ],
    [[WRONG + 2, 18]],
  );
  return (
    <Stage bg={C.kraft}>
      <g transform={cam}>
        <rect x={-600} y={-400} width={2300} height={2800} fill={C.kraft} />
        <rect x={-600} y={1320} width={2300} height={1100} fill={C.wood} filter="url(#pp)" />
        {away < 1 && (
          <g transform={`translate(540 ${880 + away * 1500}) rotate(${-4 + away * 12}) scale(${book * 0.95})`} filter="url(#ppl)">
            <Textbook open={open} diagram={diagram} />
            {stamp > 0 && (
              <g transform={`translate(220 0) scale(${stamp})`}>
                <StampX r={170} />
              </g>
            )}
          </g>
        )}
        {plane > 0 && (
          <g transform={`translate(540 ${960 + (1 - plane) * 400}) rotate(${wig}) scale(${0.72 * plane})`} filter="url(#ppl)">
            <Airliner />
          </g>
        )}
        <Spot id="s3spot" cx={540} cy={960} r={r} dark={dark} />
      </g>
    </Stage>
  );
};
