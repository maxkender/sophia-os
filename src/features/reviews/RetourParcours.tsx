import * as React from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ArrowRight, Check, Flag, Lock, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogPopup } from "@/components/ui/dialog";
import type { Review } from "@/features/moteur/api";
import { Mico } from "@/features/onboarding/Mico";
import { basDePageAtteint } from "@/features/onboarding/parcours";
import { cn } from "@/lib/utils";

import { LecteurVideosReview } from "./LecteurVideosReview";
import { TikTokEmbed } from "./TikTokEmbed";
import { localeDate } from "@/locales/localeDate";

/** Ce que le parcours affiche d'un retour : le message et le post qu'il commente. */
export type RetourAffiche = Pick<
  Review,
  "id" | "body" | "publie_url" | "source_url" | "handle_tiktok" | "compte_label" | "date_publication" | "videos"
> &
  Partial<Pick<Review, "contestee_at" | "contestation_verdict" | "contestation_reponse">>;

/**
 * Dans tous les modes, on ne sort qu'à la fin, par le bouton du bas.
 * reel : le retour arrive, « Compris » le marque lu ;
 * relecture : le créateur le rouvre depuis « Mes retours », « Fermer » sans verrou ;
 * apercu : l'admin voit exactement ce que verrait le créateur, rien n'est enregistré.
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
 * « Ce retour me semble faux » (0340) : un lien discret au bout du message,
 * puis un mot facultatif. Déjà contesté : où en est la vérification, et la
 * réponse de l'admin quand il a tranché.
 */
function Contestation({
  retour,
  mode,
  onContester,
}: {
  retour: RetourAffiche;
  mode: ModeRetour;
  onContester?: (commentaire: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [etat, setEtat] = React.useState<"ferme" | "ouvert" | "envoi" | "envoye">("ferme");
  const [mot, setMot] = React.useState("");
  const [erreur, setErreur] = React.useState<string | null>(null);

  if (retour.contestee_at) {
    const verdict = retour.contestation_verdict;
    return (
      <div className="space-y-1 rounded-xl border border-dashed p-3 text-sm">
        <p className="flex items-center gap-2 font-medium">
          <Flag className="size-4 text-muted-foreground" />
          {verdict === "fondee"
            ? t("retour.contesteFondee")
            : verdict === "non_fondee"
              ? t("retour.contesteNonFondee")
              : t("retour.conteste")}
        </p>
        {verdict && retour.contestation_reponse && (
          <p className="whitespace-pre-wrap text-muted-foreground">
            {t("retour.reponseAdmin")} {retour.contestation_reponse}
          </p>
        )}
      </div>
    );
  }
  if (!onContester && mode !== "apercu") return null;
  if (etat === "envoye") {
    return (
      <p className="flex items-center gap-2 rounded-xl border border-dashed p-3 text-sm" role="status">
        <Check className="size-4 text-success" />
        {t("retour.contesteMerci")}
      </p>
    );
  }
  if (etat === "ferme") {
    return (
      <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setEtat("ouvert")}>
        <Flag />
        {t("retour.contester")}
      </Button>
    );
  }
  const envoyer = async () => {
    setErreur(null);
    if (mode === "apercu" || !onContester) {
      setEtat("envoye");
      return;
    }
    setEtat("envoi");
    try {
      await onContester(mot);
      setEtat("envoye");
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
      setEtat("ouvert");
    }
  };
  return (
    <div className="space-y-2 rounded-xl border p-3">
      <label htmlFor={`contester-${retour.id}`} className="font-medium text-sm">
        {t("retour.contesterAide")}
      </label>
      <Textarea
        id={`contester-${retour.id}`}
        value={mot}
        maxLength={2000}
        rows={3}
        placeholder={t("retour.contesterPlaceholder")}
        onChange={(e) => setMot(e.target.value)}
      />
      {erreur && <p className="text-destructive text-sm">{erreur}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => setEtat("ferme")} disabled={etat === "envoi"}>
          {t("retour.contesterAnnuler")}
        </Button>
        <Button size="sm" variant="outline" loading={etat === "envoi"} onClick={() => void envoyer()}>
          <Flag />
          {t("retour.contesterEnvoyer")}
        </Button>
      </div>
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
  occupe = false,
  ensuite = 0,
  onContester,
}: {
  retour: RetourAffiche;
  mode: ModeRetour;
  /**
   * Le bouton en bas à droite de la dernière étape (« Compris » en vrai et en
   * aperçu, « Fermer » en relecture) : la seule façon de sortir du parcours.
   */
  onCompris: () => void;
  occupe?: boolean;
  /** Retours non lus qui suivent celui-ci (ils s'enchaînent après « Compris »). */
  ensuite?: number;
  /**
   * « Ce retour me semble faux » : le créateur le dit, avec son mot s'il veut
   * (0340). Sans ce rappel, pas de bouton ; en aperçu, rien n'est enregistré.
   */
  onContester?: (commentaire: string) => Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const etapes = etapesDuRetour(retour);
  const [index, setIndex] = React.useState(0);
  const [vue, setVue] = React.useState<"original" | "poste">("original");
  const [basAtteint, setBasAtteint] = React.useState(false);
  const corps = React.useRef<HTMLDivElement>(null);
  const etape = etapes[Math.min(index, etapes.length - 1)];
  const derniere = index >= etapes.length - 1;
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
    ? new Date(`${retour.date_publication}T12:00:00`).toLocaleDateString(localeDate(i18n.language), {
        day: "numeric",
        month: "long",
      })
    : null;

  return (
    // Ni croix, ni clic à côté, ni Échap, dans tous les modes : on ne sort
    // qu'à la fin, par le bouton du bas (l'aperçu admin se comporte en vrai).
    <Dialog open disablePointerDismissal>
      <DialogPopup
        showCloseButton={false}
        className={cn(
          "max-w-4xl",
          // Les posts prennent toute la hauteur (téléphone : sous la marge du haut du dialogue).
          etape === "comparer" && "h-[calc(100dvh-3rem)] sm:h-[calc(100dvh-2rem)] sm:max-h-[1100px]",
        )}
        onKeyDown={(e) => {
          if (e.key === "Escape") e.preventDefault();
        }}
      >
        {/* En-tête sur une ligne : la place va aux posts et au message. */}
        <div className="flex items-center gap-3 rounded-t-2xl border-b bg-gradient-to-br from-primary/10 via-primary/5 to-transparent px-4 py-2.5 max-sm:rounded-none">
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
              {/* Au bout du message : on conteste après l'avoir lu. */}
              <Contestation retour={retour} mode={mode} onContester={onContester} />
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
