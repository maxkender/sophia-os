import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { releverCompte } from "@/features/needsYou/api";
import { aujourdhuiParis } from "@/features/moteur/cohortes";
import { conversationDe, type Conversations, useConversations } from "@/features/upwork/conversation";
import { LienConversation } from "@/features/upwork/LienConversation";
import { cn } from "@/lib/utils";

import {
  type ChoixDebutLigne,
  choisirDebut,
  choixDe,
  lienTiktok,
  type LigneWarmup,
  lireCheckWarmup,
  lireChoixDebut,
  prochainLundi,
} from "./checkWarmup";
import {
  type ChoixDimanche,
  type CodeKill,
  codeRetrait,
  type ContexteRecrue,
  lancerArrets,
  type LigneContexte,
  lireContexteDimanche,
  type StatutDimanche,
  tuerRecrue,
  verifierALaMain,
} from "./dimancheContexte";
import { TD, TH } from "./TableauComptes";

const P = "autoOnglets.decisions.dimanche";

const jourHeure = (iso: string | null | undefined) =>
  iso
    ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).format(new Date(iso))
    : "—";
const jour = (iso: string | null | undefined) =>
  iso ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Europe/Paris" }).format(new Date(iso)) : "—";

const CHOIX: readonly ChoixDimanche[] = ["keep", "mardi", "reporter", "kill"];
const CODES: readonly CodeKill[] = ["stop", "retrait", "rien_fait", "autre"];
type Filtre = "tous" | "risque" | "a_verifier" | "decides";
const FILTRES: readonly Filtre[] = ["tous", "risque", "a_verifier", "decides"];
const ORDRE: Record<StatutDimanche, number> = { risque: 1, a_verifier: 2, ok: 3, ok_main: 4, report: 5 };

interface Brouillon {
  choix: ChoixDimanche;
  code: CodeKill | "";
  detail: string;
}

/** Le statut d'une recrue : celui de la règle des 2 méthodes (0496), sinon l'ancien groupe. */
function statutDe(l: LigneWarmup, c: LigneContexte | undefined): StatutDimanche {
  if (c) return c.statut;
  return l.groupe === "illisible" ? "a_verifier" : l.groupe;
}

/** « slack+upwork » → « Slack + Upwork ». */
function canalLisible(c: string | null | undefined): string {
  if (!c) return "?";
  return c.split("+").map((x) => (x === "slack" ? "Slack" : x === "upwork" ? "Upwork" : x)).join(" + ");
}

