import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogFooter, DialogHeader, DialogPanel, DialogPopup, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/features/auth/AuthContext";

import { fermerPopup, lienQuestionnaire, lireMonPopup, type MonPopup } from "./api";
import { useTextes } from "./textes";

/**
 * 15/11 (Max) : le pop-up du questionnaire, seulement pour les posteurs choisis. Il disparaît quand le posteur a
 * répondu. 20/11 (Max) : dans la langue de son compte, avec le bonus de 5 $ en titre ; « Later » le cache jusqu'à
 * la connexion suivante, 3 fois au plus.
 */
export function QuestionnairePopup() {
  const { roleReel } = useAuth();
  if (roleReel !== "poster") return null;
  return <Popup />;
}

function Popup() {
  const q = useQuery({ queryKey: ["questionnaire-popup"], queryFn: lireMonPopup, refetchInterval: 15 * 60_000 });
  if (!q.data) return null;
  return <Contenu p={q.data} />;
}

function Contenu({ p }: { p: MonPopup }) {
  const qc = useQueryClient();
  const [ferme, setFerme] = React.useState(false);
  const { t, dir, chargement } = useTextes(p.slug, p.langue);
  if (ferme || chargement) return null;
  const plusTard = () => {
    setFerme(true);
    void fermerPopup(p.slug, false).finally(() => qc.invalidateQueries({ queryKey: ["questionnaire-popup"] }));
  };
  return (
    <Dialog open onOpenChange={(o) => !o && plusTard()}>
      <DialogPopup data-testid="questionnaire-popup" dir={dir}>
        <DialogHeader>
          <DialogTitle>{t("ui.popup_titre")}</DialogTitle>
        </DialogHeader>
        <DialogPanel>
          <p className="text-sm leading-relaxed">{t("ui.popup_texte")}</p>
        </DialogPanel>
        <DialogFooter>
          <Button variant="outline" onClick={plusTard}>{t("ui.popup_plus_tard")}</Button>
          <Button
            render={<a href={lienQuestionnaire(p.slug, undefined, p.langue)} target="_blank" rel="noreferrer" />}
            onClick={() => { setFerme(true); void fermerPopup(p.slug, true); }}
          >
            {t("ui.popup_repondre")}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
