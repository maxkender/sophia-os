/** 18/11 : les labels proposés, avec les comptes qui les illustrent, et Valider / Refuser (admin). */
import { useMutation } from "@tanstack/react-query";
import * as React from "react";

import { Button } from "@/components/ui/button";

import { refuserLabel, validerLabel } from "./api";
import { CarteCompte } from "./CarteCompte";
import { useBible, useRafraichirBible } from "./donnees";
import type { Carte } from "./modele";

export function LabelsProposes({ toutes, onOuvrir }: { toutes: Carte[]; onOuvrir: (c: Carte) => void }) {
  const { proposes, apps, fiches } = useBible();
  const rafraichir = useRafraichirBible();
  const [message, setMessage] = React.useState<string | null>(null);
  const decider = useMutation({
    mutationFn: async ({ id, valider }: { id: string; valider: boolean }) => (valider ? validerLabel(id) : refuserLabel(id)),
    onSuccess: () => {
      setMessage(null);
      rafraichir();
    },
    onError: (e) => setMessage((e as Error).message),
  });
  const aValider = proposes.filter((p) => p.statut === "a_valider");
  if (!aValider.length) return null;
  return (
    <section className="space-y-4 rounded-2xl border border-dashed border-violet-300 bg-violet-50/40 p-4 dark:border-violet-900 dark:bg-violet-950/10" data-testid="labels-proposes">
      <div>
        <h2 className="text-base font-semibold">Labels proposés</h2>
        <p className="text-xs text-muted-foreground">Un label n'entre dans les vrais labels qu'au clic « Valider ». L'import d'un compte est bloqué tant que son label n'est pas validé.</p>
      </div>
      {message && <p className="text-sm text-destructive">{message}</p>}
      {aValider.map((p) => {
        // Les comptes qui l'illustrent : son label principal, ou une règle de compte polyvalent.
        const ids = new Set(fiches.filter((f) => f.label_propose_id === p.id || (f.polyvalent_regles ?? []).some((r) => r.label === p.nom)).map((f) => f.id));
        const cartes = toutes.filter((c) => c.bibleId && ids.has(c.bibleId));
        const appsNoms = [...p.application_ids.map((id) => apps.find((a) => a.id === id)?.nom ?? "?"), ...p.apps_attente.map((a) => `${a} (en attente)`)];
        return (
          <div key={p.id} className="space-y-3 rounded-xl bg-card p-3 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-mono text-sm font-semibold">{p.nom}</p>
                <p className="text-xs text-muted-foreground">{p.description_da || "Pas encore de description de DA."}</p>
                <p className="text-[11px] text-muted-foreground">Apps : {appsNoms.join(", ") || "aucune choisie"}</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => decider.mutate({ id: p.id, valider: true })} disabled={decider.isPending}>Valider</Button>
                <Button size="sm" variant="outline" onClick={() => decider.mutate({ id: p.id, valider: false })} disabled={decider.isPending}>Refuser</Button>
              </div>
            </div>
            {cartes.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {cartes.map((c) => <CarteCompte key={c.cle} c={c} onOuvrir={onOuvrir} />)}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Aucun compte ne l'illustre pour l'instant.</p>
            )}
          </div>
        );
      })}
    </section>
  );
}
