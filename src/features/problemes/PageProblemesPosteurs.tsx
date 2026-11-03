import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import i18next from "i18next";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { releverCompte } from "@/features/needsYou/api";
import { cn } from "@/lib/utils";
import { localeDate } from "@/locales/localeDate";
import { drapeau, nomPays } from "@/features/decisionPays/logique";

import {
  agirProbleme,
  dejaEcritAujourdhui,
  envoyerLienMotDePasse,
  envoyerUpwork,
  lireArchives,
  lireModeProblemes,
  lireOnboarding,
  lireProblemes,
  passerMaintenant,
  type CohorteOnboarding,
  type EtapeOnboarding,
  type Niveau,
  type Probleme,
  type Situation,
  validerCategorie,
} from "./api";
import {
  aDiagnosticOuAction,
  avecLigneStop,
  compterParGroupe,
  compterParNiveau,
  dansOnglet,
  etapesManquantes,
  GROUPES,
  groupeDe,
  type OngletGroupe,
  debutJourParis,
  FILTRES_VIDES,
  filtrer,
  gestes,
  gesteValider,
  grouper,
  NIVEAUX,
  options,
  peutValiderCategorie,
  phraseProbleme,
  PROPRIETAIRES,
  type FiltresProblemes,
} from "./logique";

const P = "problemes";
const i18nLangue = () => i18next.resolvedLanguage ?? "fr";
const selectClass = "h-9 rounded-md border border-input bg-background px-2 text-sm";
const VARIANTE: Record<Niveau, "destructive" | "warning" | "secondary"> = { urgent: "destructive", aujourdhui: "warning", samedi: "secondary" };

function quand(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleString(localeDate(), { dateStyle: "short", timeStyle: "short" }) : "—";
}

/** La date d'une cohorte (« 2 nov. »), dans la langue de l'écran. */
function jourCohorte(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(localeDate(), { day: "numeric", month: "short" });
}

const MOTIFS_OFFRE = /\b(hors_vik|nb_milestones|montant|nom_1er|echeance_1er|plusieurs_finances)\b/;

/** Le résumé, avec le motif d'une alerte d'offre en clair (« Pas 4 « Week NN » » plutôt que nb_milestones). */
function resumeLisible(p: Pick<Probleme, "resume" | "categorie">, t: (k: string) => string): string {
  if (p.categorie !== "offre_hm_incorrecte") return p.resume;
  return p.resume.replace(MOTIFS_OFFRE, (m) => t(`decisionPays.motif.${m}`));
}

/** B2 : la situation, calculée par l'OS à chaque lecture : posts, étapes manquantes, paie passée, milestone en cours, reports. */
function LigneSituation({ s, onboarding }: { s: Situation; onboarding: boolean }) {
  const { t } = useTranslation();
  const pp = s.paie_passee;
  const finance = s.finances[0];
  // Les étapes d'onboarding ne disent quelque chose que pour une recrue ; pour un posteur qui poste, seul Slack compte.
  const manque = etapesManquantes(s).filter((e) => onboarding || e === "slack");
  return (
    <ul className="space-y-0.5 text-xs" data-testid="situation">
      <li className={cn(s.bloque && "font-medium text-red-600")}>{t(`${P}.sit.posts`, { posts: s.posts, attendus: s.attendus })}</li>
      <li>
        {manque.length === 0
          ? <span className="text-emerald-700 dark:text-emerald-400">✓ {t(`${P}.sit.etapesOk`)}</span>
          : <span className="font-medium text-red-600">✗ {t(`${P}.sit.manque`, { etapes: manque.map((e) => t(`${P}.sit.etape.${e}`)).join(", ") })}</span>}
      </li>
      <li>
        {!pp.ligne
          ? t(`${P}.sit.paieSansLigne`, { semaine: jourCohorte(pp.semaine) })
          : s.paye_passee && !pp.paye_at && !Number(pp.montant ?? 0)
            ? t(`${P}.sit.paieRien`, { semaine: jourCohorte(pp.semaine) })
          : s.paye_passee
            ? t(`${P}.sit.paiePayee`, { semaine: jourCohorte(pp.semaine), montant: pp.montant ?? 0, date: pp.paye_at ? jourCohorte(pp.paye_at.slice(0, 10)) : "—" })
            : <span className="font-medium text-red-600">{t(`${P}.sit.paieNonPayee`, { semaine: jourCohorte(pp.semaine), montant: pp.montant ?? 0 })}</span>}
      </li>
      <li className={cn(!s.finance_ok && s.actif && "font-medium text-amber-700")}>
        {finance
          ? t(s.finance_ok ? `${P}.sit.financeOk` : `${P}.sit.finance`, { nom: finance.nom ?? "?", montant: finance.montant ?? "?", attendu: s.attendu_semaine ?? "?" })
          : t(`${P}.sit.rienFinance`, { attendu: s.attendu_semaine ?? "?" })}
      </li>
      {(s.nb_reports ?? 0) > 0 && <li className="font-medium text-amber-700">{t(`${P}.sit.reports`, { count: s.nb_reports })}</li>}
    </ul>
  );
}

