// Les 36 pages du récit : des tableaux en papier découpé, calmes. Une caméra qui dérive lentement,
// et un seul moment fort par page (calé sur le mot repère du script), qui apparaît en douceur.
import React, {createContext, useContext} from 'react';
import {Img, interpolateColors, staticFile} from 'remotion';
import {C, ease, lerp, useFrame} from '../lib';
import {Stage} from '../Stage';
import {
  Bed,
  Blanket,
  Bowl,
  Candle,
  Castle,
  Chest,
  Church,
  Cloudy,
  Countryside,
  Cow,
  Cradle,
  Crow,
  Flower,
  Goblet,
  GraveCross,
  Horse,
  Hourglass,
  Hut,
  Interior,
  M,
  Moon,
  Person,
  Pig,
  Rain,
  Sack,
  Sea,
  Shield,
  Ship,
  Shoe,
  Snow,
  Stars,
  Steam,
  Steps,
  Sun,
  Sword,
  Table,
  Tent,
  Throne,
  ThroneRoom,
  TownStreet,
  Tree,
  Tub,
  Workbench,
} from '../medieval';
import {Wheat} from '../volcan';

/** Durée de la page et image de son moment fort (fournis par Main d'après la voix) */
export const PageContext = createContext<{d: number; m: number}>({d: 180, m: 60});
const usePage = () => {
  const f = useFrame();
  const {d, m} = useContext(PageContext);
  /** 0 → 1 en douceur à partir du moment fort (pas de rebond) */
  const soft = (dur = 22, decal = 0) => lerp(f, [m + decal, m + decal + dur], [0, 1], ease.inOut);
  return {f, d, m, soft};
};

/** Caméra lente : léger zoom avant et petit glissement sur toute la page. Par défaut, le cadrage est resserré
 *  (zoom 1,15) et descendu de 250 px pour que les personnages tiennent au-dessus des sous-titres (y 1240–1500).
 *  `plat` garde le plan entier (pages en grille). */
const Cam: React.FC<{children: React.ReactNode; dx?: number; dy?: number; z1?: number; cx?: number; cy?: number; plat?: boolean}> = ({
  children,
  dx = 30,
  dy = 0,
  z1 = 1.06,
  cx = 540,
  cy = 960,
  plat = false,
}) => {
  const {f, d} = usePage();
  const t = lerp(f, [0, d], [0, 1], ease.linear);
  const base = plat ? 1 : 1.15;
  const z = base * (1 + (z1 - 1) * t);
  const x = cx + dx * (t - 0.5);
  const y = cy + (plat ? 0 : 250) + dy * (t - 0.5);
  return <g transform={`translate(540 960) scale(${z}) translate(${-x} ${-y})`}>{children}</g>;
};

const Village: React.FC = () => (
  <>
    <Church x={820} y={1080} s={0.7} />
    <Hut x={260} y={1110} s={0.6} />
    <Hut x={520} y={1130} s={0.5} />
  </>
);

// ——— Intro ———
const P01: React.FC = () => {
  const {soft} = usePage();
  const sun = soft(40);
  return (
    <Stage bg={M.sky}>
      <Cam dx={-40} z1={1.08}>
        <Countryside sky={interpolateColors(sun, [0, 1], ['#C9B8C8', M.sky])} />
        <Sun x={760} y={lerp(sun, [0, 1], [1080, 520], ease.linear)} />
        <Countryside sky="transparent" />
        <Castle x={600} y={1010} s={0.9} />
        <Tree x={130} y={1240} s={1.2} />
        <Tree x={980} y={1260} s={1} />
      </Cam>
    </Stage>
  );
};

