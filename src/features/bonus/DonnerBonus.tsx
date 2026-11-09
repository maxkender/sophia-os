import { useQueryClient } from "@tanstack/react-query";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import {
  lirePhraseBonus,
  noteBonus,
  personneSure,
  raisonBonus,
  type BonusPhrase,
  type PersonneProche,
} from "../../../supabase/functions/_shared/bonus";
import { donnerBonusA, personnesProches } from "./api";
import { jourMois } from "./lundi";

interface Recap {
  lu: BonusPhrase;
  personne: PersonneProche;
  raison: string;
}

/**
 * « Donner un bonus » en une phrase, écrite comme on veut : le montant, le
 * lundi et la raison sont lus ; la personne est cherchée par ressemblance
 * (0571). Un nom exact et unique est pris directement ; sinon on propose les
 * plus proches (« Tu voulais dire… »). Puis un récap (qui, combien, quel lundi,
 * raison, note Upwork) et « Confirmer » ajoute la ligne à valider. Rien n'est
 * payé ici : la ligne part avec « Tout envoyer ».
 */
export function DonnerBonus({ annee }: { annee: number }) {
  const qc = useQueryClient();
  const [phrase, setPhrase] = React.useState("");
  const [recap, setRecap] = React.useState<Recap | null>(null);
  const [choix, setChoix] = React.useState<{ lu: BonusPhrase; liste: PersonneProche[] } | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [occupe, setOccupe] = React.useState(false);

  const choisir = (lu: BonusPhrase, personne: PersonneProche) => {
    setChoix(null);
    setRecap({ lu, personne, raison: raisonBonus(lu, personne.nom) });
  };

  const preparer = async () => {
    setMessage(null);
    setRecap(null);
    setChoix(null);
    const lu = lirePhraseBonus(phrase, annee);
    if ("erreur" in lu) {
      setMessage(`Pas compris : ${lu.erreur}.`);
      return;
    }
    setOccupe(true);
    try {
      const liste = await personnesProches(lu.texteNom);
      const sure = personneSure(liste);
      if (sure) choisir(lu, sure);
      else if (liste.length === 0) setMessage(`Personne ne ressemble à « ${lu.nom || lu.texteNom} ». Écris le prénom et le nom.`);
      else setChoix({ lu, liste });
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setOccupe(false);
    }
  };

  const confirmer = async () => {
    if (!recap) return;
    setOccupe(true);
    try {
      const r = await donnerBonusA({ poster_id: recap.personne.id, montant: recap.lu.montant, lundi: recap.lu.lundi, raison: recap.raison });
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
            setChoix(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && phrase.trim() && !occupe) void preparer();
          }}
          placeholder="15 $ à Bogdan, pour sa super semaine"
          aria-label="Donner un bonus"
        />
        <Button size="sm" variant="outline" disabled={occupe || !phrase.trim()} onClick={() => void preparer()}>Préparer</Button>
      </div>
      {choix ? (
        <div className="space-y-2 rounded-lg border px-3 py-2 text-sm" data-testid="choix-personne">
          <p>
            {choix.lu.nom ? <>Pas de nom exact pour « {choix.lu.nom} ». </> : null}
            Tu voulais dire :
          </p>
          <div className="flex flex-wrap gap-2">
            {choix.liste.map((x) => (
              <Button key={x.id} size="sm" variant="outline" onClick={() => choisir(choix.lu, x)}>
                {x.nom}{x.actif ? "" : " (inactif)"}
              </Button>
            ))}
            <Button size="sm" variant="ghost" onClick={() => setChoix(null)}>Aucun</Button>
          </div>
        </div>
      ) : null}
      {recap ? (
        <div className="space-y-2 rounded-lg border px-3 py-2 text-sm" data-testid="recap-bonus">
          <p>
            <b>{recap.lu.montant} $</b> à <b>{recap.personne.nom}</b>{recap.personne.actif ? "" : " (inactif)"},{" "}
            {recap.lu.lundi ? `lundi ${jourMois(recap.lu.lundi)}` : "lundi prochain"} · raison : {recap.raison}
          </p>
          <p className="text-xs text-muted-foreground">Note Upwork vue par le posteur : « {noteBonus({ type: "manuel", quantite: 1, periode_fin: null, raison: recap.raison })} »</p>
          <div className="flex gap-2">
            <Button size="sm" disabled={occupe} onClick={() => void confirmer()}>{occupe ? "Ajout…" : "Confirmer"}</Button>
            <Button size="sm" variant="ghost" disabled={occupe} onClick={() => setRecap(null)}>Annuler</Button>
          </div>
        </div>
      ) : null}
      {message ? <p className="text-sm" role="status">{message}</p> : null}
      <p className="text-xs text-muted-foreground">Écris comme tu veux : montant, personne (même mal orthographiée), lundi, raison. La ligne arrive dans les bonus de lundi, à valider.</p>
    </div>
  );
}
