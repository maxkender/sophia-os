import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

import { type Consigne, enregistrerConsigne, lancerTests, lireConsignes, lireHistoriqueConsigne, lireTests, regressions, restaurerConsigne, type ResultatTests } from "./api";

/**
 * 12/11 (OS clair) : les consignes de Max au bot, en une phrase et en français. Appliquées
 * tout de suite (le bot les relit à chaque réponse). Après chaque ajout ou changement,
 * les tests repassent et on voit si un test qui passait échoue.
 */
export function Consignes() {
  const qc = useQueryClient();
  const consignes = useQuery({ queryKey: ["bot", "consignes"], queryFn: lireConsignes });
  const [texte, setTexte] = React.useState("");
  const [bilan, setBilan] = React.useState<{ r: ResultatTests; rouges: number } | null>(null);

  const apresChangement = async () => {
    void qc.invalidateQueries({ queryKey: ["bot", "consignes"] });
    const avant = (await lireTests()).filter((t) => t.actif);
    const r = await lancerTests(null);
    setBilan({ r, rouges: regressions(avant, r).length });
    void qc.invalidateQueries({ queryKey: ["bot", "tests"] });
  };
  const ajouter = useMutation({
    mutationFn: async () => {
      await enregistrerConsigne(null, texte.trim(), true);
      setTexte("");
      setBilan(null);
      await apresChangement();
    },
  });
  const changer = useMutation({
    mutationFn: async (c: { id: string; texte: string; actif: boolean }) => {
      setBilan(null);
      await enregistrerConsigne(c.id, c.texte, c.actif);
      await apresChangement();
    },
  });
  const occupe = ajouter.isPending || changer.isPending;

  return (
    <div className="space-y-3" data-testid="consignes">
      <Card>
        <CardContent className="space-y-2 p-4">
          <p className="text-sm font-medium">Nouvelle consigne, en une phrase</p>
          <Textarea aria-label="Nouvelle consigne" rows={2} value={texte} onChange={(e) => setTexte(e.target.value)}
            placeholder="Ex. : Ne promets jamais une date de paie autre que le lundi." />
          <Button disabled={texte.trim().length < 3 || occupe} onClick={() => ajouter.mutate()} data-testid="consigne-ajouter">
            {occupe ? "Enregistrement, puis tests (1 à 2 min)…" : "Ajouter"}
          </Button>
          {(ajouter.error || changer.error) && <p className="text-sm text-destructive">{((ajouter.error ?? changer.error) as Error).message}</p>}
          {bilan && (
            <p className={`text-sm ${bilan.rouges ? "text-destructive" : "text-emerald-700 dark:text-emerald-300"}`} data-testid="consigne-bilan">
              Appliquée. Tests relancés : {bilan.r.verts}/{bilan.r.total} verts
              {bilan.rouges ? ` · ⚠️ ${bilan.rouges} test(s) qui passaient échouent maintenant (onglet Tests)` : ""}.
            </p>
          )}
        </CardContent>
      </Card>
      {consignes.error && <p className="text-sm text-destructive">{(consignes.error as Error).message}</p>}
      {(consignes.data ?? []).length === 0 && !consignes.isLoading && <p className="text-sm text-muted-foreground">Aucune consigne pour l'instant.</p>}
      {(consignes.data ?? []).length > 0 && (
        <p className="text-xs text-muted-foreground">
          {(consignes.data ?? []).filter((c) => c.actif).length} actives sur {(consignes.data ?? []).length}. Le bot les lit toutes à chaque réponse, avant le reste.
        </p>
      )}
      <div className="space-y-2">
        {(consignes.data ?? []).map((c) => (
          <LigneConsigne key={c.id} c={c} occupe={occupe} onChanger={(x) => changer.mutate(x)} onRestaure={apresChangement} />
        ))}
      </div>
    </div>
  );
}

function LigneConsigne({ c, occupe, onChanger, onRestaure }: {
  c: Consigne;
  occupe: boolean;
  onChanger: (x: { id: string; texte: string; actif: boolean }) => void;
  onRestaure: () => Promise<void>;
}) {
  const [edition, setEdition] = React.useState<string | null>(null);
  const [ouvert, setOuvert] = React.useState(false);
  const histo = useQuery({ queryKey: ["bot", "consignes", "historique", c.id], queryFn: () => lireHistoriqueConsigne(c.id), enabled: ouvert });
  const restaurer = useMutation({ mutationFn: async (id: string) => { await restaurerConsigne(id); await onRestaure(); } });
  return (
    <div className={`rounded-md border p-3 text-sm ${c.actif ? "" : "opacity-60"}`} data-testid="consigne-ligne">
      <div className="flex items-start gap-3">
        <Switch checked={c.actif} disabled={occupe} aria-label={c.actif ? "Désactiver" : "Activer"}
          onCheckedChange={(v: boolean) => onChanger({ id: c.id, texte: c.texte, actif: v })} />
        <div className="min-w-0 flex-1">
          {edition === null ? (
            <button type="button" className="text-left" onClick={() => setEdition(c.texte)}>« {c.texte} »</button>
          ) : (
            <div className="space-y-2">
              <Textarea aria-label="Modifier la consigne" rows={2} value={edition} onChange={(e) => setEdition(e.target.value)} />
              <div className="flex gap-2">
                <Button size="sm" disabled={edition.trim().length < 3 || occupe} onClick={() => { onChanger({ id: c.id, texte: edition, actif: c.actif }); setEdition(null); }}>Enregistrer</Button>
                <Button size="sm" variant="ghost" onClick={() => setEdition(null)}>Annuler</Button>
              </div>
            </div>
          )}
          {c.exemple && edition === null && <p className="mt-1 text-xs text-muted-foreground">Exemple : {c.exemple}</p>}
          <p className="mt-1 text-xs text-muted-foreground">
            {c.source === "regles_bots" && <span className="mr-1 rounded bg-muted px-1.5 py-0.5" data-testid="consigne-regle-bots">Règle des bots (ancien bot FAQ)</span>}
            {c.actif ? "🟢 active" : "⚪ éteinte"} · {new Date(c.maj_at).toLocaleString("fr-FR")}
            {" · "}<button type="button" className="underline" onClick={() => setOuvert(!ouvert)}>historique</button>
          </p>
          {ouvert && (
            <ul className="mt-1 space-y-1 text-xs">
              {(histo.data ?? []).filter((h) => h.avant).map((h) => (
                <li key={h.id} className="flex flex-wrap items-center gap-2">
                  <span className="text-muted-foreground">{new Date(h.at).toLocaleString("fr-FR")}</span>
                  <span>avant : « {h.avant?.texte} » ({h.avant?.actif ? "active" : "éteinte"})</span>
                  <Button size="sm" variant="ghost" disabled={restaurer.isPending || occupe} onClick={() => restaurer.mutate(h.id)}>Revenir</Button>
                </li>
              ))}
              {(histo.data ?? []).filter((h) => h.avant).length === 0 && <li className="text-muted-foreground">Pas encore de modification.</li>}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
