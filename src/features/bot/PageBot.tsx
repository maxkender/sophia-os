import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Segments } from "@/components/ui/segments";
import { Textarea } from "@/components/ui/textarea";

import {
  ACTIONS,
  activerTest,
  ajouterTest,
  type BotTest,
  type ChampsCatalogue,
  chercherPosteurs,
  compteurs,
  type EntreeCatalogue,
  enregistrerEntree,
  filtrerCatalogue,
  garderCommeTest,
  lancerTests,
  LIBELLE_ACTION,
  LIBELLE_NIVEAU,
  lireCatalogue,
  lireHistorique,
  lireInfos,
  lireSuivi,
  lireTests,
  modifierInfo,
  type Niveau,
  NIVEAUX,
  OBJECTIF_MAX,
  type Portee,
  type PosteurTrouve,
  type ProfilFictif,
  proposerAuCatalogue,
  regressions,
  repetees,
  restaurer,
  type ResultatBot,
  type ResultatTests,
  simuler,
} from "./api";

type Onglet = "tester" | "catalogue" | "tests" | "suivi";
const ONGLETS: { cle: Onglet; contenu: string }[] = [
  { cle: "tester", contenu: "Tester" },
  { cle: "catalogue", contenu: "Catalogue" },
  { cle: "tests", contenu: "Tests automatiques" },
  { cle: "suivi", contenu: "Suivi" },
];
const SEL = "h-8 rounded-md border bg-background px-2 text-sm";
const COULEUR_NIVEAU: Record<Niveau, string> = {
  bot: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100",
  adrien: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100",
  max: "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-100",
};

/**
 * 12/11 (Support propre, F) : /admin/bot, réservée aux admins. Tester (simulation : rien n'est
 * envoyé, rien n'est écrit sur une fiche), Catalogue (+ infos à connaître, historique, retour
 * arrière), Tests automatiques, Suivi (7 jours, compteurs de la semaine).
 */
export function PageBot() {
  const [onglet, setOnglet] = React.useState<Onglet>("tester");
  return (
    <div className="space-y-4" data-testid="page-bot">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">Bot du support</h1>
        <Link to="/admin/auto/support" className="text-sm text-muted-foreground underline">Support →</Link>
      </div>
      <Segments libelle="Onglets" options={ONGLETS} actif={onglet} onChange={setOnglet} />
      {onglet === "tester" && <Tester />}
      {onglet === "catalogue" && <Catalogue />}
      {onglet === "tests" && <Tests />}
      {onglet === "suivi" && <Suivi />}
    </div>
  );
}

