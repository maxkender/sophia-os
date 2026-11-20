import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogFooter, DialogHeader, DialogPanel, DialogPopup, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/features/auth/AuthContext";
import { lireMonPopup } from "@/features/questionnaire/api";
import { supabase } from "@/lib/supabase/client";

/**
 * 20/11 (Max) : l'offre de devenir Comment Master (titulaire ou suppléant) d'une langue, en pop-up à la prochaine
 * connexion, dans la langue du posteur. « Accept » : l'OS crée son mandat, l'ajoute au salon Slack et allume la
 * région. « No thanks » : l'offre passe au candidat suivant.
 */
interface Offre {
  id: string;
  langue: string;
  role: "titulaire" | "suppleant";
  tarif: number | null;
  textes: Record<string, string> | null;
}

const DROITE_A_GAUCHE = /^(ar|he|fa|ur)\b/i;

export function OffreCommentMasterPopup() {
  const { roleReel } = useAuth();
  if (roleReel !== "poster") return null;
  return <Popup />;
}

function Popup() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["comment-master-offre"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("comment_master_offre_mienne");
      if (error) throw new Error(error.message);
      return (data ?? null) as Offre | null;
    },
    refetchInterval: 15 * 60_000,
  });
  // Un pop-up à la fois : le questionnaire d'abord, s'il y en a un.
  const questionnaire = useQuery({ queryKey: ["questionnaire-popup"], queryFn: lireMonPopup, refetchInterval: 15 * 60_000 });
  const [reponse, setReponse] = React.useState<boolean | null>(null);
  const [ferme, setFerme] = React.useState(false);
  const o = q.data;
  const visible = !!o?.textes && !ferme && !questionnaire.data && !questionnaire.isLoading;
  React.useEffect(() => {
    if (visible && o?.id) void supabase.rpc("comment_master_offre_vue", { p_id: o.id });
  }, [visible, o?.id]);
  const m = useMutation({
    mutationFn: async (accepte: boolean) => {
      const { error } = await supabase.rpc("comment_master_offre_repondre", { p_id: o!.id, p_accepte: accepte });
      if (error) throw new Error(error.message);
      return accepte;
    },
    onSuccess: (accepte) => setReponse(accepte),
  });
  if (!visible || !o?.textes) return null;
  const t = o.textes;
  const fermer = () => {
    setFerme(true);
    void qc.invalidateQueries({ queryKey: ["comment-master-offre"] });
  };
  return (
    <Dialog open onOpenChange={(ouvert) => !ouvert && reponse !== null && fermer()}>
      <DialogPopup data-testid="offre-comment-master" dir={DROITE_A_GAUCHE.test(o.langue) ? "rtl" : "ltr"}>
        <DialogHeader>
          <DialogTitle>{t.titre}</DialogTitle>
        </DialogHeader>
        <DialogPanel>
          <p className="text-sm leading-relaxed">{reponse === null ? t.texte : reponse ? t.merci_oui : t.merci_non}</p>
          {m.error && <p className="mt-2 text-destructive text-xs">{(m.error as Error).message}</p>}
        </DialogPanel>
        <DialogFooter>
          {reponse === null ? (
            <>
              <Button variant="outline" disabled={m.isPending} onClick={() => m.mutate(false)} data-testid="offre-cm-refuser">{t.refuser}</Button>
              <Button disabled={m.isPending} onClick={() => m.mutate(true)} data-testid="offre-cm-accepter">{t.accepter}</Button>
            </>
          ) : (
            <Button onClick={fermer}>OK</Button>
          )}
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
