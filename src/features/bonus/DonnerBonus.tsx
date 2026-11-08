import { useQueryClient } from "@tanstack/react-query";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { lirePhraseBonus, noteBonus, type BonusPhrase } from "../../../supabase/functions/_shared/bonus";
import { donnerBonus } from "./api";
import { jourMois } from "./lundi";

/**
 * « Donner un bonus » en une phrase : la phrase est lue, un récap s'affiche
 * (qui, combien, quel lundi, raison, note Upwork), puis « Confirmer » ajoute la
 * ligne à valider. Rien n'est payé ici : la ligne part avec « Tout envoyer ».
 */
export function DonnerBonus({ annee }: { annee: number }) {
  const qc = useQueryClient();
  const [phrase, setPhrase] = React.useState("");
  const [recap, setRecap] = React.useState<BonusPhrase | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [occupe, setOccupe] = React.useState(false);

  const preparer = () => {
    setMessage(null);
    const lu = lirePhraseBonus(phrase, annee);
    if ("erreur" in lu) {
      setRecap(null);
      setMessage(`Pas compris : ${lu.erreur}.`);
      return;
    }
    setRecap(lu);
  };

  const confirmer = async () => {
    if (!recap) return;
    setOccupe(true);
    try {
      const r = await donnerBonus(recap);
      if (!r.ok) {
        setMessage(`Pas ajouté : ${r.erreur}.`);
      } else {
        setMessage(`Ajouté : ${r.montant} $ à ${r.nom} (lundi ${jourMois(String(r.lundi))}). À envoyer avec « Tout envoyer ».`);
        setPhrase("");
        setRecap(null);
        await qc.invalidateQueries({ queryKey: ["bonus-lundi"] });
      }
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setOccupe(false);
    }
  };

  return (
    <div className="space-y-2" data-testid="donner-bonus">
      <p className="text-sm font-medium">Donner un bonus</p>
      <div className="flex flex-wrap gap-2">
        <Input
          className="min-w-0 flex-1"
          value={phrase}
          onChange={(e) => {
            setPhrase(e.target.value);
            setRecap(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && phrase.trim()) preparer();
          }}
          placeholder="donne 2 $ de bonus à Martin Befeld lundi, raison …"
          aria-label="Donner un bonus"
        />
        <Button size="sm" variant="outline" disabled={occupe || !phrase.trim()} onClick={preparer}>Préparer</Button>
      </div>
      {recap ? (
        <div className="space-y-2 rounded-lg border px-3 py-2 text-sm" data-testid="recap-bonus">
          <p>
            <b>{recap.montant} $</b> à <b>{recap.nom}</b>, {recap.lundi ? `lundi ${jourMois(recap.lundi)}` : "lundi prochain"} · raison : {recap.raison}
          </p>
          <p className="text-xs text-muted-foreground">Note Upwork vue par le posteur : « {noteBonus({ type: "manuel", quantite: 1, periode_fin: null, raison: recap.raison })} »</p>
          <div className="flex gap-2">
            <Button size="sm" disabled={occupe} onClick={confirmer}>{occupe ? "Ajout…" : "Confirmer"}</Button>
            <Button size="sm" variant="ghost" disabled={occupe} onClick={() => setRecap(null)}>Annuler</Button>
          </div>
        </div>
      ) : null}
      {message ? <p className="text-sm" role="status">{message}</p> : null}
      <p className="text-xs text-muted-foreground">La ligne arrive dans les bonus de lundi, à valider. Aussi sur Slack : /bonus …</p>
    </div>
  );
}
