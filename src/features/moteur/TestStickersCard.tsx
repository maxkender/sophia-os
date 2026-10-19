import * as React from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Shuffle, Sticker } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
  type SlideshowStickerTest,
} from "./testStickers";

/**
 * Test à blanc de la règle « un TikTok avec un sticker n'est pas importé » :
 * tire N slideshows valides au hasard, passe chaque slide dans l'OCR d'import
 * (fonction `test-stickers`, CONCURRENCE_STICKERS slideshows à la fois) et
 * montre ceux qui auraient été rejetés, slide fautive encadrée. Rien n'est écrit.
 */
export function TestStickersCard() {
  const { t } = useTranslation();
  const [n, setN] = React.useState(N_STICKERS_DEFAUT);
  const [slideshows, setSlideshows] = React.useState<SlideshowStickerTest[]>([]);
  const [etats, setEtats] = React.useState<Record<string, EtatStickerTest>>({});
  const [enCours, setEnCours] = React.useState(false);
  const [erreur, setErreur] = React.useState<string | null>(null);
  const [stickersSeuls, setStickersSeuls] = React.useState(false);

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
  const affiches = ordreAffichage(slideshows, etats, stickersSeuls);

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
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={stickersSeuls} onCheckedChange={(v) => setStickersSeuls(Boolean(v))} />
            {t("tests.stickersSeuls")}
          </label>
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
                {t("tests.stickersDetectes", {
                  n: bilan.stickers,
                  pct: bilan.termines ? Math.round((bilan.stickers / bilan.termines) * 100) : 0,
                  slides: bilan.slidesSticker,
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
        resultat?.sticker && "border-destructive/60 bg-destructive/5",
      )}
    >
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {resultat ? (
          resultat.sticker ? (
            <Badge variant="error">{t("tests.stickersRejete")}</Badge>
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
          return (
            <a
              key={slide.position}
              href={slide.url}
              target="_blank"
              rel="noreferrer"
              title={r?.erreur ?? (r?.sticker ? t("tests.stickersSlide") : r?.texte || undefined)}
              className={cn(
                "relative block shrink-0 overflow-hidden rounded-md border-2",
                r?.sticker ? "border-destructive" : r?.erreur ? "border-warning" : "border-transparent",
              )}
            >
              <img src={slide.url} alt="" loading="lazy" className="h-36 w-20 object-cover" />
              <span className="absolute left-1 top-1 rounded bg-black/60 px-1 text-[10px] text-white">
                {slide.position}
              </span>
              {r?.sticker && (
                <span className="absolute inset-x-0 bottom-0 bg-destructive py-0.5 text-center text-[10px] font-semibold text-white">
                  STICKER
                </span>
              )}
            </a>
          );
        })}
      </div>
    </div>
  );
}
