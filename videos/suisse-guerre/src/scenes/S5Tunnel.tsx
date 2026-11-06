import React from 'react';
import {getLength, getPointAtLength} from '@remotion/paths';
import {random} from 'remotion';
import {C, camera, ease, lerp, pop, starPoints, useFrame} from '../lib';
import {Boom, Chalet, Debris, Dynamite, Mountain, Ring, Sparkle, Tank, Train} from '../shapes';
import {Stage} from '../Stage';

const BASE = 1470;
const M: [number, number][] = [
  [200, BASE],
  [330, 1180],
  [420, 1240],
  [620, 560],
  [760, 820],
  [860, 700],
  [1080, 1000],
  [1200, BASE],
];
const MP = M.map((p) => p.join(',')).join(' ');
const PORTAL = 'M 262 1470 L 262 1395 Q 320 1310 378 1395 L 378 1470 Z';
const WIRE = 'M 980 1560 L 980 1338 L 470 1338';
const WIRE_LEN = getLength(WIRE);
const BOOM_F = 98;
const STICKS = [480, 680, 880];

const Rubble: React.FC<{f: number; x0: number; x1: number; start: number; seed: string}> = ({f, x0, x1, start, seed}) => {
  const rocks = [];
  for (let i = 0; i < 16; i++) {
    const p = pop(f, start + i, {damping: 9});
    if (p <= 0) continue;
    const x = x0 + ((x1 - x0) * (i + 0.5)) / 16 + (random(`${seed}x${i}`) - 0.5) * 30;
    const y = 1420 + (random(`${seed}y${i}`) - 0.5) * 70;
    const r = 34 + random(`${seed}r${i}`) * 26;
    rocks.push(
      <polygon
        key={i}
        points={starPoints(4, r, r * 0.75, `${seed}p${i}`)}
        transform={`translate(${x} ${y}) scale(${p}) rotate(${random(`${seed}a${i}`) * 90})`}
        fill={i % 3 === 0 ? C.rock : i % 3 === 1 ? '#857f8f' : C.rockDark}
      />,
    );
  }
  return <g filter="url(#pp)">{rocks}</g>;
};

