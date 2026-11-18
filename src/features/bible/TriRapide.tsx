/**
 * 18/11 (Max) : trier un compte « Non trié » ou « Autre app / idée » en 2 clics : l'app, puis le label
 * (ou « proposer un nouveau label »). La carte part alors dans son groupe.
 */
import * as React from "react";
import { useMutation } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { SELECT } from "./AjoutComptes";
import { majFiche, proposerLabel } from "./api";
import { useBible, useRafraichirBible } from "./donnees";
import type { Carte } from "./modele";
import { nomLabelValide } from "./parse";

const AUTRE = "__autre";
const PROPOSER = "__proposer";
const SANS_LABEL = "__sans";

export function TriRapide({ carte }: { carte: Carte }) {
  const { apps, labels } = useBible();
  const rafraichir = useRafraichirBible();
  const [app, setApp] = React.useState("");
  const [idee, setIdee] = React.useState(carte.autreApp ?? "");
  const [nouveau, setNouveau] = React.useState<string | null>(null);
  const [erreur, setErreur] = React.useState<string | null>(null);
  const id = carte.bibleId!;

  const ranger = useMutation({
    mutationFn: async (choix: { label?: string | null; propose?: string; idee?: string }) => {
      if (choix.idee !== undefined) return majFiche(id, { autre_app: choix.idee.trim() || null });
      if (choix.propose !== undefined) {
        if (!nomLabelValide(choix.propose)) throw new Error("snake_case, ex. anxiety_run");
        const p = await proposerLabel({ nom: choix.propose, application_ids: [app], apps_attente: [] });
        return majFiche(id, { application_ids: [app], label_propose_id: p, autre_app: null });
      }
      return majFiche(id, { application_ids: [app], label_id: choix.label ?? null, autre_app: null });
    },
    onSuccess: () => rafraichir(),
    onError: (e) => setErreur((e as Error).message),
  });

  const labelsApp = labels.filter((l) => l.apps.includes(app) || l.application_id === app);
  return (
    <div className="space-y-1.5 rounded-lg bg-muted/50 p-2" data-testid="tri-rapide">
      <select className={`${SELECT} h-8 text-xs`} value={app} onChange={(e) => { setApp(e.target.value); setErreur(null); }} aria-label={`App de @${carte.handle}`}>
        <option value="">1. Choisir l'app…</option>
        {apps.map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}
        <option value={AUTRE}>Autre app / idée…</option>
      </select>
      {app === AUTRE ? (
        <div className="flex gap-1.5">
          <Input value={idee} onChange={(e) => setIdee(e.target.value)} placeholder="app habits / style, app langues…" className="h-8 text-xs" />
          <Button size="sm" className="h-8" disabled={!idee.trim() || ranger.isPending} onClick={() => ranger.mutate({ idee })}>OK</Button>
        </div>
      ) : app ? (
        nouveau === null ? (
          <select
            className={`${SELECT} h-8 text-xs`}
            value=""
            onChange={(e) => {
              const v = e.target.value;
              if (v === PROPOSER) setNouveau("");
              else if (v === SANS_LABEL) ranger.mutate({ label: null });
              else if (v) ranger.mutate({ label: v });
            }}
            aria-label={`Label de @${carte.handle}`}
          >
            <option value="">2. Choisir le label…</option>
            {labelsApp.map((l) => <option key={l.id} value={l.id}>{l.nom}</option>)}
            <option value={PROPOSER}>+ Proposer un nouveau label…</option>
            <option value={SANS_LABEL}>Pas de label pour l'instant</option>
          </select>
        ) : (
          <div className="flex gap-1.5">
            <Input value={nouveau} onChange={(e) => setNouveau(e.target.value.toLowerCase().replace(/\s+/g, "_"))} placeholder="nom_du_label" className="h-8 text-xs" />
            <Button size="sm" className="h-8" disabled={!nouveau || ranger.isPending} onClick={() => ranger.mutate({ propose: nouveau })}>OK</Button>
          </div>
        )
      ) : null}
      {erreur && <p className="text-[11px] text-destructive">{erreur}</p>}
    </div>
  );
}
