import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/features/auth/AuthContext";
import { ecrireReglagesFaq, lireReglagesFaqAdmin } from "@/features/chatbot/api";
import type { ModeOs, ModeSlack, ReglagesFaq } from "@/features/chatbot/faq";
import { CLE_FAQ } from "@/features/chatbot/faqDonnees";
import { FrequencesUpwork } from "@/features/frequences/Frequences";
import { cn } from "@/lib/utils";

import {
  enregistrerInterrupteur,
  enregistrerModePaieApi,
  enregistrerRepriseRappels,
  INTERRUPTEURS,
  lireInterrupteurs,
  lireModePaieApi,
  lireRepriseRappels,
  type CleInterrupteur,
  type ModeInterrupteur,
} from "./api";

const MODES: readonly ModeInterrupteur[] = ["off", "test", "on"];
const VARIANTE: Record<ModeInterrupteur, "secondary" | "warning" | "info" | "success"> = {
  off: "secondary",
  test: "warning",
  on: "success",
};

/** Une ligne off / test / on : le nom, le mode, la phrase de ce qu'il fait, les boutons (« on » confirmé). */
function LigneMode({
  titre,
  phrase,
  mode,
  modes = MODES,
  admin,
  occupe,
  attribut,
  onChange,
}: {
  titre: string;
  phrase: string;
  mode: ModeInterrupteur;
  modes?: readonly ModeInterrupteur[];
  admin: boolean;
  occupe: boolean;
  attribut: Record<string, string>;
  onChange: (m: ModeInterrupteur) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border p-3" {...attribut}>
      <div className="min-w-0 max-w-xl space-y-0.5">
        <p className="text-sm font-medium">
          {titre} <Badge variant={VARIANTE[mode]}>{t(`interrupteurs.modes.${mode}`)}</Badge>
        </p>
        <p className="text-xs text-muted-foreground">{phrase}</p>
      </div>
      <div className="inline-flex rounded-md border p-0.5 text-xs" role="group" aria-label={titre}>
        {modes.map((m) => (
          <button
            key={m}
            type="button"
            disabled={!admin || occupe}
            aria-pressed={mode === m}
            className={cn("rounded px-2.5 py-1", mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
            onClick={() => {
              if (m === "on" && !window.confirm(t("interrupteurs.confirmerOn", { nom: titre }))) return;
              onChange(m);
            }}
          >
            {t(`interrupteurs.modes.${m}`)}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Overview → Switches (système du 2 nov. ; prompt 22, partie 3) : chaque
 * fonction automatique, off / test / on, avec ce qu'elle fait une fois sur
 * « on » ; puis le mode de la paie par l'API, le bot FAQ (Slack et tableau de
 * bord), la date de reprise des relances et la fréquence des passages Upwork.
 * Admin seulement pour changer (vérifié en base : reglage_admin_seulement) ;
 * le Head of Ops les lit.
 */
export function Interrupteurs() {
  const { t } = useTranslation();
  const { role } = useAuth();
  const admin = role === "admin";
  const qc = useQueryClient();
  const lu = useQuery({ queryKey: ["interrupteurs"], queryFn: lireInterrupteurs });
  const changer = useMutation({
    mutationFn: ({ cle, mode }: { cle: CleInterrupteur; mode: ModeInterrupteur }) => enregistrerInterrupteur(cle, mode),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["interrupteurs"] }),
  });
  return (
    <Card id="interrupteurs" data-testid="interrupteurs">
      <CardHeader>
        <CardTitle>{t("interrupteurs.titre")}</CardTitle>
        <CardDescription>{t("interrupteurs.aide")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {INTERRUPTEURS.map((cle) => (
          <LigneMode
            key={cle}
            titre={t(`interrupteurs.${cle}.titre`)}
            phrase={t(`interrupteurs.${cle}.on`)}
            mode={lu.data?.[cle] ?? "test"}
            modes={MODES}
            admin={admin}
            occupe={changer.isPending}
            attribut={{ "data-interrupteur": cle }}
            onChange={(mode) => changer.mutate({ cle, mode })}
          />
        ))}
        {changer.isError && <p className="text-sm text-destructive">{(changer.error as Error).message}</p>}
        <ModePaieApi admin={admin} />
        <ModesFaq admin={admin} />
        <PauseRappels admin={admin} />
        <FrequencesUpwork admin={admin} />
      </CardContent>
    </Card>
  );
}

/** Prompt 22, partie 3 : le mode de la paie par l'API (ses autres réglages restent dans Payroll). */
function ModePaieApi({ admin }: { admin: boolean }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const lu = useQuery({ queryKey: ["reglages", "paie-api", "mode"], queryFn: lireModePaieApi });
  const changer = useMutation({
    mutationFn: (m: ModeInterrupteur) => enregistrerModePaieApi(m),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["reglages", "paie-api"] });
      void qc.invalidateQueries({ queryKey: ["paie", "api-reglages"] });
    },
  });
  return (
    <>
      <LigneMode
        titre={t("interrupteurs.paie_api.titre")}
        phrase={t("interrupteurs.paie_api.on")}
        mode={lu.data ?? "off"}
        admin={admin}
        occupe={changer.isPending || !lu.data}
        attribut={{ "data-reglage-mode": "paie_api" }}
        onChange={(m) => changer.mutate(m)}
      />
      {(changer.error || lu.error) && <p className="text-sm text-destructive">{((changer.error ?? lu.error) as Error).message}</p>}
    </>
  );
}

const FAQ_SLACK: Record<ModeSlack, ModeInterrupteur> = { eteint: "off", test: "test", actif: "on" };
const FAQ_OS: Record<ModeOs, ModeInterrupteur> = { test: "test", actif: "on" };
const versSlack = (m: ModeInterrupteur): ModeSlack => (m === "off" ? "eteint" : m === "on" ? "actif" : "test");

/** Prompt 22, partie 3 : le bot FAQ, sur Slack (off / test / on) et dans le tableau de bord (test / on). */
function ModesFaq({ admin }: { admin: boolean }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const lu = useQuery({ queryKey: [...CLE_FAQ, "reglages"], queryFn: lireReglagesFaqAdmin });
  const changer = useMutation({
    mutationFn: (r: ReglagesFaq) => ecrireReglagesFaq(r),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...CLE_FAQ, "reglages"] }),
  });
  const r = lu.data;
  const occupe = changer.isPending || !r;
  return (
    <>
      <LigneMode
        titre={t("interrupteurs.faq_slack.titre")}
        phrase={t("interrupteurs.faq_slack.on")}
        mode={r ? FAQ_SLACK[r.mode_slack] : "test"}
        admin={admin}
        occupe={occupe}
        attribut={{ "data-reglage-mode": "faq_slack" }}
        onChange={(m) => r && changer.mutate({ ...r, mode_slack: versSlack(m) })}
      />
      <LigneMode
        titre={t("interrupteurs.faq_os.titre")}
        phrase={t("interrupteurs.faq_os.on")}
        mode={r ? FAQ_OS[r.mode_os] : "test"}
        modes={["test", "on"]}
        admin={admin}
        occupe={occupe}
        attribut={{ "data-reglage-mode": "faq_os" }}
        onChange={(m) => r && changer.mutate({ ...r, mode_os: m === "on" ? "actif" : "test" })}
      />
      {(changer.error || lu.error) && <p className="text-sm text-destructive">{((changer.error ?? lu.error) as Error).message}</p>}
    </>
  );
}

