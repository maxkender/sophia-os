// Les 36 pages du récit, chacune en 1 à 3 plans (coupés sur la voix, timeline.ts) : des personnages
// expressifs qui font ce que dit la phrase, des gags visuels sur le quotidien, du sérieux sur les drames.
import React, {createContext, useContext} from 'react';
import {Img, interpolateColors, staticFile} from 'remotion';
import {C, ease, lerp, useFrame} from '../lib';
import {Stage} from '../Stage';
import {
  Bed,
  Blanket,
  Bowl,
  Bubbles,
  Candle,
  Castle,
  Chest,
  Church,
  Cloudy,
  Countryside,
  Cow,
  Cradle,
  Crow,
  Fireflies,
  Flies,
  Flower,
  GraveCross,
  Halo,
  Horse,
  Hut,
  Interior,
  Latrine,
  M,
  Moon,
  Moth,
  Person,
  Pig,
  Rain,
  Rat,
  Sack,
  Sea,
  Seesaw,
  Shield,
  Ship,
  Shoe,
  Snow,
  Sparkles,
  Stars,
  Stars2,
  Steam,
  Sun,
  Table,
  Tent,
  Throne,
  ThroneRoom,
  TownStreet,
  Tree,
  Tub,
  WindowBucket,
  Workbench,
} from '../medieval';
import {Wheat} from '../volcan';

/** La page en cours : durée, moment fort (mot repère) et débuts des plans, fournis par Main d'après la voix */
export const PageContext = createContext<{d: number; m: number; plans: number[]}>({d: 180, m: 60, plans: [0, 90]});
const PlanContext = createContext<{de: number; a: number}>({de: 0, a: 180});

type Outils = {f: number; pf: number; t: (dur?: number, decal?: number) => number; plan: number};
type Plan = (o: Outils) => React.ReactElement;

/** Une page = une liste de plans ; on en montre autant que la voix en a découpés */
const page = (defs: Plan[]): React.FC & {nPlans: number} => {
  const Page: React.FC = () => {
    const f = useFrame();
    const {d, m, plans} = useContext(PageContext);
    const n = Math.min(plans.length, defs.length);
    const debuts = plans.slice(0, n);
    let i = 0;
    for (let k = 0; k < n; k++) if (f >= debuts[k]) i = k;
    const idx = n === 1 ? 0 : Math.round((i * (defs.length - 1)) / (n - 1));
    const de = debuts[i];
    const a = i + 1 < n ? debuts[i + 1] : d;
    const t = (dur = 22, decal = 0) => lerp(f, [m + decal, m + decal + dur], [0, 1], ease.inOut);
    const Def = defs[idx];
    return (
      <PlanContext.Provider value={{de, a}}>
        <Def f={f} pf={f - de} t={t} plan={idx} />
      </PlanContext.Provider>
    );
  };
  return Object.assign(Page, {nPlans: defs.length});
};

/** Plan affiché (index dans la page) pour chaque plan réel découpé par la voix */
export const plansAffiches = (nDefs: number, debuts: number[]) => {
  const n = Math.min(debuts.length, nDefs);
  return Array.from({length: n}, (_, i) => ({de: debuts[i], idx: n === 1 ? 0 : Math.round((i * (nDefs - 1)) / (n - 1))}));
};

/** Caméra d'un plan : le point (cx, cy) du décor est cadré au-dessus des sous-titres ; entrée en « punch », glissement,
 *  et petite poussée sur le moment fort s'il tombe dans le plan */
const Cam: React.FC<{children: React.ReactNode; cx?: number; cy?: number; z?: number; dx?: number; dz?: number; rot?: number}> = ({
  children,
  cx = 540,
  cy = 1210,
  z = 1.15,
  dx = 70,
  dz = 0.07,
  rot = 0,
}) => {
  const f = useFrame();
  const {de, a} = useContext(PlanContext);
  const {m} = useContext(PageContext);
  const t = lerp(f, [de, a], [0, 1], ease.linear);
  const punch = lerp(f, [de, de + 12], [0.12, 0], ease.out);
  const pousse = m >= de && m < a ? lerp(f, [m - 2, m + 12], [0, 0.07], ease.out) : 0;
  const zz = z * (1 + dz * t + punch + pousse);
  const r = rot + (dx >= 0 ? 1 : -1) * lerp(t, [0, 1], [-0.8, 0.8], ease.linear);
  return <g transform={`translate(540 ${820 + 140}) rotate(${r}) scale(${zz}) translate(${-(cx + dx * (t - 0.5))} ${-cy})`}>{children}</g>;
};

/** Gros plan sur un visage : le personnage à (x, y) (pieds), échelle s */
const GrosPlan: React.FC<{x: number; y: number; s: number; z?: number; children: React.ReactNode; dx?: number}> = ({x, y, s, z = 2.6, children, dx = 20}) => (
  <Cam cx={x} cy={y - 300 * s + 120} z={z} dx={dx} dz={0.05}>
    {children}
  </Cam>
);

const Village: React.FC = () => (
  <>
    <Church x={820} y={1080} s={0.7} />
    <Hut x={260} y={1110} s={0.6} />
    <Hut x={520} y={1130} s={0.5} />
  </>
);

// ——— Intro ———
const P01 = page([
  ({t}) => (
    <Stage bg={M.sky}>
      <Cam dx={-60} z={1.1}>
        <Countryside sky={interpolateColors(t(40), [0, 1], ['#C9B8C8', M.sky])} />
        <Sun x={760} y={lerp(t(40), [0, 1], [1080, 520], ease.linear)} />
        <Countryside sky="transparent" />
        <Castle x={600} y={1010} s={0.9} />
        <Tree x={130} y={1240} s={1.2} />
        <Tree x={980} y={1260} s={1} />
      </Cam>
    </Stage>
  ),
  () => (
    <Stage bg={M.sky}>
      <Cam z={1.5} cy={1250}>
        <Countryside />
        <Village />
        <Person x={540} y={1560} s={1.3} tunic={M.tunicBrown} hat="capuche" face="louche" arm={150} />
      </Cam>
    </Stage>
  ),
]);

// ——— Niveau 1 : le paysan ———
const P02 = page([
  ({t}) => (
    <Stage bg={M.sky}>
      <Cam dx={-90}>
        <Countryside />
        <Village />
        {Array.from({length: 10}, (_, i) => (
          <Person key={i} x={90 + i * 100} y={1440 - (i % 2) * 30} s={0.55} tunic={i === 4 ? M.royalBlue : M.tunicBrown} hat={i === 4 ? 'aucun' : 'capuche'} cape={i === 4 ? M.royal : undefined} beard={i === 4 ? M.hair : undefined} face={i === 4 ? 'fier' : 'neutre'} opacity={i === 4 ? 1 - t(30) * 0.7 : 1} />
        ))}
      </Cam>
    </Stage>
  ),
  () => (
    <Stage bg={M.sky}>
      <GrosPlan x={540} y={1560} s={1.2} z={2.2}>
        <Countryside />
        <Village />
        <Person x={540} y={1560} s={1.2} tunic={M.tunicBrown} hat="capuche" face="rire" arm={120} tool="faux" />
      </GrosPlan>
    </Stage>
  ),
]);

