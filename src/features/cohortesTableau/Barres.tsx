import * as React from "react";

import { useLargeur } from "@/components/charts/useLargeur";
import { BLEU_BARRE } from "@/features/ckd/cohorte/graphes";

import { graduations } from "./logique";

export interface PointBarre {
  cle: string;
  libelle: string;
  /** Une 2e ligne sous l'axe (« 45 % ≥ 6 »). */
  sous?: string;
  valeur: number | null;
  /** La semaine en cours : la barre est plus claire (pas finie). */
  partiel?: boolean;
  /** Le titre et les lignes de l'infobulle (aussi lus au clavier). */
  infobulle: { titre: string; lignes: string[] };
}

function barreArrondie(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, h, w / 2);
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`;
}

/**
 * Une série en barres, dessinée à la main comme les autres graphes de l'OS :
 * barres fines (24 px au plus), bout arrondi côté valeur, carré à la base,
 * grille discrète. La valeur est écrite au-dessus de la dernière barre et de
 * la plus haute ; chaque barre se survole ou se parcourt au clavier.
 */
export function Barres({ points, ariaLabel, format = (v) => String(v), hauteur = 200 }: {
  points: PointBarre[];
  ariaLabel: string;
  format?: (v: number) => string;
  hauteur?: number;
}) {
  const [ref, largeur] = useLargeur<HTMLDivElement>(480);
  const [survol, setSurvol] = React.useState<number | null>(null);
  const valeurs = points.map((p) => p.valeur ?? 0);
  const { haut, ticks } = graduations(Math.max(...valeurs, 0));
  // La 2e ligne seulement s'il y a la place (sinon elle reste dans l'infobulle).
  const avecSous = points.some((p) => p.sous) && (largeur - 52) / Math.max(1, points.length) >= 64;
  const padL = 44;
  const padR = 8;
  const padT = 20;
  const padB = avecSous ? 38 : 24;
  const iw = Math.max(1, largeur - padL - padR);
  const ih = hauteur - padT - padB;
  const y = (v: number) => padT + ih - (v / haut) * ih;
  const bande = iw / Math.max(1, points.length);
  const larg = Math.min(24, bande * 0.6);
  const centre = (i: number) => padL + bande * (i + 0.5);
  const iMax = valeurs.indexOf(Math.max(...valeurs));
  const iDernier = points.reduce((d, p, i) => (p.valeur === null ? d : i), -1);

  return (
    <div ref={ref} className="relative w-full min-w-0" onMouseLeave={() => setSurvol(null)}>
      <svg width={largeur} height={hauteur} role="img" aria-label={ariaLabel} className="block max-w-full overflow-visible">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={largeur - padR} y1={y(t)} y2={y(t)} className={t === 0 ? "stroke-border" : "stroke-border/50"} strokeWidth={1} />
            <text x={padL - 8} y={y(t) + 3.5} textAnchor="end" className="fill-muted-foreground text-[10.5px] tabular-nums">
              {format(t)}
            </text>
          </g>
        ))}
        {points.map((p, i) => {
          const v = p.valeur;
          return (
            <g key={p.cle}>
              {v !== null && v > 0 && (
                <path
                  d={barreArrondie(centre(i) - larg / 2, y(v), larg, y(0) - y(v), 4)}
                  fill={BLEU_BARRE}
                  opacity={p.partiel ? 0.45 : survol === null || survol === i ? 1 : 0.6}
                />
              )}
              {v !== null && (i === iDernier || i === iMax) && (
                <text x={centre(i)} y={y(v) - 6} textAnchor="middle" className="fill-foreground text-[11px] font-semibold tabular-nums">
                  {format(v)}
                </text>
              )}
              <text x={centre(i)} y={hauteur - (avecSous ? 21 : 7)} textAnchor="middle" className="fill-muted-foreground text-[11px]">
                {p.libelle}
              </text>
              {avecSous && p.sous && (
                <text x={centre(i)} y={hauteur - 6} textAnchor="middle" className="fill-muted-foreground text-[10px] tabular-nums">
                  {p.sous}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {points.map((p, i) => (
        <button
          key={p.cle}
          type="button"
          aria-label={[p.infobulle.titre, ...p.infobulle.lignes].join(" · ")}
          className="absolute cursor-crosshair rounded-sm bg-transparent focus-visible:outline-2 focus-visible:outline-ring"
          style={{ left: padL + bande * i, top: padT, width: bande, height: ih }}
          onMouseEnter={() => setSurvol(i)}
          onFocus={() => setSurvol(i)}
          onBlur={() => setSurvol(null)}
        />
      ))}
      {survol !== null && (
        <div
          role="presentation"
          className="pointer-events-none absolute top-2 z-10 flex w-48 flex-col gap-1 rounded-lg border bg-popover px-3 py-2 text-xs shadow-lg"
          style={{ left: centre(survol) + 14 + 192 < largeur ? centre(survol) + 14 : Math.max(0, centre(survol) - 14 - 192) }}
        >
          <p className="text-sm font-semibold">{points[survol]!.infobulle.titre}</p>
          {points[survol]!.infobulle.lignes.map((l) => (
            <p key={l} className="tabular-nums text-muted-foreground first:text-foreground">
              {l}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
