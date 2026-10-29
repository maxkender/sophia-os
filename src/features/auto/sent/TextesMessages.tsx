import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/features/auth/AuthContext";
import { ecrireReglages, lireReglagesBruts, remplirVariables, variablesInconnues } from "@/features/reglagesOs/api";
import { JournalReglages } from "@/features/reglagesOs/JournalReglages";

import { CLES_APERCU, CLES_TEXTES, ecrireTexte, exemples, GROUPES_TEXTES, lireTexte, TEXTES, type TexteCatalogue } from "./catalogue";

const CLE = ["reglages", "textes-messages"] as const;

/**
 * Messages sent → Texts (prompt 22, partie 6.3) : tous les textes au même
 * endroit, dans l'ordre de la semaine, avec un aperçu une fois les
 * {variables} remplies. Admin seulement (vérifié en base : « %texte% »,
 * lien_1000, 0427) ; le Head of Ops les lit. Chaque texte s'enregistre seul :
 * un objet (lien_1000) est relu juste avant, ses autres champs restent.
 */
export function TextesMessages() {
  const { t } = useTranslation();
  const { role } = useAuth();
  const admin = role === "admin";
  const lu = useQuery({ queryKey: CLE, queryFn: () => lireReglagesBruts([...CLES_TEXTES, ...CLES_APERCU]) });
  if (lu.error) return <p className="text-sm text-destructive">{(lu.error as Error).message}</p>;
  if (!lu.data) return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  const vars = exemples(lu.data);
  return (
    <div className="space-y-6" data-testid="textes-messages">
      <p className="text-sm text-muted-foreground">
        {admin ? t("autoOnglets.textes.aide") : t("autoOnglets.textes.lectureSeule")}
      </p>
      {GROUPES_TEXTES.map((g) => (
        <Card key={g} data-groupe-texte={g}>
          <CardHeader>
            <CardTitle className="text-base">{t(`autoOnglets.textes.groupes.${g}.titre`)}</CardTitle>
            <CardDescription>{t(`autoOnglets.textes.groupes.${g}.quand`)}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {TEXTES.filter((x) => x.groupe === g).map((x) => (
              <ChampTexte key={x.id} x={x} valeur={lireTexte(lu.data[x.cle], x.chemin)} vars={vars} admin={admin} />
            ))}
          </CardContent>
        </Card>
      ))}
      <JournalReglages cles={CLES_TEXTES} />
    </div>
  );
}

function ChampTexte({
  x,
  valeur,
  vars,
  admin,
}: {
  x: TexteCatalogue;
  valeur: string | null;
  vars: Record<string, string>;
  admin: boolean;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [texte, setTexte] = React.useState(valeur ?? "");
  React.useEffect(() => setTexte(valeur ?? ""), [valeur]);
  const enregistrer = useMutation({
    mutationFn: async () => {
      // Relu juste avant : un autre champ de l'objet (lien_1000) ne bouge pas.
      const frais = x.chemin ? (await lireReglagesBruts([x.cle]))[x.cle] : undefined;
      await ecrireReglages({ [x.cle]: ecrireTexte(frais, x.chemin, texte) });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["reglages"] });
      void qc.invalidateQueries({ queryKey: ["reglages-journal"] });
    },
  });
  const id = `texte-${x.id}`;
  const inconnues = variablesInconnues(texte, x.variables);
  const change = texte !== (valeur ?? "");
  return (
    <div className="space-y-1.5" data-texte={x.id}>
      <label htmlFor={id} className="flex flex-wrap items-center gap-2 text-sm font-medium">
        {t(`autoOnglets.textes.items.${x.id}`)}
        <code className="text-[11px] font-normal text-muted-foreground">
          {x.cle}
          {x.chemin ? `.${x.chemin}` : ""}
        </code>
        {valeur === null && <Badge variant="warning">{t("autoOnglets.textes.absent")}</Badge>}
      </label>
      <Textarea id={id} value={texte} readOnly={!admin} rows={3} onChange={(e) => setTexte(e.target.value)} />
      {x.variables.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {t("reglagesOs.variables", { liste: x.variables.map((v) => `{${v}}`).join(" ") })}
        </p>
      )}
      {inconnues.length > 0 && (
        <p className="text-xs text-destructive">{t("reglagesOs.inconnues", { liste: inconnues.map((v) => `{${v}}`).join(" ") })}</p>
      )}
      {texte.trim() && (
        <div className="space-y-0.5">
          <p className="text-[11px] font-medium text-muted-foreground">{t("reglagesOs.apercu")}</p>
          <pre className="whitespace-pre-wrap rounded-md border bg-muted/40 p-2 text-xs" data-testid={`apercu-${x.id}`}>
            {remplirVariables(texte, vars)}
          </pre>
        </div>
      )}
      {admin && (change || enregistrer.isSuccess || enregistrer.error) && (
        <div className="flex flex-wrap items-center gap-2">
          {change && (
            <Button size="sm" disabled={enregistrer.isPending || (!texte.trim() && !x.videPermis)} onClick={() => enregistrer.mutate()}>
              {t("common.save")}
            </Button>
          )}
          {change && (
            <Button size="sm" variant="ghost" onClick={() => setTexte(valeur ?? "")}>
              {t("common.cancel")}
            </Button>
          )}
          {!change && enregistrer.isSuccess && <span className="text-xs text-muted-foreground">{t("reglagesOs.enregistre")}</span>}
          {enregistrer.error ? <span className="text-xs text-destructive">{(enregistrer.error as Error).message}</span> : null}
        </div>
      )}
    </div>
  );
}
