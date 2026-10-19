import * as React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Copy, ScanSearch, Sticker, Trash2 } from "lucide-react";

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
  formatDuree,
  ligneAnalyse,
  LOT_NETTOYAGE,
  resumeIgnores,
  tempsRestant,
  type SlideshowLabelSticker,
  type SlideshowsLabelStickers,
} from "./nettoyageStickers";
import { CONCURRENCE_STICKERS, enParallele, type EtatStickerTest } from "./testStickers";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

/** Lignes gardées dans le journal (les plus anciennes partent au-delà). */
const JOURNAL_MAX = 5000;

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
  const [journal, setJournal] = React.useState<string[]>([]);
  const [debut, setDebut] = React.useState<number | null>(null);
  const [maintenant, setMaintenant] = React.useState(() => Date.now());
  const journalRef = React.useRef<HTMLDivElement>(null);

  const label = (labels.data ?? []).find((l) => l.id === labelId) ?? null;
  const occupe = phase !== "repos";

  const log = React.useCallback((ligne: string) => {
    const heure = new Date().toLocaleTimeString("fr-FR", { hour12: false });
    setJournal((j) => [...j, `${heure}  ${ligne}`].slice(-JOURNAL_MAX));
  }, []);

  // Chrono : une seconde de résolution tant qu'une opération tourne.
  React.useEffect(() => {
    if (!occupe) return;
    const id = window.setInterval(() => setMaintenant(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [occupe]);

  // Le journal suit la dernière ligne.
  React.useEffect(() => {
    const el = journalRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [journal]);

  const scanner = async () => {
    if (!labelId) return;
    const t0 = Date.now();
    setPhase("scan");
    setErreur(null);
    setBilan(null);
    setListe(null);
    setEtats({});
    setJournal([]);
    setDebut(t0);
    setMaintenant(t0);
    log(`Label « ${label?.nom ?? labelId} » : lecture des slideshows…`);
    try {
      const l = await listerSlideshowsLabelStickers(labelId);
      setListe(l);
      log(
        `${l.total} slideshows valides : ${l.slideshows.length} à analyser · ${l.proteges} gardés (tier A ou mieux) · ` +
          `${l.pods} pods · ${l.sansImages} sans images brutes`,
      );
      let pubs = 0;
      let enErreur = 0;
      const maj = (id: string, etat: EtatStickerTest) => setEtats((avant) => ({ ...avant, [id]: etat }));
      await enParallele(l.slideshows, CONCURRENCE_STICKERS, async (s) => {
        maj(s.id, { statut: "encours" });
        let etat: Extract<EtatStickerTest, { statut: "ok" | "erreur" }>;
        try {
          etat = { statut: "ok", resultat: await analyserStickersSlideshow(s.id) };
          if (aRetirer(etat.resultat)) pubs += 1;
        } catch (e) {
          etat = { statut: "erreur", message: (e as Error).message };
          enErreur += 1;
        }
        maj(s.id, etat);
        log(ligneAnalyse(s, etat));
      });
      log(
        `Analyse terminée en ${formatDuree(Date.now() - t0)} : ${pubs} à retirer (sticker pub)` +
          (enErreur ? `, ${enErreur} en erreur` : ""),
      );
    } catch (e) {
      setErreur((e as Error).message);
      log(`⚠ Arrêt : ${(e as Error).message}`);
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
    const t0 = Date.now();
    setPhase("retrait");
    setErreur(null);
    setDebut(t0);
    setMaintenant(t0);
    const b: BilanRetrait = { retires: 0, ignores: 0, posts: 0, remplaces: 0, sansRemplacant: 0, erreurs: [] };
    setBilan({ ...b });
    const lots = enLots(aRetirerListe.map((s) => s.id), LOT_NETTOYAGE);
    log(`Retrait de ${aRetirerListe.length} slideshows en ${lots.length} lot${lots.length > 1 ? "s" : ""}…`);
    try {
      const posts: string[] = [];
      for (const [i, lot] of lots.entries()) {
        const r = await appliquerNettoyageStickers(lot, label?.nom ?? null);
        b.retires += r.retires.length;
        b.ignores += r.ignores.length;
        posts.push(...r.postsARemplacer);
        setBilan({ ...b });
        const laisses = resumeIgnores(r.ignores);
        log(
          `Lot ${i + 1}/${lots.length} : ${r.retires.length} retirés` +
            (r.ignores.length ? `, ${r.ignores.length} laissés (${laisses})` : "") +
            `, ${r.postsARemplacer.length} posts du jour à remplacer`,
        );
      }
      b.posts = posts.length;
      setBilan({ ...b });
      log(posts.length ? `Remplacement de ${posts.length} posts du jour…` : "Aucun post du jour à remplacer.");
      await enParallele(posts, CONCURRENCE_REMPLACEMENT, async (postId) => {
        try {
          const r = await revoquerPost(postId);
          if (r.newPostId) {
            b.remplaces += 1;
            log(`↻ post ${postId.slice(0, 8)} → nouveau post ${r.newPostId.slice(0, 8)}`);
          } else {
            b.sansRemplacant += 1;
            const detail = (r as { detail?: string }).detail ?? r.error ?? "aucun slideshow disponible";
            log(`· post ${postId.slice(0, 8)} : pas de remplaçant (${detail})`);
          }
        } catch (e) {
          b.erreurs.push((e as Error).message);
          log(`⚠ post ${postId.slice(0, 8)} : ${(e as Error).message}`);
        }
        setBilan({ ...b, erreurs: [...b.erreurs] });
      });
      log(
        `Terminé en ${formatDuree(Date.now() - t0)} : ${b.retires} retirés, ${b.remplaces}/${b.posts} posts remplacés` +
          (b.sansRemplacant ? `, ${b.sansRemplacant} sans remplaçant` : "") +
          (b.erreurs.length ? `, ${b.erreurs.length} en erreur` : ""),
      );
    } catch (e) {
      setErreur((e as Error).message);
      log(`⚠ Arrêt : ${(e as Error).message}`);
    } finally {
      setBilan({ ...b, erreurs: [...b.erreurs] });
      setPhase("repos");
    }
  };

  const ecoule = debut ? maintenant - debut : 0;
  const remplacementsFaits = bilan ? bilan.remplaces + bilan.sansRemplacant + bilan.erreurs.length : 0;
  const reste =
    phase === "scan"
      ? tempsRestant(analyses, candidats.length, ecoule)
      : phase === "retrait" && bilan && bilan.posts > 0
        ? tempsRestant(remplacementsFaits, bilan.posts, ecoule)
        : null;

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
                setJournal([]);
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

        {occupe && debut && (
          <p className="text-xs tabular-nums text-muted-foreground">
            {t("nettoyageStickers.chrono", { ecoule: formatDuree(ecoule) })}
            {reste !== null && ` · ${t("nettoyageStickers.reste", { reste: formatDuree(reste) })}`}
          </p>
        )}

        {phase === "retrait" && bilan && bilan.posts > 0 && (
          <div className="space-y-1">
            <Progress value={(remplacementsFaits / bilan.posts) * 100} />
            <p className="text-xs text-muted-foreground">
              {t("nettoyageStickers.remplacements", { n: remplacementsFaits, total: bilan.posts })}
            </p>
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

        {journal.length > 0 && (
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-muted-foreground">
                {t("nettoyageStickers.journal", { n: journal.length })}
              </p>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void navigator.clipboard?.writeText(journal.join("\n"))}
              >
                <Copy className="size-3.5" />
                {t("nettoyageStickers.copierJournal")}
              </Button>
            </div>
            <div
              ref={journalRef}
              className="max-h-64 space-y-0.5 overflow-y-auto rounded border bg-muted/30 px-2.5 py-2 font-mono text-[11px] leading-relaxed"
            >
              {journal.map((l, i) => (
                <div
                  key={`j-${i}`}
                  className={cn(
                    "break-words",
                    l.includes("✗ PUB") || l.includes("⚠")
                      ? "text-destructive"
                      : l.includes("↻")
                        ? "text-foreground"
                        : "text-muted-foreground",
                  )}
                >
                  {l}
                </div>
              ))}
            </div>
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
