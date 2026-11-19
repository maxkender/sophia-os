/**
 * 19/11 (Max) : la Bible des comptes, en moodboard. Les comptes rangés par app (Atala, Micabo, Sophia, Idées, puis
 * Sans label) puis par label (nom, badge, DA), chacun avec ses 3 derniers TikToks en miniatures.
 *
 * 19/11 (Adrien) : la Bible est le chemin de l'import, d'un bout à l'autre, un onglet par étape :
 *   Source proposals → À importer → Prochain batch   (à la main ; les propositions viennent de l'agent éclaireur)
 *   → En import → À l'essai → Weekly update     (calculé depuis l'état réel de la source)
 *   et trois sorties : Essai raté (gardée, plus importée), Arrêtées (désactivée), Corbeille.
 * « Lancer l'import » crée les sources du prochain batch ; plus rien ne se coche « importé » à la main. Les onglets
 * des sources montrent ce que montre la page Sources (r, stock, état, décision du lundi), qui reste en place.
 * Admin au sens strict (RLS + route).
 */
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Check, ChevronRight, Pencil, Plus, Rocket, Search, Undo2 } from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { nomLangue } from "@/features/moteur/langues";
import { cn } from "@/lib/utils";

import { DialogueAjout, DialogueCarte, DialogueChoixLabel, DialogueLabel } from "./DialoguesBible";
import { type ComptePret, DialogueLancement } from "./LancementBatch";
import {
  type Blocage, blocageImport, blocsVersesDans, type CarteLabel, carteValidable, changerCarte, changerEtape, type CompteBible, compterEtapes, detacherCarte, estPodzValide, estVueSource,
  etapeAvantImport, lancerBatch, LIBELLE_BADGE, LIBELLE_BLOCAGE, lireCartes, lireComptes, mettreCorbeille, modifierCompte, nomCarte, rafraichirMiniatures, ranger,
  restaurerCompte, type Section, SECTIONS, supprimerDefinitivement, valeurDuLabel, validerCarte, validerPodz, type Vue, VUES,
} from "./moodboard";
import { deciderProposition, lirePropositions, passerDansLaBible, type Proposition } from "./propositions";
import { compterSources, ligneResultat, lireSources, regleDeLaVue, REGLES_DEFAUT, sectionDuLabel, sourcesParHandle } from "./sources";
import { type ActionsTuile, TuileCompte } from "./TuileCompte";
import { type ActionsProposition, VuePropositions } from "./VuePropositions";
import { VueSources } from "./VueSources";

const TEINTE: Record<Section | "sans", { pastille: string; texte: string }> = {
  atala: { pastille: "bg-emerald-500", texte: "text-emerald-700" },
  micabo: { pastille: "bg-violet-400", texte: "text-violet-700" },
  sophia: { pastille: "bg-pink-400", texte: "text-pink-700" },
  idees: { pastille: "bg-teal-400", texte: "text-teal-700" },
  sans: { pastille: "bg-stone-300", texte: "text-stone-500" },
};

const BOUTON_BLOC = "inline-flex h-7 items-center gap-1 rounded-full border border-stone-200 bg-white px-2.5 text-[11px] font-medium text-stone-700 hover:border-stone-400 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200";

const BADGE: Record<CarteLabel["badge"], string> = {
  existe: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  nouveau: "bg-sky-50 text-sky-700 ring-sky-200",
  propose: "bg-violet-50 text-violet-700 ring-violet-200",
  a_confirmer: "bg-amber-50 text-amber-700 ring-amber-200",
  idee: "bg-stone-100 text-stone-600 ring-stone-200",
};