const P03 = page([
  () => (
    <Stage bg={M.plank}>
      <Cam dx={-40}>
        <Interior fire={1} />
        <Bed x={420} y={1520} />
        <Person x={640} y={1385} s={0.95} tunic={M.tunicBrown} lie face="dort" />
        <Blanket x={480} y={1430} s={0.95} />
        <Cradle x={820} y={1560} s={0.8} />
      </Cam>
    </Stage>
  ),
  ({t}) => (
    <Stage bg={M.plank}>
      <Cam z={1.7} cx={560} cy={1340} dx={30}>
        <Interior fire={1} />
        <Bed x={420} y={1520} />
        <Person x={640} y={1385} s={0.95} tunic={M.tunicBrown} lie face={t(10) > 0.5 ? 'choc' : 'dort'} />
        <Blanket x={480} y={1430} s={0.95} />
        <Cow x={lerp(t(26), [0, 1], [1200, 920], ease.out)} y={1500} s={0.85} flip />
        <Pig x={lerp(t(26, 8), [0, 1], [1200, 760], ease.out)} y={1640} s={0.7} flip />
      </Cam>
    </Stage>
  ),
]);

const P04 = page([
  ({f, t}) => (
    <Stage bg={M.sky}>
      <Cam dx={60}>
        <Countryside />
        <Village />
        <Person x={420} y={1520} s={0.75} tunic={M.tunicGreen} face="colere" arm={120 + Math.sin(f / 3) * 30} tool="baton" bounce={0.5} pop={false} />
        {[0, 1, 2].map((k) => (
          <Crow key={k} x={640 + k * 120 + t(30, -30) * (260 + k * 60)} y={1420 - k * 40 - t(30, -30) * (520 + k * 80)} s={1.4} flap={Math.sin(f / 3 + k) * 0.5 + 0.5} />
        ))}
      </Cam>
    </Stage>
  ),
  ({f}) => (
    <Stage bg={M.sky}>
      <Cam z={1.5} dx={-50}>
        <Countryside />
        <Person x={420 + Math.sin(f / 9) * 30} y={1560} s={0.8} tunic={M.tunicGreen} face="peur" arm={150} armL={-150} tool="fagot" walk={0.8} pop={false} />
      </Cam>
    </Stage>
  ),
  ({pf}) => (
    <Stage bg={M.sky}>
      <Cam z={1.3} dx={-80}>
        <Countryside />
        <Pig x={300 + pf * 6} y={1640} s={0.9} />
        <Person x={160 + pf * 5} y={1600} s={0.75} tunic={M.tunicGreen} face="choc" arm={100} walk={1.6} pop={false} />
      </Cam>
    </Stage>
  ),
]);

const P05 = page([
  () => (
    <Stage bg={M.sky}>
      <Cam dx={-60}>
        <Countryside />
        <Castle x={820} y={1050} s={0.6} />
        <Horse x={300} y={1560} s={0.9} />
        <Person x={330} y={1300} s={0.85} tunic={M.royal} cape={M.royalBlue} beard={M.hair} face="fier" belly arm={100} />
        <Person x={780} y={1580} s={0.85} tunic={M.tunicBrown} hat="capuche" face="triste" tool="faux" arm={20} />
      </Cam>
    </Stage>
  ),
  ({t}) => (
    <Stage bg={M.sky}>
      <Cam z={1.35} dx={60}>
        <Countryside />
        <Church x={860} y={1100} s={0.75} />
        {Array.from({length: 9}, (_, i) => (
          <Sack key={i} x={150 + (i % 5) * 120} y={1500 + Math.floor(i / 5) * 110} s={0.75} />
        ))}
        <Person x={lerp(t(30), [0, 1], [700, 900])} y={1560} s={0.85} tunic="#2B2A33" hat="mitre" face="rire" tool="sac" arm={60} walk={t(30) > 0 && t(30) < 1 ? 1 : 0} />
        <Person x={240} y={1560} s={0.8} tunic={M.tunicBrown} hat="capuche" face={t(10) > 0.5 ? 'choc' : 'neutre'} flip />
      </Cam>
    </Stage>
  ),
]);

const P06 = page([
  ({t}) => (
    <Stage bg={M.sky}>
      <Cam z={1.2}>
        <Countryside />
        <Tree x={540} y={1300} s={1.6} c="#6E9A52" />
        <Person x={lerp(t(30), [0, 1], [330, 440])} y={1520} s={1} tunic={M.tunicGreen} face="louche" />
        <Person x={lerp(t(30), [0, 1], [760, 650])} y={1520} s={0.95} tunic={M.dress} hat="voile" robe flip face="louche" />
        <Person x={180} y={1560} s={0.9} tunic={M.tunicBrown} hair={M.hairGrey} beard={M.hairGrey} arm={80} face="joie" />
        <Person x={900} y={1560} s={0.9} tunic={M.dress} hat="voile" robe flip arm={80} face="joie" />
      </Cam>
    </Stage>
  ),
  ({t}) => (
    <Stage bg={M.sky}>
      <GrosPlan x={440} y={1520} s={1} z={2.4}>
        <Countryside />
        <Tree x={540} y={1300} s={1.6} c="#6E9A52" />
        <Person x={440} y={1520} s={1} tunic={M.tunicGreen} face="peur" pop={false} />
        <Person x={650} y={1520} s={0.95} tunic={M.dress} hat="voile" robe flip face="joie" pop={false} />
        <g opacity={t(20)}>
          {[-1, 0, 1].map((k) => (
            <Flower key={k} x={545 + k * 50} y={1160 - Math.abs(k) * 20} s={0.8} c={k === 0 ? '#D9534F' : '#F2A33A'} />
          ))}
        </g>
      </GrosPlan>
    </Stage>
  ),
]);

const P07 = page([
  ({pf}) => (
    <Stage bg={M.skyWarm}>
      <Cam z={1.2}>
        <Countryside sky={M.skyWarm} />
        <Hut x={540} y={1150} s={1} />
        <Person x={180} y={1580} s={0.95} tunic={M.tunicGreen} face="choc" />
        <Person x={330} y={1580} s={0.9} tunic={M.dress} hat="voile" robe face="joie" />
        {Array.from({length: 7}, (_, i) =>
          pf > 4 + i * 6 ? <Person key={i} x={450 + i * 82} y={1580} s={0.4 + (i % 3) * 0.06} tunic={[M.tunicBlue, M.tunicRed, M.tunicBrown, M.tunicGreen][i % 4]} hair={i % 2 ? M.hairLight : M.hair} face="rire" bounce={0.4} /> : null,
        )}
      </Cam>
    </Stage>
  ),
  ({t}) => (
    <Stage bg={M.skyWarm}>
      <Cam z={1.5} cx={640} cy={1300} dx={20} dz={0.03}>
        <Countryside sky={M.skyWarm} />
        <Hut x={540} y={1150} s={1} />
        <Person x={330} y={1580} s={0.9} tunic={M.dress} hat="voile" robe face="triste" />
        {Array.from({length: 7}, (_, i) => (
          <g key={i} opacity={i >= 5 ? 1 - t(40) : 1}>
            <Person x={450 + i * 82} y={1580} s={0.4 + (i % 3) * 0.06} tunic={[M.tunicBlue, M.tunicRed, M.tunicBrown, M.tunicGreen][i % 4]} face={i >= 5 ? 'neutre' : 'triste'} pop={false} />
          </g>
        ))}
        {[5, 6].map((i) => (
          <g key={i} opacity={t(40)}>
            <Halo x={450 + i * 82} y={1360 - t(40) * 120} s={0.6} />
          </g>
        ))}
      </Cam>
    </Stage>
  ),
]);

