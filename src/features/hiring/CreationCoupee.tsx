import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

import { lienMaCohorte, trouverPosteur } from "./creationCoupee";

/**
 * 1/11 : à la place du formulaire « Create a poster », pour une HM : l'OS crée
 * le posteur et envoie le welcome quand l'offre est acceptée. Un lien de
 * contrat ou un nom → « My cohort » pointe sur le posteur qui existe déjà.
 */
export function CreationCoupee() {
  const { t } = useTranslation();
  const [texte, setTexte] = React.useState("");
  const [cherche, setCherche] = React.useState("");
  const trouves = useQuery({
    queryKey: ["hm-trouver-posteur", cherche],
    queryFn: () => trouverPosteur(cherche),
    enabled: cherche.trim().length >= 3,
  });
  return (
    <Card data-testid="creation-coupee" className="max-w-2xl">
      <CardHeader>
        <CardTitle className="text-base">{t("hiring.creationCoupee.titre")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p data-testid="creation-coupee-message">{t("hiring.creationCoupee.message")}</p>
        <Button size="sm" render={<Link to={lienMaCohorte()} />}>{t("accueilHm.nav")}</Button>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setCherche(texte.trim());
          }}
        >
          <label className="grid flex-1 gap-1">
            <span className="text-xs text-muted-foreground">{t("hiring.creationCoupee.chercher")}</span>
            <Input value={texte} onChange={(e) => setTexte(e.target.value)} placeholder="https://www.upwork.com/nx/wm/workroom/…" />
          </label>
          <Button size="sm" variant="outline" type="submit" disabled={texte.trim().length < 3}>{t("hiring.creationCoupee.trouver")}</Button>
        </form>
        {trouves.error && <p className="text-destructive">{(trouves.error as Error).message}</p>}
        {trouves.data && trouves.data.length === 0 && <p className="text-muted-foreground">{t("hiring.creationCoupee.aucun")}</p>}
        {trouves.data && trouves.data.length > 0 && (
          <ul className="divide-y rounded-md border" data-testid="posteurs-trouves">
            {trouves.data.map((p) => (
              <li key={p.poster_id} className="flex flex-wrap items-center gap-2 p-2">
                <span className="font-medium">{p.nom ?? "—"}</span>
                <span className="text-xs text-muted-foreground">{t("hiring.creationCoupee.ligne", { cohorte: p.cohorte_lundi ?? "—", hm: p.hm_nom ?? "—" })}</span>
                <Link className="ml-auto text-primary underline" to={lienMaCohorte(p.poster_id)}>{t("accueilHm.nav")}</Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
