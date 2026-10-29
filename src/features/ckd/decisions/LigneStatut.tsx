import { useTranslation } from "react-i18next";
import { CheckCircle2, Circle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import type { EvaluationCompte, ExtrasCompte, Signal, Statut } from "./statutCompte";
import { TD } from "./TableauComptes";

const COULEUR: Record<Statut, string> = {
  rouge: "bg-destructive",
  orange: "bg-warning",
  ok: "bg-muted-foreground/40",
  vert: "bg-success",
};

const P = "autoOnglets.decisions.liste.statut";

/** Une phrase par signal (0 post : selon le nudge du jeudi). */
function phraseSignal(s: Signal, t: (k: string, o?: Record<string, unknown>) => string): string {
  if (s.cle === "zero_post") return t(`${P}.signaux.zero_post_${s.valeurs?.nudge ?? "non"}`);
  return t(`${P}.signaux.${s.cle}`, s.valeurs ?? {});
}

/** Prompt 14 : la couleur, le statut, le problème en une phrase et la proposition de l'OS avec sa raison. */
export function StatutCompte({ e, x }: { e: EvaluationCompte; x?: ExtrasCompte }) {
  const { t } = useTranslation();
  const phrase = e.signaux.length ? e.signaux.map((s) => phraseSignal(s, t)).join(" · ") : t(`${P}.rien`);
  return (
    <div className="min-w-56 max-w-72 space-y-0.5 text-xs" data-statut={e.statut}>
      <p className="flex items-center gap-1.5 font-medium">
        <span className={cn("inline-block size-2 shrink-0 rounded-full", COULEUR[e.statut])} aria-hidden />
        {t(`${P}.statuts.${e.statut}`)}
        {e.statut === "vert" && x && <span className="font-normal text-muted-foreground">· {t(`${P}.fiable`, { n: x.fiable_semaines })}</span>}
      </p>
      <p className="text-muted-foreground" data-testid="phrase">{phrase}</p>
      {e.statut !== "vert" && e.statut !== "ok" && (
        <p data-proposition={e.proposition}>
          <span className="font-medium">{t(`${P}.propositions.${e.proposition}`)}</span>
          <span className="text-muted-foreground"> · {t(`${P}.raisons.${e.raison}`)}</span>
        </p>
      )}
    </div>
  );
}

/** Les autres infos de l'OS sur ce posteur, en badges : Needs you, Disputes, To read ; pas de contrat ; contrat à vérifier. */
export function BadgesPosteur({ e, x }: { e: EvaluationCompte; x?: ExtrasCompte }) {
  const { t } = useTranslation();
  if (!x) return null;
  return (
    <span className="mt-0.5 inline-flex flex-wrap gap-1">
      {x.sans_contrat && <Badge variant="error">{t(`${P}.badges.sansContrat`)}</Badge>}
      {e.contratAVerifier && <Badge variant="warning">{t(`${P}.badges.verifierContrat`)}</Badge>}
      {x.needs_you_n > 0 && <Badge variant="secondary">Needs you · {x.needs_you_n}</Badge>}
      {x.disputes_n > 0 && <Badge variant="error">Disputes · {x.disputes_n}</Badge>}
      {x.to_read_n > 0 && <Badge variant="secondary">To read · {x.to_read_n}</Badge>}
    </span>
  );
}

/** Prompt 12 : une recrue de la cohorte qui arrive : ses étapes à la place des jours, ses relances, sa dernière réaction. */
export function CellulesEtapes({ x, colonnes }: { x?: ExtrasCompte; colonnes: number }) {
  const { t, i18n } = useTranslation();
  const etapes: [string, boolean][] = x
    ? [["connecte", x.connecte], ["slack", x.sur_slack], ["tiktok", x.tiktok_trouve], ["warmup", x.start_warmup]]
    : [];
  const fmt = new Intl.DateTimeFormat(i18n.resolvedLanguage ?? "fr", { day: "numeric", month: "short", timeZone: "Europe/Paris" });
  return (
    <td className={cn(TD, "text-xs")} colSpan={Math.max(1, colonnes)} data-testid="etapes-recrue">
      <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
        {etapes.map(([cle, fait]) => (
          <span key={cle} className={cn("inline-flex items-center gap-1", !fait && "text-muted-foreground")} data-etape={cle} data-fait={fait}>
            {fait ? <CheckCircle2 className="size-3.5 text-success-foreground" aria-hidden /> : <Circle className="size-3.5" aria-hidden />}
            {t(`${P}.etapes.${cle}`)}
          </span>
        ))}
        {x && (
          <span className="text-muted-foreground">
            {t(`${P}.relances`, { n: x.relances })} ·{" "}
            {x.derniere_reaction_at ? t(`${P}.reaction`, { quand: fmt.format(new Date(x.derniere_reaction_at)) }) : t(`${P}.aucuneReaction`)}
          </span>
        )}
      </span>
    </td>
  );
}
