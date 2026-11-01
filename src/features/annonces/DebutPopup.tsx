import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Dialog, DialogFooter, DialogHeader, DialogPanel, DialogPopup, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/features/auth/AuthContext";
import { aujourdhuiParis } from "@/features/moteur/cohortes";

import { lireMonDebut, texteDebut } from "./debut";

const lire = (k: string) => {
  try {
    return sessionStorage.getItem(k);
  } catch {
    return null;
  }
};
const ecrire = (k: string) => {
  try {
    sessionStorage.setItem(k, "1");
  } catch {
    /* navigation privée : le pop-up reviendra, sans gravité */
  }
};

/**
 * 0494 : Start Tuesday / Postpone : le pop-up à la connexion au dashboard (une
 * fois par session), et de nouveau sur l'écran des posts le lundi, tant que ce
 * n'est pas réglé. Il disparaît tout seul quand le relevé suivant voit l'étape faite.
 */
export function DebutPopup({ maintenant }: { maintenant?: Date }) {
  const { roleReel } = useAuth();
  if (roleReel !== "poster") return null;
  return <Debut maintenant={maintenant} />;
}

function Debut({ maintenant }: { maintenant?: Date }) {
  const { pathname } = useLocation();
  const lu = useQuery({ queryKey: ["mon-debut"], queryFn: lireMonDebut, refetchInterval: 10 * 60_000 });
  const texte = lu.data ? texteDebut(lu.data, maintenant) : null;
  const jour = aujourdhuiParis(maintenant ?? new Date());
  const lundi = new Date(`${jour}T12:00:00Z`).getUTCDay() === 1;
  const ecranPosts = pathname.startsWith("/calendrier");
  const cle = lu.data ? `debut-popup:${lu.data.cas}:${jour}` : "";
  const clePosts = `${cle}:posts`;
  const [ferme, setFerme] = React.useState(false);
  // Lundi, sur l'écran des posts : de nouveau, même si fermé à la connexion.
  const aMontrer = Boolean(texte) && !ferme && (!lire(cle) || (lundi && ecranPosts && !lire(clePosts)));
  React.useEffect(() => {
    setFerme(false);
  }, [pathname]);
  if (!aMontrer || !lu.data) return null;
  const fermer = () => {
    ecrire(cle);
    if (lundi && ecranPosts) ecrire(clePosts);
    setFerme(true);
  };
  return (
    <Dialog open onOpenChange={(o) => !o && fermer()}>
      <DialogPopup data-testid="debut-popup" data-cas={lu.data.cas}>
        <DialogHeader>
          <DialogTitle>{lu.data.cas === "mardi" ? "Your start: Tuesday" : "Your start has moved"}</DialogTitle>
        </DialogHeader>
        <DialogPanel>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{texte}</p>
        </DialogPanel>
        <DialogFooter>
          <Button onClick={fermer}>Got it</Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
