import * as React from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Shuffle, Sticker } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { analyserStickersSlideshow, tirerSlideshowsStickers } from "./api";
import {
  bilanStickers,
  CONCURRENCE_STICKERS,
  enParallele,
  N_STICKERS_DEFAUT,
  N_STICKERS_MAX,
  ordreAffichage,
  type EtatStickerTest,
  type FiltreStickers,
  type SlideshowStickerTest,
} from "./testStickers";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

/**
 * Test à blanc de la règle stickers de l'import : tire N slideshows valides
 * au hasard, passe chaque slide dans l'OCR d'import (fonction `test-stickers`,
 * CONCURRENCE_STICKERS slideshows à la fois) et montre les deux familles :
 * sticker PUB (app, marque : le TikTok serait rejeté) et sticker de CONTENU
 * (livre, vidéo, article : importé quand même). Rien n'est écrit.
 */
export function TestStickersCard() {
  const { t } = useTranslation();
  const [n, setN] = React.useState(N_STICKERS_DEFAUT);
  const [slideshows, setSlideshows] = React.useState<SlideshowStickerTest[]>([]);
  const [etats, setEtats] = React.useState<Record<string, EtatStickerTest>>({});
  const [enCours, setEnCours] = React.useState(false);
  const [erreur, setErreur] = React.useState<string | null>(null);
  const [filtre, setFiltre] = React.useState<FiltreStickers>("tous");

  const lancer = async () => {
    setEnCours(true);
    setErreur(null);
    setSlideshows([]);
    setEtats({});
    try {
      const tires = await tirerSlideshowsStickers(n);
      setSlideshows(tires);
      setEtats(Object.fromEntries(tires.map((s) => [s.id, { statut: "attente" } as EtatStickerTest])));
      const maj = (id: string, etat: EtatStickerTest) => setEtats((avant) => ({ ...avant, [id]: etat }));
      await enParallele(tires, CONCURRENCE_STICKERS, async (s) => {
        maj(s.id, { statut: "encours" });
        try {
          maj(s.id, { statut: "ok", resultat: await analyserStickersSlideshow(s.id) });
        } catch (e) {
          maj(s.id, { statut: "erreur", message: (e as Error).message });
        }
      });
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setEnCours(false);
    }
  };

  const bilan = bilanStickers(slideshows, etats);
  const affiches = ordreAffichage(slideshows, etats, filtre);
  const pct = (x: number) => (bilan.termines ? Math.round((x / bilan.termines) * 100) : 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sticker className="size-4 text-primary" />
          {t("tests.stickersTitre")}
        </CardTitle>
        <CardDescription>{t("tests.stickersDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="stickersN">{t("tests.stickersNombre")}</Label>
            <Input
              id="stickersN"
              type="number"
              min={1}
              max={N_STICKERS_MAX}
              className="w-28"
              value={n}
              disabled={enCours}
              onChange={(e) =>
                setN(Math.max(1, Math.min(N_STICKERS_MAX, Number(e.target.value) || N_STICKERS_DEFAUT)))
              }
            />
          </div>
          <Button onClick={lancer} disabled={enCours}>
            <Shuffle className="size-4" />
            {enCours ? t("tests.enCours") : t("tests.stickersLancer")}
          </Button>
          <div className="w-64 space-y-1">
            <Label htmlFor="stickersFiltre">{t("tests.stickersFiltre")}</Label>
            <select
              id="stickersFiltre"
              className={selectClass}
              value={filtre}
              onChange={(e) => setFiltre(e.target.value as FiltreStickers)}
            >
              <option value="tous">{t("tests.stickersFiltreTous")}</option>
              <option value="pub">{t("tests.stickersFiltrePub")}</option>
              <option value="contenu">{t("tests.stickersFiltreContenu")}</option>
            </select>
          </div>
        </div>

        {erreur && <p className="text-sm text-destructive">{erreur}</p>}

        {bilan.total > 0 && (
          <div className="space-y-2">
            <Progress value={(bilan.termines / bilan.total) * 100} />
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge variant="outline">
                {t("tests.stickersAnalyses", { n: bilan.termines, total: bilan.total })}
              </Badge>
              <Badge variant="error">
                {t("tests.stickersPubs", { n: bilan.rejetes, pct: pct(bilan.rejetes), slides: bilan.slidesPub })}
              </Badge>
              <Badge variant="info">
                {t("tests.stickersContenus", {
                  n: bilan.contenus,
                  pct: pct(bilan.contenus),
                  slides: bilan.slidesContenu,
                })}
              </Badge>
              <Badge variant="success">{t("tests.stickersPropres", { n: bilan.propres })}</Badge>
              {bilan.erreurs > 0 && (
                <Badge variant="warning">{t("tests.stickersErreurs", { n: bilan.erreurs })}</Badge>
              )}
            </div>
          </div>
        )}

        <div className="space-y-3">
          {affiches.map((s) => (
            <LigneSlideshow key={s.id} slideshow={s} etat={etats[s.id]} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function LigneSlideshow({ slideshow, etat }: { slideshow: SlideshowStickerTest; etat?: EtatStickerTest }) {
  const { t } = useTranslation();
  const resultat = etat?.statut === "ok" ? etat.resultat : null;
  const parPosition = new Map((resultat?.slides ?? []).map((x) => [x.position, x]));

  return (
    <div
      className={cn(
        "space-y-2 rounded-lg border p-3",
        resultat?.rejete && "border-destructive/60 bg-destructive/5",
        resultat && !resultat.rejete && resultat.contenu && "border-info/60 bg-info/5",
      )}
    >
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {resultat ? (
          resultat.rejete ? (
            <Badge variant="error">{t("tests.stickersRejetePub")}</Badge>
          ) : resultat.contenu ? (
            <Badge variant="info">{t("tests.stickersImporteContenu")}</Badge>
          ) : (
            <Badge variant="success">{t("tests.stickersImporte")}</Badge>
          )
        ) : etat?.statut === "erreur" ? (
          <Badge variant="warning">{t("tests.stickersErreur")}</Badge>
        ) : (
          <Badge variant="outline">
            {etat?.statut === "encours" ? t("tests.enCours") : t("tests.stickersAttente")}
          </Badge>
        )}
        <Link className="min-w-0 truncate font-medium hover:underline" to={`/admin/slideshows?id=${slideshow.id}`}>
          {slideshow.titre?.slice(0, 80) || slideshow.id.slice(0, 8)}
        </Link>
        <span className="text-xs text-muted-foreground">{slideshow.created_at.slice(0, 10)}</span>
      </div>
      {etat?.statut === "erreur" && <p className="text-xs text-destructive">{etat.message}</p>}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {slideshow.slides.map((slide) => {
          const r = parPosition.get(slide.position);
          const titre =
            r?.erreur ??
            (r?.sticker === "pub"
              ? t("tests.stickersSlidePub")
              : [r?.sticker === "contenu" ? t("tests.stickersSlideContenu") : "", r?.texte ?? ""]
                  .filter(Boolean)
                  .join(" — ") || undefined);
          return (
            <a
              key={slide.position}
              href={slide.url}
              target="_blank"
              rel="noreferrer"
              title={titre}
              className={cn(
                "relative block shrink-0 overflow-hidden rounded-md border-2",
                r?.sticker === "pub"
                  ? "border-destructive"
                  : r?.sticker === "contenu"
                    ? "border-info"
                    : r?.erreur
                      ? "border-warning"
                      : "border-transparent",
              )}
            >
              <img src={slide.url} alt="" loading="lazy" className="h-36 w-20 object-cover" />
              <span className="absolute left-1 top-1 rounded bg-black/60 px-1 text-[10px] text-white">
                {slide.position}
              </span>
              {r?.sticker && (
                <span
                  className={cn(
                    "absolute inset-x-0 bottom-0 py-0.5 text-center text-[10px] font-semibold text-white",
                    r.sticker === "pub" ? "bg-destructive" : "bg-info",
                  )}
                >
                  {r.sticker === "pub" ? "PUB" : "CONTENU"}
                </span>
              )}
            </a>
          );
        })}
      </div>
    </div>
  );
}
