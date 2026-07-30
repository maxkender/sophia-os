import { useTranslation } from "react-i18next";
import { Check, Loader2, Minus, X } from "lucide-react";

import { cn } from "@/lib/utils";
import type { EvenementEtape, EtapeNettoyageId } from "@/features/moteur/nettoyageEtapes";

const LABEL_KEY: Record<EtapeNettoyageId, string> = {
  text_removal: "nettoyageEtapes.textRemoval",
  replicate_text_removal: "nettoyageEtapes.replicateTextRemoval",
  restore_resolution: "nettoyageEtapes.restoreResolution",
  c2pa: "nettoyageEtapes.c2pa",
  ready: "nettoyageEtapes.ready",
};

function Icone({ statut }: { statut: EvenementEtape["statut"] }) {
  if (statut === "encours") {
    return <Loader2 className="size-3 animate-spin text-foreground" />;
  }
  if (statut === "ok") {
    return <Check className="size-3 text-emerald-700" />;
  }
  if (statut === "echec") {
    return <X className="size-3 text-destructive" />;
  }
  return <Minus className="size-3 text-muted-foreground/50" />;
}

/** Timeline compacte du nettoyage — ordre = celui des `etapes` (Fal/Replicate selon réglage). */
export function NettoyageEtapes({
  etapes,
  className,
}: {
  etapes: EvenementEtape[];
  className?: string;
}) {
  const { t } = useTranslation();

  return (
    <ol className={cn("space-y-1 text-[10px] leading-snug", className)}>
      {etapes.map((e) => (
        <li key={e.etape} className="flex items-start gap-1.5">
          <span className="mt-0.5 shrink-0">
            <Icone statut={e.statut} />
          </span>
          <span className="min-w-0">
            <span
              className={cn(
                "font-medium",
                e.statut === "encours" && "text-foreground",
                e.statut === "ok" && "text-foreground",
                e.statut === "echec" && "text-destructive",
                (e.statut === "saute" || e.statut === "attente") &&
                  "text-muted-foreground",
              )}
            >
              {t(LABEL_KEY[e.etape])}
            </span>
            {e.detail ? (
              <span className="block truncate text-muted-foreground">{e.detail}</span>
            ) : null}
          </span>
        </li>
      ))}
    </ol>
  );
}