// ——— Niveau 1 : le paysan ———
const P02: React.FC = () => {
  const {soft} = usePage();
  const t = soft(30);
  return (
    <Stage bg={M.skyWarm}>
      <Cam z1={1.04} plat>
        <rect x={-600} y={-600} width={2280} height={3200} fill={M.skyWarm} />
        <Steps n={1} t={t} />
        {Array.from({length: 10}, (_, i) => (
          <Person key={i} x={120 + i * 92} y={1200} s={0.42} tunic={i < 9 ? M.tunicBrown : M.royalBlue} hat={i < 9 ? 'capuche' : 'aucun'} opacity={i < 9 ? 0.35 + t * 0.65 : 0.35} />
        ))}
        <Person x={225} y={1060} s={0.9 * t + 0.001} tunic={M.tunicBrown} hat="capuche" opacity={t} />
      </Cam>
    </Stage>
  );
};

const P03: React.FC = () => {
  const {soft} = usePage();
  const t = soft(30);
  return (
    <Stage bg={M.plank}>
      <Cam dx={-30} z1={1.05}>
        <Interior fire={1} />
        <Cradle x={360} y={1440} s={1.1} />
        <Person x={250} y={1500} s={1.1} tunic={M.dress} hat="voile" robe arm={40} />
        <g opacity={t}>
          <Cow x={lerp(t, [0, 1], [1250, 900], ease.inOut)} y={1520} s={0.9} flip />
          <Pig x={lerp(t, [0, 1], [1200, 700], ease.inOut)} y={1620} s={0.8} flip />
        </g>
      </Cam>
    </Stage>
  );
};

const P04: React.FC = () => {
  const {f, soft} = usePage();
  const t = soft(40);
  return (
    <Stage bg={M.sky}>
      <Cam dx={40}>
        <Countryside />
        <Village />
        <Person x={460} y={1500} s={0.85} tunic={M.tunicGreen} arm={lerp(t, [0, 1], [10, 120])} />
        <g transform="translate(410 1330)" filter="url(#pp)">
          <rect x={-70} y={-24} width={140} height={22} rx={8} fill={M.timber} />
          <rect x={-60} y={-46} width={120} height={22} rx={8} fill={M.plankDark} />
        </g>
        {[0, 1, 2].map((k) => (
          <Crow key={k} x={640 + k * 120 + t * (260 + k * 60)} y={1380 - k * 40 - t * (520 + k * 80)} s={1.4} flap={Math.sin(f / 4 + k) * 0.5 + 0.5} />
        ))}
      </Cam>
    </Stage>
  );
};

const P05: React.FC = () => {
  const {soft} = usePage();
  const t = soft(40);
  return (
    <Stage bg={M.sky}>
      <Cam dx={-30}>
        <Countryside />
        <Castle x={240} y={1060} s={0.6} />
        <Church x={860} y={1100} s={0.75} />
        {Array.from({length: 10}, (_, i) => {
          const last = i === 9;
          const x = 160 + (i % 5) * 150 + (last ? t * 330 : 0);
          const y = 1560 + Math.floor(i / 5) * 150 - (last ? t * 160 : 0);
          return <Sack key={i} x={x} y={y} s={0.9} c={last ? '#E2C27E' : '#C9A66B'} />;
        })}
      </Cam>
    </Stage>
  );
};

const P06: React.FC = () => {
  const {soft} = usePage();
  const t = soft(30);
  return (
    <Stage bg={M.sky}>
      <Cam z1={1.07}>
        <Countryside />
        <Tree x={540} y={1300} s={1.6} c="#6E9A52" />
        <Person x={420} y={1480} s={1} tunic={M.tunicGreen} hat="aucun" arm={30} />
        <Person x={660} y={1480} s={0.95} tunic={M.dress} hat="voile" robe flip armL={-30} />
        <g opacity={t}>
          {[-1, 0, 1].map((k) => (
            <Flower key={k} x={540 + k * 60} y={1140 - Math.abs(k) * 20} s={0.9} c={k === 0 ? '#D9534F' : '#F2A33A'} />
          ))}
        </g>
      </Cam>
    </Stage>
  );
};

