import * as React from "react";

import { cn } from "@/lib/utils";

import { graduations, indexEtiquettes } from "./echelle";
import { useLargeur } from "./useLargeur";

export interface PointBarre {
  key: string;
  /** Étiquette courte sous l'axe (« 12 oct. »). */
  axisLabel: string;
  /** Titre de l'infobulle (« dimanche 12 octobre »). */
  tooltipTitle: string;
  /** `null` = pas de relevé ce jour-là : un trou, pas un zéro. */
  value: number | null;
}

/**
 * Barres verticales par jour, en noir et gris comme le reste de l'admin : les
 * barres en gris, la dernière en noir, la moyenne glissante en trait plein. Une
 * valeur négative descend sous zéro, en rouge. Survol = valeur exacte ; un
 * tableau caché donne les mêmes chiffres aux lecteurs d'écran.
 */
export function BarChart({
  points,
  average,
  averageLabel,
  valueLabel,
  height = 200,
  formatTick,
  formatValue,
  ariaLabel,
}: {
  points: PointBarre[];
  average?: ReadonlyArray<number | null>;
  averageLabel?: string;
  valueLabel: string;
  height?: number;
  formatTick: (n: number) => string;
  formatValue: (n: number) => string;
  ariaLabel: string;
}) {
  const [ref, largeur] = useLargeur<HTMLDivElement>();
  const [survol, setSurvol] = React.useState<number | null>(null);

  const { min, max, ticks } = graduations(points.map((p) => p.value));
  const plusLong = Math.max(...ticks.map((t) => formatTick(t).length));
  const padL = 8 + plusLong * 6.5;
  const padR = 4;
  const padT = 8;
  const padB = 22;
  const iw = Math.max(1, largeur - padL - padR);
  const ih = height - padT - padB;
  const y = (v: number) => padT + ih - ((v - min) / (max - min || 1)) * ih;
  const zero = y(0);
  const bande = iw / Math.max(1, points.length);
  const larg = Math.max(1, Math.min(24, bande - (bande > 6 ? 2 : 0.5)));
  const xBarre = (i: number) => padL + i * bande + (bande - larg) / 2;
  const xCentre = (i: number) => padL + i * bande + bande / 2;
  const rayon = Math.min(3, larg / 2);

  const ligneMoyenne = average
    ? average
        .map((v, i) => (v === null ? null : `${xCentre(i).toFixed(1)},${y(v).toFixed(1)}`))
        .reduce<string[]>((segs, p, i, tout) => {
          if (p === null) return segs;
          segs.push(`${i === 0 || tout[i - 1] === null ? "M" : "L"}${p}`);
          return segs;
        }, [])
        .join(" ")
    : "";

  const dernier = points.length - 1;
  const actif = survol;
  const pointActif = actif !== null ? points[actif] : null;

  return (
    <div ref={ref} className="relative w-full">
      <svg width={largeur} height={height} role="img" aria-label={ariaLabel} className="block overflow-visible">
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={padL}
              x2={largeur - padR}
              y1={y(t)}
              y2={y(t)}
              className={t === 0 ? "stroke-border" : "stroke-border/50"}
              strokeWidth={1}
            />
            <text x={padL - 8} y={y(t) + 3.5} textAnchor="end" className="fill-muted-foreground text-[10.5px] tabular-nums">
              {formatTick(t)}
            </text>
          </g>
        ))}

        {points.map((p, i) => {
          if (p.value === null) return null;
          const haut = p.value >= 0;
          const yv = y(p.value);
          const h = Math.max(1, Math.abs(zero - yv));
          const x = xBarre(i);
          // Coins arrondis côté valeur, carrés côté zéro.
          const d = haut
            ? `M${x},${zero} V${zero - h + rayon} Q${x},${zero - h} ${x + rayon},${zero - h} H${x + larg - rayon} Q${x + larg},${zero - h} ${x + larg},${zero - h + rayon} V${zero} Z`
            : `M${x},${zero} V${zero + h - rayon} Q${x},${zero + h} ${x + rayon},${zero + h} H${x + larg - rayon} Q${x + larg},${zero + h} ${x + larg},${zero + h - rayon} V${zero} Z`;
          return (
            <path
              key={p.key}
              d={d}
              className={cn(
                !haut
                  ? "fill-destructive/70"
                  : actif === i
                    ? "fill-foreground/70"
                    : i === dernier
                      ? "fill-foreground"
                      : "fill-muted-foreground/30",
              )}
            />
          );
        })}

        {ligneMoyenne && (
          <path
            d={ligneMoyenne}
            fill="none"
            className="stroke-foreground"
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            pointerEvents="none"
          />
        )}

        {/* Une date tient dans ~70 px : sur un écran étroit, moins d'étiquettes. */}
        {indexEtiquettes(points.length, Math.max(2, Math.min(5, Math.floor(iw / 70)))).map((i) => (
          <text
            key={points[i]!.key}
            x={i === dernier ? padL + iw : i === 0 ? padL : xCentre(i)}
            y={height - 6}
            textAnchor={i === dernier ? "end" : i === 0 ? "start" : "middle"}
            className="fill-muted-foreground text-[10.5px]"
          >
            {points[i]!.axisLabel}
          </text>
        ))}

        {/* Zones de survol : toute la hauteur de la bande, plus facile à viser qu'une barre fine. */}
        {points.map((p, i) => (
          <rect
            key={`zone-${p.key}`}
            x={padL + i * bande}
            y={padT}
            width={bande}
            height={ih}
            fill="transparent"
            onMouseEnter={() => setSurvol(i)}
            onMouseLeave={() => setSurvol((s) => (s === i ? null : s))}
          />
        ))}
      </svg>

      {pointActif && actif !== null && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md/5"
          style={{
            left: Math.min(Math.max(xCentre(actif), 70), largeur - 70),
            top: (pointActif.value === null ? padT : Math.min(y(pointActif.value), zero)) - 8,
          }}
        >
          <p className="font-medium">{pointActif.tooltipTitle}</p>
          <p className="tabular-nums text-muted-foreground">
            {valueLabel} : {pointActif.value === null ? "—" : formatValue(pointActif.value)}
          </p>
          {average && average[actif] != null && averageLabel && (
            <p className="tabular-nums text-muted-foreground">
              {averageLabel} : {formatValue(average[actif]!)}
            </p>
          )}
        </div>
      )}

      {/* Dans un div : un <table> ignore la largeur de 1 px de sr-only et pousserait la page. */}
      <div className="sr-only">
        <table>
          <caption>{ariaLabel}</caption>
          <thead>
            <tr>
              <th scope="col">{/* jour */}</th>
              <th scope="col">{valueLabel}</th>
              {average && averageLabel ? <th scope="col">{averageLabel}</th> : null}
            </tr>
          </thead>
          <tbody>
            {points.map((p, i) => (
              <tr key={p.key}>
                <th scope="row">{p.tooltipTitle}</th>
                <td>{p.value === null ? "—" : formatValue(p.value)}</td>
                {average && averageLabel ? <td>{average[i] == null ? "—" : formatValue(average[i]!)}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
