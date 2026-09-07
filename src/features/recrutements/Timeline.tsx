import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import { ETAPES_CREATEUR, ETAPES_PHASE0, etapeFaiteCreateur, etapeFaitePhase0 } from "./phases";
import type { RecrutementCreateur, RecrutementHm } from "./types";

function Pastille({ fait, label }: { fait: boolean; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
        fait
          ? "bg-emerald-100 text-emerald-800"
          : "bg-white/70 text-muted-foreground ring-1 ring-black/5",
      )}
    >
      {fait ? "✓ " : ""}
      {label}
    </span>
  );
}

export function TimelinePhase0({ hm }: { hm: RecrutementHm }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap gap-1">
      {ETAPES_PHASE0.map((e) => (
        <Pastille key={e} fait={etapeFaitePhase0(hm, e)} label={t(`recrutements.etape0.${e}`)} />
      ))}
    </div>
  );
}

export function TimelineCreateur({ createur }: { createur: RecrutementCreateur }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap gap-1">
      {ETAPES_CREATEUR.map((e) => (
        <Pastille
          key={e}
          fait={etapeFaiteCreateur(createur, e)}
          label={t(`recrutements.etapeCre.${e}`)}
        />
      ))}
    </div>
  );
}