const P07: React.FC = () => {
  const {soft} = usePage();
  const t = soft(40);
  return (
    <Stage bg={M.skyWarm}>
      <Cam z1={1.04}>
        <Countryside sky={M.skyWarm} />
        <Hut x={540} y={1150} s={1} />
        <Person x={180} y={1560} s={0.95} tunic={M.tunicGreen} />
        <Person x={330} y={1560} s={0.9} tunic={M.dress} hat="voile" robe />
        {Array.from({length: 7}, (_, i) => (
          <Person
            key={i}
            x={450 + i * 82}
            y={1560}
            s={0.38 + (i % 3) * 0.06}
            tunic={[M.tunicBlue, M.tunicRed, M.tunicBrown, M.tunicGreen][i % 4]}
            hair={i % 2 ? M.hairLight : M.hair}
            opacity={i >= 5 ? 1 - t * 0.8 : 1}
          />
        ))}
      </Cam>
    </Stage>
  );
};

const P08: React.FC = () => {
  const {f, soft} = usePage();
  const t = soft(40);
  return (
    <Stage bg={M.skyGrey}>
      <Cam dx={-30}>
        <Countryside sky={interpolateColors(t, [0, 1], [M.sky, M.skyGrey])} field={interpolateColors(t, [0, 1], [M.field, '#B9A066'])} />
        {[0, 1, 2].map((k) => (
          <Cloudy key={k} x={-80 + k * 380} y={300 + (k % 2) * 80} s={1.5} c={interpolateColors(t, [0, 1], ['#FFFFFF', '#8E949C'])} />
        ))}
        {Array.from({length: 18}, (_, i) => (
          <g key={i} transform={`translate(${-20 + i * 64} ${1640 + (i % 3) * 30})`}>
            <Wheat wilt={t * 0.9} seed={`w${i}`} h={240} />
          </g>
        ))}
        <Rain t={t} f={f} />
      </Cam>
    </Stage>
  );
};

const P09: React.FC = () => {
  const {soft} = usePage();
  const t = soft(40);
  return (
    <Stage bg={M.plank}>
      <Cam z1={1.06} cy={1100}>
        <Interior fire={0.4} />
        <Table x={540} y={1300} w={720} />
        <Bowl x={380} y={1270} s={1.1} fill={0} />
        <Bowl x={700} y={1270} s={1.1} fill={0} />
        <Sack x={540} y={1268} s={0.8 - t * 0.25} c="#B89A64" />
        <Person x={160} y={1620} s={1} tunic={M.tunicBrown} hat="capuche" />
        <Person x={920} y={1620} s={0.6} tunic={M.tunicBlue} flip />
      </Cam>
    </Stage>
  );
};

const P10: React.FC = () => {
  const {soft} = usePage();
  const t = soft(50);
  return (
    <Stage bg={M.night}>
      <Cam z1={1.08} cy={1150}>
        <Interior fire={0} dark={0.55} window={0} />
        <Cradle x={600} y={1460} s={1.4} baby={1 - t} />
        <Candle x={300} y={1300} s={1.3} lit={1 - t} />
      </Cam>
    </Stage>
  );
};

const P11: React.FC = () => {
  const {f, soft} = usePage();
  const t = soft(30);
  return (
    <Stage bg="#C9D3DC">
      <Cam z1={1.06}>
        <Countryside sky="#C9D3DC" winter />
        <Hut x={820} y={1180} s={0.7} snow />
        <Tree x={180} y={1300} s={1.1} bare />
        <GraveCross x={540} y={1460} s={1.3} />
        <g opacity={t}>
          <Flower x={600} y={1470} s={1} />
        </g>
        <Snow t={1} f={f} />
      </Cam>
    </Stage>
  );
};

const P12: React.FC = () => {
  const {soft} = usePage();
  const t = soft(24);
  return (
    <Stage bg={M.plank}>
      <Cam dx={-30} cy={1150}>
        <Interior fire={0.6} />
        <Bed x={420} y={1520} />
        <Person x={640} y={1385} s={0.95} tunic={M.tunicBrown} lie />
        <Blanket x={480} y={1430} s={0.95} />
        <Person x={860} y={1560} s={1.05} tunic={M.tunicGreen} hat="capuche" flip arm={70 * t} />
        <g transform={`translate(760 ${1180 - t * 20}) rotate(${-30 + t * 10})`} opacity={0.4 + t * 0.6} filter="url(#pp)">
          <polygon points="0,0 120,-14 120,14" fill={M.steel} />
          <rect x={-60} y={-10} width={60} height={20} rx={6} fill={M.timber} />
        </g>
        <Bowl x={640} y={1600} s={0.8} fill={0.6} />
      </Cam>
    </Stage>
  );
};

