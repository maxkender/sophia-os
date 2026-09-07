import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Copy, ExternalLink, Megaphone, RotateCcw } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InboxSuggestions } from "./InboxSuggestions";
import { TimelineCreateur, TimelinePhase0 } from "./Timeline";
import {
  creerSuggestionManuelle,
  enregistrerEmailPerso,
  marquerAjoutUpwork,
} from "./api";
import { nomAfficheHm } from "./phases";
import type {
  RecrutementCreateur,
  RecrutementHm,
  RecrutementSuggestion,
  StatsCreateur10j,
} from "./types";
import { moyenneHm } from "./stats";

function initiales(nom: string): string {
  const parts = nom.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

function Copier({ valeur }: { valeur: string }) {
  const { t } = useTranslation();
  const [ok, setOk] = React.useState(false);
  return (
    <Button
      type="button"
      size="xs"
      variant="outline"
      onClick={() => {
        void navigator.clipboard.writeText(valeur).then(() => {
          setOk(true);
          window.setTimeout(() => setOk(false), 1200);
        });
      }}
    >
      <Copy className="size-3" />
      {ok ? t("recrutements.copie") : t("recrutements.copier")}
    </Button>
  );
}

export function CarteHmPhase0({
  hm,
  suggestions,
}: {
  hm: RecrutementHm;
  suggestions: RecrutementSuggestion[];
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [email, setEmail] = React.useState(hm.email_perso ?? "");
  const ajout = useMutation({
    mutationFn: (fait: boolean) => marquerAjoutUpwork(hm.id, fait),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recrutements"] }),
  });
  const perso = useMutation({
    mutationFn: () => enregistrerEmailPerso(hm.id, email),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recrutements"] }),
  });
  const nom = nomAfficheHm(hm);
  const sugHm = suggestions.filter((s) => s.hm_id === hm.id);

  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-rose-100/80 bg-white/80 p-4 shadow-xs">
      <header className="flex items-start gap-3">
        <Avatar className="size-12">
          {hm.avatar_url ? <AvatarImage src={hm.avatar_url} alt="" /> : null}
          <AvatarFallback>{initiales(nom)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{nom}</p>
          <p className="truncate text-xs text-muted-foreground">{hm.email_os ?? "—"}</p>
          {hm.upwork_profile_url && (
            <a
              href={hm.upwork_profile_url}
              target="_blank"
              rel="noreferrer"
              className="mt-0.5 inline-flex items-center gap-1 text-xs text-sky-700 hover:underline"
            >
              Upwork <ExternalLink className="size-3" />
            </a>
          )}
        </div>
      </header>
      <TimelinePhase0 hm={hm} />
      <div className="space-y-1.5">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {t("recrutements.emailPerso")}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="h-8 min-w-[10rem] flex-1 rounded-md border border-input bg-white px-2 text-sm"
            value={email}
            placeholder="email@…"
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => {
              if (email !== (hm.email_perso ?? "")) perso.mutate();
            }}
          />
          {hm.email_perso && <Copier valeur={hm.email_perso} />}
        </div>
        <p className="text-[11px] text-muted-foreground">{t("recrutements.emailPersoAide")}</p>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={Boolean(hm.ajoute_upwork_at)}
          disabled={ajout.isPending}
          onChange={(e) => ajout.mutate(e.target.checked)}
        />
        <span>
          {t("recrutements.ajouteUpwork")}
          {hm.email_perso ? (
            <span className="mt-0.5 block text-[11px] text-muted-foreground">
              {hm.email_perso}
            </span>
          ) : null}
        </span>
      </label>
      <InboxSuggestions suggestions={sugHm} hms={[hm]} compact />
    </article>
  );
}

export function CarteHmPhase1({
  hm,
  createurs,
  suggestions,
}: {
  hm: RecrutementHm;
  createurs: RecrutementCreateur[];
  suggestions: RecrutementSuggestion[];
}) {
  const { t } = useTranslation();
  const nom = nomAfficheHm(hm);
  const sugHm = suggestions.filter((s) => s.hm_id === hm.id);
  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-sky-100/80 bg-white/80 p-4 shadow-xs">
      <header className="flex items-start gap-3">
        <Avatar className="size-11">
          {hm.avatar_url ? <AvatarImage src={hm.avatar_url} alt="" /> : null}
          <AvatarFallback>{initiales(nom)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate font-medium">{nom}</p>
          <p className="text-xs text-muted-foreground">
            {t("recrutements.nCreateurs", { count: createurs.length })}
          </p>
        </div>
      </header>
      {createurs.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("recrutements.aucunCreateurPipeline")}</p>
      ) : (
        <ul className="space-y-2">
          {createurs.map((c) => (
            <li key={c.id} className="rounded-xl bg-sky-50/60 p-2.5">
              <div className="mb-1.5 flex items-center gap-2">
                <Avatar className="size-7">
                  {c.avatar_url ? <AvatarImage src={c.avatar_url} alt="" /> : null}
                  <AvatarFallback className="text-[10px]">{initiales(c.nom_affiche)}</AvatarFallback>
                </Avatar>
                <span className="truncate text-sm">{c.nom_affiche}</span>
              </div>
              <TimelineCreateur createur={c} />
            </li>
          ))}
        </ul>
      )}
      <InboxSuggestions suggestions={sugHm} hms={[hm]} compact />
    </article>
  );
}

