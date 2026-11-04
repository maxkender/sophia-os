import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";

import { lireResumeProblemes, type ResumeProblemes } from "./api";
import { samediDe } from "./logique";

/** 0531 : les cartes Problèmes de tous les posteurs (une lecture partagée par la page). */
export function useResumeProblemes() {
  return useQuery({ queryKey: ["problemes", "resume"], queryFn: lireResumeProblemes, staleTime: 60_000 });
}

/**
 * 0531 : sur une ligne posteur (jeudi, samedi, dimanche) : « ⚠ N problèmes
 * ouverts », le diagnostic en une ligne, le lien vers la carte ; le Kill samedi
 * déjà prévu.
 */
export function BadgeProblemesPosteur({ r }: { r: ResumeProblemes | undefined }) {
  const { t } = useTranslation();
  if (!r) return null;
  return (
    <div className="mt-1 max-w-72 space-y-0.5 text-[11px]" data-testid="badge-problemes">
      {r.kill_samedi_lundi && (
        <Badge variant="error" data-testid="kill-samedi-prevu">{t("problemes.kill.prevu", { date: samediDe(r.kill_samedi_lundi) })}</Badge>
      )}
      <Link to={`/admin/auto/problemes?carte=${r.probleme_id}`} className="block font-medium text-warning-foreground underline">
        {t("problemes.badge.ouverts", { count: r.n })}
      </Link>
      {r.diagnostic && <p className="line-clamp-1 text-muted-foreground">{r.diagnostic}</p>}
    </div>
  );
}
