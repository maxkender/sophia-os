import type { ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  Briefcase,
  FileCheck,
  FileText,
  Flame,
  ImagePlay,
  KeyRound,
  ListChecks,
  MessageCircle,
  Send,
  UserCheck,
  type LucideIcon,
} from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { majChampCreateur, majChampHm } from "./api";
import {
  CHAMPS_MANUELS_CREATEUR,
  CHAMPS_MANUELS_HM,
  ETAPES_CREATEUR,
  ETAPES_PHASE0,
  dateEtapeCreateur,
  dateEtapePhase0,
  etapeCouranteCreateur,
  etapeCourantePhase0,
  etapeFaiteCreateur,
  etapeFaitePhase0,
  sousEtapesCreateur,
  sousEtapesPhase0,
} from "./phases";
import type {
  ChampHorodatageCreateur,
  ChampHorodatageHm,
  EtapeCreateur,
  EtapePhase0,
  RecrutementCreateur,
  RecrutementHm,
} from "./types";

const ICONES_PHASE0: Record<EtapePhase0, LucideIcon> = {
  talks: MessageCircle,
  contrat_envoye: Send,
  contrat_signe: FileCheck,
  acces: KeyRound,
  checklist: ListChecks,
  job_post: Briefcase,
};

const ICONES_CREATEUR: Record<EtapeCreateur, LucideIcon> = {
  talks: MessageCircle,
  contrat: FileText,
  acces: KeyRound,
  rejoint: UserCheck,
  warmup: Flame,
  premier_post: ImagePlay,
};

function formatQuand(iso: string | null, lang: string): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleString(lang, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Paris",
  });
}

function formatDateCourte(iso: string | null, lang: string): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(lang, {
    day: "numeric",
    month: "short",
    timeZone: "Europe/Paris",
  });
}

