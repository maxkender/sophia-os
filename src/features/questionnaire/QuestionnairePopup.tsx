import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogFooter, DialogHeader, DialogPanel, DialogPopup, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/features/auth/AuthContext";

import { fermerPopup, lienQuestionnaire, lireMonPopup } from "./api";

/**
 * 15/11 (Max) : le pop-up du questionnaire, seulement pour les posteurs que Max a choisis. Il disparaît quand
 * le posteur a répondu ou a cliqué « Later ». Rien pour les autres.
 */
export function QuestionnairePopup() {
  const { roleReel } = useAuth();
  if (roleReel !== "poster") return null;
  return <Popup />;
}

function Popup() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["questionnaire-popup"], queryFn: lireMonPopup, refetchInterval: 15 * 60_000 });
  const [ferme, setFerme] = React.useState(false);
  if (!q.data || ferme) return null;
  const { slug } = q.data;
  const plusTard = () => {
    setFerme(true);
    void fermerPopup(slug, false).finally(() => qc.invalidateQueries({ queryKey: ["questionnaire-popup"] }));
  };
  return (
    <Dialog open onOpenChange={(o) => !o && plusTard()}>
      <DialogPopup data-testid="questionnaire-popup">
        <DialogHeader>
          <DialogTitle>5 minutes to help us?</DialogTitle>
        </DialogHeader>
        <DialogPanel>
          <p className="text-sm leading-relaxed">
            We'd like to understand what you do on your account, so we can help everyone do as well. It takes about 5 minutes and your
            answers stay private.
          </p>
        </DialogPanel>
        <DialogFooter>
          <Button variant="outline" onClick={plusTard}>Later</Button>
          <Button
            render={<a href={lienQuestionnaire(slug)} target="_blank" rel="noreferrer" />}
            onClick={() => { setFerme(true); void fermerPopup(slug, true); }}
          >
            Answer the questions
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