function BadgeNiveau({ n }: { n: Niveau | null }) {
  const v = n ?? "adrien";
  return <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${COULEUR_NIVEAU[v]}`} data-testid={`niveau-${v}`}>{LIBELLE_NIVEAU[v]}</span>;
}

function Erreur({ e }: { e: unknown }) {
  if (!e) return null;
  return <p className="text-sm text-destructive">{e instanceof Error ? e.message : String(e)}</p>;
}

// --- Tester ---------------------------------------------------------------------

const PROFIL_DEFAUT: ProfilFictif = { plateforme: "upwork", zone: "A", etape: "posting", statut: "actif", prenom: "Alex" };

function Tester() {
  const qc = useQueryClient();
  const [message, setMessage] = React.useState("");
  const [source, setSource] = React.useState<"help" | "slack_salon">("help");
  const [mode, setMode] = React.useState<"faux" | "vrai">("faux");
  const [profil, setProfil] = React.useState<ProfilFictif>(PROFIL_DEFAUT);
  const [recherche, setRecherche] = React.useState("");
  const [posteur, setPosteur] = React.useState<PosteurTrouve | null>(null);
  const [correction, setCorrection] = React.useState<string | null>(null);
  const [note, setNote] = React.useState<string | null>(null);
  const trouves = useQuery({ queryKey: ["bot", "posteurs", recherche], queryFn: () => chercherPosteurs(recherche), enabled: mode === "vrai" && recherche.trim().length >= 2 });

  const entree = () => ({ message: message.trim(), source, poster_id: mode === "vrai" ? posteur?.id ?? null : null, profil: mode === "faux" ? profil : null });
  const sim = useMutation({ mutationFn: () => simuler(entree()), onSuccess: () => { setCorrection(null); setNote(null); } });
  const bonne = useMutation({
    mutationFn: (r: ResultatBot) => garderCommeTest({ ...entree(), r }),
    onSuccess: () => { setNote("Ajouté aux tests automatiques."); void qc.invalidateQueries({ queryKey: ["bot", "tests"] }); },
  });
  const corriger = useMutation({
    mutationFn: (r: ResultatBot) => proposerAuCatalogue({
      question: message.trim(), reponse: correction ?? "", niveau: r.decision.niveau, action: r.decision.action,
      portee: r.plateforme ?? "tous", categorie: null,
    }),
    onSuccess: () => { setNote("Proposé au catalogue (à valider dans l'onglet Catalogue)."); setCorrection(null); void qc.invalidateQueries({ queryKey: ["bot", "catalogue"] }); },
  });
  const r = sim.data;
  const pret = message.trim().length > 0 && (mode === "faux" || posteur);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardContent className="space-y-3 p-4">
          <p className="text-xs text-muted-foreground">Simulation : rien n'est envoyé, rien n'est écrit sur une fiche.</p>
          <div className="flex flex-wrap gap-2">
            <Segments libelle="Posteur" options={[{ cle: "faux", contenu: "Faux posteur" }, { cle: "vrai", contenu: "Vrai posteur" }]} actif={mode} onChange={setMode} />
            <Segments libelle="Source" options={[{ cle: "help", contenu: "Help" }, { cle: "slack_salon", contenu: "Salon Slack" }]} actif={source} onChange={setSource} />
          </div>
          {mode === "faux" ? (
            <div className="flex flex-wrap gap-2 text-sm">
              <select aria-label="Plateforme" className={SEL} value={profil.plateforme} onChange={(e) => setProfil({ ...profil, plateforme: e.target.value as ProfilFictif["plateforme"] })}>
                <option value="upwork">Upwork</option>
                <option value="ruul">Ruul</option>
              </select>
              <select aria-label="Zone" className={SEL} value={profil.zone} onChange={(e) => setProfil({ ...profil, zone: e.target.value })}>
                {["A", "B", "C"].map((z) => <option key={z} value={z}>Zone {z}</option>)}
              </select>
              <select aria-label="Étape" className={SEL} value={profil.etape} onChange={(e) => setProfil({ ...profil, etape: e.target.value })}>
                {["inscription", "warmup", "posting"].map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
              <Input aria-label="Prénom" className="h-8 w-28" value={profil.prenom} onChange={(e) => setProfil({ ...profil, prenom: e.target.value })} />
            </div>
          ) : (
            <div className="space-y-1">
              <Input aria-label="Chercher un posteur" placeholder="Prénom, nom ou email" value={recherche}
                onChange={(e) => { setRecherche(e.target.value); setPosteur(null); }} />
              {posteur ? (
                <p className="text-sm">Posteur : <b>{posteur.nom}</b> ({posteur.plateforme === "ruul" ? "Ruul" : "Upwork"})</p>
              ) : (
                <div className="flex flex-col gap-1">
                  {(trouves.data ?? []).map((p) => (
                    <button key={p.id} type="button" className="rounded border px-2 py-1 text-left text-sm hover:bg-muted/50" onClick={() => setPosteur(p)}>
                      {p.nom} <span className="text-muted-foreground">· {p.email ?? ""} · {p.plateforme === "ruul" ? "Ruul" : "Upwork"}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <Textarea aria-label="Message du posteur" rows={4} placeholder="Le message du posteur…" value={message} onChange={(e) => setMessage(e.target.value)} />
          <Button disabled={!pret || sim.isPending} onClick={() => sim.mutate()} data-testid="bot-simuler">
            {sim.isPending ? "Le bot réfléchit…" : "Tester"}
          </Button>
          <Erreur e={sim.error} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4" data-testid="bot-resultat">
          {!r && <p className="text-sm text-muted-foreground">La réponse du bot s'affiche ici.</p>}
          {r && (
            <>
              <p className="whitespace-pre-wrap rounded-md bg-muted/50 p-3 text-sm">{r.texte}</p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                <dt className="text-muted-foreground">Catégorie</dt><dd>{r.decision.categorie}</dd>
                <dt className="text-muted-foreground">Niveau</dt><dd><BadgeNiveau n={r.decision.niveau} /></dd>
                <dt className="text-muted-foreground">Action</dt>
                <dd>{r.decision.action ? `${LIBELLE_ACTION[r.decision.action] ?? r.decision.action}${r.decision.action_valeur ? ` : ${r.decision.action_valeur}` : ""}` : "aucune"}</dd>
                <dt className="text-muted-foreground">Catalogue</dt><dd>{r.regle_utilisee ?? "aucune entrée"}</dd>
                <dt className="text-muted-foreground">Risque</dt><dd>{r.decision.risque.length ? r.decision.risque.join(", ") : "aucun"}</dd>
                <dt className="text-muted-foreground">Raison</dt><dd>{r.decision.raison}</dd>
              </dl>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" disabled={bonne.isPending} onClick={() => bonne.mutate(r)}>👍 Bonne réponse</Button>
                <Button size="sm" variant="outline" onClick={() => setCorrection(correction === null ? r.decision.reponse : null)}>✏️ Corriger</Button>
              </div>
              {correction !== null && (
                <div className="space-y-2">
                  <Textarea aria-label="Bonne réponse" rows={4} value={correction} onChange={(e) => setCorrection(e.target.value)} />
                  <Button size="sm" disabled={correction.trim().length < 3 || corriger.isPending} onClick={() => corriger.mutate(r)}>Proposer au catalogue</Button>
                </div>
              )}
              {note && <p className="text-sm text-emerald-700 dark:text-emerald-300">{note}</p>}
              <Erreur e={bonne.error ?? corriger.error} />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// --- Catalogue ------------------------------------------------------------------

function Catalogue() {
  const catalogue = useQuery({ queryKey: ["bot", "catalogue"], queryFn: lireCatalogue });
  const [f, setF] = React.useState<{ q: string; portee: "" | Portee; categorie: string; inactifs: boolean }>({ q: "", portee: "", categorie: "", inactifs: false });
  const [edition, setEdition] = React.useState<EntreeCatalogue | "nouvelle" | null>(null);
  const liste = catalogue.data ?? [];
  const categories = [...new Set(liste.map((e) => e.categorie ?? "autre"))].sort();
  const visibles = filtrerCatalogue(liste, f);
  const parCategorie = new Map<string, EntreeCatalogue[]>();
  for (const e of visibles) parCategorie.set(e.categorie ?? "autre", [...(parCategorie.get(e.categorie ?? "autre") ?? []), e]);

  return (
    <div className="space-y-4">
      <Infos />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Input aria-label="Chercher" placeholder="Chercher…" className="h-8 w-56" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
        <select aria-label="Plateforme" className={SEL} value={f.portee} onChange={(e) => setF({ ...f, portee: e.target.value as "" | Portee })}>
          <option value="">Plateforme : toutes</option>
          <option value="upwork">Upwork</option>
          <option value="ruul">Ruul</option>
          <option value="tous">Tous</option>
        </select>
        <select aria-label="Catégorie" className={SEL} value={f.categorie} onChange={(e) => setF({ ...f, categorie: e.target.value })}>
          <option value="">Catégorie : toutes</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <label className="flex items-center gap-1"><input type="checkbox" checked={f.inactifs} onChange={(e) => setF({ ...f, inactifs: e.target.checked })} />Désactivées aussi</label>
        <Button size="sm" onClick={() => setEdition("nouvelle")}>+ Ajouter</Button>
      </div>
      <Erreur e={catalogue.error} />
      {edition && <Edition e={edition === "nouvelle" ? null : edition} onFini={() => setEdition(null)} />}
      {[...parCategorie.entries()].map(([cat, entrees]) => (
        <div key={cat} className="space-y-2">
          <h3 className="text-sm font-semibold capitalize">{cat} <span className="font-normal text-muted-foreground">({entrees.length})</span></h3>
          {entrees.map((e) => (
            <button key={e.id} type="button" onClick={() => setEdition(e)} data-testid="catalogue-ligne"
              className={`block w-full rounded-md border p-3 text-left text-sm hover:bg-muted/50 ${e.actif ? "" : "opacity-60"}`}>
              <span className="flex flex-wrap items-center gap-1.5">
                <span className="font-medium">{e.question}</span>
                <BadgeNiveau n={e.niveau} />
                <Badge variant="outline">{e.portee === "tous" ? "Tous" : e.portee === "ruul" ? "Ruul" : "Upwork"}</Badge>
                {e.action && <Badge variant="outline">{LIBELLE_ACTION[e.action] ?? e.action}</Badge>}
                {!e.valide_at && <Badge variant="secondary">à valider</Badge>}
                {!e.actif && <Badge variant="secondary">désactivée</Badge>}
              </span>
              <span className="mt-1 block truncate text-muted-foreground">{e.reponse}</span>
              {e.formulations.length > 1 && <span className="block text-xs text-muted-foreground">{e.formulations.length} formulations</span>}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

function versChamps(e: EntreeCatalogue | null): ChampsCatalogue {
  return {
    question: e?.question ?? "", formulations: e?.formulations ?? [], reponse: e?.reponse ?? "", action: e?.action ?? null,
    niveau: e?.niveau ?? "bot", portee: e?.portee ?? "tous", categorie: e?.categorie ?? null, actif: e?.actif ?? true, valide: e ? e.valide_at !== null : true,
  };
}

/** Ajout ou modification. Après l'enregistrement, les tests repassent : un test vert devenu rouge est signalé, avec retour arrière. */
function Edition({ e, onFini }: { e: EntreeCatalogue | null; onFini: () => void }) {
  const qc = useQueryClient();
  const [c, setC] = React.useState<ChampsCatalogue>(versChamps(e));
  const [alerte, setAlerte] = React.useState<{ id: string; rouges: string[] } | null>(null);
  const historique = useQuery({ queryKey: ["bot", "historique", e?.id], queryFn: () => lireHistorique(e!.id), enabled: !!e });
  const tests = useQuery({ queryKey: ["bot", "tests"], queryFn: lireTests });
  const sauver = useMutation({
    mutationFn: async () => {
      const avant = tests.data ?? (await lireTests());
      const id = await enregistrerEntree(e?.id ?? null, c);
      const apres = await lancerTests(null);
      return { id, rouges: regressions(avant.filter((t) => t.actif), apres) };
    },
    onSuccess: ({ id, rouges }) => {
      void qc.invalidateQueries({ queryKey: ["bot"] });
      if (rouges.length) setAlerte({ id, rouges });
      else onFini();
    },
  });
  const annuler = useMutation({
    mutationFn: async () => {
      const h = await lireHistorique(alerte!.id);
      if (h[0]?.avant) await restaurer(h[0].id);
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["bot"] }); onFini(); },
  });
  const retour = useMutation({ mutationFn: restaurer, onSuccess: () => { void qc.invalidateQueries({ queryKey: ["bot"] }); onFini(); } });
  const valide = c.question.trim().length > 2 && c.reponse.trim().length > 2;

  return (
    <Card className="border-primary">
      <CardContent className="space-y-3 p-4" data-testid="catalogue-edition">
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="space-y-1 text-sm sm:col-span-2">Question type
            <Input value={c.question} onChange={(x) => setC({ ...c, question: x.target.value })} />
          </label>
          <label className="space-y-1 text-sm sm:col-span-2">Autres formulations (une par ligne)
            <Textarea rows={3} value={c.formulations.join("\n")} onChange={(x) => setC({ ...c, formulations: x.target.value.split("\n") })} />
          </label>
          <label className="space-y-1 text-sm sm:col-span-2">Réponse (anglais, 3 phrases au plus)
            <Textarea rows={4} value={c.reponse} onChange={(x) => setC({ ...c, reponse: x.target.value })} />
          </label>
          <label className="space-y-1 text-sm">Action
            <select className={`${SEL} w-full`} value={c.action ?? ""} onChange={(x) => setC({ ...c, action: x.target.value || null })}>
              <option value="">aucune</option>
              {ACTIONS.map((a) => <option key={a} value={a}>{LIBELLE_ACTION[a]}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm">Niveau
            <select className={`${SEL} w-full`} value={c.niveau} onChange={(x) => setC({ ...c, niveau: x.target.value as Niveau })}>
              {NIVEAUX.map((n) => <option key={n} value={n}>{LIBELLE_NIVEAU[n]}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm">Plateforme
            <select className={`${SEL} w-full`} value={c.portee} onChange={(x) => setC({ ...c, portee: x.target.value as Portee })}>
              <option value="tous">Tous</option>
              <option value="upwork">Upwork</option>
              <option value="ruul">Ruul</option>
            </select>
          </label>
          <label className="space-y-1 text-sm">Catégorie
            <Input value={c.categorie ?? ""} onChange={(x) => setC({ ...c, categorie: x.target.value || null })} />
          </label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={c.actif} onChange={(x) => setC({ ...c, actif: x.target.checked })} />Active</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={c.valide} onChange={(x) => setC({ ...c, valide: x.target.checked })} />Validée (le bot l'utilise)</label>
        </div>
        {alerte ? (
          <div className="space-y-2 rounded-md border border-red-300 bg-red-50 p-3 text-sm dark:border-red-800 dark:bg-red-950/40" data-testid="catalogue-alerte">
            <p>⚠️ Ce changement fait échouer {alerte.rouges.length} test(s) qui passaient avant.</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={annuler.isPending} onClick={() => annuler.mutate()}>Annuler le changement</Button>
              <Button size="sm" variant="destructive" onClick={onFini}>Garder quand même</Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={!valide || sauver.isPending} onClick={() => sauver.mutate()}>
              {sauver.isPending ? "Enregistrement et tests…" : "Enregistrer"}
            </Button>
            <Button size="sm" variant="ghost" onClick={onFini}>Fermer</Button>
          </div>
        )}
        <Erreur e={sauver.error ?? annuler.error ?? retour.error} />
        {e && (historique.data ?? []).length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground">Historique ({historique.data!.length})</summary>
            <ul className="mt-2 space-y-1">
              {historique.data!.map((h) => (
                <li key={h.id} className="flex flex-wrap items-center gap-2">
                  <span className="text-muted-foreground">{new Date(h.at).toLocaleString("fr-FR")}</span>
                  <span className="truncate">{h.avant ? `« ${(h.avant.reponse ?? "").slice(0, 80)} »` : "création"}</span>
                  {h.avant && <Button size="sm" variant="ghost" disabled={retour.isPending} onClick={() => retour.mutate(h.id)}>Revenir à cette version</Button>}
                </li>
              ))}
            </ul>
          </details>
        )}
      </CardContent>
    </Card>
  );
}

function Infos() {
  const qc = useQueryClient();
  const infos = useQuery({ queryKey: ["bot", "infos"], queryFn: lireInfos });
  const [ouvert, setOuvert] = React.useState<string | null>(null);
  const [valeur, setValeur] = React.useState("");
  const sauver = useMutation({
    mutationFn: (i: { cle: string; titre: string }) => modifierInfo(i.cle, i.titre, valeur),
    onSuccess: () => { setOuvert(null); void qc.invalidateQueries({ queryKey: ["bot", "infos"] }); },
  });
  return (
    <Card>
      <CardContent className="space-y-2 p-4" data-testid="bot-infos">
        <h3 className="text-sm font-semibold">Infos à connaître <span className="font-normal text-muted-foreground">(dates, montants, liens, règles : le bot s'y tient)</span></h3>
        <Erreur e={infos.error ?? sauver.error} />
        {(infos.data ?? []).map((i) => (
          <div key={i.cle} className="text-sm">
            {ouvert === i.cle ? (
              <div className="space-y-1">
                <p className="font-medium">{i.titre}</p>
                <Textarea rows={2} value={valeur} onChange={(e) => setValeur(e.target.value)} />
                <div className="flex gap-2">
                  <Button size="sm" disabled={valeur.trim().length < 1 || sauver.isPending} onClick={() => sauver.mutate(i)}>Enregistrer</Button>
                  <Button size="sm" variant="ghost" onClick={() => setOuvert(null)}>Annuler</Button>
                </div>
              </div>
            ) : (
              <button type="button" className="w-full text-left hover:underline" onClick={() => { setOuvert(i.cle); setValeur(i.valeur); }}>
                <span className="font-medium">{i.titre} :</span> <span className="text-muted-foreground">{i.valeur}</span>
              </button>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// --- Tests automatiques ---------------------------------------------------------

function Tests() {
  const qc = useQueryClient();
  const tests = useQuery({ queryKey: ["bot", "tests"], queryFn: lireTests });
  const [dernier, setDernier] = React.useState<ResultatTests | null>(null);
  const [nouveau, setNouveau] = React.useState(false);
  const lancer = useMutation({
    mutationFn: (ids: string[] | null) => lancerTests(ids),
    onSuccess: (r) => { setDernier(r); void qc.invalidateQueries({ queryKey: ["bot", "tests"] }); },
  });
  const basculer = useMutation({ mutationFn: (t: BotTest) => activerTest(t.id, !t.actif), onSuccess: () => qc.invalidateQueries({ queryKey: ["bot", "tests"] }) });
  const liste = tests.data ?? [];
  const actifs = liste.filter((t) => t.actif);
  const verts = actifs.filter((t) => t.dernier_ok).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={lancer.isPending || actifs.length === 0} onClick={() => lancer.mutate(null)} data-testid="tests-lancer">
          {lancer.isPending ? "Tests en cours (1 à 2 min)…" : "Lancer tous les tests"}
        </Button>
        <span className="text-sm" data-testid="tests-score">{verts}/{actifs.length} verts</span>
        {dernier && <span className="text-sm text-muted-foreground">Dernier passage : {dernier.verts}/{dernier.total}</span>}
        <Button size="sm" variant="outline" onClick={() => setNouveau(!nouveau)}>+ Ajouter un test</Button>
      </div>
      <Erreur e={tests.error ?? lancer.error ?? basculer.error} />
      {nouveau && <NouveauTest onFini={() => setNouveau(false)} />}
      <div className="space-y-2">
        {liste.map((t) => (
          <div key={t.id} className={`rounded-md border p-3 text-sm ${t.actif ? "" : "opacity-60"}`} data-testid="test-ligne">
            <div className="flex flex-wrap items-center gap-2">
              <span aria-label={t.dernier_ok ? "vert" : t.dernier_ok === false ? "rouge" : "jamais lancé"}>
                {t.dernier_ok ? "🟢" : t.dernier_ok === false ? "🔴" : "⚪"}
              </span>
              <span className="font-medium">{t.note ?? "Test"}</span>
              {t.attendu_niveau && <span className="text-xs text-muted-foreground">attendu : <BadgeNiveau n={t.attendu_niveau} /></span>}
              {t.attendu_action && <Badge variant="outline">{LIBELLE_ACTION[t.attendu_action] ?? t.attendu_action}</Badge>}
              <span className="ml-auto flex gap-1">
                <Button size="sm" variant="ghost" disabled={lancer.isPending} onClick={() => lancer.mutate([t.id])}>Relancer</Button>
                <Button size="sm" variant="ghost" onClick={() => basculer.mutate(t)}>{t.actif ? "Désactiver" : "Activer"}</Button>
              </span>
            </div>
            <p className="mt-1 text-muted-foreground">« {t.message} »</p>
            {t.dernier && (
              <p className="mt-1 whitespace-pre-wrap text-xs">
                <BadgeNiveau n={t.dernier.decision.niveau} /> {t.dernier.decision.action ? `· ${LIBELLE_ACTION[t.dernier.decision.action] ?? t.dernier.decision.action} ` : ""}· {t.dernier.texte}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function NouveauTest({ onFini }: { onFini: () => void }) {
  const qc = useQueryClient();
  const [message, setMessage] = React.useState("");
  const [niveau, setNiveau] = React.useState<Niveau | "">("bot");
  const [action, setAction] = React.useState("");
  const [contient, setContient] = React.useState("");
  const [note, setNote] = React.useState("");
  const [plateforme, setPlateforme] = React.useState<"upwork" | "ruul">("upwork");
  const ajouter = useMutation({
    mutationFn: () => ajouterTest({
      message: message.trim(), source: "help", attendu_niveau: niveau || null, attendu_action: action || null,
      attendu_contient: contient.split(",").map((x) => x.trim()), note: note.trim() || "Test", profil: { ...PROFIL_DEFAUT, plateforme },
    }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["bot", "tests"] }); onFini(); },
  });
  return (
    <Card>
      <CardContent className="grid gap-2 p-4 sm:grid-cols-2">
        <Input aria-label="Nom du test" placeholder="Nom du test" value={note} onChange={(e) => setNote(e.target.value)} />
        <select aria-label="Plateforme du test" className={SEL} value={plateforme} onChange={(e) => setPlateforme(e.target.value as "upwork" | "ruul")}>
          <option value="upwork">Faux posteur Upwork</option>
          <option value="ruul">Faux posteur Ruul</option>
        </select>
        <Textarea aria-label="Message du test" className="sm:col-span-2" rows={3} placeholder="Le message du posteur" value={message} onChange={(e) => setMessage(e.target.value)} />
        <select aria-label="Niveau attendu" className={SEL} value={niveau} onChange={(e) => setNiveau(e.target.value as Niveau | "")}>
          <option value="">Niveau : peu importe</option>
          {NIVEAUX.map((n) => <option key={n} value={n}>{LIBELLE_NIVEAU[n]}</option>)}
        </select>
        <select aria-label="Action attendue" className={SEL} value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="">Action : aucune</option>
          {ACTIONS.map((a) => <option key={a} value={a}>{LIBELLE_ACTION[a]}</option>)}
        </select>
        <Input aria-label="La réponse contient" className="sm:col-span-2" placeholder="La réponse contient (mots séparés par des virgules)" value={contient} onChange={(e) => setContient(e.target.value)} />
        <div className="flex gap-2 sm:col-span-2">
          <Button size="sm" disabled={message.trim().length < 2 || ajouter.isPending} onClick={() => ajouter.mutate()}>Ajouter</Button>
          <Button size="sm" variant="ghost" onClick={onFini}>Annuler</Button>
        </div>
        <Erreur e={ajouter.error} />
      </CardContent>
    </Card>
  );
}

// --- Suivi ------------------------------------------------------------------------

function Suivi() {
  const suivi = useQuery({ queryKey: ["bot", "suivi"], queryFn: lireSuivi, refetchInterval: 120_000 });
  const [filtre, setFiltre] = React.useState<"" | Niveau | "repetees">("");
  const liste = suivi.data ?? [];
  const rep = repetees(liste);
  const c = compteurs(liste);
  const visibles = liste.filter((d) => (filtre === "repetees" ? rep.has(d.id) : !filtre || (d.niveau ?? "adrien") === filtre));

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2" data-testid="suivi-compteurs">
        {NIVEAUX.map((n) => (
          <Card key={n}>
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">{LIBELLE_NIVEAU[n]} · 7 jours</p>
              <p className={`text-2xl font-semibold ${n === "max" && c.max >= OBJECTIF_MAX ? "text-destructive" : ""}`}>{c[n]}</p>
              {n === "max" && <p className="text-xs text-muted-foreground">objectif : moins de {OBJECTIF_MAX}</p>}
            </CardContent>
          </Card>
        ))}
      </div>
      <Segments libelle="Filtre" actif={filtre} onChange={setFiltre} options={[
        { cle: "", contenu: "Toutes" }, { cle: "bot", contenu: "Bot seul" }, { cle: "adrien", contenu: "Adrien" }, { cle: "max", contenu: "Max" },
        { cle: "repetees", contenu: `Question répétée (${rep.size})` },
      ]} />
      <Erreur e={suivi.error} />
      {visibles.length === 0 && !suivi.isLoading && <p className="text-sm text-muted-foreground">Rien sur les 7 derniers jours.</p>}
      <div className="space-y-2">
        {visibles.map((d) => (
          <div key={d.id} className="rounded-md border p-3 text-sm" data-testid="suivi-ligne">
            <div className="flex flex-wrap items-center gap-2">
              <BadgeNiveau n={d.niveau} />
              <span className="font-medium">{d.categorie ?? d.type}</span>
              <span className="text-muted-foreground">· {d.plateforme === "ruul" ? "Ruul" : "Upwork"} · {d.source} · {new Date(d.cree_at).toLocaleString("fr-FR")}</span>
              {rep.has(d.id) && <Badge variant="outline">répétée</Badge>}
              {d.action_faite && <Badge variant="outline">{d.action_faite}</Badge>}
            </div>
            <p className="mt-1">« {d.texte.slice(0, 300)} »</p>
            {d.bot_reponse && <p className="mt-1 whitespace-pre-wrap text-muted-foreground">→ {d.bot_reponse}</p>}
            {d.raison && <p className="mt-1 text-xs text-muted-foreground">{d.raison}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