// 0:16–0:22 — le train passe, les tunnels sont minés, BOUM, l'envahisseur ne gagne rien
export const S5Tunnel: React.FC = () => {
  const f = useFrame();
  const cam = camera(
    f,
    [
      {f: 0, x: 540, y: 1250, z: 1.0},
      {f: 36, x: 600, y: 1250, z: 1.0},
      {f: 56, x: 650, y: 1300, z: 1.12},
      {f: 96, x: 670, y: 1340, z: 1.24},
      {f: 99, x: 660, y: 1290, z: 1.0},
      {f: 120, x: 560, y: 1250, z: 0.98},
      {f: 138, x: 300, y: 1380, z: 1.35},
      {f: 150, x: 300, y: 1380, z: 1.4},
      {f: 162, x: 560, y: 1160, z: 0.96},
      {f: 188, x: 600, y: 1140, z: 1.0},
    ],
    [
      [BOOM_F, 70],
      [BOOM_F + 3, 30],
      [BOOM_F + 6, 30],
      [64, 8],
      [142, 22],
      [176, 18],
    ],
  );
  const fold = f < 100 ? lerp(f, [42, 54], [1, -0.12], ease.inOut) : lerp(f, [112, 124], [-0.12, 1], ease.inOut);
  const trainX = lerp(f, [0, 38], [120, 1150], ease.in);
  const plunger = lerp(f, [60, 64], [0, 1], ease.in);
  const sparkLen = lerp(f, [64, 96], [0, WIRE_LEN], ease.linear);
  const spark = getPointAtLength(WIRE, sparkLen) ?? {x: 980, y: 1560};
  const flash = lerp(f, [BOOM_F, BOOM_F + 1, BOOM_F + 7], [0, 0.95, 0], ease.linear);
  const exploded = f >= BOOM_F + 4;

  // char : arrive, se cogne, canon qui tombe
  const tankX = f < 142 ? lerp(f, [120, 142], [-420, 105], ease.out) : 105 - Math.sin(lerp(f, [142, 150], [0, Math.PI])) * 26 - lerp(f, [178, 188], [0, 60], ease.in);
  const tankHop = f >= 177 ? Math.sin(lerp(f, [177, 185], [0, Math.PI])) * 40 : 0;

  // canon caché dans le chalet
  const panel = lerp(f, [152, 160], [1, -0.3], ease.inOut);
  const barrel = lerp(f, [158, 168], [0, 150], ease.out) - (f > 176 ? Math.sin(lerp(f, [176, 182], [0, Math.PI])) * 30 : 0);
  const ang = 141;
  const tip: [number, number] = [940 + Math.cos((ang * Math.PI) / 180) * 150, 790 + Math.sin((ang * Math.PI) / 180) * 150];

  return (
    <Stage bg="#F3C27E">
      <defs>
        <linearGradient id="s5sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F6D9A6" />
          <stop offset="1" stopColor="#F0B272" />
        </linearGradient>
        <clipPath id="s5train">
          <rect x={-2000} y={0} width={2262} height={3000} />
        </clipPath>
        <clipPath id="s5mtn">
          <polygon points={MP} />
        </clipPath>
      </defs>
      <g transform={cam}>
        <rect x={-800} y={-800} width={2700} height={3600} fill="url(#s5sky)" />
        <circle cx={240} cy={520} r={110} fill="#FBE7BE" opacity={0.9} />
        <g filter="url(#pp)">
          <Mountain pts={[[-300, 1200], [0, 820], [180, 980], [340, 760], [480, 1000], [-300, 1500]]} fill="#B7A3C4" />
          <Mountain pts={[[700, 1200], [960, 600], [1150, 900], [1400, 700], [1500, 1500], [700, 1500]]} fill="#B7A3C4" />
        </g>

        {/* coupe de la montagne : roche, tunnel, dynamite, mèche */}
        <g filter="url(#ppl)">
          <polygon points={MP} fill={C.rockDark} />
          <g clipPath="url(#s5mtn)">
            {[0, 1, 2, 3].map((i) => (
              <path
                key={i}
                d={`M 100 ${760 + i * 170} Q 400 ${700 + i * 170} 700 ${780 + i * 170} T 1300 ${740 + i * 170} L 1300 ${800 + i * 170} Q 1000 ${840 + i * 170} 700 ${830 + i * 170} T 100 ${820 + i * 170} Z`}
                fill="#5B5669"
              />
            ))}
            <rect x={262} y={1330} width={1000} height={140} fill={C.night} />
            <rect x={262} y={1458} width={1000} height={8} fill="#55535c" />
          </g>
        </g>
        {!exploded &&
          STICKS.map((x, i) => (
            <g key={x} transform={`translate(${x} 1392) scale(${pop(f, 52 + i * 3)})`} filter="url(#pp)">
              <Dynamite />
            </g>
          ))}
        {!exploded && f >= 50 && (
          <path d={WIRE} stroke="#E9D9B4" strokeWidth={7} fill="none" strokeDasharray={WIRE_LEN} strokeDashoffset={lerp(f, [50, 60], [WIRE_LEN, 0])} />
        )}
        {f >= 64 && f < BOOM_F && (
          <g>
            <Sparkle x={spark.x} y={spark.y} frame={f} size={30} />
            <circle cx={spark.x} cy={spark.y} r={10} fill={C.white} />
          </g>
        )}
        {exploded && <Rubble f={f} x0={262} x1={1100} start={BOOM_F + 2} seed="tun" />}

        {/* sol + rails */}
        <g filter="url(#pp)">
          <rect x={-800} y={BASE} width={2700} height={900} fill="#9C8662" />
          <path d={`M -800 ${BASE + 120} Q 300 ${BASE + 80} 1900 ${BASE + 130} L 1900 2500 L -800 2500 Z`} fill={C.grassDark} />
        </g>
        {Array.from({length: 26}).map((_, i) => (
          <rect key={i} x={-600 + i * 70} y={BASE - 4} width={40} height={14} fill="#5a4630" />
        ))}
        <rect x={-800} y={BASE - 10} width={2700} height={8} fill="#4a4a52" />

        {/* train (disparaît dans le portail) */}
        <g clipPath="url(#s5train)">
          <g transform={`translate(${trainX} ${BASE - 8})`} filter="url(#pp)">
            <Train spin={f * 30} />
          </g>
        </g>

        {/* face avant de la montagne : un rabat de papier qui se plie */}
        <g transform={`translate(0 ${BASE}) scale(1 ${fold}) translate(0 ${-BASE})`} filter="url(#ppl)">
          {fold >= 0 ? (
            <g>
              <Mountain pts={M} fill={C.m3} />
              {[
                [470, 1330],
                [560, 1290],
                [700, 1380],
                [1000, 1300],
              ].map(([x, y]) => (
                <g key={x}>
                  <rect x={x - 6} y={y} width={12} height={40} fill={C.woodDark} />
                  <polygon points={`${x - 34},${y + 6} ${x},${y - 80} ${x + 34},${y + 6}`} fill="#3F7A4A" />
                </g>
              ))}
              <path d={PORTAL} fill={C.night} stroke="#8d8994" strokeWidth={14} />
              {f >= 112 && (
                <g clipPath="url(#s5portal)">
                  <Rubble f={f + 30} x0={262} x1={380} start={BOOM_F} seed="portal" />
                </g>
              )}
              <rect x={872} y={826} width={136} height={12} fill={C.rock} />
              <g transform="translate(940 830) scale(0.38)">
                <Chalet />
              </g>
            </g>
          ) : (
            <polygon points={MP} fill={C.parchment} />
          )}
        </g>
        <defs>
          <clipPath id="s5portal">
            <path d={PORTAL} />
          </clipPath>
        </defs>

        {/* détonateur */}
        {f >= 48 && (
          <g transform={`translate(980 1620) scale(${pop(f, 48)})`} filter="url(#pp)">
            <rect x={-60} y={-60} width={120} height={80} rx={8} fill="#7A4423" />
            <rect x={-8} y={-130 + plunger * 50} width={16} height={80} fill="#3d3b44" />
            <rect x={-60} y={-142 + plunger * 50} width={120} height={18} rx={9} fill="#3d3b44" />
          </g>
        )}

        {/* chalet-bunker : la façade tombe, un canon sort */}
        {f >= 150 && (
          <g>
            <rect x={882} y={744} width={116} height={78} fill="#1a1410" />
            <g transform={`translate(940 790) rotate(${ang})`} filter="url(#pp)">
              <rect x={0} y={-14} width={Math.max(barrel, 1)} height={28} rx={6} fill="#3d3b44" />
              <rect x={Math.max(barrel - 16, 0)} y={-19} width={18} height={38} rx={5} fill="#2a2930" />
            </g>
            <g transform={`translate(0 822) scale(1 ${panel}) translate(0 -822)`} filter="url(#pp)">
              <rect x={882} y={744} width={116} height={78} fill={panel >= 0 ? C.wood : C.parchment} />
              {panel >= 0 && <rect x={902} y={756} width={30} height={26} fill={C.skyLight} />}
              {panel >= 0 && <rect x={950} y={756} width={30} height={26} fill={C.skyLight} />}
            </g>
          </g>
        )}
        {f >= 176 && <Boom x={tip[0]} y={tip[1]} size={46} frame={f} start={176} seed="muzzle" life={12} />}
        {f >= 176 &&
          [0, 1, 2, 3].map((i) => (
            <circle
              key={i}
              cx={tip[0] - 20 + i * 14 - (f - 176) * 3}
              cy={tip[1] + 10 - (f - 176) * (2 + i)}
              r={lerp(f, [176, 188], [10, 40 + i * 6])}
              fill={C.cream}
              opacity={lerp(f, [178, 190], [0.9, 0])}
            />
          ))}

        {/* le char qui arrive trop tard */}
        {f >= 118 && (
          <g transform={`translate(${tankX} ${BASE - 6 - tankHop}) scale(0.8)`} filter="url(#pp)">
            <Tank spin={f * 26} barrel={lerp(f, [146, 154], [0, 16], ease.out)} />
          </g>
        )}
        {f >= 146 &&
          [0, 1, 2].map((i) => {
            const a = f * 0.35 + (i * Math.PI * 2) / 3;
            return <Sparkle key={i} x={tankX + Math.cos(a) * 70} y={1300 + Math.sin(a) * 20} frame={f} size={18} />;
          })}

        {/* l'explosion */}
        <Boom x={680} y={1390} size={560} frame={f} start={BOOM_F} seed="big" life={26} />
        <Boom x={470} y={1380} size={300} frame={f} start={BOOM_F + 2} seed="b2" life={22} />
        <Boom x={890} y={1380} size={320} frame={f} start={BOOM_F + 4} seed="b3" life={22} />
        <Ring x={680} y={1390} frame={f} start={BOOM_F} r={900} dur={16} />
        <Debris x={680} y={1380} frame={f} start={BOOM_F} n={28} seed="rocks" colors={[C.rock, C.rockDark, '#857f8f']} speed={42} gravity={1.8} size={46} rocks />
        <Debris x={680} y={1380} frame={f} start={BOOM_F + 1} n={40} seed="conf" colors={[C.red, C.yellow, C.orange, C.cream, C.m3]} speed={36} gravity={1.2} size={30} />
      </g>
      <rect x={0} y={0} width={1080} height={1920} fill={C.white} opacity={flash} />
    </Stage>
  );
};