function formatRatio(r: number | null): string {
  if (r == null) return "—";
  return `${Math.round(r * 100)} %`;
}

function formatCpm(n: number | null): string {
  if (n == null) return "—";
  return `${n.toFixed(2)} $`;
}

export function CarteHmPhase2({
  hm,
  createurs,
  stats,
  suggestions,
  pays,
}: {
  hm: RecrutementHm;
  createurs: RecrutementCreateur[];
  stats: Map<string, StatsCreateur10j>;
  suggestions: RecrutementSuggestion[];
  pays: string;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const nom = nomAfficheHm(hm);
  const lignes = createurs
    .filter((c) => c.profile_id)
    .map((c) => ({ c, s: stats.get(c.id) }));
  const moy = moyenneHm(lignes.map((l) => l.s).filter(Boolean) as StatsCreateur10j[]);
  const action = useMutation({
    mutationFn: (input: { kind: "relance" | "pression"; createur?: RecrutementCreateur }) => {
      const cible = input.createur?.nom_affiche ?? nom;
      const titre =
        input.kind === "pression"
          ? t("recrutements.pressionTitre", { nom: cible })
          : t("recrutements.relanceTitre", { nom: cible });
      const corps =
        input.kind === "pression"
          ? t("recrutements.pressionCorps", { nom: cible })
          : t("recrutements.relanceCorps", { nom: cible });
      return creerSuggestionManuelle({
        hm_id: hm.id,
        createur_id: input.createur?.id,
        pays,
        phase: 2,
        kind: input.kind,
        titre,
        corps,
        prompt_autom: {
          action: input.kind === "pression" ? "message_hm" : "relance_createur",
          canal: "upwork",
          hm_id: hm.id,
          createur_id: input.createur?.id ?? null,
          texte: corps,
        },
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recrutements"] }),
  });

  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-emerald-100/80 bg-white/80 p-4 shadow-xs">
      <header className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-3">
          <Avatar className="size-11">
            {hm.avatar_url ? <AvatarImage src={hm.avatar_url} alt="" /> : null}
            <AvatarFallback>{initiales(nom)}</AvatarFallback>
          </Avatar>
          <div>
            <p className="font-medium">{nom}</p>
            <p className="text-xs text-muted-foreground">
              {t("recrutements.moyenneHm", {
                posts: formatRatio(moy.ratio),
                vues: moy.vuesMoy10 == null ? "—" : Math.round(moy.vuesMoy10).toLocaleString(),
                cpm: formatCpm(moy.usdPour1000),
              })}
            </p>
          </div>
        </div>
      </header>
      <ul className="space-y-2">
        {lignes.map(({ c, s }) => (
          <li key={c.id} className="rounded-xl bg-emerald-50/50 p-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Avatar className="size-7">
                  {c.avatar_url ? <AvatarImage src={c.avatar_url} alt="" /> : null}
                  <AvatarFallback className="text-[10px]">{initiales(c.nom_affiche)}</AvatarFallback>
                </Avatar>
                <span className="text-sm">{c.nom_affiche}</span>
                {s?.flagVolume && (
                  <Badge variant={s.ton === "doux" ? "warning" : "destructive"}>
                    {t(`recrutements.ton.${s.ton}`)}
                  </Badge>
                )}
              </div>
              <div className="flex gap-1">
                <Button
                  size="xs"
                  variant="outline"
                  disabled={action.isPending}
                  onClick={() => action.mutate({ kind: "relance", createur: c })}
                >
                  <RotateCcw className="size-3" />
                  {t("recrutements.relancer")}
                </Button>
                <Button
                  size="xs"
                  variant="outline"
                  disabled={action.isPending}
                  onClick={() => action.mutate({ kind: "pression", createur: c })}
                >
                  <Megaphone className="size-3" />
                  {t("recrutements.pression")}
                </Button>
              </div>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {t("recrutements.ligneStats", {
                postes: s?.postes ?? 0,
                prevus: s?.prevus ?? 0,
                vues: s?.vuesMoy10 == null ? "—" : Math.round(s.vuesMoy10).toLocaleString(),
                cpm: formatCpm(s?.usdPour1000 ?? null),
              })}
            </p>
          </li>
        ))}
      </ul>
      <InboxSuggestions suggestions={suggestions.filter((s) => s.hm_id === hm.id)} hms={[hm]} compact />
    </article>
  );
}
