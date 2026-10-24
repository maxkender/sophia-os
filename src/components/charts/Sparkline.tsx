import { cn } from "@/lib/utils";

import { useLargeur } from "./useLargeur";

/**
 * Mini-tendance sous un chiffre clé : une ligne, un point sur la dernière
 * valeur. Pas d'axe : c'est la forme qui compte, le chiffre est juste au-dessus.
 */
export function Sparkline({
  values,
  height = 28,
  className,
}: {
  values: ReadonlyArray<number | null>;
  height?: number;
  className?: string;
}) {
  const [ref, largeur] = useLargeur<HTMLDivElement>(160);
  const pts = values
    .map((v, i) => (v === null ? null : { i, v }))
    .filter((p): p is { i: number; v: number } => p !== null);
  if (pts.length < 2) return <div ref={ref} style={{ height }} aria-hidden />;

  const min = Math.min(...pts.map((p) => p.v));
  const max = Math.max(...pts.map((p) => p.v));
  const etendue = max - min || 1;
  const marge = 3;
  const x = (i: number) => marge + (i / Math.max(1, values.length - 1)) * (largeur - 2 * marge);
  const y = (v: number) => marge + (1 - (v - min) / etendue) * (height - 2 * marge);
  const d = pts.map((p, k) => `${k === 0 ? "M" : "L"}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const fin = pts[pts.length - 1]!;

  return (
    <div ref={ref} className={cn("w-full text-foreground", className)} aria-hidden>
      <svg width={largeur} height={height} className="block overflow-visible">
        <path d={d} fill="none" stroke="currentColor" strokeOpacity={0.55} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(fin.i)} cy={y(fin.v)} r={2.75} fill="currentColor" />
      </svg>
    </div>
  );
}
