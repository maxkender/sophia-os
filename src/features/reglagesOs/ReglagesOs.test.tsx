import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";

const api = vi.hoisted(() => ({
  lireReglagesBruts: vi.fn(),
  ecrireReglages: vi.fn(async () => undefined),
  lireJournal: vi.fn(async () => [
    { cle: "accueil_message_texte", ancienne: "a", nouvelle: "b", par_nom: "Max Kender", at: "2026-10-29T08:00:00Z" },
  ]),
  lireZonesPaie: vi.fn(),
  enregistrerTarifZone: vi.fn(async () => undefined),
  enregistrerZonePays: vi.fn(async () => undefined),
}));
vi.mock("./api", async (orig) => ({ ...(await orig<typeof import("./api")>()), ...api }));
const auth = vi.hoisted(() => ({ role: "admin" }));
vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => ({ role: auth.role }) }));

import {
  isoVersLocalParis,
  lignesPays,
  localParisVersIso,
  remplirVariables,
  variablesInconnues,
} from "./api";
import { CarteCohorteAccueil, CarteMessagesUpwork, CarteTextesPosteurs } from "./CartesReglages";
import { ZonesPaie } from "./ZonesPaie";
import { lireValeursReponses, valeursReponsesValides } from "@/features/reponses/reglages";

function rendu(el: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}>{el}</QueryClientProvider>);
}

describe("Partie E : les réglages de l'OS", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    auth.role = "admin";
    await i18n.changeLanguage("fr");
  });

  it("Messages Upwork : aperçu avec les variables remplies, enregistrement, journal", async () => {
    api.lireReglagesBruts.mockResolvedValue({
      accueil_message_texte: "Hi {prenom}, log in: {email} {inconnue}",
      arret_message_texte: "Your contract has ended.",
      arret_raison_upwork: "107",
      slack_lien_invitation: "https://join.slack.com/x",
    });
    rendu(<CarteMessagesUpwork />);
    const apercu = await screen.findByTestId("apercu-accueil");
    expect(apercu).toHaveTextContent("Hi Ana, log in: anas@sophia.com {inconnue}");
    // 0463 : aucun message à l'arrêt, plus de champ « Your contract has ended… ».
    expect(screen.queryByTestId("apercu-arret")).toBeNull();
    expect(screen.getByText(/Variables inconnues.*\{inconnue\}/)).toBeInTheDocument();
    expect(await screen.findByText(/Dernière modification : Max Kender/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Motif de fin de contrat Upwork"), { target: { value: "236" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() =>
      expect(api.ecrireReglages).toHaveBeenCalledWith({
        accueil_message_texte: "Hi {prenom}, log in: {email} {inconnue}",
        arret_raison_upwork: "236",
      }),
    );
  });

  it("Head of Ops : lecture seule, pas de bouton Enregistrer", async () => {
    auth.role = "head_of_ops";
    api.lireReglagesBruts.mockResolvedValue({ cohorte_jour_limite: 4, accueil_contrats_depuis: "2026-10-28T17:48:32Z" });
    rendu(<CarteCohorteAccueil />);
    const carte = await screen.findByTestId("carte-cohorte-accueil");
    expect(within(carte).getByLabelText("Jour limite de la cohorte")).toBeDisabled();
    expect(within(carte).queryByRole("button", { name: "Enregistrer" })).toBeNull();
    expect(within(carte).getByText("Modifiable par l'admin seulement.")).toBeInTheDocument();
  });

  it("Cohorte : le jour limite et la date de départ (heure de Paris → ISO)", async () => {
    api.lireReglagesBruts.mockResolvedValue({ cohorte_jour_limite: 4, accueil_contrats_depuis: "2026-10-28T17:48:00Z" });
    rendu(<CarteCohorteAccueil />);
    const carte = await screen.findByTestId("carte-cohorte-accueil");
    expect(within(carte).getByLabelText(/contrats commencés depuis/)).toHaveValue("2026-10-28T18:48");
    fireEvent.change(within(carte).getByLabelText("Jour limite de la cohorte"), { target: { value: "5" } });
    fireEvent.click(within(carte).getByRole("button", { name: "Enregistrer" }));
    await waitFor(() =>
      expect(api.ecrireReglages).toHaveBeenCalledWith({ cohorte_jour_limite: 5, accueil_contrats_depuis: "2026-10-28T17:48:00.000Z" }),
    );
  });

  it("Textes aux posteurs : lien_1000 garde ses autres clés (envoi_actif), boutons Slack et raisons", async () => {
    const lien = {
      envoi_actif: true, seuil: 1000, titre: "1,000", message: "Hi @{handle} {lien}", titre_relance: "R", message_relance: "RR {lien}",
      liens: { sophia: "taap.it/sophia.culture", unswipe: "taap.it/unswipe", micabo: "taap.it/micabo" },
    };
    const raisons = { shadowban_zero: "a {n}", shadowban_faibles: "b", vues_basses: "c", posts_manquants: "d" };
    const boutons = {
      done: "Done", aide: "I need help", stop: "I want to stop", confirmer_titre: "Sure?", confirmer_texte: "End.",
      confirmer_oui: "Yes", confirmer_non: "No", merci: "Thanks",
    };
    api.lireReglagesBruts.mockResolvedValue({ lien_1000: lien, ckd_raison_textes: raisons, slack_boutons: boutons });
    rendu(<CarteTextesPosteurs />);
    const carte = await screen.findByTestId("carte-textes-posteurs");
    fireEvent.change(within(carte).getByLabelText("Bouton « fait »"), { target: { value: "Fait" } });
    fireEvent.click(within(carte).getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(api.ecrireReglages).toHaveBeenCalled());
    const envoye = api.ecrireReglages.mock.calls[0]![0] as Record<string, Record<string, unknown>>;
    expect(envoye.lien_1000).toMatchObject({ envoi_actif: true, seuil: 1000, titre: "1,000", liens: lien.liens });
    expect(envoye.slack_boutons).toMatchObject({ done: "Fait", stop: "I want to stop" });
    expect(envoye.ckd_raison_textes).toEqual(raisons);
  });

  it("Zones : un pays sans zone en rouge ; choisir sa zone ; changer un tarif demande confirmation", async () => {
    api.lireZonesPaie.mockResolvedValue({
      zones: [{ zone: "A", tarif: 14 }, { zone: "B", tarif: 10 }],
      pays: [{ pays: "FR", zone: "A" }],
      paysActifs: ["FR", "KZ"],
    });
    rendu(<ZonesPaie />);
    await screen.findByText("KZ");
    const kz = document.querySelector<HTMLElement>('[data-pays="KZ"]')!;
    expect(kz.dataset.sansZone).toBe("true");
    expect(document.querySelector<HTMLElement>('[data-pays="FR"]')!.dataset.sansZone).toBeUndefined();
    expect(screen.getByText(/1 pays sans zone/)).toBeInTheDocument();
    fireEvent.change(within(kz).getByLabelText("Zone de KZ"), { target: { value: "B" } });
    await waitFor(() => expect(api.enregistrerZonePays).toHaveBeenCalledWith("KZ", "B"));

    const zoneA = document.querySelector<HTMLElement>('[data-zone="A"]')!;
    fireEvent.change(within(zoneA).getByLabelText("Zone A"), { target: { value: "15" } });
    const confirmer = vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    fireEvent.click(within(zoneA).getByRole("button", { name: "Enregistrer" }));
    expect(api.enregistrerTarifZone).not.toHaveBeenCalled();
    confirmer.mockReturnValueOnce(true);
    fireEvent.click(within(zoneA).getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(api.enregistrerTarifZone).toHaveBeenCalledWith("A", 15));
    confirmer.mockRestore();
  });
});

