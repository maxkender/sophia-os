import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { I18nextProvider } from "react-i18next";
import { Link } from "react-router-dom";

import { SectionSure } from "@/components/erreurs/SectionSure";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useProblemes } from "@/features/auto/useProblemes";
import i18n from "@/locales/index";
import { supabase } from "@/lib/supabase/client";

import { CarteUnique } from "../CarteUnique";
import { annulerActionBot, enregistrerRegle, lireModeProblemes, lireProblemes, type Probleme } from "../api";
import { aDiagnosticOuAction, ongletProblemes, trierCartes } from "../logique";
import {
  couverture,
  echeances,
  grouperJournal,
  NOM_BOT,
  noms,
  raisonClaire,
  raisonUrgent,
  type ActionBot,
  type BotNom,
  type LigneCouverture,
  type PointDuJour,
} from "./logique";

const CLE_VISITE = "problemes-v2-derniere-visite";

async function lirePointDuJour(depuis: string): Promise<PointDuJour> {
  const { data, error } = await supabase.rpc("problemes_point_du_jour", { p_depuis: depuis });
  if (error) throw error;
  return data as PointDuJour;
}

/** La dernière visite de Max (navigateur), puis maintenant. Sans mémoire : les dernières 24 h. */
function useDerniereVisite(): string {
  const [depuis] = React.useState(() => {
    let avant: string | null = null;
    try {
      avant = localStorage.getItem(CLE_VISITE);
      localStorage.setItem(CLE_VISITE, new Date().toISOString());
    } catch {
      avant = null;
    }
    const jour = new Date(Date.now() - 24 * 3_600_000).toISOString();
    return avant && avant < jour ? avant : jour;
  });
  return depuis;
}

const PASSAGES_BOTS = [[10, 0], [11, 30], [18, 0], [18, 30]] as const;

function prochainPassage(maintenant = new Date()): string {
  for (const [h, m] of PASSAGES_BOTS) {
    const d = new Date(maintenant);
    d.setHours(h, m, 0, 0);
    if (d > maintenant) return `${h} h${m ? m : ""}`;
  }
  return "demain 10 h";
}

/**
 * 6/11 : la nouvelle page Problèmes, en français. En haut, « Ton point du
 * jour » ; puis « Est-ce que tout est couvert ? », les cartes urgentes (une
 * par personne, avec la raison), « Ce que les bots ont fait » et « Améliorer
 * les bots ». Les réponses aux posteurs restent en anglais.
 */
export function PageProblemesV2() {
  const fr = React.useMemo(() => i18n.cloneInstance({ lng: "fr" }), []);
  return (
    <I18nextProvider i18n={fr}>
      <ContenuV2 />
    </I18nextProvider>
  );
}