function CarteSurvol({
  titre,
  aide,
  date,
  statut,
  sous,
}: {
  titre: string;
  aide: string;
  date: string | null;
  statut: "fait" | "cours" | "attente";
  sous: { label: string; fait: boolean; date: string | null }[];
}) {
  const { t } = useTranslation();
  const libelle =
    statut === "fait"
      ? t("recrutements.etapeFaite")
      : statut === "cours"
        ? t("recrutements.etapeEnCours")
        : t("recrutements.etapePasEncore");
  return (
    <div className="space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium leading-tight text-popover-foreground">{titre}</p>
        <span
          className={cn(
            "shrink-0 text-[10px] font-medium uppercase tracking-wide",
            statut === "fait" && "text-emerald-600",
            statut === "cours" && "text-violet-600",
            statut === "attente" && "text-muted-foreground",
          )}
        >
          {libelle}
        </span>
      </div>
      <p className="text-[11px] leading-snug text-muted-foreground">{aide}</p>
      {sous.length > 0 ? (
        <ul className="space-y-0.5 pt-0.5">
          {sous.map((s) => (
            <li key={s.label} className="flex items-baseline justify-between gap-2 text-[11px]">
              <span className={s.fait ? "text-foreground" : "text-muted-foreground"}>
                {s.fait ? "●" : "○"} {s.label}
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {s.date ?? t("recrutements.etapePasEncore")}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[11px] tabular-nums text-muted-foreground">
          {date ? t("recrutements.etapeFaiteLe", { date }) : t("recrutements.etapePasEncore")}
        </p>
      )}
    </div>
  );
}

function Rail({
  etapes,
  faite,
  courante,
  labels,
  icones,
  dates,
  cartes,
}: {
  etapes: string[];
  faite: (id: string) => boolean;
  courante: string;
  labels: Record<string, string>;
  icones: Record<string, LucideIcon>;
  dates: Record<string, string | null>;
  cartes: Record<string, ReactNode>;
}) {
  const { t } = useTranslation();
  const courantFaite = faite(courante);
  return (
    <div className="space-y-1.5">
      <div className="flex w-full items-start" role="list">
        {etapes.map((id, i) => {
          const ok = faite(id);
          const ici = id === courante;
          const Icone = icones[id] ?? MessageCircle;
          const prevOk = i === 0 ? false : faite(etapes[i - 1]!);
          return (
            <div key={id} className="flex min-w-0 flex-1 flex-col items-center gap-0.5" role="listitem">
              <div className="flex w-full items-center">
                <div
                  className={cn(
                    "h-px min-w-0 flex-1",
                    i === 0 ? "bg-transparent" : prevOk ? "bg-emerald-400/80" : "bg-border",
                  )}
                />
                <Tooltip>
                  <TooltipTrigger
                    delay={180}
                    closeOnClick={false}
                    aria-current={ici ? "step" : undefined}
                    aria-label={labels[id]}
                    className={cn(
                      "relative z-10 inline-flex size-7 shrink-0 items-center justify-center rounded-full border-0 p-0 appearance-none",
                      ok && "bg-emerald-50 text-emerald-600",
                      !ok && ici && "bg-violet-50 text-violet-600 ring-2 ring-violet-400",
                      !ok && !ici && "bg-muted/60 text-muted-foreground/45",
                    )}
                  >
                    <Icone className="size-3.5" aria-hidden />
                  </TooltipTrigger>
                  <TooltipPopup
                    side="top"
                    className="w-64 max-w-[min(16rem,var(--available-width))] flex-col items-stretch p-2.5 text-left"
                  >
                    {cartes[id]}
                  </TooltipPopup>
                </Tooltip>
                <div
                  className={cn(
                    "h-px min-w-0 flex-1",
                    i === etapes.length - 1 ? "bg-transparent" : ok ? "bg-emerald-400/80" : "bg-border",
                  )}
                />
              </div>
              <span
                className={cn(
                  "h-3.5 max-w-full truncate px-0.5 text-center text-[9px] leading-none tabular-nums",
                  ok && "text-emerald-700/80",
                  !ok && ici && "text-violet-600",
                  !ok && !ici && "text-transparent",
                )}
              >
                {ok ? (dates[id] ?? t("recrutements.etapeFaite")) : ici ? t("recrutements.etapeEnCours") : "·"}
              </span>
            </div>
          );
        })}
      </div>
      <p className="truncate text-[11px] text-muted-foreground">
        {labels[courante]}
        {" · "}
        {courantFaite ? t("recrutements.etapeFaite") : t("recrutements.etapeEnCours")}
      </p>
    </div>
  );
}

export function TimelinePhase0({ hm }: { hm: RecrutementHm }) {
  const { t, i18n } = useTranslation();
  const labels = Object.fromEntries(
    ETAPES_PHASE0.map((e) => [e, t(`recrutements.etape0.${e}`)]),
  ) as Record<EtapePhase0, string>;
  const courante = etapeCourantePhase0(hm);
  const dates = Object.fromEntries(
    ETAPES_PHASE0.map((e) => [e, formatDateCourte(dateEtapePhase0(hm, e), i18n.language)]),
  ) as Record<string, string | null>;
  const cartes = Object.fromEntries(
    ETAPES_PHASE0.map((e) => {
      const date = formatQuand(dateEtapePhase0(hm, e), i18n.language);
      const sous = sousEtapesPhase0(e).map((s) => ({
        label: t(s.labelKey),
        fait: Boolean(hm[s.champ]),
        date: formatQuand(hm[s.champ], i18n.language),
      }));
      const faite = etapeFaitePhase0(hm, e);
      const statut = faite ? "fait" : e === courante ? "cours" : "attente";
      return [
        e,
        <CarteSurvol
          key={e}
          titre={labels[e]}
          aide={t(`recrutements.etape0Aide.${e}`)}
          date={date}
          statut={statut}
          sous={sous}
        />,
      ];
    }),
  );
  return (
    <Rail
      etapes={ETAPES_PHASE0}
      faite={(id) => etapeFaitePhase0(hm, id as EtapePhase0)}
      courante={courante}
      labels={labels}
      icones={ICONES_PHASE0}
      dates={dates}
      cartes={cartes}
    />
  );
}

export function TimelineCreateur({ createur }: { createur: RecrutementCreateur }) {
  const { t, i18n } = useTranslation();
  const labels = Object.fromEntries(
    ETAPES_CREATEUR.map((e) => [e, t(`recrutements.etapeCre.${e}`)]),
  ) as Record<EtapeCreateur, string>;
  const courante = etapeCouranteCreateur(createur);
  const dates = Object.fromEntries(
    ETAPES_CREATEUR.map((e) => [
      e,
      formatDateCourte(dateEtapeCreateur(createur, e), i18n.language),
    ]),
  ) as Record<string, string | null>;
  const cartes = Object.fromEntries(
    ETAPES_CREATEUR.map((e) => {
      const date = formatQuand(dateEtapeCreateur(createur, e), i18n.language);
      const sous = sousEtapesCreateur(e).map((s) => ({
        label: t(s.labelKey),
        fait: Boolean(createur[s.champ]),
        date: formatQuand(createur[s.champ], i18n.language),
      }));
      const faite = etapeFaiteCreateur(createur, e);
      const statut = faite ? "fait" : e === courante ? "cours" : "attente";
      return [
        e,
        <CarteSurvol
          key={e}
          titre={labels[e]}
          aide={t(`recrutements.etapeCreAide.${e}`)}
          date={date}
          statut={statut}
          sous={sous}
        />,
      ];
    }),
  );
  return (
    <Rail
      etapes={ETAPES_CREATEUR}
      faite={(id) => etapeFaiteCreateur(createur, id as EtapeCreateur)}
      courante={courante}
      labels={labels}
      icones={ICONES_CREATEUR}
      dates={dates}
      cartes={cartes}
    />
  );
}

function CaseHorodatage({
  id,
  label,
  at,
  pending,
  onToggle,
}: {
  id: string;
  label: string;
  at: string | null;
  pending: boolean;
  onToggle: (fait: boolean) => void;
}) {
  const { t, i18n } = useTranslation();
  const quand = formatQuand(at, i18n.language);
  return (
    <li className="flex items-start gap-2.5">
      <Checkbox
        id={id}
        checked={Boolean(at)}
        disabled={pending}
        onCheckedChange={(v) => onToggle(v === true)}
        className="mt-0.5"
      />
      <Label htmlFor={id} className="min-w-0 font-normal">
        <span className="text-sm leading-snug">{label}</span>
        <span className="mt-0.5 block text-[11px] tabular-nums text-muted-foreground">
          {quand ?? t("recrutements.etapePasEncore")}
        </span>
      </Label>
    </li>
  );
}

export function CasesEtapesHm({ hm }: { hm: RecrutementHm }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: ({ champ, fait }: { champ: ChampHorodatageHm; fait: boolean }) =>
      majChampHm(hm.id, champ, fait),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recrutements"] }),
  });
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {t("recrutements.etapesManuelles")}
      </p>
      <p className="text-[11px] leading-snug text-muted-foreground">{t("recrutements.etapesManuellesAide")}</p>
      <ul className="space-y-2">
        {CHAMPS_MANUELS_HM.map((c) => (
          <CaseHorodatage
            key={c.champ}
            id={`hm-${hm.id}-${c.champ}`}
            label={t(c.labelKey)}
            at={hm[c.champ]}
            pending={mut.isPending}
            onToggle={(fait) => mut.mutate({ champ: c.champ, fait })}
          />
        ))}
      </ul>
    </div>
  );
}

export function CasesEtapesCreateur({ createur }: { createur: RecrutementCreateur }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: ({ champ, fait }: { champ: ChampHorodatageCreateur; fait: boolean }) =>
      majChampCreateur(createur.id, champ, fait),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recrutements"] }),
  });
  return (
    <ul className="space-y-2">
      {CHAMPS_MANUELS_CREATEUR.map((c) => (
        <CaseHorodatage
          key={c.champ}
          id={`cre-${createur.id}-${c.champ}`}
          label={t(c.labelKey)}
          at={createur[c.champ]}
          pending={mut.isPending}
          onToggle={(fait) => mut.mutate({ champ: c.champ, fait })}
        />
      ))}
    </ul>
  );
}