describe("Partie E : la logique", () => {
  it("variables : remplies, inconnues gardées et signalées", () => {
    expect(remplirVariables("Hi {prenom} {x}", { prenom: "Ana" })).toBe("Hi Ana {x}");
    expect(variablesInconnues("{prenom} {x} {x} {date}", ["prenom", "date"])).toEqual(["x"]);
  });

  it("heure de Paris ↔ ISO, changement d'heure compris", () => {
    expect(isoVersLocalParis("2026-10-28T17:48:00Z")).toBe("2026-10-28T18:48");
    expect(localParisVersIso("2026-10-28T18:48")).toBe("2026-10-28T17:48:00.000Z");
    expect(localParisVersIso("2026-07-01T10:00")).toBe("2026-07-01T08:00:00.000Z");
    expect(isoVersLocalParis("")).toBe("");
  });

  it("pays : ceux sans zone d'abord, puis par code", () => {
    const l = lignesPays({ zones: [], pays: [{ pays: "DE", zone: "A" }, { pays: "AF", zone: "C" }], paysActifs: ["KZ", "DE"] });
    expect(l.map((x) => x.pays)).toEqual(["KZ", "AF", "DE"]);
    expect(l.find((x) => x.pays === "AF")!.actif).toBe(false);
  });

  it("réponses : défauts, et valeurs refusées", () => {
    expect(lireValeursReponses({ seuil: "0.7" })).toEqual({ seuil: 0.7, max_jour: 3, pause_max_jours: 7 });
    expect(valeursReponsesValides({ seuil: 1.2, max_jour: 3, pause_max_jours: 7 })).toBe(false);
    expect(valeursReponsesValides({ seuil: 0.8, max_jour: 2.5, pause_max_jours: 7 })).toBe(false);
    expect(valeursReponsesValides({ seuil: 0.8, max_jour: 0, pause_max_jours: 1 })).toBe(true);
  });
});
