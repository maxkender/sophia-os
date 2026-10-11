import { useQuery } from "@tanstack/react-query";
import { geoNaturalEarth1, geoPath, type GeoProjection } from "d3-geo";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import atlasUrl from "world-atlas/countries-110m.json?url";

import { badgeManager } from "@/features/auth/roles";
import { cn, messageErreur } from "@/lib/utils";
import { AvatarProfil } from "./AvatarProfil";
import { construireCarte, PALIERS, palierZone, type ZoneCarte } from "./carteZones";

/**
 * Carte du monde des zones de recrutement (page Posters). Chargée à part
 * (React.lazy) : d3-geo et le fond de carte (Natural Earth 110m, servi comme
 * fichier statique) ne pèsent pas sur le reste de l'app.
 *
 * Survol d'un pays : sa zone ressort, une bulle donne ses recruteurs (photo),
 * ses créateurs par phase. Clic : la page filtre sur la zone (même effet que
 * sa puce, qui sert aussi de légende et d'accès clavier).
 */

type Pays = Feature<Geometry, { name: string }>;

const LARGEUR = 960;
const HAUTEUR = 470;

/**
 * Dégradé bleu par nombre de créateurs de la zone, palier 0 = zone sans
 * créateur. Sur fond sombre, le dégradé s'inverse : le « presque rien » se
 * fond dans le fond, le plus fort ressort le plus clair.
 */
const FOND_PALIER = [
  "fill-[#cde2fb] dark:fill-[#0d366b]",
  "fill-[#9ec5f4] dark:fill-[#184f95]",
  "fill-[#6da7ec] dark:fill-[#256abf]",
  "fill-[#3987e5] dark:fill-[#3987e5]",
  "fill-[#256abf] dark:fill-[#6da7ec]",
  "fill-[#184f95] dark:fill-[#9ec5f4]",
] as const;
const PASTILLE_PALIER = [
  "bg-[#cde2fb] dark:bg-[#0d366b]",
  "bg-[#9ec5f4] dark:bg-[#184f95]",
  "bg-[#6da7ec] dark:bg-[#256abf]",
  "bg-[#3987e5] dark:bg-[#3987e5]",
  "bg-[#256abf] dark:bg-[#6da7ec]",
  "bg-[#184f95] dark:bg-[#9ec5f4]",
] as const;

/** Europe et Moyen-Orient (jusqu'aux Émirats) : la plupart des zones y tiennent. */
const CADRE_EUROPE = {
  type: "MultiPoint" as const,
  coordinates: [
    [-12, 23],
    [58, 23],
    [58, 70],
    [-12, 70],
  ],
};

async function chargerPays(): Promise<Pays[]> {
  const rep = await fetch(atlasUrl);
  if (!rep.ok) throw new Error(`fond de carte ${rep.status}`);
  const topo = (await rep.json()) as Topology<{
    countries: GeometryCollection<{ name: string }>;
  }>;
  const fc = feature(topo, topo.objects.countries) as FeatureCollection<Geometry, { name: string }>;
  return fc.features.filter((f) => f.properties.name !== "Antarctica");
}

export interface CarteZonesProps {
  zones: ZoneCarte[];
  /** Zone filtrée par la page (`cle`), "" pour aucune. */
  selection: string;
  /** Zone survolée (carte ou puce), partagée avec la page. */
  survol: string | null;
  onSurvol: (cle: string | null) => void;
  onSelection: (cle: string) => void;
  /** Pays déjà chargés (tests) : sinon le fond de carte est téléchargé. */
  pays?: Pays[];
}

export default function CarteZones(props: CarteZonesProps) {
  const { t } = useTranslation();
  const charge = useQuery({
    queryKey: ["carte-monde-110m"],
    queryFn: chargerPays,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 1,
    enabled: !props.pays,
  });
  const pays = props.pays ?? charge.data;

  if (!pays) {
    if (charge.isError) {
      return (
        <p className="text-xs text-destructive">
          {t("posters.carte.erreur", { message: messageErreur(charge.error) })}
        </p>
      );
    }
    return <div className="aspect-[2/1] w-full animate-pulse rounded-xl bg-muted/50" />;
  }
  return <CarteZonesTracee {...props} pays={pays} />;
}

