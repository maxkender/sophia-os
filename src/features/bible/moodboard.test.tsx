import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CarteLabel, CompteBible } from "./moodboard";
import type { Proposition } from "./propositions";
import type { DonneesSources, SourceBible } from "./sources";

const api = vi.hoisted(() => ({
  lireComptes: vi.fn(), lireCartes: vi.fn(), changerEtape: vi.fn(), lancerBatch: vi.fn(), validerCarte: vi.fn(), changerCarte: vi.fn(),
  validerPodz: vi.fn(), marquerPodz: vi.fn(), rattacherCarte: vi.fn(), detacherCarte: vi.fn(), fusionnerCartes: vi.fn(), modifierCarte: vi.fn(), carteDuLabel: vi.fn(), creerCarte: vi.fn(),
  modifierCompte: vi.fn(), mettreCorbeille: vi.fn(), restaurerCompte: vi.fn(), supprimerDefinitivement: vi.fn(), ajouterComptes: vi.fn(), rafraichirMiniatures: vi.fn(),
}));
vi.mock("./moodboard", async (orig) => ({ ...(await orig<typeof import("./moodboard")>()), ...api }));
const src = vi.hoisted(() => ({ lireSources: vi.fn() }));
vi.mock("./sources", async (orig) => ({ ...(await orig<typeof import("./sources")>()), ...src }));
const prop = vi.hoisted(() => ({ lirePropositions: vi.fn(), passerDansLaBible: vi.fn(), deciderProposition: vi.fn() }));
vi.mock("./propositions", async (orig) => ({ ...(await orig<typeof import("./propositions")>()), ...prop }));

import { appsDe, compterEtapes, handlesDuTexte, ranger, REMARQUE_UGC, vuesCourtes } from "./moodboard";
import { DialogueAjout } from "./DialoguesBible";
import { PageBible } from "./PageBible";
import { REGLES_DEFAUT } from "./sources";

const carte = (o: Partial<CarteLabel>): CarteLabel => ({
  id: "k1", nom: "classic_girl_run", titre: null, section: "atala", badge: "propose", description_da: "Coureuse en photo iPhone", label_id: null, ordre: 1, statut: "a_valider",
  a_podzer: false, podz_valide_at: null, ...o,
});
const compte = (o: Partial<CompteBible>): CompteBible => ({
  id: "c1", handle: "compte.un", etape: "a_importer", label_propose_id: "k1", autres_cartes: [], note_import: null, remarque: null,
  posts: [{ url: "https://www.tiktok.com/@compte.un/video/7600000000000000001", miniature_url: "https://img.test/1.jpg", vues: 4800000 }],
  miniatures_statut: "ok", miniatures_erreur: null, vues_mediane: 85000, meilleur_post_vues: 722000, abonnes: null, ajoute_at: "2026-11-19T10:00:00Z", ...o,
});

const CARTES = [carte({}), carte({ id: "k2", nom: "clean_girl", section: "sophia", badge: "propose", ordre: 2 }), carte({ id: "k3", nom: "smart_girl", section: "sophia", badge: "existe", ordre: 1, label_id: "L1" })];

const source = (o: Partial<SourceBible>): SourceBible => ({
  id: "s1", handle: "une.source", langue: "en", actif: true, labels: [{ id: "L1", nom: "smart_girl" }], slides: [], importes: 120, valides: 90,
  perf: { posts: 20, r: 1.12, vuesMediane: 900, rVsLabel: 1.05, labelNom: "smart_girl" }, essaiMax: null, essaiVerdict: null, dernierImport: "2026-11-10T06:00:00Z",
  neuve: null, attente: null, sequence: null, restant: 0, semaine: null, etape: "weekly", ...o,
});
const donnees = (sources: SourceBible[] = [], o: Partial<DonneesSources> = {}): DonneesSources => ({
  sources,
  file: { enCours: null, attente: [], essais: [], reglages: { lotMax: 8, nouvellesParJour: 1000, essaiPosts: 30, essaiMesuresMin: 10, postsMaxParMaj: 100 } },
  semaine: null,
  regles: { ...REGLES_DEFAUT, rMin: 0.95, rVsLabelMin: 0.95, lotMax: 8 },
  labels: [{ id: "L1", nom: "smart_girl", style_theme: null, application_id: "00000000-0000-4000-8000-000000000001", apps: ["00000000-0000-4000-8000-000000000001"] }],
  ...o,
});
const proposition = (o: Partial<Proposition>): Proposition => ({
  id: "p1", handle: "encantre", langue: "de", sorte: "concept", labelId: null, labelNom: null, concept: "Chaque tableau a un secret", pourquoi: "Le compte le plus régulier du jour.",
  risques: null, score: 86, piste: "exploration", statut: "propose", raisonRefus: null, note: null, creeLe: "2026-11-19T07:29:11Z",
  chiffres: { posts: 40, slideshows: 38, vuesMediane: 32750, vuesMax: 205100, posts10k: 36, posts100k: 2, abonnes: 12100, postsTotal: 132, dernierSlideshow: "2026-11-18", releveLe: "2026-11-19" },
  exemples: [{ url: "https://www.tiktok.com/@encantre/photo/1", vues: 231200, accroche: "Um dieses Haar kümmerte sich nur eine Frau." }], ...o,
});
const rendre = () =>
  render(<MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><PageBible /></QueryClientProvider></MemoryRouter>);

describe("rangement du moodboard", () => {
  it("par app dans l'ordre (Atala, Micabo, Sophia, Idées, Sans label), puis par label ; « aussi » sous la 2e carte", () => {
    const comptes = [
      compte({}),
      compte({ id: "c2", handle: "crushed", label_propose_id: "k1", autres_cartes: ["k2"] }),
      compte({ id: "c3", handle: "chiara", label_propose_id: "k3" }),
      compte({ id: "c4", handle: "orphelin", label_propose_id: null }),
      compte({ id: "c5", handle: "batch", etape: "prochain_batch" }),
    ];
    const g = ranger(comptes, CARTES, { etape: "a_importer", recherche: "", section: "" });
    expect(g.map((x) => x.section)).toEqual(["atala", "sophia", "sans"]);
    expect(g[1]!.cartes.map((c) => c.carte?.nom)).toEqual(["smart_girl", "clean_girl"]);
    expect(g[1]!.cartes[1]!.comptes[0]).toMatchObject({ aussi: true });
    expect(g[2]!.total).toBe(1);
    expect(ranger(comptes, CARTES, { etape: "a_importer", recherche: "chia", section: "" }).flatMap((x) => x.cartes.flatMap((c) => c.comptes.map((y) => y.compte.handle)))).toEqual(["chiara"]);
    expect(compterEtapes(comptes)).toEqual({ a_importer: 4, prochain_batch: 1, corbeille: 0 });
  });

  it("filtre « À podzer » (le label du compte est à podzer), recherche dans la remarque, apps réunies sans doublon", () => {
    const comptes = [compte({}), compte({ id: "c2", handle: "podz", label_propose_id: "k2", remarque: REMARQUE_UGC }), compte({ id: "c3", handle: "sans.label", label_propose_id: null })];
    const cartes = CARTES.map((c) => (c.id === "k2" ? { ...c, a_podzer: true } : c));
    const handles = (f: Parameters<typeof ranger>[2]) => ranger(comptes, cartes, f).flatMap((g) => g.cartes.flatMap((c) => c.comptes.map((x) => x.compte.handle)));
    expect(handles({ etape: "a_importer", recherche: "", section: "", podzer: true })).toEqual(["podz"]);
    expect(handles({ etape: "a_importer", recherche: "", section: "" })).toEqual(["compte.un", "podz", "sans.label"]);
    expect(handles({ etape: "a_importer", recherche: "ugc", section: "" })).toEqual(["podz"]);
    expect(appsDe(["sophia", "micabo", "sophia", "atala"])).toEqual({
      application_ids: ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002", "00000000-0000-4000-8000-000000000004"], apps_attente: [],
    });
  });

  it("lit un collage de liens (profils, posts, @handle, liens courts)", () => {
    expect(handlesDuTexte("https://www.tiktok.com/@Arunnersmind\n@sally.htg https://www.tiktok.com/@sally.htg/video/1 https://vm.tiktok.com/ZNabc/ bonjour")).toEqual({
      handles: ["arunnersmind", "sally.htg"], courts: ["https://vm.tiktok.com/ZNabc/"], ignores: ["bonjour"],
    });
    expect(vuesCourtes(4_800_000)).toBe("4,8 M");
    expect(vuesCourtes(317_000)).toBe("317k");
  });
});

