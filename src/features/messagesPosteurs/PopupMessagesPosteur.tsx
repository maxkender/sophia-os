import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/features/auth/AuthContext";

import { mesMessages, repondreDouble, type MonMessage } from "./api";

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
} as const;

function dateAnglaise(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  }).format(new Date(iso));
}

/**
 * Espace du posteur (v3, 0382) : l'offre Double en pop-up (Yes / No) et le
 * message de Kill en bandeau. Réservé au vrai posteur, comme `NudgePopup` :
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
  const offre = (data ?? []).find((m) => m.type === "double");
  return (
    <>
      {kill && <BandeauKill message={kill} />}
      {offre && <OffreDouble key={offre.id} message={offre} />}
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

function OffreDouble({ message }: { message: MonMessage }) {
  const queryClient = useQueryClient();
  const [ferme, setFerme] = React.useState(false);
  const repondre = useMutation({
    mutationFn: (reponse: "oui" | "non") => repondreDouble(message.id, reponse),
  });
  if (ferme) return null;

  const fini = repondre.isSuccess;
  const fermer = () => {
    setFerme(true);
    if (fini) void queryClient.invalidateQueries({ queryKey: ["mes-messages-posteur"] });
  };

  return (
    <Dialog open onOpenChange={(ouvert) => !ouvert && fermer()}>
      <DialogPopup className="max-w-md" data-testid="offre-double">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-success/15 text-success-foreground">
              <Sparkles className="size-5" />
            </span>
            <div>
              <DialogTitle className="text-base">{EN.doubleTitre}</DialogTitle>
              {message.expire_at && !fini && (
                <DialogDescription>{EN.jusqua(dateAnglaise(message.expire_at))}</DialogDescription>
              )}
            </div>
          </div>
        </DialogHeader>
        <DialogPanel>
          <p className="whitespace-pre-wrap rounded-lg bg-muted/50 p-4 text-sm leading-relaxed">
            {fini ? (repondre.variables === "oui" ? EN.merciOui : EN.merciNon) : message.texte}
          </p>
          {repondre.isError && <p className="mt-2 text-sm text-destructive">{EN.erreur}</p>}
        </DialogPanel>
        <DialogFooter>
          {fini ? (
            <Button onClick={fermer}>{EN.fermer}</Button>
          ) : (
            <>
              <Button variant="outline" disabled={repondre.isPending} onClick={() => repondre.mutate("non")}>
                {EN.non}
              </Button>
              <Button disabled={repondre.isPending} onClick={() => repondre.mutate("oui")}>
                {EN.oui}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
