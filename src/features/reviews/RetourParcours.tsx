import * as React from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ArrowRight, Check, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogPopup } from "@/components/ui/dialog";
import type { Review } from "@/features/moteur/api";
import { Mico } from "@/features/onboarding/Mico";
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
 *   2. le message et les vidéos tuto.
 * Sur téléphone, les deux posts ne tiennent pas côte à côte : un sélecteur
 * passe de l'un à l'autre.
 */
export function RetourParcours({
  retour,
  mode,
  onCompris,
  onFermer,
  occupe = false,
}: {
  retour: RetourAffiche;
  mode: ModeRetour;
  /** Dernier bouton (« Compris » en vrai, « Fermer » sinon). */
  onCompris: () => void;
  /** Croix ou clic à côté, hors mode réel. */
  onFermer?: () => void;
  occupe?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const etapes = etapesDuRetour(retour);
  const [index, setIndex] = React.useState(0);
  const [vue, setVue] = React.useState<"original" | "poste">("original");
  const etape = etapes[Math.min(index, etapes.length - 1)];
  const derniere = index >= etapes.length - 1;
  const fermable = mode !== "reel";

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
        className="max-w-3xl"
        onKeyDown={
          fermable
            ? undefined
            : (e) => {
                if (e.key === "Escape") e.preventDefault();
              }
        }
      >
        <div className="relative flex items-start gap-3 overflow-hidden rounded-t-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-6 pb-4 max-sm:rounded-none">
          <div key={etape} className="w-16 shrink-0 animate-in zoom-in-50 duration-500 sm:w-20">
            <Mico etat={etape === "comparer" ? "wave" : "think"} />
          </div>
          <div className="min-w-0 flex-1 space-y-2 pt-1">
            {mode === "apercu" && (
              <span className="inline-block rounded-md bg-warning/20 px-2 py-0.5 font-medium text-warning-foreground text-xs">
                {t("retour.apercu")}
              </span>
            )}
            <p className="text-muted-foreground text-xs">
              {t("reviews.popupTitre")} · {t("reviews.popupSous")}
              {compte ? ` · ${compte}` : ""}
              {date ? ` · ${date}` : ""}
            </p>
            <h2 key={etape} className="animate-in fade-in slide-in-from-right-2 font-semibold text-base tracking-tight duration-400">
              {etape === "comparer" ? t("retour.titreComparer") : t("retour.titreRetour")}
            </h2>
            {etapes.length > 1 && (
              <div className="flex items-center gap-2">
                <Pastilles total={etapes.length} actuelle={index} />
                <span className="ml-auto shrink-0 text-muted-foreground text-xs tabular-nums">
                  {index + 1} / {etapes.length}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Le corps défile, l'en-tête et les boutons restent en place. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-2">
          {etape === "comparer" ? (
            <div key="comparer" className="animate-in fade-in space-y-3 duration-500">
              <p className="text-sm leading-relaxed">{t("retour.aideComparer")}</p>
              {/* Téléphone : un seul lecteur à la fois. */}
              <div className="flex rounded-lg border p-0.5 md:hidden" role="tablist">
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
              <div className="grid gap-4 md:grid-cols-2">
                <div className={cn(vue !== "original" && "max-md:hidden")}>
                  <TikTokEmbed
                    url={retour.source_url}
                    titre={t("retour.original")}
                    videLabel={t("retour.sansLien")}
                    chargementLabel={t("retour.chargement")}
                  />
                </div>
                <div className={cn(vue !== "poste" && "max-md:hidden")}>
                  <TikTokEmbed
                    url={retour.publie_url}
                    titre={t("retour.tonPost")}
                    videLabel={t("retour.sansLien")}
                    chargementLabel={t("retour.chargement")}
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

        <div className="flex items-center gap-2 border-t p-4 sm:p-6">
          {index > 0 && (
            <Button variant="ghost" onClick={() => setIndex(index - 1)}>
              <ArrowLeft />
              {t("retour.precedent")}
            </Button>
          )}
          <div className="ml-auto">
            {derniere ? (
              <Button size="lg" loading={occupe} onClick={onCompris}>
                {mode === "reel" ? <Check /> : <X />}
                {mode === "reel" ? (occupe ? t("common.saving") : t("reviews.compris")) : t("retour.fermer")}
              </Button>
            ) : (
              <Button size="lg" onClick={() => setIndex(index + 1)}>
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
