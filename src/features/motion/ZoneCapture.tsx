import * as React from "react";
import { useTranslation } from "react-i18next";
import { ImageUp, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { premiereCapture, TYPES_CAPTURE } from "./capture";

/** Zone de dépôt de la capture Sophia : glisser l'image, ou cliquer pour la choisir. */
export function ZoneCapture({
  fichier,
  onFichier,
  disabled,
}: {
  fichier: File | null;
  onFichier: (f: File | null) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const champ = React.useRef<HTMLInputElement>(null);
  const [survol, setSurvol] = React.useState(false);
  const [refus, setRefus] = React.useState(false);
  const apercu = React.useMemo(() => (fichier ? URL.createObjectURL(fichier) : null), [fichier]);
  React.useEffect(() => () => (apercu ? URL.revokeObjectURL(apercu) : undefined), [apercu]);
  React.useEffect(() => {
    if (!fichier && champ.current) champ.current.value = "";
  }, [fichier]);

  const prendre = (files: FileList | null) => {
    const f = premiereCapture(files);
    setRefus(!f && (files?.length ?? 0) > 0);
    if (f) onFichier(f);
  };

  return (
    <div className="space-y-1 text-xs text-muted-foreground">
      <span>{t("motion.captureAnglais")}</span>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        aria-label={t("motion.captureDeposer")}
        className={cn(
          "flex cursor-pointer items-center gap-3 rounded-lg border border-dashed p-3 transition-colors hover:bg-muted/40",
          survol && "border-ring bg-muted/50",
          disabled && "pointer-events-none opacity-64",
        )}
        onClick={() => champ.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            champ.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setSurvol(true);
        }}
        onDragLeave={() => setSurvol(false)}
        onDrop={(e) => {
          e.preventDefault();
          setSurvol(false);
          if (!disabled) prendre(e.dataTransfer.files);
        }}
      >
        {apercu ? (
          <img src={apercu} alt="" className="h-16 w-auto shrink-0 rounded border object-cover" />
        ) : (
          <ImageUp className="size-5 shrink-0" aria-hidden />
        )}
        <span className="min-w-0 flex-1 truncate">{fichier ? fichier.name : t("motion.captureDeposer")}</span>
        {fichier && (
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            aria-label={t("motion.captureRetirer")}
            onClick={(e) => {
              e.stopPropagation();
              onFichier(null);
            }}
          >
            <X aria-hidden />
          </Button>
        )}
      </div>
      {refus && <p className="text-destructive">{t("motion.captureType")}</p>}
      <input
        ref={champ}
        type="file"
        accept={TYPES_CAPTURE.join(",")}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => prendre(e.target.files)}
      />
    </div>
  );
}
