import * as React from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ArrowRight, Check, Lock, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogPopup } from "@/components/ui/dialog";
import type { Review } from "@/features/moteur/api";
import { Mico } from "@/features/onboarding/Mico";
import { basDePageAtteint } from "@/features/onboarding/parcours";
import { cn } from "@/lib/utils";

import { LecteurVideosReview } from "./LecteurVideosReview";
import { TikTokEmbed } from "./TikTokEmbed";

/** Ce que le parcours affiche d'un retour : le message et le post qu'il commente. */
export type RetourAffiche = Pick<
  Review,
  "id" | "body" | "publie_url" | "source_url" | "handle_tiktok" | "compte_label" | "date_publication" | "videos"
>;

/**
 * reel : le retour arrive, on n'en sort qu'avec « Compris » (marqué lu) ;
 * relecture : le créateur le rouvre depuis « Mes retours », il se ferme ;
 * apercu : l'admin regarde ce que verrait le créateur, rien n'est enregistré.
 */
export type ModeRetour = "reel" | "relecture" | "apercu";

type Etape = "comparer" | "retour";

/** Sans aucun des deux liens, il n'y a rien à comparer : on passe directement au message. */
function etapesDuRetour(r: Pick<RetourAffiche, "publie_url" | "source_url">): Etape[] {
  return r.publie_url || r.source_url ? ["comparer", "retour"] : ["retour"];
}

function Pastilles({ total, actuelle }: { total: number; actuelle: number }) {
  return (
    <div className="flex items-center gap-1.5" aria-hidden>
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={cn(
            "h-1.5 rounded-full transition-all duration-500",
            i < actuelle && "w-1.5 bg-primary/40",
            i === actuelle && "w-6 bg-primary",
            i > actuelle && "w-1.5 bg-muted",
          )}
        />
      ))}
    </div>
  );
}

/**
 * Un retour de l'admin, vu par le créateur, comme un petit onboarding :
 *   1. son post à côté de l'original (les lecteurs TikTok, comme dans la file
 *      de l'admin), pour qu'il voie la différence avant de lire quoi que ce soit ;
 *      le dialogue prend alors toute la hauteur, ce sont les posts qui comptent ;
 *   2. le message et les vidéos tuto. « Compris » ne s'ouvre qu'une fois le
 *      message déroulé jusqu'en bas, comme les écrans de l'onboarding.
 * Sur téléphone, les deux posts ne tiennent pas côte à côte : un sélecteur
 * passe de l'un à l'autre.
 */
