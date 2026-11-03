import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { deciderRituel, killSamedi, type Probleme } from "./api";
import { jourRituel, samediDe } from "./logique";

const P = "problemes";

/**
 * 0530 : Kill = toujours le samedi. Le clic n'exécute rien : il prépare la
 * décision de la revue du samedi suivant (Kill pré-coché, « décidé dans
 * Problèmes »). Pour un STOP, les relances, nudges et posts s'arrêtent dès le
 * clic. « Annuler » remet Keep.
 */
export function BoutonKillSamedi({ p, libelle }: { p: Pick<Probleme, "id" | "kill_samedi_lundi">; libelle: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [erreur, setErreur] = React.useState<string | null>(null);
  const action = useMutation({
    mutationFn: (annuler: boolean) => killSamedi(p.id, annuler),
    onSuccess: () => {
      setErreur(null);
      void qc.invalidateQueries({ queryKey: ["problemes"] });
    },
    onError: (e) => setErreur((e as Error).message),
  });
  if (p.kill_samedi_lundi) {
    return (
      <span className="inline-flex flex-wrap items-center gap-2" data-testid="kill-prevu">
        <Badge variant="error">{t(`${P}.kill.prevu`, { date: samediDe(p.kill_samedi_lundi) })}</Badge>
        <Button size="sm" variant="outline" onClick={() => action.mutate(true)} disabled={action.isPending}>
          {t(`${P}.kill.annuler`)}
        </Button>
        {erreur && <span className="text-xs text-destructive">{erreur}</span>}
      </span>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button size="sm" variant="secondary" onClick={() => action.mutate(false)} disabled={action.isPending} data-testid="kill-samedi">
        {libelle}
      </Button>
      {erreur && <span className="text-xs text-destructive">{erreur}</span>}
    </span>
  );
}

/** 0531 : Doubler (décidé samedi) ou Recréer (décidé jeudi) : la décision va au rituel ; « Annuler » la retire. */
export function BoutonRituel({ p, choix, libelle }: { p: Pick<Probleme, "id" | "rituel_choix" | "rituel_lundi">; choix: "double" | "recreate"; libelle: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [erreur, setErreur] = React.useState<string | null>(null);
  const action = useMutation({
    mutationFn: (annuler: boolean) => deciderRituel(p.id, choix, annuler),
    onSuccess: () => {
      setErreur(null);
      void qc.invalidateQueries({ queryKey: ["problemes"] });
    },
    onError: (e) => setErreur((e as Error).message),
  });
  if (p.rituel_choix === choix && p.rituel_lundi) {
    return (
      <span className="inline-flex flex-wrap items-center gap-2" data-testid="rituel-prevu">
        <Badge variant="info">{t(`${P}.rituel.prevu.${choix}`, { date: jourRituel(p.rituel_lundi, choix) })}</Badge>
        <Button size="sm" variant="outline" onClick={() => action.mutate(true)} disabled={action.isPending}>{t(`${P}.kill.annuler`)}</Button>
        {erreur && <span className="text-xs text-destructive">{erreur}</span>}
      </span>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button size="sm" variant="secondary" onClick={() => action.mutate(false)} disabled={action.isPending} data-testid={`rituel-${choix}`}>
        {libelle}
      </Button>
      {erreur && <span className="text-xs text-destructive">{erreur}</span>}
    </span>
  );
}
