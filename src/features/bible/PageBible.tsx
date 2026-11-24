/**
 * 19/11 (Max) : la Bible des comptes, en moodboard. Les comptes rangés par app (Atala, Micabo, Sophia, Idées, puis
 * Sans label) puis par label (nom, badge, DA), chacun avec ses 3 derniers TikToks en miniatures.
 *
 * 19/11 (Adrien) : la Bible est le chemin de l'import, d'un bout à l'autre, un onglet par étape :
 *   Propositions → À importer → Prochain batch   (à la main ; les propositions viennent de l'agent éclaireur)
 *   → En import → À l'essai → Mise à jour hebdo     (calculé depuis l'état réel de la source)
 *   et trois sorties : Essai raté (gardée, plus importée), Arrêtées (désactivée), Corbeille.
 * « Lancer l'import » crée les sources du prochain batch ; plus rien ne se coche « importé » à la main. Les onglets
 * des sources montrent ce que montre la page Sources (r, stock, état, décision du lundi), qui reste en place.
 *
 * 20/11 (Adrien) : « à podzer » se marque sur le LABEL (l'en-tête de son bloc), plus sur chaque compte. Un label à
 * podzer n'est jamais importé ; validé, il se range avec ses comptes dans « Mise à jour hebdo », catégorie Podz.
 * 23/11 : chaque app (tout son contenu) et chaque label se replie et se déplie (retenu dans le navigateur), et un
 * label se fusionne dans un autre (« Fusionner ») ; la fusion s'annule depuis le bloc qui a reçu les comptes.
 * 23/11 (refonte de l'écran) : un label tient sur UNE ligne, replié par défaut (chevron, nom, statut, nombre), ses
 * actions dans un menu « ⋯ » ; trois statuts seulement (rien : le label existe ; « à créer » ; « podz ») ; six
 * onglets pour le chemin et un menu « Sorties » (Essai raté, Arrêtées, Corbeille) ; la règle de l'étape dans une
 * bulle « i » ; les apps en pastilles avec leur nombre ; onglets et filtres collés en haut de l'écran.
 * 24/11 : actions groupées. On coche des tuiles (ou tout un label, ou tout l'onglet), puis une barre en bas de
 * l'écran les passe d'un coup dans une étape, sous un label, à l'import, à la corbeille (ou les restaure).
 *
 * Admin au sens strict (RLS + route).
 */
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, BadgeCheck, Check, ChevronDown, ChevronRight, GitMerge, Info, Pencil, Plus, RotateCcw, Rocket, Search, Sparkles, Tags, Trash2, Undo2, X } from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { DialogueAjout, DialogueCarte, DialogueChoixLabel, DialogueFusion, DialogueLabel } from "./DialoguesBible";
import { type ComptePret, DialogueLancement } from "./LancementBatch";
import {
  type Blocage, blocageImport, blocsVersesDans, type CarteLabel, carteValidable, changerCarte, changerEtape, type CompteBible, compterEtapes, detacherCarte, estPodzValide, estVueSource,
  etapeAvantImport, LIBELLE_BADGE, LIBELLE_BLOCAGE, lireApplications, lireCartes, lireComptes, marquerPodz, mettreCorbeille, modifierCompte, nomCarte, rafraichirMiniatures, ranger,
  restaurerCompte, type Section, SECTIONS, supprimerDefinitivement, valeurDuLabel, validerCarte, validerPodz, type Vue, VUES,
} from "./moodboard";
import { LigneLabel, TitreApp } from "./Bloc";
import { type EntreeMenu, MenuActions } from "./MenuActions";
import { BarrePliage } from "./Pli";
import { usePliage } from "./pliage";
import { PanneauSujets } from "./PanneauSujets";
import { chargerApercus, deciderProposition, lirePropositions, LOT_APERCUS, passerDansLaBible, type Proposition, sansApercu } from "./propositions";
import { compterSources, lireSources, rangerSources, regleDeLaVue, REGLES_DEFAUT, sectionDuLabel, sourcesParHandle } from "./sources";
import { couleurSection, PASTILLE_A_CREER, PASTILLE_PODZ } from "./teintes";
import { type ActionsTuile, TuileCompte } from "./TuileCompte";
import { type ActionsProposition, VuePropositions } from "./VuePropositions";
import { VueSources } from "./VueSources";

