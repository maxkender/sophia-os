import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Check, CheckCheck, RotateCcw, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { majStatutSuggestion } from "./api";
import {
  cleDestinataireMessage,
  estActionHumaine,
  grouperMessagesParDestinataire,
  kindEstMessage,
} from "./phases";
import type {
  RecrutementCreateur,
  RecrutementHm,
  RecrutementSuggestion,
  StatutSuggestion,
} from "./types";

export type VarianteInbox = "toutes" | "messages" | "actions" | "actions_humain";

function nomHm(sug: RecrutementSuggestion, hms: RecrutementHm[]): string {
  if (!sug.hm_id) return "—";
  const hm = hms.find((h) => h.id === sug.hm_id);
  return hm?.nom_affiche ?? sug.hm_id.slice(0, 8);
}

function nomDestinataire(
  sug: RecrutementSuggestion,
  hms: RecrutementHm[],
  createurs: RecrutementCreateur[],
): string {
  if (sug.createur_id) {
    const c = createurs.find((x) => x.id === sug.createur_id);
    return c?.nom_affiche ?? sug.createur_id.slice(0, 8);
  }
  return nomHm(sug, hms);
}

function LigneSuggestion({
  s,
  hms,
  createurs,
  compact,
  humaine,
  pending,
  dansGroupe,
  onStatut,
}: {
  s: RecrutementSuggestion;
  hms: RecrutementHm[];
  createurs: RecrutementCreateur[];
  compact: boolean;
  humaine: boolean;
  pending: boolean;
  dansGroupe: boolean;
  onStatut: (id: string, statut: StatutSuggestion, opts?: { manuel?: boolean }) => void;
}) {
  const { t } = useTranslation();
  const peutValider = !humaine && s.statut !== "validee" && s.statut !== "executee";
  const peutMarquerFaite = s.statut !== "executee";
  const dest = nomDestinataire(s, hms, createurs);
  const hmNom = nomHm(s, hms);
  return (
    <li className={cn(compact || dansGroupe ? "space-y-2" : "space-y-3 rounded-xl border bg-background/80 p-4")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <p className="text-sm font-medium leading-snug">{s.titre}</p>
          {!compact && !dansGroupe && (
            <p className="text-xs text-muted-foreground">
              {dest}
              {s.createur_id && dest !== hmNom ? (
                <>
                  <span className="mx-1.5 text-border">·</span>
                  {hmNom}
                </>
              ) : null}
              <span className="mx-1.5 text-border">·</span>
              {s.canal}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Badge variant="outline" className="tabular-nums">
            {t("recrutements.phaseCourt", { n: s.phase })}
          </Badge>
          <Badge variant={s.statut === "validee" ? "success" : "secondary"}>
            {t(`recrutements.statut.${s.statut}`)}
          </Badge>
        </div>
      </div>
      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">
        {s.corps}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {peutValider && (
          <Button size="xs" disabled={pending} onClick={() => onStatut(s.id, "validee")}>
            <Check className="size-3" />
            {t("recrutements.valider")}
          </Button>
        )}
        {peutMarquerFaite && (
          <Button
            size="xs"
            variant="outline"
            disabled={pending}
            onClick={() => onStatut(s.id, "executee", { manuel: true })}
          >
            <CheckCheck className="size-3" />
            {t("recrutements.faitManuellement")}
          </Button>
        )}
        <Button
          size="xs"
          variant="outline"
          disabled={pending}
          onClick={() => onStatut(s.id, "a_reproposer")}
        >
          <RotateCcw className="size-3" />
          {t("recrutements.reproposer")}
        </Button>
        <Button size="xs" variant="ghost" disabled={pending} onClick={() => onStatut(s.id, "ignoree")}>
          <X className="size-3" />
          {t("recrutements.ignorer")}
        </Button>
      </div>
    </li>
  );
}

export function suggestionsVisibles(
  suggestions: RecrutementSuggestion[],
  opts: { paysFiltre?: string; variante?: VarianteInbox } = {},
): RecrutementSuggestion[] {
  return suggestions.filter((s) => {
    if (s.statut === "executee" || s.statut === "ignoree") return false;
    if (opts.paysFiltre && s.pays && s.pays !== opts.paysFiltre) return false;
    const humaine = estActionHumaine(s);
    if (opts.variante === "messages") return kindEstMessage(s.kind);
    if (opts.variante === "actions") return s.kind === "action" && !humaine;
    if (opts.variante === "actions_humain") return humaine;
    return true;
  });
}

function BlocInbox({
  suggestions,
  hms,
  createurs,
  compact,
  variante,
  alwaysShow,
  rose,
  pending,
  onStatut,
}: {
  suggestions: RecrutementSuggestion[];
  hms: RecrutementHm[];
  createurs: RecrutementCreateur[];
  compact: boolean;
  variante: Exclude<VarianteInbox, "toutes">;
  alwaysShow: boolean;
  rose: boolean;
  pending: boolean;
  onStatut: (id: string, statut: StatutSuggestion, opts?: { manuel?: boolean }) => void;
}) {
  const { t } = useTranslation();
  const visibles = suggestionsVisibles(suggestions, { variante });
  if (visibles.length === 0 && !alwaysShow) return null;

  const titre =
    variante === "messages"
      ? t("recrutements.messagesProposes")
      : variante === "actions_humain"
        ? t("recrutements.actionsHumaines")
        : t("recrutements.actionsProposees");
  const vide =
    variante === "messages"
      ? t("recrutements.videMessages")
      : variante === "actions_humain"
        ? t("recrutements.videActionsHumaines")
        : t("recrutements.videActions");

  const groupes =
    variante === "messages" ? grouperMessagesParDestinataire(visibles) : visibles.map((s) => [s]);

  const liste =
    visibles.length === 0 ? (
      <p className={cn(compact ? "text-xs" : "text-sm", "leading-snug text-muted-foreground")}>{vide}</p>
    ) : (
      <ul className="space-y-3">
        {groupes.map((groupe) => {
          const tete = groupe[0]!;
          const fusion = variante === "messages" && groupe.length > 1;
          if (!fusion) {
            return (
              <LigneSuggestion
                key={tete.id}
                s={tete}
                hms={hms}
                createurs={createurs}
                compact={compact}
                humaine={variante === "actions_humain"}
                pending={pending}
                dansGroupe={false}
                onStatut={onStatut}
              />
            );
          }
          return (
            <li
              key={cleDestinataireMessage(tete)}
              className={cn(
                "space-y-3 rounded-xl border p-3",
                compact
                  ? "border-violet-200/80 bg-white/70"
                  : "border-violet-200/80 bg-background/90",
              )}
            >
              <p className="text-xs leading-snug text-violet-900/80">
                {t("recrutements.fusionMessages", { count: groupe.length })}
              </p>
              <ul className="space-y-3">
                {groupe.map((s) => (
                  <LigneSuggestion
                    key={s.id}
                    s={s}
                    hms={hms}
                    createurs={createurs}
                    compact={compact}
                    humaine={false}
                    pending={pending}
                    dansGroupe
                    onStatut={onStatut}
                  />
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    );

  if (compact) {
    return (
      <div
        className={cn(
          "space-y-3 rounded-xl border px-3 py-2.5",
          rose ? "border-rose-200/80 bg-rose-50/50" : "border-violet-200/70 bg-violet-50/40",
        )}
      >
        <p
          className={cn(
            "text-[11px] font-medium uppercase tracking-wide",
            rose ? "text-rose-800/80" : "text-violet-800/80",
          )}
        >
          {titre}
          <span className={cn("ms-1.5 tabular-nums", rose ? "text-rose-700/70" : "text-violet-700/70")}>
            {visibles.length}
          </span>
        </p>
        {liste}
      </div>
    );
  }

  return (
    <Card className={rose ? "border-rose-200/70 bg-rose-50/40" : "border-violet-200/60 bg-violet-50/30"}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-baseline justify-between text-base">
          <span>{titre}</span>
          <span className="text-sm font-normal tabular-nums text-muted-foreground">{visibles.length}</span>
        </CardTitle>
      </CardHeader>
      <CardContent>{liste}</CardContent>
    </Card>
  );
}

export function InboxSuggestions({
  suggestions,
  hms,
  createurs = [],
  paysFiltre,
  compact = false,
  variante = "toutes",
  alwaysShow = false,
}: {
  suggestions: RecrutementSuggestion[];
  hms: RecrutementHm[];
  createurs?: RecrutementCreateur[];
  paysFiltre?: string;
  compact?: boolean;
  variante?: VarianteInbox;
  alwaysShow?: boolean;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const filtrees = paysFiltre
    ? suggestions.filter((s) => !s.pays || s.pays === paysFiltre)
    : suggestions;

  const mut = useMutation({
    mutationFn: ({
      id,
      statut,
      opts,
    }: {
      id: string;
      statut: StatutSuggestion;
      opts?: { manuel?: boolean };
    }) => majStatutSuggestion(id, statut, opts),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recrutements"] }),
  });

  const onStatut = (id: string, statut: StatutSuggestion, opts?: { manuel?: boolean }) =>
    mut.mutate({ id, statut, opts });

  if (variante !== "toutes") {
    return (
      <BlocInbox
        suggestions={filtrees}
        hms={hms}
        createurs={createurs}
        compact={compact}
        variante={variante}
        alwaysShow={alwaysShow}
        rose={variante === "actions_humain"}
        pending={mut.isPending}
        onStatut={onStatut}
      />
    );
  }

  const n = suggestionsVisibles(filtrees).length;
  if (n === 0 && !alwaysShow && compact) return null;

  return (
    <div className="space-y-4">
      {!compact && (
        <p className="text-sm font-medium text-foreground">{t("recrutements.inboxTitre")}</p>
      )}
      <BlocInbox
        suggestions={filtrees}
        hms={hms}
        createurs={createurs}
        compact={compact}
        variante="messages"
        alwaysShow
        rose={false}
        pending={mut.isPending}
        onStatut={onStatut}
      />
      <BlocInbox
        suggestions={filtrees}
        hms={hms}
        createurs={createurs}
        compact={compact}
        variante="actions"
        alwaysShow
        rose={false}
        pending={mut.isPending}
        onStatut={onStatut}
      />
      <BlocInbox
        suggestions={filtrees}
        hms={hms}
        createurs={createurs}
        compact={compact}
        variante="actions_humain"
        alwaysShow
        rose
        pending={mut.isPending}
        onStatut={onStatut}
      />
    </div>
  );
}
