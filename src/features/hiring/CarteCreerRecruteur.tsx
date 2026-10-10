import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { nomLangue } from "@/features/moteur/langues";
import { creerRecruteur, listerLanguesReference } from "@/features/moteur/api";

/**
 * Création d'un recruteur, partagée entre l'espace du DM et celui du HM.
 *
 * Un seul exemplaire du formulaire : le DM et le HM créent le même objet, avec
 * les mêmes champs et le même appel. Les dupliquer, c'était s'exposer à ce
 * qu'une correction n'atterrisse que d'un côté.
 *
 * CE N'EST PAS LA FRONTIÈRE DE SÉCURITÉ. Qui a le droit de créer un recruteur
 * se décide dans `manage-users` (`peutCreerHm`), qui plafonne le rôle demandé à
 * `hiring_manager`. Masquer cette carte ne protège rien, et l'afficher
 * n'accorde rien.
 *
 * `prefixeId` évite deux champs de même `id` si la page affichait un jour deux
 * formulaires.
 */
export function CarteCreerRecruteur({ prefixeId = "hm" }: { prefixeId?: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const langues = useQuery({ queryKey: ["langues-reference"], queryFn: listerLanguesReference });

  const [prenom, setPrenom] = React.useState("");
  const [nom, setNom] = React.useState("");
  const [recLangues, setRecLangues] = React.useState<string[]>([]);
  const [cree, setCree] = React.useState<{ email: string } | null>(null);

  const basculerLangue = (l: string) =>
    setRecLangues((prev) => (prev.includes(l) ? prev.filter((x) => x !== l) : [...prev, l]));

  const creer = useMutation({
    mutationFn: () => creerRecruteur({ prenom, nom, langues: recLangues }),
    onSuccess: (r) => {
      setCree({ email: r.email });
      setPrenom("");
      setNom("");
      setRecLangues([]);
      void queryClient.invalidateQueries({ queryKey: ["posters"] });
    },
  });

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserPlus className="size-4" />
          {t("hiring.creerHm")}
        </CardTitle>
        <CardDescription>{t("hiring.creerHmDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setCree(null);
            creer.mutate();
          }}
          className="grid gap-4 sm:grid-cols-2"
        >
          <div className="space-y-2">
            <Label htmlFor={`${prefixeId}Prenom`}>{t("posters.prenom")}</Label>
            <Input
              id={`${prefixeId}Prenom`}
              required
              value={prenom}
              onChange={(e) => setPrenom(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${prefixeId}Nom`}>{t("posters.nom")}</Label>
            <Input id={`${prefixeId}Nom`} value={nom} onChange={(e) => setNom(e.target.value)} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>{t("posters.languesRecruteur")}</Label>
            <div className="flex flex-wrap gap-1.5">
              {(langues.data ?? []).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => basculerLangue(l)}
                  className={
                    recLangues.includes(l)
                      ? "rounded-full bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground"
                      : "rounded-full border px-2.5 py-1 text-xs hover:bg-muted"
                  }
                >
                  {nomLangue(l)}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{t("posters.languesRecruteurAide")}</p>
          </div>
          <div className="sm:col-span-2">
            <Button
              type="submit"
              disabled={creer.isPending || !prenom.trim() || recLangues.length === 0}
            >
              {creer.isPending ? t("common.saving") : t("hiring.creerHm")}
            </Button>
            {creer.isError && (
              <p className="mt-2 text-sm text-destructive">{(creer.error as Error).message}</p>
            )}
            {cree && (
              <p className="mt-2 text-sm text-success">
                {t("posters.done")} — <code className="rounded bg-muted px-1">{cree.email}</code> ·{" "}
                <code className="rounded bg-muted px-1">12345678</code>
              </p>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
