import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Type } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BarreChargement } from "@/components/ui/progress";
import { LANGUES_CIBLES, nomLangue } from "@/features/moteur/langues";
import {
  brulerTexteTestStream,
  listerContenus,
  listerLabels,
  type BurnTexteEvent,
  type ContenuListe,
} from "@/features/moteur/api";
import {
  affinerZonesDepuisBrut,
  assurerPoliceTikTok,
  brulerTexteSurImage,
  calculerFractionsTaille,
  type SlideBurnInput,
  type ZoneBurn,
} from "@/features/moteur/brulerTexteCanvas";
import { cn } from "@/lib/utils";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

type FiltreLabel = string | null | "__none__";

type PreviewSlide = {
  position: number;
  propreUrl: string;
  brutUrl: string;
  texteTraduit: string;
  previewUrl?: string;
  detail?: string;
  statut: "attente" | "encours" | "ok" | "saute" | "echec";
};

function Chip({
  actif,
  onClick,
  children,
  disabled,
  style,
}: {
  actif: boolean;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={style}
      className={cn(
        "rounded-md px-2.5 py-1 text-xs font-medium disabled:opacity-50",
        actif
          ? "bg-primary text-primary-foreground"
          : "border hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

function zonesDepuisEvent(
  zones: NonNullable<BurnTexteEvent["zones"]>,
): ZoneBurn[] {
  return zones.map((z) => ({
    x: Number(z.x),
    y: Number(z.y),
    w: Number(z.w),
    h: Number(z.h),
    couleur: String(z.couleur ?? "#FFFFFF"),
    ombre: z.ombre === true,
    nbLignes: z.nbLignes != null ? Number(z.nbLignes) : undefined,
    role: z.role === "titre" || z.role === "corps" ? z.role : undefined,
    texte: String(z.texte ?? ""),
    texteSource: z.texteSource != null ? String(z.texteSource) : undefined,
  }));
}

function vignette(c: ContenuListe): string | null {
  const slides = [...(c.structure_slides ?? [])].sort(
    (a, b) => a.position - b.position,
  );
  for (const s of slides) {
    if (s.media_id && c.mediaUrls?.[s.media_id]) {
      return c.mediaUrls[s.media_id]!;
    }
  }
  return null;
}

/**
 * Test admin : burn texte traduit sur images propres (Canvas).
 * Analyse boxes+couleur sur le brut. Aucune sauvegarde.
 * Taille de police unifiée sur tout le slideshow (titre vs corps).
 */
export function TestBrulerTexteCard() {
  const { t } = useTranslation();
  const [langue, setLangue] = React.useState("en");
  const [contenuId, setContenuId] = React.useState("");
  const [filtreLabel, setFiltreLabel] = React.useState<FiltreLabel>(null);
  const [recherche, setRecherche] = React.useState("");
  const [enCours, setEnCours] = React.useState(false);
  const [logs, setLogs] = React.useState<string[]>([]);
  const [previews, setPreviews] = React.useState<PreviewSlide[]>([]);
  const [erreur, setErreur] = React.useState<string | null>(null);

  const labelsTous = useQuery({
    queryKey: ["labels"],
    queryFn: () => listerLabels(),
    staleTime: 60_000,
  });

  const slideshows = useQuery({
    queryKey: ["slideshows-bruler-test", filtreLabel],
    queryFn: () =>
      listerContenus({
        statut: "valide",
        limit: 200,
        labelId:
          filtreLabel && filtreLabel !== "__none__" ? filtreLabel : undefined,
        sansLabel: filtreLabel === "__none__",
      }),
  });

  const labelsDisponibles = React.useMemo(() => {
    const fromListe = labelsTous.data ?? [];
    if (fromListe.length > 0) {
      return [...fromListe].sort((a, b) =>
        a.nom.localeCompare(b.nom, undefined, { sensitivity: "base" }),
      );
    }
    const map = new Map<string, { id: string; nom: string; couleur: string | null }>();
    for (const c of slideshows.data ?? []) {
      for (const l of c.labels ?? []) {
        if (!map.has(l.id)) map.set(l.id, l);
      }
    }
    return [...map.values()].sort((a, b) =>
      a.nom.localeCompare(b.nom, undefined, { sensitivity: "base" }),
    );
  }, [labelsTous.data, slideshows.data]);

  const slideshowsFiltres = React.useMemo(() => {
    const q = recherche.trim().toLowerCase();
    const list = slideshows.data ?? [];
    if (!q) return list;
    return list.filter((c) => {
      const titre = (c.titre ?? "").toLowerCase();
      const id = c.id.toLowerCase();
      const labs = (c.labels ?? []).map((l) => l.nom.toLowerCase()).join(" ");
      const src = (c.langue_source ?? "").toLowerCase();
      return (
        titre.includes(q) ||
        id.includes(q) ||
        labs.includes(q) ||
        src.includes(q)
      );
    });
  }, [slideshows.data, recherche]);

  // Si le filtre change et que la sélection n'est plus dans la liste → reset.
  React.useEffect(() => {
    if (!contenuId) return;
    const encore = (slideshows.data ?? []).some((c) => c.id === contenuId);
    if (!encore) setContenuId("");
  }, [slideshows.data, contenuId]);

  React.useEffect(() => {
    void assurerPoliceTikTok();
  }, []);

  const selection = (slideshows.data ?? []).find((c) => c.id === contenuId);

  async function lancer() {
    if (!contenuId || enCours) return;
    setEnCours(true);
    setErreur(null);
    setLogs([]);
    setPreviews([]);
    const push = (l: string) =>
      setLogs((prev) => [...prev.slice(-200), l]);

    const logZones = (
      prefix: string,
      pos: number | undefined,
      zones: NonNullable<BurnTexteEvent["zones"]>,
      mode: "ocr" | "traduit",
    ) => {
      push(`── #${pos ?? "—"} ${prefix} (${zones.length} zone(s)) ──`);
      zones.forEach((z, i) => {
        const role = z.role ?? "?";
        const box = `x=${Number(z.x).toFixed(2)} y=${Number(z.y).toFixed(2)} w=${Number(z.w).toFixed(2)} h=${Number(z.h).toFixed(2)}`;
        const style = `${z.couleur ?? "?"} ${z.ombre ? "stroke" : "flat"} · ${z.nbLignes ?? "?"}L · ${role}`;
        push(`  [${i}] ${box} · ${style}`);
        const ocr = (z.texteSource ?? (mode === "ocr" ? z.texte : "") ?? "")
          .trim()
          .replace(/\s+/g, " ");
        const trad = mode === "traduit" ? (z.texte ?? "").trim().replace(/\s+/g, " ") : "";
        if (ocr) {
          push(`       OCR: ${ocr.slice(0, 160)}${ocr.length > 160 ? "…" : ""}`);
        }
        if (trad) {
          push(`       → ${trad.slice(0, 160)}${trad.length > 160 ? "…" : ""}`);
        }
      });
    };

    const aBurner: SlideBurnInput[] = [];

    try {
      push(t("tests.brulerDebut", { langue: nomLangue(langue) }));
      await brulerTexteTestStream(
        { contenuId, langue },
        async (ev: BurnTexteEvent) => {
          if (ev.etape === "deck" || ev.etape === "slide") {
            if (ev.detail) {
              push(
                `#${ev.position ?? "—"} · ${ev.statut ?? ""} · ${ev.detail}`,
              );
            }
          }
          if (ev.etape === "gemini" && ev.zones) {
            if (ev.detail) push(`#${ev.position} ${ev.detail}`);
            logZones("GEMINI brut", ev.position, ev.zones, "ocr");
            if (ev.texteTraduit) {
              const tr = ev.texteTraduit.trim().replace(/\s+/g, " ");
              push(
                `  traduit: ${tr.slice(0, 180)}${tr.length > 180 ? "…" : ""}`,
              );
            }
          }
          if (ev.etape === "analyse" && ev.zones) {
            if (ev.detail) push(`#${ev.position} ${ev.detail}`);
            logZones("après fusion/split", ev.position, ev.zones, "traduit");
          }
          if (ev.etape === "payload" && ev.propreUrl && ev.zones) {
            const pos = Number(ev.position);
            const zones = zonesDepuisEvent(ev.zones);
            aBurner.push({
              position: pos,
              propreUrl: ev.propreUrl,
              brutUrl: ev.brutUrl,
              zones,
            });
            setPreviews((prev) => {
              const next = prev.filter((p) => p.position !== pos);
              next.push({
                position: pos,
                propreUrl: ev.propreUrl!,
                brutUrl: ev.brutUrl ?? "",
                texteTraduit: ev.texteTraduit ?? "",
                statut: "attente",
                detail: "en file…",
              });
              return next.sort((a, b) => a.position - b.position);
            });
          }
          if (ev.etape === "ready") {
            push(ev.detail ?? `ready · ${ev.statut}`);
          }
        },
      );

      if (aBurner.length === 0) {
        push("aucun slide à brûler");
        return;
      }

      push(`échantillonnage couleur depuis brut (${aBurner.length} slide(s))…`);
      setPreviews((prev) =>
        prev.map((p) => ({ ...p, statut: "encours", detail: "couleur…" })),
      );
      const affinés: SlideBurnInput[] = [];
      for (const slide of aBurner) {
        let zones = slide.zones;
        if (slide.brutUrl) {
          try {
            const avant = slide.zones.map(
              (z) => `${z.couleur}${z.ombre ? "+s" : ""}`,
            );
            zones = await affinerZonesDepuisBrut(slide.brutUrl, slide.zones);
            const apres = zones.map(
              (z) => `${z.couleur}${z.ombre ? "+s" : ""}`,
            );
            push(
              `#${slide.position} pixels brut: ${apres.join(", ")} (Gemini disait ${avant.join(", ")})`,
            );
          } catch (e) {
            push(
              `#${slide.position} sample couleur échec · ${e instanceof Error ? e.message : e}`,
            );
          }
        }
        affinés.push({ ...slide, zones });
      }

      const { corpsFrac, titreFrac } = calculerFractionsTaille(affinés);
      push(
        `taille unifiée corps=${(corpsFrac * 100).toFixed(1)}%H · titre=${(titreFrac * 100).toFixed(1)}%H`,
      );

      for (const slide of affinés) {
        setPreviews((prev) =>
          prev.map((p) =>
            p.position === slide.position
              ? { ...p, statut: "encours", detail: "burn Canvas…" }
              : p,
          ),
        );
        try {
          const url = await brulerTexteSurImage(slide.propreUrl, slide.zones, {
            corpsFrac,
            titreFrac,
          });
          const couleurs = slide.zones.map((z) => z.couleur).join("/");
          setPreviews((prev) =>
            prev.map((p) =>
              p.position === slide.position
                ? {
                    ...p,
                    previewUrl: url,
                    statut: "ok",
                    detail: couleurs,
                  }
                : p,
            ),
          );
          push(`#${slide.position} burn OK · ${couleurs}`);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          setPreviews((prev) =>
            prev.map((p) =>
              p.position === slide.position
                ? { ...p, statut: "echec", detail: msg }
                : p,
            ),
          );
          push(`#${slide.position} burn échec · ${msg}`);
        }
      }
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    } finally {
      setEnCours(false);
    }
  }

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Type className="size-4 text-primary" />
          {t("tests.brulerTitre")}
        </CardTitle>
        <CardDescription>{t("tests.brulerDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="brulerLangue">{t("tests.langue")}</Label>
          <select
            id="brulerLangue"
            className={selectClass}
            value={langue}
            disabled={enCours}
            onChange={(e) => setLangue(e.target.value)}
          >
            {LANGUES_CIBLES.map((l) => (
              <option key={l} value={l}>
                {nomLangue(l)}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {t("tests.brulerFiltreLabel")}
          </p>
          <div className="flex flex-wrap gap-1.5">
            <Chip
              actif={filtreLabel === null}
              disabled={enCours}
              onClick={() => setFiltreLabel(null)}
            >
              {t("tests.brulerLabelsTous")}
            </Chip>
            <Chip
              actif={filtreLabel === "__none__"}
              disabled={enCours}
              onClick={() => setFiltreLabel("__none__")}
            >
              {t("tests.brulerSansLabel")}
            </Chip>
            {labelsDisponibles.map((l) => (
              <Chip
                key={l.id}
                actif={filtreLabel === l.id}
                disabled={enCours}
                onClick={() =>
                  setFiltreLabel(filtreLabel === l.id ? null : l.id)
                }
                style={
                  filtreLabel === l.id || !l.couleur
                    ? undefined
                    : { borderColor: l.couleur, color: l.couleur }
                }
              >
                {l.nom}
              </Chip>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="brulerRecherche">{t("tests.brulerRecherche")}</Label>
          <Input
            id="brulerRecherche"
            value={recherche}
            disabled={enCours}
            placeholder={t("tests.brulerRecherchePh")}
            onChange={(e) => setRecherche(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <Label>{t("tests.brulerSlideshow")}</Label>
            <span className="text-[11px] text-muted-foreground">
              {slideshows.isLoading
                ? "…"
                : t("tests.brulerNbResultats", {
                    n: slideshowsFiltres.length,
                  })}
            </span>
          </div>
          <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border p-1">
            {slideshows.isLoading && (
              <p className="px-2 py-3 text-xs text-muted-foreground">
                {t("tests.enCours")}
              </p>
            )}
            {!slideshows.isLoading && slideshowsFiltres.length === 0 && (
              <p className="px-2 py-3 text-xs text-muted-foreground">
                {t("tests.brulerAucun")}
              </p>
            )}
            {slideshowsFiltres.map((c) => {
              const thumb = vignette(c);
              const actif = contenuId === c.id;
              const nbSlides = (c.structure_slides ?? []).length;
              return (
                <button
                  key={c.id}
                  type="button"
                  disabled={enCours}
                  onClick={() => setContenuId(c.id)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors",
                    actif
                      ? "bg-primary/10 ring-1 ring-primary"
                      : "hover:bg-muted/70",
                  )}
                >
                  {thumb ? (
                    <img
                      src={thumb}
                      alt=""
                      className="size-10 shrink-0 rounded object-cover"
                    />
                  ) : (
                    <div className="size-10 shrink-0 rounded bg-muted" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {(c.titre ?? c.id).slice(0, 80)}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {nbSlides} slide{nbSlides > 1 ? "s" : ""}
                      {c.langue_source ? ` · ${c.langue_source}` : ""}
                      {(c.labels ?? []).length > 0
                        ? ` · ${(c.labels ?? []).map((l) => l.nom).join(", ")}`
                        : ""}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
          {selection && (
            <p className="text-[11px] text-muted-foreground">
              {t("tests.brulerSelection")}:{" "}
              <span className="font-medium text-foreground">
                {(selection.titre ?? selection.id).slice(0, 90)}
              </span>
            </p>
          )}
        </div>

        <Button
          disabled={enCours || !contenuId}
          onClick={() => void lancer()}
        >
          <Type className="size-4" />
          {enCours ? t("tests.enCours") : t("tests.brulerLancer")}
        </Button>

        <BarreChargement
          actif={enCours}
          dureeMs={12_000}
          label={t("tests.enCours")}
        />

        {erreur && <p className="text-sm text-destructive">{erreur}</p>}

        {logs.length > 0 && (
          <div className="space-y-1">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {t("tests.brulerLogs")}
            </p>
            <div className="max-h-80 space-y-0.5 overflow-y-auto rounded border bg-muted/30 px-2 py-1.5 font-mono text-[10px] leading-relaxed text-muted-foreground">
              {logs.map((l, i) => (
                <div
                  key={`${i}-${l.slice(0, 12)}`}
                  className={
                    l.startsWith("──")
                      ? "pt-1 font-semibold text-foreground"
                      : l.includes("OCR:")
                        ? "text-foreground/80"
                        : undefined
                  }
                >
                  {l}
                </div>
              ))}
            </div>
          </div>
        )}

        {previews.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {previews.map((p) => (
              <figure
                key={p.position}
                className="overflow-hidden rounded-lg border"
              >
                {p.previewUrl ? (
                  <img
                    src={p.previewUrl}
                    alt={`slide ${p.position}`}
                    className="aspect-[9/16] w-full object-cover"
                  />
                ) : (
                  <div className="flex aspect-[9/16] items-center justify-center bg-muted text-xs text-muted-foreground">
                    #{p.position} · {p.statut}
                  </div>
                )}
                <figcaption className="space-y-0.5 p-2 text-[11px]">
                  <p className="font-medium">
                    {t("tests.brulerSlideN", { n: p.position })} · {p.statut}
                  </p>
                  {p.texteTraduit && (
                    <p className="line-clamp-2 text-muted-foreground">
                      {p.texteTraduit}
                    </p>
                  )}
                  {p.detail && (
                    <p className="text-muted-foreground">{p.detail}</p>
                  )}
                </figcaption>
              </figure>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
