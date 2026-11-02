/**
 * Prompt 21, partie R8 : la page « Disputes ».
 * - « I wasn't paid » alors que la ligne est payée → verdict « OS right » avec la preuve Upwork ;
 * - même message, ligne pas payée → « Pay what's due » paie une seule fois ;
 * - contestation sur un Kill → Kill suspendu ; « Cancel the Kill » tant que le
 *   contrat n'est pas terminé, sinon « reopen it by hand on Upwork ».
 * (La suspension elle-même — pas d'arrêt ni de fin de contrat tant que la
 * contestation est ouverte — est testée dans _shared/contestations_test.ts et
 * en base, migration 0428.)
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";

import type { Contestation, Dossier } from "./api";
import { filtrerOnglet, ligneDue, proposerVerdict } from "./logique";

const api = vi.hoisted(() => ({
  lireContestations: vi.fn(),
  lireDossier: vi.fn(),
  agirContestation: vi.fn(async () => "ok"),
  repondreContestation: vi.fn(async () => ({ canal: "slack" })),
  lireTextesContestation: vi.fn(async () => ({ accuse: "Thanks", os_tort: "Hi {prenom}, you were right. {raison}", os_raison: "Hi {prenom}, we checked: {raison}" })),
  enregistrerTexteContestation: vi.fn(async () => undefined),
}));
vi.mock("./api", async (orig) => ({ ...(await orig<typeof import("./api")>()), ...api }));

const paie = vi.hoisted(() => ({
  apercuPaiement: vi.fn(),
  payer: vi.fn(),
  libererPaiementApi: vi.fn(),
}));
vi.mock("@/features/paie/api-upwork/api", async (orig) => ({ ...(await orig<typeof import("@/features/paie/api-upwork/api")>()), ...paie }));
vi.mock("@/pages/admin/AdminRetoursContestesPage", () => ({ AdminRetoursContestesPage: () => <p>retours</p> }));

import { PageDisputes } from "./PageDisputes";

function contestation(o: Partial<Contestation>): Contestation {
  return {
    id: "c1", genre: "contestation", poster_id: "p1", nom: "Ana", hm: "Lucia", cohorte: "2026-10-19", type: "paie", source: "message",
    canal: "slack", texte: "I wasn't paid", recu_at: new Date().toISOString(), semaine: "2026-10-19", statut: "ouverte",
    accuse_statut: "envoye", verdict: null, ferme_raison: null, ferme_at: null, reponse_statut: null, slack_user_id: "U1",
    upwork_contrat: "k1", ...o,
  };
}

function dossier(o: Partial<Dossier>): Dossier {
  return {
    contestation: { id: "c1", type: "paie", recu_at: "2026-10-27T10:00:00Z", texte: "I wasn't paid", journal: [] },
    semaine: "2026-10-19", prenom: "Ana", actif: true, contrat_id: "k1", contrat_termine: false,
    posts: [], paie: [], paiements: [], messages: [], recus: [], arret: null, kill: null, ...o,
  };
}

const ligne = (o: Partial<Dossier["paie"][number]> = {}): Dossier["paie"][number] => ({
  id: "l1", semaine: "2026-10-19", montant: 70, action: "payer", statut: "ok", raison: null, paye_at: null, exclu: false,
  faits: 14, prevus: 14, manques: 0, nb_comptes: 1, tarif: 5, suivante_faite_at: null, ...o,
});

function afficher(onglet = "ouvertes") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/admin/auto/disputes?onglet=${onglet}`]}>
        <PageDisputes />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(async () => {
  await i18n.changeLanguage("en");
  vi.clearAllMocks();
  vi.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(() => vi.restoreAllMocks());

describe("Disputes : le verdict proposé", () => {
  it("« I wasn't paid » alors que la ligne est payée → « OS right » avec la preuve Upwork", () => {
    const d = dossier({
      paie: [ligne({ paye_at: "2026-10-26T06:10:00Z" })],
      paiements: [{ semaine: "2026-10-19", statut: "paye", jalon_approuve: "M-123", montant_approuve: 70, jalon_finance: "M-124", montant_finance: 70, erreur: null, maj_at: "2026-10-26T06:10:00Z" }],
    });
    const p = proposerVerdict(d);
    expect(p.verdict).toBe("os_raison");
    expect(p.raison).toContain("paid on 26 Oct");
    expect(p.preuve).toContain("M-123");
    expect(ligneDue(d)).toBeNull();
  });

  it("la ligne n'est pas payée → « OS wrong », et elle est due", () => {
    const d = dossier({ paie: [ligne()] });
    expect(proposerVerdict(d)).toMatchObject({ verdict: "os_tort" });
    expect(ligneDue(d)?.id).toBe("l1");
  });

  it("Kill du samedi sans réponse → OS right ; une réponse avant le Kill → OS wrong", () => {
    const base = { contestation: { id: "c1", type: "kill" as const, recu_at: "2026-10-28T10:00:00Z", texte: "why", journal: [] } };
    const kill = { id: "k", etape: "tiktok", statut: "parti", raison: null, message_at: "2026-10-24T08:00:00Z", prevu_at: "2026-10-26T08:00:00Z", annule_at: null };
    expect(proposerVerdict(dossier({ ...base, kill })).verdict).toBe("os_raison");
    const recus = [{ at: "2026-10-25T08:00:00Z", canal: "slack", texte: "done!", cas: "accuse", reponse: null, reponse_statut: null }];
    expect(proposerVerdict(dossier({ ...base, kill, recus })).verdict).toBe("os_tort");
  });

  it("les onglets", () => {
    const l = [contestation({}), contestation({ id: "c2", type: "kill" }), contestation({ id: "c3", statut: "fermee" }), contestation({ id: "r1", genre: "retour", type: "feedback" })];
    expect(filtrerOnglet(l, "ouvertes").map((c) => c.id)).toEqual(["c1", "c2"]);
    expect(filtrerOnglet(l, "paie").map((c) => c.id)).toEqual(["c1"]);
    expect(filtrerOnglet(l, "kill").map((c) => c.id)).toEqual(["c2"]);
    expect(filtrerOnglet(l, "fermees").map((c) => c.id)).toEqual(["c3"]);
    expect(filtrerOnglet(l, "feedback").map((c) => c.id)).toEqual(["r1"]);
  });
});

describe("Disputes : la page", () => {
  it("ligne pas payée → « Pay what's due » paie une seule fois, et la contestation le note", async () => {
    api.lireContestations.mockResolvedValue([contestation({})]);
    api.lireDossier.mockResolvedValue(dossier({ paie: [ligne()] }));
    paie.apercuPaiement.mockResolvedValue({
      mode: "on", plafond_ligne: 30, plafond_jour: 5000, total: 70,
      lignes: [{ id: "l1", poster_id: "p1", poster_nom: "Ana", action: "payer", contrat_id: "k1", statut: "pret", raison: null,
        approuver: { jalon_id: "M-1", nom: "Week 43", montant: 70, depot: 70, sous_paiement: null }, financer: null, lien: null, total: 70, montant_trouve: null, bloque: null }],
    });
    paie.payer.mockResolvedValue([{ id: "l1", statut: "pret", resultat: "paye" }]);
    afficher();
    fireEvent.click(await screen.findByRole("button", { name: "Check" }));
    expect((await screen.findByTestId("dossier")).querySelector("[data-verdict]")?.getAttribute("data-verdict")).toBe("os_tort");
    fireEvent.click(screen.getByRole("button", { name: "Pay what's due" }));
    const confirmer = await screen.findByRole("button", { name: /Confirm/ });
    fireEvent.click(confirmer);
    await waitFor(() => expect(paie.payer).toHaveBeenCalledTimes(1));
    expect(paie.payer).toHaveBeenCalledWith("2026-10-19", ["l1"]);
    await waitFor(() => expect(api.agirContestation).toHaveBeenCalledWith("c1", "noter", expect.objectContaining({ quoi: "payer" })));
    // Une fois payée, plus rien à payer : le bouton de confirmation ne repart pas.
    expect(paie.payer).toHaveBeenCalledTimes(1);
  });

  it("ligne déjà payée → pas de paiement possible, preuve affichée", async () => {
    api.lireContestations.mockResolvedValue([contestation({})]);
    api.lireDossier.mockResolvedValue(dossier({
      paie: [ligne({ paye_at: "2026-10-26T06:10:00Z" })],
      paiements: [{ semaine: "2026-10-19", statut: "paye", jalon_approuve: "M-123", montant_approuve: 70, jalon_finance: null, montant_finance: null, erreur: null, maj_at: "2026-10-26T06:10:00Z" }],
    }));
    afficher();
    fireEvent.click(await screen.findByRole("button", { name: "Check" }));
    expect((await screen.findByTestId("preuve")).textContent).toContain("M-123");
    expect((screen.getByRole("button", { name: "Pay what's due" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("contestation sur un Kill → Kill suspendu, « Cancel the Kill » ; contrat terminé → à rouvrir à la main", async () => {
    api.lireContestations.mockResolvedValue([contestation({ type: "kill", texte: "Why was I killed?" })]);
    const kill = { id: "k", etape: "tiktok", statut: "en_attente", raison: null, message_at: "2026-10-24T08:00:00Z", prevu_at: "2026-10-30T08:00:00Z", annule_at: null };
    api.lireDossier.mockResolvedValue(dossier({ contestation: { id: "c1", type: "kill", recu_at: "2026-10-28T10:00:00Z", texte: "why", journal: [] }, kill }));
    const { unmount } = afficher();
    const carte = await screen.findByText("Kill suspended");
    expect(carte).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancel the Kill" }));
    await waitFor(() => expect(api.agirContestation).toHaveBeenCalledWith("c1", "annuler_kill", undefined));
    unmount();

    api.lireDossier.mockResolvedValue(dossier({ contestation: { id: "c1", type: "kill", recu_at: "2026-10-28T10:00:00Z", texte: "why", journal: [] }, kill, contrat_termine: true }));
    afficher();
    fireEvent.click(await screen.findByRole("button", { name: "Check" }));
    expect((await screen.findByTestId("contrat-termine")).textContent).toContain("reopen it by hand on Upwork");
    expect(screen.queryByRole("button", { name: "Cancel the Kill" })).toBeNull();
  });

  it("« Reply » : le modèle du verdict, rempli et modifiable ; « Close » demande une raison", async () => {
    api.lireContestations.mockResolvedValue([contestation({})]);
    api.lireDossier.mockResolvedValue(dossier({ paie: [ligne({ paye_at: "2026-10-26T06:10:00Z" })] }));
    afficher();
    fireEvent.click(await screen.findByRole("button", { name: "Check" }));
    const dossierEl = await screen.findByTestId("dossier");
    const zone = (await within(dossierEl).findByDisplayValue(/Hi Ana, we checked: That week was paid/)) as HTMLTextAreaElement;
    fireEvent.change(zone, { target: { value: "Hi Ana, paid on Monday." } });
    fireEvent.click(within(dossierEl).getByRole("button", { name: "Reply" }));
    await waitFor(() => expect(api.repondreContestation).toHaveBeenCalledWith("c1", "Hi Ana, paid on Monday."));
    const fermer = within(dossierEl).getByRole("button", { name: "Close" }) as HTMLButtonElement;
    expect(fermer.disabled).toBe(true);
    fireEvent.change(within(dossierEl).getByLabelText("Reason for closing"), { target: { value: "paid" } });
    fireEvent.click(fermer);
    await waitFor(() => expect(api.agirContestation).toHaveBeenCalledWith("c1", "fermer", { raison: "paid", verdict: "os_raison" }));
  });
});

describe("31/10 : Posts & links et Feedback sortis de Disputes", () => {
  it("Disputes n'a plus ces onglets ; Open et Closed sans posts ni liens", async () => {
    const { ONGLETS_DISPUTES, ONGLETS_POSTS, filtrerOnglet: f } = await import("./logique");
    expect(ONGLETS_DISPUTES).toEqual(["ouvertes", "paie", "kill", "fermees"]);
    expect(ONGLETS_POSTS).toEqual(["posts", "posts_fermees"]);
    const l = [
      contestation({ id: "a", type: "posts" }),
      contestation({ id: "b", type: "lien", statut: "fermee" }),
      contestation({ id: "c", type: "paie" }),
      contestation({ id: "d", type: "kill", statut: "fermee" }),
    ];
    expect(f(l, "ouvertes").map((c) => c.id)).toEqual(["c"]);
    expect(f(l, "fermees").map((c) => c.id)).toEqual(["d"]);
    expect(f(l, "posts").map((c) => c.id)).toEqual(["a"]);
    expect(f(l, "posts_fermees").map((c) => c.id)).toEqual(["b"]);
  });
});
