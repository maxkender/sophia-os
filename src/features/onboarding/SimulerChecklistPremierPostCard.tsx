import * as React from "react";
import { useTranslation } from "react-i18next";
import { ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { ChecklistPremierPostDialog } from "./ChecklistPremierPost";

/**
 * Aperçu admin (Tests) : la checklist que voit un posteur tout nouveau en
 * ouvrant son premier post. Rien n'est retenu, la croix permet d'en sortir.
 */
export function SimulerChecklistPremierPostCard() {
  const { t } = useTranslation();
  const [ouvert, setOuvert] = React.useState(false);

  return (
    <>
      <Card className="border-primary/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="size-4 text-primary" />
            {t("tests.premierPostTitre")}
          </CardTitle>
          <CardDescription>{t("tests.premierPostDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => setOuvert(true)}>
            <ShieldAlert />
            {t("tests.premierPostOuvrir")}
          </Button>
        </CardContent>
      </Card>

      {ouvert && <ChecklistPremierPostDialog simulation onTermine={() => setOuvert(false)} />}
    </>
  );
}
