import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/features/auth/AuthContext";
import { useTranslation } from "react-i18next";

import { PopupDouble } from "@/features/doubles/PopupDouble";

import { marquerMessageLu, mesMessages, monTarifSemaine, repondreDouble, type MonMessage } from "./api";

/**
 * Tous les messages aux posteurs sont en anglais (v3) : les libellés d'ici
 * aussi, quelle que soit la langue de l'interface. Les textes eux-mêmes sont
 * des réglages (0382).
 */
export const EN = {
  doubleTitre: "A second account?",
  oui: "Yes",
  non: "No",
  jusqua: (date: string) => `Answer before ${date}.`,
  merciOui: "Great! Your second account is being set up: you'll find it in the OS with its warm-up steps.",
  merciNon: "Got it, thank you!",
  erreur: "Something went wrong. Please try again.",
  fermer: "Close",
  killTitre: "Message from the team",
  recreerTitre: "Your new TikTok account",
  compris: "Got it",
} as const;

/**
 * Espace du posteur (v3) : la recréation en pop-up bloquante (« Got it »,
 * 0383), l'offre Double en pop-up (Yes / No, 0382) et le message de Kill en
 * bandeau. Une pop-up à la fois : la recréation d'abord. Réservé au vrai posteur, comme `NudgePopup` :
 * l'admin qui traverse l'espace ne répond pas à sa place.
 */
export function PopupMessagesPosteur() {
  const { roleReel } = useAuth();
  if (roleReel !== "poster") return null;
  return <MessagesDuPosteur />;
}

function MessagesDuPosteur() {
  const { data } = useQuery({ queryKey: ["mes-messages-posteur"], queryFn: mesMessages, staleTime: 60_000 });
  const kill = (data ?? []).find((m) => m.type === "kill");
  const recreation = (data ?? []).find((m) => m.type === "recreer");
  const offre = (data ?? []).find((m) => m.type === "double");
  return (
    <>
      {kill && <BandeauKill message={kill} />}
      {recreation ? (
        <Recreation key={recreation.id} message={recreation} />
      ) : (
        offre && <OffreDouble key={offre.id} message={offre} />
      )}
    </>
  );
}

function BandeauKill({ message }: { message: MonMessage }) {
  return (
    <div
      role="status"
      data-testid="bandeau-kill"
      className="mb-4 flex gap-3 rounded-xl border border-destructive/40 bg-destructive/8 p-4 text-sm leading-relaxed"
    >
      <CircleAlert className="mt-0.5 size-5 shrink-0 text-destructive-foreground" aria-hidden />
      <div>
        <p className="font-medium">{EN.killTitre}</p>
        <p>{message.texte}</p>
      </div>
    </div>
  );
}

/** Recréer (0383) : bloquante, seul « Got it » la ferme (et pose `lu_at`). */
function Recreation({ message }: { message: MonMessage }) {
  const queryClient = useQueryClient();
  const lu = useMutation({
    mutationFn: () => marquerMessageLu(message.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mes-messages-posteur"] }),
  });
  return (
    <Dialog open disablePointerDismissal>
      <DialogPopup showCloseButton={false} className="max-w-md" data-testid="popup-recreation">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-warning/15 text-warning-foreground">
              <RefreshCw className="size-5" />
            </span>
            <DialogTitle className="text-base">{EN.recreerTitre}</DialogTitle>
          </div>
        </DialogHeader>
        <DialogPanel>
          <p className="whitespace-pre-wrap rounded-lg bg-muted/50 p-4 text-sm leading-relaxed">{message.texte}</p>
          {lu.isError && <p className="mt-2 text-sm text-destructive">{EN.erreur}</p>}
        </DialogPanel>
        <DialogFooter>
          <Button disabled={lu.isPending} onClick={() => lu.mutate()}>
            {EN.compris}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

/**
 * 0559 : l'offre d'un 2ᵉ compte (texte de Max, tarif × 2), bloquante. Vue à
 * l'affichage ; « I'll decide later » la referme jusqu'à la prochaine
 * ouverture du dashboard (72 h au plus).
 */
function OffreDouble({ message }: { message: MonMessage }) {
  const queryClient = useQueryClient();
  const { i18n } = useTranslation();
  const [ferme, setFerme] = React.useState(false);
  const tarif = useQuery({ queryKey: ["mon-tarif-semaine"], queryFn: monTarifSemaine, staleTime: 3_600_000 });
  React.useEffect(() => {
    void marquerMessageLu(message.id).catch(() => undefined);
  }, [message.id]);
  if (ferme || tarif.isLoading) return null;
  return (
    <PopupDouble
      langue={i18n.resolvedLanguage}
      tarif={tarif.data ?? null}
      expireAt={message.expire_at}
      repondre={(r) => repondreDouble(message.id, r)}
      plusTard={() => setFerme(true)}
      fini={() => {
        setFerme(true);
        void queryClient.invalidateQueries({ queryKey: ["mes-messages-posteur"] });
      }}
    />
  );
}
