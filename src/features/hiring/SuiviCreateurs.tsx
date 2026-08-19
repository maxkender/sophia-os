import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { WarmupBadge } from "@/features/moteur/WarmupBadge";
import type { PosterProfil } from "@/features/moteur/types";

import { lienTikTok, nomProfil, type CompteursPhase } from "./suiviEquipe";

export function CompteursPhases({ compteurs }: { compteurs: CompteursPhase }) {
  const { t } = useTranslation();
  if (compteurs.total === 0) {
    return <span className="text-xs text-muted-foreground">{t("hiring.aucunCreateurHm")}</span>;
  }
  return (
    <span className="text-xs tabular-nums text-muted-foreground">
      {t("hiring.compteursResume", compteurs)}
    </span>
  );
}

export function LigneCreateurProfil({ poster }: { poster: PosterProfil }) {
  const { t } = useTranslation();
  const comptes = poster.comptes?.length
    ? poster.comptes
    : poster.compte_id
      ? [
          {
            id: poster.compte_id,
            handle_tiktok: poster.handle_tiktok,
            warmup_started_at: poster.warmup_started_at,
            warmup_ends_at: poster.warmup_ends_at,
          },
        ]
      : [];
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-md border bg-background/60 px-2.5 py-1.5">
      <span className="text-sm font-medium">{nomProfil(poster)}</span>
      {!poster.is_active && <Badge variant="secondary">{t("posters.disabled")}</Badge>}
      {comptes.length === 0 && (
        <span className="text-xs text-muted-foreground">{t("hiring.pasDeTiktok")}</span>
      )}
      {comptes.map((c) => {
        const lien = lienTikTok(c.handle_tiktok);
        return (
          <span key={c.id} className="inline-flex items-center gap-1.5">
            {lien ? (
              <a
                href={lien.url}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-medium text-primary underline underline-offset-2"
              >
                {lien.at}
              </a>
            ) : (
              <span className="text-xs text-muted-foreground">{t("hiring.pasDeTiktok")}</span>
            )}
            <WarmupBadge
              compteId={c.id}
              startedAt={c.warmup_started_at}
              endsAt={c.warmup_ends_at}
            />
          </span>
        );
      })}
    </li>
  );
}

export function ListeCreateursSuivi({ createurs }: { createurs: PosterProfil[] }) {
  const { t } = useTranslation();
  if (createurs.length === 0) {
    return <p className="text-xs text-muted-foreground">{t("hiring.aucunCreateurHm")}</p>;
  }
  return (
    <ul className="space-y-1.5">
      {createurs.map((p) => (
        <LigneCreateurProfil key={p.id} poster={p} />
      ))}
    </ul>
  );
}