const P13: React.FC = () => {
  const {soft} = usePage();
  const t = soft(60);
  return (
    <Stage bg={M.plank}>
      <Cam z1={1.03} cy={1100}>
        <Interior fire={1 - t} window={1 - t} dark={t * 0.5} />
        <Bed x={420} y={1520} />
        <Blanket x={220} y={1380} s={1} />
        <Cradle x={860} y={1560} s={0.9} baby={0} />
      </Cam>
    </Stage>
  );
};

// ——— Niveau 2 : l'artisan ———
const P14: React.FC = () => {
  const {soft} = usePage();
  const t = soft(30);
  return (
    <Stage bg={M.sky}>
      <Cam z1={1.05}>
        <TownStreet />
        <g transform="translate(470 820)">
          <rect x={-4} y={-20} width={180} height={10} fill={M.timber} />
          <g transform={`translate(150 -10) rotate(${(1 - t) * -25})`} opacity={t}>
            <rect x={-2} y={0} width={4} height={40} fill={M.timber} />
            <Shoe x={0} y={120} s={0.8} />
          </g>
        </g>
        <Person x={500} y={1450} s={1} tunic={M.tunicBlue} hat="bonnet" />
        <Person x={660} y={1450} s={0.5} tunic={M.tunicRed} />
      </Cam>
    </Stage>
  );
};

const P15: React.FC = () => {
  const {soft} = usePage();
  const t = soft(40);
  return (
    <Stage bg={M.sky}>
      <Cam dx={50}>
        <Countryside />
        <Castle x={820} y={1080} s={0.55} />
        <path d="M 100 1900 Q 400 1400 760 1100" stroke={M.dirt} strokeWidth={120} fill="none" filter="url(#pp)" />
        <Person x={360} y={1560} s={0.65} tunic={M.tunicRed} />
        <Sack x={410} y={1290} s={0.35} />
        <Hourglass x={760} y={600} s={0.9} r={t * 180} t={t} />
      </Cam>
    </Stage>
  );
};

const P16: React.FC = () => {
  const {soft} = usePage();
  const t = soft(24);
  return (
    <Stage bg={M.plank}>
      <Cam z1={1.06} cy={1150}>
        <Interior fire={0.5} />
        <Workbench x={460} y={1500} />
        <Shoe x={300} y={1236} s={0.6} />
        <Shoe x={480} y={1236} s={0.6} r={-8} />
        <Person x={420} y={1480} s={0.5} tunic={M.tunicRed} lie />
        <Blanket x={430} y={1480} s={0.55} />
        <Person x={880} y={1560} s={1.1} tunic={M.tunicBlue} hat="bonnet" flip arm={20 + t * 90} />
      </Cam>
    </Stage>
  );
};

const P17: React.FC = () => {
  const {soft} = usePage();
  const t = soft(50);
  return (
    <Stage bg={M.sky}>
      <Cam dx={-40}>
        <TownStreet />
        <Pig x={lerp(t, [0, 1], [-200, 300], ease.inOut)} y={1700} s={1} />
        <Pig x={lerp(t, [0, 1], [1300, 820], ease.inOut)} y={1820} s={0.8} flip />
        <Person x={160} y={1450} s={0.8} tunic={M.tunicGreen} />
      </Cam>
    </Stage>
  );
};