const P08 = page([
  ({f, t}) => (
    <Stage bg={M.sky}>
      <Cam z={1.3}>
        <Countryside />
        <Cloudy x={430} y={lerp(t(20, -20), [0, 1], [200, 860])} s={1.3} c="#8E949C" />
        <g transform={`translate(0 0)`} opacity={t(10)}>
          {Array.from({length: 12}, (_, i) => {
            const y = 980 + ((f * 18 + i * 47) % 480);
            return <path key={i} d={`M ${470 + (i % 6) * 34} ${y} l -6 30`} stroke="#9FC3DB" strokeWidth={6} strokeLinecap="round" />;
          })}
        </g>
        <Person x={540} y={1560} s={1} tunic={M.tunicBrown} hat="capuche" face={t(10) > 0.5 ? 'triste' : 'joie'} tool="faux" arm={20} pop={false} />
      </Cam>
    </Stage>
  ),
  ({f, t}) => (
    <Stage bg={M.skyGrey}>
      <Cam z={1.25} dx={-40}>
        <Countryside sky={M.skyGrey} field="#B9A066" />
        {Array.from({length: 18}, (_, i) => (
          <g key={i} transform={`translate(${-20 + i * 64} ${1640 + (i % 3) * 30})`}>
            <Wheat wilt={0.3 + t(40) * 0.7} seed={`w${i}`} h={240} />
          </g>
        ))}
        <Rain t={1} f={f} />
      </Cam>
    </Stage>
  ),
]);

const P09 = page([
  () => (
    <Stage bg={M.plank}>
      <Cam z={1.25} cy={1250}>
        <Interior fire={0.4} />
        <Table x={540} y={1360} w={720} />
        <Bowl x={380} y={1330} s={1.1} fill={0} />
        <Bowl x={700} y={1330} s={1.1} fill={0} />
        <Person x={250} y={1620} s={1} tunic={M.tunicBrown} hat="capuche" face="triste" />
        <Person x={860} y={1620} s={0.7} tunic={M.tunicBlue} flip face="pleure" />
      </Cam>
    </Stage>
  ),
  ({t}) => (
    <Stage bg={M.plank}>
      <Cam z={1.3} dx={50}>
        <Interior fire={0.4} />
        <Person x={250} y={1620} s={1} tunic={M.tunicBrown} hat="capuche" face="louche" />
        <Person x={420} y={1620} s={0.7} tunic={M.tunicBlue} face="louche" />
        <Pig x={lerp(t(30), [0, 1], [760, 900])} y={1660} s={1} />
        <g opacity={t(20)}>
          <path d="M 950 1460 q 8 14 0 22 q -8 -8 0 -22 Z" fill={M.water} />
        </g>
      </Cam>
    </Stage>
  ),
]);

const P10 = page([
  ({t}) => (
    <Stage bg={M.night}>
      <Cam z={1.35} cy={1300} dx={20} dz={0.03}>
        <Interior fire={0} dark={0.55} window={0} />
        <Cradle x={600} y={1460} s={1.4} baby={1 - t(50)} />
        <Candle x={300} y={1300} s={1.3} lit={1 - t(50)} />
      </Cam>
    </Stage>
  ),
]);

const P11 = page([
  ({f}) => (
    <Stage bg="#C9D3DC">
      <Cam z={1.15} dz={0.04}>
        <Countryside sky="#C9D3DC" winter />
        <Hut x={820} y={1180} s={0.7} snow />
        <Tree x={180} y={1300} s={1.1} bare />
        <GraveCross x={540} y={1460} s={1.3} />
        <Snow t={1} f={f} />
      </Cam>
    </Stage>
  ),
  ({f, t}) => (
    <Stage bg="#C9D3DC">
      <Cam z={1.5} cx={560} cy={1320} dz={0.03}>
        <Countryside sky="#C9D3DC" winter />
        <GraveCross x={540} y={1460} s={1.3} />
        <Person x={760} y={1600} s={1} tunic={M.tunicBrown} hat="capuche" face="pleure" flip arm={40} />
        <g opacity={t(30)}>
          <Flower x={600} y={1470} s={1} />
        </g>
        <Snow t={1} f={f} />
      </Cam>
    </Stage>
  ),
]);

const P12 = page([
  () => (
    <Stage bg={M.plank}>
      <GrosPlan x={640} y={1385} s={0.95} z={1.9}>
        <Interior fire={0.6} />
        <Bed x={420} y={1520} />
        <Person x={640} y={1385} s={0.95} tunic={M.tunicBrown} lie face="malade" sick />
        <Blanket x={480} y={1430} s={0.95} />
      </GrosPlan>
    </Stage>
  ),
  ({t}) => (
    <Stage bg={M.plank}>
      <Cam z={1.3} dx={-40} cy={1260}>
        <Interior fire={0.6} />
        <Bed x={420} y={1520} />
        <Person x={640} y={1385} s={0.95} tunic={M.tunicBrown} lie face={t(10) > 0.5 ? 'peur' : 'malade'} sick />
        <Blanket x={480} y={1430} s={0.95} />
        <Person x={lerp(t(24), [0, 1], [1000, 860])} y={1560} s={1.05} tunic={M.tunicGreen} hat="capuche" flip face="rire" arm={100} tool="couteau" />
      </Cam>
    </Stage>
  ),
]);

const P13 = page([
  ({t}) => (
    <Stage bg={M.plank}>
      <Cam z={1.2} cy={1250} dz={0.03}>
        <Interior fire={1 - t(60)} window={1 - t(60)} dark={t(60) * 0.5} />
        <Bed x={420} y={1520} />
        <Blanket x={300} y={1380} s={1} />
        <Cradle x={860} y={1560} s={0.9} baby={0} />
      </Cam>
    </Stage>
  ),
]);

