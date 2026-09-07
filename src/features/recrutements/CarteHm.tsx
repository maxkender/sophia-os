import * as React from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ChevronDown, Copy, ExternalLink, Megaphone, RotateCcw } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { InboxSuggestions, suggestionsVisibles } from "./InboxSuggestions";
import { CasesEtapesCreateur, CasesEtapesHm, TimelineCreateur, TimelinePhase0 } from "./Timeline";
import {
  creerSuggestionManuelle,
  enregistrerEmailPerso,
  majCibleCreateurs,
  marquerAjoutUpwork,
} from "./api";
import {
  CIBLE_CREATEURS_HM_DEFAUT,
  CIBLE_CREATEURS_HM_MAX,
  CIBLE_CREATEURS_HM_MIN,
  bornerCibleCreateurs,
} from "./constantes";
import { nomAfficheHm } from "./phases";
import { moyenneHm } from "./stats";
import type {
  AuteurMessage,
  FicheCreateurOs,
  RecrutementCreateur,
  RecrutementHm,
  RecrutementSuggestion,
  StatsCreateur10j,
} from "./types";

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

function EnteteHm({
  hm,
  sous,
}: {
  hm: RecrutementHm;
  sous?: React.ReactNode;
}) {
  const nom = nomAfficheHm(hm);
  return (
    <header className="flex items-start gap-3">
      <Avatar className="size-11">
        {hm.avatar_url ? <AvatarImage src={hm.avatar_url} alt="" /> : null}
        <AvatarFallback>{initiales(nom)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium leading-tight">{nom}</p>
        {sous}
      </div>
    </header>
  );
}

function CibleHm({ hm, nTotal }: { hm: RecrutementHm; nTotal: number }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const cible = hm.cible_createurs ?? CIBLE_CREATEURS_HM_DEFAUT;
  const [valeur, setValeur] = React.useState(String(cible));
  React.useEffect(() => {
    setValeur(String(cible));
  }, [cible]);
  const mut = useMutation({
    mutationFn: (n: number) => majCibleCreateurs(hm.id, n),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recrutements"] }),
  });
  return (
    <div className="flex items-center gap-2">
      <p className="text-xs tabular-nums text-muted-foreground">
        {t("recrutements.createursCible", { n: nTotal, cible })}
      </p>
      <Input
        type="number"
        size="sm"
        min={CIBLE_CREATEURS_HM_MIN}
        max={CIBLE_CREATEURS_HM_MAX}
        step={1}
        className="w-16"
        value={valeur}
        aria-label={t("recrutements.cibleHm")}
        disabled={mut.isPending}
        onChange={(e) => setValeur(e.target.value)}
        onBlur={() => {
          const n = bornerCibleCreateurs(Number(valeur));
          setValeur(String(n));
          if (n !== cible) mut.mutate(n);
        }}
      />
    </div>
  );
}

function FicheCreateurPopup({
  createur,
  fiche,
  children,
}: {
  createur: RecrutementCreateur;
  fiche?: FicheCreateurOs;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const [ouvert, setOuvert] = React.useState(false);
  const email = fiche?.email ?? createur.email_perso ?? createur.email_os;
  return (
    <>
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-2 rounded-lg text-left transition-colors hover:bg-black/5"
        onClick={() => setOuvert(true)}
      >
        {children}
      </button>
      <Dialog open={ouvert} onOpenChange={setOuvert}>
        <DialogPopup className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">{createur.nom_affiche}</DialogTitle>
            <DialogDescription>{t("recrutements.ficheCreateur")}</DialogDescription>
          </DialogHeader>
          <DialogPanel className="space-y-3">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {t("recrutements.ficheEmail")}
              </p>
              <p className="mt-0.5 text-sm">{email || "—"}</p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {t("recrutements.ficheTiktok")}
              </p>
              {fiche?.urlTiktok ? (
                <a
                  href={fiche.urlTiktok}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-0.5 inline-flex items-center gap-1 text-sm hover:underline"
                >
                  {fiche.handle ? `@${fiche.handle}` : fiche.urlTiktok}
                  <ExternalLink className="size-3" />
                </a>
              ) : (
                <p className="mt-0.5 text-sm text-muted-foreground">{t("recrutements.ficheAucunTiktok")}</p>
              )}
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {t("recrutements.ficheLabels")}
              </p>
              {fiche?.labels && fiche.labels.length > 0 ? (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {fiche.labels.map((nom) => (
                    <Badge key={nom} variant="secondary" className="font-normal">
                      {nom}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="mt-0.5 text-sm text-muted-foreground">{t("recrutements.ficheAucunLabel")}</p>
              )}
            </div>
            {fiche?.compteId ? (
              <Button variant="outline" size="sm" asChild>
                <Link to={`/admin/createurs/${fiche.compteId}`}>{t("recrutements.ficheOuvrirCompte")}</Link>
              </Button>
            ) : null}
          </DialogPanel>
        </DialogPopup>
      </Dialog>
    </>
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

function MiniStat({ label, valeur }: { label: string; valeur: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-medium tabular-nums">{valeur}</p>
    </div>
  );
}

function formatQuand(iso: string | null, lang: string): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleString(lang, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Paris",
  });
}

function DernierMessage({
  texte,
  at,
  auteur,
}: {
  texte: string | null;
  at: string | null;
  auteur: AuteurMessage | null;
}) {
  const { t, i18n } = useTranslation();
  const quand = formatQuand(at, i18n.language);
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {t("recrutements.dernierMessage")}
      </p>
      {texte ? (
        <>
          <p className="text-[11px] text-muted-foreground">
            {auteur ? t(`recrutements.auteur.${auteur}`) : null}
            {auteur && quand ? <span className="mx-1.5 text-border">·</span> : null}
            {quand}
          </p>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{texte}</p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">—</p>
      )}
    </div>
  );
}

function SuggestionsCarte({
  suggestions,
  hms,
}: {
  suggestions: RecrutementSuggestion[];
  hms: RecrutementHm[];
}) {
  return (
    <>
      <InboxSuggestions
        suggestions={suggestions}
        hms={hms}
        compact
        alwaysShow
        variante="messages"
      />
      <InboxSuggestions
        suggestions={suggestions}
        hms={hms}
        compact
        alwaysShow
        variante="actions"
      />
    </>
  );
}

function BoutonDetails({
  ouvert,
  nSug,
  onToggle,
}: {
  ouvert: boolean;
  nSug: number;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="w-full justify-between px-1 text-muted-foreground"
      onClick={onToggle}
      aria-expanded={ouvert}
    >
      <span className="flex items-center gap-2">
        {ouvert ? t("recrutements.replier") : t("recrutements.ouvrirDetails")}
        {nSug > 0 ? (
          <Badge variant="secondary" className="tabular-nums font-normal">
            {t("recrutements.nAValider", { count: nSug })}
          </Badge>
        ) : null}
      </span>
      <ChevronDown className={`size-4 transition-transform ${ouvert ? "rotate-180" : ""}`} />
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
  const [ouvert, setOuvert] = React.useState(false);
  const [email, setEmail] = React.useState(hm.email_perso ?? "");
  const ajout = useMutation({
    mutationFn: (fait: boolean) => marquerAjoutUpwork(hm.id, fait),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recrutements"] }),
  });
  const perso = useMutation({
    mutationFn: () => enregistrerEmailPerso(hm.id, email),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recrutements"] }),
  });
  const sugHm = suggestions.filter((s) => s.hm_id === hm.id);
  const nSug = suggestionsVisibles(sugHm).length;

  return (
    <Card className="border-rose-100/90">
      <CardContent className="flex flex-col gap-4 p-5">
        <EnteteHm
          hm={hm}
          sous={
            <div className="mt-0.5 space-y-1">
              <p className="truncate text-xs text-muted-foreground">{hm.email_os ?? "—"}</p>
              <CibleHm hm={hm} nTotal={0} />
              {hm.upwork_profile_url && (
                <a
                  href={hm.upwork_profile_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  Upwork <ExternalLink className="size-3" />
                </a>
              )}
            </div>
          }
        />
        <TimelinePhase0 hm={hm} />
        <Separator />
        <div className="space-y-2">
          <Label htmlFor={`email-perso-${hm.id}`} className="text-xs text-muted-foreground">
            {t("recrutements.emailPerso")}
          </Label>
          <div className="flex items-center gap-2">
            <Input
              id={`email-perso-${hm.id}`}
              size="sm"
              value={email}
              placeholder="email@…"
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => {
                if (email !== (hm.email_perso ?? "")) perso.mutate();
              }}
            />
            {hm.email_perso ? <Copier valeur={hm.email_perso} /> : null}
          </div>
          <p className="text-[11px] leading-snug text-muted-foreground">{t("recrutements.emailPersoAide")}</p>
        </div>
        <div className="flex items-start gap-2.5">
          <Checkbox
            id={`upwork-${hm.id}`}
            checked={Boolean(hm.ajoute_upwork_at)}
            disabled={ajout.isPending}
            onCheckedChange={(v) => ajout.mutate(v === true)}
            className="mt-0.5"
          />
          <Label htmlFor={`upwork-${hm.id}`} className="font-normal">
            <span className="text-sm leading-snug">
              {t("recrutements.ajouteUpwork")}
              {hm.email_perso ? (
                <span className="mt-0.5 block text-[11px] text-muted-foreground">{hm.email_perso}</span>
              ) : null}
            </span>
          </Label>
        </div>
        <BoutonDetails ouvert={ouvert} nSug={nSug} onToggle={() => setOuvert((v) => !v)} />
        {ouvert ? (
          <div className="space-y-4">
            <DernierMessage
              texte={hm.dernier_message}
              at={hm.dernier_message_at}
              auteur={hm.dernier_message_auteur}
            />
            <CasesEtapesHm hm={hm} />
            <SuggestionsCarte suggestions={sugHm} hms={[hm]} />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function CarteHmPhase1({
  hm,
  createurs,
  nTotal,
  fiches,
  suggestions,
}: {
  hm: RecrutementHm;
  createurs: RecrutementCreateur[];
  nTotal: number;
  fiches: Map<string, FicheCreateurOs>;
  suggestions: RecrutementSuggestion[];
}) {
  const { t } = useTranslation();
  const [ouvert, setOuvert] = React.useState(false);
  const sugHm = suggestions.filter((s) => s.hm_id === hm.id);
  const nSug = suggestionsVisibles(sugHm).length;
  return (
    <Card className="border-sky-100/90">
      <CardContent className="flex flex-col gap-4 p-5">
        <EnteteHm
          hm={hm}
          sous={
            <div className="mt-0.5 space-y-1">
              <CibleHm hm={hm} nTotal={nTotal} />
            </div>
          }
        />
        {createurs.length === 0 ? (
          <p className="rounded-xl border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
            {nTotal > 0 ? t("recrutements.tousPostes") : t("recrutements.aucunCreateurPipeline")}
          </p>
        ) : (
          <ul className="space-y-2">
            {createurs.map((c) => (
              <li key={c.id} className="space-y-3 rounded-xl bg-sky-50/70 px-3 py-2.5">
                <div className="mb-2 flex items-center gap-2">
                  <FicheCreateurPopup createur={c} fiche={fiches.get(c.id)}>
                    <Avatar className="size-7">
                      {c.avatar_url ? <AvatarImage src={c.avatar_url} alt="" /> : null}
                      <AvatarFallback className="text-[10px]">{initiales(c.nom_affiche)}</AvatarFallback>
                    </Avatar>
                    <span className="truncate text-sm font-medium">{c.nom_affiche}</span>
                  </FicheCreateurPopup>
                </div>
                <TimelineCreateur createur={c} />
                {ouvert ? (
                  <div className="space-y-3 border-t border-sky-100/80 pt-3">
                    <DernierMessage
                      texte={c.dernier_message}
                      at={c.dernier_message_at}
                      auteur={c.dernier_message_auteur}
                    />
                    <CasesEtapesCreateur createur={c} />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <BoutonDetails ouvert={ouvert} nSug={nSug} onToggle={() => setOuvert((v) => !v)} />
        {ouvert ? (
          <div className="space-y-4">
            <DernierMessage
              texte={hm.dernier_message}
              at={hm.dernier_message_at}
              auteur={hm.dernier_message_auteur}
            />
            <SuggestionsCarte suggestions={sugHm} hms={[hm]} />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function CarteHmPhase2({
  hm,
  createurs,
  nTotal,
  fiches,
  stats,
  suggestions,
  pays,
}: {
  hm: RecrutementHm;
  createurs: RecrutementCreateur[];
  nTotal: number;
  fiches: Map<string, FicheCreateurOs>;
  stats: Map<string, StatsCreateur10j>;
  suggestions: RecrutementSuggestion[];
  pays: string;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [ouvert, setOuvert] = React.useState(false);
  const nom = nomAfficheHm(hm);
  const lignes = createurs
    .filter((c) => c.profile_id)
    .map((c) => ({ c, s: stats.get(c.id) }));
  const moy = moyenneHm(lignes.map((l) => l.s).filter(Boolean) as StatsCreateur10j[]);
  const sugHm = suggestions.filter((s) => s.hm_id === hm.id);
  const nSug = suggestionsVisibles(sugHm).length;
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
    <Card className="border-emerald-100/90">
      <CardContent className="flex flex-col gap-4 p-5">
        <div className="space-y-3">
          <EnteteHm
            hm={hm}
            sous={
              <div className="mt-0.5">
                <CibleHm hm={hm} nTotal={nTotal} />
              </div>
            }
          />
          <div className="grid grid-cols-3 gap-3 rounded-xl bg-emerald-50/60 px-3 py-2.5">
            <MiniStat label={t("recrutements.colPosts")} valeur={formatRatio(moy.ratio)} />
            <MiniStat
              label={t("recrutements.colVues")}
              valeur={moy.vuesMoy10 == null ? "—" : Math.round(moy.vuesMoy10).toLocaleString()}
            />
            <MiniStat label={t("recrutements.colCpm")} valeur={formatCpm(moy.usdPour1000)} />
          </div>
        </div>
        <ul className="space-y-2">
          {lignes.map(({ c, s }) => (
            <li key={c.id} className="space-y-2.5 rounded-xl border border-emerald-100/80 bg-card px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <FicheCreateurPopup createur={c} fiche={fiches.get(c.id)}>
                  <Avatar className="size-7">
                    {c.avatar_url ? <AvatarImage src={c.avatar_url} alt="" /> : null}
                    <AvatarFallback className="text-[10px]">{initiales(c.nom_affiche)}</AvatarFallback>
                  </Avatar>
                  <span className="truncate text-sm font-medium">{c.nom_affiche}</span>
                </FicheCreateurPopup>
                {s?.flagVolume && (
                  <Badge variant={s.ton === "doux" ? "warning" : "destructive"}>
                    {t(`recrutements.ton.${s.ton}`)}
                  </Badge>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <MiniStat
                  label={t("recrutements.colPosts")}
                  valeur={`${s?.postes ?? 0} / ${s?.prevus ?? 0}`}
                />
                <MiniStat
                  label={t("recrutements.colVues")}
                  valeur={s?.vuesMoy10 == null ? "—" : Math.round(s.vuesMoy10).toLocaleString()}
                />
                <MiniStat label={t("recrutements.colCpm")} valeur={formatCpm(s?.usdPour1000 ?? null)} />
              </div>
              <div className="flex justify-end gap-1.5">
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
            </li>
          ))}
        </ul>
        <BoutonDetails ouvert={ouvert} nSug={nSug} onToggle={() => setOuvert((v) => !v)} />
        {ouvert ? (
          <div className="space-y-4">
            <DernierMessage
              texte={hm.dernier_message}
              at={hm.dernier_message_at}
              auteur={hm.dernier_message_auteur}
            />
            <SuggestionsCarte suggestions={sugHm} hms={[hm]} />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
