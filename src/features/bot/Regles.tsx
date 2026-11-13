import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { cleRegle, type HistoriqueInfo, type Info, lireHistoriqueInfos, lireInfos, modifierInfo, REGLES_SUGGEREES } from "./api";

/**
 * 12/11 (OS clair) : « Règles qui changent ». Une règle par ligne (jour de paie, montants,
 * pays, liens…), modifiable en 2 clics, avec son historique et le retour à une ancienne valeur.
 * Le bot s'y tient à chaque réponse.
 */
export function Regles() {
  const qc = useQueryClient();
  const infos = useQuery({ queryKey: ["bot", "infos"], queryFn: lireInfos });
  const histo = useQuery({ queryKey: ["bot", "infos", "historique"], queryFn: lireHistoriqueInfos });
  const [nouvelle, setNouvelle] = React.useState<{ titre: string; valeur: string } | null>(null);
  const rafraichir = () => qc.invalidateQueries({ queryKey: ["bot", "infos"] });
  const ajouter = useMutation({
    mutationFn: (n: { titre: string; valeur: string }) => modifierInfo(cleRegle(n.titre), n.titre.trim(), n.valeur),
    onSuccess: () => { setNouvelle(null); void rafraichir(); },
  });
  const existantes = new Set((infos.data ?? []).map((i) => i.titre.toLowerCase()));

  return (
    <div className="space-y-3" data-testid="regles">
      <p className="text-sm text-muted-foreground">
        Les règles du moment. Le bot les utilise à chaque réponse : change-les ici, jamais dans un texte.
      </p>
      {(infos.error || histo.error) && <p className="text-sm text-destructive">{((infos.error ?? histo.error) as Error).message}</p>}
      <div className="space-y-2">
        {(infos.data ?? []).map((i) => (
          <LigneRegle key={i.cle} info={i} historique={(histo.data ?? []).filter((h) => h.cle === i.cle)} onFini={rafraichir} />
        ))}
      </div>
      {nouvelle ? (
        <Card>
          <CardContent className="space-y-2 p-4">
            <Input aria-label="Nom de la règle" placeholder="Nom de la règle (ex. Posts par jour)" value={nouvelle.titre}
              onChange={(e) => setNouvelle({ ...nouvelle, titre: e.target.value })} />
            <Textarea aria-label="Valeur de la règle" rows={2} placeholder="La valeur, en anglais si le bot la cite aux posteurs"
              value={nouvelle.valeur} onChange={(e) => setNouvelle({ ...nouvelle, valeur: e.target.value })} />
            <div className="flex gap-2">
              <Button size="sm" disabled={nouvelle.titre.trim().length < 2 || nouvelle.valeur.trim().length < 1 || ajouter.isPending}
                onClick={() => ajouter.mutate(nouvelle)}>Ajouter</Button>
              <Button size="sm" variant="ghost" onClick={() => setNouvelle(null)}>Annuler</Button>
            </div>
            {ajouter.error && <p className="text-sm text-destructive">{(ajouter.error as Error).message}</p>}
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => setNouvelle({ titre: "", valeur: "" })}>+ Ajouter une règle</Button>
          {REGLES_SUGGEREES.filter((r) => !existantes.has(r.toLowerCase())).map((r) => (
            <Button key={r} size="sm" variant="outline" onClick={() => setNouvelle({ titre: r, valeur: "" })}>+ {r}</Button>
          ))}
        </div>
      )}
    </div>
  );
}

function LigneRegle({ info, historique, onFini }: { info: Info; historique: HistoriqueInfo[]; onFini: () => void }) {
  const [edition, setEdition] = React.useState<string | null>(null);
  const sauver = useMutation({
    mutationFn: (valeur: string) => modifierInfo(info.cle, info.titre, valeur),
    onSuccess: () => { setEdition(null); onFini(); },
  });
  const anciennes = historique.filter((h) => h.avant && h.avant !== info.valeur);
  return (
    <div className="rounded-md border p-3 text-sm" data-testid="regle-ligne">
      {edition === null ? (
        <button type="button" className="flex w-full items-start justify-between gap-3 text-left" onClick={() => setEdition(info.valeur)}>
          <span className="min-w-0">
            <span className="block font-medium">{info.titre}</span>
            <span className="block break-words text-muted-foreground">{info.valeur}</span>
          </span>
          <span aria-hidden className="shrink-0">✏️</span>
        </button>
      ) : (
        <div className="space-y-2">
          <p className="font-medium">{info.titre}</p>
          <Textarea aria-label={info.titre} rows={2} value={edition} onChange={(e) => setEdition(e.target.value)} />
          <div className="flex gap-2">
            <Button size="sm" disabled={edition.trim().length < 1 || sauver.isPending} onClick={() => sauver.mutate(edition)}>Enregistrer</Button>
            <Button size="sm" variant="ghost" onClick={() => setEdition(null)}>Annuler</Button>
          </div>
          {sauver.error && <p className="text-destructive">{(sauver.error as Error).message}</p>}
        </div>
      )}
      {anciennes.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-muted-foreground">Historique ({anciennes.length})</summary>
          <ul className="mt-1 space-y-1 text-xs">
            {anciennes.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground">{new Date(h.at).toLocaleString("fr-FR")}</span>
                <span className="break-words">avant : « {h.avant} »</span>
                <Button size="sm" variant="ghost" disabled={sauver.isPending} onClick={() => sauver.mutate(h.avant!)}>Revenir à cette valeur</Button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