// ——— Niveau 2 : l'artisan ———
const P14 = page([
  ({f}) => (
    <Stage bg={M.sky}>
      <Cam dx={-80}>
        <TownStreet />
        <Person x={200 + ((f * 2) % 300)} y={1460} s={0.6} tunic={M.tunicRed} walk={1} pop={false} />
        <Person x={900 - ((f * 1.5) % 300)} y={1470} s={0.65} tunic={M.dress} hat="voile" robe flip walk={1} pop={false} />
      </Cam>
    </Stage>
  ),
  ({f}) => (
    <Stage bg={M.plank}>
      <Cam z={1.5} cy={1290}>
        <Interior fire={0.5} />
        <Workbench x={540} y={1520} />
        <Shoe x={560} y={1256} s={0.7} />
        <Person x={420} y={1540} s={1.05} tunic={M.tunicBlue} hat="bonnet" face="fier" tool="marteau" arm={90 + Math.abs(Math.sin(f / 3)) * 50} beard={M.hair} />
        <Person x={780} y={1560} s={0.55} tunic={M.tunicRed} face="joie" flip bounce={0.3} />
      </Cam>
    </Stage>
  ),
]);

const P15 = page([
  ({t}) => (
    <Stage bg={M.sky}>
      <Cam z={1.35}>
        <TownStreet mud={false} />
        <Person x={lerp(t(20), [0, 1], [520, 760], ease.out)} y={1470} s={0.65} tunic={M.tunicRed} face="choc" tool="sac" arm={30} />
        <Person x={420} y={1460} s={1.05} tunic={M.tunicBlue} hat="bonnet" beard={M.hair} arm={lerp(t(14), [0, 1], [10, 95])} face="neutre" />
      </Cam>
    </Stage>
  ),
  ({pf}) => (
    <Stage bg={M.sky}>
      <Cam dx={60} z={1.2}>
        <Countryside />
        <Castle x={820} y={1080} s={0.55} />
        <path d="M 100 1900 Q 400 1400 760 1100" stroke={M.dirt} strokeWidth={120} fill="none" filter="url(#pp)" />
        <Person x={260 + pf * 1.6} y={1620 - pf * 1.4} s={0.65} tunic={M.tunicRed} face="triste" tool="sac" arm={30} walk={0.8} pop={false} />
        <Cloudy x={240 + pf * 1.6} y={1060 - pf * 1.4} s={0.5} c="#8E949C" />
      </Cam>
    </Stage>
  ),
]);

const P16 = page([
  () => (
    <Stage bg={M.plank}>
      <Cam z={1.35} cy={1300}>
        <Interior fire={0.3} dark={0.3} />
        <Workbench x={460} y={1500} />
        <Person x={420} y={1480} s={0.5} tunic={M.tunicRed} lie face="dort" />
        <Blanket x={430} y={1480} s={0.55} />
        <Shoe x={300} y={1236} s={0.6} />
      </Cam>
    </Stage>
  ),
  ({t}) => (
    <Stage bg={M.plank}>
      <Cam z={1.4} cy={1300} dx={-40}>
        <Interior fire={0.5} />
        <Workbench x={460} y={1520} />
        <Person x={360} y={1560} s={0.65} tunic={M.tunicRed} face={t(10) > 0.5 ? 'sonne' : 'peur'} arm={50} />
        <Shoe x={lerp(t(12, -14), [0, 1], [330, 300])} y={lerp(t(12, -14), [0, 1], [1300, 1560], ease.in)} s={0.55} r={t(12, -14) * 120} />
        <Person x={720} y={1560} s={1.1} tunic={M.tunicBlue} hat="bonnet" flip face="colere" tool="baton" arm={lerp(t(10), [0, 1], [150, 60])} beard={M.hair} />
        {t(10) > 0.5 && <Stars2 x={360} y={1150} />}
      </Cam>
    </Stage>
  ),
]);

const P17 = page([
  ({t}) => (
    <Stage bg={M.sky}>
      <Cam z={1.3} dx={-30}>
        <TownStreet />
        <WindowBucket x={420} y={900} t={t(26, -10)} />
        <Person x={lerp(t(40, -40), [0, 1], [200, 470])} y={1470} s={0.8} tunic={M.tunicGreen} face={t(10, 8) > 0.5 ? 'degout' : 'joie'} walk={t(10, 8) > 0.5 ? 0 : 1} pop={false} />
        {t(10, 8) > 0.5 && <Flies x={470} y={1100} />}
      </Cam>
    </Stage>
  ),
  ({pf}) => (
    <Stage bg={M.sky}>
      <Cam z={1.4} dx={60}>
        <TownStreet />
        <Pig x={100 + pf * 5} y={1700} s={1} />
        <Pig x={900 - pf * 3} y={1820} s={0.8} flip />
        <Person x={800} y={1470} s={0.7} tunic={M.dress} hat="voile" robe face="choc" flip />
      </Cam>
    </Stage>
  ),
]);

const P18 = page([
  ({t}) => (
    <Stage bg={M.sky}>
      <Cam z={1.25} cy={1150}>
        <TownStreet mud={false} />
        <g transform="translate(540 1180)" filter="url(#pp)">
          <rect x={-300} y={-300} width={600} height={300} fill={M.timber} />
          <rect x={-280} y={-280} width={560} height={260} fill={M.skyWarm} opacity={t(20)} />
          <rect x={-300} y={-300} width={600} height={lerp(t(20), [0, 1], [300, 40])} fill={M.plankDark} />
          <Shoe x={-120} y={-60} s={0.7} />
          <Shoe x={120} y={-60} s={0.7} />
        </g>
        <Person x={540} y={1470} s={1.1} tunic={M.tunicBlue} hat="bonnet" face="fier" arm={150} armL={-150} bounce={t(10)} />
        {t(20) > 0.5 && <Sparkles x={540} y={1050} r={260} />}
      </Cam>
    </Stage>
  ),
  ({pf}) => (
    <Stage bg={M.sky}>
      <Cam z={1.3} dx={-60}>
        <TownStreet mud={false} />
        <Person x={900} y={1470} s={1} tunic={M.tunicBlue} hat="bonnet" face="rire" flip tool="chaussure" arm={90} />
        {[0, 1, 2, 3].map((k) => (
          <Person key={k} x={Math.min(700 - k * 140, 120 + pf * 6 - k * 140)} y={1480} s={0.75} tunic={[M.tunicRed, M.dress, M.tunicGreen, M.tunicGrey][k]} hat={k === 1 ? 'voile' : 'aucun'} robe={k === 1} face="joie" walk={1} pop={false} />
        ))}
      </Cam>
    </Stage>
  ),
]);

