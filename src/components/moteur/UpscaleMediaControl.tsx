import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Maximize2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { upscaleMedia, type ModeleUpscale } from "@/features/moteur/api";
import { cn } from "@/lib/utils";

type Props = {
  mediaId: string;
  /** Si true, le bouton force un nouvel upscale (remplace l’existant). */
  dejaUpscale?: boolean;
  disabled?: boolean;
  /** UI serrée (vignette biblio). */
  compact?: boolean;
  className?: string;
  onSuccess?: () => void;
  /** Modèle contrôlé depuis l’extérieur (ex. lot biblio) ; sinon état local. */
  modele?: ModeleUpscale;
  onModeleChange?: (m: ModeleUpscale) => void;
  /** Masquer le sélecteur (quand le parent en a déjà un). */
  hideModeleSelect?: boolean;
};

/**
 * Upscale une photo media_library (Real-ESRGAN ou SeedVR) et remplace le fichier.
 * Disponible partout où on a un `mediaId`.
 */
export function UpscaleMediaControl({
  mediaId,
  dejaUpscale = false,
  disabled = false,
  compact = false,
  className,
  onSuccess,
  modele: modeleCtrl,
  onModeleChange,
  hideModeleSelect = false,
}: Props) {
  const { t } = useTranslation();
  const [modeleLocal, setModeleLocal] = React.useState<ModeleUpscale>("realesrgan");
  const [progress, setProgress] = React.useState<string | null>(null);
  const modele = modeleCtrl ?? modeleLocal;

  function setModele(m: ModeleUpscale) {
    if (onModeleChange) onModeleChange(m);
    else setModeleLocal(m);
  }

  const upscale = useMutation({
    mutationFn: () =>
      upscaleMedia(mediaId, {
        modele,
        // Toujours possible : si déjà upscalée, on force le remplacement.
        forcer: dejaUpscale,
        onProgress: (detail) => setProgress(detail),
      }),
    onSuccess: () => {
      setProgress(null);
      onSuccess?.();
    },
    onError: () => {
      setProgress(null);
    },
  });

  const aide =
    modele === "seedvr"
      ? t("bibliotheque.upscaleAideSeedvr")
      : t("bibliotheque.upscaleAideRealesrgan");

  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)}>
      {!hideModeleSelect && (
        <select
          value={modele}
          disabled={upscale.isPending || disabled}
          onChange={(e) =>
            setModele(e.target.value === "seedvr" ? "seedvr" : "realesrgan")
          }
          title={t("bibliotheque.upscaleModele")}
          aria-label={t("bibliotheque.upscaleModele")}
          className={cn(
            "rounded-md border bg-background text-xs",
            compact ? "h-7 max-w-[7.5rem] px-1" : "h-8 px-2",
          )}
        >
          <option value="realesrgan">{t("bibliotheque.upscaleRealesrgan")}</option>
          <option value="seedvr">{t("bibliotheque.upscaleSeedvr")}</option>
        </select>
      )}
      <Button
        size="sm"
        variant="outline"
        className={cn(compact && "h-7 flex-1 px-2 text-xs")}
        disabled={upscale.isPending || disabled}
        onClick={() => upscale.mutate()}
        title={aide}
      >
        <Maximize2 className={cn(compact ? "size-3" : "size-4")} />
        {upscale.isPending
          ? t("bibliotheque.upscaleEnCours")
          : dejaUpscale
            ? t("bibliotheque.upscaleEncore")
            : t("bibliotheque.upscale")}
      </Button>
      {upscale.isPending && progress && (
        <p className="basis-full text-[11px] text-muted-foreground">{progress}</p>
      )}
      {upscale.isError && (
        <p className="basis-full text-[11px] text-destructive">
          {(upscale.error as Error).message}
        </p>
      )}
    </div>
  );
}
