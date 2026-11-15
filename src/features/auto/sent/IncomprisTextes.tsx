import { useQuery } from "@tanstack/react-query";
import * as React from "react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { localeDate } from "@/locales/localeDate";

import { lireTextesIncompris, tauxIncompris } from "./incomprisApi";

const S = "autoOnglets.sent.incompris";

/**
 * 6/11 : tous les textes envoyés automatiquement (relances, nudges, popup
 * Recreate, rappels, bienvenue, fin de contrat…) sur une seule liste, avec le
 * nombre de « What does it mean / I don't understand » reçus dans les 48 h.
 * Le plus incompris en haut ; le texte réellement parti se déplie.
 */
export function IncomprisTextes() {
  const { t } = useTranslation();
  const [jours, setJours] = React.useState(30);
  const lu = useQuery({ queryKey: ["textes-incompris", jours], queryFn: () => lireTextesIncompris(jours) });
  const quand = (iso: string | null) => (iso ? new Date(iso).toLocaleString(localeDate(), { dateStyle: "short", timeStyle: "short" }) : "—");
  return (
    <Card data-testid="textes-incompris">
      <CardContent className="space-y-3 p-4 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">{t(`${S}.titre`)}</p>
          <select className="h-8 rounded-md border border-input bg-background px-2 text-xs" value={jours}
            onChange={(e) => setJours(Number(e.target.value))} aria-label={t(`${S}.periode`)}>
            {[7, 30, 90].map((j) => <option key={j} value={j}>{t(`${S}.jours`, { n: j })}</option>)}
          </select>
        </div>
        <p className="text-xs text-muted-foreground">{t(`${S}.aide`)}</p>
        {lu.isLoading && <p className="text-xs text-muted-foreground">…</p>}
        {lu.error && <p className="text-xs text-destructive">{(lu.error as Error).message}</p>}
        <ul className="divide-y">
          {(lu.data ?? []).map((x) => (
            <li key={x.type} className="py-2" data-testid="texte-incompris">
              <details>
                <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                  <span className="font-medium">{t(`${S}.types.${x.type.replace(/[:.]/g, "_")}`, { defaultValue: x.type })}</span>
                  <span className="text-xs text-muted-foreground">{t(`${S}.envoyes`, { n: x.envoyes, p: x.posteurs })}</span>
                  {x.incompris > 0
                    ? <Badge variant="outline" className="border-amber-400 text-amber-700">{t(`${S}.nb`, { n: x.incompris })} · {tauxIncompris(x)}</Badge>
                    : <Badge variant="secondary">{t(`${S}.aucun`)}</Badge>}
                  <span className="ml-auto text-xs text-muted-foreground">{quand(x.dernier_at)}</span>
                </summary>
                <div className="mt-2 space-y-2">
                  {x.dernier_texte && <p className="whitespace-pre-wrap rounded-md bg-muted/40 p-2 text-xs">{x.dernier_texte}</p>}
                  {x.exemples.length > 0 && (
                    <ul className="space-y-1 text-xs">
                      {x.exemples.map((e, i) => <li key={i}>❓ « {e.texte} » <span className="text-muted-foreground">· {quand(e.at)}</span></li>)}
                    </ul>
                  )}
                </div>
              </details>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