function CarteZonesTracee({
  zones,
  selection,
  survol,
  onSurvol,
  onSelection,
  pays,
}: CarteZonesProps & { pays: Pays[] }) {
  const { t } = useTranslation();
  // Sur téléphone, l'Europe serait minuscule dans la vue monde.
  const [vue, setVue] = React.useState<"monde" | "europe">(() =>
    typeof window !== "undefined" && window.innerWidth < 640 ? "europe" : "monde",
  );
  const [bulle, setBulle] = React.useState<{ x: number; y: number; cle: string } | null>(null);
  const cadreRef = React.useRef<HTMLDivElement>(null);

  const carte = React.useMemo(
    () => construireCarte(zones, pays.map((p) => p.properties.name)),
    [zones, pays],
  );
  const parCle = React.useMemo(() => new Map(zones.map((z) => [z.cle, z])), [zones]);

  const traces = React.useMemo(() => {
    const cible = (vue === "europe" ? CADRE_EUROPE : { type: "FeatureCollection", features: pays }) as
      Parameters<GeoProjection["fitExtent"]>[1];
    const projection = geoNaturalEarth1().fitExtent(
      [
        [4, 4],
        [LARGEUR - 4, HAUTEUR - 4],
      ],
      cible,
    );
    const chemin = geoPath(projection);
    return pays.map((p) => ({ nom: p.properties.name, d: chemin(p) ?? "" }));
  }, [pays, vue]);

  const zoneDuPays = (nom: string): string | null => carte.zonesParPays.get(nom)?.[0] ?? null;

  const placer = (e: React.MouseEvent, cle: string) => {
    const cadre = cadreRef.current?.getBoundingClientRect();
    if (!cadre) return;
    setBulle({ x: e.clientX - cadre.left, y: e.clientY - cadre.top, cle });
  };

  const enAvant = new Set([survol, selection].filter(Boolean) as string[]);
  const zoneBulle = bulle ? parCle.get(bulle.cle) : undefined;
  const largeurCadre = cadreRef.current?.clientWidth ?? LARGEUR;
  const hauteurCadre = cadreRef.current?.clientHeight ?? HAUTEUR;

  return (
    <section className="space-y-2" aria-label={t("posters.carte.titre")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{t("posters.carte.aide")}</p>
        <div className="inline-flex rounded-md border p-0.5 text-xs" role="group">
          {(["monde", "europe"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={vue === v}
              onClick={() => setVue(v)}
              className={cn(
                "rounded px-2 py-0.5",
                vue === v ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/60",
              )}
            >
              {t(`posters.carte.${v}`)}
            </button>
          ))}
        </div>
      </div>

      <div ref={cadreRef} className="relative overflow-hidden rounded-xl border bg-card">
        <svg
          viewBox={`0 0 ${LARGEUR} ${HAUTEUR}`}
          className="block h-auto w-full"
          role="img"
          aria-label={t("posters.carte.titre")}
          onMouseLeave={() => {
            setBulle(null);
            onSurvol(null);
          }}
        >
          <g>
            {traces.map(({ nom, d }) => {
              const cle = zoneDuPays(nom);
              if (!cle) {
                return (
                  <path
                    key={nom}
                    d={d}
                    className="fill-muted stroke-background"
                    strokeWidth={0.5}
                  />
                );
              }
              const z = parCle.get(cle);
              const palier = palierZone(z?.compteurs.total ?? 0, carte.max);
              const estompe = survol !== null && !enAvant.has(cle);
              return (
                <path
                  key={nom}
                  d={d}
                  data-zone={cle}
                  className={cn(
                    FOND_PALIER[palier],
                    "cursor-pointer stroke-background transition-opacity",
                    estompe && "opacity-40",
                  )}
                  strokeWidth={0.5}
                  onMouseMove={(e) => {
                    placer(e, cle);
                    if (survol !== cle) onSurvol(cle);
                  }}
                  onClick={() => onSelection(cle)}
                />
              );
            })}
          </g>
          {/* Contour des zones survolée / filtrée, tracé par-dessus leurs voisines. */}
          <g className="pointer-events-none">
            {[...enAvant].flatMap((cle) =>
              (carte.paysParZone.get(cle) ?? []).map((nom) => {
                const trace = traces.find((tr) => tr.nom === nom);
                if (!trace) return null;
                return (
                  <path
                    key={`${cle}-${nom}`}
                    d={trace.d}
                    fill="none"
                    className="stroke-foreground"
                    strokeWidth={cle === selection ? 1.6 : 1.1}
                  />
                );
              }),
            )}
          </g>
        </svg>

        {bulle && zoneBulle && (
          <div
            role="tooltip"
            className="pointer-events-none absolute z-10 w-64 space-y-1.5 rounded-lg border bg-popover p-2.5 text-xs text-popover-foreground shadow-md"
            style={{
              left: Math.max(4, Math.min(bulle.x + 14, largeurCadre - 260)),
              top: bulle.y > hauteurCadre / 2 ? undefined : bulle.y + 14,
              bottom: bulle.y > hauteurCadre / 2 ? hauteurCadre - bulle.y + 14 : undefined,
            }}
          >
            <p className="text-sm font-semibold">{zoneBulle.zone}</p>
            <p className="tabular-nums text-muted-foreground">
              {t("posters.carte.createurs", zoneBulle.compteurs)}
            </p>
            {zoneBulle.recruteurs.length > 0 && (
              <ul className="space-y-1 border-t pt-1.5">
                {zoneBulle.recruteurs.map((r) => (
                  <li key={r.id} className="flex items-center gap-2">
                    <AvatarProfil nom={r.nom} photoUrl={r.photoUrl} className="size-6" />
                    <span className={cn("min-w-0 flex-1 truncate", !r.actif && "text-muted-foreground")}>
                      {r.nom}
                    </span>
                    {badgeManager(r.role) && (
                      <span className="rounded border px-1 text-[10px] text-muted-foreground">
                        {badgeManager(r.role)}
                      </span>
                    )}
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {t("posters.carte.nbCreas", { n: r.createurs })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-[11px] text-muted-foreground">
              {selection === zoneBulle.cle ? t("posters.carte.cliquerTout") : t("posters.carte.cliquer")}
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          {t("posters.carte.legende")}
          <span className="tabular-nums">0</span>
          <span className="inline-flex gap-0.5">
            {Array.from({ length: PALIERS + 1 }, (_, i) => (
              <span key={i} className={cn("inline-block h-2.5 w-4 rounded-sm", PASTILLE_PALIER[i])} />
            ))}
          </span>
          <span className="tabular-nums">{carte.max}</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-4 rounded-sm bg-muted" />
          {t("posters.carte.horsZone")}
        </span>
        {carte.nonPlacees.length > 0 && (
          <span>
            {t("posters.carte.nonPlace", {
              liste: carte.nonPlacees.map((z) => `${z.inconnus.join(", ")} (${z.zone})`).join(" · "),
            })}
          </span>
        )}
      </div>
    </section>
  );
}