const P18: React.FC = () => {
  const {soft} = usePage();
  const t = soft(30);
  return (
    <Stage bg={M.sky}>
      <Cam z1={1.07} cy={1050}>
        <TownStreet mud={false} />
        <g transform="translate(540 1180)" filter="url(#pp)">
          <rect x={-300} y={-300} width={600} height={300} fill={M.timber} />
          <rect x={-280} y={-280} width={560} height={260} fill={M.skyWarm} opacity={t} />
          <g transform={`translate(0 -300) rotate(${t * 0})`}>
            <rect x={-300} y={0} width={600} height={lerp(t, [0, 1], [300, 40])} fill={M.plankDark} />
          </g>
          <Shoe x={-120} y={-60} s={0.7} />
          <Shoe x={120} y={-60} s={0.7} />
        </g>
        <Person x={540} y={1460} s={1.1} tunic={M.tunicBlue} hat="bonnet" arm={t * 60} />
      </Cam>
    </Stage>
  );
};

const P19: React.FC = () => {
  const {soft} = usePage();
  const t = soft(60);
  return (
    <Stage bg={M.sky}>
      <Cam dx={30}>
        <rect x={-600} y={-600} width={2280} height={3200} fill={interpolateColors(t, [0, 1], [M.sky, '#B3B2B5'])} />
        <Sea y={1150} />
        <g filter="url(#pp)">
          <rect x={-100} y={1100} width={500} height={120} fill={M.plankDark} />
        </g>
        <Ship x={lerp(t, [0, 1], [1400, 640], ease.inOut)} y={1230} s={1.1} />
        <Person x={120} y={1110} s={0.6} tunic={M.tunicBlue} />
      </Cam>
    </Stage>
  );
};

const P20: React.FC = () => {
  const {soft} = usePage();
  const t = soft(60);
  const lit = Array.from({length: 10}, (_, k) => Math.max(0, 1 - lerp(t, [0, 1], [0, 1.6]) + k * 0.06));
  return (
    <Stage bg={M.night}>
      <Cam z1={1.04}>
        <TownStreet dusk={1} lit={lit} mud={false} />
        <Moon x={860} y={300} />
      </Cam>
    </Stage>
  );
};

const P21: React.FC = () => {
  const {soft} = usePage();
  const t = soft(50);
  return (
    <Stage bg={M.skyGrey}>
      <Cam z1={1.04} plat>
        <rect x={-600} y={-600} width={2280} height={3200} fill="#CFC6B4" />
        {Array.from({length: 9}, (_, i) => (
          <Person
            key={i}
            x={180 + (i % 3) * 360}
            y={640 + Math.floor(i / 3) * 400}
            s={0.75}
            tunic={[M.tunicBlue, M.tunicBrown, M.tunicRed][i % 3]}
            hat={i % 3 === 1 ? 'voile' : 'aucun'}
            robe={i % 3 === 1}
            opacity={i % 3 === 2 ? 1 - t * 0.85 : 1}
          />
        ))}
      </Cam>
    </Stage>
  );
};

// ——— Niveau 3 : le chevalier ———
const P22: React.FC = () => {
  const {soft} = usePage();
  const t = soft(30);
  return (
    <Stage bg={M.sky}>
      <Cam z1={1.05}>
        <Countryside />
        <Castle x={540} y={1120} s={1.1} flag={t} />
        <Person x={330} y={1560} s={1.15} tunic={M.royalBlue} cape={M.royal} />
        <g transform={`rotate(${t * 12} 640 1560)`}>
          <Person x={640} y={1560} s={0.6} tunic={M.tunicRed} flip />
        </g>
      </Cam>
    </Stage>
  );
};

const P23: React.FC = () => {
  const {soft} = usePage();
  const t = soft(30);
  return (
    <Stage bg={M.sky}>
      <Cam dx={-30}>
        <Countryside />
        <Castle x={820} y={1020} s={0.6} />
        <Horse x={300} y={1560} s={0.95} />
        <Person x={760} y={1580} s={0.85} tunic={M.tunicRed} flip arm={t * 70} />
        <g opacity={t} transform={`translate(690 ${1260 - t * 30})`}>
          <path d="M -50 0 L -50 -60 Q -50 -110 0 -112 Q 50 -110 50 -60 L 50 0 Z" fill={M.steel} filter="url(#pp)" />
        </g>
      </Cam>
    </Stage>
  );
};

