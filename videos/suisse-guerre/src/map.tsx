import React from 'react';
import geo from './geo.json';
import {C} from './lib';
import {SwissCross} from './shapes';

const LAND = ['#E8D9B5', '#D9CBA6', '#CFE0C3', '#E6CFC0', '#D8D2E3', '#F0E2C2', '#C9D8C5', '#E3D5C0', '#DCC9B0'];

export const GEO = geo as unknown as {
  europe: {id: string; name: string; d: string}[];
  chOnMap: string;
  chCenter: [number, number];
  chBig: string;
  geneva: [number, number];
  hot: Record<string, [number, number]>;
  near: [number, number][];
};

/** Carte de l'Europe en papier découpé, en coordonnées 1080x1920 (Suisse au centre) */
export const EuropeMap: React.FC<{chLift?: number; children?: React.ReactNode; under?: React.ReactNode}> = ({
  chLift = 1,
  children,
  under,
}) => {
  const [cx, cy] = GEO.chCenter;
  return (
    <g>
      <rect x={-2000} y={-2000} width={5080} height={5920} fill={C.sea} />
      <g filter="url(#pp)">
        {GEO.europe
          .filter((c) => c.name !== 'Switzerland')
          .map((c, i) => (
            <path key={c.id + c.name} d={c.d} fill={LAND[i % LAND.length]} stroke="#F7EEDB" strokeWidth={1.6} />
          ))}
      </g>
      {under}
      <g transform={`translate(${cx} ${cy}) scale(${chLift}) translate(${-cx} ${-cy})`} filter="url(#ppl)">
        <path d={GEO.chOnMap} fill={C.red} stroke="#F7EEDB" strokeWidth={1.2} />
        <g transform={`translate(${cx} ${cy})`}>
          <SwissCross s={30} />
        </g>
      </g>
      {children}
    </g>
  );
};
