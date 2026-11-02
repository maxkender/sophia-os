import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Dialog, DialogFooter, DialogHeader, DialogPanel, DialogPopup, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/features/auth/AuthContext";
import { annonceVue, lireAnnonces } from "./api";

/** 1/11 : le message « Start Tuesday » (et les autres annonces de l'OS) en pop-up sur le dashboard du posteur. */
export function AnnoncesPopup() {
  const { roleReel } = useAuth();
  if (roleReel !== "poster") return null;
  return <Annonces />;
}

function Annonces() {
  const qc = useQueryClient();
  const lu = useQuery({ queryKey: ["mes-annonces"], queryFn: lireAnnonces, refetchInterval: 5 * 60_000 });
  const vue = useMutation({
    mutationFn: annonceVue,
    onSettled: () => void qc.invalidateQueries({ queryKey: ["mes-annonces"] }),
  });
  const a = lu.data?.[0];
  if (!a) return null;
  return (
    <Dialog open onOpenChange={(o) => !o && vue.mutate(a.id)}>
      <DialogPopup data-testid="annonce-popup">
        <DialogHeader>
          <DialogTitle>Message from the team</DialogTitle>
        </DialogHeader>
        <DialogPanel>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{a.texte}</p>
        </DialogPanel>
        <DialogFooter>
          <Button loading={vue.isPending} onClick={() => vue.mutate(a.id)}>Got it</Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