const Titre = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{children}</p>
);

function CarteProbleme({ p, mode }: { p: Probleme; mode: "test" | "on" }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [edition, setEdition] = React.useState(false);
  const [reponse, setReponse] = React.useState(p.proposition_reponse ?? "");
  const [message, setMessage] = React.useState<string | null>(null);
  const rafraichir = () => qc.invalidateQueries({ queryKey: ["problemes"] });
  const geste = gesteValider(p);
  const s = p.situation ?? null;
  const phrase = phraseProbleme(p, localeDate());
  const liste = gestes(p);
  const groupe = groupeDe(p);

  const agir = useMutation({
    mutationFn: async (action: "valider" | "ignorer" | "samedi" | "modifier" | "fermer") => {
      if (action === "modifier") {
        await agirProbleme(p.id, "modifier", { reponse });
        setEdition(false);
        return;
      }
      if (action !== "valider") return agirProbleme(p.id, action);
      if (geste.type === "page") {
        // L'argent et les formulaires (Kill, recréer…) : on ouvre la bonne page, rien n'est exécuté ici.
        navigate(geste.vers);
        return;
      }
      if (geste.type === "fermer" && p.proposition_action === "close") return agirProbleme(p.id, "fermer");
      if (geste.type === "releve") await releverCompte(geste.compte_id);
      let envoye = false;
      // Le geste non financier part avec la réponse, seulement en mode « on ».
      if (geste.type === "motDePasse" && mode === "on") {
        await envoyerLienMotDePasse(geste.poster_id);
        envoye = true;
      }
      if (p.proposition_reponse?.trim() && mode === "on" && p.poster_id && (p.canal_reponse ?? "upwork") === "upwork") {
        if (await dejaEcritAujourdhui(p.poster_id, debutJourParis())) throw new Error(t(`${P}.unParJour`));
        await envoyerUpwork(p.poster_id, avecLigneStop(p.proposition_reponse));
        envoye = true;
      }
      await agirProbleme(p.id, "valider", { envoye, action: p.proposition_action, reponse: p.proposition_reponse });
      if (mode === "test") setMessage(t(`${P}.rienEnvoye`));
    },
    onSuccess: rafraichir,
    onError: (e) => setMessage((e as Error).message),
  });
  const relire = useMutation({
    mutationFn: (compteId: string) => releverCompte(compteId),
    onSuccess: rafraichir,
    onError: (e) => setMessage((e as Error).message),
  });

  return (
    <Card data-testid="carte-probleme">
      <CardContent className="space-y-2 p-4 text-sm">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-semibold">{p.nom ?? p.contrat_id ?? t(`${P}.sansPosteur`)}</span>
          {s?.pays && <span className="text-muted-foreground">· {drapeau(s.pays)} {nomPays(s.pays, i18nLangue())}</span>}
          {p.hm && <span className="text-muted-foreground">· {t(`${P}.hm`, { hm: p.hm })}</span>}
          {p.cohorte && <span className="text-muted-foreground">· {t(`${P}.cohorte`, { date: jourCohorte(p.cohorte) })}</span>}
          <span className="text-muted-foreground">· {t(`${P}.groupes.${groupe}`)}</span>
          <Badge variant={VARIANTE[p.niveau]}>{t(`${P}.categories.${p.categorie}`, { defaultValue: p.categorie })}</Badge>
          {p.actif === false && <Badge variant="secondary">{t(`${P}.inactif`)}</Badge>}
        </div>
        <div>
          <Titre>{t(`${P}.titres.diagnostic`)}</Titre>
          <p className="font-bold" data-testid="diagnostic">
            {p.diagnostic?.trim() ? p.diagnostic : phrase ? t(`${P}.${phrase.cle}`, phrase.vars) : resumeLisible(p, t)}
          </p>
          {p.diagnostic?.trim() && p.propose_par && <p className="text-[11px] text-muted-foreground">{t(`${P}.diagPar`, { qui: t(`${P}.proprietaires.${p.propose_par}`, { defaultValue: p.propose_par }) })}</p>}
        </div>
        {s && (
          <div className="rounded-md bg-muted/30 p-2">
            <Titre>{t(`${P}.titres.situation`)}</Titre>
            <LigneSituation s={s} onboarding={groupe === "onboarding"} />
          </div>
        )}
        {s?.message && (
          <div data-testid="message-cite">
            <Titre>
              {t(s.a_ecrit ? `${P}.titres.aEcritAttend` : `${P}.titres.aEcrit`)} · {quand(s.message.at)} · {s.message.canal === "slack" ? "Slack" : "Upwork"}
              {s.message.lien && <> · <a href={s.message.lien} target="_blank" rel="noreferrer" className="normal-case underline">{t(`${P}.geste.conversation`)} ↗</a></>}
            </Titre>
            <blockquote className="border-l-2 pl-2 italic">« {s.message.texte} »</blockquote>
          </div>
        )}
        <div className="space-y-1">
          <Titre>{t(`${P}.titres.action`)}</Titre>
          {p.proposition_action && (
            <p className="text-xs">{t(`${P}.actionProposee`)} <span className="font-medium">{t(`${P}.actions.${p.proposition_action}`, { defaultValue: p.proposition_action })}</span></p>
          )}
          <div className="flex flex-wrap gap-2">
            {liste.map((g) =>
              g.type === "lien" ? (
                <a key={g.cle} href={g.url} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center rounded-md border px-3 text-xs hover:bg-muted">
                  {t(`${P}.${g.cle}`)} ↗
                </a>
              ) : g.type === "page" ? (
                <Button key={g.cle} size="sm" onClick={() => navigate(g.vers)}>{t(`${P}.${g.cle}`)}</Button>
              ) : (
                <Button key={g.cle} size="sm" onClick={() => relire.mutate(g.compte_id)} disabled={relire.isPending}>{t(`${P}.${g.cle}`)}</Button>
              ),
            )}
          </div>
          {(p.proposition_reponse || edition || s?.a_ecrit) && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">{t(`${P}.reponseProposee`, { canal: p.canal_reponse ?? s?.message?.canal ?? "upwork" })}</p>
              {edition ? (
                <Textarea value={reponse} onChange={(e) => setReponse(e.target.value)} rows={4} />
              ) : p.proposition_reponse ? (
                <p className="whitespace-pre-wrap rounded-md bg-muted/40 p-2">{p.proposition_reponse}</p>
              ) : (
                <p className="text-xs text-muted-foreground">{t(`${P}.reponseAEcrire`)}</p>
              )}
            </div>
          )}
          {p.propose_par && (
            <p className="text-[11px] text-muted-foreground" data-testid="propose-par">
              {t(`${P}.proposePar`, { qui: t(`${P}.proprietaires.${p.propose_par}`, { defaultValue: p.propose_par }), quand: quand(p.propose_at) })}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button size="sm" variant="secondary" onClick={() => agir.mutate("valider")} disabled={agir.isPending}>
            ✅ {geste.type === "page" ? t(`${P}.ouvrir`) : t(`${P}.valider`)}
          </Button>
          {edition ? (
            <Button size="sm" variant="outline" onClick={() => agir.mutate("modifier")} disabled={agir.isPending}>💾 {t(`${P}.enregistrer`)}</Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setEdition(true)}>✏️ {t(`${P}.modifier`)}</Button>
          )}
          <Button size="sm" variant="outline" onClick={() => agir.mutate("ignorer")} disabled={agir.isPending}>🗑️ {t(`${P}.ignorer`)}</Button>
          {p.niveau !== "samedi" && (
            <Button size="sm" variant="outline" onClick={() => agir.mutate("samedi")} disabled={agir.isPending}>📅 {t(`${P}.samedi`)}</Button>
          )}
          {p.proposition_action === "close" && (
            <Button size="sm" variant="outline" onClick={() => agir.mutate("fermer")} disabled={agir.isPending} data-testid="fermer">✔️ {t(`${P}.fermer`)}</Button>
          )}
        </div>
        {message && <p className="text-xs text-muted-foreground">{message}</p>}
      </CardContent>
    </Card>
  );
}

