import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CarteLabel, CompteBible } from "./moodboard";
import type { DonneesSources, SourceBible } from "./sources";

const api = vi.hoisted(() => ({
  lireComptes: vi.fn(), lireCartes: vi.fn(), changerEtape: vi.fn(), lancerBatch: vi.fn(), validerCarte: vi.fn(), changerCarte: vi.fn(),
  modifierCompte: vi.fn(), mettreCorbeille: vi.fn(), restaurerCompte: vi.fn(), supprimerDefinitivement: vi.fn(), ajouterComptes: vi.fn(), rafraichirMiniatures: vi.fn(),
}));
vi.mock("./moodboard", async (orig) => ({ ...(await orig<typeof import("./moodboard")>()), ...api }));
const src = vi.hoisted(() => ({ lireSources: vi.fn() }));
vi.mock("./sources", async (orig) => ({ ...(await orig<typeof import("./sources")>()), ...src }));

import { appsDe, compterEtapes, handlesDuTexte, ranger, REMARQUE_UGC, vuesCourtes } from "./moodboard";
import { DialogueAjout } from "./DialoguesBible";
import { PageBible } from "./PageBible";
import { REGLES_DEFAUT } from "./sources";

const carte = (o: Partial<CarteLabel>): CarteLabel => ({
  id: "k1", nom: "classic_girl_run", titre: null, section: "atala", badge: "propose", description_da: "Coureuse en photo iPhone", label_id: null, ordre: 1, statut: "a_valider", ...o,
});
const compte = (o: Partial<CompteBible>): CompteBible => ({
  id: "c1", handle: "compte.un", etape: "a_importer", label_propose_id: "k1", autres_cartes: [], note_import: null, remarque: null, a_podzer: false,
  posts: [{ url: "https://www.tiktok.com/@compte.un/video/7600000000000000001", miniature_url: "https://img.test/1.jpg", vues: 4800000 }],
  miniatures_statut: "ok", miniatures_erreur: null, vues_mediane: 85000, meilleur_post_vues: 722000, abonnes: null, ajoute_at: "2026-11-19T10:00:00Z", ...o,
});

const CARTES = [carte({}), carte({ id: "k2", nom: "clean_girl", section: "sophia", badge: "propose", ordre: 2 }), carte({ id: "k3", nom: "smart_girl", section: "sophia", badge: "existe", ordre: 1, label_id: "L1" })];