const P19 = page([
  ({f, t}) => (
    <Stage bg={M.sky}>
      <Cam dx={30}>
        <rect x={-600} y={-600} width={2280} height={3200} fill={interpolateColors(t(60), [0, 1], [M.sky, '#B3B2B5'])} />
        <Sea y={1150} />
        <rect x={60} y={1100} width={440} height={120} fill={M.plankDark} filter="url(#pp)" />
        <Ship x={lerp(t(50), [0, 1], [1300, 720], ease.inOut)} y={1230 + Math.sin(f / 15) * 8} s={1.1} />
        <Person x={300} y={1110} s={0.6} tunic={M.tunicBlue} face="joie" arm={150} />
      </Cam>
    </Stage>
  ),
  ({pf}) => (
    <Stage bg="#B3B2B5">
      <Cam z={1.6} cx={420} cy={1180} dx={-30}>
        <rect x={-600} y={-600} width={2280} height={3200} fill="#B3B2B5" />
        <Sea y={1150} />
        <rect x={60} y={1100} width={440} height={120} fill={M.plankDark} filter="url(#pp)" />
        <Ship x={720} y={1230} s={1.1} />
        <path d="M 560 1000 L 420 1100" stroke={M.timber} strokeWidth={8} />
        {[0, 1, 2].map((k) => (
          <Rat key={k} x={560 - ((pf * 4 + k * 50) % 260)} y={1000 + ((pf * 4 + k * 50) % 260) * 0.7} s={0.5} flip />
        ))}
        <Person x={300} y={1110} s={0.6} tunic={M.tunicBlue} face="peur" />
      </Cam>
    </Stage>
  ),
]);

const P20 = page([
  ({t}) => {
    const lit = Array.from({length: 10}, (_, k) => Math.max(0, 1 - lerp(t(60), [0, 1], [0, 1.6]) + k * 0.06));
    return (
      <Stage bg={M.night}>
        <Cam z={1.15} dz={0.04}>
          <TownStreet dusk={1} lit={lit} mud={false} />
          <Moon x={860} y={300} />
        </Cam>
      </Stage>
    );
  },
]);

const P21 = page([
  ({t}) => (
    <Stage bg={M.skyGrey}>
      <Cam z={1.15} cy={1150} dz={0.03}>
        <TownStreet dusk={0.5} mud={false} />
        {Array.from({length: 6}, (_, i) => (
          <g key={i} opacity={i % 3 === 2 ? 1 - t(40) * 0.9 : 1}>
            <Person x={130 + i * 165} y={1500} s={0.7} tunic={[M.tunicBlue, M.dress, M.tunicRed][i % 3]} hat={i % 3 === 1 ? 'voile' : 'aucun'} robe={i % 3 === 1} face="triste" />
          </g>
        ))}
      </Cam>
    </Stage>
  ),
  () => (
    <Stage bg={M.skyGrey}>
      <GrosPlan x={540} y={1560} s={1.1} z={2.2} dx={10}>
        <TownStreet dusk={0.5} mud={false} />
        <Person x={540} y={1560} s={1.1} tunic={M.tunicBlue} hat="bonnet" face="pleure" />
      </GrosPlan>
    </Stage>
  ),
]);

// ——— Niveau 3 : le chevalier ———
const P22 = page([
  ({f}) => (
    <Stage bg={M.sky}>
      <Cam z={1.25}>
        <Countryside />
        <Castle x={540} y={1120} s={1.1} />
        <Person x={330} y={1560} s={1.15} tunic={M.royalBlue} cape={M.royal} face="fier" beard={M.hair} />
        <Person x={640 + Math.sin(f / 6) * 20} y={1560} s={0.6} tunic={M.tunicRed} hat="casque" face="peur" walk={0.6} flip pop={false} />
      </Cam>
    </Stage>
  ),
  ({f}) => (
    <Stage bg={M.stoneDark}>
      <Cam z={1.35} cy={1300} dx={50}>
        <ThroneRoom />
        <Table x={540} y={1400} w={720} />
        <Person x={760} y={1660} s={1.1} tunic={M.royalBlue} cape={M.royal} face="joie" flip beard={M.hair} belly />
        <Person x={330 + Math.sin(f / 5) * 10} y={1660} s={0.6} tunic={M.tunicRed} face="peur" tool="plateau" arm={90} walk={0.6} pop={false} />
      </Cam>
    </Stage>
  ),
]);

const P23 = page([
  ({f}) => (
    <Stage bg={M.sky}>
      <Cam z={1.45} dx={-40}>
        <Countryside />
        <g transform="translate(360 1560)" filter="url(#pp)">
          <rect x={-10} y={-300} width={20} height={300} fill={M.timber} />
          <Person x={0} y={-10} s={0.9} armor hat="heaume" pop={false} />
        </g>
        <Sparkles x={360} y={1240} r={150} />
        <Person x={640} y={1560} s={0.85} tunic={M.tunicRed} face="choc" tool="brosse" arm={90 + Math.sin(f / 2) * 20} flip />
      </Cam>
    </Stage>
  ),
  ({t}) => (
    <Stage bg={M.sky}>
      <Cam z={1.4} dx={40}>
        <Countryside />
        <Horse x={360} y={1560} s={0.95} />
        <Person x={760} y={1580} s={0.85} tunic={M.tunicRed} face={t(10) > 0.5 ? 'degout' : 'joie'} flip tool="seau" arm={30} />
        {t(10) > 0.5 &&
          [0, 1, 2, 3].map((k) => <circle key={k} cx={620 + k * 30 + t(16) * 60} cy={1060 + k * 10} r={10} fill="#DDEFF5" opacity={1 - t(16) * 0.5} />)}
      </Cam>
    </Stage>
  ),
]);

const P24 = page([
  ({t}) => (
    <Stage bg={M.stoneDark}>
      <Cam z={1.3} cy={1280}>
        <ThroneRoom />
        <Person x={330} y={1560} s={1.2} tunic={M.royalBlue} cape={M.royal} hat="couronne" face="neutre" tool="epee" arm={lerp(t(20), [0, 1], [150, 100])} beard={M.hairGrey} />
        <g transform="translate(680 1560) scale(1 0.8)">
          <Person x={0} y={0} s={0.95} tunic={M.tunicRed} flip face="peur" />
        </g>
      </Cam>
    </Stage>
  ),
  () => (
    <Stage bg={M.stoneDark}>
      <GrosPlan x={680} y={1560} s={0.95} z={2.3}>
        <ThroneRoom />
        <Person x={680} y={1560} s={0.95} tunic={M.tunicRed} flip face="fier" pop={false} />
        <Sparkles x={680} y={1220} r={150} />
      </GrosPlan>
    </Stage>
  ),
]);

const P25 = page([
  ({f}) => (
    <Stage bg={M.skyGrey}>
      <Cam z={1.25} cy={1250}>
        <Countryside sky={M.skyGrey} hill="#8A9A6A" field="#9C8E64" />
        <g transform={`rotate(${Math.sin(f / 7) * 6} 540 1650)`}>
          <Person x={540} y={1650} s={1.6} armor hat="heaume" face="peur" cape={M.tunicRed} tool="epee" arm={40} pop={false} />
        </g>
      </Cam>
    </Stage>
  ),
  () => (
    <Stage bg={M.skyGrey}>
      <GrosPlan x={540} y={1650} s={1.6} z={1.9}>
        <Countryside sky={M.skyGrey} hill="#8A9A6A" field="#9C8E64" />
        <Person x={540} y={1650} s={1.6} armor hat="heaume" face="peur" cape={M.tunicRed} pop={false} />
        <Steam x={640} y={1080} t={0.8} seed="souffle" />
      </GrosPlan>
    </Stage>
  ),
  ({t, pf}) => (
    <Stage bg={M.skyGrey}>
      <Cam z={1.25} cy={1250}>
        <Countryside sky={M.skyGrey} hill="#8A9A6A" field="#9C8E64" />
        <g transform={`rotate(${lerp(pf, [0, 16], [0, 85], ease.in)} 620 1650)`}>
          <Person x={540} y={1650} s={1.6} armor hat="heaume" face="choc" cape={M.tunicRed} pop={false} />
        </g>
        {pf > 16 && <Stars2 x={900} y={1440} />}
        {void t}
      </Cam>
    </Stage>
  ),
]);

