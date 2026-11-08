import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Scissors } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Replie } from "@/components/ui/replie";
import { Segments } from "@/components/ui/segments";
import { Textarea } from "@/components/ui/textarea";
import { drapeauLangue, nomLangue } from "@/features/moteur/langues";
import { messageErreur } from "@/features/bleo/format";

import { listerRelecteurs } from "./api";
import {
  blocCorrectionsNatives,
  compterVotesAExtraire,
  deciderCorrections,
  extraireCorrections,
  listerCorrectionsNatives,
  modifierCorrection,
  supprimerCorrection,
  TYPES_CORRECTION,
  type CorrectionNative,
  type StatutCorrection,
  type TypeCorrection,
} from "./apiCorrections";

type Filtre = StatutCorrection | "toutes";

const selectClass =
  "h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

const VARIANTE_STATUT: Record<StatutCorrection, "warning" | "success" | "outline"> = {
  proposee: "warning",
  retenue: "success",
  ecartee: "outline",
};

export const CLE_CORRECTIONS = ["corrections-natives"] as const;

function dateCourte(iso: string, langue: string) {
  return new Date(iso).toLocaleDateString(langue.startsWith("en") ? "en-GB" : "fr-FR", { day: "numeric", month: "short" });
}

/** Une correction : fragment fautif, ce qu'il faut écrire, pourquoi ; retenir, écarter, modifier, supprimer. */
function LigneCorrection({ c }: { c: CorrectionNative }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [edition, setEdition] = React.useState<{ corrige: string; type: TypeCorrection } | null>(null);
  const action = useMutation({
    mutationFn: async (quoi: StatutCorrection | "supprimer" | "enregistrer") => {
      if (quoi === "supprimer") return supprimerCorrection(c.id);
      if (quoi === "enregistrer") return modifierCorrection(c.id, { corrige: edition?.corrige ?? c.corrige, type: edition?.type ?? c.type });
      return deciderCorrections([c.id], quoi);
    },
    onSuccess: (_r, quoi) => {
      if (quoi === "enregistrer") setEdition(null);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: CLE_CORRECTIONS }),
  });
  const nomRelecteur = [c.relecteur?.prenom, c.relecteur?.nom].filter(Boolean).join(" ");

  return (
    <li className="space-y-2 rounded-md border p-3" data-testid="correction" data-statut={c.statut}>
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <Badge variant={VARIANTE_STATUT[c.statut]}>{t(`relectureNative.corrections.statut.${c.statut}`)}</Badge>
        <Badge variant="secondary">{t(`relectureNative.corrections.type.${c.type}`)}</Badge>
        {c.version && <Badge variant="outline">{t(`relectureNative.corrections.version.${c.version}`)}</Badge>}
        <Badge variant="outline">{t(c.relecture_id ? "relectureNative.corrections.sourceRelecture" : "relectureNative.corrections.sourceDuel")}</Badge>
        {c.slide != null && <span className="text-muted-foreground">{t("relectureNative.corrections.slide", { n: c.slide })}</span>}
        <span className="ml-auto text-muted-foreground">
          {t("relectureNative.corrections.par", { nom: nomRelecteur || "?", date: dateCourte(c.created_at, i18n.language) })}
        </span>
      </div>
      <div className="grid gap-1 text-sm sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-x-3">
        <span className="text-xs text-muted-foreground">{t("relectureNative.corrections.fautif")}</span>
        <span className="line-through decoration-destructive/60">{c.fautif}</span>
        <span className="text-xs text-muted-foreground">{t("relectureNative.corrections.corrige")}</span>
        {edition ? (
          <div className="space-y-1">
            <Textarea
              rows={2}
              aria-label={t("relectureNative.corrections.corrige")}
              value={edition.corrige}
              onChange={(e) => setEdition({ ...edition, corrige: e.target.value })}
            />
            <select
              aria-label={t("relectureNative.corrections.typeLabel")}
              className={selectClass}
              value={edition.type}
              onChange={(e) => setEdition({ ...edition, type: e.target.value as TypeCorrection })}
            >
              {TYPES_CORRECTION.map((ty) => (
                <option key={ty} value={ty}>
                  {t(`relectureNative.corrections.type.${ty}`)}
                </option>
              ))}
            </select>
          </div>
        ) : c.corrige ? (
          <span className="font-medium">{c.corrige}</span>
        ) : (
          <span className="text-muted-foreground">{t("relectureNative.corrections.sansCorrige")}</span>
        )}
        {c.explication && (
          <>
            <span className="text-xs text-muted-foreground">{t("relectureNative.corrections.explication")}</span>
            <span className="text-xs text-muted-foreground">{c.explication}</span>
          </>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {edition ? (
          <>
            <Button size="sm" disabled={action.isPending} onClick={() => action.mutate("enregistrer")}>
              {t("relectureNative.corrections.enregistrer")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEdition(null)}>
              {t("relectureNative.corrections.annuler")}
            </Button>
          </>
        ) : (
          <>
            {c.statut !== "retenue" && (
              <Button size="sm" disabled={action.isPending} onClick={() => action.mutate("retenue")}>
                {t("relectureNative.corrections.retenir")}
              </Button>
            )}
            {c.statut !== "ecartee" && (
              <Button size="sm" variant="outline" disabled={action.isPending} onClick={() => action.mutate("ecartee")}>
                {t("relectureNative.corrections.ecarter")}
              </Button>
            )}
            {c.statut !== "proposee" && (
              <Button size="sm" variant="ghost" disabled={action.isPending} onClick={() => action.mutate("proposee")}>
                {t("relectureNative.corrections.reproposer")}
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setEdition({ corrige: c.corrige ?? "", type: c.type })}>
              {t("relectureNative.corrections.modifier")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive"
              disabled={action.isPending}
              onClick={() => {
                if (window.confirm(t("relectureNative.corrections.confirmerSuppression", { fautif: c.fautif }))) action.mutate("supprimer");
              }}
            >
              {t("relectureNative.corrections.supprimer")}
            </Button>
          </>
        )}
        {action.isError && (
          <span role="alert" className="text-xs text-destructive">
            {messageErreur(action.error)}
          </span>
        )}
      </div>
    </li>
  );
}

/**
 * Relecture native → Corrections : par langue, les remarques des relecteurs
 * découpées en corrections (bouton « Découper » ou cron), à retenir ou
 * écarter. Les retenues entrent dans la traduction de la langue dès le
 * prochain deck ; l'aperçu en bas montre le bloc tel que le modèle le reçoit.
 */
export function SectionCorrections() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const relecteurs = useQuery({ queryKey: ["relecteurs-natifs"], queryFn: listerRelecteurs });
  const langues = React.useMemo(
    () => [...new Set((relecteurs.data ?? []).map((r) => r.langue.toLowerCase()))].sort(),
    [relecteurs.data],
  );
  const [langueChoisie, setLangueChoisie] = React.useState<string | null>(null);
  const langue = langueChoisie && langues.includes(langueChoisie) ? langueChoisie : (langues[0] ?? null);
  const [filtre, setFiltre] = React.useState<Filtre>("proposee");
  const [bilan, setBilan] = React.useState<string | null>(null);

  const corrections = useQuery({
    queryKey: [...CLE_CORRECTIONS, langue],
    queryFn: () => listerCorrectionsNatives(langue!),
    enabled: Boolean(langue),
  });
  const aExtraire = useQuery({
    queryKey: [...CLE_CORRECTIONS, "a-extraire", langue],
    queryFn: () => compterVotesAExtraire(langue!),
    enabled: Boolean(langue),
  });
  const bloc = useQuery({
    queryKey: [...CLE_CORRECTIONS, "bloc", langue],
    queryFn: () => blocCorrectionsNatives(langue!),
    enabled: Boolean(langue),
  });
  const rafraichir = () => void qc.invalidateQueries({ queryKey: CLE_CORRECTIONS });
  const extraire = useMutation({
    mutationFn: () => extraireCorrections(langue!),
    onSuccess: (b) => {
      setBilan(
        t("relectureNative.corrections.extrait", {
          traites: b.traites,
          corrections: b.corrections,
          echecs: b.echecs.length ? t("relectureNative.corrections.echecs", { n: b.echecs.length }) : "",
        }) + (b.restants > 0 ? ` ${t("relectureNative.corrections.restants", { n: b.restants })}` : ""),
      );
      rafraichir();
    },
  });
  const toutRetenir = useMutation({
    mutationFn: (ids: string[]) => deciderCorrections(ids, "retenue"),
    onSuccess: rafraichir,
  });

  const toutes = corrections.data ?? [];
  const n = {
    proposee: toutes.filter((c) => c.statut === "proposee").length,
    retenue: toutes.filter((c) => c.statut === "retenue").length,
    ecartee: toutes.filter((c) => c.statut === "ecartee").length,
  };
  const visibles = filtre === "toutes" ? toutes : toutes.filter((c) => c.statut === filtre);
  const erreur = relecteurs.error ?? corrections.error ?? aExtraire.error ?? extraire.error ?? toutRetenir.error ?? bloc.error;

  return (
    <div className="space-y-4" data-testid="section-corrections">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold">{t("relectureNative.corrections.titre")}</h2>
        <p className="text-xs text-muted-foreground">{t("relectureNative.corrections.aide")}</p>
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
            <Label htmlFor="correctionsLangue">{t("relectureNative.corrections.langue")}</Label>
            <select id="correctionsLangue" className={selectClass} value={langue ?? ""} onChange={(e) => setLangueChoisie(e.target.value)}>
              {langues.map((l) => (
                <option key={l} value={l}>
                  {drapeauLangue(l)} {nomLangue(l)}
                </option>
              ))}
            </select>
          </div>
          <Button size="sm" variant="outline" disabled={extraire.isPending || !langue || (aExtraire.data ?? 0) === 0} onClick={() => extraire.mutate()}>
            <Scissors />
            {extraire.isPending
              ? t("relectureNative.corrections.extraction")
              : t("relectureNative.corrections.extraire", { count: aExtraire.data ?? 0 })}
          </Button>
          {n.proposee > 0 && (
            <Button
              size="sm"
              disabled={toutRetenir.isPending}
              onClick={() => toutRetenir.mutate(toutes.filter((c) => c.statut === "proposee").map((c) => c.id))}
            >
              {t("relectureNative.corrections.toutRetenir", { n: n.proposee })}
            </Button>
          )}
        </div>
      )}
      {bilan && <p className="text-xs">{bilan}</p>}

      {langue && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Segments<Filtre>
              libelle={t("relectureNative.corrections.filtre")}
              actif={filtre}
              onChange={setFiltre}
              options={[
                { cle: "proposee", contenu: `${t("relectureNative.corrections.filtres.proposee")} · ${n.proposee}` },
                { cle: "retenue", contenu: `${t("relectureNative.corrections.filtres.retenue")} · ${n.retenue}` },
                { cle: "ecartee", contenu: `${t("relectureNative.corrections.filtres.ecartee")} · ${n.ecartee}` },
                { cle: "toutes", contenu: `${t("relectureNative.corrections.filtres.toutes")} · ${toutes.length}` },
              ]}
            />
          </div>
          {corrections.isPending ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : visibles.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("relectureNative.corrections.aucune")}</p>
          ) : (
            <ul className="space-y-2" data-testid="liste-corrections">
              {visibles.map((c) => (
                <LigneCorrection key={c.id} c={c} />
              ))}
            </ul>
          )}
          <Replie titre={t("relectureNative.corrections.bloc", { langue: nomLangue(langue) })}>
            {bloc.data ? (
              <pre className="max-h-96 overflow-auto rounded-md bg-muted/40 p-3 font-mono text-xs whitespace-pre-wrap" data-testid="bloc-corrections">
                {bloc.data}
              </pre>
            ) : (
              <p className="text-xs text-muted-foreground">{t("relectureNative.corrections.blocVide")}</p>
            )}
          </Replie>
        </>
      )}
    </div>
  );
}
