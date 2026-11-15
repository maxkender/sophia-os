import { Sparkles } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogPanel, DialogPopup, DialogTitle } from "@/components/ui/dialog";

import { textesDouble } from "./textes";

export interface PropsPopupDouble {
  /** Langue d'affichage du posteur (en par défaut, fr traduit). */
  langue: string | undefined;
  tarif: number | null;
  expireAt: string | null;
  /** Oui → le 2ᵉ compte (son @ quand il est créé) ; non → rien. */
  repondre: (reponse: "oui" | "non") => Promise<{ handle?: string | null } | void>;
  /** « I'll decide later » : fermé pour cette visite, revient à la prochaine ouverture. */
  plusTard: () => void;
  /** Fermeture après la réponse (rafraîchit les messages). */
  fini: () => void;
}

function dateLocale(iso: string, langue: string | undefined): string {
  return new Intl.DateTimeFormat(langue?.startsWith("fr") ? "fr-FR" : "en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  }).format(new Date(iso));
}

/**
 * 7/11 : l'offre d'un 2ᵉ compte (bloquante). [Yes, I'm in] crée le compte,
 * [No thanks, keep one account] ne change rien, « I'll decide later » la
 * referme jusqu'à la prochaine ouverture du dashboard (72 h au plus).
 */
export function PopupDouble({ langue, tarif, expireAt, repondre, plusTard, fini }: PropsPopupDouble) {
  const t = textesDouble(langue);
  const [etat, setEtat] = React.useState<{ envoi: "oui" | "non" | null; fait: "oui" | "non" | null; handle: string | null; erreur: boolean }>({
    envoi: null, fait: null, handle: null, erreur: false,
  });
  const choisir = async (r: "oui" | "non") => {
    setEtat((e) => ({ ...e, envoi: r, erreur: false }));
    try {
      const res = await repondre(r);
      setEtat({ envoi: null, fait: r, handle: (res && res.handle) || null, erreur: false });
    } catch {
      setEtat((e) => ({ ...e, envoi: null, erreur: true }));
    }
  };

  return (
    <Dialog open disablePointerDismissal>
      <DialogPopup showCloseButton={false} className="max-w-md" data-testid="popup-double">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-success/15 text-success-foreground">
              <Sparkles className="size-5" />
            </span>
            <div>
              <DialogTitle className="text-base">{t.titre}</DialogTitle>
              {expireAt && !etat.fait && <DialogDescription>{t.jusqua(dateLocale(expireAt, langue))}</DialogDescription>}
            </div>
          </div>
        </DialogHeader>
        <DialogPanel>
          <p className="rounded-lg bg-muted/50 p-4 text-sm leading-relaxed" data-testid="popup-double-texte">
            {etat.fait === "oui" ? t.confirmation(etat.handle) : etat.fait === "non" ? t.refus : t.texte(tarif)}
          </p>
          {etat.erreur && <p className="mt-2 text-sm text-destructive">{t.erreur}</p>}
        </DialogPanel>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          {etat.fait ? (
            <Button onClick={fini}>{t.fermer}</Button>
          ) : (
            <>
              <Button className="w-full" disabled={!!etat.envoi} onClick={() => void choisir("oui")}>{t.oui}</Button>
              <Button className="w-full" variant="outline" disabled={!!etat.envoi} onClick={() => void choisir("non")}>{t.non}</Button>
              <button type="button" className="mx-auto text-xs text-muted-foreground underline underline-offset-2" onClick={plusTard} disabled={!!etat.envoi}>
                {t.plusTard}
              </button>
            </>
          )}
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
