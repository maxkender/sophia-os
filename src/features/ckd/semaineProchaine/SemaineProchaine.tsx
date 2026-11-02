import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { AlertCircle, Check, Circle, Copy } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarreChargement } from "@/components/ui/progress";
import { ActionsPosteur } from "@/features/ckd/cohorte/ActionsPosteur";
import { libelleCohorte, paireDuJour } from "@/features/ckd/cohorte/logique";
import { aujourdhuiParis } from "@/features/moteur/cohortes";
import { nomsHms } from "@/features/paie/api";
import { localeDate } from "@/locales/localeDate";
import { cn } from "@/lib/utils";

import { lireSemaineProchaine, type CompteSemaine } from "./api";
import { etatSemaine, phrasePosteur, prenom, type Etape, type EtatSemaine } from "./logique";

/** Les couleurs des étapes : les mêmes que le calendrier (vert fait, gris à faire, rouge en retard). */
const COULEUR = {
  fait: "border-success/40 bg-success/15 text-success-foreground",
  a_faire: "border-border bg-muted/40 text-muted-foreground",
  en_retard: "border-destructive/40 bg-destructive/12 text-destructive-foreground",
} as const;

function IconeEtape({ e }: { e: Etape }) {
  if (e.statut === "fait") return <Check className="size-3.5" aria-hidden />;
  if (e.statut === "en_retard") return <AlertCircle className="size-3.5" aria-hidden />;
  return <Circle className="size-3" aria-hidden />;
}