const P26 = page([
  ({t}) => (
    <Stage bg={M.night}>
      <Cam dx={-40}>
        <rect x={-600} y={-600} width={2280} height={3200} fill={M.night} />
        <Stars />
        <Moon x={820} y={300} />
        <path d="M -600 1250 Q 540 1150 1680 1250 L 1680 2600 L -600 2600 Z" fill="#3F4A3A" filter="url(#pp)" />
        {[0, 1, 2, 3].map((k) => (
          <Tent key={k} x={140 + k * 270} y={1300 + (k % 2) * 60} s={0.9} c={k % 2 ? '#C9BFA6' : M.plaster} lit={Math.max(0, 1 - t(50) * 1.4 + k * 0.15)} />
        ))}
        <Fireflies y={1150} />
      </Cam>
    </Stage>
  ),
  ({pf}) => (
    <Stage bg={M.night}>
      <Cam z={1.3} dx={60}>
        <rect x={-600} y={-600} width={2280} height={3200} fill={M.night} />
        <Stars />
        <path d="M -600 1250 Q 540 1150 1680 1250 L 1680 2600 L -600 2600 Z" fill="#3F4A3A" filter="url(#pp)" />
        <Latrine x={860} y={1500} s={1} door={pf > 40 ? 1 : 0} />
        <Person x={Math.min(820, 100 + pf * 18)} y={1560} s={0.9} armor face="malade" sick walk={2} arm={60} armL={-60} pop={false} />
        {[0, 1].map((k) => (
          <Person key={k} x={Math.min(640 - k * 150, -100 - k * 150 + pf * 16)} y={1580} s={0.8} armor face="malade" sick walk={2} pop={false} />
        ))}
      </Cam>
    </Stage>
  ),
]);

const P27 = page([
  () => (
    <Stage bg={M.sky}>
      <Cam z={1.3} dx={-50}>
        <Countryside />
        <Castle x={820} y={1060} s={0.6} />
        <Person x={460} y={1560} s={1.1} armor face="triste" tool="bourse" arm={20} walk={0.5} pop={false} />
        <rect x={430} y={1170} width={60} height={14} rx={6} fill={C.white} transform="rotate(-20 460 1180)" />
      </Cam>
    </Stage>
  ),
  ({t}) => (
    <Stage bg={M.stone}>
      <Cam z={1.15} cy={1150} dz={0.03}>
        <rect x={-600} y={-600} width={2280} height={3200} fill={M.stone} />
        {Array.from({length: 12}, (_, i) => (
          <g key={i} opacity={i < 4 ? 1 : 1 - t(50) * 0.7}>
            <Shield x={190 + (i % 4) * 235} y={600 + Math.floor(i / 4) * 250} s={0.8} c={i < 4 ? M.tunicRed : interpolateColors(t(50), [0, 1], [M.tunicBlue, '#7D7A76'])} />
          </g>
        ))}
        <Person x={540} y={1560} s={0.9} armor face="pleure" pop={false} />
      </Cam>
    </Stage>
  ),
]);

// ——— Niveau 4 : le roi ———
const P28 = page([
  ({f}) => (
    <Stage bg={M.stoneDark}>
      <Cam z={1.35} cy={1300}>
        <ThroneRoom />
        <Bed x={540} y={1560} />
        <Person x={760} y={1425} s={0.95} tunic={M.royal} lie face="malade" sick hat="couronne" beard={M.hairGrey} />
        <Blanket x={600} y={1470} s={0.9} />
        <Person x={240} y={1640} s={0.7} tunic={M.royalBlue} face="peur" />
        {f % 40 < 10 && <path d="M 820 1220 q 30 -20 60 0" stroke="#FFFFFF" strokeWidth={8} fill="none" />}
      </Cam>
    </Stage>
  ),
  ({t}) => (
    <Stage bg={M.stoneDark}>
      <GrosPlan x={540} y={1520} s={1} z={2}>
        <ThroneRoom />
        <Throne x={540} y={1520} s={1.15} />
        <Person x={540} y={1520} s={1} tunic={M.royalBlue} cape={M.royal} hat={t(14) > 0.95 ? 'grandeCouronne' : 'aucun'} face={t(14) > 0.95 ? 'choc' : 'joie'} pop={false} />
        {t(14) <= 0.95 && (
          <g transform={`translate(540 ${lerp(t(14), [0, 1], [700, 1180], ease.in)})`}>
            <polygon points="-70,0 -70,-80 -35,-40 0,-90 35,-40 70,-80 70,0" fill={M.gold} filter="url(#pp)" />
          </g>
        )}
      </GrosPlan>
    </Stage>
  ),
]);

const P29 = page([
  ({f}) => (
    <Stage bg={M.stoneDark}>
      <Cam z={1.3} cy={1300}>
        <ThroneRoom />
        <Throne x={540} y={1450} s={0.9} />
        <Person x={540} y={1450} s={0.75} tunic={M.royalBlue} cape={M.royal} hat="grandeCouronne" face="peur" />
        {[180, 900, 330].map((px, k) => (
          <Person key={k} x={px + Math.sin(f / 12 + k) * 12} y={1600 + (k === 2 ? 60 : 0)} s={1.05} tunic={[M.tunicGreen, M.tunicRed, M.dress][k]} flip={px > 540} face="louche" beard={k < 2 ? M.hair : undefined} arm={60} armL={-60} />
        ))}
      </Cam>
    </Stage>
  ),
  ({f}) => (
    <Stage bg={M.stoneDark}>
      <GrosPlan x={900} y={1600} s={1.05} z={2.1} dx={-30}>
        <ThroneRoom />
        <Person x={900} y={1600} s={1.05} tunic={M.tunicRed} flip face="louche" beard={M.hair} arm={70 + Math.sin(f / 3) * 10} armL={-70 - Math.sin(f / 3) * 10} pop={false} />
        <Person x={640} y={1600} s={1.05} tunic={M.tunicGreen} face="louche" beard={M.hair} pop={false} />
      </GrosPlan>
    </Stage>
  ),
]);