const P24: React.FC = () => {
  const {soft} = usePage();
  const t = soft(30);
  return (
    <Stage bg={M.stoneDark}>
      <Cam z1={1.07} cy={1050}>
        <ThroneRoom />
        <Person x={330} y={1560} s={1.2} tunic={M.royalBlue} cape={M.royal} hat="couronne" />
        <g transform="translate(640 1560) scale(0.9)">
          <Person x={0} y={0} s={1} tunic={M.tunicRed} flip />
        </g>
        <Sword x={420} y={1150} s={0.9} r={lerp(t, [0, 1], [40, 100])} />
      </Cam>
    </Stage>
  );
};

const P25: React.FC = () => {
  const {soft} = usePage();
  const t = soft(30);
  return (
    <Stage bg={M.skyGrey}>
      <Cam z1={1.09} cy={1000}>
        <Countryside sky={M.skyGrey} hill="#8A9A6A" field="#9C8E64" />
        <Person x={540} y={1650} s={2.1} armor hat="heaume" cape={M.tunicRed} />
        <g opacity={t * 0.8}>
          <path d="M 470 850 L 520 800 L 540 860 Z" fill="#FFFFFF" />
        </g>
      </Cam>
    </Stage>
  );
};

const P26: React.FC = () => {
  const {soft} = usePage();
  const t = soft(50);
  return (
    <Stage bg={M.night}>
      <Cam dx={-30}>
        <rect x={-600} y={-600} width={2280} height={3200} fill={M.night} />
        <Stars />
        <Moon x={820} y={300} />
        <path d="M -600 1250 Q 540 1150 1680 1250 L 1680 2600 L -600 2600 Z" fill="#3F4A3A" filter="url(#pp)" />
        {[0, 1, 2, 3].map((k) => (
          <Tent key={k} x={140 + k * 270} y={1300 + (k % 2) * 60} s={0.9} c={k % 2 ? '#C9BFA6' : M.plaster} lit={Math.max(0, 1 - t * 1.4 + k * 0.15)} />
        ))}
      </Cam>
    </Stage>
  );
};

const P27: React.FC = () => {
  const {soft} = usePage();
  const t = soft(50);
  return (
    <Stage bg={M.stoneDark}>
      <Cam z1={1.05} cy={1000} plat>
        <rect x={-600} y={-600} width={2280} height={3200} fill={M.stone} />
        {Array.from({length: 12}, (_, i) => (
          <g key={i} opacity={i < 4 ? 1 : 1 - t * 0.7}>
            <Shield x={190 + (i % 4) * 235} y={300 + Math.floor(i / 4) * 250} s={0.8} c={i < 4 ? M.tunicRed : interpolateColors(t, [0, 1], [M.tunicBlue, '#7D7A76'])} />
          </g>
        ))}
        <Person x={540} y={1240} s={0.8} armor hat="aucun" cape={M.tunicRed} />
      </Cam>
    </Stage>
  );
};

// ——— Niveau 4 : le roi ———
const P28: React.FC = () => {
  const {soft} = usePage();
  const t = soft(40);
  return (
    <Stage bg={M.stoneDark}>
      <Cam z1={1.07} cy={1050}>
        <ThroneRoom />
        <Throne x={540} y={1500} s={1} />
        <Person x={540} y={1500} s={0.8} tunic={M.royalBlue} cape={M.royal} />
        <g transform={`translate(540 ${lerp(t, [0, 1], [500, 1006], ease.inOut)}) scale(0.8)`}>
          <polygon points="-40,0 -40,-44 -20,-20 0,-50 20,-20 40,-44 40,0" fill={M.gold} filter="url(#pp)" />
        </g>
        <Person x={220} y={1560} s={0.9} tunic={M.tunicGrey} hat="capuche" />
      </Cam>
    </Stage>
  );
};

