import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  lirePosteursRuul: vi.fn(),
  lireTableauRuul: vi.fn(),
  lireLotRuul: vi.fn(),
  preparerLotRuul: vi.fn(),
  saisirLotRuul: vi.fn(),
  payerLotRuul: vi.fn(),
  rapprocherLotRuul: vi.fn(),
  changerStatutRuul: vi.fn(),
  lireMonEmailRuul: vi.fn(),
  enregistrerMonEmailRuul: vi.fn(),
  lireSuiviRuul: vi.fn(),
  marquerAjoutesRuul: vi.fn(),
}));
vi.mock("./api", () => api);
const auth = vi.hoisted(() => ({ roleReel: "poster" as string }));
vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => auth }));

import i18n from "@/locales";

import { BandeauEmailRuul, DELAI_MERCI_MS } from "./BandeauEmailRuul";
import { colonneBloquee, ENTETE_CSV_RUUL, lignesCsvLot, lireExportRuul } from "./logique";
import { PaieRuul } from "./PaieRuul";
import { PageSuiviRuul } from "./PagesRuul";

function rendu(element: React.ReactElement = <PaieRuul />) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{element}</QueryClientProvider>);
}

const posteur = (o: Record<string, unknown>) => ({
  poster_id: "p1", nom: "Ana Test", prenom_legal: "Ana", nom_legal: "Test", ruul_email: "ana@test.zz", ruul_statut: "a_ajouter",
  pays: "IT", cohorte: "2026-10-26", actif: true, ajoute_at: null, pret_at: null, premier_paiement_at: null,
  relances: 0, relance_at: null, stop_at: null, du: 14, ...o,
});

beforeEach(() => {
  vi.clearAllMocks();
  api.lireTableauRuul.mockResolvedValue({
    mode: "manuel", statuts: { a_ajouter: 1, invite: 1 }, semaine: "2026-11-02", lot: null, rattrapages: { nb: 2, total: 14 }, reportes: 2,
  });
  api.lirePosteursRuul.mockResolvedValue([posteur({}), posteur({ poster_id: "p2", nom: "Bo Test", ruul_statut: "invite", ajoute_at: "2026-11-09T10:00:00Z", relances: 1 })]);
  api.changerStatutRuul.mockResolvedValue({ ok: true });
  api.preparerLotRuul.mockResolvedValue({ ok: true });
  api.saisirLotRuul.mockResolvedValue({ ok: true });
});

describe("Paie Ruul", () => {
  it("à ajouter : email modifiable, « Ajouté sur Ruul » ; invités : « Marquer prêt »", async () => {
    api.lireLotRuul.mockResolvedValue({ semaine: "2026-11-02", lot: null, rapprochement: null, lignes: [], reportes: [] });
    rendu();
    const carte = await screen.findByTestId("ajouter-ruul");
    fireEvent.change(within(carte).getByLabelText("Email Ruul de Ana Test"), { target: { value: "ana.ruul@test.zz" } });
    fireEvent.click(within(carte).getByRole("button", { name: "Ajouté sur Ruul" }));
    await waitFor(() => expect(api.changerStatutRuul).toHaveBeenCalledWith("p1", "invite", "ana.ruul@test.zz"));
    fireEvent.click(within(screen.getByTestId("invites-ruul")).getByRole("button", { name: "Marquer prêt" }));
    await waitFor(() => expect(api.changerStatutRuul).toHaveBeenCalledWith("p2", "pret", undefined));
    expect(screen.getByTestId("tableau-ruul")).toHaveTextContent("14.00 $");
  });

  it("le lot : alertes, saisie de la facture, reportés", async () => {
    api.lireLotRuul.mockResolvedValue({
      semaine: "2026-11-02",
      lot: { id: "l", statut: "prepare", facture: null, total: 20, nb: 2, paye_at: null },
      rapprochement: null,
      lignes: [{
        poster_id: "p1", nom: "Ana Test", ruul_email: "ana@test.zz", pays: "IT", total: 25, bonus: 5, alertes: ["1er paiement", "rattrapage"],
        semaines: [
          { id: "a", semaine: "2026-10-26", montant: 10, rattrapage: true, statut: "a_payer", nb_comptes: 1, faits: 14, prevus: 14, paye_at: null, ecart: null },
          { id: "b", semaine: "2026-11-02", montant: 10, rattrapage: false, statut: "a_payer", nb_comptes: 1, faits: 14, prevus: 14, paye_at: null, ecart: null },
        ],
      }],
      reportes: [{ poster_id: "p2", nom: "Bo Test", ruul_statut: "invite", semaine: "2026-11-02", montant: 7, raison: "x" }],
    });
    rendu();
    const lot = await screen.findByTestId("lot-ruul");
    expect(within(lot).getByTestId("alertes-ruul")).toHaveTextContent("Ana Test : rattrapage");
    expect(within(lot).getByTestId("reportes-ruul")).toHaveTextContent("Bo Test 2/11 (7.00 $");
    expect(lot).toHaveTextContent("Bonus de parrainage : 5.00 $");
    expect(within(lot).getByRole("button", { name: "Exporter fichier Ruul" })).toBeTruthy();
    fireEvent.change(within(lot).getByLabelText("Numéro de facture Ruul"), { target: { value: "INV-1" } });
    fireEvent.click(within(lot).getByRole("button", { name: "Saisi" }));
    await waitFor(() => expect(api.saisirLotRuul).toHaveBeenCalledWith("2026-11-02", "INV-1"));
    expect(api.payerLotRuul).not.toHaveBeenCalled();
  });

  it("CSV du lot : le fichier d'import en masse de Ruul (email, montant, description)", () => {
    const semaine = (id: string, s: string, rattrapage = false) => ({
      id, semaine: s, montant: 10, rattrapage, statut: "a_payer", nb_comptes: 1, faits: 1, prevus: 1, paye_at: null, ecart: null,
    });
    const ligne = (o: Record<string, unknown>) => ({ poster_id: "p", nom: "Ana", ruul_email: "a@b.cc", pays: "IT", total: 20, alertes: [], semaines: [], ...o });
    expect(ENTETE_CSV_RUUL).toEqual(["email", "amount_usd", "description"]);
    expect(lignesCsvLot([
      ligne({ semaines: [semaine("1", "2026-10-26", true), semaine("2", "2026-11-02")] }),
      ligne({ poster_id: "q", ruul_email: "b@b.cc", total: 15.5, bonus: 5.5, semaines: [semaine("3", "2026-11-02")] }),
      // Sans email Ruul, ou rien à payer : pas de ligne.
      ligne({ poster_id: "r", ruul_email: null, semaines: [semaine("4", "2026-11-02")] }),
      ligne({ poster_id: "s", ruul_email: "c@b.cc", total: 0, semaines: [semaine("5", "2026-11-02")] }),
    ])).toEqual([
      ["a@b.cc", "20.00", "Week of 26/10 + 02/11"],
      ["b@b.cc", "15.50", "Week of 02/11 + referral bonus"],
    ]);
    expect(lireExportRuul('Name;E-mail;Amount (USD)\n"Ana";a@b.cc;"$20,00"\n')).toEqual([{ email: "a@b.cc", montant: "20.00" }]);
    expect(lireExportRuul("a,b\n1,2")).toEqual({ erreur: "colonnes email et montant introuvables" });
  });
});