function ContenuV2() {
  const depuis = useDerniereVisite();
  const cartes = useQuery({ queryKey: ["problemes", "ouverts"], queryFn: () => lireProblemes("ouverts"), refetchInterval: 60_000 });
  const mode = useQuery({ queryKey: ["problemes", "mode"], queryFn: lireModeProblemes });
  const point = useQuery({ queryKey: ["problemes", "point-du-jour", depuis], queryFn: () => lirePointDuJour(depuis), refetchInterval: 120_000 });
  const alertes = useProblemes(true);

  const toutes = React.useMemo(() => (cartes.data ?? []).filter(aDiagnosticOuAction), [cartes.data]);
  const quotidien = toutes.filter((p) => ongletProblemes(p) !== null);
  const urgentes = trierCartes(quotidien.filter((p) => ongletProblemes(p) === "urgent" && raisonUrgent(p)), "urgent");
  const chezLesBots = quotidien.filter((p) => !urgentes.includes(p));
  const parRituel = (r: string) => (cartes.data ?? []).filter((p) => p.rituel === r).length;
  const journal = grouperJournal(point.data?.journal ?? []);

  return (
    <div className="space-y-6" data-testid="page-problemes-v2">
      <div className="flex flex-wrap items-start gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Problèmes</h1>
          <p className="text-sm text-muted-foreground">Le quotidien : répondre, débloquer, et ce que les bots font seuls. Les décisions sont dans Weekly decisions.</p>
        </div>
        <Aide />
      </div>

      <SectionSure nom="Ton point du jour">
        <PointDuJourBloc
          regles={journal.regles}
          urgentes={urgentes.length}
          maintenant={parRituel("maintenant")}
          jeudi={parRituel("jeudi")}
          samedi={parRituel("samedi")}
          dimanche={parRituel("dimanche")}
          bonus={point.data?.bonus.a_payer ?? 0}
          bloques={alertes.problemes.length}
          charge={!cartes.isLoading && !point.isLoading}
        />
      </SectionSure>

      <SectionSure nom="Est-ce que tout est couvert ?">
        <Couverture lignes={couverture(toutes, point.data)} />
      </SectionSure>

      <SectionSure nom="Cartes urgentes">
        <section id="urgent" className="space-y-3" data-testid="v2-urgentes">
          <h2 className="text-lg font-semibold">⚡ À valider ({urgentes.length})</h2>
          {cartes.isLoading && <p className="text-sm text-muted-foreground">Chargement…</p>}
          {cartes.error && <p className="text-sm text-destructive">{(cartes.error as Error).message}</p>}
          {!cartes.isLoading && urgentes.length === 0 && <p className="text-sm text-muted-foreground">Rien d'urgent.</p>}
          {urgentes.map((p) => (
            <SectionSure key={p.id} nom={p.nom ?? p.hm_nom ?? p.resume}>
              <div>
                <CarteUnique p={p} mode={mode.data ?? "test"} />
                <p className="mt-1 px-1 text-xs text-muted-foreground" data-testid="raison-urgent">Urgent parce que : {raisonUrgent(p)}</p>
              </div>
            </SectionSure>
          ))}
          {chezLesBots.length > 0 && (
            <details className="rounded-md border p-3 text-sm">
              <summary className="cursor-pointer font-medium">🤖 {chezLesBots.length} cartes que les bots traitent (rien à faire pour toi)</summary>
              <div className="mt-2 space-y-3">
                {chezLesBots.map((p) => (
                  <SectionSure key={p.id} nom={p.nom ?? p.resume}>
                    <CarteUnique p={p} mode={mode.data ?? "test"} />
                  </SectionSure>
                ))}
              </div>
            </details>
          )}
        </section>
      </SectionSure>

      <SectionSure nom="Ce que les bots ont fait">
        <JournalBots journal={point.data?.journal ?? []} depuis={point.data?.depuis ?? depuis} />
      </SectionSure>

      <SectionSure nom="Améliorer les bots">
        <AmeliorerBots point={point.data} />
      </SectionSure>
    </div>
  );
}

function Aide() {
  return (
    <details className="ml-auto max-w-md rounded-md border p-2 text-sm" data-testid="aide">
      <summary className="cursor-pointer font-medium">? Comment ça marche</summary>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
        <li>L'OS lit Upwork, Slack et le dashboard, et ouvre une carte par personne qui a un problème.</li>
        <li>3 bots (Nouvelle cohorte, Contrôle, Paie) passent à 10 h, 11 h 30, 18 h et 18 h 30 : ils proposent une réponse ou agissent seuls (réponse, lien de mot de passe, Slack, TikTok), avec des règles.</li>
        <li>Ce qui est sûr est fait seul (voir « Ce que les bots ont fait », annulable). Le reste arrive ici en ⚡ À valider.</li>
        <li>« Valider » envoie la réponse affichée et fait l'action proposée ; « Modifier » te laisse corriger le texte avant ; « … » ignore.</li>
        <li>Les décisions (kill, doubler, recréer, paie, offres HM) se prennent dans Weekly decisions : la carte y mène directement.</li>
        <li>Une décision prise ferme les cartes liées. Rien d'argent ne part d'ici.</li>
      </ol>
    </details>
  );
}

function PointDuJourBloc(p: {
  regles: number; urgentes: number; maintenant: number; jeudi: number; samedi: number; dimanche: number; bonus: number; bloques: number; charge: boolean;
}) {
  const ech = echeances();
  const items: { icone: string; texte: string; lien: string; bouton: string }[] = [];
  if (p.urgentes) items.push({ icone: "⚡", texte: `${p.urgentes} carte${p.urgentes > 1 ? "s" : ""} à valider (Urgent)`, lien: "#urgent", bouton: "Ouvrir" });
  if (p.maintenant) items.push({ icone: "🗳️", texte: `${p.maintenant} décision${p.maintenant > 1 ? "s" : ""} à prendre maintenant (argent, offres HM, questions)`, lien: "/admin/auto/decisions", bouton: "Weekly decisions" });
  const prochain = ech[0]!;
  const nbProchain = prochain.lien.includes("jeudi") ? p.jeudi : prochain.lien.includes("samedi") ? p.samedi : prochain.lien.includes("dimanche") ? p.dimanche : 0;
  items.push({ icone: "📅", texte: `${prochain.quand} : ${prochain.quoi}${nbProchain ? ` (${nbProchain} cartes déjà prêtes)` : ""}`, lien: prochain.lien, bouton: "Weekly decisions" });
  if (p.bonus) items.push({ icone: "💰", texte: `${p.bonus} bonus à valider`, lien: "/admin/auto/payroll", bouton: "Bonus de lundi" });
  if (p.bloques) items.push({ icone: "⚠️", texte: `${p.bloques} chose${p.bloques > 1 ? "s" : ""} bloquée${p.bloques > 1 ? "s" : ""} chez l'OS`, lien: "/admin/auto/problems", bouton: "Voir" });
  const aFaire = items.filter((i) => i.icone !== "📅");
  return (
    <Card className="border-primary/40" data-testid="point-du-jour">
      <CardContent className="space-y-3 p-4 text-sm">
        <p className="text-base font-semibold">Ton point du jour</p>
        {!p.charge ? (
          <p className="text-muted-foreground">Chargement…</p>
        ) : aFaire.length === 0 ? (
          <p data-testid="rien-a-faire">✅ Rien à faire. Prochain point : {prochainPassage()}.</p>
        ) : (
          <>
            <p>Depuis ta dernière visite, les bots ont réglé {p.regles} cas seuls. Il te reste {aFaire.length} chose{aFaire.length > 1 ? "s" : ""} :</p>
            <ol className="space-y-1.5" data-testid="checklist">
              {items.map((i, n) => (
                <li key={n} className="flex flex-wrap items-center gap-2">
                  <span className="tabular-nums text-muted-foreground">{n + 1}.</span>
                  <span>{i.icone} {i.texte}</span>
                  {i.lien.startsWith("#")
                    ? <a href={i.lien} className="text-primary underline">[{i.bouton}]</a>
                    : <Link to={i.lien} className="text-primary underline">[{i.bouton}]</Link>}
                </li>
              ))}
            </ol>
          </>
        )}
        <p className="text-xs text-muted-foreground" data-testid="echeances">
          Cette semaine : {ech.map((e) => `${e.quand} — ${e.quoi}`).join(" · ")}
        </p>
      </CardContent>
    </Card>
  );
}

const PASTILLE: Record<LigneCouverture["niveau"], string> = { vert: "🟢", orange: "🟠", rouge: "🔴" };

function Couverture({ lignes }: { lignes: LigneCouverture[] }) {
  const ko = lignes.filter((l) => l.niveau !== "vert").length;
  return (
    <Card data-testid="couverture">
      <CardContent className="space-y-2 p-4 text-sm">
        <p className="font-semibold">Est-ce que tout est couvert ? {ko === 0 ? "✅ Oui" : `⚠️ ${ko} point${ko > 1 ? "s" : ""} à regarder`}</p>
        <ul className="space-y-1">
          {lignes.map((l) => (
            <li key={l.cle} className="flex flex-wrap items-center gap-2" data-testid={`couverture-${l.cle}`}>
              <span>{PASTILLE[l.niveau]}</span>
              <span>{l.libelle} : <strong className="tabular-nums">{l.n}</strong></span>
              {l.detail && <span className="text-xs text-muted-foreground">({l.detail})</span>}
              {l.niveau !== "vert" && l.lien && (
                l.lien.includes("#")
                  ? <a href={l.lien.slice(l.lien.indexOf("#"))} className="text-xs text-primary underline">Voir</a>
                  : <Link to={l.lien} className="text-xs text-primary underline">Voir</Link>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function JournalBots({ journal, depuis }: { journal: ActionBot[]; depuis: string }) {
  const qc = useQueryClient();
  const g = grouperJournal(journal);
  const annuler = useMutation({ mutationFn: annulerActionBot, onSuccess: () => qc.invalidateQueries({ queryKey: ["problemes"] }) });
  const quand = new Date(depuis).toLocaleString("fr-FR", { weekday: "long", hour: "2-digit", minute: "2-digit" });
  return (
    <section id="journal" className="space-y-2" data-testid="journal-bots">
      <h2 className="text-lg font-semibold">Ce que les bots ont fait <span className="text-sm font-normal text-muted-foreground">depuis {quand}</span></h2>
      <Card>
        <CardContent className="space-y-2 p-4 text-sm">
          {g.faits.length === 0 && g.refuses.length === 0 && <p className="text-muted-foreground">Rien depuis ta dernière visite.</p>}
          {g.faits.map(({ groupe, actions }) => (
            <details key={groupe.cle}>
              <summary className="cursor-pointer">
                {groupe.icone} <strong>{actions.length}</strong> {actions.length > 1 ? groupe.plusieurs : groupe.un}
                <span className="text-muted-foreground"> ({noms(actions)})</span>
              </summary>
              <ul className="mt-1 space-y-2 border-l pl-3">
                {actions.map((a) => (
                  <li key={a.id} className="space-y-0.5">
                    <p className="text-xs text-muted-foreground">
                      {a.nom ?? "—"} · {NOM_BOT[a.bot]} · {new Date(a.at).toLocaleString("fr-FR", { weekday: "short", hour: "2-digit", minute: "2-digit" })}
                      {a.canal ? ` · ${a.canal}` : ""}
                    </p>
                    {a.message && <p className="whitespace-pre-wrap rounded bg-muted/40 p-1.5 text-xs">{a.message}</p>}
                    <span className="flex gap-2 text-xs">
                      {a.probleme_id && <Link to={`/admin/auto/problemes?carte=${a.probleme_id}`} className="underline">Voir</Link>}
                      <button type="button" className="underline" onClick={() => annuler.mutate(a.id)} disabled={annuler.isPending}>Annuler / corriger</button>
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          ))}
          {g.refuses.length > 0 && (
            <details>
              <summary className="cursor-pointer">✋ <strong>{g.refuses.length}</strong> action{g.refuses.length > 1 ? "s" : ""} bloquée{g.refuses.length > 1 ? "s" : ""} par les règles</summary>
              <ul className="mt-1 space-y-1 border-l pl-3 text-xs">
                {g.refuses.slice(0, 40).map((a) => (
                  <li key={a.id}>{a.nom ?? "—"} · {NOM_BOT[a.bot]} voulait « {a.action} » : <span className="text-muted-foreground">{raisonClaire(a.raison)}</span></li>
                ))}
              </ul>
            </details>
          )}
          {g.erreurs.length > 0 && <p className="text-destructive">⚠️ {g.erreurs.length} action(s) en erreur ({noms(g.erreurs)})</p>}
          <p className="text-xs text-muted-foreground">Rien d'autre n'a été envoyé.</p>
        </CardContent>
      </Card>
    </section>
  );
}

function AmeliorerBots({ point }: { point: PointDuJour | undefined }) {
  const [faits, setFaits] = React.useState<Record<string, "ajoutee" | "ignoree">>({});
  const ajouter = useMutation({
    mutationFn: (x: { bot: BotNom; regle: string; exemple: string | null; source: string }) =>
      enregistrerRegle({ id: null, bot: x.bot, regle: x.regle, exemple: x.exemple, sources: [x.source], active: true }),
    onSuccess: (_d, x) => setFaits((f) => ({ ...f, [x.source]: "ajoutee" })),
  });
  return (
    <section className="space-y-2" data-testid="ameliorer-bots">
      <h2 className="text-lg font-semibold">Améliorer les bots</h2>
      <div className="grid gap-3 md:grid-cols-3">
        {(["new_cohort_bot", "control_bot", "pay_bot"] as const).map((b) => {
          const s = point?.semaine?.[b];
          const corrections = s?.corrections ?? [];
          return (
            <Card key={b}>
              <CardContent className="space-y-2 p-3 text-sm">
                <p className="font-medium">{NOM_BOT[b]}</p>
                <p className="text-xs text-muted-foreground">
                  Cette semaine : {s?.actions ?? 0} actions faites seules, {s?.justes ?? 0} bonnes selon toi, {corrections.length} corrigée{corrections.length > 1 ? "s" : ""}
                  {s?.refusees ? `, ${s.refusees} bloquées par les règles` : ""}.
                </p>
                {corrections.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium">Ses erreurs</p>
                    {corrections.map((c) => {
                      const lecon = (c.raison ?? "").trim();
                      return (
                        <div key={c.id} className="space-y-1 rounded border p-2 text-xs">
                          <p>Le bot proposait : {c.action_du_bot ? `« ${c.action_du_bot.slice(0, 120)} »` : "rien"}{c.diagnostic_du_bot ? ` (${c.diagnostic_du_bot.slice(0, 100)})` : ""}</p>
                          <p>Tu as fait : {c.choix ?? (c.verdict === "pas_un_probleme" ? "ignoré (pas un problème)" : "autre chose")}{lecon ? ` — parce que : ${lecon}` : ""}</p>
                          {lecon && (
                            faits[c.id] ? (
                              <Badge variant="secondary">{faits[c.id] === "ajoutee" ? "Règle ajoutée" : "Ignorée"}</Badge>
                            ) : (
                              <div className="space-y-1">
                                <p>Leçon proposée : « {lecon} »</p>
                                <span className="flex flex-wrap gap-1">
                                  <Button size="sm" variant="outline" disabled={ajouter.isPending}
                                    onClick={() => ajouter.mutate({ bot: b, regle: lecon, exemple: c.diagnostic_du_bot ?? c.action_du_bot, source: c.id })}>
                                    Ajouter aux règles du bot
                                  </Button>
                                  <Link to={`/admin/auto/regles-bots?feedback=${c.id}`} className="self-center underline">Modifier</Link>
                                  <Button size="sm" variant="ghost" onClick={() => setFaits((f) => ({ ...f, [c.id]: "ignoree" }))}>Ignorer</Button>
                                </span>
                              </div>
                            )
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

export type { Probleme };