const P30 = page([
  () => (
    <Stage bg={M.stoneDark}>
      <Cam z={1.35} cy={1300}>
        <ThroneRoom />
        <Table x={540} y={1400} w={760} />
        <Bowl x={700} y={1370} s={0.9} fill={1} />
        <Person x={500} y={1640} s={0.9} tunic={M.tunicGrey} face="peur" tool="coupe" arm={110} />
        <Person x={880} y={1640} s={1.05} tunic={M.royalBlue} cape={M.royal} hat="couronne" flip face="louche" />
      </Cam>
    </Stage>
  ),
  ({t}) => (
    <Stage bg={M.stoneDark}>
      <GrosPlan x={500} y={1640} s={0.9} z={2.3}>
        <ThroneRoom />
        <Person x={500} y={1640} s={0.9} tunic={M.tunicGrey} face={t(16) > 0.5 ? 'rire' : 'peur'} tool="coupe" arm={lerp(t(16), [0, 1], [150, 100])} pop={false} />
      </GrosPlan>
    </Stage>
  ),
]);

const P31 = page([
  ({f, t}) => (
    <Stage bg={M.skyGrey}>
      <Cam dx={-50}>
        <Countryside sky={M.skyGrey} />
        <Castle x={540} y={1150} s={0.9} />
        {[0, 1, 2, 3, 4].map((k) => (
          <g key={k} transform={`translate(${120 + k * 210} ${1520 - t(30) * 60})`} opacity={t(30)}>
            <rect x={-4} y={-300} width={8} height={300} fill={M.timber} />
            <path d={`M 4 -300 Q 60 ${-290 + Math.sin(f / 6 + k) * 8} 110 -296 L 110 -220 Q 60 -214 4 -226 Z`} fill={[M.tunicGreen, '#2B2A33', M.tunicGreen, '#2B2A33', M.tunicGreen][k]} />
          </g>
        ))}
        {[0, 1, 2].map((k) => (
          <Person key={k} x={200 + k * 320} y={1640} s={0.85} tunic={[M.tunicGreen, '#2B2A33', M.tunicGreen][k]} face="colere" tool="epee" arm={150} bounce={0.4} pop={false} />
        ))}
      </Cam>
    </Stage>
  ),
  ({t, pf}) => (
    <Stage bg={M.stoneDark}>
      <Cam z={1.5} cy={1320}>
        <ThroneRoom />
        <Chest x={540} y={1560} s={1.1} open={lerp(pf, [6, 20], [0, 1])} coins={0} />
        <Moth x={540 + Math.sin(pf / 4) * 60} y={lerp(pf, [16, 60], [1360, 900])} s={1.2} />
        <Person x={860} y={1640} s={1.05} tunic={M.royalBlue} cape={M.royal} hat="couronne" flip face={pf > 18 ? 'choc' : 'joie'} />
        {void t}
      </Cam>
    </Stage>
  ),
]);

const P32 = page([
  ({pf}) => (
    <Stage bg={M.sky}>
      <Cam z={1.2} dx={160}>
        <Countryside hill="#6E9A52" field="#7DA35E" />
        {[80, 260, 860, 1010].map((x, k) => (
          <Tree key={k} x={x} y={1300 + (k % 2) * 40} s={1.3} c="#4F7A3E" />
        ))}
        <g transform={`translate(${pf * 6 - 200} ${Math.abs(Math.sin(pf / 3)) * -14})`}>
          <Horse x={400} y={1600} s={0.9} />
          <Person x={420} y={1330} s={0.75} tunic={M.royalBlue} cape={M.royal} hat="couronne" face="rire" arm={130} pop={false} />
        </g>
      </Cam>
    </Stage>
  ),
  ({pf}) => (
    <Stage bg={M.sky}>
      <Cam z={1.25} dx={60}>
        <Countryside hill="#6E9A52" field="#7DA35E" />
        <Tree x={900} y={1300} s={1.3} c="#4F7A3E" />
        <Horse x={420} y={1600} s={0.9} />
        <g transform={`translate(${lerp(pf, [0, 24], [0, 380])} ${lerp(pf, [0, 12, 24], [0, -220, 200], ease.linear)}) rotate(${pf * 14} 440 1180)`}>
          <Person x={440} y={1330} s={0.75} tunic={M.royalBlue} cape={M.royal} face="choc" arm={160} armL={-160} pop={false} />
        </g>
        <g transform={`translate(${lerp(pf, [0, 40], [460, 980])} ${lerp(pf, [0, 20, 40], [1000, 1560, 1600], ease.linear)}) rotate(${pf * 18}) scale(1.6)`}>
          <polygon points="-40,0 -40,-44 -20,-20 0,-50 20,-20 40,-44 40,0" fill={M.gold} filter="url(#pp)" />
        </g>
        {pf > 24 && <Stars2 x={820} y={1380} />}
      </Cam>
    </Stage>
  ),
]);

// ——— La chute ———
const P33 = page([
  () => (
    <Stage bg={M.skyWarm}>
      <Cam z={1.15} cy={1150} dz={0.04}>
        <rect x={-600} y={-600} width={2280} height={3200} fill="#E9DCC3" />
        <Person x={160} y={1500} s={0.85} tunic={M.tunicBrown} hat="capuche" face="triste" />
        <Person x={400} y={1500} s={0.85} tunic={M.tunicBlue} hat="bonnet" face="sonne" />
        <Person x={660} y={1500} s={0.85} armor face="malade" sick />
        <Person x={910} y={1500} s={0.85} tunic={M.royalBlue} cape={M.royal} hat="couronne" face="choc" />
      </Cam>
    </Stage>
  ),
  ({t}) => (
    <Stage bg={M.skyWarm}>
      <Cam z={1.1} cy={1100} dz={0.03}>
        <rect x={-600} y={-600} width={2280} height={3200} fill="#E9DCC3" />
        <g opacity={t(20)} transform={`translate(540 ${lerp(t(20), [0, 1], [900, 840])}) rotate(${-3 + t(20) * 3})`}>
          <rect x={-380} y={-300} width={760} height={600} rx={30} fill={C.white} filter="url(#ppl)" />
          <foreignObject x={-360} y={-280} width={720} height={560}>
            <div style={{width: 720, height: 560, overflow: 'hidden', borderRadius: 22}}>
              <Img src={staticFile('sophia-home.webp')} style={{width: 720, marginTop: -170}} />
            </div>
          </foreignObject>
        </g>
      </Cam>
    </Stage>
  ),
]);

const P34 = page([
  ({f}) => (
    <Stage bg={M.skyWarm}>
      <GrosPlan x={540} y={1560} s={1.2} z={2}>
        <rect x={-600} y={-600} width={2280} height={3200} fill="#E9DCC3" />
        <Person x={540} y={1560} s={1.2} tunic={M.tunicBrown} hair={M.hairGrey} beard={M.hairGrey} face="louche" arm={150 + Math.sin(f / 2) * 15} tool="baton" pop={false} />
      </GrosPlan>
    </Stage>
  ),
  ({t}) => (
    <Stage bg={M.skyWarm}>
      <Cam z={1.1} cy={1180} dz={0.03}>
        <rect x={-600} y={-600} width={2280} height={3200} fill="#E9DCC3" />
        <Seesaw x={540} y={1560} tilt={lerp(t(30), [0, 1], [0, -14], ease.out)} />
        <g transform={`rotate(${lerp(t(30), [0, 1], [0, -14], ease.out)} 540 1450)`}>
          {Array.from({length: 6}, (_, i) => (
            <Person key={i} x={160 + i * 50} y={1436} s={0.3} tunic={M.tunicBlue} face="joie" pop={false} />
          ))}
          <Person x={820} y={1436} s={0.6} tunic={M.tunicBrown} hair={M.hairGrey} beard={M.hairGrey} face="choc" pop={false} />
          <Person x={900} y={1436} s={0.58} tunic={M.dress} hat="voile" robe face="choc" pop={false} />
        </g>
      </Cam>
    </Stage>
  ),
]);