describe("Étapes Ruul", () => {
  it("bloqué en rouge après 48 h sur la même étape", async () => {
    const { etapeBloquee } = await import("./logique");
    const m = new Date("2026-11-09T12:00:00Z");
    expect(etapeBloquee({ candidature: "2026-11-01T10:00:00Z", acceptee: "2026-11-02T10:00:00Z" }, m)).toBe("signee");
    expect(etapeBloquee({ candidature: "2026-11-09T10:00:00Z" }, m)).toBeNull();
    expect(etapeBloquee({}, m)).toBeNull();
  });
});

describe("Bandeau email Ruul (espace posteur)", () => {
  beforeEach(async () => {
    auth.roleReel = "poster";
    await i18n.changeLanguage("en");
  });

  it("posteur Ruul sans email : le bandeau, l'erreur de la base, puis enregistré et caché", async () => {
    api.lireMonEmailRuul.mockResolvedValue({ ruul: true, email: null });
    api.enregistrerMonEmailRuul.mockResolvedValueOnce({ ok: false, erreur: "This email is not valid." }).mockResolvedValueOnce({ ok: true });
    rendu(<BandeauEmailRuul />);
    const bandeau = await screen.findByTestId("bandeau-email-ruul");
    expect(bandeau).toHaveTextContent("Add your Ruul email so we can pay you");
    const champ = within(bandeau).getByLabelText("Your Ruul email");
    fireEvent.change(champ, { target: { value: "ana" } });
    fireEvent.click(within(bandeau).getByRole("button", { name: "Save" }));
    expect(await within(bandeau).findByRole("alert")).toHaveTextContent("This email is not valid.");
    fireEvent.change(champ, { target: { value: " ana@ruul.zz " } });
    fireEvent.click(within(bandeau).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.enregistrerMonEmailRuul).toHaveBeenLastCalledWith("ana@ruul.zz"));
    expect(await screen.findByRole("status")).toHaveTextContent("Saved");
    await waitFor(() => expect(screen.queryByTestId("bandeau-email-ruul")).toBeNull(), { timeout: DELAI_MERCI_MS + 1500 });
  });

  it("rien si l'email est déjà là, si le posteur n'est pas Ruul, ou pour l'admin", async () => {
    api.lireMonEmailRuul.mockResolvedValue({ ruul: true, email: "ana@ruul.zz" });
    const { unmount } = rendu(<BandeauEmailRuul />);
    await waitFor(() => expect(api.lireMonEmailRuul).toHaveBeenCalled());
    expect(screen.queryByTestId("bandeau-email-ruul")).toBeNull();
    unmount();

    api.lireMonEmailRuul.mockResolvedValue({ ruul: false, email: null });
    const r2 = rendu(<BandeauEmailRuul />);
    await waitFor(() => expect(api.lireMonEmailRuul).toHaveBeenCalledTimes(2));
    expect(screen.queryByTestId("bandeau-email-ruul")).toBeNull();
    r2.unmount();

    auth.roleReel = "admin";
    api.lireMonEmailRuul.mockClear();
    rendu(<BandeauEmailRuul />);
    expect(screen.queryByTestId("bandeau-email-ruul")).toBeNull();
    expect(api.lireMonEmailRuul).not.toHaveBeenCalled();
  });
});