describe("page Bible", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    api.lireCartes.mockResolvedValue(CARTES);
    api.changerEtape.mockResolvedValue(undefined);
    src.lireSources.mockResolvedValue(donnees());
    prop.lirePropositions.mockResolvedValue([]);
  });

  it("« Source proposals », avant « À importer » : les propositions de l'éclaireur par jour, celles à plus tard comprises ; → À importer ou Prochain batch", async () => {
    api.lireComptes.mockResolvedValue([compte({ id: "c7", handle: "deja.la" })]);
    api.rafraichirMiniatures.mockResolvedValue(undefined);
    prop.lirePropositions.mockResolvedValue([
      proposition({}),
      proposition({ id: "p2", handle: "pour.un.label", sorte: "label", labelId: "L1", labelNom: "smart_girl", concept: null, score: 70, creeLe: "2026-11-19T09:00:00Z" }),
      proposition({ id: "p3", handle: "mis.de.cote", statut: "plus_tard", note: "à revoir en décembre", creeLe: "2026-11-15T10:00:00Z" }),
      proposition({ id: "p4", handle: "deja.la", creeLe: "2026-11-15T11:00:00Z", score: 40 }),
    ]);
    prop.passerDansLaBible.mockResolvedValue({ bibleId: "b9", handle: "encantre", deja: false });
    prop.deciderProposition.mockResolvedValue(undefined);
    rendre();
    await screen.findByRole("tab", { name: /Source proposals 4/ });
    await screen.findByRole("tab", { name: /À importer 1/ });
    expect(screen.getAllByRole("tab").map((t) => t.textContent).slice(0, 3)).toEqual(["Source proposals 4", "À importer 1", "Prochain batch 0"]);
    fireEvent.click(screen.getByRole("tab", { name: /Source proposals/ }));
    expect(screen.getByTestId("regle-etape")).toHaveTextContent("l'agent éclaireur trouve chaque jour");
    expect(await screen.findByTestId("propositions-en-bref")).toHaveTextContent("3 propositions à décider, 1 mise à plus tard.");
    // Un jour par section, le plus récent d'abord ; dans un jour, le meilleur score d'abord.
    const jours = [...document.querySelectorAll("[data-jour]")] as HTMLElement[];
    expect(jours.map((j) => j.dataset.jour)).toEqual(["2026-11-19", "2026-11-15"]);
    expect(jours[0]).toHaveTextContent("jeudi 19 novembre");
    expect([...jours[0]!.querySelectorAll("[data-proposition]")].map((t) => (t as HTMLElement).dataset.proposition)).toEqual(["encantre", "pour.un.label"]);

    const tuile = screen.getByText(/@encantre/).closest("[data-proposition]") as HTMLElement;
    expect(tuile).toHaveTextContent("concept nouveau");
    expect(tuile).toHaveTextContent("38 slideshows sur 40 posts · méd. 33 k · pic 205 k · 2 à 100 k ou plus");
    expect(within(tuile).getByRole("link", { name: /Um dieses Haar/ })).toHaveAttribute("href", "https://www.tiktok.com/@encantre/photo/1");
    expect(screen.getByText(/@pour\.un\.label/).closest("[data-proposition]")).toHaveTextContent("pour smart_girl");
    const deCote = screen.getByText(/@mis\.de\.cote/).closest("[data-proposition]") as HTMLElement;
    expect(deCote).toHaveTextContent("plus tard");
    expect(deCote).toHaveTextContent("Note : à revoir en décembre");
    expect(screen.getByText(/@deja\.la/).closest("[data-proposition]")).toHaveTextContent("déjà dans la Bible");

    fireEvent.click(within(tuile).getByRole("button", { name: "À importer" }));
    await waitFor(() => expect(prop.passerDansLaBible).toHaveBeenCalledWith("p1", "a_importer", undefined));
    // Ses 3 derniers TikToks arrivent ensuite, comme pour un compte ajouté à la main.
    await waitFor(() => expect(api.rafraichirMiniatures).toHaveBeenCalledWith("b9"));
    // « Prochain batch » : on choisit d'abord le label. Un concept n'en a pas : rien n'est présélectionné.
    fireEvent.click(within(deCote).getByRole("button", { name: "Prochain batch" }));
    expect(await screen.findByRole("heading", { name: "Envoyer dans le prochain batch" })).toBeInTheDocument();
    expect(prop.passerDansLaBible).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Label")).toHaveValue("");
    fireEvent.change(screen.getByLabelText("Label"), { target: { value: "k3" } });
    fireEvent.click(screen.getByRole("button", { name: "Envoyer" }));
    await waitFor(() => expect(prop.passerDansLaBible).toHaveBeenCalledWith("p3", "prochain_batch", expect.objectContaining({ id: "k3", label_id: "L1" })));
    fireEvent.click(within(deCote).getByRole("button", { name: "Remettre à décider" }));
    await waitFor(() => expect(prop.deciderProposition).toHaveBeenCalledWith("p3", "propose", undefined));

    // Refuser demande la raison : l'agent la relit.
    const demander = vi.spyOn(window, "prompt").mockReturnValue("trop de citations");
    fireEvent.click(within(tuile).getByRole("button", { name: "Refuser" }));
    await waitFor(() => expect(prop.deciderProposition).toHaveBeenCalledWith("p1", "refuse", "trop de citations"));
    demander.mockRestore();

    fireEvent.click(screen.getByRole("button", { name: /Plus tard 1/ }));
    expect([...document.querySelectorAll("[data-proposition]")].map((t) => (t as HTMLElement).dataset.proposition)).toEqual(["mis.de.cote"]);
  });

  it("onglets avec compteurs, carte de label avec badge et DA, tuile avec lien entier et miniature ; → Prochain batch puis ← Retirer", async () => {
    api.lireComptes.mockResolvedValue([compte({ note_import: "pic 4,8 M" }), compte({ id: "c9", handle: "deja.batch", etape: "prochain_batch" })]);
    rendre();
    expect(await screen.findByRole("tab", { name: /À importer 1/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Prochain batch 1/ })).toBeInTheDocument();
    expect(screen.getByTestId("regle-etape")).toHaveTextContent("À la main");
    const carteRun = screen.getByText("classic_girl_run").closest("[data-carte]") as HTMLElement;
    expect(within(carteRun).getByText("proposé")).toBeInTheDocument();
    expect(within(carteRun).getByText("Coureuse en photo iPhone")).toBeInTheDocument();
    const lien = within(carteRun).getAllByRole("link").find((a) => a.getAttribute("href") === "https://www.tiktok.com/@compte.un");
    expect(lien).toHaveTextContent("tiktok.com/@compte.un");
    expect(within(carteRun).getByText(/pic 4,8 M/)).toBeInTheDocument();
    fireEvent.click(within(carteRun).getByRole("button", { name: "Prochain batch" }));
    await waitFor(() => expect(api.changerEtape).toHaveBeenCalledWith(["c1"], "prochain_batch"));

    fireEvent.click(screen.getByRole("tab", { name: /Prochain batch/ }));
    const tuile = (await screen.findByText(/deja\.batch/)).closest("[data-compte]") as HTMLElement;
    fireEvent.click(within(tuile).getByRole("button", { name: "Retirer" }));
    await waitFor(() => expect(api.changerEtape).toHaveBeenCalledWith(["c9"], "a_importer"));
    // Plus rien ne se coche « importé » à la main : l'étape vient de la source.
    expect(screen.queryByRole("button", { name: /Marquer le batch comme importé/ })).toBeNull();
    expect(within(tuile).queryByRole("button", { name: "Importé" })).toBeNull();
  });

  it("prochain batch : qui est prêt et ce qui bloque les autres ; « Lancer l'import » demande la langue et crée les sources", async () => {
    api.lireComptes.mockResolvedValue([
      compte({ id: "c2", handle: "pret.un", etape: "prochain_batch", label_propose_id: "k3" }),
      compte({ id: "c3", handle: "pret.deux", etape: "prochain_batch", label_propose_id: "k3", langue: "es" }),
      compte({ id: "c4", handle: "sans.app", etape: "prochain_batch" }),
      compte({ id: "c5", handle: "a.podzer", etape: "prochain_batch", label_propose_id: "k4" }),
      compte({ id: "c6", handle: "label.propose", etape: "prochain_batch", label_propose_id: "k2" }),
    ]);
    api.lancerBatch.mockResolvedValue([
      { id: "c2", handle: "pret.un", statut: "lancee", essai_max: 30 },
      { id: "c3", handle: "pret.deux", statut: "lancee", essai_max: null },
    ]);
    // Le label de c5 existe dans l'OS mais il est « à podzer » : ses comptes ne partent pas.
    api.lireCartes.mockResolvedValue([...CARTES, carte({ id: "k4", nom: "white_bg", section: "sophia", badge: "existe", label_id: "L4", ordre: 3, a_podzer: true })]);
    rendre();
    fireEvent.click(await screen.findByRole("tab", { name: /Prochain batch 5/ }));
    const barre = await screen.findByTestId("barre-batch");
    expect(barre).toHaveTextContent("5 comptes dans le prochain batch, 2 prêts à importer.");
    // Atala existe : sa carte n'attend plus une appli, seulement son label.
    expect(barre).toHaveTextContent("Les autres : label à podzer : pas d'import (1), label à créer (2).");
    expect(screen.getByTestId("blocage-a.podzer")).toHaveTextContent("label à podzer : pas d'import");
    expect(screen.getByTestId("blocage-pret.un")).toHaveTextContent("prêt à importer");
    expect(screen.getByTestId("blocage-sans.app")).toHaveTextContent("label à créer");
    expect(screen.getByTestId("blocage-label.propose")).toHaveTextContent("label à créer");

    fireEvent.click(within(barre).getByRole("button", { name: /Lancer l'import \(2\)/ }));
    const lancer = await screen.findByRole("button", { name: "Lancer l'import de 2 comptes" });
    // La langue est exigée : celle de pret.deux est connue, pas celle de pret.un.
    expect(lancer).toBeDisabled();
    expect(screen.getByText("1 sans langue")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Langue de @pret.un"), { target: { value: "en" } });
    fireEvent.click(screen.getByRole("button", { name: "Lancer l'import de 2 comptes" }));
    await waitFor(() => expect(api.lancerBatch).toHaveBeenCalledWith([{ id: "c2", langue: "en" }, { id: "c3", langue: "es" }]));
    const bilan = await screen.findByTestId("resultats-lancement");
    expect(bilan).toHaveTextContent("@pret.un : import lancé, essai de 30 posts");
    expect(bilan).toHaveTextContent("@pret.deux : import lancé, ses 100 posts les plus vus");
    fireEvent.click(screen.getByRole("button", { name: "Voir « En import »" }));
    expect(screen.getByRole("tab", { name: /En import/ })).toHaveAttribute("aria-selected", "true");
  });

  it("un compte dont la source existe quitte les onglets d'avant import et se lit dans ceux des sources (r, stock, état)", async () => {
    api.lireComptes.mockResolvedValue([
      compte({ id: "c2", handle: "une.source", etape: "prochain_batch", label_propose_id: "k3" }),
      compte({ id: "c3", handle: "source.ailleurs", etape: "prochain_batch", label_propose_id: "k2" }),
    ]);
    src.lireSources.mockResolvedValue(donnees([
      source({ semaine: { compteReferenceId: "s1", handle: "une.source", langue: "en", label: "smart_girl", posts: 20, r: 1.12, rVsLabel: 1.05, decision: "maj", raison: "r", meilleurVues: null, lanceeLe: "2026-11-17T05:40:00Z", importes: 12, valides: 9 } }),
      source({ id: "s2", handle: "source.ailleurs", labels: [{ id: "L1", nom: "smart_girl" }], importes: 30, valides: 24, essaiMax: 30, etape: "essai", perf: { posts: 6, r: 0.59, vuesMediane: 300 } }),
      source({ id: "s3", handle: "eteinte", actif: false, etape: "arretees" }),
      source({ id: "s4", handle: "jco.mindset", importes: 30, valides: 24, essaiMax: 30, essaiVerdict: "ne_tient_pas", etape: "essai_rate", perf: { posts: 34, r: 0.46, vuesMediane: 950, rVsLabel: 0.44, labelNom: "smart_girl" } }),
    ], { semaine: { semaine: "2026-11-16", sources: [{ compteReferenceId: "s1", handle: "une.source", langue: "en", label: "smart_girl", posts: 20, r: 1.12, rVsLabel: 1.05, decision: "maj", raison: "r", meilleurVues: null, lanceeLe: "2026-11-17T05:40:00Z", importes: 12, valides: 9 }] } }));
    rendre();
    // une.source porte déjà le label de sa carte : seul source.ailleurs reste à faire (sa carte vise un autre label).
    expect(await screen.findByRole("tab", { name: /Prochain batch 1/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /À l'essai 1/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Weekly update 1/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Arrêtées 1/ })).toBeInTheDocument();
    // Une source qui rate son essai n'est pas effacée : elle a sa case, avec son r et son stock.
    fireEvent.click(screen.getByRole("tab", { name: /Essai raté 1/ }));
    expect(screen.getByTestId("regle-etape")).toHaveTextContent("Rien n'est effacé : la source reste, ses slideshows validés restent en stock");
    const ratee = (await screen.findByText(/jco\.mindset/)).closest("[data-source]") as HTMLElement;
    expect(within(ratee).getByTestId("etat-jco.mindset")).toHaveTextContent("Essai raté : gardée avec ses 24 slideshows validés, plus d'import");
    expect(ratee).toHaveTextContent("r 0,46");
    expect(ratee).toHaveTextContent("×0,44 label");
    expect(ratee).toHaveTextContent("stock 24 / 30");
    fireEvent.click(screen.getByRole("tab", { name: /Arrêtées 1/ }));
    expect(screen.queryByText(/jco\.mindset/)).toBeNull();
    expect(await screen.findByText(/eteinte/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /Prochain batch/ }));
    const reste = (await screen.findByText(/source\.ailleurs/)).closest("[data-compte]") as HTMLElement;
    expect(within(reste).getByText("déjà une source · smart_girl")).toBeInTheDocument();
    expect(screen.queryByText(/une\.source/)).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: /Weekly update/ }));
    expect(screen.getByTestId("regle-etape")).toHaveTextContent("Automatique");
    expect(screen.getByTestId("regle-etape")).toHaveTextContent("celles dont le r dépasse 0,95");
    // Le lundi décide ; les imports, eux, s'étalent sur la semaine.
    expect(await screen.findByTestId("semaine-en-bref")).toHaveTextContent(
      "Semaine du 16/11 : lundi, 1 source retenue et 0 pas cette semaine. 1 déjà mise à jour. Depuis lundi : 12 slideshows importés, 9 validés.",
    );
    const tuile = screen.getByText(/une\.source/).closest("[data-source]") as HTMLElement;
    expect(within(tuile).getByTestId("etat-une.source")).toHaveTextContent("Mise à jour le 17/11 (r au-dessus de 0,95)");
    expect(tuile).toHaveTextContent("r 1,12");
    expect(tuile).toHaveTextContent("×1,05 label");
    expect(tuile).toHaveTextContent("stock 90 / 120");
    expect(within(tuile).getByRole("link", { name: /Réglages dans Sources/ })).toHaveAttribute("href", "/admin/sources");

    fireEvent.click(screen.getByRole("tab", { name: /À l'essai/ }));
    expect(await screen.findByTestId("etat-source.ailleurs")).toHaveTextContent("Essai : 30 sur 30 importés, 6 sur 10 mesurés");
  });

  it("« En import » : chaque source neuve part tout de suite et dit où elle en est ; le lot des mises à jour se lit dans « Weekly update »", async () => {
    api.lireComptes.mockResolvedValue([]);
    const neuve = { compteReferenceId: "x", handle: "x", essais: 1, echec: null, lanceeLe: "2026-11-19T16:30:00Z", releve: false, enTraitement: 0 };
    src.lireSources.mockResolvedValue(donnees([
      source({ id: "n1", handle: "mondorunning", importes: 24, etape: "en_import", neuve: { ...neuve, releve: true, enTraitement: 18 } }),
      source({ id: "n2", handle: "sslowrisee", importes: 0, dernierImport: null, etape: "en_import", neuve }),
      source({ id: "n3", handle: "sydneysynced", importes: 0, dernierImport: null, etape: "en_import", neuve: { ...neuve, essais: 0, lanceeLe: null } }),
      source({ id: "w1", handle: "une.source" }),
    ], { file: {
      enCours: { handle: "lena.psychologie", restant: 12, faits: 1, total: 6, aSuivre: ["luvy_y"] }, attente: [], essais: [],
      reglages: { lotMax: 8, nouvellesParJour: 1000, essaiPosts: 30, essaiMesuresMin: 10, postsMaxParMaj: 100 },
    } }));
    rendre();
    fireEvent.click(await screen.findByRole("tab", { name: /En import 3/ }));
    expect(screen.getByTestId("regle-etape")).toHaveTextContent("Une source part dès qu'elle est créée, sans attendre les autres");
    const bref = await screen.findByTestId("import-en-bref");
    expect(bref).toHaveTextContent("3 sources en import : 1 relevé de profil en cours, 1 profil à relever (départ dans la minute), 18 slideshows en traitement.");
    // plus de séquence ni de renvoi au lendemain dans cet onglet
    expect(bref).not.toHaveTextContent(/séquence|6 h 37|au plus tôt/);
    expect(screen.queryByTestId("lot-en-cours")).toBeNull();
    expect(screen.getByTestId("etat-mondorunning")).toHaveTextContent("Import en cours : 18 slideshows en traitement");
    expect(screen.getByTestId("etat-sslowrisee")).toHaveTextContent("Relevé du profil en cours");
    expect(screen.getByTestId("etat-sydneysynced")).toHaveTextContent("Relevé du profil dans la minute");

    fireEvent.click(screen.getByRole("tab", { name: /Weekly update 1/ }));
    expect(await screen.findByTestId("lot-en-cours")).toHaveTextContent(
      "Mise à jour en cours : @lena.psychologie, 12 slideshows encore dans la file · 1 source passée sur 6 · à suivre : @luvy_y",
    );
  });

  it("une proposition vers le prochain batch : son label proposé est présélectionné ; on peut prendre un label de l'OS sans bloc, en créer un, ou n'en mettre aucun", async () => {
    api.lireComptes.mockResolvedValue([]);
    api.rafraichirMiniatures.mockResolvedValue(undefined);
    src.lireSources.mockResolvedValue(donnees([], { labels: [
      { id: "L1", nom: "smart_girl", style_theme: null, application_id: "00000000-0000-4000-8000-000000000001", apps: ["00000000-0000-4000-8000-000000000001"] },
      { id: "L7", nom: "History", style_theme: null, application_id: "00000000-0000-4000-8000-000000000001", apps: ["00000000-0000-4000-8000-000000000001"] },
    ] }));
    prop.lirePropositions.mockResolvedValue([
      proposition({ id: "p2", handle: "pour.smart", sorte: "label", labelId: "L1", labelNom: "smart_girl", concept: null }),
      proposition({ id: "p5", handle: "pour.history", sorte: "label", labelId: "L7", labelNom: "History", concept: null, score: 60 }),
      proposition({ id: "p6", handle: "un.concept", score: 40 }),
    ]);
    prop.passerDansLaBible.mockResolvedValue({ bibleId: "b1", handle: "x", deja: false });
    api.carteDuLabel.mockResolvedValue(carte({ id: "k7", nom: "history", section: "sophia", badge: "existe", label_id: "L7", statut: "valide" }));
    api.creerCarte.mockResolvedValue(carte({ id: "k8", nom: "tableaux_secrets", section: "sophia", badge: "nouveau", label_id: null }));
    api.validerCarte.mockResolvedValue("L8");
    rendre();
    fireEvent.click(await screen.findByRole("tab", { name: /Source proposals 3/ }));
    const tuile = (h: RegExp) => screen.getByText(h).closest("[data-proposition]") as HTMLElement;

    // Un label qui a déjà son bloc : il est présélectionné, il suffit d'envoyer.
    fireEvent.click(within(tuile(/@pour\.smart/)).getByRole("button", { name: "Prochain batch" }));
    expect(await screen.findByLabelText("Label")).toHaveValue("k3");
    fireEvent.click(screen.getByRole("button", { name: "Envoyer" }));
    await waitFor(() => expect(prop.passerDansLaBible).toHaveBeenCalledWith("p2", "prochain_batch", expect.objectContaining({ id: "k3" })));

    // Un label de l'OS sans bloc : présélectionné aussi, son bloc est créé à l'envoi.
    fireEvent.click(within(tuile(/@pour\.history/)).getByRole("button", { name: "Prochain batch" }));
    await waitFor(() => expect(screen.getByLabelText("Label")).toHaveValue("label:L7"));
    fireEvent.click(screen.getByRole("button", { name: "Envoyer" }));
    await waitFor(() => expect(api.carteDuLabel).toHaveBeenCalledWith("L7"));
    await waitFor(() => expect(prop.passerDansLaBible).toHaveBeenCalledWith("p5", "prochain_batch", expect.objectContaining({ id: "k7", label_id: "L7" })));

    // Un concept : on crée son label, tout de suite dans l'OS, et le compte part prêt.
    fireEvent.click(within(tuile(/@un\.concept/)).getByRole("button", { name: "Prochain batch" }));
    await waitFor(() => expect(screen.getByLabelText("Label")).toHaveValue(""));
    fireEvent.change(screen.getByLabelText("Label"), { target: { value: "__nouveau__" } });
    fireEvent.change(screen.getByPlaceholderText("nom_du_label"), { target: { value: "tableaux secrets" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /Créer ce label dans l'OS tout de suite/ }));
    fireEvent.click(screen.getByRole("button", { name: "Envoyer" }));
    await waitFor(() => expect(api.creerCarte).toHaveBeenCalledWith({ nom: "tableaux_secrets", section: "sophia", description: "" }));
    await waitFor(() => expect(api.validerCarte).toHaveBeenCalledWith("k8"));
    await waitFor(() => expect(prop.passerDansLaBible).toHaveBeenCalledWith("p6", "prochain_batch", expect.objectContaining({ id: "k8", label_id: "L8", badge: "existe" })));

    // Sans label : possible (le compte attendra son label dans le prochain batch).
    fireEvent.click(within(tuile(/@un\.concept/)).getByRole("button", { name: "Prochain batch" }));
    await waitFor(() => expect(screen.getByLabelText("Label")).toHaveValue(""));
    fireEvent.click(screen.getByRole("button", { name: "Envoyer" }));
    await waitFor(() => expect(prop.passerDansLaBible).toHaveBeenCalledWith("p6", "prochain_batch", null));
  });

  it("« Importer » sur une tuile dont le label existe : le compte part seul ; sans langue connue, la fenêtre la demande", async () => {
    api.lireComptes.mockResolvedValue([
      compte({ id: "c2", handle: "pret.avec.langue", label_propose_id: "k3", langue: "de" }),
      compte({ id: "c3", handle: "pret.sans.langue", etape: "prochain_batch", label_propose_id: "k3" }),
      compte({ id: "c4", handle: "label.propose", label_propose_id: "k2" }),
    ]);
    api.lancerBatch.mockResolvedValue([{ id: "c2", handle: "pret.avec.langue", statut: "lancee", essai_max: null }]);
    const confirmer = vi.spyOn(window, "confirm").mockReturnValue(true);
    rendre();
    const tuile = (await screen.findByText(/pret\.avec\.langue/)).closest("[data-compte]") as HTMLElement;
    // Pas de bouton tant que le label n'existe pas.
    expect(within(screen.getByText(/label\.propose/).closest("[data-compte]") as HTMLElement).queryByRole("button", { name: "Importer" })).toBeNull();
    fireEvent.click(within(tuile).getByRole("button", { name: "Importer" }));
    expect(confirmer).toHaveBeenCalledWith(expect.stringContaining("Importer @pret.avec.langue maintenant ? Label smart_girl, TikToks en allemand."));
    await waitFor(() => expect(api.lancerBatch).toHaveBeenCalledWith([{ id: "c2", langue: "de" }]));
    expect(await screen.findByTestId("info")).toHaveTextContent("@pret.avec.langue : import lancé, ses 100 posts les plus vus");
    confirmer.mockRestore();

    fireEvent.click(screen.getByRole("tab", { name: /Prochain batch/ }));
    const sansLangue = (await screen.findByText(/pret\.sans\.langue/)).closest("[data-compte]") as HTMLElement;
    fireEvent.click(within(sansLangue).getByRole("button", { name: "Importer" }));
    expect(await screen.findByRole("button", { name: "Lancer l'import de 1 compte" })).toBeDisabled();
    expect(screen.getByLabelText("Langue de @pret.sans.langue")).toBeInTheDocument();
  });

  it("un bloc sans vrai label : « Modifier ou rattacher » le rattache à un label de l'OS, ou corrige son nom", async () => {
    api.lireComptes.mockResolvedValue([compte({}), compte({ id: "c2", handle: "clean", label_propose_id: "k2" }), compte({ id: "c3", handle: "chiara", label_propose_id: "k3" })]);
    src.lireSources.mockResolvedValue(donnees([], { labels: [
      { id: "L1", nom: "smart_girl", style_theme: null, application_id: "00000000-0000-4000-8000-000000000001", apps: ["00000000-0000-4000-8000-000000000001"] },
      { id: "L7", nom: "History", style_theme: null, application_id: "00000000-0000-4000-8000-000000000001", apps: ["00000000-0000-4000-8000-000000000001"] },
    ] }));
    api.rattacherCarte.mockResolvedValue({ fusion: false, comptes: 1, label: "History" });
    api.modifierCarte.mockResolvedValue(undefined);
    rendre();
    const bloc = (await screen.findByText("clean_girl")).closest("[data-carte]") as HTMLElement;
    // Un bloc dont le label existe n'a rien à rattacher.
    expect(within(screen.getByText("smart_girl").closest("[data-carte]") as HTMLElement).queryByRole("button", { name: "Modifier ou rattacher" })).toBeNull();
    fireEvent.click(within(bloc).getByRole("button", { name: "Modifier ou rattacher" }));
    const choix = await screen.findByLabelText("Label de l'OS");
    expect(within(choix).getAllByRole("option").map((o) => o.textContent)).toEqual(["Choisir un label…", "History", "smart_girl"]);
    fireEvent.change(choix, { target: { value: "L7" } });
    fireEvent.click(screen.getByRole("button", { name: "Rattacher" }));
    // Même app, label sans bloc : rien à signaler, pas de confirmation.
    expect(screen.queryByTestId("alerte-rattachement")).toBeNull();
    await waitFor(() => expect(api.rattacherCarte).toHaveBeenCalledWith("k2", "L7"));
    expect(await screen.findByTestId("info")).toHaveTextContent("Le bloc est rattaché à History : 1 compte importable.");
    // Le rattachement s'annule tout de suite, depuis le message.
    api.detacherCarte.mockResolvedValue({ comptes: 1, label: "History" });
    fireEvent.click(within(screen.getByTestId("info")).getByRole("button", { name: "Annuler" }));
    await waitFor(() => expect(api.detacherCarte).toHaveBeenCalledWith("k2"));
    expect(await screen.findByTestId("info")).toHaveTextContent("Rattachement annulé : 1 compte de retour sous « clean_girl ».");

    fireEvent.click(within(bloc).getByRole("button", { name: "Modifier ou rattacher" }));
    fireEvent.change(await screen.findByLabelText("Nom du label"), { target: { value: "clean girl sophia" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(api.modifierCarte).toHaveBeenCalledWith("k2", { nom: "clean_girl_sophia", section: "sophia", description: "Coureuse en photo iPhone" }));
  });

  it("rattacher à un label d'une autre app, ou qui a déjà son bloc : prévenu et confirmé avant ; les comptes versés ailleurs se rendent depuis le bloc", async () => {
    // Le cas du 19/11 : un bloc de running (Atala) rattaché par erreur à smart_girl (Sophia), qui avait déjà son bloc.
    api.lireComptes.mockResolvedValue([compte({}), compte({ id: "c2", handle: "runclubgirl" }), compte({ id: "c3", handle: "chiara", label_propose_id: "k3" })]);
    src.lireSources.mockResolvedValue(donnees([], { labels: [
      { id: "L1", nom: "smart_girl", style_theme: null, application_id: "00000000-0000-4000-8000-000000000001", apps: ["00000000-0000-4000-8000-000000000001"] },
    ] }));
    api.rattacherCarte.mockResolvedValue({ fusion: true, comptes: 2, label: "smart_girl" });
    const confirmer = vi.spyOn(window, "confirm").mockReturnValue(false);
    rendre();
    const bloc = (await screen.findByText("classic_girl_run")).closest("[data-carte]") as HTMLElement;
    fireEvent.click(within(bloc).getByRole("button", { name: "Modifier ou rattacher" }));
    fireEvent.change(await screen.findByLabelText("Label de l'OS"), { target: { value: "L1" } });
    expect(screen.getByTestId("alerte-rattachement")).toHaveTextContent(
      "Ce bloc est rangé sous Atala, et smart_girl est un label Sophia. smart_girl a déjà son bloc : les 2 comptes de ce bloc iront le rejoindre. Tu pourras annuler.",
    );
    // Refusé à la confirmation : rien ne bouge.
    fireEvent.click(screen.getByRole("button", { name: "Rattacher" }));
    expect(confirmer).toHaveBeenCalledWith(expect.stringContaining("Rattacher « classic_girl_run » (2 comptes, Atala) au label smart_girl (Sophia) ?"));
    expect(api.rattacherCarte).not.toHaveBeenCalled();
    confirmer.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Rattacher" }));
    await waitFor(() => expect(api.rattacherCarte).toHaveBeenCalledWith("k1", "L1"));
    expect(await screen.findByTestId("info")).toHaveTextContent("2 comptes de « classic_girl_run » rangés sous smart_girl, qui avait déjà son bloc.");
    expect(within(screen.getByTestId("info")).getByRole("button", { name: "Annuler" })).toBeInTheDocument();
    confirmer.mockRestore();
  });

  it("après coup : le bloc qui a reçu des comptes les rend, le bloc qui a pris un label le rend", async () => {
    api.lireCartes.mockResolvedValue([
      // Vidé par un rattachement : ses 2 comptes sont sous smart_girl. Il existe toujours.
      carte({ rattachement: { label: "smart_girl", fusion: true, vers: "k3", comptes: ["c1", "c2"] } }),
      carte({ id: "k3", nom: "smart_girl", section: "sophia", badge: "existe", ordre: 1, label_id: "L1" }),
      // A pris le label History : il s'appelait study_notes.
      carte({ id: "k4", nom: "study_notes", section: "sophia", badge: "existe", ordre: 2, label_id: "L7", label_nom: "History", rattachement: { label: "History", fusion: false, vers: null, comptes: ["c4"] } }),
    ]);
    api.lireComptes.mockResolvedValue([
      compte({ label_propose_id: "k3" }), compte({ id: "c2", handle: "runclubgirl", label_propose_id: "k3" }), compte({ id: "c4", handle: "etude", label_propose_id: "k4" }),
    ]);
    api.detacherCarte.mockResolvedValue({ comptes: 2, label: "smart_girl" });
    rendre();
    const recu = (await screen.findByText("smart_girl")).closest("[data-carte]") as HTMLElement;
    fireEvent.click(within(recu).getByRole("button", { name: "Rendre 2 comptes à « classic_girl_run »" }));
    await waitFor(() => expect(api.detacherCarte).toHaveBeenCalledWith("k1"));
    expect(await screen.findByTestId("info")).toHaveTextContent("Rattachement annulé : 2 comptes de retour sous « classic_girl_run ».");
    const pris = screen.getByText("History").closest("[data-carte]") as HTMLElement;
    fireEvent.click(within(pris).getByRole("button", { name: "Annuler le rattachement" }));
    await waitFor(() => expect(api.detacherCarte).toHaveBeenCalledWith("k4"));
  });

  it("une app et un label se replient et se déplient (retenu d'une visite à l'autre) ; « Replier les labels », « Tout déplier »", async () => {
    api.lireComptes.mockResolvedValue([compte({}), compte({ id: "c3", handle: "chiara", label_propose_id: "k3" }), compte({ id: "c4", handle: "etude", label_propose_id: "k2" })]);
    const { unmount } = rendre();
    await screen.findByText("@chiara");
    // Replier l'app Atala : ses labels et ses comptes disparaissent, son en-tête reste avec ses chiffres.
    fireEvent.click(screen.getByRole("button", { name: "Replier Atala" }));
    expect(screen.queryByText("@compte.un")).toBeNull();
    expect(screen.queryByText("classic_girl_run")).toBeNull();
    expect(document.querySelector("[data-section=atala]")).toHaveTextContent("1 compte, 1 label");
    // Replier un label : son nom reste, ses comptes et sa DA disparaissent.
    fireEvent.click(screen.getByRole("button", { name: "Replier smart_girl" }));
    expect(screen.queryByText("@chiara")).toBeNull();
    expect(screen.getByText("smart_girl")).toBeInTheDocument();
    expect(screen.getByText("@etude")).toBeInTheDocument();
    // Retenu : la page rouverte garde ce qui était replié.
    unmount();
    rendre();
    await screen.findByText("@etude");
    expect(screen.queryByText("@compte.un")).toBeNull();
    expect(screen.queryByText("@chiara")).toBeNull();
    // « Replier les labels » : les apps s'ouvrent, chaque label est replié.
    fireEvent.click(screen.getByRole("button", { name: /Replier les labels/ }));
    expect(screen.getByText("classic_girl_run")).toBeInTheDocument();
    expect(screen.queryByText("@compte.un")).toBeNull();
    expect(screen.queryByText("@etude")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Tout déplier/ }));
    expect(screen.getByText("@compte.un")).toBeInTheDocument();
    expect(screen.getByText("@chiara")).toBeInTheDocument();
    expect(screen.getByText("@etude")).toBeInTheDocument();
  });

  it("« Fusionner » verse un label dans un autre (même déjà créé), confirmé avant, et s'annule depuis le message", async () => {
    api.lireComptes.mockResolvedValue([compte({}), compte({ id: "c2", handle: "runclubgirl" }), compte({ id: "c3", handle: "chiara", label_propose_id: "k3" })]);
    api.fusionnerCartes.mockResolvedValue({ comptes: 2, label: "smart_girl" });
    api.detacherCarte.mockResolvedValue({ comptes: 2, label: "smart_girl" });
    const confirmer = vi.spyOn(window, "confirm").mockReturnValue(false);
    rendre();
    const bloc = (await screen.findByText("classic_girl_run")).closest("[data-carte]") as HTMLElement;
    fireEvent.click(within(bloc).getByRole("button", { name: "Fusionner" }));
    const choix = await screen.findByLabelText("Fusionner dans");
    // Toutes les autres cartes, pas elle-même.
    expect([...(choix as HTMLSelectElement).options].map((o) => o.textContent)).toEqual(["Fusionner dans…", "clean_girl (0)", "smart_girl (1)"]);
    fireEvent.change(choix, { target: { value: "k3" } });
    expect(screen.getByTestId("alerte-fusion")).toHaveTextContent("« classic_girl_run » est rangé sous Atala, « smart_girl » sous Sophia : les comptes changent d'app.");
    fireEvent.click(screen.getByRole("button", { name: "Fusionner" }));
    expect(confirmer).toHaveBeenCalledWith(expect.stringContaining("Fusionner « classic_girl_run » (2 comptes) dans « smart_girl » ?"));
    expect(api.fusionnerCartes).not.toHaveBeenCalled();
    confirmer.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Fusionner" }));
    await waitFor(() => expect(api.fusionnerCartes).toHaveBeenCalledWith("k1", "k3"));
    expect(await screen.findByTestId("info")).toHaveTextContent("« classic_girl_run » fusionné dans « smart_girl » : 2 comptes déplacés.");
    fireEvent.click(within(screen.getByTestId("info")).getByRole("button", { name: "Annuler" }));
    await waitFor(() => expect(api.detacherCarte).toHaveBeenCalledWith("k1"));
    expect(await screen.findByTestId("info")).toHaveTextContent("Fusion annulée : 2 comptes de retour sous « classic_girl_run ».");
    confirmer.mockRestore();
  });

  it("« à podzer » se marque sur le LABEL : le bloc se marque, se valide (seul ou tout le batch) et se retire ; validé, il est dans Weekly update, catégorie Podz, avec ses comptes, jamais importé", async () => {
    api.lireCartes.mockResolvedValue([
      ...CARTES,
      carte({ id: "k4", nom: "white_bg_run", section: "atala", badge: "nouveau", ordre: 4, a_podzer: true }),
      carte({ id: "k5", nom: "study_scrapbook", section: "micabo", badge: "nouveau", ordre: 5, description_da: "Scrapbook d'étudiante", a_podzer: true, podz_valide_at: "2026-11-20T09:00:00Z" }),
    ]);
    api.lireComptes.mockResolvedValue([
      compte({ id: "c2", handle: "a.valider", etape: "prochain_batch", label_propose_id: "k4" }),
      compte({ id: "c3", handle: "deja.valide", etape: "a_importer", label_propose_id: "k5", note_import: "collage rose" }),
      compte({ id: "c4", handle: "normal", etape: "a_importer", label_propose_id: "k3" }),
    ]);
    api.validerPodz.mockResolvedValue(undefined);
    api.marquerPodz.mockResolvedValue(undefined);
    rendre();
    // Les comptes du label validé ne comptent plus dans les onglets d'avant import : ils sont dans Weekly update.
    expect(await screen.findByRole("tab", { name: /Prochain batch 1/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /À importer 1/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Weekly update 1/ })).toBeInTheDocument();

    // À importer : un bloc ordinaire se marque « À podzer » depuis son en-tête ; la tuile n'a plus rien de podz.
    const ordinaire = (await screen.findByText(/tiktok\.com\/@?normal|normal/)).closest("[data-carte]") as HTMLElement;
    expect(ordinaire).not.toHaveTextContent("à podzer");
    expect(within(ordinaire).queryByRole("button", { name: "Valider le podz" })).toBeNull();
    fireEvent.click(within(ordinaire).getByRole("button", { name: "À podzer" }));
    await waitFor(() => expect(api.marquerPodz).toHaveBeenCalledWith("k3", true));
    expect(await screen.findByTestId("info")).toHaveTextContent("« smart_girl » est à podzer : ses comptes ne seront pas importés.");
    fireEvent.click(within(ordinaire).getByTitle("Modifier la note et la remarque"));
    expect(screen.queryByLabelText("À podzer")).toBeNull();

    // Prochain batch : le bloc à podzer porte la pastille, son compte ne s'importe pas, le podz se valide sur le bloc.
    fireEvent.click(screen.getByRole("tab", { name: /Prochain batch/ }));
    const bloc = (await screen.findByText(/a\.valider/)).closest("[data-carte]") as HTMLElement;
    expect(bloc).toHaveAttribute("data-carte", "white_bg_run");
    expect(bloc).toHaveTextContent("à podzer");
    const tuile = within(bloc).getByText(/a\.valider/).closest("[data-compte]") as HTMLElement;
    expect(within(tuile).queryByRole("button", { name: "Importer" })).toBeNull();
    expect(within(tuile).queryByRole("button", { name: "Valider le podz" })).toBeNull();
    fireEvent.click(within(bloc).getByRole("button", { name: "Valider le podz" }));
    await waitFor(() => expect(api.validerPodz).toHaveBeenCalledWith(["k4"], true));
    fireEvent.click(within(screen.getByTestId("barre-batch")).getByRole("button", { name: /Valider les podz \(1\)/ }));
    await waitFor(() => expect(api.validerPodz).toHaveBeenCalledWith(["k4"]));
    expect(await screen.findByTestId("info")).toHaveTextContent("1 label à podzer validé : dans « Weekly update », catégorie Podz.");
    fireEvent.click(within(bloc).getByRole("button", { name: "Plus à podzer" }));
    await waitFor(() => expect(api.marquerPodz).toHaveBeenCalledWith("k4", false));

    // Weekly update : la catégorie Podz range les LABELS validés, chacun avec ses comptes.
    fireEvent.click(screen.getByRole("tab", { name: /Weekly update/ }));
    const categorie = await screen.findByTestId("podz");
    expect(categorie).toHaveTextContent("Podz· 1 label");
    expect(categorie).toHaveTextContent("ces labels sont faits en podz, pas importés");
    const valide = within(categorie).getByText(/deja\.valide/).closest("[data-carte]") as HTMLElement;
    expect(valide).toHaveAttribute("data-carte", "study_scrapbook");
    expect(valide).toHaveTextContent("podz validé");
    expect(valide).toHaveTextContent("Scrapbook d'étudiante");
    const tuileValidee = within(valide).getByText(/deja\.valide/).closest("[data-compte]") as HTMLElement;
    expect(within(tuileValidee).queryByRole("button", { name: "Retirer des podz" })).toBeNull();
    expect(within(tuileValidee).queryByRole("button", { name: "Prochain batch" })).toBeNull();
    fireEvent.click(within(valide).getByRole("button", { name: "Retirer des podz" }));
    await waitFor(() => expect(api.validerPodz).toHaveBeenCalledWith(["k5"], false));
  });

  it("« Créer ce label » sur une carte proposée d'une app qui existe, Atala comprise", async () => {
    api.lireComptes.mockResolvedValue([compte({}), compte({ id: "c2", handle: "clean", label_propose_id: "k2" })]);
    api.validerCarte.mockResolvedValue(undefined);
    const confirmer = vi.spyOn(window, "confirm").mockReturnValue(true);
    rendre();
    const sophia = (await screen.findByText("clean_girl")).closest("[data-carte]") as HTMLElement;
    const atala = screen.getByText("classic_girl_run").closest("[data-carte]") as HTMLElement;
    expect(within(atala).getByRole("button", { name: "Créer ce label" })).toBeInTheDocument();
    fireEvent.click(within(sophia).getByRole("button", { name: "Créer ce label" }));
    expect(confirmer).toHaveBeenCalledWith(expect.stringContaining("Créer le label « clean_girl » pour Sophia ?"));
    await waitFor(() => expect(api.validerCarte).toHaveBeenCalledWith("k2"));
    confirmer.mockRestore();
  });
});

describe("corbeille", () => {
  it("Supprimer met à la corbeille ; dans l'onglet Corbeille : Restaurer, et le compte n'est plus compté ailleurs", async () => {
    api.lireCartes.mockResolvedValue(CARTES);
    api.mettreCorbeille.mockResolvedValue(undefined);
    api.restaurerCompte.mockResolvedValue(undefined);
    api.lireComptes.mockResolvedValue([compte({}), compte({ id: "c8", handle: "jete", supprime_at: "2026-11-18T16:00:00Z" })]);
    src.lireSources.mockResolvedValue(donnees());
    prop.lirePropositions.mockResolvedValue([]);
    expect(compterEtapes([compte({}), compte({ id: "c8", supprime_at: "2026-11-18T16:00:00Z" })])).toEqual({ a_importer: 1, prochain_batch: 0, corbeille: 1 });
    rendre();
    expect(await screen.findByRole("tab", { name: /Corbeille 1/ })).toBeInTheDocument();
    expect(screen.queryByText(/jete/)).toBeNull();
    const tuile = screen.getByText(/compte\.un/).closest("[data-compte]") as HTMLElement;
    fireEvent.click(within(tuile).getByRole("button", { name: "Supprimer" }));
    await waitFor(() => expect(api.mettreCorbeille).toHaveBeenCalledWith("c1"));
    fireEvent.click(screen.getByRole("tab", { name: /Corbeille/ }));
    const jete = (await screen.findByText(/jete/)).closest("[data-compte]") as HTMLElement;
    fireEvent.click(within(jete).getByRole("button", { name: "Restaurer" }));
    await waitFor(() => expect(api.restaurerCompte).toHaveBeenCalledWith("c8"));
    expect(within(jete).getByRole("button", { name: "Supprimer pour de bon" })).toBeInTheDocument();
  });
});

describe("ajout de comptes", () => {
  it("plusieurs apps cochées, une remarque par compte (UGC en un clic) ; sans label, « Label à podzer » ne se coche pas", async () => {
    api.ajouterComptes.mockResolvedValue({ crees: ["un", "deux"], deja: [], ids: [] });
    render(<DialogueAjout ouvert cartes={CARTES} onFermer={() => {}} onFini={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/compte1/), { target: { value: "https://www.tiktok.com/@un\n@deux" } });
    fireEvent.click(screen.getByRole("button", { name: "Atala" }));
    fireEvent.click(screen.getByRole("button", { name: "Sophia" }));
    // « À podzer » est une marque du label : sans label choisi, la case est fermée.
    expect(screen.getByLabelText("Label à podzer")).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Remarque pour @deux"), { target: { value: "photos à refaire" } });
    fireEvent.click(screen.getAllByRole("button", { name: "UGC" })[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Ajouter" }));
    await waitFor(() => expect(api.ajouterComptes).toHaveBeenCalledWith(["un", "deux"], null, ["atala", "sophia"], {
      remarques: { un: REMARQUE_UGC, deux: "photos à refaire" },
    }));
    expect(api.marquerPodz).not.toHaveBeenCalled();
  });

  it("« Label à podzer » à l'ajout : les comptes entrent sous le label choisi, et c'est le label qui est marqué", async () => {
    api.ajouterComptes.mockResolvedValue({ crees: ["un"], deja: [], ids: [] });
    api.marquerPodz.mockResolvedValue(undefined);
    render(<DialogueAjout ouvert cartes={CARTES} onFermer={() => {}} onFini={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/compte1/), { target: { value: "@un" } });
    fireEvent.change(screen.getByLabelText("Label"), { target: { value: "k2" } });
    fireEvent.click(screen.getByLabelText("Label à podzer"));
    fireEvent.click(screen.getByRole("button", { name: "Ajouter" }));
    await waitFor(() => expect(api.ajouterComptes).toHaveBeenCalledWith(["un"], expect.objectContaining({ id: "k2" }), ["sophia"], { remarques: {} }));
    await waitFor(() => expect(api.marquerPodz).toHaveBeenCalledWith("k2", true));
  });
});
