import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { declarerWarmupFini, lireDeclarationWarmup } from "./warmupApi";

/**
 * Prompt 25 MAJ, point 7c : warm-up fini = compte trouvé + au moins 5 abonnements.
 * Le compte a été trouvé au Start warmup mais l'OS n'arrive plus à lire le
 * profil : la recrue clique « Warm-up done » avec une capture de son profil ;
 * Lucia la vérifie dans Needs you. Rien à montrer si le warm-up est déjà vu fini.
 */
export function WarmupFiniCapture({ compteId, uid }: { compteId: string; uid: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const entree = React.useRef<HTMLInputElement>(null);
  const etat = useQuery({ queryKey: ["warmup-declaration", compteId], queryFn: () => lireDeclarationWarmup(compteId) });
  const envoyer = useMutation({
    mutationFn: (f: File) => declarerWarmupFini(compteId, uid, f),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["warmup-declaration", compteId] }),
  });
  const d = etat.data;
  if (!d || d.pret || !d.trouve_une_fois) return null;
  const refus = envoyer.data && !envoyer.data.ok;
  return (
    <div className="space-y-1.5 rounded-md border border-dashed p-3" data-testid="warmup-fini-capture">
      {d.statut === "a_verifier" ? (
        <p className="text-sm" role="status">{t("warmup.fini.enVerification")}</p>
      ) : (
        <>
          <p className="text-sm">{t(d.statut === "refuse" ? "warmup.fini.refuse" : "warmup.fini.aide")}</p>
          <input
            ref={entree}
            type="file"
            accept="image/*"
            className="hidden"
            aria-label={t("warmup.fini.capture")}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) envoyer.mutate(f);
              e.target.value = "";
            }}
          />
          <Button size="sm" variant="outline" loading={envoyer.isPending} onClick={() => entree.current?.click()}>
            {t("warmup.fini.bouton")}
          </Button>
        </>
      )}
      {refus && <p className="text-sm text-warning">{t("warmup.fini.impossible")}</p>}
      {envoyer.isError && <p className="text-sm text-destructive">{(envoyer.error as Error).message}</p>}
    </div>
  );
}
