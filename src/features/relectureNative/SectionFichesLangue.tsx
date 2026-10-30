import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { BookOpenText, CheckCircle2, FileText, History, PenLine, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardPanel, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { drapeauLangue, LANGUES_CIBLES, nomLangue } from "@/features/moteur/langues";

import {
  compterVersionsFichesLangue,
  enregistrerFicheLangue,
  listerExemplesNatifs,
  listerFichesLangue,
  type FicheLangue,
} from "./api";
import { modeleFicheLangue } from "./logique";
import { messageErreur } from "./messageErreur";
import { Puce } from "./Puces";
import { CLE_REQUETE_EXEMPLES } from "./SectionExemplesNatifs";

const CLE_REQUETE_FICHES_LANGUE = ["fiches-langue"] as const;
const CLE_REQUETE_VERSIONS_LANGUE = ["fiches-langue-versions"] as const;

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

/**
 * Une fiche par langue (0619) : comment écrivent les natifs, condensé de la
 * banque d'exemples. La réécriture native lira la fiche, pas les exemples.
 * Brief de rédaction : docs/fiches-langue-brief.md.
 */
export function SectionFichesLangue() {
  const { t } = useTranslation();
  const fiches = useQuery({ queryKey: CLE_REQUETE_FICHES_LANGUE, queryFn: listerFichesLangue });
  const versions = useQuery({ queryKey: CLE_REQUETE_VERSIONS_LANGUE, queryFn: compterVersionsFichesLangue });
  const exemples = useQuery({ queryKey: CLE_REQUETE_EXEMPLES, queryFn: listerExemplesNatifs });
  const [langue, setLangue] = React.useState("de");

  if (fiches.error) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {messageErreur(fiches.error)}
      </p>
    );
  }
  if (fiches.isPending) {
    return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  }

  const ficheDe = (code: string) => fiches.data.find((f) => f.langue === code) ?? null;
  const prets = (exemples.data ?? []).filter((e) => e.langue === langue && e.statut === "pret").length;

  return (
    <div className="space-y-4" data-testid="fiches-langue">
      <div className="flex flex-wrap items-end gap-4">
        <p className="min-w-[14rem] flex-1 text-xs text-muted-foreground">{t("relectureNative.fichesLangue.aide")}</p>
        <label className="flex w-full flex-col gap-1 text-xs sm:w-64">
          <span className="text-muted-foreground">{t("relectureNative.fichesLangue.langue")}</span>
          <select className={selectClass} value={langue} onChange={(e) => setLangue(e.target.value)}>
            {LANGUES_CIBLES.map((l) => (
              <option key={l} value={l}>
                {drapeauLangue(l)} {nomLangue(l)}
                {ficheDe(l)?.contenu.trim() ? " ✓" : ""}
              </option>
            ))}
          </select>
        </label>
      </div>
      <CarteFicheLangue
        key={langue}
        langue={langue}
        fiche={ficheDe(langue)}
        versions={versions.data?.[langue] ?? 0}
        exemplesPrets={prets}
      />
    </div>
  );
}

function CarteFicheLangue({
  langue,
  fiche,
  versions,
  exemplesPrets,
}: {
  langue: string;
  fiche: FicheLangue | null;
  versions: number;
  exemplesPrets: number;
}) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const nom = nomLangue(langue);
  const [contenu, setContenu] = React.useState(fiche?.contenu ?? "");

  // La fiche enregistrée change (rechargement après enregistrement) : on repart d'elle.
  React.useEffect(() => setContenu(fiche?.contenu ?? ""), [fiche?.contenu]);

  const modifie = contenu !== (fiche?.contenu ?? "");
  const enregistrer = useMutation({
    mutationFn: () => enregistrerFicheLangue(langue, contenu),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CLE_REQUETE_FICHES_LANGUE });
      void queryClient.invalidateQueries({ queryKey: CLE_REQUETE_VERSIONS_LANGUE });
    },
  });

  return (
    <Card data-testid={`fiche-langue-${langue}`}>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-2xl leading-none" aria-hidden>
            {drapeauLangue(langue)}
          </span>
          <div className="min-w-0 flex-1 space-y-0.5">
            <CardTitle className="text-sm">{t("relectureNative.fichesLangue.titre", { nom })}</CardTitle>
            <CardDescription className="flex items-center gap-1.5">
              <History className="size-3.5" aria-hidden />
              {fiche?.updated_at
                ? t("relectureNative.fichesLangue.majLe", {
                    date: new Date(fiche.updated_at).toLocaleString(i18n.language),
                    versions,
                  })
                : t("relectureNative.fichesLangue.jamais")}
            </CardDescription>
          </div>
          <Puce icone={BookOpenText} ton={exemplesPrets > 0 ? "violet" : "neutre"}>
            {t("relectureNative.fichesLangue.banque", { n: exemplesPrets })}
          </Puce>
          {fiche?.contenu?.trim() ? (
            <Puce icone={CheckCircle2} ton="vert">
              {t("relectureNative.fichesLangue.ecrite")}
            </Puce>
          ) : (
            <Puce icone={PenLine} ton="ambre">
              {t("relectureNative.fichesLangue.vide")}
            </Puce>
          )}
        </div>
      </CardHeader>
      <CardPanel className="space-y-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-medium">{t("relectureNative.fichesLangue.contenu")}</span>
            {!contenu.trim() && (
              <Button type="button" variant="outline" size="sm" onClick={() => setContenu(modeleFicheLangue(nom))}>
                <FileText />
                {t("relectureNative.fichesLangue.partirDuModele")}
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{t("relectureNative.fichesLangue.contenuAide")}</p>
          <Textarea
            value={contenu}
            onChange={(e) => setContenu(e.target.value)}
            rows={24}
            className="font-mono text-xs"
            aria-label={t("relectureNative.fichesLangue.contenu")}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button disabled={!modifie || enregistrer.isPending} onClick={() => enregistrer.mutate()}>
            <Save />
            {t("relectureNative.fichesLangue.enregistrer")}
          </Button>
          {modifie && <span className="text-xs text-muted-foreground">{t("relectureNative.fichesLangue.nonEnregistre")}</span>}
          {enregistrer.isSuccess && !modifie && (
            <span className="text-xs text-muted-foreground">{t("relectureNative.fichesLangue.enregistre")}</span>
          )}
        </div>
        {enregistrer.error && (
          <p role="alert" className="text-xs text-destructive">
            {messageErreur(enregistrer.error)}
          </p>
        )}
      </CardPanel>
    </Card>
  );
}
