import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Archive, RotateCcw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { drapeauPays } from "@/features/moteur/pays";

import { reactiverCompteArchive } from "./archiveApi";

export interface LigneArchive {
  posteurId: string;
  nom: string;
  /** Profil désactivé (sinon : posteur actif dont des comptes dorment). */
  desactive: boolean;
  comptes: { id: string; handle: string | null; pays?: string | null; actif: boolean }[];
}

/**
 * L'Archive d'une HM : fermée par défaut. Reactivate se fait compte par
 * compte ; un compte actif d'un profil désactivé se réactive aussi (le profil
 * revient avec lui).
 */
export function SectionArchive({
  lignes,
  titre,
  onOuvrir,
  peutReactiver = true,
}: {
  lignes: LigneArchive[];
  /** Par défaut « Archive » ; la page Posters y met le nom de la HM. */
  titre?: string;
  onOuvrir?: (posteurId: string) => void;
  /** Faux pour une HM (prompt 15, point 1) : Reactivate reste à l'admin et au Head of Ops. */
  peutReactiver?: boolean;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [erreur, setErreur] = React.useState<string | null>(null);
  const reactiver = useMutation({
    mutationFn: reactiverCompteArchive,
    onMutate: () => setErreur(null),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["comptes"] });
      void queryClient.invalidateQueries({ queryKey: ["posters"] });
      void queryClient.invalidateQueries({ queryKey: ["etapes-comptes"] });
    },
    onError: (e: Error) => setErreur(e.message),
  });
  if (lignes.length === 0) return null;
  const nbComptes = lignes.reduce((n, l) => n + l.comptes.length, 0);

  return (
    <details className="rounded-lg border border-dashed bg-muted/20 px-3 py-2">
      <summary className="flex cursor-pointer select-none items-center gap-2 text-xs text-muted-foreground">
        <Archive className="size-3.5" />
        <span className="font-medium text-foreground">{titre ?? t("archive.titre")}</span>
        <span className="tabular-nums">
          {t("archive.resume", { posteurs: lignes.length, comptes: nbComptes })}
        </span>
      </summary>
      <p className="mt-2 text-[11px] text-muted-foreground">{t("archive.aide")}</p>
      <ul className="mt-2 space-y-1.5">
        {lignes.map((l) => (
          <li key={l.posteurId} className="flex flex-wrap items-center gap-2 rounded-md border bg-card px-2.5 py-1.5 text-xs">
            {onOuvrir ? (
              <button
                type="button"
                className="font-medium underline-offset-2 hover:underline"
                onClick={() => onOuvrir(l.posteurId)}
              >
                {l.nom}
              </button>
            ) : (
              <span className="font-medium">{l.nom}</span>
            )}
            {l.desactive && <Badge variant="secondary">{t("posters.disabled")}</Badge>}
            {l.comptes.length === 0 && (
              <span className="text-muted-foreground">{t("archive.sansCompte")}</span>
            )}
            {l.comptes.map((c) => (
              <span key={c.id} className="flex items-center gap-1 rounded-full border px-2 py-0.5">
                <span>
                  {drapeauPays(c.pays)} {c.handle ? `@${c.handle}` : t("archive.sansHandle")}
                </span>
                {peutReactiver && (!c.actif || l.desactive) && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 gap-1 px-1.5 text-[11px]"
                    disabled={reactiver.isPending}
                    onClick={() => reactiver.mutate(c.id)}
                  >
                    <RotateCcw className="size-3" />
                    {t("archive.reactiver")}
                  </Button>
                )}
              </span>
            ))}
          </li>
        ))}
      </ul>
      {erreur && <p className="mt-2 text-xs text-destructive">{erreur}</p>}
    </details>
  );
}