/** A3 : la barre d'onboarding d'une cohorte ; un clic sur une étape montre les recrues bloquées là. */
function BarreCohorte({ c }: { c: CohorteOnboarding }) {
  const { t } = useTranslation();
  const [etape, setEtape] = React.useState<EtapeOnboarding | null>(null);
  const choisie = c.etapes.find((e) => e.cle === etape);
  return (
    <div className="space-y-2 rounded-md border p-3" data-testid="barre-onboarding">
      <p className="text-sm">
        <span className="font-semibold">{t(`${P}.onb.cohorte`, { date: jourCohorte(c.lundi) })}</span>
        <span className="text-muted-foreground"> · {t(`${P}.onb.total`, { count: c.total })} · {t(`${P}.onb.aPoste`, { n: c.a_poste })}</span>
        <span className="text-muted-foreground"> · {t(`${P}.onb.reports`, { un: c.reports.un, deux: c.reports.deux_plus })}</span>
      </p>
      <div className="grid grid-cols-2 gap-1 sm:grid-cols-4 lg:grid-cols-8">
        {c.etapes.map((e) => (
          <button key={e.cle} type="button" onClick={() => setEtape(etape === e.cle ? null : e.cle)} data-testid={`etape-${e.cle}`}
            className={cn("rounded-md border p-1.5 text-left text-xs hover:bg-muted", etape === e.cle && "border-primary bg-muted")}>
            <span className="block font-medium">{t(`${P}.onb.etapes.${e.cle}`)}</span>
            <span className="block tabular-nums">{e.faits} / {c.total}</span>
            <span className="mt-1 block h-1.5 rounded bg-muted">
              <span className="block h-1.5 rounded bg-emerald-500" style={{ width: `${c.total ? Math.round((100 * e.faits) / c.total) : 0}%` }} />
            </span>
            {e.bloques.length > 0 && <span className="mt-1 block font-medium text-red-600">{t(`${P}.onb.bloques`, { n: e.bloques.length })}</span>}
          </button>
        ))}
      </div>
      {choisie && (
        <ul className="space-y-0.5 text-xs" data-testid="bloques">
          {choisie.bloques.length === 0 && <li className="text-muted-foreground">{t(`${P}.onb.personne`)}</li>}
          {choisie.bloques.map((r) => (
            <li key={r.poster_id ?? r.contrat_id}>
              {r.poster_id ? <Link to={`/admin/posters?poster=${r.poster_id}`} className="font-medium underline">{r.nom ?? "—"}</Link> : <span className="font-medium">{r.nom ?? r.contrat_id}</span>}
              {r.pays && <span className="text-muted-foreground"> · {drapeau(r.pays)} {nomPays(r.pays, i18nLangue())}</span>}
              {r.hm && <span className="text-muted-foreground"> · {t(`${P}.hm`, { hm: r.hm })}</span>}
              {r.reports > 0 && <span className="text-amber-700"> · {t(`${P}.sit.reports`, { count: r.reports })}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function BarreOnboarding() {
  const { t } = useTranslation();
  const lu = useQuery({ queryKey: ["problemes", "onboarding"], queryFn: lireOnboarding });
  if (lu.error) return <p className="text-sm text-destructive">{(lu.error as Error).message}</p>;
  if (!lu.data) return <p className="text-xs text-muted-foreground">{t(`${P}.chargement`)}</p>;
  return <div className="space-y-2">{lu.data.map((c) => <BarreCohorte key={c.lundi} c={c} />)}</div>;
}

/** Un groupe (4) : la catégorie, son compteur, « Valider tout » sans argent ni STOP. */
function Groupe({ niveau, categorie, cartes, mode }: { niveau: Niveau; categorie: string; cartes: Probleme[]; mode: "test" | "on" }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [ouvert, setOuvert] = React.useState(cartes.length <= 5 || niveau === "urgent");
  const lot = useMutation({ mutationFn: () => validerCategorie(niveau, categorie), onSuccess: () => qc.invalidateQueries({ queryKey: ["problemes"] }) });
  return (
    <section className="space-y-2" data-testid="groupe-probleme">
      <div className="flex flex-wrap items-center gap-2 border-b pb-1">
        <button type="button" className="font-semibold hover:underline" onClick={() => setOuvert(!ouvert)}>
          {ouvert ? "▾" : "▸"} {t(`${P}.categories.${categorie}`, { defaultValue: categorie })} <span className="tabular-nums text-muted-foreground">({cartes.length})</span>
        </button>
        {peutValiderCategorie(categorie) && categorie !== "stop" && cartes.length > 1 && (
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => lot.mutate()} disabled={lot.isPending} data-testid="valider-categorie">
            {t(`${P}.validerCategorie`, { n: cartes.length })}
          </Button>
        )}
      </div>
      {ouvert && cartes.map((p) => <CarteProbleme key={p.id} p={p} mode={mode} />)}
    </section>
  );
}

/**
 * Bloc C (2/11) : « Problèmes » remplace Needs you. Un problème par posteur et
 * par catégorie. v4 (3/11) : en haut, 3 groupes (Onboarding, Nouveaux actifs,
 * Actifs) et le filtre Paie ; dans chacun, Urgent / Aujourd'hui / Samedi ;
 * une proposition (réponse + action) à valider, modifier, ignorer, reporter au
 * samedi ou fermer.
 */
export function PageProblemesPosteurs() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [groupe, setGroupe] = React.useState<OngletGroupe>("onboarding");
  const [onglet, setOnglet] = React.useState<Niveau>("urgent");
  const [vue, setVue] = React.useState<"ouverts" | "fermes" | "archives">("ouverts");
  const [f, setF] = React.useState<FiltresProblemes>(FILTRES_VIDES);
  const lu = useQuery({ queryKey: ["problemes", "ouverts"], queryFn: () => lireProblemes("ouverts"), refetchInterval: 60_000 });
  const fermes = useQuery({ queryKey: ["problemes", "fermes"], queryFn: () => lireProblemes("fermes"), enabled: vue === "fermes" });
  const archives = useQuery({ queryKey: ["problemes", "archives"], queryFn: lireArchives, enabled: vue === "archives" });
  const mode = useQuery({ queryKey: ["problemes", "mode"], queryFn: lireModeProblemes });
  const passer = useMutation({ mutationFn: passerMaintenant, onSuccess: () => qc.invalidateQueries({ queryKey: ["problemes"] }) });
  // 3/11 : à chaque ouverture, relire Upwork puis recalculer avant d'afficher (au plus une fois toutes les 5 min).
  const resync = useQuery({
    queryKey: ["resync-problemes"],
    queryFn: async () => {
      const r = await passerMaintenant();
      await qc.invalidateQueries({ queryKey: ["problemes"] });
      return r;
    },
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const tous = lu.data ?? [];
  // B2 : pas de diagnostic et pas d'action → pas de carte.
  const montrables = tous.filter(aDiagnosticOuAction);
  const masquees = tous.length - montrables.length;
  const filtres = filtrer(montrables, f);
  const ng = compterParGroupe(filtres);
  const duGroupe = filtres.filter((p) => dansOnglet(p, groupe));
  const n = compterParNiveau(duGroupe);
  const o = options(tous);
  const visibles = duGroupe.filter((p) => p.niveau === onglet);
  const modeActuel = mode.data ?? "test";

  return (
    <div className="space-y-4" data-testid="page-problemes">
      {modeActuel === "test" && (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200" data-testid="mode-test">
          {t(`${P}.modeTest`)}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label={t(`${P}.groupesAria`)}>
        {[...GROUPES, "paie" as const].map((g) => (
          <button key={g} type="button" role="tab" aria-selected={groupe === g} data-testid={`groupe-${g}`}
            onClick={() => { setVue("ouverts"); setGroupe(g); }}
            className={cn("rounded-md border px-3 py-1.5 text-sm font-medium",
              groupe === g ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted", g === "paie" && "ml-auto")}>
            {t(`${P}.groupesOnglet.${g}`)} <span className="tabular-nums">({ng[g]})</span>
          </button>
        ))}
      </div>
      {vue === "ouverts" && groupe === "onboarding" && <BarreOnboarding />}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-md border p-0.5 text-sm" role="tablist">
          {NIVEAUX.map((x) => (
            <button key={x} type="button" role="tab" aria-selected={vue === "ouverts" && onglet === x}
              onClick={() => { setVue("ouverts"); setOnglet(x); }}
              className={cn("rounded px-3 py-1.5", vue === "ouverts" && onglet === x ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>
              {t(`${P}.niveaux.${x}`)} <span className="tabular-nums">({n[x]})</span>
            </button>
          ))}
        </div>
        <select className={selectClass} value={f.proprietaire} onChange={(e) => setF({ ...f, proprietaire: e.target.value })} aria-label={t(`${P}.filtreProprietaire`)}>
          <option value="">{t(`${P}.tousProprietaires`)}</option>
          {PROPRIETAIRES.map((x) => <option key={x} value={x}>{t(`${P}.proprietaires.${x}`)}</option>)}
        </select>
        <select className={selectClass} value={f.categorie} onChange={(e) => setF({ ...f, categorie: e.target.value })} aria-label={t(`${P}.filtreCategorie`)}>
          <option value="">{t(`${P}.toutesCategories`)}</option>
          {o.categories.map((x) => <option key={x} value={x}>{t(`${P}.categories.${x}`, { defaultValue: x })}</option>)}
        </select>
        <select className={selectClass} value={f.hm} onChange={(e) => setF({ ...f, hm: e.target.value })} aria-label="HM">
          <option value="">{t(`${P}.tousHm`)}</option>
          {o.hms.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button size="sm" variant={vue === "fermes" ? "default" : "outline"} onClick={() => setVue(vue === "fermes" ? "ouverts" : "fermes")}>{t(`${P}.fermes`)}</Button>
          <Button size="sm" variant={vue === "archives" ? "default" : "outline"} onClick={() => setVue(vue === "archives" ? "ouverts" : "archives")}>{t(`${P}.archives`)}</Button>
          <Button size="sm" variant="outline" onClick={() => passer.mutate()} disabled={passer.isPending}>{t(`${P}.relire`)}</Button>
          <Link to="/admin/auto/needs-you-ancien" className="self-center text-xs underline">{t(`${P}.ancienne`)}</Link>
        </div>
      </div>


      {resync.isFetching && <p className="text-xs text-muted-foreground" data-testid="resync">{t(`${P}.resync`)}</p>}
      {masquees > 0 && vue === "ouverts" && <p className="text-xs text-muted-foreground">{t(`${P}.masquees`, { count: masquees })}</p>}
      {lu.isLoading && <p className="text-sm text-muted-foreground">{t(`${P}.chargement`)}</p>}
      {lu.error && <p className="text-sm text-destructive">{(lu.error as Error).message}</p>}

      {vue === "ouverts" && (
        <div className="space-y-3">
          {visibles.length === 0 && !lu.isLoading && <p className="text-sm text-muted-foreground">{t(`${P}.rien`)}</p>}
          {grouper(visibles).map((g) => <Groupe key={g.categorie} niveau={onglet} categorie={g.categorie} cartes={g.cartes} mode={modeActuel} />)}
        </div>
      )}

      {vue === "fermes" && (
        <ul className="space-y-1 text-sm" data-testid="liste-fermes">
          {(fermes.data ?? []).map((p) => (
            <li key={p.id} className="flex flex-wrap gap-2 border-b py-1">
              <span className="font-medium">{p.nom ?? p.contrat_id ?? "—"}</span>
              <span className="text-muted-foreground">{t(`${P}.categories.${p.categorie}`, { defaultValue: p.categorie })}</span>
              <span>{resumeLisible(p, t)}</span>
              <span className="text-muted-foreground">→ {p.ferme_raison ?? p.statut} · {quand(p.ferme_at)}</span>
            </li>
          ))}
        </ul>
      )}

      {vue === "archives" && (
        <ul className="space-y-1 text-sm" data-testid="liste-archives">
          <li className="text-xs text-muted-foreground">{t(`${P}.archivesAide`)}</li>
          {(archives.data ?? []).map((a) => (
            <li key={`${a.type}:${a.ref}`} className="flex flex-wrap gap-2 border-b py-1">
              <span className="font-medium">{a.nom ?? "—"}</span>
              <span>« {a.texte ?? ""} »</span>
              <span className="text-muted-foreground">{t(`${P}.sources.${a.type}`, { defaultValue: a.type })} · {quand(a.recu_at)} · {a.raison}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
