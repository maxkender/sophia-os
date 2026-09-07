import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import {
  ETAPES_CREATEUR,
  ETAPES_PHASE0,
  etapeCouranteCreateur,
  etapeCourantePhase0,
  etapeFaiteCreateur,
  etapeFaitePhase0,
} from "./phases";
import type { EtapeCreateur, EtapePhase0, RecrutementCreateur, RecrutementHm } from "./types";

function Rail({
  etapes,
  faite,
  courante,
  labels,
}: {
  etapes: string[];
  faite: (id: string) => boolean;
  courante: string;
  labels: Record<string, string>;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center" role="list">
        {etapes.map((id, i) => {
          const ok = faite(id);
          const ici = id === courante;
          return (
            <div key={id} className={cn("flex items-center", i < etapes.length - 1 && "min-w-0 flex-1")}>
              {i > 0 && (
                <div
                  className={cn("h-px min-w-2 flex-1", faite(etapes[i - 1]!) ? "bg-emerald-400/80" : "bg-border")}
                />
              )}
              <span
                role="listitem"
                title={labels[id]}
                aria-current={ici ? "step" : undefined}
                className={cn(
                  "relative z-10 size-2.5 shrink-0 rounded-full",
                  ok && "bg-emerald-500",
                  !ok && ici && "bg-background ring-2 ring-violet-400",
                  !ok && !ici && "bg-muted-foreground/20",
                )}
              />
            </div>
          );
        })}
      </div>
      <p className="truncate text-[11px] text-muted-foreground">{labels[courante]}</p>
    </div>
  );
}

export function TimelinePhase0({ hm }: { hm: RecrutementHm }) {
  const { t } = useTranslation();
  const labels = Object.fromEntries(
    ETAPES_PHASE0.map((e) => [e, t(`recrutements.etape0.${e}`)]),
  ) as Record<EtapePhase0, string>;
  return (
    <Rail
      etapes={ETAPES_PHASE0}
      faite={(id) => etapeFaitePhase0(hm, id as EtapePhase0)}
      courante={etapeCourantePhase0(hm)}
      labels={labels}
    />
  );
}

export function TimelineCreateur({ createur }: { createur: RecrutementCreateur }) {
  const { t } = useTranslation();
  const labels = Object.fromEntries(
    ETAPES_CREATEUR.map((e) => [e, t(`recrutements.etapeCre.${e}`)]),
  ) as Record<EtapeCreateur, string>;
  return (
    <Rail
      etapes={ETAPES_CREATEUR}
      faite={(id) => etapeFaiteCreateur(createur, id as EtapeCreateur)}
      courante={etapeCouranteCreateur(createur)}
      labels={labels}
    />
  );
}