const source = (o: Partial<SourceBible>): SourceBible => ({
  id: "s1", handle: "une.source", langue: "en", actif: true, labels: [{ id: "L1", nom: "smart_girl" }], slides: [], importes: 120, valides: 90,
  perf: { posts: 20, r: 1.12, vuesMediane: 900, rVsLabel: 1.05, labelNom: "smart_girl" }, essaiMax: null, essaiVerdict: null, dernierImport: "2026-11-10T06:00:00Z",
  attente: null, sequence: null, restant: 0, semaine: null, etape: "weekly", ...o,
});
const donnees = (sources: SourceBible[] = [], o: Partial<DonneesSources> = {}): DonneesSources => ({
  sources,
  file: { enCours: null, attente: [], essais: [], reglages: { lotMax: 8, nouvellesParJour: 1000, essaiPosts: 30, essaiMesuresMin: 10, postsMaxParMaj: 100 } },
  semaine: null,
  regles: { ...REGLES_DEFAUT, rMin: 0.95, rVsLabelMin: 0.95, lotMax: 8 },
  labels: [{ id: "L1", nom: "smart_girl", style_theme: null, application_id: "00000000-0000-4000-8000-000000000001", apps: ["00000000-0000-4000-8000-000000000001"] }],
  ...o,
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

  it("filtre « À podzer », recherche dans la remarque, apps réunies sans doublon", () => {
    const comptes = [compte({}), compte({ id: "c2", handle: "podz", a_podzer: true, remarque: REMARQUE_UGC })];
    const handles = (f: Parameters<typeof ranger>[2]) => ranger(comptes, CARTES, f).flatMap((g) => g.cartes.flatMap((c) => c.comptes.map((x) => x.compte.handle)));
    expect(handles({ etape: "a_importer", recherche: "", section: "", podzer: true })).toEqual(["podz"]);
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
    api.lireCartes.mockResolvedValue(CARTES);
    api.changerEtape.mockResolvedValue(undefined);
    src.lireSources.mockResolvedValue(donnees());
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
      compte({ id: "c5", handle: "a.podzer", etape: "prochain_batch", label_propose_id: "k3", a_podzer: true }),
      compte({ id: "c6", handle: "label.propose", etape: "prochain_batch", label_propose_id: "k2" }),
    ]);
    api.lancerBatch.mockResolvedValue([
      { id: "c2", handle: "pret.un", statut: "lancee", essai_max: 30 },
      { id: "c3", handle: "pret.deux", statut: "lancee", essai_max: null },
    ]);
    rendre();
    fireEvent.click(await screen.findByRole("tab", { name: /Prochain batch 5/ }));
    const barre = await screen.findByTestId("barre-batch");
    expect(barre).toHaveTextContent("5 comptes dans le prochain batch, 2 prêts à importer.");
    // Atala existe : sa carte n'attend plus une appli, seulement son label.
    expect(barre).toHaveTextContent("Les autres : à podzer : pas d'import (1), label à créer (2).");
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
    expect(bilan).toHaveTextContent("@pret.un : dans la séquence d'import, essai de 30 posts");
    expect(bilan).toHaveTextContent("@pret.deux : dans la séquence d'import, ses 100 posts les plus vus");
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
    ], { semaine: { semaine: "2026-11-16", sources: [{ compteReferenceId: "s1", handle: "une.source", langue: "en", label: "smart_girl", posts: 20, r: 1.12, rVsLabel: 1.05, decision: "maj", raison: "r", meilleurVues: null, lanceeLe: "2026-11-17T05:40:00Z", importes: 12, valides: 9 }] } }));
    rendre();
    // une.source porte déjà le label de sa carte : seul source.ailleurs reste à faire (sa carte vise un autre label).
    expect(await screen.findByRole("tab", { name: /Prochain batch 1/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /À l'essai 1/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Weekly update 1/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Arrêtées 1/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /Prochain batch/ }));
    const reste = (await screen.findByText(/source\.ailleurs/)).closest("[data-compte]") as HTMLElement;
    expect(within(reste).getByText("déjà une source · smart_girl")).toBeInTheDocument();
    expect(screen.queryByText(/une\.source/)).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: /Weekly update/ }));
    expect(screen.getByTestId("regle-etape")).toHaveTextContent("Automatique");
    expect(screen.getByTestId("regle-etape")).toHaveTextContent("si son r dépasse 0,95");
    expect(await screen.findByTestId("semaine-en-bref")).toHaveTextContent("Lundi 16/11 : 1 source retenue (1 mise à jour), 0 pas cette semaine. 12 slideshows importés, 9 validés.");
    const tuile = screen.getByText(/une\.source/).closest("[data-source]") as HTMLElement;
    expect(within(tuile).getByTestId("etat-une.source")).toHaveTextContent("Mise à jour le 17/11 (r au-dessus de 0,95)");
    expect(tuile).toHaveTextContent("r 1,12");
    expect(tuile).toHaveTextContent("×1,05 label");
    expect(tuile).toHaveTextContent("stock 90 / 120");
    expect(within(tuile).getByRole("link", { name: /Réglages dans Sources/ })).toHaveAttribute("href", "/admin/sources");

    fireEvent.click(screen.getByRole("tab", { name: /À l'essai/ }));
    expect(await screen.findByTestId("etat-source.ailleurs")).toHaveTextContent("Essai : 30 sur 30 importés, 6 sur 10 mesurés");
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
  it("plusieurs apps cochées, « À podzer », une remarque par compte (UGC en un clic)", async () => {
    api.ajouterComptes.mockResolvedValue({ crees: ["un", "deux"], deja: [], ids: [] });
    render(<DialogueAjout ouvert cartes={CARTES} onFermer={() => {}} onFini={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/compte1/), { target: { value: "https://www.tiktok.com/@un\n@deux" } });
    fireEvent.click(screen.getByRole("button", { name: "Atala" }));
    fireEvent.click(screen.getByRole("button", { name: "Sophia" }));
    fireEvent.click(screen.getByLabelText("À podzer"));
    fireEvent.change(screen.getByLabelText("Remarque pour @deux"), { target: { value: "photos à refaire" } });
    fireEvent.click(screen.getAllByRole("button", { name: "UGC" })[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Ajouter" }));
    await waitFor(() => expect(api.ajouterComptes).toHaveBeenCalledWith(["un", "deux"], null, ["atala", "sophia"], {
      a_podzer: true, remarques: { un: REMARQUE_UGC, deux: "photos à refaire" },
    }));
  });
});
