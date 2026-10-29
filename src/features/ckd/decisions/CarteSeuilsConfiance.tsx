import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

import { enregistrerSeuilsConfiance, lireSeuilsConfiance } from "./statutCompte";

const P = "autoOnglets.decisions.liste.statut.seuils";

/**
 * Prompt 14 : les seuils « De confiance » de la masterlist du samedi, réglables
 * dans Weekly decisions → Settings (semaines d'affilée et posts avec lien par semaine).
 */
export function CarteSeuilsConfiance() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const lu = useQuery({ queryKey: ["masterlist-seuils"], queryFn: lireSeuilsConfiance });
  const [semaines, setSemaines] = React.useState("");
  const [posts, setPosts] = React.useState("");
  React.useEffect(() => {
    if (lu.data) {
      setSemaines(String(lu.data.semaines));
      setPosts(String(lu.data.posts));
    }
  }, [lu.data]);
  const enregistrer = useMutation({
    mutationFn: () => enregistrerSeuilsConfiance({ semaines: Number(semaines), posts: Number(posts) }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["masterlist-seuils"] }),
  });
  const valide = Number.isInteger(Number(semaines)) && Number(semaines) >= 1 && Number.isInteger(Number(posts)) && Number(posts) >= 1;
  const change = lu.data && (Number(semaines) !== lu.data.semaines || Number(posts) !== lu.data.posts);
  return (
    <Card data-testid="carte-seuils-confiance">
      <CardHeader>
        <CardTitle className="text-base">{t(`${P}.titre`)}</CardTitle>
        <CardDescription>{t(`${P}.aide`)}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-end gap-4 text-sm">
        <label className="space-y-1">
          <span className="block text-xs text-muted-foreground">{t(`${P}.semaines`)}</span>
          <Input type="number" min={1} className="w-24" value={semaines} onChange={(e) => setSemaines(e.target.value)} aria-label={t(`${P}.semaines`)} />
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-muted-foreground">{t(`${P}.posts`)}</span>
          <Input type="number" min={1} className="w-24" value={posts} onChange={(e) => setPosts(e.target.value)} aria-label={t(`${P}.posts`)} />
        </label>
        <Button size="sm" disabled={!valide || !change || enregistrer.isPending} onClick={() => enregistrer.mutate()}>
          {t("common.save")}
        </Button>
        {enregistrer.error && <p className="text-xs text-destructive">{(enregistrer.error as Error).message}</p>}
        {lu.error && <p className="text-xs text-destructive">{(lu.error as Error).message}</p>}
      </CardContent>
    </Card>
  );
}
