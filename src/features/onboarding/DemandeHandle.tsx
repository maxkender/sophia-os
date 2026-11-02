import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Dialog, DialogDescription, DialogHeader, DialogPanel, DialogPopup, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/lib/supabase/client";

import { ChangerHandle } from "./ChangerHandle";

async function lireDemande(): Promise<{ id: string; compte_id: string; handle: string | null } | null> {
  const { data, error } = await supabase.rpc("ma_demande_handle");
  if (error) throw error;
  return (data ?? null) as { id: string; compte_id: string; handle: string | null } | null;
}

/**
 * « Ask for @ » : tant que le posteur n'a pas donné le @ du compte d'où il
 * poste, une fenêtre bloquante sur son dashboard. Rien ne part sur Slack ni
 * sur Upwork ; la réponse passe par handles_proposes (l'OS lit le compte sur
 * TikTok avant de l'enregistrer).
 */
export function DemandeHandle() {
  const { t } = useTranslation();
  const lu = useQuery({ queryKey: ["ma-demande-handle"], queryFn: lireDemande });
  const d = lu.data;
  if (!d) return null;
  return (
    <Dialog open onOpenChange={() => undefined}>
      <DialogPopup className="max-w-md" data-testid="demande-handle">
        <DialogHeader>
          <DialogTitle className="text-base">{t("handleChange.demandeTitre")}</DialogTitle>
          <DialogDescription>{t("handleChange.demande", { handle: d.handle ?? "?" })}</DialogDescription>
        </DialogHeader>
        <DialogPanel className="pb-5 text-sm">
          <ChangerHandle compteId={d.compte_id} onEnregistre={() => void lu.refetch()} />
        </DialogPanel>
      </DialogPopup>
    </Dialog>
  );
}
