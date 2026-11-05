import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";

import { lireResumeProblemes, type ResumeProblemes } from "./api";
import { diagnosticSimple, samediDe } from "./logique";

/** 0531 : les cartes Problèmes de tous les posteurs (une lecture partagée par la page). */
export function useResumeProblemes() {
  return useQuery({ queryKey: ["problemes", "resume"], queryFn: lireResumeProblemes, staleTime: 60_000 });
}

/**
 * 0531 : sur une ligne posteur (jeudi, samedi, dimanche) : « ⚠ N problèmes
 * ouverts », le diagnostic en une ligne, le lien vers la carte ; le Kill samedi
 * déjà prévu. 0538 : la décision proposée par le bot (à prendre ici, dans
 * Weekly decisions) et le message en attente (traité dans Problèmes).
 */
export function BadgeProblemesPosteur({ r }: { r: ResumeProblemes | undefined }) {
  const { t } = useTranslation();
  if (!r) return null;
  return (
    <div className="mt-1 max-w-72 space-y-0.5 text-[11px]" data-testid="badge-problemes">
      {r.kill_samedi_lundi && (
        <Badge variant="error" data-testid="kill-samedi-prevu">{t("problemes.kill.prevu", { date: samediDe(r.kill_samedi_lundi) })}</Badge>
      )}
      {r.proposition && !r.kill_samedi_lundi && (
        <Badge variant="warning" data-testid="decision-proposee">
          {t("problemes.decisions.propose", { action: t(`problemes.actions.${r.proposition}`, { defaultValue: r.proposition }) })}
        </Badge>
      )}
      <p className="font-medium text-warning-foreground">
        {t("problemes.badge.ouverts", { count: r.n })}
        {r.categories && r.categories.length > 0 && (
          <span className="font-normal text-muted-foreground">
            {" · "}{r.categories.map((c) => t(`problemes.categories.${c}`, { defaultValue: c })).join(", ")}
          </span>
        )}
      </p>
      {diagnosticSimple(r.diagnostic) && <p className="line-clamp-1 text-muted-foreground">{diagnosticSimple(r.diagnostic)}</p>}
      {r.attend && (
        <Link to={`/admin/auto/problemes?carte=${r.probleme_id}`} className="block underline" data-testid="message-attente">
          {t("problemes.decisions.attend")}
        </Link>
      )}
    </div>
  );
}
