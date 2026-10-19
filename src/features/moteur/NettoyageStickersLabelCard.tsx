import * as React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ScanSearch, Sticker, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  analyserStickersSlideshow,
  appliquerNettoyageStickers,
  listerLabels,
  listerSlideshowsLabelStickers,
  revoquerPost,
} from "./api";
import {
  aRetirer,
  CONCURRENCE_REMPLACEMENT,
  enLots,
  LOT_NETTOYAGE,
  type SlideshowLabelSticker,
  type SlideshowsLabelStickers,
} from "./nettoyageStickers";
import { CONCURRENCE_STICKERS, enParallele, type EtatStickerTest } from "./testStickers";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

interface BilanRetrait {
  retires: number;
  ignores: number;
  posts: number;
  remplaces: number;
  sansRemplacant: number;
  erreurs: string[];
}

/**
 * Nettoyage stickers d'un label : passe tous ses slideshows dans l'OCR
 * d'import (à blanc, CONCURRENCE_STICKERS à la fois), montre ceux qui portent
 * un sticker PUB, puis — sur confirmation — les retire (`statut = rejete`) et
 * remplace leurs posts du jour pas encore publiés. Les stickers de contenu
 * restent ; pods, tier A ou mieux et nos applis (Sophia, UnSwipe, Micabo)
 * sont gardés.
 */
