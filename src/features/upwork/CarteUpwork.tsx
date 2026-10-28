import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { Link2, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { localeDate } from "@/locales/localeDate";

import { diagnosticUpwork, lienConnexionUpwork, lireEtatUpwork } from "./api";

/**
 * Réglages → Upwork (prompt 14, point 1) : l'état de la connexion, le dernier
 * appel, les organisations vues et les droits constatés ; « Connecter » ou
 * « Reconnecter » ouvre la page d'autorisation d'Upwork. Admin seulement.
 */
export function CarteUpwork() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const etat = useQuery({ queryKey: ["upwork", "etat"], queryFn: lireEtatUpwork });
  const connecter = useMutation({
    mutationFn: lienConnexionUpwork,
    onSuccess: (url) => {
      window.location.assign(url);
    },
  });
  const diagnostic = useMutation({
    mutationFn: diagnosticUpwork,
    onSettled: () => qc.invalidateQueries({ queryKey: ["upwork"] }),
  });
  const fmt = new Intl.DateTimeFormat(localeDate(i18n.resolvedLanguage ?? "fr"), {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Paris",
  });
  const date = (iso: string | null) => (iso ? fmt.format(new Date(iso)) : "—");
  const c = etat.data?.[0];
  const retour = params.get("upwork");
  const variante = c?.statut === "connecte" ? "success" : c?.statut === "erreur" ? "error" : "secondary";

  return (
    <Card id="upwork" data-testid="carte-upwork">
      <CardHeader>
        <CardTitle>{t("upwork.titre")}</CardTitle>
        <CardDescription>{t("upwork.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {retour === "ok" && <p className="rounded-md bg-success/10 px-3 py-2">{t("upwork.retourOk")}</p>}
        {retour === "erreur" && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-destructive">
            {t("upwork.retourErreur", { raison: params.get("raison") ?? "" })}
          </p>
        )}
        {etat.error && <p className="text-destructive">{(etat.error as Error).message}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={variante}>{t(`upwork.statuts.${c?.statut ?? "deconnecte"}`)}</Badge>
          {c?.connecte_at && (
            <span className="text-muted-foreground">
              {t("upwork.connectePar", { nom: c.connecte_par_nom ?? "—", date: date(c.connecte_at) })}
            </span>
          )}
        </div>
        {c && (
          <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[max-content_1fr]">
            <dt className="text-muted-foreground">{t("upwork.dernierAppel")}</dt>
            <dd>{date(c.dernier_appel_at)}</dd>
            <dt className="text-muted-foreground">{t("upwork.appels24h")}</dt>
            <dd>{t("upwork.appelsValeur", { n: c.appels_24h, erreurs: c.erreurs_24h })}</dd>
            <dt className="text-muted-foreground">{t("upwork.organisations")}</dt>
            <dd>{c.organisations?.length ? c.organisations.map((o) => o.title).join(" · ") : "—"}</dd>
            <dt className="text-muted-foreground">{t("upwork.schema")}</dt>
            <dd>
              {c.droits?.schema_lu
                ? t("upwork.schemaLu", { requetes: c.droits.requetes?.length ?? 0, mutations: c.droits.mutations?.length ?? 0 })
                : (c.droits?.schema_erreur ?? "—")}
            </dd>
            {c.droits?.scope_jeton && (
              <>
                <dt className="text-muted-foreground">{t("upwork.scope")}</dt>
                <dd className="break-words">{c.droits.scope_jeton}</dd>
              </>
            )}
          </dl>
        )}
        {c?.derniere_erreur && <p className="text-destructive">{c.derniere_erreur}</p>}
        <div className="flex flex-wrap gap-2">
          <Button disabled={connecter.isPending} onClick={() => connecter.mutate()}>
            <Link2 className="size-4" />
            {c?.statut === "connecte" || c?.statut === "erreur" ? t("upwork.reconnecter") : t("upwork.connecter")}
          </Button>
          {c?.statut && c.statut !== "deconnecte" && (
            <Button variant="outline" disabled={diagnostic.isPending} onClick={() => diagnostic.mutate()}>
              <RefreshCw className={diagnostic.isPending ? "size-4 animate-spin" : "size-4"} />
              {t("upwork.diagnostic")}
            </Button>
          )}
        </div>
        {(connecter.error || diagnostic.error) && (
          <p className="text-destructive">{((connecter.error ?? diagnostic.error) as Error).message}</p>
        )}
      </CardContent>
    </Card>
  );
}