const BOUTON_BLOC = "inline-flex h-7 items-center gap-1 rounded-full border border-stone-200 bg-white px-2.5 text-[11px] font-medium text-stone-700 hover:border-stone-400 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200";
const BOUTON_BLOC_FORT = "inline-flex h-7 items-center gap-1 rounded-full border border-stone-900 bg-stone-900 px-2.5 text-[11px] font-medium text-white hover:bg-stone-800 dark:border-white dark:bg-white dark:text-stone-900";
const ONGLET = "inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-3 py-1 text-[13px] transition";
const ONGLET_ACTIF = "bg-stone-900 font-semibold text-white dark:bg-white dark:text-stone-900";
const ONGLET_REPOS = "text-stone-600 hover:bg-stone-100 hover:text-stone-900 dark:text-stone-300 dark:hover:bg-stone-800";

export function PageBible() {
  const qc = useQueryClient();
  const comptes = useQuery({ queryKey: ["bible", "comptes"], queryFn: lireComptes });
  const cartes = useQuery({ queryKey: ["bible", "cartes"], queryFn: lireCartes });
  // Les applications de l'OS : chacune a sa section (la lecture complète la liste `SECTIONS`, puis la page se redessine).
  // Hors de la clé « bible » : une action sur un compte ne relit pas les applications.
  useQuery({ queryKey: ["applications-de-la-bible"], queryFn: lireApplications, staleTime: 5 * 60_000 });
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
  const [blocAFusionner, setBlocAFusionner] = React.useState<CarteLabel | null>(null);
  const pliage = usePliage();
  /** La proposition qu'on envoie dans le prochain batch : on choisit d'abord son label. */
  const [propositionARanger, setPropositionARanger] = React.useState<Proposition | null>(null);
  const [occupes, setOccupes] = React.useState<Set<string>>(new Set());
  /** Les comptes cochés pour une action groupée. Vidée à chaque changement d'onglet. */
  const [selection, setSelection] = React.useState<Set<string>>(new Set());
  const [labelGroupe, setLabelGroupe] = React.useState(false);
  React.useEffect(() => { setSelection(new Set()); }, [vue]);
  const [erreur, setErreur] = React.useState<string | null>(null);
  /** Ce qu'une action vient de faire (un compte lancé, un bloc rattaché), dit en une phrase. */
  const [info, setInfoComplete] = React.useState<{ texte: string; annuler?: () => Promise<string> } | null>(null);
  const setInfo = (texte: string | null, annuler?: () => Promise<string>) => setInfoComplete(texte === null ? null : { texte, annuler });

  // Les aperçus des propositions (les miniatures de leurs posts d'exemple) : cherchés par lots de 5 tant que
  // l'onglet est ouvert, les plus récentes d'abord. Chaque proposition n'est demandée qu'une fois par visite ; si le
  // relevé ne répond pas, on s'arrête là.
  const apercusDemandes = React.useRef(new Set<string>());
  const apercusEnCours = React.useRef(false);
  React.useEffect(() => {
    if (vue !== "propositions" || apercusEnCours.current) return;
    const lot = (propositions.data ?? []).filter((p) => !apercusDemandes.current.has(p.id) && sansApercu(p)).slice(0, LOT_APERCUS);
    if (!lot.length) return;
    apercusEnCours.current = true;
    for (const p of lot) apercusDemandes.current.add(p.id);
    void chargerApercus(lot.map((p) => p.id))
      .then((suite) => { apercusEnCours.current = false; if (suite) void qc.invalidateQueries({ queryKey: ["bible", "propositions"] }); })
      .catch(() => { apercusEnCours.current = false; });
  }, [vue, propositions.data, qc]);

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

  // Les labels à podzer validés : jamais importés, rangés avec leurs comptes dans « Mise à jour hebdo » (catégorie Podz).
  const blocsPodz = toutes.filter(estPodzValide);
  const podz = liste.filter((c) => !c.supprime_at && estPodzValide(carteDe(c)));
  const nSources = compterSources(sources);
  const n: Record<Vue, number> = {
    propositions: propositions.data?.length ?? 0, ...compterEtapes(liste, etapeDe), ...nSources, weekly: nSources.weekly + podz.length,
  };
  // Les onglets tenus à la main sur des comptes de la Bible (pas les propositions, pas les sources).
  const vueComptes = vue !== "propositions" && !estVueSource(vue);
  const groupes = vueComptes ? ranger(liste, toutes, { etape: vue, recherche, section, podzer }, etapeDe) : [];
  // Toutes apps confondues : le nombre affiché sur chaque pastille d'app (inconnu dans « Propositions »).
  const groupesSources = estVueSource(vue) && donnees.data ? rangerSources(donnees.data.sources, donnees.data.labels, toutes, { etape: vue, recherche, section: "" }) : [];
  const parApp = new Map<string, number>(
    vueComptes ? ranger(liste, toutes, { etape: vue, recherche, section: "", podzer }, etapeDe).map((g) => [g.section, g.total]) : groupesSources.map((g) => [g.section, g.total]),
  );
  const sourcesVues = groupesSources.filter((g) => !section || g.section === section);
  const rafraichir = () => { void qc.invalidateQueries({ queryKey: ["bible"] }); };

  // La sélection ne vaut que pour les comptes affichés (filtres et recherche compris) : un compte coché puis masqué
  // par un filtre n'est pas emporté par l'action groupée.
  const visibles = new Map<string, CompteBible>();
  for (const g of groupes) for (const x of g.cartes) for (const { compte } of x.comptes) visibles.set(compte.id, compte);
  const choisis = [...visibles.values()].filter((c) => selection.has(c.id));
  const basculerSelection = (ids: string[]) => setSelection((s) => {
    const n = new Set(s);
    const tous = ids.every((id) => n.has(id));
    for (const id of ids) { if (tous) n.delete(id); else n.add(id); }
    return n;
  });

  // Le prochain batch : qui peut partir, et ce qui bloque les autres.
  const batch = liste.filter((c) => !c.supprime_at && etapeDe(c) === "prochain_batch");
  const blocageDe = (c: CompteBible): Blocage => blocageImport(carteDe(c), sourceParHandle.get(c.handle));
  const prets: ComptePret[] = batch.filter((c) => blocageDe(c) === "pret").map((compte) => ({ compte, carte: carteDe(compte)! }));
  const bloques = (Object.keys(LIBELLE_BLOCAGE) as Blocage[])
    .filter((b) => b !== "pret")
    .map((b) => ({ b, nb: batch.filter((c) => blocageDe(c) === b).length }))
    .filter((x) => x.nb > 0);

  const q = recherche.trim().toLowerCase().replace(/^@/, "");
  const podzVisibles = blocsPodz
    .filter((bloc) => !section || bloc.section === section)
    .map((bloc) => {
      const duBloc = podz.filter((c) => c.label_propose_id === bloc.id);
      const nomTrouve = !q || nomCarte(bloc).toLowerCase().includes(q);
      // La recherche garde le bloc entier si son nom répond, sinon seulement ses comptes qui répondent.
      const comptesVus = nomTrouve ? duBloc : duBloc.filter((c) => c.handle.includes(q) || (c.note_import ?? "").toLowerCase().includes(q) || (c.remarque ?? "").toLowerCase().includes(q));
      return { bloc, comptes: comptesVus, garde: nomTrouve || comptesVus.length > 0 };
    })
    .filter((x) => x.garde);
  // Les labels à podzer du prochain batch, pas encore validés.
  const podzDuBatch = toutes.filter((bloc) => bloc.a_podzer && !bloc.podz_valide_at && batch.some((c) => c.label_propose_id === bloc.id));

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
  };
  // « Importer » sur une tuile : la fenêtre de lancement s'ouvre pour ce seul compte, langue de ses TikToks
  // pré-remplie (si connue) et modifiable. Elle ne partait avant qu'après une simple confirmation (24/11).
  const importer = (c: CompteBible) => {
    const carte = carteDe(c);
    if (!carte || blocageDe(c) !== "pret") return;
    setLancement([{ compte: c, carte }]);
  };
  // Une action sur tous les comptes cochés : elle dit ce qu'elle a fait, et la sélection se vide si elle a réussi.
  const agirGroupe = async (f: (ids: string[]) => Promise<unknown>, message: string) => {
    const ids = choisis.map((c) => c.id);
    if (!ids.length) return;
    setErreur(null);
    setInfo(null);
    setOccupes((s) => new Set([...s, ...ids]));
    try {
      await f(ids);
      await qc.invalidateQueries({ queryKey: ["bible"] });
      setSelection(new Set());
      setInfo(message);
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setOccupes((s) => { const x = new Set(s); for (const id of ids) x.delete(id); return x; });
    }
  };
  const nComptes = (k: number) => `${k} compte${k > 1 ? "s" : ""}`;
  const pretsChoisis: ComptePret[] = choisis.filter((c) => blocageDe(c) === "pret").map((compte) => ({ compte, carte: carteDe(compte)! }));
  const groupe = {
    etape: (e: "a_importer" | "prochain_batch") => void agirGroupe(
      (ids) => changerEtape(ids, e),
      `${nComptes(choisis.length)} ${e === "prochain_batch" ? "passé(s) dans le prochain batch" : "renvoyé(s) dans « À importer »"}.`,
    ),
    corbeille: () => {
      if (!window.confirm(`Mettre ${nComptes(choisis.length)} à la corbeille ? (Ils se restaurent depuis Sorties → Corbeille.)`)) return;
      void agirGroupe((ids) => mettreCorbeille(ids), `${nComptes(choisis.length)} à la corbeille.`);
    },
    restaurer: () => void agirGroupe((ids) => restaurerCompte(ids), `${nComptes(choisis.length)} restauré(s).`),
    supprimer: () => {
      if (!window.confirm(`Supprimer ${nComptes(choisis.length)} pour de bon ? (On ne pourra plus les restaurer.)`)) return;
      void agirGroupe((ids) => supprimerDefinitivement(ids), `${nComptes(choisis.length)} supprimé(s) pour de bon.`);
    },
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
  // Une action sur un label à podzer (le marquer, valider son podz, le retirer) : elle dit ce qu'elle a fait.
  const surPodz = async (f: () => Promise<void>, message: string) => {
    setErreur(null);
    try {
      await f();
      setInfo(message);
      rafraichir();
    } catch (e) {
      setErreur((e as Error).message);
    }
  };
  const basculerPodz = (bloc: CarteLabel) => surPodz(
    () => marquerPodz(bloc.id, !bloc.a_podzer),
    bloc.a_podzer
      ? `« ${nomCarte(bloc)} » n'est plus à podzer : ses comptes peuvent de nouveau être importés.`
      : `« ${nomCarte(bloc)} » est à podzer : ses comptes ne seront pas importés. Valide le podz pour le ranger dans « Mise à jour hebdo ».`,
  );
  const validerPodzDuBloc = (bloc: CarteLabel, valide: boolean) => surPodz(
    () => validerPodz([bloc.id], valide),
    valide
      ? `Podz validé : « ${nomCarte(bloc)} » est dans « Mise à jour hebdo », catégorie Podz, avec ses comptes.`
      : `« ${nomCarte(bloc)} » est retiré des podz validés : ses comptes reviennent dans leurs onglets.`,
  );
  const validerLesPodz = () => surPodz(
    () => validerPodz(podzDuBatch.map((bloc) => bloc.id)),
    `${podzDuBatch.length} label${podzDuBatch.length > 1 ? "s" : ""} à podzer validé${podzDuBatch.length > 1 ? "s" : ""} : dans « Mise à jour hebdo », catégorie Podz.`,
  );
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

  // Une recherche montre ce qu'elle trouve : rien ne reste replié.
  const cherche = q !== "";
  const plie = (cle: string) => !cherche && pliage.estPlie(cle);
  const sorties = VUES.filter((e) => !e.chemin);
  const sortieActive = sorties.find((e) => e.cle === vue);
  const nSorties = sorties.reduce((t, e) => t + n[e.cle], 0);
  const clesApps = vueComptes ? groupes.map((g) => `app:${g.section}`) : sourcesVues.map((g) => `app:${g.section}`);
  const clesLabels = vueComptes
    ? groupes.flatMap((g) => g.cartes.filter((x) => x.carte).map((x) => `label:${x.carte!.id}`))
    : [...sourcesVues.flatMap((g) => g.cartes.filter((x) => x.carte).map((x) => `source:${x.carte!.cle}`)), ...(vue === "weekly" ? podzVisibles.map((x) => `podz:${x.bloc.id}`) : [])];

  /** Les statuts d'un label : rien s'il existe dans l'OS (le cas normal), « à créer », « podz ». */
  const statuts = (carte: CarteLabel, valide?: boolean) => (
    <>
      {!carte.label_id && <span className={PASTILLE_A_CREER} title={`Label ${LIBELLE_BADGE[carte.badge]} : il n'existe pas encore dans l'OS, ses comptes ne peuvent pas être importés.`}>à créer</span>}
      {carte.a_podzer && (
        <span className={PASTILLE_PODZ} title={valide ? "Podz validé : ses comptes servent d'inspiration, ils ne sont ni importés ni mis à jour." : "Ce label est à faire en podz : ses comptes ne sont pas importés."}>
          <Sparkles className="size-3" aria-hidden />{valide ? "podz validé" : "podz"}
        </span>
      )}
    </>
  );
  /** Le menu « ⋯ » d'un label : tout ce qui n'est pas l'action du moment. */
  const menuDuLabel = (carte: CarteLabel): (EntreeMenu | false | null)[] => [
    { libelle: "Fusionner", icone: GitMerge, titre: "Verser tous les comptes de ce label dans un autre label. La fusion s'annule depuis le label qui les reçoit.", onClick: () => setBlocAFusionner(carte) },
    {
      libelle: carte.a_podzer ? "Plus à podzer" : "À podzer",
      icone: Sparkles,
      titre: carte.a_podzer ? "Ce label ne sera plus à podzer : ses comptes pourront être importés." : "Marquer ce label à podzer : on en fait un podz, ses comptes ne sont pas importés.",
      onClick: () => void basculerPodz(carte),
    },
    // Un bloc dont le label n'existe pas encore : on le corrige, on le rattache à un label de l'OS, ou on le crée.
    !carte.label_id && { libelle: "Modifier ou rattacher", icone: Pencil, titre: "Corriger ce label proposé, ou rattacher le bloc à un label qui existe déjà dans l'OS.", onClick: () => setBlocAModifier(carte) },
    !carte.label_id && carteValidable(carte) && { libelle: "Créer ce label", icone: BadgeCheck, titre: "Ce label n'existe pas encore dans l'OS : ses comptes ne peuvent pas être importés tant qu'il n'est pas créé.", onClick: () => void validerLabel(carte) },
    // Un rattachement se défait : le bloc qui a pris un label le rend, ou celui qui a reçu des comptes les rend.
    Boolean(carte.rattachement && !carte.rattachement.fusion && carte.label_id) && {
      libelle: "Annuler le rattachement", icone: Undo2, titre: `Ce bloc s'appelait « ${carte.nom} » avant d'être rattaché à ${carte.rattachement?.label}.`, onClick: () => void detacher(carte),
    },
    ...blocsVersesDans(carte, toutes).map((origine): EntreeMenu => ({
      libelle: `Rendre ${origine.rattachement!.comptes.length} compte${origine.rattachement!.comptes.length > 1 ? "s" : ""} à « ${nomCarte(origine)} »`,
      icone: Undo2, titre: "Ces comptes ont été rangés ici par un rattachement.", onClick: () => void detacher(origine),
    })),
  ];

  return (
    <div className="space-y-5" data-testid="page-bible">
      <PageHeader
        title="Bible des comptes"
        description="Le chemin d'un compte, du repérage à sa mise à jour de chaque lundi."
        actions={<Button onClick={() => setAjout(true)}><Plus className="size-4" /> Ajouter des comptes</Button>}
      />

      {/* Onglets et filtres restent en haut de l'écran quand on défile (sous la barre du haut, sur grand écran). */}
      <div className="-mx-4 space-y-2 border-b border-stone-200/80 bg-background/95 px-4 py-2.5 backdrop-blur lg:sticky lg:top-14 lg:z-20 lg:-mx-8 lg:px-8 dark:border-stone-800">
        <div className="flex flex-wrap items-center gap-y-1">
          <div role="tablist" aria-label="Étape" className="flex min-w-0 max-w-full items-center gap-y-1 max-sm:overflow-x-auto sm:flex-wrap">
            {VUES.filter((e) => e.chemin).map((e, i) => (
              <React.Fragment key={e.cle}>
                {i > 0 && <ChevronRight className="size-3.5 shrink-0 text-stone-300" aria-hidden />}
                <button role="tab" type="button" aria-selected={vue === e.cle} onClick={() => setVue(e.cle)} className={cn(ONGLET, vue === e.cle ? ONGLET_ACTIF : ONGLET_REPOS)}>
                  {e.libelle} <span className={cn("ml-1.5 tabular-nums", vue === e.cle ? "text-stone-300 dark:text-stone-500" : "text-stone-400")}>{n[e.cle]}</span>
                </button>
              </React.Fragment>
            ))}
          </div>
          <span className="mx-2 h-4 w-px shrink-0 bg-stone-300 dark:bg-stone-700" aria-hidden />
          <MenuActions
            nom="Sorties"
            aGauche
            classeBouton={cn(ONGLET, "gap-1", sortieActive ? ONGLET_ACTIF : ONGLET_REPOS)}
            declencheur={<>{sortieActive ? sortieActive.libelle : "Sorties"} <span className={cn("tabular-nums", sortieActive ? "text-stone-300 dark:text-stone-500" : "text-stone-400")}>{sortieActive ? n[sortieActive.cle] : nSorties}</span><ChevronDown className="size-3.5" aria-hidden /></>}
            entrees={sorties.map((e) => ({ libelle: e.libelle, compte: n[e.cle], actif: vue === e.cle, onClick: () => setVue(e.cle) }))}
          />
          {/* La règle de l'étape : dans une bulle, pour qui veut la lire. */}
          <details key={vue} className="group relative ml-auto" data-testid="regle-etape">
            <summary aria-label="Comment marche cette étape" title="Comment marche cette étape" className="inline-flex size-8 cursor-pointer list-none items-center justify-center rounded-full text-stone-400 transition hover:bg-stone-100 hover:text-stone-900 group-open:bg-stone-100 group-open:text-stone-900 dark:hover:bg-stone-800 dark:hover:text-white [&::-webkit-details-marker]:hidden">
              <Info className="size-4" aria-hidden />
            </summary>
            <p className="absolute right-0 top-full z-10 mt-1 w-[min(30rem,calc(100vw-2rem))] rounded-xl border border-stone-200 bg-white p-3 text-[13px] leading-relaxed text-stone-600 shadow-lg dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300">
              {vue !== "corbeille" && (
                <span className="mr-2 rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-600 dark:bg-stone-800 dark:text-stone-300">
                  {estVueSource(vue) ? "Automatique" : "À la main"}
                </span>
              )}
              {regleDeLaVue(vue, regles)}
            </p>
          </details>
        </div>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-stone-400" aria-hidden />
            <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="@handle" aria-label="Rechercher" className="h-8 w-40 rounded-full border border-stone-200 bg-white pl-8 pr-3 text-[13px] dark:border-stone-700 dark:bg-stone-900" />
          </div>
          <div role="group" aria-label="App" className="flex flex-wrap items-center gap-1">
            {[{ cle: "" as const, libelle: "Toutes" }, ...SECTIONS]
              .filter((s) => s.cle === "" || s.cle === section || vue === "propositions" || (parApp.get(s.cle) ?? 0) > 0)
              .map((s) => (
                <button
                  key={s.cle}
                  type="button"
                  aria-pressed={section === s.cle}
                  onClick={() => setSection(s.cle)}
                  className={cn("inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-[13px] transition", section === s.cle ? "border-stone-900 bg-stone-900 font-medium text-white dark:border-white dark:bg-white dark:text-stone-900" : "border-stone-200 bg-white text-stone-600 hover:border-stone-400 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300")}
                >
                  {s.cle !== "" && <span className="size-2 rounded-full" style={{ backgroundColor: couleurSection(s.cle) }} aria-hidden />}
                  {s.libelle}
                  {s.cle !== "" && parApp.has(s.cle) && <span className={cn("tabular-nums", section === s.cle ? "text-stone-300 dark:text-stone-500" : "text-stone-400")}>{parApp.get(s.cle)}</span>}
                </button>
              ))}
          </div>
          {vueComptes && (
            <button
              type="button"
              aria-pressed={podzer}
              onClick={() => setPodzer((x) => !x)}
              className={cn("inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-[13px] transition", podzer ? "border-teal-600 bg-teal-50 text-teal-800" : "border-stone-200 bg-white text-stone-600 hover:border-stone-400 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300")}
            >
              <Sparkles className="size-3.5" aria-hidden />À podzer <span className="tabular-nums text-stone-400">{liste.filter((c) => (vue === "corbeille" ? c.supprime_at : !c.supprime_at && etapeDe(c) === vue) && carteDe(c)?.a_podzer).length}</span>
            </button>
          )}
          {vueComptes && visibles.size > 0 && (
            <button
              type="button"
              onClick={() => basculerSelection([...visibles.keys()])}
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-stone-200 bg-white px-2.5 text-[13px] text-stone-600 hover:border-stone-400 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300"
            >
              <Check className="size-3.5" aria-hidden />
              {choisis.length === visibles.size ? "Tout désélectionner" : `Tout sélectionner (${visibles.size})`}
            </button>
          )}
          {vue !== "propositions" && !cherche && <span className="ml-auto"><BarrePliage pliage={pliage} apps={clesApps} labels={clesLabels} /></span>}
        </div>
      </div>

      {vue === "prochain_batch" && batch.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white px-4 py-2.5 dark:border-stone-800 dark:bg-stone-900" data-testid="barre-batch">
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
      {vue === "propositions" && <PanneauSujets />}

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
          {donnees.data && <VueSources etape={vue} donnees={donnees.data} cartes={toutes} recherche={recherche} section={section} pliage={pliage} />}
          {vue === "weekly" && podzVisibles.length > 0 && (
            <div className="space-y-1" data-testid="podz">
              <TitreApp libelle="Podz" detail={`· ${podzVisibles.length} label${podzVisibles.length > 1 ? "s" : ""} faits en podz : leurs comptes servent d'inspiration, ils ne sont ni importés ni mis à jour`} teinte="#2dd4bf">
                {podzVisibles.map(({ bloc, comptes: cs }) => (
                  <LigneLabel
                    key={bloc.id}
                    cle={nomCarte(bloc)}
                    nom={nomCarte(bloc)}
                    plie={plie(`podz:${bloc.id}`)}
                    onBasculer={() => pliage.basculer(`podz:${bloc.id}`)}
                    statuts={statuts(bloc, true)}
                    nb={cs.length}
                    description={bloc.description_da}
                    actions={(
                      <button type="button" onClick={() => void validerPodzDuBloc(bloc, false)} title="Le label reste à podzer ; ses comptes reviennent dans « À importer » ou « Prochain batch »." className={BOUTON_BLOC}>
                        <ArrowLeft className="size-3.5" aria-hidden />
                        Retirer des podz
                      </button>
                    )}
                  >
                    {cs.length === 0 && <p className="text-sm text-stone-400">Aucun compte sous ce label.</p>}
                    {cs.map((c) => <TuileCompte key={c.id} c={c} actions={actions} occupe={occupes.has(c.id)} podzValide />)}
                  </LigneLabel>
                ))}
              </TitreApp>
            </div>
          )}
        </>
      ) : (
        <div className="space-y-7" data-testid="moodboard">
          {!comptes.isLoading && groupes.length === 0 && (
            <p className="py-10 text-center text-sm text-stone-500">{vue === "prochain_batch" ? "Aucun compte dans le prochain batch : passe-les depuis « À importer »." : vue === "corbeille" ? "La corbeille est vide." : "Aucun compte ici."}</p>
          )}
          {groupes.map((g) => {
            const s = SECTIONS.find((x) => x.cle === g.section)!;
            const nLabels = g.cartes.filter((x) => x.carte).length;
            return (
              <TitreApp
                key={g.section}
                section={g.section}
                libelle={s.libelle}
                sous={s.sous}
                detail={`· ${g.total} compte${g.total > 1 ? "s" : ""}${nLabels > 0 ? `, ${nLabels} label${nLabels > 1 ? "s" : ""}` : ""}`}
                teinte={couleurSection(g.section)}
                plie={plie(`app:${g.section}`)}
                onBasculer={() => pliage.basculer(`app:${g.section}`)}
              >
                {g.cartes.map(({ carte, comptes: cs }) => (
                  <LigneLabel
                    key={carte?.id ?? "sans"}
                    cle={carte ? nomCarte(carte) : "sans_label"}
                    nom={carte ? nomCarte(carte) : null}
                    plie={Boolean(carte) && plie(`label:${carte!.id}`)}
                    onBasculer={carte ? () => pliage.basculer(`label:${carte.id}`) : undefined}
                    statuts={carte && statuts(carte)}
                    nb={cs.length}
                    description={carte?.description_da}
                    actions={carte && (
                      <>
                        <CaseGroupe ids={cs.map((x) => x.compte.id)} selection={selection} nom={nomCarte(carte)} onBasculer={basculerSelection} />
                        {/* L'action du moment reste visible ; le reste est dans le menu. */}
                        {vue !== "corbeille" && carte.a_podzer && (
                          <button type="button" onClick={() => void validerPodzDuBloc(carte, true)} title="Range ce label et ses comptes dans « Mise à jour hebdo », catégorie Podz. Rien n'est importé." className={BOUTON_BLOC_FORT}>
                            <Check className="size-3.5" aria-hidden />
                            Valider le podz
                          </button>
                        )}
                        {vue !== "corbeille" && <MenuActions nom={`Actions du label ${nomCarte(carte)}`} entrees={menuDuLabel(carte)} />}
                      </>
                    )}
                  >
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
                        selectionne={selection.has(compte.id)}
                        onSelectionner={(c) => basculerSelection([c.id])}
                      />
                    ))}
                  </LigneLabel>
                ))}
              </TitreApp>
            );
          })}
        </div>
      )}

      {vueComptes && choisis.length > 0 && (
        <div className="sticky bottom-4 z-30 mx-auto flex w-fit max-w-full flex-wrap items-center gap-2 rounded-2xl border border-stone-200 bg-white/95 px-3 py-2 shadow-lg backdrop-blur dark:border-stone-700 dark:bg-stone-900/95" data-testid="barre-selection" role="toolbar" aria-label="Actions sur la sélection">
          <span className="px-1 text-sm font-medium tabular-nums">{nComptes(choisis.length)} sélectionné{choisis.length > 1 ? "s" : ""}</span>
          {vue === "corbeille" ? (
            <>
              <Button size="sm" variant="outline" onClick={groupe.restaurer}><RotateCcw className="size-3.5" /> Restaurer</Button>
              <Button size="sm" variant="outline" className="text-destructive" onClick={groupe.supprimer}><Trash2 className="size-3.5" /> Supprimer pour de bon</Button>
            </>
          ) : (
            <>
              {vue !== "prochain_batch" && <Button size="sm" variant="outline" onClick={() => groupe.etape("prochain_batch")}><ArrowRight className="size-3.5" /> Prochain batch</Button>}
              {vue !== "a_importer" && <Button size="sm" variant="outline" onClick={() => groupe.etape("a_importer")}><ArrowLeft className="size-3.5" /> À importer</Button>}
              <Button size="sm" variant="outline" onClick={() => setLabelGroupe(true)}><Tags className="size-3.5" /> Mettre dans un label</Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setLancement(pretsChoisis)}
                disabled={pretsChoisis.length === 0}
                title={pretsChoisis.length < choisis.length ? `${choisis.length - pretsChoisis.length} ne peuvent pas partir (label à créer, à podzer, déjà source…).` : undefined}
              >
                <Rocket className="size-3.5" /> Importer ({pretsChoisis.length})
              </Button>
              <Button size="sm" variant="outline" className="text-destructive" onClick={groupe.corbeille}><Trash2 className="size-3.5" /> Corbeille</Button>
            </>
          )}
          <button type="button" onClick={() => setSelection(new Set())} aria-label="Vider la sélection" title="Vider la sélection" className="inline-flex size-7 items-center justify-center rounded-full text-stone-400 hover:bg-stone-100 hover:text-stone-900 dark:hover:bg-stone-800">
            <X className="size-4" />
          </button>
        </div>
      )}

      <DialogueChoixLabel
        cible={labelGroupe ? { handle: "selection", valeur: "", sousTitre: `${nComptes(choisis.length)} : ${choisis.slice(0, 4).map((c) => `@${c.handle}`).join(", ")}${choisis.length > 4 ? "…" : ""}` } : null}
        titre="Mettre dans un label"
        bouton="Ranger ici"
        aide="Les comptes cochés passent tous sous ce label (et prennent son app)."
        cartes={toutes}
        labels={labelsOs}
        onFermer={() => setLabelGroupe(false)}
        onChoisir={async (carte) => { if (carte) await agirGroupe((ids) => changerCarte(ids, carte), `${nComptes(choisis.length)} rangé(s) sous « ${nomCarte(carte)} ».`); }}
      />
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
      <DialogueFusion
        carte={blocAFusionner}
        cartes={toutes}
        nbComptes={(id) => liste.filter((c) => !c.supprime_at && c.label_propose_id === id).length}
        onFermer={() => setBlocAFusionner(null)}
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

/** La case d'un label : coche ou décoche tous ses comptes affichés (à moitié cochée s'il y en a une partie). */
function CaseGroupe({ ids, selection, nom, onBasculer }: { ids: string[]; selection: Set<string>; nom: string; onBasculer: (ids: string[]) => void }) {
  const ref = React.useRef<HTMLInputElement>(null);
  const n = ids.filter((id) => selection.has(id)).length;
  React.useEffect(() => { if (ref.current) ref.current.indeterminate = n > 0 && n < ids.length; }, [n, ids.length]);
  if (!ids.length) return null;
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={n === ids.length}
      onChange={() => onBasculer(ids)}
      aria-label={`Sélectionner les comptes de ${nom}`}
      title={`Sélectionner les ${ids.length} comptes de ce label`}
      className="mr-1 size-3.5 cursor-pointer accent-stone-900"
    />
  );
}