const P35 = page([
  ({f, t}) => (
    <Stage bg={M.skyWarm}>
      <Cam z={1.25}>
        <Countryside sky={interpolateColors(t(60), [0, 1], [M.sky, '#F2C38C'])} />
        <Sun x={540} y={lerp(t(60), [0, 1], [500, 900])} c="#F4A94A" />
        <Countryside sky="transparent" />
        <Tree x={820} y={1320} s={1.4} />
        <g transform={`rotate(${Math.sin(f / 8) * 8} 480 1540)`}>
          <Person x={420} y={1540} s={1} tunic={M.tunicBrown} hair={M.hairGrey} beard={M.hairGrey} face="rire" arm={140} bounce={0.5} />
          <Person x={560} y={1540} s={0.95} tunic={M.dress} hat="voile" robe flip face="rire" arm={140} bounce={0.5} />
        </g>
      </Cam>
    </Stage>
  ),
]);

const P36 = page([
  () => (
    <Stage bg={M.plank}>
      <Cam z={1.3} cy={1260}>
        <Interior fire={0.8} />
        <Tub x={340} y={1560} s={1} />
        <Tub x={780} y={1580} s={0.9} />
        <Person x={330} y={1560} s={0.8} tunic={M.tunicBlue} face="rire" arm={150} tool="brosse" pop={false} />
        <Person x={790} y={1580} s={0.75} tunic={M.dress} hat="voile" face="joie" armL={-140} pop={false} />
        <Tub x={340} y={1600} s={1} />
        <Tub x={780} y={1620} s={0.9} />
        <Steam x={340} y={1300} t={0.8} seed="a" />
        <Bubbles x={560} y={1400} />
      </Cam>
    </Stage>
  ),
  () => (
    <Stage bg={M.plank}>
      <GrosPlan x={330} y={1560} s={0.8} z={2.3}>
        <Interior fire={0.8} />
        <Person x={330} y={1560} s={0.8} tunic={M.tunicBlue} face="rire" arm={150} tool="brosse" pop={false} />
        <Tub x={340} y={1600} s={1} />
        <Bubbles x={330} y={1300} />
      </GrosPlan>
    </Stage>
  ),
]);

export const TABLEAUX: (React.FC & {nPlans: number})[] = [
  P01, P02, P03, P04, P05, P06, P07, P08, P09, P10, P11, P12, P13, P14, P15, P16, P17, P18,
  P19, P20, P21, P22, P23, P24, P25, P26, P27, P28, P29, P30, P31, P32, P33, P34, P35, P36,
];

/** Bruitages des plans : [plan, décalage en images depuis le début du plan (ou 'm' = moment fort), son, volume] */
export type SonPlan = [plan: number, quand: number | 'm', son: string, vol: number];
export const SONS: SonPlan[][] = [
  [[0, 'm', 'bell', 0.3], [1, 2, 'boing', 0.5]],
  [[0, 'm', 'slideDown', 0.4], [1, 2, 'boing', 0.5]],
  [[0, 4, 'snore', 0.5], [1, 'm', 'moo', 0.6], [1, 8, 'gasp', 0.5]],
  [[0, 'm', 'scratch', 0.3], [1, 2, 'gulp', 0.4], [2, 2, 'oink', 0.6], [2, 4, 'runFeet', 0.5]],
  [[0, 2, 'hooves', 0.4], [1, 'm', 'slideDown', 0.5], [1, 6, 'gasp', 0.4]],
  [[0, 'm', 'squeak', 0.5], [1, 2, 'gulp', 0.5], [1, 'm', 'ding', 0.4]],
  [[0, 6, 'pop2', 0.4], [0, 18, 'pop2', 0.4], [0, 30, 'pop2', 0.4], [0, 42, 'pop2', 0.4]],
  [[0, 'm', 'rain', 0.5], [0, 10, 'sadTrombone', 0.4], [1, 2, 'rain', 0.4]],
  [[0, 4, 'stomach', 0.6], [1, 'm', 'gulp', 0.5], [1, 10, 'squeak', 0.5]],
  [],
  [[0, 'm', 'bell', 0.25]],
  [[0, 4, 'cough', 0.5], [1, 'm', 'slideUp', 0.5], [1, 6, 'gulp', 0.5]],
  [],
  [[0, 4, 'town', 0.3], [1, 2, 'hammer', 0.6]],
  [[0, 'm', 'boing', 0.5], [1, 2, 'slideDown', 0.4]],
  [[0, 4, 'snore', 0.5], [1, 'm', 'bonk', 0.6]],
  [[0, 'm', 'splash', 0.6], [0, 16, 'flies', 0.4], [1, 4, 'oink', 0.6]],
  [[0, 'm', 'tada', 0.5], [1, 4, 'kazoo', 0.4]],
  [[0, 'm', 'bell', 0.25], [1, 4, 'squeakRats', 0.6]],
  [],
  [],
  [[0, 4, 'clangFunny', 0.4], [1, 4, 'gulp', 0.4]],
  [[0, 4, 'sparkle', 0.5], [1, 'm', 'sneeze', 0.6]],
  [[0, 'm', 'chime', 0.4], [1, 2, 'tada', 0.5]],
  [[0, 4, 'breath', 0.4], [1, 2, 'breath', 0.5], [2, 14, 'clangFunny', 0.6]],
  [[1, 2, 'runFeet', 0.5], [1, 8, 'stomach', 0.5], [1, 40, 'door', 0.5]],
  [[0, 2, 'hooves', 0.3]],
  [[0, 4, 'cough', 0.4], [1, 'm', 'whistleFall', 0.4], [1, 14, 'clangFunny', 0.5]],
  [[0, 4, 'sneaky', 0.5]],
  [[0, 4, 'gulp', 0.5], [1, 'm', 'ding', 0.5]],
  [[0, 'm', 'march', 0.5], [1, 6, 'door', 0.4], [1, 18, 'sadTrombone', 0.5]],
  [[0, 2, 'hooves', 0.5], [1, 0, 'whistleFall', 0.5], [1, 22, 'crashFunny', 0.6]],
  [[1, 'm', 'chime', 0.4]],
  [[0, 'm', 'squeak', 0.4], [1, 'm', 'boing', 0.5]],
  [[0, 4, 'kazoo', 0.4]],
  [[0, 4, 'bubbles', 0.5], [1, 2, 'splash', 0.4]],
];