const P29: React.FC = () => {
  const {soft} = usePage();
  const t = soft(50);
  return (
    <Stage bg={M.stoneDark}>
      <Cam z1={1.05} cy={1050}>
        <ThroneRoom />
        <Throne x={540} y={1450} s={0.9} />
        <Person x={540} y={1450} s={0.75} tunic={M.royalBlue} cape={M.royal} hat="couronne" />
        {[180, 900, 330].map((px, k) => (
          <g key={k}>
            <ellipse cx={px + (540 - px) * 0.3 * t} cy={1600} rx={120 + t * 160} ry={30} fill="#000" opacity={0.25 + t * 0.15} />
            <Person x={px} y={1600 + (k === 2 ? 60 : 0)} s={1.05} tunic={[M.tunicGreen, M.tunicRed, M.dress][k]} flip={px > 540} />
          </g>
        ))}
      </Cam>
    </Stage>
  );
};

const P30: React.FC = () => {
  const {soft} = usePage();
  const t = soft(30);
  return (
    <Stage bg={M.stoneDark}>
      <Cam z1={1.07} cy={1150}>
        <ThroneRoom />
        <Table x={540} y={1380} w={760} />
        <Goblet x={430 + t * 60} y={1350 - t * 140} s={1.1} r={-t * 30} />
        <Bowl x={700} y={1350} s={0.9} fill={1} />
        <Person x={560} y={1600} s={0.9} tunic={M.tunicGrey} arm={t * 100} />
        <Person x={900} y={1600} s={1.05} tunic={M.royalBlue} cape={M.royal} hat="couronne" flip />
      </Cam>
    </Stage>
  );
};

const P31: React.FC = () => {
  const {f, soft} = usePage();
  const t = soft(40);
  return (
    <Stage bg={M.skyGrey}>
      <Cam dx={-40}>
        <Countryside sky={M.skyGrey} />
        <Castle x={540} y={1150} s={0.9} />
        {[0, 1, 2, 3, 4].map((k) => (
          <g key={k} transform={`translate(${120 + k * 210} ${1520 - t * 60})`} opacity={t}>
            <rect x={-4} y={-300} width={8} height={300} fill={M.timber} />
            <path d={`M 4 -300 Q 60 ${-290 + Math.sin(f / 10 + k) * 6} 110 -296 L 110 -220 Q 60 -214 4 -226 Z`} fill={[M.tunicGreen, '#2B2A33', M.tunicGreen, '#2B2A33', M.tunicGreen][k]} />
          </g>
        ))}
        <Chest x={540} y={1780} s={0.8} open={1} coins={0} />
      </Cam>
    </Stage>
  );
};

const P32: React.FC = () => {
  const {soft} = usePage();
  const t = soft(50);
  return (
    <Stage bg={M.sky}>
      <Cam z1={1.05}>
        <Countryside hill="#6E9A52" field="#7DA35E" />
        {[80, 260, 860, 1010].map((x, k) => (
          <Tree key={k} x={x} y={1300 + (k % 2) * 40} s={1.3} c="#4F7A3E" />
        ))}
        <Horse x={420} y={1560} s={0.9} />
        <g transform={`translate(${lerp(t, [0, 1], [500, 760])} ${lerp(t, [0, 1], [1100, 1620], ease.in)}) rotate(${t * 220})`}>
          <polygon points="-40,0 -40,-44 -20,-20 0,-50 20,-20 40,-44 40,0" fill={M.gold} filter="url(#pp)" />
        </g>
      </Cam>
    </Stage>
  );
};

// ——— La chute ———
const P33: React.FC = () => {
  const {soft} = usePage();
  const t = soft(40);
  return (
    <Stage bg={M.skyWarm}>
      <Cam z1={1.04} plat>
        <rect x={-600} y={-600} width={2280} height={3200} fill="#E9DCC3" />
        <Person x={160} y={1230} s={0.8} tunic={M.tunicBrown} hat="capuche" opacity={1 - t * 0.5} />
        <Person x={400} y={1230} s={0.8} tunic={M.tunicBlue} hat="bonnet" opacity={1 - t * 0.5} />
        <Person x={660} y={1230} s={0.8} armor hat="aucun" cape={M.tunicRed} opacity={1 - t * 0.5} />
        <Person x={910} y={1230} s={0.8} tunic={M.royalBlue} cape={M.royal} hat="couronne" opacity={1 - t * 0.5} />
        {/* la carte du cours Sophia (capture de l'admin), posée comme un tirage papier */}
        <g opacity={t} transform={`translate(540 ${lerp(t, [0, 1], [560, 500])}) rotate(${-3 + t * 3})`}>
          <rect x={-380} y={-300} width={760} height={600} rx={30} fill={C.white} filter="url(#ppl)" />
          <foreignObject x={-360} y={-280} width={720} height={560}>
            <div style={{width: 720, height: 560, overflow: 'hidden', borderRadius: 22}}>
              <Img src={staticFile('sophia-home.webp')} style={{width: 720, marginTop: -170}} />
            </div>
          </foreignObject>
        </g>
      </Cam>
    </Stage>
  );
};

