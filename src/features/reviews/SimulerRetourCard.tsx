import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { MessageSquareQuote } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listerReviewsExemples } from "@/features/moteur/api";

import { RetourParcours } from "./RetourParcours";
import { localeDate } from "@/locales/localeDate";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

/**
 * Aperçu admin (Tests) : ouvrir un vrai retour déjà envoyé, exactement comme le
 * créateur le reçoit, en mode aperçu : rien n'est marqué comme lu.
 */
export function SimulerRetourCard() {
  const { t, i18n } = useTranslation();
  const exemples = useQuery({ queryKey: ["reviews-exemples"], queryFn: () => listerReviewsExemples() });
  const [choix, setChoix] = React.useState("");
  const [ouvert, setOuvert] = React.useState(false);
  const retour = (exemples.data ?? []).find((r) => r.id === choix) ?? exemples.data?.[0] ?? null;

  return (
    <>
      <Card className="border-primary/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquareQuote className="size-4 text-primary" />
            {t("tests.retourTitre")}
          </CardTitle>
          <CardDescription>{t("tests.retourDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {exemples.isPending && <p className="text-sm text-muted-foreground">{t("common.loading")}</p>}
          {exemples.isError && <p className="text-sm text-destructive">{(exemples.error as Error).message}</p>}
          {exemples.data?.length === 0 && <p className="text-sm text-muted-foreground">{t("tests.retourVide")}</p>}
          {retour && (
            <>
              <select
                aria-label={t("tests.retourChoisir")}
                className={selectClass}
                value={retour.id}
                onChange={(e) => setChoix(e.target.value)}
              >
                {(exemples.data ?? []).map((r) => (
                  <option key={r.id} value={r.id}>
                    {new Date(r.created_at).toLocaleDateString(localeDate(i18n.language), { day: "numeric", month: "short" })}
                    {" · "}
                    {r.compte_label || (r.handle_tiktok ? `@${r.handle_tiktok}` : "—")}
                    {" · "}
                    {r.body.replace(/\s+/g, " ").slice(0, 60)}
                  </option>
                ))}
              </select>
              <Button onClick={() => setOuvert(true)}>
                <MessageSquareQuote />
                {t("tests.retourOuvrir")}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {ouvert && retour && (
        <RetourParcours
          key={retour.id}
          retour={retour}
          mode="apercu"
          onCompris={() => setOuvert(false)}
        />
      )}
    </>
  );
}