export function RetourParcours({
  retour,
  mode,
  onCompris,
  onFermer,
  occupe = false,
  ensuite = 0,
}: {
  retour: RetourAffiche;
  mode: ModeRetour;
  /** Dernier bouton (« Compris » en vrai et en aperçu, « Fermer » en relecture). */
  onCompris: () => void;
  /** Croix ou clic à côté, hors mode réel. */
  onFermer?: () => void;
  occupe?: boolean;
  /** Retours non lus qui suivent celui-ci (ils s'enchaînent après « Compris »). */
  ensuite?: number;
}) {
  const { t, i18n } = useTranslation();
  const etapes = etapesDuRetour(retour);
  const [index, setIndex] = React.useState(0);
  const [vue, setVue] = React.useState<"original" | "poste">("original");
  const [basAtteint, setBasAtteint] = React.useState(false);
  const corps = React.useRef<HTMLDivElement>(null);
  const etape = etapes[Math.min(index, etapes.length - 1)];
  const derniere = index >= etapes.length - 1;
  const fermable = mode !== "reel";
  // En relecture, le créateur a déjà lu : pas de verrou. L'aperçu admin le montre.
  const verrou = mode !== "relecture" && etape === "retour" && !basAtteint;

  /** Remesure souvent : une mesure prise pendant l'animation d'entrée vaut zéro (cf. onboarding). */
  const verifierBas = React.useCallback(() => {
    const el = corps.current;
    if (el && basDePageAtteint(el)) setBasAtteint(true);
  }, []);

  React.useLayoutEffect(() => {
    setBasAtteint(false);
    if (corps.current) corps.current.scrollTop = 0;
    const id = requestAnimationFrame(verifierBas);
    return () => cancelAnimationFrame(id);
  }, [etape, verifierBas]);

  React.useEffect(() => {
    if (etape !== "retour") return;
    const el = corps.current;
    const ro = typeof ResizeObserver === "undefined" || !el ? null : new ResizeObserver(verifierBas);
    if (el) ro?.observe(el);
    const filet = setInterval(verifierBas, 1000);
    return () => {
      ro?.disconnect();
      clearInterval(filet);
    };
  }, [etape, verifierBas]);

  const compte =
    retour.compte_label || (retour.handle_tiktok ? `@${retour.handle_tiktok.replace(/^@/, "")}` : null);
  const date = retour.date_publication
    ? new Date(`${retour.date_publication}T12:00:00`).toLocaleDateString(i18n.language, {
        day: "numeric",
        month: "long",
      })
    : null;

  return (
    <Dialog
      open
      disablePointerDismissal={!fermable}
      onOpenChange={(ouvert) => {
        if (!ouvert && fermable) onFermer?.();
      }}
    >
      <DialogPopup
        showCloseButton={fermable}
        closeProps={fermable ? { onClick: () => onFermer?.() } : undefined}
        className={cn(
          "max-w-4xl",
          // Les posts prennent toute la hauteur (téléphone : sous la marge du haut du dialogue).
          etape === "comparer" && "h-[calc(100dvh-3rem)] sm:h-[calc(100dvh-2rem)] sm:max-h-[1100px]",
        )}
        onKeyDown={
          fermable
            ? undefined
            : (e) => {
                if (e.key === "Escape") e.preventDefault();
              }
        }
      >
        {/* En-tête sur une ligne : la place va aux posts et au message. */}
        <div className="flex items-center gap-3 rounded-t-2xl border-b bg-gradient-to-br from-primary/10 via-primary/5 to-transparent py-2.5 pr-12 pl-4 max-sm:rounded-none">
          <div key={etape} className="w-10 shrink-0 animate-in zoom-in-50 duration-500">
            <Mico etat={etape === "comparer" ? "wave" : "think"} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 key={etape} className="animate-in fade-in slide-in-from-right-2 truncate font-semibold text-sm tracking-tight duration-400 sm:text-base">
              {etape === "comparer" ? t("retour.titreComparer") : t("retour.titreRetour")}
            </h2>
            <p className="truncate text-muted-foreground text-xs">
              {mode === "apercu" && (
                <span className="mr-1.5 rounded bg-warning/20 px-1.5 py-px font-medium text-warning-foreground">
                  {t("retour.apercu")}
                </span>
              )}
              {[t("reviews.popupSous"), compte, date].filter(Boolean).join(" · ")}
              {ensuite > 0 ? ` · ${t("retour.ensuite", { count: ensuite })}` : ""}
            </p>
          </div>
          {etapes.length > 1 && (
            <div className="flex shrink-0 items-center gap-2">
              <Pastilles total={etapes.length} actuelle={index} />
              <span className="text-muted-foreground text-xs tabular-nums">
                {index + 1} / {etapes.length}
              </span>
            </div>
          )}
        </div>

        {/* Le corps défile, l'en-tête et les boutons restent en place. */}
        <div ref={corps} onScroll={verifierBas} className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-6">
          {etape === "comparer" ? (
            <div key="comparer" className="flex h-full min-h-0 animate-in flex-col gap-3 fade-in duration-500">
              {/* Téléphone : un seul lecteur à la fois. */}
              <div className="flex shrink-0 rounded-lg border p-0.5 md:hidden" role="tablist">
                {(["original", "poste"] as const).map((v) => (
                  <Button
                    key={v}
                    type="button"
                    size="sm"
                    role="tab"
                    variant={vue === v ? "secondary" : "ghost"}
                    aria-selected={vue === v}
                    className="flex-1"
                    onClick={() => setVue(v)}
                  >
                    {v === "original" ? t("retour.original") : t("retour.tonPost")}
                  </Button>
                ))}
              </div>
              <div className="grid min-h-[420px] flex-1 gap-4 md:grid-cols-2">
                <div className={cn("min-h-0", vue !== "original" && "max-md:hidden")}>
                  <TikTokEmbed
                    url={retour.source_url}
                    titre={t("retour.original")}
                    videLabel={t("retour.sansLien")}
                    chargementLabel={t("retour.chargement")}
                    pleineHauteur
                  />
                </div>
                <div className={cn("min-h-0", vue !== "poste" && "max-md:hidden")}>
                  <TikTokEmbed
                    url={retour.publie_url}
                    titre={t("retour.tonPost")}
                    videLabel={t("retour.sansLien")}
                    chargementLabel={t("retour.chargement")}
                    pleineHauteur
                  />
                </div>
              </div>
            </div>
          ) : (
            <div key="retour" className="animate-in fade-in slide-in-from-bottom-2 space-y-4 duration-500">
              <p className="whitespace-pre-wrap rounded-xl bg-muted/50 p-4 text-sm leading-relaxed">{retour.body}</p>
              {retour.videos.length > 0 && (
                <LecteurVideosReview
                  cle={retour.id}
                  videos={retour.videos}
                  progressLabel={(current, total) => t("reviews.videoProgress", { current, total })}
                />
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 border-t px-4 py-2.5 sm:px-6">
          {index > 0 ? (
            <Button variant="ghost" size="sm" onClick={() => setIndex(index - 1)}>
              <ArrowLeft />
              {t("retour.precedent")}
            </Button>
          ) : (
            !derniere && <p className="text-muted-foreground text-xs">{t("retour.aideComparer")}</p>
          )}
          <div className="ml-auto shrink-0">
            {derniere ? (
              <Button loading={occupe} disabled={verrou} onClick={onCompris}>
                {verrou ? <Lock /> : mode === "relecture" ? <X /> : <Check />}
                {verrou
                  ? t("retour.deroule")
                  : mode === "relecture"
                    ? t("retour.fermer")
                    : occupe
                      ? t("common.saving")
                      : t("reviews.compris")}
              </Button>
            ) : (
              <Button onClick={() => setIndex(index + 1)}>
                {t("retour.voirRetour")}
                <ArrowRight />
              </Button>
            )}
          </div>
        </div>
      </DialogPopup>
    </Dialog>
  );
}
