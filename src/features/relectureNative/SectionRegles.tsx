import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { CheckCircle2, ScrollText, Sparkles, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Replie } from "@/components/ui/replie";
import { Textarea } from "@/components/ui/textarea";
import { messageErreur } from "@/features/bleo/format";
import { drapeauLangue, nomLangue } from "@/features/moteur/langues";

import { listerRelecteurs } from "./api";
import { CLE_CORRECTIONS } from "./SectionCorrections";
import {
  consoliderRegles,
  idsCorrectionsRetenues,
  listerRegles,
  rejeterRegles,
  validerRegles,
  type VersionRegles,
} from "./apiRegles";

export const CLE_REGLES = ["regles-natives"] as const;

const selectClass =
  "h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

function dateCourte(iso: string, langue: string) {
  return new Date(iso).toLocaleDateString(langue.startsWith("en") ? "en-GB" : "fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

/** Le texte des règles, tel que la traduction le reçoit. */
function TexteRegles({ contenu, testId }: { contenu: string; testId: string }) {
  return (
    <pre className="max-h-[32rem] overflow-auto rounded-md bg-muted/40 p-3 font-mono text-xs whitespace-pre-wrap" data-testid={testId}>
      {contenu}
    </pre>
  );
}

/** La version proposée : relire, retoucher, valider ou rejeter. */
function VersionProposee({ v, onFait }: { v: VersionRegles; onFait: () => void }) {
  const { t, i18n } = useTranslation();
  const [texte, setTexte] = React.useState(v.contenu);
  React.useEffect(() => setTexte(v.contenu), [v.id, v.contenu]);
  const modifie = texte.trim() !== v.contenu.trim();
  const valider = useMutation({ mutationFn: () => validerRegles(v.id, modifie ? texte : undefined), onSuccess: onFait });
  const rejeter = useMutation({ mutationFn: () => rejeterRegles(v.id), onSuccess: onFait });
  const erreur = valider.error ?? rejeter.error;

  return (
    <div className="space-y-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4" data-testid="regles-proposee">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{t("relectureNative.regles.proposee", { version: v.version })}</Badge>
        <span className="text-xs text-muted-foreground">
          {t("relectureNative.regles.meta", { date: dateCourte(v.created_at, i18n.language), n: v.corrections_ids.length })}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{t("relectureNative.regles.aideProposee")}</p>
      <Textarea
        aria-label={t("relectureNative.regles.texte")}
        className="min-h-[24rem] font-mono text-xs"
        value={texte}
        onChange={(e) => setTexte(e.target.value)}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={valider.isPending || rejeter.isPending || !texte.trim()} onClick={() => valider.mutate()}>
          <CheckCircle2 />
          {modifie ? t("relectureNative.regles.validerModifiee") : t("relectureNative.regles.valider")}
        </Button>
        {modifie && (
          <Button size="sm" variant="ghost" onClick={() => setTexte(v.contenu)}>
            {t("relectureNative.regles.annulerModifs")}
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="text-destructive"
          disabled={valider.isPending || rejeter.isPending}
          onClick={() => {
            if (window.confirm(t("relectureNative.regles.confirmerRejet", { version: v.version }))) rejeter.mutate();
          }}
        >
          <XCircle />
          {t("relectureNative.regles.rejeter")}
        </Button>
        {erreur && (
          <span role="alert" className="text-xs text-destructive">
            {messageErreur(erreur)}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Relecture native → Règles : par langue, les corrections retenues
 * consolidées en règles (Gemini, le lundi ou au bouton). Une version proposée
 * attend la validation ; la version validée est celle que la traduction de
 * production reçoit, suivie des corrections retenues qu'elle ne couvre pas
 * encore.
 */
export function SectionRegles() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const relecteurs = useQuery({ queryKey: ["relecteurs-natifs"], queryFn: listerRelecteurs });
  const langues = React.useMemo(
    () => [...new Set((relecteurs.data ?? []).map((r) => r.langue.toLowerCase()))].sort(),
    [relecteurs.data],
  );
  const [langueChoisie, setLangueChoisie] = React.useState<string | null>(null);
  const langue = langueChoisie && langues.includes(langueChoisie) ? langueChoisie : (langues[0] ?? null);
  const [bilan, setBilan] = React.useState<string | null>(null);

  const versions = useQuery({ queryKey: [...CLE_REGLES, langue], queryFn: () => listerRegles(langue!), enabled: Boolean(langue) });
  const retenues = useQuery({
    queryKey: [...CLE_REGLES, "retenues", langue],
    queryFn: () => idsCorrectionsRetenues(langue!),
    enabled: Boolean(langue),
  });
  const rafraichir = () => {
    void qc.invalidateQueries({ queryKey: CLE_REGLES });
    void qc.invalidateQueries({ queryKey: CLE_CORRECTIONS });
  };

  const toutes = versions.data ?? [];
  const validee = toutes.find((v) => v.statut === "validee") ?? null;
  const proposee = toutes.find((v) => v.statut === "proposee") ?? null;
  const anciennes = toutes.filter((v) => v.statut === "remplacee" || v.statut === "rejetee");
  const couvertes = new Set(validee?.corrections_ids ?? []);
  const horsRegles = (retenues.data ?? []).filter((id) => !couvertes.has(id)).length;

  const consolider = useMutation({
    mutationFn: () => consoliderRegles(langue!, Boolean(proposee)),
    onSuccess: (b) => {
      const faite = b.faites[0];
      const raison = b.echecs[0]?.raison ?? b.sautees[0]?.raison;
      setBilan(
        faite
          ? t("relectureNative.regles.consolidee", { version: faite.version, n: faite.nouvelles })
          : t("relectureNative.regles.pasConsolidee", { raison: raison ?? "?" }),
      );
      rafraichir();
    },
  });
  const erreur = relecteurs.error ?? versions.error ?? retenues.error ?? consolider.error;

  return (
    <div className="space-y-4" data-testid="section-regles">
      <div className="space-y-1">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <ScrollText className="size-4 text-muted-foreground" aria-hidden />
          {t("relectureNative.regles.titre")}
        </h2>
        <p className="text-xs text-muted-foreground">{t("relectureNative.regles.aide")}</p>
      </div>
      {erreur && (
        <p role="alert" className="text-sm text-destructive">
          {messageErreur(erreur)}
        </p>
      )}
      {relecteurs.isPending ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : langues.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("relectureNative.corrections.aucuneLangue")}</p>
      ) : (
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="reglesLangue">{t("relectureNative.corrections.langue")}</Label>
            <select id="reglesLangue" className={selectClass} value={langue ?? ""} onChange={(e) => setLangueChoisie(e.target.value)}>
              {langues.map((l) => (
                <option key={l} value={l}>
                  {drapeauLangue(l)} {nomLangue(l)}
                </option>
              ))}
            </select>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={consolider.isPending || !langue || horsRegles === 0}
            onClick={() => {
              if (!proposee || window.confirm(t("relectureNative.regles.confirmerRemplacer", { version: proposee.version }))) consolider.mutate();
            }}
          >
            <Sparkles />
            {consolider.isPending ? t("relectureNative.regles.consolidation") : t("relectureNative.regles.consolider", { count: horsRegles })}
          </Button>
        </div>
      )}
      {bilan && <p className="text-xs">{bilan}</p>}

      {langue && !versions.isPending && (
        <>
          <p className="text-xs text-muted-foreground" data-testid="regles-etat">
            {validee
              ? t("relectureNative.regles.etatValidee", {
                  version: validee.version,
                  date: dateCourte(validee.valide_le ?? validee.created_at, i18n.language),
                  couvertes: validee.corrections_ids.length,
                  hors: horsRegles,
                })
              : t("relectureNative.regles.etatAucune", { hors: horsRegles })}
          </p>

          {proposee && <VersionProposee v={proposee} onFait={rafraichir} />}

          {validee ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge>{t("relectureNative.regles.validee", { version: validee.version })}</Badge>
                <span className="text-xs text-muted-foreground">{t("relectureNative.regles.enProduction")}</span>
              </div>
              <TexteRegles contenu={validee.contenu} testId="regles-validee" />
            </div>
          ) : (
            !proposee && <p className="text-sm text-muted-foreground">{t("relectureNative.regles.aucune", { langue: nomLangue(langue) })}</p>
          )}

          {anciennes.length > 0 && (
            <Replie titre={t("relectureNative.regles.historique", { n: anciennes.length })}>
              <ul className="space-y-3">
                {anciennes.map((v) => (
                  <li key={v.id} className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                      {t(`relectureNative.regles.statut.${v.statut}`, { version: v.version })} · {dateCourte(v.created_at, i18n.language)}
                    </p>
                    <TexteRegles contenu={v.contenu} testId={`regles-v${v.version}`} />
                  </li>
                ))}
              </ul>
            </Replie>
          )}
        </>
      )}
    </div>
  );
}