/** Le contexte d'une recrue : offre, welcome, étapes, relances, messages, milestone. */
function Contexte({ x }: { x: ContexteRecrue | undefined }) {
  const { t } = useTranslation();
  if (!x) return <span className="text-muted-foreground">—</span>;
  const etape = (ok: boolean, cle: string) => (
    <span className={ok ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"}>{ok ? "✓" : "✗"} {t(`${P}.v2.etapes.${cle}`)}</span>
  );
  return (
    <div className="max-w-80 space-y-1" data-testid="contexte">
      <p>
        {t(`${P}.v2.offre`, { date: jour(x.offre_acceptee_le) })} ·{" "}
        {x.welcome?.at
          ? t(`${P}.v2.welcomeOs`, { date: jourHeure(x.welcome.at) })
          : x.welcome?.par === "hm"
          ? t(`${P}.v2.welcomeHm`)
          : t(`${P}.v2.welcomeAucun`)}
      </p>
      <p className="flex flex-wrap gap-x-2">
        {etape(Boolean(x.connecte_at), "connecte")}
        {etape(x.slack, "slack")}
        {etape(Boolean(x.start_warmup), "warmup")}
        <span>{t(`${P}.v2.follows`, { n: x.abonnements ?? "?" })}</span>
        <span className={(x.videos ?? 0) > 0 ? "text-destructive" : undefined}>{t(`${P}.v2.posts`, { n: x.videos ?? "?" })}</span>
      </p>
      {/* 0499 : chaque relance partie (date, canal) et chaque relance prévue. */}
      <div className="text-muted-foreground" data-testid="relances">
        {(x.relances_envoyees?.length ?? 0) > 0 ? (
          <p>
            {t(`${P}.v2.relancesEnvoyees`)}{" "}
            {x.relances_envoyees!.map((r) => `${jourHeure(r.at)} (${canalLisible(r.canal)})`).join(" · ")}
          </p>
        ) : x.relances?.n ? (
          <p>{t(`${P}.v2.relances`, { n: x.relances.n, date: jourHeure(x.relances.derniere_at), canal: x.relances.canal ?? "?" })}</p>
        ) : (
          <p>{t(`${P}.v2.aucuneRelance`)}</p>
        )}
        {(x.relances_prevues?.length ?? 0) > 0 && (
          <p data-testid="relances-prevues">
            {t(`${P}.v2.relancesPrevues`)}{" "}
            {x.relances_prevues!.map((r) => `${r.etape ?? "?"} · ${canalLisible(r.canal)} · ${t(`${P}.v2.depuis`, { date: jourHeure(r.at) })}`).join(" · ")}
          </p>
        )}
      </div>
      {x.recu && (
        <p data-testid="dernier-recu">
          <span className="text-muted-foreground">{t(`${P}.v2.recu`, { canal: x.recu.canal === "slack" ? "Slack" : "Upwork", date: jourHeure(x.recu.at) })} </span>
          « {x.recu.texte.slice(0, 160)} »
        </p>
      )}
      {x.envoye && (
        <p className="text-muted-foreground">
          {t(`${P}.v2.envoyeCanal`, { date: jourHeure(x.envoye.at), canal: canalLisible(x.envoye.canal) })} « {x.envoye.texte.slice(0, 80)} »
        </p>
      )}
      <p className="text-muted-foreground">
        {x.jalon
          ? t(`${P}.v2.jalon`, { nom: x.jalon.nom ?? "?", depot: x.jalon.depot ?? "?", etat: x.jalon.etat ?? "?" })
          : t(`${P}.v2.sansJalon`)}
      </p>
    </div>
  );
}

/** Les lectures TikTok : méthode, valeur brute ; Re-read now et Checked OK by hand. */
function Lectures({ l, x, lundi }: { l: LigneWarmup; x: ContexteRecrue | undefined; lundi: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const relire = useMutation({
    mutationFn: () => releverCompte(l.compte_id!),
    onSettled: () => void qc.invalidateQueries({ queryKey: ["dimanche-contexte", lundi] }),
  });
  const main = useMutation({
    mutationFn: (annuler: boolean) => verifierALaMain(l.poster_id, lundi, annuler),
    onSettled: () => void qc.invalidateQueries({ queryKey: ["dimanche-contexte", lundi] }),
  });
  const tiktok = lienTiktok(l.handle);
  const lectures = x?.lectures ?? l.releves.map((r) => ({ at: r.at, methode: "page" as const, existe: r.existe, abonnements: r.abonnements, videos: r.videos, brut: r.erreur, handle: l.handle }));
  return (
    <div className="space-y-1">
      {tiktok ? (
        <a className="underline" href={tiktok} target="_blank" rel="noreferrer" data-testid="lien-tiktok">@{l.handle}</a>
      ) : (
        <span className="text-muted-foreground">{t(`${P}.sansCompte`)}</span>
      )}
      <p className="text-muted-foreground">
        {l.warmup_started_at ? t(`${P}.demarre`, { date: jourHeure(l.warmup_started_at) }) : t(`${P}.pasDemarre`)}
      </p>
      {lectures.length === 0 ? (
        <p className="text-muted-foreground">{t(`${P}.aucunReleve`)}</p>
      ) : (
        <ul className="space-y-0.5" data-testid="lectures">
          {lectures.slice(0, 4).map((r) => (
            <li key={`${r.at}-${r.methode}`} title={r.brut ?? undefined}>
              <span className="text-muted-foreground">{jourHeure(r.at)} · </span>
              <Badge variant="outline" className="px-1 py-0 text-[10px]">{t(`${P}.v2.methodes.${r.methode}`)}</Badge>{" "}
              {r.existe === false
                ? t(`${P}.releve.introuvable`)
                : r.existe === null
                ? t(`${P}.releve.illisible`)
                : t(`${P}.releve.ok`, { abonnements: r.abonnements ?? 0, posts: r.videos ?? 0 })}
              {r.brut && <span className="block truncate text-[10px] text-muted-foreground">{r.brut}</span>}
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-1">
        {l.compte_id && (
          <Button size="xs" variant="outline" loading={relire.isPending} onClick={() => relire.mutate()} data-testid="relire">
            {t(`${P}.v2.relire`)}
          </Button>
        )}
        {x?.verif_main ? (
          <Button size="xs" variant="ghost" loading={main.isPending} onClick={() => main.mutate(true)}>
            {t(`${P}.v2.annulerMain`)}
          </Button>
        ) : (
          <Button size="xs" variant="outline" loading={main.isPending} onClick={() => main.mutate(false)} data-testid="ok-main">
            {t(`${P}.v2.okMain`)}
          </Button>
        )}
      </div>
      {x?.verif_main && <Badge variant="success">{t(`${P}.v2.verifieMain`, { date: jourHeure(x.verif_main.at) })}</Badge>}
      {(relire.error || main.error) && <p className="text-destructive">{((relire.error ?? main.error) as Error).message}</p>}
    </div>
  );
}

function Ligne({
  l, x, statut, lundi, conv, c, b, onChoix,
}: {
  l: LigneWarmup;
  x: ContexteRecrue | undefined;
  statut: StatutDimanche;
  lundi: string;
  conv: Conversations | undefined;
  c: ChoixDebutLigne | undefined;
  b: Brouillon;
  onChoix: (b: Brouillon) => void;
}) {
  const { t } = useTranslation();
  const { choix: enregistre, prevu } = choixDe(l, c);
  const change = b.choix !== enregistre || (prevu && b.choix !== enregistre);
  return (
    <tr className={cn("border-b border-border/40 align-top", x?.retrait && "border-l-4 border-l-destructive bg-destructive/10")} data-warmup={l.poster_id} data-statut={statut}>
      <td className={TD}>
        <p className="font-medium">{l.nom ?? "—"}</p>
        <p className="text-muted-foreground">{l.hm_nom ?? "—"}{l.pays ? ` · ${l.pays}` : ""}</p>
        <LienConversation c={conversationDe(conv, { posteur: l.poster_id, contrat: l.contrat_id })} />
        {l.contrat_id && <p className="text-muted-foreground">{t(`${P}.v2.contrat`, { id: l.contrat_id })}</p>}
        {x?.retrait && (
          <div className="mt-1 max-w-64 rounded border border-destructive/40 p-1" data-testid="retrait">
            <Badge variant="error">{t(`${P}.v2.retrait`)}</Badge>
            <p className="mt-0.5">« {x.retrait.texte.slice(0, 200)} »</p>
            <p className="text-muted-foreground">{jourHeure(x.retrait.at)}</p>
          </div>
        )}
      </td>
      <td className={TD}><Contexte x={x} /></td>
      <td className={TD}><Lectures l={l} x={x} lundi={lundi} /></td>
      <td className={TD}>
        <Badge variant={statut === "risque" ? "error" : statut === "a_verifier" ? "warning" : "outline"} data-testid="statut">
          {t(`${P}.v2.statuts.${statut}`)}
        </Badge>
        <div className="mt-1 flex flex-wrap gap-1">
          {statut === "risque" && l.risques.filter((r) => r !== "illisible").map((r) => (
            <Badge key={r} variant="error" data-risque={r}>{t(`${P}.risques.${r}`)}</Badge>
          ))}
        </div>
      </td>
      <td className={TD}>
        <div className="flex flex-wrap gap-1" data-choix={b.choix}>
          {CHOIX.map((k) => (
            <Button
              key={k}
              size="sm"
              variant={b.choix === k ? (k === "kill" ? "destructive" : "default") : "outline"}
              aria-pressed={b.choix === k}
              onClick={() => onChoix({ ...b, choix: k, code: k === "kill" ? b.code || codeRetrait(x?.retrait ?? null) || "" : b.code })}
            >
              {t(`${P}.v2.choix.${k}`)}
            </Button>
          ))}
        </div>
        {b.choix === "kill" && (
          <div className="mt-1 space-y-1" data-testid="raison-kill">
            <select
              className="h-7 rounded-md border bg-background px-1 text-xs"
              aria-label={t(`${P}.v2.raison`)}
              value={b.code}
              onChange={(e) => onChoix({ ...b, code: e.target.value as CodeKill })}
            >
              <option value="">{t(`${P}.v2.choisirRaison`)}</option>
              {CODES.map((k) => <option key={k} value={k}>{t(`${P}.v2.codes.${k}`)}</option>)}
            </select>
            <Input
              className="h-7 text-xs"
              aria-label={t(`${P}.v2.detail`)}
              placeholder={t(`${P}.v2.detail`)}
              value={b.detail}
              onChange={(e) => onChoix({ ...b, detail: e.target.value })}
            />
            <p className="text-muted-foreground">{t(`${P}.v2.killAide`)}</p>
          </div>
        )}
        <p className="mt-1 text-muted-foreground" data-testid="choix-etat">
          {change ? t(`${P}.v2.aValider`) : prevu ? t(`${P}.prevu.${enregistre}`) : t(`${P}.source.${c?.source ?? "manuel"}`, { date: jourHeure(c?.decide_at ?? l.decide_at) })}
        </p>
      </td>
    </tr>
  );
}

/**
 * 0474, 0490, 0496 : Weekly decisions → Sunday, toute la cohorte qui arrive.
 * Keep / Start Tuesday / Postpone / Kill par recrue, rien avant Validate ; les
 * recrues qui ont écrit STOP ou se sont retirées en premier, Kill pré-coché.
 * Introuvable ou illisible par une seule méthode : « à vérifier ».
 */
export function CheckWarmup() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [lundi, setLundi] = React.useState(() => prochainLundi(aujourdhuiParis()));
  const lu = useQuery({ queryKey: ["check-warmup", lundi], queryFn: () => lireCheckWarmup(lundi) });
  const choix = useQuery({ queryKey: ["debut-choix", lundi], queryFn: () => lireChoixDebut(lundi) });
  const contexte = useQuery({ queryKey: ["dimanche-contexte", lundi], queryFn: () => lireContexteDimanche(lundi) });
  const [filtre, setFiltre] = React.useState<Filtre>("tous");
  const [brouillons, setBrouillons] = React.useState<Record<string, Brouillon>>({});
  const [bilan, setBilan] = React.useState<string | null>(null);
  const liste = React.useMemo(() => lu.data ?? [], [lu.data]);
  const conv = useConversations(liste.map((l) => l.poster_id), liste.map((l) => l.contrat_id));
  const ctx = (id: string) => contexte.data?.get(id);
  const statut = (l: LigneWarmup) => statutDe(l, ctx(l.poster_id));
  /** Le choix montré : le brouillon, sinon Kill pour une recrue qui s'est retirée, sinon l'enregistré. */
  const brouillonDe = (l: LigneWarmup): Brouillon => {
    if (brouillons[l.poster_id]) return brouillons[l.poster_id]!;
    const r = ctx(l.poster_id)?.ctx.retrait ?? null;
    const enregistre = choisirLigne(l);
    // STOP / retrait : Kill pré-coché (même avec le Keep « garde-fou » noté pour bloquer le Start Tuesday automatique).
    if (r) return { choix: "kill", code: codeRetrait(r) ?? "", detail: r.texte.slice(0, 120) };
    return { choix: enregistre.choix, code: "", detail: "" };
  };
  const choisirLigne = (l: LigneWarmup) => choixDe(l, choix.data?.get(l.poster_id));
  const aAppliquer = (l: LigneWarmup) => {
    const b = brouillonDe(l);
    const e = choisirLigne(l);
    return b.choix === "kill" || b.choix !== e.choix || (e.prevu && Boolean(brouillons[l.poster_id]));
  };
  const retrait = (l: LigneWarmup) => Boolean(ctx(l.poster_id)?.ctx.retrait);
  const decide = (l: LigneWarmup) => choix.data?.has(l.poster_id) || Boolean(l.decision);
  const filtrees = liste
    .filter((l) => filtre === "tous" || (filtre === "decides" ? decide(l) : statut(l) === filtre))
    .sort((a, b) => Number(retrait(b)) - Number(retrait(a)) || ORDRE[statut(a)] - ORDRE[statut(b)] || (a.nom ?? "").localeCompare(b.nom ?? ""));
  const recap = { keep: 0, mardi: 0, reporter: 0, kill: 0 };
  for (const l of liste) recap[brouillonDe(l).choix]++;
  const tues = [...(contexte.data?.values() ?? [])].filter((x) => x.ctx.kill);
  const kills = liste.filter((l) => brouillonDe(l).choix === "kill");
  const manqueRaison = kills.some((l) => {
    const b = brouillonDe(l);
    return !b.code || (b.code === "autre" && !b.detail.trim());
  });
  const compte = (s: StatutDimanche) => liste.filter((l) => statut(l) === s).length;

  const valider = useMutation({
    mutationFn: async () => {
      const erreurs: string[] = [];
      let n = 0;
      for (const l of liste.filter(aAppliquer)) {
        const b = brouillonDe(l);
        try {
          if (b.choix === "kill") await tuerRecrue(l.poster_id, lundi, b.code as CodeKill, b.detail.trim());
          else await choisirDebut(l.poster_id, lundi, b.choix);
          n++;
        } catch (e) {
          erreurs.push(`${l.nom ?? l.poster_id} : ${(e as Error).message}`);
        }
      }
      if (kills.length) await lancerArrets().catch((e: Error) => erreurs.push(`arrets : ${e.message}`));
      return { n, erreurs };
    },
    onSuccess: (r) => {
      setBrouillons({});
      setBilan(t(`${P}.v2.bilan`, { n: r.n }) + (r.erreurs.length ? ` · ${r.erreurs.join(" · ")}` : ""));
      for (const k of ["check-warmup", "debut-choix", "dimanche-contexte"]) void qc.invalidateQueries({ queryKey: [k, lundi] });
    },
  });

  return (
    <Card data-testid="check-warmup">
      <CardHeader>
        <CardTitle className="text-base">{t(`${P}.titre`, { date: lundi })}</CardTitle>
        <CardDescription>{t(`${P}.v2.aide`)}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs">
            {t(`${P}.cohorte`)}
            <Input type="date" className="h-8 w-40" value={lundi} onChange={(e) => e.target.value && setLundi(e.target.value)} />
          </label>
          <span className="text-xs text-muted-foreground" data-testid="compteur-warmup">
            {t(`${P}.v2.compteur`, { risque: compte("risque"), verifier: compte("a_verifier"), ok: compte("ok") + compte("ok_main"), report: compte("report"), retraits: liste.filter(retrait).length })}
          </span>
        </div>
        <div className="flex flex-wrap gap-1" role="tablist">
          {FILTRES.map((f) => (
            <Button key={f} size="sm" variant={filtre === f ? "default" : "outline"} role="tab" aria-selected={filtre === f} onClick={() => setFiltre(f)} data-filtre={f}>
              {t(`${P}.v2.filtres.${f}`)}
            </Button>
          ))}
        </div>
        {(lu.error || contexte.error) && <p className="text-destructive">{((lu.error ?? contexte.error) as Error).message}</p>}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b">
                <th className={TH}>{t(`${P}.colonnes.recrue`)}</th>
                <th className={TH}>{t(`${P}.v2.colonnes.contexte`)}</th>
                <th className={TH}>{t(`${P}.v2.colonnes.lectures`)}</th>
                <th className={TH}>{t(`${P}.colonnes.risques`)}</th>
                <th className={TH}>{t(`${P}.colonnes.decision`)}</th>
              </tr>
            </thead>
            <tbody>
              {filtrees.map((l) => (
                <Ligne
                  key={l.poster_id}
                  l={l}
                  x={ctx(l.poster_id)?.ctx}
                  statut={statut(l)}
                  lundi={lundi}
                  conv={conv.data}
                  c={choix.data?.get(l.poster_id)}
                  b={brouillonDe(l)}
                  onChoix={(b) => setBrouillons((v) => ({ ...v, [l.poster_id]: b }))}
                />
              ))}
            </tbody>
          </table>
          {filtrees.length === 0 && <p className="py-2 text-xs text-muted-foreground">{t(`${P}.rien`)}</p>}
        </div>
        {tues.length > 0 && (
          <details className="rounded-md border px-3 py-2" data-testid="tues">
            <summary className="cursor-pointer font-medium">{t(`${P}.v2.tues`, { n: tues.length })}</summary>
            <ul className="mt-1 space-y-0.5 text-xs">
              {tues.map((x) => (
                <li key={x.poster_id} data-tue={x.poster_id}>
                  <span className="font-medium">{x.ctx.nom ?? "—"}</span>
                  {x.ctx.contrat_id ? ` · ${t(`${P}.v2.contrat`, { id: x.ctx.contrat_id })}` : ""} · {t(`${P}.v2.codes.${x.ctx.kill!.code}`)}{x.ctx.kill!.detail ? ` : ${x.ctx.kill!.detail}` : ""} · {jourHeure(x.ctx.kill!.at)}
                  {x.ctx.kill!.montant ? ` · ${t(`${P}.v2.rembourser`, { montant: x.ctx.kill!.montant })}` : ""}
                </li>
              ))}
            </ul>
          </details>
        )}
        <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t bg-background py-3">
          <Badge variant="info" data-testid="recap-debut">{t(`${P}.v2.recap`, recap)}</Badge>
          {manqueRaison && <span className="text-xs text-destructive">{t(`${P}.v2.manqueRaison`)}</span>}
          <Button
            data-action="valider-dimanche"
            loading={valider.isPending}
            disabled={manqueRaison || liste.filter(aAppliquer).length === 0}
            onClick={() => {
              if (window.confirm(t(`${P}.v2.confirmer`, { ...recap, n: liste.filter(aAppliquer).length }))) valider.mutate();
            }}
          >
            {t(`${P}.v2.valider`, { n: liste.filter(aAppliquer).length })}
          </Button>
        </div>
        {bilan && <p className="text-sm" data-testid="bilan-dimanche">{bilan}</p>}
        {valider.error && <p className="text-destructive">{(valider.error as Error).message}</p>}
      </CardContent>
    </Card>
  );
}
