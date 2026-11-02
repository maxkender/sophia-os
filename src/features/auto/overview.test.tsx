/**
 * Prompt 22, partie 3 (et 12) : Overview. Health (tâche en retard en rouge,
 * alerte du jeton), Today (compteurs cliquables, déjà filtrés), This week, et
 * Switches (paie par l'API et bot FAQ ; la Head of Ops ne peut rien changer).
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";

import type { Aujourdhui, SanteAuto, Semaine } from "./api";
import { joursSemaine } from "./logique";

const api = vi.hoisted(() => ({
  lireSante: vi.fn(),
  lireAujourdhui: vi.fn(),
  lireSemaine: vi.fn(),
  lireJournal: vi.fn(async () => []),
}));
vi.mock("./api", async (orig) => ({ ...(await orig<typeof import("./api")>()), ...api }));
const upwork = vi.hoisted(() => ({ lienConnexionUpwork: vi.fn(async () => "https://upwork.example/auth") }));
vi.mock("@/features/upwork/api", () => upwork);
const interrupteurs = vi.hoisted(() => ({
  lireInterrupteurs: vi.fn(async () => ({ accueil_auto: "test", relances_auto: "test", kill_auto: "test", arret_auto: "test", lundi_message_auto: "test", lundi_soir_auto: "test", reponses_auto: "test", kill_message_auto: "on" })),
  enregistrerInterrupteur: vi.fn(async () => undefined),
  lireRepriseRappels: vi.fn(async () => ""),
  enregistrerRepriseRappels: vi.fn(async () => undefined),
  lireModePaieApi: vi.fn(async () => "test"),
  enregistrerModePaieApi: vi.fn(async () => undefined),
}));
vi.mock("@/features/interrupteurs/api", async (orig) => ({ ...(await orig<typeof import("@/features/interrupteurs/api")>()), ...interrupteurs }));
const faq = vi.hoisted(() => ({
  lireReglagesFaqAdmin: vi.fn(async () => ({ mode_slack: "test", mode_os: "test", canaux_slack: ["C0BL56RJH7T"], message_attente: true })),
  ecrireReglagesFaq: vi.fn(async () => undefined),
}));
vi.mock("@/features/chatbot/api", () => faq);
const frequences = vi.hoisted(() => ({
  lireEtatFrequences: vi.fn(async () => ({ taches: [], appels_jour: 120, limite: 40000, alerte: 30000 })),
  enregistrerFrequences: vi.fn(async () => undefined),
}));
vi.mock("@/features/frequences/api", async (orig) => ({ ...(await orig<typeof import("@/features/frequences/api")>()), ...frequences }));
const auth = vi.hoisted(() => ({ role: "admin" }));
vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => ({ role: auth.role }) }));

import { Interrupteurs } from "@/features/interrupteurs/Interrupteurs";

import { CarteAujourdhui, CarteSemaine, SanteAuto } from "./Overview";

function rendu(el: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{el}</MemoryRouter>
    </QueryClientProvider>,
  );
}

const tache = (o: Partial<SanteAuto["taches"][number]>): SanteAuto["taches"][number] => ({
  tache: "recrues", job: "recrues-check", existe: true, actif: true, dernier_at: "2026-10-29T10:45:00Z", statut: "succeeded",
  message: "1 row", passage_at: null, en_erreur: false, en_retard: false, ...o,
});

const SANTE: SanteAuto = {
  taches: [
    tache({}),
    tache({ tache: "accueil", job: "accueil-auto", en_retard: true, dernier_at: "2026-10-29T06:00:00Z" }),
    tache({ tache: "paie", job: "paie-lundi", statut: "failed", en_erreur: true, message: "timeout" }),
  ],
  upwork: {
    statut: "connecte", access_expire_at: "2026-10-29T15:00:00Z", derniere_erreur: null, dernier_appel_at: "2026-10-29T10:00:00Z",
    renouvellement_at: "2026-10-29T09:00:00Z", renouvellement_erreur: "invalid_grant", expire_bientot: true, alerte: true,
  },
};

const AUJOURDHUI: Aujourdhui = {
  jour: "2026-10-29",
  messages: { connexion: 3, jeudi: 12 },
  kills: [{ id: "k1", poster_id: "p1", nom: "Ana Silva", etape: "tiktok", statut: "en_attente", prevu_at: new Date(Date.now() + 5 * 3_600_000).toISOString() }],
  a_lire: 2,
  questions_paie: 1,
  contrats_a_relier: 4,
  arrets_a_la_main: 1,
  paie_a_verifier: 6,
};

const SEMAINE: Semaine = {
  lundi: "2026-10-26", aujourdhui: "2026-10-29", paie: { statut: "fini", bilan: null }, paie_lignes: 10, paie_payees: 10,
  lundi_messages: 40, lundi_soir: 3, jeudi_lance_at: null, jeudi_nudges: 0, samedi_lance_at: null, samedi_total: 0,
  samedi_decides: 0, kills_a_envoyer: 0, kills_envoyes: 0,
};

describe("Overview → Health", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    auth.role = "admin";
    await i18n.changeLanguage("en");
    api.lireSante.mockResolvedValue(SANTE);
  });

  it("une tâche en retard ou en erreur s'affiche en rouge ; les autres non", async () => {
    rendu(<SanteAuto />);
    const liste = await screen.findByTestId("taches-auto");
    await vi.waitFor(() => expect(liste.querySelectorAll("[data-tache]")).toHaveLength(3));
    expect(liste.querySelector('[data-tache="recrues"]')!.hasAttribute("data-rouge")).toBe(false);
    expect(liste.querySelector('[data-tache="accueil"]')!.getAttribute("data-rouge")).toBe("true");
    expect(within(liste.querySelector<HTMLElement>('[data-tache="paie"]')!).getByText("Error: timeout")).toBeTruthy();
  });

  it("jeton qui expire dans moins de 6 h et renouvellement raté : alerte et Reconnecter", async () => {
    rendu(<SanteAuto />);
    expect((await screen.findByTestId("alerte-jeton")).textContent).toMatch(/renewal failed: reconnect Upwork/);
    fireEvent.click(screen.getByRole("button", { name: /Reconnect/ }));
    await vi.waitFor(() => expect(upwork.lienConnexionUpwork).toHaveBeenCalled());
  });

  it("pas d'alerte quand le renouvellement va bien ; la Head of Ops n'a pas Reconnecter", async () => {
    auth.role = "head_of_ops";
    api.lireSante.mockResolvedValue({ ...SANTE, upwork: { ...SANTE.upwork!, alerte: false, renouvellement_erreur: null } });
    rendu(<SanteAuto />);
    await screen.findByText("Token expires", { exact: false });
    expect(screen.queryByTestId("alerte-jeton")).toBeNull();
    expect(screen.queryByRole("button", { name: /Reconnect/ })).toBeNull();
  });
});

describe("Overview → Health, compte de secours (prompt 25 v4)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    auth.role = "admin";
    await i18n.changeLanguage("en");
  });
  const compte = (o: Partial<NonNullable<SanteAuto["upwork_comptes"]>[number]>): NonNullable<SanteAuto["upwork_comptes"]>[number] => ({
    compte: "secours", statut: "deconnecte", connecte_une_fois: false, utilisateur: null, organisations: null, utilises: 0, limite: false,
    access_expire_at: null, derniere_erreur: null, dernier_appel_at: null, renouvellement_at: null, renouvellement_erreur: null,
    expire_bientot: false, alerte: false, ...o,
  });

  it("pas encore connecté : « Connect the fallback account » ouvre l'autorisation du compte de secours", async () => {
    api.lireSante.mockResolvedValue({ ...SANTE, upwork_comptes: [compte({ compte: "principal", statut: "connecte", connecte_une_fois: true }), compte({})] });
    rendu(<SanteAuto />);
    const bloc = await screen.findByTestId("compte-secours");
    fireEvent.click(await within(bloc).findByRole("button", { name: "Connect the fallback account" }));
    await vi.waitFor(() => expect(upwork.lienConnexionUpwork).toHaveBeenCalledWith("secours"));
    expect(within(bloc).queryByTestId("alerte-secours")).toBeNull();
  });

  it("connecté puis déconnecté : alerte, nom et organisations ; la Head of Ops n'a pas le bouton", async () => {
    auth.role = "head_of_ops";
    api.lireSante.mockResolvedValue({
      ...SANTE,
      upwork_comptes: [compte({ statut: "erreur", connecte_une_fois: true, alerte: true, utilisateur: "Adrien M", organisations: "Vik Studios" })],
    });
    rendu(<SanteAuto />);
    expect((await screen.findByTestId("alerte-secours")).textContent).toMatch(/fallback Upwork account is disconnected/);
    const bloc = screen.getByTestId("compte-secours");
    expect(within(bloc).getByText("Adrien M")).toBeTruthy();
    expect(within(bloc).getByText("Organizations: Vik Studios")).toBeTruthy();
    expect(within(bloc).queryByRole("button")).toBeNull();
  });
});

describe("Overview → Today", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage("en");
    api.lireAujourdhui.mockResolvedValue(AUJOURDHUI);
  });

  it("chaque compteur mène à la bonne page, déjà filtrée", async () => {
    rendu(<CarteAujourdhui />);
    const total = await screen.findByTestId("messages-jour");
    expect(total.textContent).toBe("15 messages sent today");
    expect(total.getAttribute("href")).toBe("/admin/auto/logs?source=message&du=2026-10-29&au=2026-10-29");
    expect(document.querySelector('[data-message-type="jeudi"]')!.getAttribute("href")).toBe(
      "/admin/auto/logs?source=message&du=2026-10-29&au=2026-10-29&action=jeudi",
    );
    const lien = (libelle: string) => screen.getByText(libelle).closest("a")!.getAttribute("href");
    expect(lien("Kills in progress")).toBe("/admin/auto/recruits?risque=1");
    expect(lien("Messages to read")).toBe("/admin/auto/needs-you?type=message_a_lire,reponse_peu_sure");
    expect(lien("Pay questions")).toBe("/admin/auto/needs-you?type=question_paie");
    expect(lien("Contracts to link")).toBe("/admin/auto/recruits#contrats");
    expect(lien("Stops to finish by hand")).toBe("/admin/auto/recruits#arrets");
    expect(lien("Pay lines to check")).toBe("/admin/auto/payroll");
  });

  it("les Kills en cours, avec leur compte à rebours", async () => {
    rendu(<CarteAujourdhui />);
    const kills = await screen.findByTestId("kills-en-cours");
    expect(kills.textContent).toMatch(/Ana Silva/);
    expect(kills.textContent).toMatch(/Kill in (4|5) h/);
  });
});

describe("Overview → This week", () => {
  it("lundi fait, jeudi à finir (nudge pas lancé), samedi et dimanche à venir", () => {
    expect(joursSemaine(SEMAINE).map((j) => [j.jour, j.date, j.etat])).toEqual([
      ["lundi", "2026-10-26", "fait"],
      ["jeudi", "2026-10-29", "a_finir"],
      ["samedi", "2026-10-31", "a_venir"],
      ["dimanche", "2026-11-01", "a_venir"],
    ]);
    const dimanche = { ...SEMAINE, aujourdhui: "2026-11-01", jeudi_lance_at: "2026-10-29T05:00:00Z", samedi_lance_at: "2026-10-31T05:00:00Z", samedi_total: 5, samedi_decides: 3, kills_a_envoyer: 2, kills_envoyes: 2 };
    expect(joursSemaine(dimanche).map((j) => j.etat)).toEqual(["fait", "fait", "a_finir", "fait"]);
    expect(joursSemaine({ ...SEMAINE, paie: null, paie_payees: 4 })[0]!.etat).toBe("a_finir");
  });

  it("la semaine en une ligne, avec ce qui reste", async () => {
    await i18n.changeLanguage("en");
    api.lireSemaine.mockResolvedValue({ ...SEMAINE, aujourdhui: "2026-10-31", samedi_lance_at: "2026-10-31T05:00:00Z", samedi_total: 5, samedi_decides: 3 });
    rendu(<CarteSemaine />);
    const samedi = await vi.waitFor(() => {
      const x = document.querySelector<HTMLElement>('[data-jour="samedi"]');
      if (!x) throw new Error("pas encore");
      return x;
    });
    expect(samedi.getAttribute("data-etat")).toBe("a_finir");
    expect(samedi.textContent).toMatch(/3 \/ 5 decided, 2 left/);
  });
});

describe("Overview → Switches (paie par l'API, bot FAQ)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    auth.role = "admin";
    await i18n.changeLanguage("en");
  });

  it("le mode de la paie par l'API : « on » demande confirmation, puis seul le mode est écrit", async () => {
    rendu(<Interrupteurs />);
    const ligne = await vi.waitFor(() => {
      const x = document.querySelector<HTMLElement>('[data-reglage-mode="paie_api"]');
      if (!x || within(x).getByRole("button", { name: "Test" }).getAttribute("aria-pressed") !== "true") throw new Error("pas encore");
      return within(x);
    });
    await vi.waitFor(() => expect(ligne.getByRole("button", { name: "On" })).not.toBeDisabled());
    vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    fireEvent.click(ligne.getByRole("button", { name: "On" }));
    expect(interrupteurs.enregistrerModePaieApi).not.toHaveBeenCalled();
    fireEvent.click(ligne.getByRole("button", { name: "Off" }));
    await vi.waitFor(() => expect(interrupteurs.enregistrerModePaieApi).toHaveBeenCalledWith("off"));
  });

  it("le bot FAQ : Slack off / test / on, tableau de bord test / on ; le reste des réglages FAQ est gardé", async () => {
    rendu(<Interrupteurs />);
    const slack = await vi.waitFor(() => {
      const x = document.querySelector<HTMLElement>('[data-reglage-mode="faq_slack"]');
      if (!x || within(x).getByRole("button", { name: "Off" }).hasAttribute("disabled")) throw new Error("pas encore");
      return within(x);
    });
    expect(within(document.querySelector<HTMLElement>('[data-reglage-mode="faq_os"]')!).queryByRole("button", { name: "Off" })).toBeNull();
    fireEvent.click(slack.getByRole("button", { name: "Off" }));
    await vi.waitFor(() =>
      expect(faq.ecrireReglagesFaq).toHaveBeenCalledWith({ mode_slack: "eteint", mode_os: "test", canaux_slack: ["C0BL56RJH7T"], message_attente: true }),
    );
  });

  it("la Head of Ops voit tout mais ne peut rien changer", async () => {
    auth.role = "head_of_ops";
    rendu(<Interrupteurs />);
    await screen.findByText("Pay through the Upwork API");
    await screen.findByText("FAQ bot on Slack");
    for (const b of document.querySelectorAll<HTMLButtonElement>("[data-interrupteur] button, [data-reglage-mode] button")) {
      expect(b).toBeDisabled();
    }
  });
});