const P34: React.FC = () => {
  const {soft} = usePage();
  const t = soft(40);
  return (
    <Stage bg={M.skyWarm}>
      <Cam z1={1.04} plat>
        <rect x={-600} y={-600} width={2280} height={3200} fill="#E9DCC3" />
        <g filter="url(#pp)">
          <rect x={120} y={780} width={840} height={24} rx={12} fill={M.timber} />
          {[0, 1, 2, 3, 4, 5, 6].map((k) => (
            <rect key={k} x={120 + k * 140 - 4} y={760} width={8} height={64} fill={M.timber} />
          ))}
        </g>
        <g transform={`translate(${120 + 140 * 3} 740)`} opacity={t}>
          <polygon points="-30,-60 30,-60 0,0" fill={M.tunicRed} filter="url(#pp)" />
        </g>
        {Array.from({length: 6}, (_, i) => (
          <Person key={i} x={150 + i * 40} y={1200} s={0.3} tunic={M.tunicBlue} opacity={0.9 - t * 0.6} />
        ))}
        <Person x={780} y={1200} s={0.9} tunic={M.tunicBrown} hair={M.hairGrey} />
        <Person x={900} y={1200} s={0.85} tunic={M.dress} hat="voile" robe />
      </Cam>
    </Stage>
  );
};

const P35: React.FC = () => {
  const {soft} = usePage();
  const t = soft(60);
  return (
    <Stage bg={M.skyWarm}>
      <Cam z1={1.06}>
        <Countryside sky={interpolateColors(t, [0, 1], [M.sky, '#F2C38C'])} />
        <Sun x={540} y={lerp(t, [0, 1], [500, 900])} c="#F4A94A" />
        <Countryside sky="transparent" />
        <Tree x={760} y={1320} s={1.4} />
        <Person x={420} y={1540} s={1} tunic={M.tunicBrown} hair={M.hairGrey} arm={20} />
        <Person x={560} y={1540} s={0.95} tunic={M.dress} hat="voile" robe flip />
        <rect x={496} y={1300} width={10} height={240} fill={M.timber} transform="rotate(8 500 1540)" />
      </Cam>
    </Stage>
  );
};

const P36: React.FC = () => {
  const {soft} = usePage();
  const t = soft(50);
  return (
    <Stage bg={M.plank}>
      <Cam z1={1.06} cy={1100}>
        <Interior fire={0.8} />
        <Tub x={340} y={1520} s={1} />
        <Tub x={780} y={1540} s={0.9} />
        <circle cx={300} cy={1260} r={44} fill={M.skin} />
        <circle cx={790} cy={1300} r={40} fill={M.skin} />
        <path d="M 260 1240 Q 300 1200 340 1240" fill={M.hair} />
        <Steam x={340} y={1300} t={0.3 + t * 0.7} seed="a" />
        <Steam x={780} y={1340} t={0.3 + t * 0.7} seed="b" />
      </Cam>
    </Stage>
  );
};

export const TABLEAUX: React.FC[] = [
  P01, P02, P03, P04, P05, P06, P07, P08, P09, P10, P11, P12, P13, P14, P15, P16, P17, P18,
  P19, P20, P21, P22, P23, P24, P25, P26, P27, P28, P29, P30, P31, P32, P33, P34, P35, P36,
];
