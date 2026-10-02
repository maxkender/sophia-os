import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/features/auth/AuthContext";
import { lirePrompt } from "@/features/moteur/api";
import {
  lireEtatBackfillPertinence,
  majApplication,
  piloterBackfillPertinence,
  type ApplicationMulti,
  type EtatBackfillPertinence,
} from "@/features/moteur/apiMultiApp";
import { nomApplication } from "@/features/moteur/applications";
import { LANGUES_CIBLES, nomLangue } from "@/features/moteur/langues";
import { ID_SOPHIA } from "@/features/moteur/multiApp";

import {
  avancementBackfill,
  clesPromptsApplication,
  estErreurSchemaAbsent,
  langueCiblee,
  languesApresBascule,
  promptsManquants,
} from "./logique";
import { optionsRequeteApplications } from "./requetesApplications";

/**
 * Le rattrapage avance par lots côté serveur : relire son état toutes les 10 s
 * suffit à voir bouger le compteur sans marteler l'Edge. À l'arrêt, plus de
 * sondage du tout.
 */
const SONDAGE_BACKFILL_MS = 10_000;

function messageErreur(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

/** Pas de nouvelle tentative sur un schéma absent : la réponse ne changera pas d'ici la seconde suivante. */
function retrySaufSchema(n: number, err: unknown): boolean {
  return n < 1 && !estErreurSchemaAbsent(err);
}

function BackfillPertinence({ application }: { application: ApplicationMulti }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const cle = ["backfill-pertinence", application.id] as const;
  const etat = useQuery({
    queryKey: cle,
    queryFn: () => lireEtatBackfillPertinence(application.id),
    retry: retrySaufSchema,
    refetchInterval: (q) => (q.state.data?.actif ? SONDAGE_BACKFILL_MS : false),
  });
  const piloter = useMutation({
    mutationFn: (actif: boolean) => piloterBackfillPertinence(application.id, actif),
    onSuccess: (suivant: EtatBackfillPertinence) => qc.setQueryData(cle, suivant),
  });
  const e = etat.data;
  const pct = avancementBackfill(e);

  return (
    <div className="space-y-1.5 rounded-md border border-dashed p-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium">{t("multiApp.applications.backfillTitre")}</p>
        <Button
          size="sm"
          variant={e?.actif ? "outline" : "default"}
          disabled={piloter.isPending || etat.isPending || etat.isError}
          onClick={() => piloter.mutate(!e?.actif)}
        >
          {e?.actif ? t("multiApp.applications.backfillPause") : t("multiApp.applications.backfillLancer")}
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {t("multiApp.applications.backfillAide", { nom: nomApplication(application) })}
      </p>
      {e && (
        <>
          {pct !== null && <Progress value={pct} />}
          <p className="text-[11px] tabular-nums text-muted-foreground">
            {t("multiApp.applications.backfillEtat", {
              restants: e.restants,
              faits: e.faits,
              erreurs: e.erreurs,
            })}
            {e.actif ? ` · ${t("multiApp.applications.backfillEnCours")}` : ""}
          </p>
        </>
      )}
      {etat.isError && (
        <p className="text-[11px] text-destructive">
          {estErreurSchemaAbsent(etat.error)
            ? t("multiApp.schemaAbsent")
            : t("multiApp.applications.backfillErreur", { message: messageErreur(etat.error) })}
        </p>
      )}
      {piloter.isError && (
        <p className="text-[11px] text-destructive">{messageErreur(piloter.error)}</p>
      )}
    </div>
  );
}

function LigneApplication({ application }: { application: ApplicationMulti }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const sophia = application.id === ID_SOPHIA;
  const [blocage, setBlocage] = React.useState<string | null>(null);

  const rafraichir = () => qc.invalidateQueries({ queryKey: ["applications"] });

  const maj = useMutation({
    mutationFn: (patch: { langues?: string[] | null; actif?: boolean }) =>
      majApplication(application.id, patch),
    onSuccess: rafraichir,
  });

  // Avant d'activer : les deux prompts de l'application doivent exister et ne
  // pas être vides. Le moteur ne retombe jamais sur le texte Sophia, donc une
  // activation sans eux ferait échouer chaque notation et chaque deck.
  // Même clé que l'éditeur de la page Prompts : un prompt qu'on vient d'y
  // enregistrer est relu frais.
  const activer = useMutation({
    mutationFn: async () => {
      const cles = clesPromptsApplication(application.slug);
      const textes = await Promise.all(
        cles.map((cle) => qc.fetchQuery({ queryKey: ["prompt", cle], queryFn: () => lirePrompt(cle), staleTime: 0 })),
      );
      const manquants = promptsManquants(
        application.slug,
        Object.fromEntries(cles.map((cle, i) => [cle, textes[i]])),
      );
      if (manquants.length > 0) {
        setBlocage(
          t("multiApp.applications.promptsManquants", {
            nom: nomApplication(application),
            cles: manquants.join(", "),
          }),
        );
        return;
      }
      setBlocage(null);
      await majApplication(application.id, { actif: true });
      await rafraichir();
    },
  });

  const basculerActif = (actif: boolean) => {
    if (sophia) return;
    if (actif) activer.mutate();
    else {
      setBlocage(null);
      maj.mutate({ actif: false });
    }
  };

  const enCours = maj.isPending || activer.isPending;
  const erreur = maj.error ?? activer.error;

  return (
    <div className="space-y-2.5 rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">
            {nomApplication(application)}
            <span className="ml-1.5 font-mono text-[11px] text-muted-foreground">{application.slug}</span>
          </p>
          {sophia && (
            <p className="text-[11px] text-muted-foreground">{t("multiApp.applications.sophiaVerrouillee")}</p>
          )}
        </div>
        <label className="flex items-center gap-2 text-xs">
          <Switch
            checked={application.actif}
            disabled={sophia || enCours}
            onCheckedChange={(v) => basculerActif(v === true)}
            aria-label={t("multiApp.applications.actif")}
          />
          {application.actif ? t("multiApp.applications.actif") : t("multiApp.applications.inactif")}
        </label>
      </div>

      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-medium">{t("multiApp.applications.langues")}</p>
          {sophia ? (
            <Badge variant="secondary">{t("multiApp.applications.toutesLangues")}</Badge>
          ) : (
            <>
              <button
                type="button"
                className="text-[11px] text-primary underline-offset-2 hover:underline disabled:opacity-50"
                disabled={enCours || application.langues === null}
                onClick={() => maj.mutate({ langues: null })}
              >
                {t("multiApp.applications.toutes")}
              </button>
              <button
                type="button"
                className="text-[11px] text-primary underline-offset-2 hover:underline disabled:opacity-50"
                disabled={enCours || (application.langues?.length ?? -1) === 0}
                onClick={() => maj.mutate({ langues: [] })}
              >
                {t("multiApp.applications.aucune")}
              </button>
              {application.langues?.length === 0 && (
                <span className="text-[11px] text-amber-700 dark:text-amber-400">
                  {t("multiApp.applications.aucuneLangueAide")}
                </span>
              )}
            </>
          )}
        </div>
        {!sophia && (
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-4 lg:grid-cols-6">
            {LANGUES_CIBLES.map((l) => (
              <label key={l} className="flex items-center gap-1.5 text-[11px]">
                <input
                  type="checkbox"
                  className="size-3.5"
                  checked={langueCiblee(application.langues, l)}
                  disabled={enCours}
                  onChange={() =>
                    maj.mutate({ langues: languesApresBascule(application.langues, l, LANGUES_CIBLES) })
                  }
                />
                {nomLangue(l)}
              </label>
            ))}
          </div>
        )}
      </div>

      {!sophia && <BackfillPertinence application={application} />}

      {blocage && <p className="text-xs text-destructive">{blocage}</p>}
      {erreur && (
        <p className="text-xs text-destructive">
          {estErreurSchemaAbsent(erreur) ? t("multiApp.schemaAbsent") : messageErreur(erreur)}
        </p>
      )}
    </div>
  );
}

/**
 * Pilotage → Applications : une ligne par application (créées par migration,
 * jamais depuis l'écran). Interrupteur, langues ciblées et, hors Sophia, le
 * rattrapage de pertinence du stock existant — à lancer AVANT l'activation,
 * sinon le pool de l'application est vide le premier soir.
 */
export function ApplicationsCard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const apps = useQuery(optionsRequeteApplications(user?.id ?? null));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("multiApp.applications.titre")}</CardTitle>
        <CardDescription>{t("multiApp.applications.desc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {apps.isPending && <p className="text-sm text-muted-foreground">{t("common.loading")}</p>}
        {apps.isError && <p className="text-sm text-destructive">{messageErreur(apps.error)}</p>}
        {(apps.data ?? []).map((a) => (
          <LigneApplication key={a.id} application={a} />
        ))}
        <p className="text-[11px] text-muted-foreground">{t("multiApp.applications.creationParMigration")}</p>
      </CardContent>
    </Card>
  );
}
