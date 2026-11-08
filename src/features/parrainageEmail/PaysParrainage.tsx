import * as React from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export interface LignePaysParrainage {
  pays: string;
  nom: string;
  zone: string | null;
  tarif: number | null;
  langue: string;
  envoi_auto: boolean;
  recrutement_ouvert: boolean;
  /** Filleuls en liste d'attente pour ce pays. */
  attente: number;
}

export interface PropsPaysParrainage {
  lignes: LignePaysParrainage[];
  changer: (pays: string, champ: "envoi_auto" | "recrutement_ouvert", valeur: boolean) => void;
}

function Bascule({ on, onClick, libelle }: { on: boolean; onClick: () => void; libelle: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={libelle}
      onClick={onClick}
      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${on ? "bg-emerald-600 text-white" : "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"}`}
    >
      {on ? "on" : "off"}
    </button>
  );
}

/**
 * 8/11 : Settings → « Parrainage par pays ». L'email au filleul ne part que si
 * le pays est en envoi automatique ET recrutement ouvert ; sinon le filleul
 * attend (envoyé tout seul si le pays repasse on dans les 30 jours).
 */
export function PaysParrainage({ lignes, changer }: PropsPaysParrainage) {
  const [filtre, setFiltre] = React.useState<"tous" | "on" | "off">("tous");
  const ouvert = (l: LignePaysParrainage) => l.envoi_auto && l.recrutement_ouvert;
  const vues = lignes.filter((l) => filtre === "tous" || (filtre === "on") === ouvert(l));
  const nOn = lignes.filter(ouvert).length;
  return (
    <Card data-testid="pays-parrainage">
      <CardHeader>
        <CardTitle>Parrainage par pays</CardTitle>
        <CardDescription>
          {nOn} pays où l'email part tout de suite. Ailleurs, l'ami du posteur est mis en liste d'attente et reçoit l'email si le pays repasse « on » dans les 30 jours.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2" role="tablist">
          {(["tous", "on", "off"] as const).map((f) => (
            <button key={f} type="button" role="tab" aria-selected={filtre === f} onClick={() => setFiltre(f)}
              className={`rounded-full border px-3 py-1 text-xs ${filtre === f ? "border-primary bg-primary text-primary-foreground" : "bg-background"}`}>
              {f === "tous" ? `Tous (${lignes.length})` : f === "on" ? `Email envoyé (${nOn})` : `Liste d'attente (${lignes.length - nOn})`}
            </button>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3">Pays</th>
                <th className="py-2 pr-3">Zone · tarif</th>
                <th className="py-2 pr-3">Langue de l'email</th>
                <th className="py-2 pr-3">Envoi automatique</th>
                <th className="py-2 pr-3">Recrutement ouvert</th>
                <th className="py-2 pr-3">En attente</th>
              </tr>
            </thead>
            <tbody>
              {vues.map((l) => (
                <tr key={l.pays} className="border-b border-border/40">
                  <td className="py-1.5 pr-3"><b>{l.nom}</b> <span className="text-xs text-muted-foreground">{l.pays}</span></td>
                  <td className="py-1.5 pr-3">{l.zone ?? "—"}{l.tarif !== null ? ` · ${l.tarif} $` : ""}</td>
                  <td className="py-1.5 pr-3">{l.langue}</td>
                  <td className="py-1.5 pr-3"><Bascule on={l.envoi_auto} libelle={`Envoi automatique ${l.nom}`} onClick={() => changer(l.pays, "envoi_auto", !l.envoi_auto)} /></td>
                  <td className="py-1.5 pr-3"><Bascule on={l.recrutement_ouvert} libelle={`Recrutement ouvert ${l.nom}`} onClick={() => changer(l.pays, "recrutement_ouvert", !l.recrutement_ouvert)} /></td>
                  <td className="py-1.5 pr-3">{l.attente || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