/** Rappels en pause pour tous jusqu'à une date (les HM suivent encore la cohorte). */
function PauseRappels({ admin }: { admin: boolean }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const lu = useQuery({ queryKey: ["rappels-reprise"], queryFn: lireRepriseRappels });
  const [jour, setJour] = useState("");
  useEffect(() => setJour(lu.data ?? ""), [lu.data]);
  const enregistrer = useMutation({
    mutationFn: (j: string) => enregistrerRepriseRappels(j),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rappels-reprise"] }),
  });
  return (
    <div className="space-y-1.5 rounded-lg border p-3" data-testid="pause-rappels">
      <p className="text-sm font-medium">{t("interrupteurs.pause.titre")}</p>
      <p className="text-xs text-muted-foreground">{t("interrupteurs.pause.aide")}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="date"
          className="w-44"
          value={jour}
          disabled={!admin}
          aria-label={t("interrupteurs.pause.titre")}
          onChange={(e) => setJour(e.target.value)}
        />
        <Button size="sm" variant="outline" disabled={!admin || enregistrer.isPending || jour === (lu.data ?? "")} onClick={() => enregistrer.mutate(jour)}>
          {t("interrupteurs.pause.enregistrer")}
        </Button>
        {admin && jour && (
          <Button size="sm" variant="ghost" disabled={enregistrer.isPending} onClick={() => enregistrer.mutate("")}>
            {t("interrupteurs.pause.retirer")}
          </Button>
        )}
      </div>
      {enregistrer.isError && <p className="text-sm text-destructive">{(enregistrer.error as Error).message}</p>}
    </div>
  );
}
