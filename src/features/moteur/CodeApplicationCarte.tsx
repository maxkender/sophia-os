import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Copy, ExternalLink, Gift } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  codesDuPoster,
  mesApplications,
  monCodeApplication,
  type CodeApplication,
} from "@/features/moteur/api";

/**
 * Applications pour lesquelles on distribue un code de rachat App Store aux
 * posteurs (0275). Sophia n'en a pas besoin côté posteurs : l'appli est
 * gratuite à installer, et ses codes servent aux créateurs UGC dans le Hub.
 */
export const APPLICATIONS_AVEC_CODE = ["unswipe"] as const;

const NOMS: Record<string, string> = { unswipe: "UnSwipe", sophia: "Sophia" };

/**
 * Carte « Ton code UnSwipe » sur la page d'accueil du posteur. N'apparaît que
 * si un de ses comptes sert l'application. Le code n'est tiré qu'au clic :
 * un code tiré est consommé, on ne le fait pas à l'affichage.
 */
export function CodeApplicationCarte() {
  const { t } = useTranslation();
  const apps = useQuery({ queryKey: ["mes-applications"], queryFn: mesApplications });
  const slugs = (apps.data ?? []).filter((s) =>
    (APPLICATIONS_AVEC_CODE as readonly string[]).includes(s),
  );
  if (slugs.length === 0) return null;
  return (
    <>
      {slugs.map((slug) => <CodePourApplication key={slug} slug={slug} nom={NOMS[slug] ?? slug} t={t} />)}
    </>
  );
}

function CodePourApplication({
  slug,
  nom,
  t,
}: {
  slug: string;
  nom: string;
  t: (cle: string, opts?: Record<string, unknown>) => string;
}) {
  const queryClient = useQueryClient();
  const [copie, setCopie] = React.useState(false);
  const cle = ["mon-code-application", slug];
  // Lecture SANS tirage : on relit le code déjà attribué (RLS : les siens
  // seulement). Le tirage ne se fait qu'au clic, parce qu'un code tiré est
  // consommé.
  const code = useQuery<CodeApplication | null>({
    queryKey: cle,
    queryFn: async () => (await codesDuPoster())[slug] ?? null,
  });
  const tirer = useMutation({
    mutationFn: () => monCodeApplication(slug),
    onSuccess: (c) => queryClient.setQueryData(cle, c),
  });
  const actuel = code.data ?? null;

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-3 pt-5">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Gift className="size-5" />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-semibold">{t("codes.titre", { app: nom })}</p>
          {actuel ? (
            <>
              <p className="font-mono text-lg tracking-wider">{actuel.code}</p>
              <p className="text-xs text-muted-foreground">{t("codes.aide", { app: nom })}</p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{t("codes.corps", { app: nom })}</p>
          )}
          {tirer.isError && (
            <p className="text-sm text-destructive">{(tirer.error as Error).message}</p>
          )}
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          {actuel ? (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  void navigator.clipboard.writeText(actuel.code);
                  setCopie(true);
                  window.setTimeout(() => setCopie(false), 1500);
                }}
              >
                <Copy />
                {copie ? t("codes.copie") : t("codes.copier")}
              </Button>
              <Button asChild>
                <a href={actuel.redeem_url} target="_blank" rel="noreferrer">
                  <ExternalLink />
                  {t("codes.activer")}
                </a>
              </Button>
            </>
          ) : (
            <Button disabled={tirer.isPending} onClick={() => tirer.mutate()}>
              {tirer.isPending ? t("common.loading") : t("codes.obtenir")}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