/** Les 6 étapes en frise : une colonne par étape, sur 2 ou 3 colonnes sur mobile. */
function Frise({ etat }: { etat: EtatSemaine }) {
  const { t, i18n } = useTranslation();
  const fmt = new Intl.DateTimeFormat(localeDate(i18n.resolvedLanguage ?? "fr"), {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  return (
    <ol className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-6">
      {etat.etapes.map((e) => {
        const detail =
          e.cle === "warmup" && etat.follows !== null
            ? t("accueilHm.followsLikes", { follows: etat.follows, likes: etat.likes ?? 0 })
            : e.cle === "exigences" && e.statut !== "fait"
              ? `${etat.follows ?? 0}/5`
              : null;
        return (
          <li
            key={e.cle}
            data-etape={e.cle}
            data-statut={e.statut}
            className={cn("min-w-0 rounded-md border px-2 py-1.5 text-xs", COULEUR[e.statut])}
          >
            <p className="flex items-start gap-1 font-medium leading-tight">
              <span className="mt-px shrink-0">
                <IconeEtape e={e} />
              </span>
              <span className="min-w-0">{t(`accueilHm.prochaine.etapes.${e.cle}`)}</span>
            </p>
            <p className="mt-0.5 opacity-90">
              {e.statut === "fait"
                ? e.le
                  ? t("accueilHm.prochaine.statuts.fait", { date: fmt.format(new Date(`${e.le}T12:00:00Z`)) })
                  : t("accueilHm.prochaine.statuts.fait_sans_date")
                : t(`accueilHm.prochaine.statuts.${e.statut}`)}
            </p>
            {detail && <p className="opacity-90">{detail}</p>}
          </li>
        );
      })}
    </ol>
  );
}

function Phrase({ texte }: { texte: string }) {
  const { t } = useTranslation();
  const [copie, setCopie] = React.useState(false);
  return (
    <div className="flex flex-col gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 sm:flex-row sm:items-start">
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {t("accueilHm.prochaine.phrase")}
        </p>
        <p className="text-sm" data-testid="phrase-posteur">
          {texte}
        </p>
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="shrink-0 self-end sm:self-start"
        onClick={() => {
          void navigator.clipboard?.writeText(texte).then(() => setCopie(true));
        }}
      >
        <Copy className="size-3.5" />
        {copie ? t("accueilHm.prochaine.copie") : t("accueilHm.prochaine.copier")}
      </Button>
    </div>
  );
}

/**
 * « Semaine prochaine » (0371) : les comptes qui démarrent lundi, recréés et
 * 2ᵉ comptes compris, chacun avec sa frise de 6 étapes (faite et sa date, à
 * faire, ou en retard en rouge) et, s'il est en retard, la phrase à envoyer au
 * posteur. `hm` : la HM choisie par l'admin ou le Head of Ops ("" = toutes).
 */
export function SemaineProchaine({ hm = "" }: { hm?: string }) {
  const { t } = useTranslation();
  const aujourdhui = aujourdhuiParis();
  const lundi = paireDuJour(aujourdhui).warmup;

  const donnees = useQuery({
    queryKey: ["accueil-hm", "semaine-prochaine", lundi],
    queryFn: async () => {
      const comptes = await lireSemaineProchaine(lundi);
      return { comptes, noms: await nomsHms([...new Set(comptes.map((c) => c.poster_id))]) };
    },
  });
  const nom = (c: CompteSemaine) => donnees.data?.noms.get(c.poster_id) ?? "—";
  const lignes = (donnees.data?.comptes ?? [])
    // Un posteur désactivé est dans l'Archive.
    .filter((c) => c.is_active && (!hm || c.hm_id === hm))
    .map((c) => ({ c, etat: etatSemaine(c, lundi, aujourdhui) }))
    // En retard d'abord, puis pas prêts, puis par nom.
    .sort(
      (a, b) =>
        Number(Boolean(b.etat.retard)) - Number(Boolean(a.etat.retard)) ||
        Number(a.etat.pret) - Number(b.etat.pret) ||
        nom(a.c).localeCompare(nom(b.c)),
    );
  const prets = lignes.filter((l) => l.etat.pret).length;
  const enRetard = lignes.filter((l) => l.etat.retard).length;

  return (
    <Card data-testid="semaine-prochaine">
      <CardHeader>
        <CardTitle>
          {t("accueilHm.semaineProchaine")} · {libelleCohorte(lundi)}
        </CardTitle>
        {lignes.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1 text-xs tabular-nums">
            <span className="rounded-full border px-2.5 py-0.5 text-muted-foreground">
              {t("accueilHm.resume.posteurs", { count: lignes.length })}
            </span>
            <span className="rounded-full border border-success/40 bg-success/8 px-2.5 py-0.5 text-success-foreground">
              {t("accueilHm.prochaine.resume.prets", { count: prets })}
            </span>
            {enRetard > 0 && (
              <span className="rounded-full border border-destructive/40 bg-destructive/8 px-2.5 py-0.5 text-destructive-foreground">
                {t("accueilHm.prochaine.resume.enRetard", { n: enRetard })}
              </span>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {donnees.isLoading && <BarreChargement actif />}
        {donnees.error && <p className="text-sm text-destructive">{(donnees.error as Error).message}</p>}
        {donnees.data && lignes.length === 0 && <p className="text-sm text-muted-foreground">{t("accueilHm.vide")}</p>}
        {lignes.length > 0 && (
          <ul className="divide-y rounded-xl border">
            {lignes.map(({ c, etat }) => {
              const phrase = phrasePosteur(etat, { prenom: prenom(nom(c)), handle: c.handle });
              return (
                <li key={c.compte_id} className="space-y-2 p-3" data-compte={c.handle ?? c.compte_id}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-1.5">
                        <span className="font-medium">{nom(c)}</span>
                        {c.type !== "premier" && (
                          <Badge variant={c.type === "recree" ? "warning" : "info"}>
                            {t(`accueilHm.prochaine.types.${c.type}`)}
                          </Badge>
                        )}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {c.handle ? (
                          <a
                            href={`https://www.tiktok.com/@${c.handle}`}
                            target="_blank"
                            rel="noreferrer"
                            className="underline-offset-2 hover:text-primary hover:underline"
                          >
                            @{c.handle}
                          </a>
                        ) : (
                          "—"
                        )}
                        {c.pays && ` · ${c.pays}`}
                        {c.type === "recree" &&
                          c.ancien_handle &&
                          ` · ${t("accueilHm.prochaine.remplace", { handle: c.ancien_handle })}`}
                      </p>
                    </div>
                    <ActionsPosteur
                      posteurId={c.poster_id}
                      nom={nom(c)}
                      compteId={c.compte_id}
                      warmupLance={Boolean(c.warmup_lance_le)}
                      aPublie={false}
                    />
                  </div>
                  <Frise etat={etat} />
                  {phrase && <Phrase texte={phrase} />}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