export function PageBible() {
  const qc = useQueryClient();
  const comptes = useQuery({ queryKey: ["bible", "comptes"], queryFn: lireComptes });
  const cartes = useQuery({ queryKey: ["bible", "cartes"], queryFn: lireCartes });
  // Tant qu'une source neuve s'importe, la page se relit seule : on la voit avancer puis changer d'onglet.
  const donnees = useQuery({
    queryKey: ["bible", "sources"],
    queryFn: lireSources,
    refetchInterval: (q) => (q.state.data?.sources.some((s) => s.neuve) ? 10_000 : q.state.data?.file.enCours ? 20_000 : false),
  });
  const propositions = useQuery({ queryKey: ["bible", "propositions"], queryFn: lirePropositions });
  const [vue, setVue] = React.useState<Vue>("a_importer");
  const [recherche, setRecherche] = React.useState("");
  const [section, setSection] = React.useState<Section | "sans" | "">("");
  const [podzer, setPodzer] = React.useState(false);
  const [ajout, setAjout] = React.useState(false);
  const [aRanger, setARanger] = React.useState<CompteBible | null>(null);
  const [lancement, setLancement] = React.useState<ComptePret[] | null>(null);
  const [blocAModifier, setBlocAModifier] = React.useState<CarteLabel | null>(null);
  /** La proposition qu'on envoie dans le prochain batch : on choisit d'abord son label. */
  const [propositionARanger, setPropositionARanger] = React.useState<Proposition | null>(null);
  const [occupes, setOccupes] = React.useState<Set<string>>(new Set());
  const [erreur, setErreur] = React.useState<string | null>(null);
  /** Ce qu'une action vient de faire (un compte lancé, un bloc rattaché), dit en une phrase. */
  const [info, setInfoComplete] = React.useState<{ texte: string; annuler?: () => Promise<string> } | null>(null);
  const setInfo = (texte: string | null, annuler?: () => Promise<string>) => setInfoComplete(texte === null ? null : { texte, annuler });

  const liste = React.useMemo(() => comptes.data ?? [], [comptes.data]);
  const toutes = React.useMemo(() => cartes.data ?? [], [cartes.data]);
  const sources = React.useMemo(() => donnees.data?.sources ?? [], [donnees.data]);
  const regles = donnees.data?.regles ?? REGLES_DEFAUT;
  // Tous les labels de l'OS : un compte ou un bloc se rattache à n'importe lequel, pas seulement à ceux qui ont déjà un bloc.
  const labelsOs = React.useMemo(() => (donnees.data?.labels ?? []).map((l) => ({ id: l.id, nom: l.nom })).sort((a, b) => a.nom.localeCompare(b.nom)), [donnees.data]);

  const carteParId = React.useMemo(() => new Map(toutes.map((c) => [c.id, c])), [toutes]);
  const sourceParHandle = React.useMemo(() => sourcesParHandle(sources), [sources]);
  const carteDe = (c: CompteBible) => (c.label_propose_id ? carteParId.get(c.label_propose_id) ?? null : null);
  // L'onglet d'un compte avant l'import ; `null` : sa source existe, il se lit dans les onglets des sources.
  const etapeDe = (c: CompteBible) => etapeAvantImport(c, carteDe(c), sourceParHandle.get(c.handle));

  // Les comptes à podzer validés : jamais importés, rangés dans « Weekly update » (catégorie Podz), à titre indicatif.
  const podz = liste.filter(estPodzValide);
  const nSources = compterSources(sources);
  const n: Record<Vue, number> = {
    propositions: propositions.data?.length ?? 0, ...compterEtapes(liste, etapeDe), ...nSources, weekly: nSources.weekly + podz.length,
  };
  // Les onglets tenus à la main sur des comptes de la Bible (pas les propositions, pas les sources).
  const vueComptes = vue !== "propositions" && !estVueSource(vue);
  const groupes = vueComptes ? ranger(liste, toutes, { etape: vue, recherche, section, podzer }, etapeDe) : [];
  const rafraichir = () => { void qc.invalidateQueries({ queryKey: ["bible"] }); };

  // Le prochain batch : qui peut partir, et ce qui bloque les autres.
  const batch = liste.filter((c) => !c.supprime_at && etapeDe(c) === "prochain_batch");
  const blocageDe = (c: CompteBible): Blocage => blocageImport(c, carteDe(c), sourceParHandle.get(c.handle));
  const prets: ComptePret[] = batch.filter((c) => blocageDe(c) === "pret").map((compte) => ({ compte, carte: carteDe(compte)! }));
  const bloques = (Object.keys(LIBELLE_BLOCAGE) as Blocage[])
    .filter((b) => b !== "pret")
    .map((b) => ({ b, nb: batch.filter((c) => blocageDe(c) === b).length }))
    .filter((x) => x.nb > 0);

  const q = recherche.trim().toLowerCase().replace(/^@/, "");
  const podzVisibles = podz.filter((c) => (!section || (carteDe(c)?.section ?? "sans") === section)
    && (!q || c.handle.includes(q) || (c.note_import ?? "").toLowerCase().includes(q) || (c.remarque ?? "").toLowerCase().includes(q)));
  const podzDuBatch = batch.filter((c) => c.a_podzer);

  const agir = async (c: CompteBible, f: () => Promise<unknown>) => {
    setErreur(null);
    setInfo(null);
    setOccupes((s) => new Set(s).add(c.id));
    try {
      await f();
      await qc.invalidateQueries({ queryKey: ["bible"] });
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setOccupes((s) => { const x = new Set(s); x.delete(c.id); return x; });
    }
  };
  const actions: ActionsTuile = {
    onEtape: (c, e) => void agir(c, () => changerEtape([c.id], e)),
    onChangerLabel: (c) => setARanger(c),
    onModifier: (c, p) => void agir(c, () => modifierCompte(c.id, p)),
    onSupprimer: (c) => void agir(c, () => mettreCorbeille(c.id)),
    onRestaurer: (c) => void agir(c, () => restaurerCompte(c.id)),
    onSupprimerDefinitivement: (c) => { if (window.confirm(`Supprimer @${c.handle} pour de bon ? (On ne pourra plus le restaurer.)`)) void agir(c, () => supprimerDefinitivement(c.id)); },
    onImporter: (c) => importer(c),
    onPodz: (c, valide) => void agir(c, () => validerPodz([c.id], valide)),
  };
  // « Importer » sur une tuile : le compte part seul, tout de suite. Sans langue connue, la fenêtre de lancement la demande.
  const importer = (c: CompteBible) => {
    const carte = carteDe(c);
    if (!carte || blocageDe(c) !== "pret") return;
    if (!c.langue) { setLancement([{ compte: c, carte }]); return; }
    const langue = c.langue;
    if (!window.confirm(`Importer @${c.handle} maintenant ? Label ${nomCarte(carte)}, TikToks en ${nomLangue(langue).toLowerCase()}.\n\nCoût : un relevé Apify, puis l'analyse de chaque post importé (Gemini).`)) return;
    void agir(c, async () => {
      const [r] = await lancerBatch([{ id: c.id, langue }]);
      if (!r) throw new Error(`@${c.handle} n'a pas été lancé.`);
      const l = ligneResultat(r, regles);
      if (!l.ok) throw new Error(l.texte);
      setInfo(l.texte);
    });
  };
  // Défaire la dernière action (un rattachement) : elle rend sa phrase, les blocs sont relus.
  const annuler = async (f: () => Promise<string>) => {
    setErreur(null);
    try {
      setInfo(await f());
      rafraichir();
    } catch (e) {
      setErreur((e as Error).message);
    }
  };
  const detacher = (bloc: CarteLabel) => annuler(async () => {
    const d = await detacherCarte(bloc.id);
    return `Rattachement annulé : ${d.comptes} compte${d.comptes > 1 ? "s" : ""} de retour sous « ${nomCarte(bloc)} ».`;
  });
  const validerLesPodz = async () => {
    setErreur(null);
    try {
      await validerPodz(podzDuBatch.map((c) => c.id));
      setInfo(`${podzDuBatch.length} compte${podzDuBatch.length > 1 ? "s" : ""} à podzer validé${podzDuBatch.length > 1 ? "s" : ""} : dans « Weekly update », catégorie Podz.`);
      rafraichir();
    } catch (e) {
      setErreur((e as Error).message);
    }
  };
  // Une proposition de l'éclaireur : elle entre dans la Bible (puis ses miniatures arrivent), ou elle est décidée.
  const surProposition = async (p: Proposition, f: () => Promise<unknown>) => {
    setErreur(null);
    setOccupes((s) => new Set(s).add(p.id));
    try {
      await f();
      await qc.invalidateQueries({ queryKey: ["bible"] });
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setOccupes((s) => { const x = new Set(s); x.delete(p.id); return x; });
    }
  };
  // La proposition entre dans la Bible. `carte` absent : sous le label que l'agent proposait ; donné : le bloc choisi.
  const passer = (p: Proposition, etape: "a_importer" | "prochain_batch", carte?: CarteLabel | null) => surProposition(p, async () => {
    const r = await passerDansLaBible(p.id, etape, carte);
    // Ses 3 derniers TikToks, en arrière-plan : la tuile les montre dès qu'ils sont copiés.
    if (r.bibleId) void rafraichirMiniatures(r.bibleId).catch(() => null).then(rafraichir);
  });
  const actionsProposition: ActionsProposition = {
    // « À importer » : un clic. « Prochain batch » : on choisit (ou on crée) d'abord le label, pour qu'il parte prêt.
    onPasser: (p, etape) => { if (etape === "prochain_batch") setPropositionARanger(p); else void passer(p, etape); },
    onDecider: (p, statut, raison) => void surProposition(p, () => deciderProposition(p.id, statut, raison)),
  };
  const validerLabel = async (carte: CarteLabel) => {
    const app = SECTIONS.find((s) => s.cle === carte.section)?.libelle ?? carte.section;
    if (!window.confirm(`Créer le label « ${carte.nom} » pour ${app} ? Il devient un vrai label de l'OS, et les comptes de cette carte pourront être importés.`)) return;
    setErreur(null);
    try {
      await validerCarte(carte.id);
      rafraichir();
    } catch (e) {
      setErreur((e as Error).message);
    }
  };

  return (
    <div className="space-y-6" data-testid="page-bible">
      <PageHeader
        title="Bible des comptes"
        description="Le chemin d'un compte, de son repérage à sa mise à jour de chaque lundi : un onglet par étape, les comptes rangés par app puis par label."
        actions={<Button onClick={() => setAjout(true)}><Plus className="size-4" /> Ajouter des comptes</Button>}
      />

      <div className="space-y-3">
        <div role="tablist" aria-label="Étape" className="flex flex-wrap items-center gap-y-1.5">
          {VUES.map((e, i) => (
            <React.Fragment key={e.cle}>
              {i > 0 && e.chemin && <ChevronRight className="mx-0.5 size-4 shrink-0 text-stone-300" aria-hidden />}
              {i > 0 && !e.chemin && <span className={cn("h-5 shrink-0", VUES[i - 1]!.chemin ? "mx-2.5 w-px bg-stone-300 dark:bg-stone-700" : "w-1")} aria-hidden />}
              <button
                role="tab"
                type="button"
                aria-selected={vue === e.cle}
                onClick={() => setVue(e.cle)}
                className={cn(
                  "rounded-full px-3.5 py-1.5 text-sm transition",
                  vue === e.cle ? "bg-stone-900 font-semibold text-white shadow-sm dark:bg-white dark:text-stone-900" : "bg-stone-100 text-stone-600 hover:bg-stone-200 hover:text-stone-900 dark:bg-stone-800 dark:text-stone-300",
                )}
              >
                {e.libelle} <span className={cn("ml-1 tabular-nums", vue === e.cle ? "text-stone-300 dark:text-stone-500" : "text-stone-400")}>{n[e.cle]}</span>
              </button>
            </React.Fragment>
          ))}
        </div>
        <p className="max-w-4xl text-sm text-stone-600 dark:text-stone-400" data-testid="regle-etape">
          {vue !== "corbeille" && (
            <span className="mr-2 rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-600 dark:bg-stone-800 dark:text-stone-300">
              {estVueSource(vue) ? "Automatique" : "À la main"}
            </span>
          )}
          {regleDeLaVue(vue, regles)}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-stone-400" aria-hidden />
          <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="@handle" className="h-9 w-48 rounded-full border border-stone-200 bg-white pl-8 pr-3 text-sm dark:border-stone-700 dark:bg-stone-900" />
        </div>
        {vueComptes && (
          <button
            type="button"
            aria-pressed={podzer}
            onClick={() => setPodzer((x) => !x)}
            className={cn("h-9 rounded-full border px-3 text-sm transition", podzer ? "border-teal-600 bg-teal-50 text-teal-800" : "border-stone-200 bg-white text-stone-600 hover:border-stone-400 dark:border-stone-700 dark:bg-stone-900")}
          >
            À podzer <span className="tabular-nums text-stone-400">{liste.filter((c) => (vue === "corbeille" ? c.supprime_at : !c.supprime_at && etapeDe(c) === vue) && c.a_podzer).length}</span>
          </button>
        )}
        <select value={section} onChange={(e) => setSection(e.target.value as Section | "sans" | "")} className="h-9 rounded-full border border-stone-200 bg-white px-3 text-sm dark:border-stone-700 dark:bg-stone-900" aria-label="App">
          <option value="">Toutes les apps</option>
          {SECTIONS.map((s) => <option key={s.cle} value={s.cle}>{s.libelle}</option>)}
        </select>
      </div>

      {vue === "prochain_batch" && batch.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-white px-5 py-3 shadow-sm dark:border-stone-800 dark:bg-stone-900" data-testid="barre-batch">
          <p className="text-sm text-stone-600">
            <b className="text-stone-900 dark:text-white">{batch.length}</b> compte{batch.length > 1 ? "s" : ""} dans le prochain batch,{" "}
            <b className="text-stone-900 dark:text-white">{prets.length}</b> prêt{prets.length > 1 ? "s" : ""} à importer.
            {bloques.length > 0 && <span className="text-stone-500"> Les autres : {bloques.map((x) => `${LIBELLE_BLOCAGE[x.b]} (${x.nb})`).join(", ")}.</span>}
          </p>
          <div className="flex flex-wrap gap-2">
            {podzDuBatch.length > 0 && <Button variant="outline" onClick={() => void validerLesPodz()}><Check className="size-4" /> Valider les podz ({podzDuBatch.length})</Button>}
            <Button onClick={() => setLancement(prets)} disabled={prets.length === 0}><Rocket className="size-4" /> Lancer l'import ({prets.length})</Button>
          </div>
        </div>
      )}
      {erreur && <p className="text-sm text-destructive">{erreur}</p>}
      {info && (
        <p className="flex flex-wrap items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200" data-testid="info">
          {info.texte}
          <span className="ml-auto flex gap-3">
            {info.annuler && <button type="button" className="text-xs font-semibold underline underline-offset-2" onClick={() => void annuler(info.annuler!)}>Annuler</button>}
            <button type="button" className="text-xs underline-offset-2 hover:underline" onClick={() => setInfo(null)}>Fermer</button>
          </span>
        </p>
      )}
      {(comptes.isLoading || cartes.isLoading || (estVueSource(vue) && donnees.isLoading) || (vue === "propositions" && propositions.isLoading)) && <p className="text-sm text-stone-500">Chargement…</p>}
      {vue === "propositions" && propositions.isError && <p className="text-sm text-destructive">Les propositions n'ont pas pu être lues : {(propositions.error as Error).message}</p>}
      {donnees.isError && <p className="text-sm text-destructive">Les sources n'ont pas pu être lues : {(donnees.error as Error).message}</p>}

      {vue === "propositions" ? (
        propositions.data && (
          <VuePropositions
            propositions={propositions.data}
            recherche={recherche}
            section={section}
            sectionDe={(labelId) => sectionDuLabel(labelId, toutes, donnees.data?.labels ?? [])}
            handlesBible={new Set(liste.filter((c) => !c.supprime_at).map((c) => c.handle))}
            actions={actionsProposition}
            occupes={occupes}
          />
        )
      ) : estVueSource(vue) ? (
        <>
          {donnees.data && <VueSources etape={vue} donnees={donnees.data} cartes={toutes} recherche={recherche} section={section} />}
          {vue === "weekly" && podzVisibles.length > 0 && (
            <section className="space-y-4 rounded-3xl bg-stone-50 p-4 sm:p-6 dark:bg-stone-950" data-testid="podz">
              <div className="space-y-1">
                <h2 className="flex items-baseline gap-2.5">
                  <span className="size-2.5 translate-y-[-2px] rounded-full bg-teal-400" aria-hidden />
                  <span className="text-xl font-semibold tracking-tight text-stone-900 dark:text-white">Podz</span>
                  <span className="text-sm tabular-nums text-stone-400">· {podzVisibles.length} compte{podzVisibles.length > 1 ? "s" : ""}</span>
                </h2>
                <p className="text-sm text-stone-500">À titre indicatif : ces comptes inspirent un podz. Ils ne sont ni importés ni mis à jour.</p>
              </div>
              <div className="flex flex-wrap gap-3">
                {podzVisibles.map((c) => <TuileCompte key={c.id} c={c} actions={actions} occupe={occupes.has(c.id)} podzValide />)}
              </div>
            </section>
          )}
        </>
      ) : (
        <div className="space-y-10 rounded-3xl bg-stone-50 p-4 sm:p-6 dark:bg-stone-950" data-testid="moodboard">
          {!comptes.isLoading && groupes.length === 0 && (
            <p className="py-10 text-center text-sm text-stone-500">{vue === "prochain_batch" ? "Aucun compte dans le prochain batch : passe-les depuis « À importer »." : vue === "corbeille" ? "La corbeille est vide." : "Aucun compte ici."}</p>
          )}
          {groupes.map((g) => {
            const s = SECTIONS.find((x) => x.cle === g.section)!;
            return (
              <section key={g.section} className="space-y-4" data-section={g.section}>
                <h2 className="flex items-baseline gap-2.5">
                  <span className={cn("size-2.5 translate-y-[-2px] rounded-full", TEINTE[g.section].pastille)} aria-hidden />
                  <span className="text-xl font-semibold tracking-tight text-stone-900 dark:text-white">{s.libelle}</span>
                  {s.sous && <span className="text-sm text-stone-400">{s.sous}</span>}
                  <span className="text-sm tabular-nums text-stone-400">· {g.total} compte{g.total > 1 ? "s" : ""}</span>
                </h2>
                <div className="space-y-4">
                  {g.cartes.map(({ carte, comptes: cs }) => (
                    <div key={carte?.id ?? "sans"} className="rounded-2xl border border-stone-200/70 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:border-stone-800 dark:bg-stone-900" data-carte={carte ? nomCarte(carte) : "sans_label"}>
                      {carte && (
                        <div className="mb-3 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <code className="text-[15px] font-semibold text-stone-900 dark:text-white">{nomCarte(carte)}</code>
                            <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium ring-1", BADGE[carte.badge])}>{LIBELLE_BADGE[carte.badge]}</span>
                            <span className="text-xs tabular-nums text-stone-400">{cs.length}</span>
                            {/* Un rattachement se défait : le bloc qui a pris un label le rend, ou celui qui a reçu des comptes les rend. */}
                            {vue !== "corbeille" && (carte.rattachement && !carte.rattachement.fusion && carte.label_id || blocsVersesDans(carte, toutes).length > 0) && (
                              <span className="ml-auto flex flex-wrap gap-1.5">
                                {carte.rattachement && !carte.rattachement.fusion && carte.label_id && (
                                  <button type="button" onClick={() => void detacher(carte)} title={`Ce bloc s'appelait « ${carte.nom} » avant d'être rattaché à ${carte.rattachement.label}.`} className={BOUTON_BLOC}>
                                    <Undo2 className="size-3.5" aria-hidden />
                                    Annuler le rattachement
                                  </button>
                                )}
                                {blocsVersesDans(carte, toutes).map((origine) => (
                                  <button key={origine.id} type="button" onClick={() => void detacher(origine)} title="Ces comptes ont été rangés ici par un rattachement." className={BOUTON_BLOC}>
                                    <Undo2 className="size-3.5" aria-hidden />
                                    Rendre {origine.rattachement!.comptes.length} compte{origine.rattachement!.comptes.length > 1 ? "s" : ""} à « {nomCarte(origine)} »
                                  </button>
                                ))}
                              </span>
                            )}
                            {/* Un bloc dont le label n'existe pas encore : on le crée, on le corrige, ou on le rattache à un label de l'OS. */}
                            {vue !== "corbeille" && !carte.label_id && (
                              <span className="ml-auto flex flex-wrap gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setBlocAModifier(carte)}
                                  title="Corriger ce label proposé, ou rattacher le bloc à un label qui existe déjà dans l'OS."
                                  className="inline-flex h-7 items-center gap-1 rounded-full border border-stone-200 bg-white px-2.5 text-[11px] font-medium text-stone-700 hover:border-stone-400 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200"
                                >
                                  <Pencil className="size-3.5" aria-hidden />
                                  Modifier ou rattacher
                                </button>
                                {carteValidable(carte) && (
                                  <button
                                    type="button"
                                    onClick={() => void validerLabel(carte)}
                                    title="Ce label n'existe pas encore dans l'OS : ses comptes ne peuvent pas être importés tant qu'il n'est pas créé."
                                    className="inline-flex h-7 items-center gap-1 rounded-full border border-stone-200 bg-white px-2.5 text-[11px] font-medium text-stone-700 hover:border-stone-400 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200"
                                  >
                                    <BadgeCheck className="size-3.5" aria-hidden />
                                    Créer ce label
                                  </button>
                                )}
                              </span>
                            )}
                          </div>
                          {carte.description_da && <p className="max-w-3xl text-sm text-stone-500">{carte.description_da}</p>}
                        </div>
                      )}
                      <div className="flex flex-wrap gap-3">
                        {cs.map(({ compte, aussi }) => (
                          <TuileCompte
                            key={compte.id + (aussi ? "-aussi" : "")}
                            c={compte}
                            aussi={aussi}
                            actions={actions}
                            occupe={occupes.has(compte.id)}
                            source={vue === "corbeille" ? null : sourceParHandle.get(compte.handle)}
                            blocage={vue === "corbeille" ? undefined : blocageDe(compte)}
                            montrerBlocage={vue === "prochain_batch"}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <DialogueLabel compte={aRanger} cartes={toutes} labels={labelsOs} onFermer={() => setARanger(null)} onChoisir={async (carte) => { if (aRanger) await agir(aRanger, () => changerCarte(aRanger.id, carte)); }} />
      <DialogueAjout ouvert={ajout} cartes={toutes} labels={labelsOs} onFermer={() => setAjout(false)} onFini={rafraichir} />
      <DialogueChoixLabel
        cible={propositionARanger ? { handle: propositionARanger.handle, valeur: propositionARanger.sorte === "label" ? valeurDuLabel(propositionARanger.labelId, toutes, labelsOs) : "" } : null}
        titre="Envoyer dans le prochain batch"
        bouton="Envoyer"
        sansLabel
        aide="Choisis le label du compte : un bloc de la Bible, un label de l'OS, ou un nouveau. Sans label, il ne pourra pas être importé."
        cartes={toutes}
        labels={labelsOs}
        onFermer={() => setPropositionARanger(null)}
        onChoisir={async (carte) => { if (propositionARanger) await passer(propositionARanger, "prochain_batch", carte); }}
      />
      <DialogueCarte
        carte={blocAModifier}
        labels={labelsOs}
        cartes={toutes}
        nbComptes={blocAModifier ? liste.filter((c) => !c.supprime_at && c.label_propose_id === blocAModifier.id).length : 0}
        sectionDe={(labelId) => sectionDuLabel(labelId, toutes, donnees.data?.labels ?? [])}
        onFermer={() => setBlocAModifier(null)}
        onFini={(message, defaire) => { setErreur(null); setInfo(message, defaire); rafraichir(); }}
      />
      <DialogueLancement
        prets={lancement}
        regles={regles}
        onFermer={() => setLancement(null)}
        onFini={rafraichir}
        onVoir={() => { setLancement(null); setVue("en_import"); }}
      />
    </div>
  );
}
