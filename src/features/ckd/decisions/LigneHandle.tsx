import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";

import { demanderHandle, type EtatHandle, utiliserHandle } from "./handlesEtat";

const P = "autoOnglets.decisions.liste.handle";
const jour = (iso: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Europe/Paris" }).format(new Date(iso));

/**
 * Sous le compte (jeudi et samedi) : le @ corrigé depuis les liens, le @ d'un
 * autre compte (« Use @x » / « Ask for @ »), et l'état de « Ask for @ ».
 */
export function LigneHandle({ compteId, e, admin }: { compteId: string; e?: EtatHandle; admin: boolean }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const fini = () => void qc.invalidateQueries({ queryKey: ["handles-etat"] });
  const utiliser = useMutation({ mutationFn: (h: string) => utiliserHandle(compteId, h), onSuccess: fini });
  const demander = useMutation({ mutationFn: () => demanderHandle(compteId), onSuccess: fini });
  const enAttente = e?.demande_at && !e.repondu_at;
  return (
    <div className="mt-1 space-y-0.5 text-[11px]" data-testid="ligne-handle">
      {e?.corrige && <p className="text-muted-foreground">{e.corrige}</p>}
      {e?.autre_handle && (
        <p className="flex flex-wrap items-center gap-1 text-warning-foreground">
          {t(`${P}.autre`, { handle: e.autre_handle })}
          {admin && (
            <>
              <Button size="xs" variant="outline" className="h-6" disabled={utiliser.isPending} onClick={() => {
                if (window.confirm(t(`${P}.confirmUtiliser`, { handle: e.autre_handle }))) utiliser.mutate(e.autre_handle!);
              }}>
                {t(`${P}.utiliser`, { handle: e.autre_handle })}
              </Button>
            </>
          )}
        </p>
      )}
      {e?.demande_at && (
        <p className="text-muted-foreground">
          {t(`${P}.demande`, { date: jour(e.demande_at) })} ·{" "}
          {e.repondu_at ? t(`${P}.repondu`, { avant: e.handle_avant ?? "?", apres: e.handle_apres ?? "?" }) : t(`${P}.pasDeReponse`)}
        </p>
      )}
      {admin && !enAttente && (
        <Button size="xs" variant="ghost" className="h-6 px-1" disabled={demander.isPending} onClick={() => {
          if (window.confirm(t(`${P}.confirmDemander`))) demander.mutate();
        }}>
          {t(`${P}.demander`)}
        </Button>
      )}
      {(utiliser.error || demander.error) && <p className="text-destructive">{((utiliser.error ?? demander.error) as Error).message}</p>}
    </div>
  );
}