describe("Page Ruul (suivi admin)", () => {
  const ligne = (o: Record<string, unknown>) => ({
    poster_id: "p1", nom: "Ana Test", pays: "IT", zone: "EU", tarif: 14, actif: true,
    signe_at: "2026-11-01T10:00:00Z", compte_os_at: "2026-11-02T10:00:00Z", premiere_connexion_at: "2026-11-02T12:00:00Z",
    ruul_email: "ana@ruul.zz", ruul_ajoute_at: null, premier_post_at: null, derniere_paie_semaine: null, derniere_paie_at: null,
    bloque: false, bloque_etape: null, bloque_depuis: null, ...o,
  });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-10T12:00:00Z"));
    api.lireSuiviRuul.mockResolvedValue([
      ligne({ bloque: true, bloque_etape: "Ajouté dans Ruul", bloque_depuis: "2026-11-06T10:00:00Z" }),
      ligne({ poster_id: "p2", nom: "Bo Test", ruul_email: "bo@ruul.zz" }),
      ligne({ poster_id: "p3", nom: "Cy Test", ruul_email: null }),
      ligne({ poster_id: "p4", nom: "Di Test", ruul_ajoute_at: "2026-11-03T09:00:00Z", premier_post_at: "2026-11-09T08:00:00Z", derniere_paie_semaine: "2026-11-02", derniere_paie_at: "2026-11-09T15:00:00Z" }),
      ligne({ poster_id: "p5", nom: "Ed Inactif", actif: false }),
    ]);
    api.marquerAjoutesRuul.mockResolvedValue(2);
  });
  afterEach(() => vi.useRealTimers());

  it("dates d/m, l'étape bloquée en rouge, les filtres", async () => {
    rendu(<PageSuiviRuul />);
    const ana = await screen.findByTestId("suivi-ruul-p1");
    expect(ana).toHaveTextContent("1/11");
    expect(ana).toHaveTextContent("IT · EU · 14 $");
    expect(ana).toHaveTextContent("bloqué : Ajouté dans Ruul depuis 4 j");
    expect(within(ana).getByText(/bloqué :/).closest("td")).toHaveClass("text-destructive");
    expect(screen.getByTestId("suivi-ruul-p4")).toHaveTextContent("9/11 (sem. du 2/11)");
    // Actifs seulement (par défaut) : l'inactif est caché.
    expect(screen.queryByTestId("suivi-ruul-p5")).toBeNull();
    fireEvent.click(screen.getByLabelText("Actifs seulement"));
    expect(screen.getByTestId("suivi-ruul-p5")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Bloqué > 2 jours"));
    expect(screen.getByTestId("suivi-ruul-p1")).toBeTruthy();
    expect(screen.queryByTestId("suivi-ruul-p2")).toBeNull();
    expect(screen.queryByTestId("suivi-ruul-p5")).toBeNull();
  });

  it("cocher, tout cocher et marquer ajouté dans Ruul", async () => {
    rendu(<PageSuiviRuul />);
    await screen.findByTestId("suivi-ruul-p1");
    // Seuls ceux qui ont un email Ruul et ne sont pas encore ajoutés se cochent.
    expect(screen.queryByLabelText("Cocher Cy Test")).toBeNull();
    expect(screen.queryByLabelText("Cocher Di Test")).toBeNull();
    expect(screen.getByRole("button", { name: "Marquer ajouté dans Ruul (0)" })).toBeDisabled();
    fireEvent.click(screen.getByLabelText("Tout cocher"));
    fireEvent.click(screen.getByRole("button", { name: "Marquer ajouté dans Ruul (2)" }));
    await waitFor(() => expect(api.marquerAjoutesRuul).toHaveBeenCalledWith(["p1", "p2"]));
    await waitFor(() => expect(api.lireSuiviRuul).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("status")).toHaveTextContent("2 posteur(s) marqué(s)");

    fireEvent.click(within(screen.getByTestId("suivi-ruul-p2")).getByRole("button", { name: "Marquer ajouté" }));
    await waitFor(() => expect(api.marquerAjoutesRuul).toHaveBeenLastCalledWith(["p2"]));
  });

  it("sans libellé reconnu, la première étape pas faite est en rouge", () => {
    expect(colonneBloquee(ligne({ bloque: true, bloque_etape: "???", ruul_email: null }) as never)).toBe("email");
    expect(colonneBloquee(ligne({ bloque: true, bloque_etape: "1er post" }) as never)).toBe("post");
  });
});
