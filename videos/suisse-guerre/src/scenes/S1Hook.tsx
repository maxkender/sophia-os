import React from 'react';
import {random, useCurrentFrame} from 'remotion';
import {C, ease, lerp, pop, shake} from '../lib';
import {EuropeMap, GEO} from '../map';
import {Boom, FlagPole, Rays} from '../shapes';
import {Stage} from '../Stage';

const FIRST = ['Germany', 'France', 'Italy', 'Austria', 'Poland', 'UK', 'Spain', 'Balkans', 'Belgium', 'Czech', 'Hungary', 'Denmark'];
const firstStart = (i: number) => 7 + i * 3;
const nearStart = (i: number) => 52 + i * 3;

// 0:00–0:03 — la carte claque, l'Europe explose, la Suisse reste calme
export const S1Hook: React.FC = () => {
  const f = useCurrentFrame();
  const [cx, cy] = GEO.chCenter;

  const slam = pop(f, 0, {damping: 13, stiffness: 240, mass: 0.8});
  const z =
    f < 20
      ? 1.38 + (1 - 1.38) * slam
      : f < 54
        ? lerp(f, [20, 54], [1.0, 1.1], ease.linear)
        : f < 74
          ? lerp(f, [54, 74], [1.1, 3.5], ease.inOut)
          : lerp(f, [74, 94], [3.5, 3.85], ease.linear);
  const rot = f < 20 ? -4 * (1 - slam) : 0;
  const impacts: [number, number][] = [
    [11, 24],
    ...FIRST.map((_, i): [number, number] => [firstStart(i) + 1, 6]),
    ...GEO.near.map((_, i): [number, number] => [nearStart(i) + 1, 9]),
    [76, 12],
  ];
  const s = shake(f, impacts);

  const under = (
    <g>
      <Rays cx={cx} cy={cy} n={16} color={C.cream} rot={f * 0.9} r={420} opacity={lerp(f, [60, 78], [0, 0.5])} />
      {GEO.near.map(([x, y], i) => (
        <Boom key={i} x={x} y={y} size={30 + random(`n${i}`) * 14} frame={f} start={nearStart(i)} seed={`n${i}`} />
      ))}
    </g>
  );

  return (
    <Stage bg={C.sea}>
      <g transform={`translate(${540 + s.x} ${960 + s.y}) rotate(${rot + s.r}) scale(${z}) translate(${-cx} ${-cy})`}>
        <EuropeMap chLift={1 + 0.14 * pop(f, 58, {damping: 10})} under={under}>
          {FIRST.map((k, i) => (
            <Boom key={k} x={GEO.hot[k][0]} y={GEO.hot[k][1]} size={70 + random(k) * 45} frame={f} start={firstStart(i)} seed={k} />
          ))}
          <FlagPole x={cx + 4} y={cy + 6} h={92} s={50} frame={f} start={72} />
        </EuropeMap>
      </g>
    </Stage>
  );
};