export function NettoyageStickersLabelCard() {
  const { t } = useTranslation();
  const labels = useQuery({ queryKey: ["labels"], queryFn: () => listerLabels(), staleTime: 60_000 });
  const [labelId, setLabelId] = React.useState("");
  const [liste, setListe] = React.useState<SlideshowsLabelStickers | null>(null);
  const [etats, setEtats] = React.useState<Record<string, EtatStickerTest>>({});
  const [phase, setPhase] = React.useState<"repos" | "scan" | "retrait">("repos");
  const [erreur, setErreur] = React.useState<string | null>(null);
  const [bilan, setBilan] = React.useState<BilanRetrait | null>(null);

  const label = (labels.data ?? []).find((l) => l.id === labelId) ?? null;
  const occupe = phase !== "repos";

  const scanner = async () => {
    if (!labelId) return;
    setPhase("scan");
    setErreur(null);
    setBilan(null);
    setListe(null);
    setEtats({});
    try {
      const l = await listerSlideshowsLabelStickers(labelId);
      setListe(l);
      const maj = (id: string, etat: EtatStickerTest) => setEtats((avant) => ({ ...avant, [id]: etat }));
      await enParallele(l.slideshows, CONCURRENCE_STICKERS, async (s) => {
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
      setPhase("repos");
    }
  };

  const candidats = liste?.slideshows ?? [];
  const analyses = candidats.filter((s) => etats[s.id]?.statut === "ok" || etats[s.id]?.statut === "erreur").length;
  const erreurs = candidats.filter((s) => etats[s.id]?.statut === "erreur").length;
  const aRetirerListe = candidats.filter((s) => {
    const e = etats[s.id];
    return e?.statut === "ok" && aRetirer(e.resultat);
  });

  const retirer = async () => {
    if (aRetirerListe.length === 0) return;
    if (!window.confirm(t("nettoyageStickers.confirmer", { n: aRetirerListe.length, label: label?.nom ?? "" }))) {
      return;
    }
    setPhase("retrait");
    setErreur(null);
    const b: BilanRetrait = { retires: 0, ignores: 0, posts: 0, remplaces: 0, sansRemplacant: 0, erreurs: [] };
    try {
      const posts: string[] = [];
      for (const lot of enLots(aRetirerListe.map((s) => s.id), LOT_NETTOYAGE)) {
        const r = await appliquerNettoyageStickers(lot, label?.nom ?? null);
        b.retires += r.retires.length;
        b.ignores += r.ignores.length;
        posts.push(...r.postsARemplacer);
        setBilan({ ...b });
      }
      b.posts = posts.length;
      setBilan({ ...b });
      await enParallele(posts, CONCURRENCE_REMPLACEMENT, async (postId) => {
        try {
          const r = await revoquerPost(postId);
          if (r.newPostId) b.remplaces += 1;
          else b.sansRemplacant += 1;
        } catch (e) {
          b.erreurs.push((e as Error).message);
        }
        setBilan({ ...b, erreurs: [...b.erreurs] });
      });
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setBilan({ ...b, erreurs: [...b.erreurs] });
      setPhase("repos");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sticker className="size-4 text-primary" />
          {t("nettoyageStickers.titre")}
        </CardTitle>
        <CardDescription>{t("nettoyageStickers.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-64 space-y-1">
            <Label htmlFor="nettoyageLabel">{t("nettoyageStickers.label")}</Label>
            <select
              id="nettoyageLabel"
              className={selectClass}
              value={labelId}
              disabled={occupe}
              onChange={(e) => {
                setLabelId(e.target.value);
                setListe(null);
                setEtats({});
                setBilan(null);
              }}
            >
              <option value="">{t("nettoyageStickers.choisirLabel")}</option>
              {(labels.data ?? []).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nom}
                </option>
              ))}
            </select>
          </div>
          <Button onClick={scanner} disabled={!labelId || occupe}>
            <ScanSearch className="size-4" />
            {phase === "scan" ? t("tests.enCours") : t("nettoyageStickers.analyser")}
          </Button>
        </div>

        {erreur && <p className="text-sm text-destructive">{erreur}</p>}

        {liste && (
          <div className="space-y-2">
            <Progress value={candidats.length ? (analyses / candidats.length) * 100 : 100} />
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge variant="outline">
                {t("nettoyageStickers.analyses", { n: analyses, total: candidats.length, valides: liste.total })}
              </Badge>
              <Badge variant="error">{t("nettoyageStickers.aRetirer", { n: aRetirerListe.length })}</Badge>
              <Badge variant="success">{t("nettoyageStickers.proteges", { n: liste.proteges })}</Badge>
              <Badge variant="secondary">{t("nettoyageStickers.pods", { n: liste.pods })}</Badge>
              {liste.sansImages > 0 && (
                <Badge variant="secondary">{t("nettoyageStickers.sansImages", { n: liste.sansImages })}</Badge>
              )}
              {erreurs > 0 && <Badge variant="warning">{t("nettoyageStickers.erreurs", { n: erreurs })}</Badge>}
            </div>
          </div>
        )}

        {liste && analyses === candidats.length && phase === "repos" && aRetirerListe.length > 0 && (
          <Button variant="destructive" onClick={retirer}>
            <Trash2 className="size-4" />
            {t("nettoyageStickers.retirer", { n: aRetirerListe.length })}
          </Button>
        )}

        {bilan && (
          <div className="space-y-1 rounded-lg border p-3 text-sm">
            <p>{t("nettoyageStickers.bilanRetires", { n: bilan.retires, ignores: bilan.ignores })}</p>
            <p>
              {t("nettoyageStickers.bilanPosts", {
                n: bilan.posts,
                remplaces: bilan.remplaces,
                sans: bilan.sansRemplacant,
              })}
            </p>
            {bilan.erreurs.length > 0 && (
              <p className="text-destructive">
                {t("nettoyageStickers.bilanErreurs", { n: bilan.erreurs.length })} — {bilan.erreurs[0]}
              </p>
            )}
          </div>
        )}

        <div className="space-y-3">
          {aRetirerListe.map((s) => (
            <LigneARetirer key={s.id} slideshow={s} etat={etats[s.id]} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function LigneARetirer({ slideshow, etat }: { slideshow: SlideshowLabelSticker; etat?: EtatStickerTest }) {
  const resultat = etat?.statut === "ok" ? etat.resultat : null;
  const parPosition = new Map((resultat?.slides ?? []).map((x) => [x.position, x]));
  return (
    <div className="space-y-2 rounded-lg border border-destructive/40 p-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link className="min-w-0 truncate font-medium hover:underline" to={`/admin/slideshows?id=${slideshow.id}`}>
          {slideshow.titre?.slice(0, 80) || slideshow.id.slice(0, 8)}
        </Link>
        {slideshow.tier && (
          <Badge variant="outline" className="text-[10px]">
            {slideshow.tier}
          </Badge>
        )}
        <span className="text-xs text-muted-foreground">{slideshow.created_at.slice(0, 10)}</span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {slideshow.slides.map((slide) => {
          const r = parPosition.get(slide.position);
          const pub = r?.sticker === "pub";
          return (
            <a
              key={slide.position}
              href={slide.url}
              target="_blank"
              rel="noreferrer"
              className={cn(
                "relative block shrink-0 overflow-hidden rounded-md border-2",
                pub ? "border-destructive" : "border-transparent",
              )}
            >
              <img src={slide.url} alt="" loading="lazy" className="h-28 w-16 object-cover" />
              {pub && (
                <span className="absolute inset-x-0 bottom-0 bg-destructive py-0.5 text-center text-[9px] font-semibold text-white">
                  PUB
                </span>
              )}
            </a>
          );
        })}
      </div>
    </div>
  );
}
