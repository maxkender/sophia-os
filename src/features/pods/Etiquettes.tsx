// Les petites marques d'un podz : son format, son état, son compte modèle.
import { useTranslation } from "react-i18next";
import { Film, Images, Type } from "lucide-react";

import { cn } from "@/lib/utils";

import type { FormatPodz } from "./identite";

const ICONE_FORMAT = { texte_banque: Type, images_finies: Images, video: Film } as const;

/** Le format d'un podz : ce qu'il livre (voir `pods/GLOSSAIRE.md`). */
export function EtiquetteFormat({ format, className }: { format: FormatPodz; className?: string }) {
  const { t } = useTranslation();
  const Icone = ICONE_FORMAT[format];
  return (
    <span
      title={t(`pods.format.${format}Aide`)}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium text-foreground/80",
        className,
      )}
    >
      <Icone className="size-3" aria-hidden />
      {t(`pods.format.${format}`)}
    </span>
  );
}

/** Actif, en pause, ou actif sans aucun compte pour poster. */
export function EtiquetteEtat({ actif, comptes }: { actif: boolean; comptes: number | null }) {
  const { t } = useTranslation();
  const cle = !actif ? "pause" : comptes === 0 ? "sansCompte" : "actif";
  const point = { pause: "bg-muted-foreground", sansCompte: "bg-warning", actif: "bg-success" }[cle];
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
      <span className={cn("size-1.5 rounded-full", point)} aria-hidden />
      {t(`pods.etat.${cle}`)}
    </span>
  );
}

/** Un compte TikTok, en lien. */
export function LienCompte({ handle, className }: { handle: string; className?: string }) {
  return (
    <a
      href={`https://www.tiktok.com/@${handle}`}
      target="_blank"
      rel="noreferrer"
      className={cn("underline-offset-2 hover:underline", className)}
    >
      @{handle}
    </a>
  );
}
