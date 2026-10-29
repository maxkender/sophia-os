import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { lireApercu, lireBudgetUpwork, lireDoublons, TYPES_MESSAGES } from "./attenteApi";

const libelleType = (t: (k: string, o?: Record<string, unknown>) => string, type: string) =>
  t(`autoOnglets.attente.types.${type}`, { defaultValue: type });

/** Les données utilisées par un message, en une ligne (« clé : valeur · … »). */
function Donnees({ donnees }: { donnees: Record<string, unknown> | null }) {
  const morceaux = Object.entries(donnees ?? {})
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : String(v)}`);
  if (morceaux.length === 0) return null;
  return <p className="break-words text-xs text-muted-foreground">{morceaux.join(" · ")}</p>;
}

/** Overview → Health : les conversations Upwork du jour, le plafond, la limite d'Upwork. */
export function BudgetUpwork() {
  const { t } = useTranslation();
  const lu = useQuery({ queryKey: ["upwork-budget"], queryFn: lireBudgetUpwork, refetchInterval: 5 * 60_000 });
  const b = lu.data;
  if (!b) return null;
  // Prompt 25 v4 : un compteur par compte connecté (Max, puis Adrien).
  const comptes = (b.comptes ?? []).filter((c) => c.connecte || c.compte === "principal");
  if (comptes.length === 0) {
    const plein = b.limite_atteinte || b.conversations >= b.max;
    return (
      <p className={plein ? "font-medium text-destructive" : "text-muted-foreground"} data-testid="budget-upwork">
        {t("auto.sante.budgetUpwork", { n: b.conversations, max: b.max, reserve: b.reserve })}
        {b.limite_atteinte && ` · ${t("auto.sante.limiteUpwork")}`}
      </p>
    );
  }
  return (
    <div className="space-y-0.5" data-testid="budget-upwork">
      {comptes.map((c) => {
        const plein = c.limite || c.conversations >= b.max;
        return (
          <p key={c.compte} className={plein ? "font-medium text-destructive" : "text-muted-foreground"} data-budget-compte={c.compte}>
            {t("auto.sante.budgetCompte", { compte: t(`auto.sante.comptes.${c.compte}`), n: c.conversations, max: b.max })}
            {c.limite && ` · ${t("auto.sante.limiteUpwork")}`}
          </p>
        );
      })}
      <p className="text-xs text-muted-foreground">{t("auto.sante.budgetOrdre", { reserve: b.reserve })}</p>
    </div>
  );
}

/** Ce qui partirait, par type : 10 exemples réels (destinataire, HM, canal, texte, données). */
export function ApercuMessages() {
  const { t } = useTranslation();
  const [demain, setDemain] = React.useState(false);
  const lu = useQuery({ queryKey: ["messages-apercu", demain], queryFn: () => lireApercu(demain), enabled: false });
  const doublons = useQuery({ queryKey: ["messages-doublons"], queryFn: lireDoublons });
  return (
    <div className="space-y-4" data-testid="apercu-messages">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("autoOnglets.apercu.titre")}</CardTitle>
          <p className="text-sm text-muted-foreground">{t("autoOnglets.apercu.aide")}</p>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={demain} onChange={(e) => setDemain(e.target.checked)} />
              {t("autoOnglets.apercu.demain")}
            </label>
            <Button size="sm" onClick={() => void lu.refetch()} disabled={lu.isFetching}>
              {lu.isFetching ? t("autoOnglets.apercu.calcul") : t("autoOnglets.apercu.calculer")}
            </Button>
          </div>
          {lu.error && <p className="text-destructive">{(lu.error as Error).message}</p>}
          {lu.data &&
            TYPES_MESSAGES.map((type) => {
              const bloc = lu.data.types[type];
              return (
                <div key={type} className="space-y-2" data-apercu={type}>
                  <p className="font-medium">
                    {libelleType(t, type)} · {t("autoOnglets.apercu.total", { n: bloc?.total ?? 0 })}
                  </p>
                  {(bloc?.exemples ?? []).map((ex) => (
                    <div key={`${type}-${ex.poster_id}`} className="space-y-1 rounded-md border p-2 text-xs">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{ex.nom ?? "—"}</span>
                        <span className="text-muted-foreground">{t("autoOnglets.approuver.hm", { hm: ex.hm ?? "—" })}</span>
                        <Badge variant="secondary">{ex.variante}</Badge>
                        {ex.doublon ? (
                          <Badge variant="warning">{t("autoOnglets.apercu.doublon")}</Badge>
                        ) : (
                          <span className="text-muted-foreground">{ex.canaux.join(" + ") || t("autoOnglets.apercu.aucunCanal")}</span>
                        )}
                      </p>
                      <p className="whitespace-pre-line rounded bg-muted/40 p-2">{ex.texte}</p>
                      <Donnees donnees={ex.donnees} />
                    </div>
                  ))}
                </div>
              );
            })}
          {lu.data && lu.data.needs_you.length > 0 && (
            <div className="space-y-1" data-apercu="needs_you">
              <p className="font-medium">{t("autoOnglets.apercu.needsYou", { n: lu.data.needs_you.length })}</p>
              <p className="text-xs text-muted-foreground">
                {lu.data.needs_you.map((x) => `${x.nom ?? "?"} (@${x.handle ?? "?"})`).join(" · ")}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
      <Card data-testid="doublons">
        <CardHeader>
          <CardTitle className="text-base">{t("autoOnglets.apercu.doublonsTitre", { n: doublons.data?.length ?? 0 })}</CardTitle>
          <p className="text-sm text-muted-foreground">{t("autoOnglets.apercu.doublonsAide")}</p>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          {(doublons.data ?? []).map((d) => (
            <p key={`${d.par}-${d.cle}`}>
              <span className="text-muted-foreground">{d.par === "contrat" ? t("autoOnglets.apercu.contrat", { id: d.cle }) : t("autoOnglets.apercu.slack", { id: d.cle })} : </span>
              {d.profils.map((p) => `${p.nom ?? "—"} (${p.email ?? "?"}, ${p.cohorte ?? "?"})`).join(" / ")}
            </p>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
