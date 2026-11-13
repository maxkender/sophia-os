import * as React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Replie } from "@/components/ui/replie";
import { drapeauLangue, LANGUES_CIBLES, nomLangue } from "@/features/moteur/langues";
import { messageErreur } from "@/features/bleo/format";

import { BandeauBoucle } from "@/features/relectureNative/BandeauBoucle";
import { blocCorrectionsNatives } from "@/features/relectureNative/apiCorrections";

import { compterComptesParLangue, compterCorrectionsRetenuesParLangue, compterRelecteursParLangue, listerPromptsMeta } from "./api";
import { EditeurPrompt } from "./EditeurPrompt";
import { lignesLangues, type LigneLangue, type SourcePrompt } from "./logique";

export const CLE_PROMPTS_META = ["prompts-meta", "traduction"] as const;

const VARIANTE_SOURCE: Record<SourcePrompt, "success" | "info" | "outline"> = {
  dedie: "success",
  generique: "info",
  neutre: "outline",
};

function formaterDate(iso: string | null, locale: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(locale.startsWith("en") ? "en-GB" : "fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/**
 * La traduction, langue par langue : à gauche la liste des langues cibles
 * (comptes actifs, relecteurs, d'où vient le prompt), à droite le prompt que
 * la traduction lit pour la langue choisie, et la localisation scolaire
 * commune en bas. Même règle que le moteur : prompt dédié, sinon le générique
 * pour le français, sinon les règles neutres du code.
 */
export function SectionLangues({ langue, onLangue }: { langue: string | null; onLangue: (code: string) => void }) {
  const { t, i18n } = useTranslation();
  const [recherche, setRecherche] = React.useState("");
  const prompts = useQuery({ queryKey: CLE_PROMPTS_META, queryFn: () => listerPromptsMeta("traduction") });
  const comptes = useQuery({ queryKey: ["chaine", "comptes-par-langue"], queryFn: compterComptesParLangue });
  const relecteurs = useQuery({ queryKey: ["chaine", "relecteurs-par-langue"], queryFn: compterRelecteursParLangue });
  const corrections = useQuery({ queryKey: ["corrections-natives", "retenues-par-langue"], queryFn: compterCorrectionsRetenuesParLangue });

  const lignes = React.useMemo(
    () => lignesLangues(LANGUES_CIBLES, nomLangue, comptes.data ?? {}, relecteurs.data ?? {}, prompts.data ?? [], recherche),
    [comptes.data, relecteurs.data, prompts.data, recherche],
  );
  const toutes = React.useMemo(
    () => lignesLangues(LANGUES_CIBLES, nomLangue, comptes.data ?? {}, relecteurs.data ?? {}, prompts.data ?? []),
    [comptes.data, relecteurs.data, prompts.data],
  );
  const choisie: LigneLangue | null = toutes.find((l) => l.code === langue) ?? toutes[0] ?? null;
  const bloc = useQuery({
    queryKey: ["corrections-natives", "bloc", choisie?.code],
    queryFn: () => blocCorrectionsNatives(choisie!.code),
    enabled: Boolean(choisie),
  });
  const nCorrections = choisie ? (corrections.data?.[choisie.code.toLowerCase()] ?? 0) : 0;
  const erreur = prompts.error ?? comptes.error ?? relecteurs.error;
  const nDedies = toutes.filter((l) => l.source === "dedie").length;
  const nNeutres = toutes.filter((l) => l.source === "neutre").length;

  return (
    <div className="space-y-4" data-testid="section-langues">
      <p className="text-xs text-muted-foreground">{t("chaine.langues.aide", { dedies: nDedies, neutres: nNeutres, total: toutes.length })}</p>
      {erreur && (
        <p role="alert" className="text-sm text-destructive">
          {messageErreur(erreur)}
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="space-y-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              aria-label={t("chaine.langues.rechercher")}
              placeholder={t("chaine.langues.rechercher")}
              className="h-8 pl-8 text-xs"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
            />
          </div>
          <ul className="max-h-[70vh] space-y-0.5 overflow-y-auto rounded-md border p-1" data-testid="liste-langues">
            {lignes.map((l) => {
              const active = choisie?.code === l.code;
              return (
                <li key={l.code}>
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => onLangue(l.code)}
                    className={
                      "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors " +
                      (active ? "bg-primary/10 font-medium" : "hover:bg-muted")
                    }
                  >
                    <span aria-hidden>{drapeauLangue(l.code)}</span>
                    <span className="min-w-0 flex-1 truncate">{nomLangue(l.code)}</span>
                    {l.comptes > 0 && (
                      <span className="text-[11px] text-muted-foreground" title={t("chaine.langues.comptes", { count: l.comptes })}>
                        {l.comptes}
                      </span>
                    )}
                    <span
                      className={
                        "size-2 shrink-0 rounded-full " +
                        (l.source === "dedie" ? "bg-success" : l.source === "generique" ? "bg-info" : "border border-muted-foreground/50")
                      }
                      title={t(`chaine.langues.source.${l.source}`)}
                      aria-label={t(`chaine.langues.source.${l.source}`)}
                    />
                  </button>
                </li>
              );
            })}
            {lignes.length === 0 && <li className="px-2 py-1.5 text-xs text-muted-foreground">{t("chaine.langues.aucune")}</li>}
          </ul>
          <p className="px-1 text-[11px] text-muted-foreground">{t("chaine.langues.legende")}</p>
        </aside>

        {prompts.isPending && <p className="text-sm text-muted-foreground">{t("common.loading")}</p>}
        {!prompts.isPending && choisie && (
          <div className="min-w-0 space-y-4" data-testid="panneau-langue" data-langue={choisie.code}>
            <div className="space-y-2 rounded-lg border bg-card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold">
                  <span aria-hidden>{drapeauLangue(choisie.code)}</span> {nomLangue(choisie.code)}
                  <span className="ml-2 font-mono text-xs text-muted-foreground">{choisie.code}</span>
                </h2>
                <Badge variant={VARIANTE_SOURCE[choisie.source]} data-testid="source-prompt">
                  {t(`chaine.langues.source.${choisie.source}`)}
                </Badge>
                {choisie.maj && (
                  <span className="text-xs text-muted-foreground">
                    {t("chaine.langues.maj", { date: formaterDate(choisie.maj, i18n.language), n: choisie.longueur })}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>{t("chaine.langues.comptes", { count: choisie.comptes })}</span>
                <span>
                  {t("chaine.langues.relecteurs", { count: choisie.relecteurs })}{" "}
                  <Link to="/admin/relecture-native" className="underline">
                    {t("chaine.langues.lienRelecture")}
                  </Link>
                </span>
                <span data-testid="corrections-langue">{t("chaine.langues.corrections", { count: nCorrections })}</span>
              </div>
              <p className="text-xs text-muted-foreground">{t(`chaine.langues.explication.${choisie.source}`, { langue: nomLangue(choisie.code), cle: choisie.cle })}</p>
            </div>

            {choisie.relecteurs > 0 && <BandeauBoucle langue={choisie.code} compact />}

            <EditeurPrompt key={choisie.cle} cle={choisie.cle} rows={22} nu />

            <Replie titre={t("chaine.langues.blocTitre")} aide={t("chaine.langues.blocAide")}>
              {bloc.data ? (
                <pre className="max-h-96 overflow-auto rounded-md bg-muted/40 p-3 font-mono text-xs whitespace-pre-wrap">{bloc.data}</pre>
              ) : (
                <p className="text-xs text-muted-foreground">{t("chaine.langues.blocVide")}</p>
              )}
            </Replie>

            <Replie titre={t("prompts.localisationScolaireTitle")} aide={t("prompts.localisationScolaireDesc")}>
              <EditeurPrompt cle="localisation_scolaire" rows={12} nu />
            </Replie>
          </div>
        )}
      </div>
    </div>
  );
}
