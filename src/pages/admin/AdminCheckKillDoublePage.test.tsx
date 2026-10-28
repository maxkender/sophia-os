import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { PropositionCkd } from "@/features/ckd/api";

const api = vi.hoisted(() => ({
  listerControles: vi.fn(),
  listerPropositions: vi.fn(),
  listerPersonnes: vi.fn(),
  listerLabels: vi.fn(),
  lancerControle: vi.fn(),
  listerReglages: vi.fn(),
  reglerCkd: vi.fn(),
  listerJournal: vi.fn(),
  lirePartBonsPosts: vi.fn(),
  listerHms: vi.fn(),
  enregistrerSlackHm: vi.fn(),
  listerManques: vi.fn(),
  deciderCkd: vi.fn(),
  apercuNudgeCkd: vi.fn(),
  apercuHmCkd: vi.fn(),
  annulerCkd: vi.fn(),
  envoyerNudgesCkd: vi.fn(),
  envoyerAuxHm: vi.fn(),
  verifierSlackCkd: vi.fn(),
  listerArrets: vi.fn(),
  listerHandles: vi.fn(),
  lireTextesNudges: vi.fn(),
  enregistrerTextesNudges: vi.fn(),
  lireCanalSlack: vi.fn(),
  enregistrerCanalSlack: vi.fn(),
  listerHistorique: vi.fn(),
  MOTIFS_NUDGE: ["reveil", "surveiller", "discipline", "absent"],
}));
vi.mock("@/features/ckd/api", () => api);

const cohorteApi = vi.hoisted(() => ({
  lireCohorte: vi.fn(),
  releverWarmup: vi.fn(),
}));
vi.mock("@/features/ckd/cohorte/api", () => cohorteApi);
const decisionsApi = vi.hoisted(() => ({
  lireADecider: vi.fn(async () => []),
  lireSemaine: vi.fn(async () => ({
    mercredi: { envoyes: 0 },
    jeudi: { calcule: false, propositions: 0, a_decider: 0 },
    samedi: { calcule: false, propositions: 0, a_decider: 0 },
    dimanche: { prevus: 0, faits: 0 },
    lundi: { lignes: 0, payees: 0 },
  })),
}));
vi.mock("@/features/ckd/decisions/api", () => decisionsApi);

import { AdminCheckKillDoublePage } from "./AdminCheckKillDoublePage";

const LUCIA = "7036791d-e2dd-4637-913c-247afc65d1b3";
const LABEL = "11111111-0000-4000-8000-00000000000a";

function proposition(p: Partial<PropositionCkd>): PropositionCkd {
  return {
    id: "p1",
    controle_id: "ctrl-samedi",
    type: "samedi",
    jour: "2026-10-24",
    regle: "anciens",
    action: "recreer",
    compte_id: "compte-clara",
    poster_id: "poster-clara",
    hm_id: LUCIA,
    pays: "FR",
    langue: "fr",
    label_id: LABEL,
    application: "sophia",
    decision: null,
    decision_par: null,
    decision_at: null,
    note: null,
    nouveau_compte_id: null,
    envoye_at: null,
    fait_at: null,
    erreur: null,
    donnees: {
      handle: "clara.eclaire390",
      abonnes: 412,
      j0: "2026-09-17",
      motifs: [],
      periode: {
        du: "2026-09-26",
        au: "2026-10-23",
        attendus: 56,
        publies: 55,
        mesures: 55,
        morts: 0,
        bons: 0,
        mediane: 609,
        moyenne: 702,
        bas: { vues: 210, url: "https://www.tiktok.com/@clara/photo/1", jour: "2026-10-02" },
        haut: { vues: 3881, url: "https://www.tiktok.com/@clara/photo/2", jour: "2026-10-11" },
        liens_manquants: [{ jour: "2026-10-14" }],
        posts: [],
      },
      mediane_ref: { valeur: 1360, source: "pays", n_comptes: 22 },
      seuil_bon_post: { valeur: 10000, source: "comment_masters" },
      reglages: { part_mediane_pays: { v: 0.6, s: "defaut" } },
      recreations: 0,
      autres_comptes: [],
    },
    ...p,
  };
}

/** Une case des chiffres clés du contrôle, par son intitulé. */
function chiffre(intitule: string): HTMLElement {
  return within(screen.getByTestId("chiffres-ckd")).getByText(intitule).closest("div") as HTMLElement;
}

/** Le suivi global (la vue par défaut depuis la page Cohortes, prompt 17). */
function rendre(entree = "/?vue=global") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entree]}>
        <TooltipProvider>
          <AdminCheckKillDoublePage />
        </TooltipProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AdminCheckKillDoublePage", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage("fr");
    api.listerControles.mockResolvedValue([
      { id: "ctrl-samedi", type: "samedi", jour: "2026-10-24", lance_at: "2026-10-24T04:00:00Z", nb_propositions: 2,
        slack_ts: null, slack_erreur: null, rappel_at: null },
      { id: "ctrl-jeudi", type: "jeudi", jour: "2026-10-22", lance_at: "2026-10-22T04:00:00Z", nb_propositions: 1,
        slack_ts: null, slack_erreur: null, rappel_at: null },
    ]);
    api.listerPropositions.mockImplementation(async (id: string) =>
      id === "ctrl-samedi"
        ? [
            proposition({}),
            proposition({
              id: "p2",
              regle: "doubler",
              action: "doubler",
              compte_id: "compte-katerina",
              poster_id: "poster-katerina",
              hm_id: null,
              donnees: { ...proposition({}).donnees, handle: "katerina.exelissetai333" },
            }),
            proposition({
              id: "p4",
              regle: "absent",
              action: "ne_pas_renouveler",
              compte_id: "compte-ionut",
              poster_id: "poster-ionut",
              donnees: { ...proposition({}).donnees, handle: "ionut.mentalitate346" },
            }),
          ]
        : [
            proposition({
              id: "p3",
              controle_id: "ctrl-jeudi",
              type: "jeudi",
              jour: "2026-10-22",
              regle: "jeudi",
              action: "nudge",
              donnees: { ...proposition({}).donnees, handle: "alice.utvecklas492", motifs: ["surveiller", "discipline"] },
            }),
          ],
    );
    api.listerPersonnes.mockResolvedValue([
      { id: LUCIA, prenom: "Lucia", nom: "D", zone_recrutement: "Italy + Croatia + Slovenia" },
      { id: "poster-clara", prenom: "Clara", nom: "Martin", zone_recrutement: null },
    ]);
    api.listerLabels.mockResolvedValue([{ id: LABEL, nom: "smart_girl", slug: "smart-girl" }]);
    api.lancerControle.mockResolvedValue(3);
    api.listerReglages.mockResolvedValue([
      { id: "r1", cle: "part_mediane_pays", pays: null, label_id: null, valeur: 0.6, maj_at: "" },
      { id: "r2", cle: "doublement_autorise", pays: null, label_id: null, valeur: true, maj_at: "" },
      { id: "r3", cle: "doublement_autorise", pays: "PT", label_id: null, valeur: false, maj_at: "" },
      { id: "r4", cle: "seuil_bon_post", pays: null, label_id: null, valeur: null, maj_at: "" },
    ]);
    api.reglerCkd.mockResolvedValue(undefined);
    api.listerJournal.mockResolvedValue([]);
    api.lirePartBonsPosts.mockResolvedValue([
      { pays: "DE", seuil: 8000, source: "comment_masters", posts: 833, au_dessus: 54, mediane: 1360 },
      { pays: "PT", seuil: 6000, source: "comment_masters", posts: 611, au_dessus: 29, mediane: 1108 },
    ]);
    api.listerHms.mockResolvedValue([
      { profile_id: LUCIA, nom: "Lucia D", zone: "Italy + Croatia + Slovenia", posters: 34, slack_user_id: "U0BN41ZNGNS" },
      { profile_id: "sara", nom: "Sara B", zone: "France", posters: 16, slack_user_id: null },
    ]);
    api.enregistrerSlackHm.mockResolvedValue(undefined);
    api.deciderCkd.mockResolvedValue(undefined);
    api.apercuNudgeCkd.mockResolvedValue({
      titre: "Some posts are missing",
      corps: "Some posts planned for @alice.utvecklas492 were not published.",
    });
    api.apercuHmCkd.mockResolvedValue("• Some posts are missing or have no link in the OS. (2/4 published)");
    api.annulerCkd.mockResolvedValue(undefined);
    api.envoyerNudgesCkd.mockResolvedValue(1);
    api.envoyerAuxHm.mockResolvedValue({ envoyees: 1 });
    api.verifierSlackCkd.mockResolvedValue({ ok: true, bot: "sophia_os", canal: "C0BL0084Y3F", nom: "managers-hq", membre: true });
    api.listerArrets.mockResolvedValue([]);
    api.listerHandles.mockResolvedValue([]);
    api.lireTextesNudges.mockResolvedValue({ absent: { titre: "We haven't seen your posts", corps: "Post @{handle}" } });
    api.enregistrerTextesNudges.mockResolvedValue(undefined);
    api.lireCanalSlack.mockResolvedValue("C0BL0084Y3F");
    api.enregistrerCanalSlack.mockResolvedValue(undefined);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    api.listerHistorique.mockResolvedValue([
      {
        id: "h1", type: "samedi", jour: "2026-10-24", regle: "anciens", action: "recreer", decision: "garder",
        decision_par: "admin-1", decision_at: "2026-10-24T09:00:00Z", note: "laisse-lui une chance",
        compte_id: "compte-clara", poster_id: "poster-clara", hm_id: LUCIA, pays: "FR", handle: "clara.eclaire390",
        nouveau_compte_id: null, nouveau_handle: null,
        avant: { mediane: 609, publies: 55, attendus: 56, bons: 0 }, mediane_ref: 1360,
        du: "2026-10-26", au: "2026-11-08", complet: true,
        apres: { mediane: 1250, publies: 28, attendus: 28, bons: 1 }, apres_nouveau: null, arrete_at: null,
      },
      {
        id: "h2", type: "samedi", jour: "2026-10-24", regle: "doubler", action: "doubler", decision: "doubler",
        decision_par: "admin-1", decision_at: "2026-10-24T09:05:00Z", note: null,
        compte_id: "compte-katerina", poster_id: "poster-katerina", hm_id: null, pays: "GR", handle: "katerina.exelissetai333",
        nouveau_compte_id: "nouveau-1", nouveau_handle: "katerina.nea",
        avant: { mediane: 2100, publies: 10, attendus: 10, bons: 7 }, mediane_ref: 1500,
        du: "2026-10-26", au: "2026-11-08", complet: false,
        apres: { mediane: 1900, publies: 6, attendus: 6 }, apres_nouveau: { mediane: 1400, publies: 4, attendus: 4 }, arrete_at: null,
      },
      {
        id: "h3", type: "samedi", jour: "2026-10-24", regle: "absent", action: "ne_pas_renouveler", decision: "ne_pas_renouveler",
        decision_par: "admin-1", decision_at: "2026-10-24T09:10:00Z", note: null,
        compte_id: "compte-ionut", poster_id: "poster-ionut", hm_id: LUCIA, pays: "RO", handle: "ionut.mentalitate346",
        nouveau_compte_id: null, nouveau_handle: null,
        avant: { mediane: null, publies: 0, attendus: 10 }, mediane_ref: null,
        du: "2026-10-26", au: "2026-11-08", complet: false, apres: null, apres_nouveau: null, arrete_at: "2026-10-25T22:30:00Z",
      },
    ]);
    api.listerManques.mockResolvedValue([
      // Déjà proposé en Absent : pas répété dans la carte.
      { compte_id: "compte-ionut", handle: "ionut.mentalitate346", poster_id: "poster-ionut", hm_id: LUCIA,
        pays: "RO", prevus: 10, publies: 0, jours: [] },
      { compte_id: "compte-daniel", handle: "daniel.sila127", poster_id: "poster-daniel", hm_id: LUCIA,
        pays: "CZ", prevus: 10, publies: 7, jours: ["2026-10-13", "2026-10-14", "2026-10-15"] },
    ]);
  });

  it("samedi (0369) : Kill ou Garder pour un absent, et liste les autres posts manqués pour info", async () => {
    rendre();
    const ionut = await screen.findByTestId("proposition-ionut.mentalitate346");
    expect(within(ionut).getAllByText("Kill (ne pas renouveler)").length).toBeGreaterThan(0);
    expect(within(ionut).getByText(/Absent : trop de posts manqués/)).toBeInTheDocument();
    for (const nom of ["Kill", "Garder"]) {
      expect(within(ionut).getByRole("button", { name: nom })).toBeEnabled();
    }
    expect(within(ionut).queryByRole("button", { name: "Envoyer le nudge" })).toBeNull();
    const carte = await screen.findByTestId("carte-manques");
    expect(within(carte).getByTestId("manque-daniel.sila127")).toHaveTextContent("7/10");
    expect(within(carte).getByTestId("manque-daniel.sila127")).toHaveTextContent("13/10, 14/10, 15/10");
    expect(within(carte).queryByTestId("manque-ionut.mentalitate346")).toBeNull();
    expect(api.listerManques).toHaveBeenCalledWith("2026-10-24");
  });

  it("montre les propositions du samedi groupées par HM", async () => {
    rendre();
    const clara = await screen.findByTestId("proposition-clara.eclaire390");
    const groupe = screen.getByTestId(`groupe-hm-${LUCIA}`);
    expect(await within(groupe).findByText("Lucia D")).toBeInTheDocument();
    expect(within(clara).getAllByText("Recréer").length).toBeGreaterThan(0);
    expect(within(clara).getByText(/412 abonnés/)).toBeInTheDocument();
    expect(within(clara).getByText(/référence 1\D?360/)).toBeInTheDocument();
    expect(within(clara).getByText(/sans lien : 14\/10/)).toBeInTheDocument();
    expect(within(clara).getByRole("link", { name: /3\D?881/ })).toHaveAttribute(
      "href",
      "https://www.tiktok.com/@clara/photo/2",
    );
    // Le samedi ne recrée plus (0369) : Kill ou Garder.
    expect(within(clara).queryByRole("button", { name: "Recréer le compte" })).toBeNull();
    expect(within(clara).getByRole("button", { name: "Kill" })).toBeEnabled();
    // Sans HM : en dernier.
    expect(screen.getByTestId("groupe-hm-aucun")).toBeInTheDocument();
    expect(screen.getByTestId("proposition-katerina.exelissetai333")).toBeInTheDocument();
  });

  it("décide un Kill après confirmation, avec la note pour le HM", async () => {
    rendre();
    const ionut = await screen.findByTestId("proposition-ionut.mentalitate346");
    fireEvent.click(within(ionut).getByRole("button", { name: "Kill" }));
    expect(within(ionut).getByText(/poste jusqu'au dimanche et s'arrête à 23 h 30/)).toBeInTheDocument();
    expect(api.deciderCkd).not.toHaveBeenCalled();
    fireEvent.change(within(ionut).getByRole("textbox", { name: "Note" }), { target: { value: " a posté sans lien ? " } });
    fireEvent.click(within(ionut).getByRole("button", { name: "Confirmer : Kill" }));
    await waitFor(() => expect(api.deciderCkd).toHaveBeenCalledWith("p4", "ne_pas_renouveler", "a posté sans lien ?"));
  });

  it("jeudi (0368) : « Recréer » proposé est choisi d'avance, et passe par la confirmation", async () => {
    const avant = api.listerPropositions.getMockImplementation()!;
    api.listerPropositions.mockImplementation(async (id: string) =>
      id === "ctrl-jeudi"
        ? [
          proposition({
            id: "p5",
            controle_id: "ctrl-jeudi",
            type: "jeudi",
            jour: "2026-10-22",
            regle: "jeudi",
            action: "recreer",
            donnees: { ...proposition({}).donnees, handle: "bruno.reveil101", motifs: ["reveil"] },
          }),
        ]
        : avant(id),
    );
    rendre();
    fireEvent.click(await screen.findByRole("tab", { name: "Jeudi : Recréer" }));
    const bruno = await screen.findByTestId("proposition-bruno.reveil101");
    for (const nom of ["Envoyer le nudge", "Recréer le compte", "Rien"]) {
      expect(within(bruno).getByRole("button", { name: nom })).toBeEnabled();
    }
    expect(within(bruno).getByText(/Un nouveau compte est créé tout de suite/)).toBeInTheDocument();
    fireEvent.click(within(bruno).getByRole("button", { name: "Confirmer : Recréer le compte" }));
    await waitFor(() => expect(api.deciderCkd).toHaveBeenCalledWith("p5", "recreer", null));
  });

  it("montre une décision prise, son arrêt prévu, et l'annule tant que rien n'est parti", async () => {
    api.listerPropositions.mockResolvedValue([
      proposition({
        id: "p4",
        regle: "absent",
        action: "ne_pas_renouveler",
        compte_id: "compte-ionut",
        decision: "ne_pas_renouveler",
        decision_par: "admin-1",
        decision_at: "2026-10-24T08:00:00Z",
        note: "vérifier ses liens",
        donnees: { ...proposition({}).donnees, handle: "ionut.mentalitate346" },
      }),
    ]);
    api.listerPersonnes.mockResolvedValue([{ id: "admin-1", prenom: "Adrien", nom: "M", zone_recrutement: null }]);
    api.listerArrets.mockResolvedValue([
      { compte_id: "compte-ionut", raison: "ne_pas_renouveler", prevu_at: "2026-10-25T22:30:00Z", fait_at: null, annule_at: null },
    ]);
    rendre();
    const decision = await screen.findByTestId("decision-ionut.mentalitate346");
    expect(await within(decision).findByText(/par Adrien M/)).toBeInTheDocument();
    expect(await within(decision).findByText(/arrêt prévu .*23:30/)).toBeInTheDocument();
    expect(within(decision).getByText(/pas encore envoyé au HM/)).toBeInTheDocument();
    expect(within(decision).getByText("Note : vérifier ses liens")).toBeInTheDocument();
    expect(chiffre("Sans décision")).toHaveTextContent(/^Sans décision0/);
    expect(chiffre("À envoyer (dimanche 12 h)")).toHaveTextContent(/^À envoyer \(dimanche 12 h\)1/);
    fireEvent.click(within(decision).getByRole("button", { name: "Annuler la décision" }));
    await waitFor(() => expect(api.annulerCkd).toHaveBeenCalledWith("p4"));
  });

  it("prompt 15 : plus de bouton « Envoyer aux HM », les décisions prêtes partent le dimanche", async () => {
    api.listerPropositions.mockResolvedValue([
      proposition({ decision: "recreer", decision_par: "admin-1", decision_at: "2026-10-24T08:00:00Z" }),
      proposition({
        id: "p2",
        regle: "doubler",
        action: "doubler",
        decision: "doubler",
        nouveau_compte_id: "nouveau-1",
        donnees: { ...proposition({}).donnees, handle: "katerina.exelissetai333" },
      }),
    ]);
    api.listerHandles.mockResolvedValue([{ id: "nouveau-1", handle_tiktok: "katerina.nea" }]);
    rendre();
    // Recréer sans compte créé ne part pas : 1 seule décision prête.
    expect(await screen.findByText(/compte créé : @katerina.nea/)).toBeInTheDocument();
    expect(screen.getByText(/compte pas encore confirmé/)).toBeInTheDocument();
    expect(chiffre("À envoyer (dimanche 12 h)")).toHaveTextContent(/1/);
    expect(screen.queryByRole("button", { name: /Envoyer aux HM/ })).toBeNull();
    expect(api.envoyerAuxHm).not.toHaveBeenCalled();
  });

  it("le jeudi, envoie tous les nudges encore sans décision", async () => {
    rendre();
    fireEvent.click(await screen.findByRole("tab", { name: "Jeudi : Recréer" }));
    fireEvent.click(await screen.findByRole("button", { name: "Envoyer les nudges (1)" }));
    await waitFor(() => expect(api.envoyerNudgesCkd).toHaveBeenCalledWith("ctrl-jeudi"));
  });

  it("vérifie le bot Slack et enregistre les textes des nudges", async () => {
    rendre();
    fireEvent.click(await screen.findByRole("tab", { name: "Réglages" }));
    const canal = await screen.findByTestId("carte-canal-slack");
    expect(await within(canal).findByDisplayValue("C0BL0084Y3F")).toBeInTheDocument();
    fireEvent.click(within(canal).getByRole("button", { name: "Vérifier" }));
    expect(await within(canal).findByText("OK : @sophia_os est bien dans #managers-hq.")).toBeInTheDocument();

    const textes = screen.getByTestId("carte-textes-nudges");
    const titre = await within(textes).findByRole("textbox", { name: "Titre (Absent (samedi))" });
    fireEvent.change(titre, { target: { value: "Where are your posts?" } });
    fireEvent.click(within(textes).getByRole("button", { name: "Enregistrer" }));
    await waitFor(() =>
      expect(api.enregistrerTextesNudges).toHaveBeenCalledWith({
        absent: { titre: "Where are your posts?", corps: "Post @{handle}" },
      }),
    );
  });

  it("l'historique : les décisions, avant et après 2 semaines, la tendance et le résumé", async () => {
    rendre();
    fireEvent.click(await screen.findByRole("tab", { name: "Historique" }));
    const clara = await screen.findByTestId("historique-clara.eclaire390");
    expect(within(clara).getByText("Garder")).toBeInTheDocument();
    expect(within(clara).getByText(/méd\. 609 · 55\/56 publiés/)).toBeInTheDocument();
    expect(within(clara).getByText(/méd\. 1\D?250 · 28\/28 publiés · 1 bon/)).toBeInTheDocument();
    expect(within(clara).getByText("↗ en hausse")).toBeInTheDocument();
    expect(within(clara).getByText("laisse-lui une chance")).toBeInTheDocument();

    const katerina = screen.getByTestId("historique-katerina.exelissetai333");
    expect(within(katerina).getByRole("link", { name: "@katerina.nea" })).toHaveAttribute("href", "/admin/createurs/nouveau-1");
    expect(within(katerina).getByText(/en cours, jusqu'au 08\/11/)).toBeInTheDocument();
    // Pas fini : la tendance est marquée d'une étoile.
    expect(within(katerina).getByText("→ stable *")).toBeInTheDocument();

    const ionut = screen.getByTestId("historique-ionut.mentalitate346");
    expect(within(ionut).getByText(/compte arrêté le 25\/10/)).toBeInTheDocument();

    // Le résumé : une ligne par décision, combien, combien suivies, ce qu'elles sont devenues.
    const garder = within(screen.getByTestId("resume-historique")).getByText("Garder").closest("tr")!;
    const [, total, suivies] = within(garder).getAllByRole("cell");
    expect(total).toHaveTextContent("1");
    expect(suivies).toHaveTextContent("1");
    expect(garder).toHaveTextContent("1 en hausse · 0 stable(s) · 0 en baisse");
    fireEvent.change(screen.getByRole("combobox", { name: "Filtrer par décision" }), { target: { value: "doubler" } });
    expect(screen.queryByTestId("historique-clara.eclaire390")).toBeNull();
    expect(screen.getByTestId("historique-katerina.exelissetai333")).toBeInTheDocument();
  });

  it("un clic sur une ligne du résumé filtre l'historique, un second clic le vide", async () => {
    rendre();
    fireEvent.click(await screen.findByRole("tab", { name: "Historique" }));
    await screen.findByTestId("historique-clara.eclaire390");
    const resume = screen.getByTestId("resume-historique");
    fireEvent.click(within(resume).getByText("Doubler"));
    expect(screen.queryByTestId("historique-clara.eclaire390")).toBeNull();
    expect(screen.getByRole("combobox", { name: "Filtrer par décision" })).toHaveValue("doubler");
    fireEvent.click(within(resume).getByText("Doubler"));
    expect(screen.getByTestId("historique-clara.eclaire390")).toBeInTheDocument();
  });

  it("recalcule le contrôle affiché", async () => {
    rendre();
    await screen.findByTestId("proposition-clara.eclaire390");
    fireEvent.click(screen.getByRole("button", { name: /Recalculer/ }));
    await waitFor(() => expect(api.lancerControle).toHaveBeenCalledWith("samedi", "2026-10-24"));
  });

  it("le nudge d'un posteur : texte de Réglages pré-rempli, modifiable pour lui seul", async () => {
    rendre();
    fireEvent.click(await screen.findByRole("tab", { name: "Jeudi : Recréer" }));
    const alice = await screen.findByTestId("proposition-alice.utvecklas492");
    fireEvent.click(within(alice).getByRole("button", { name: "Envoyer le nudge" }));
    const titre = await within(alice).findByRole("textbox", { name: "Titre du pop-up" });
    expect(titre).toHaveValue("Some posts are missing");
    const corps = within(alice).getByRole("textbox", { name: "Texte du pop-up" });
    expect(corps).toHaveValue("Some posts planned for @alice.utvecklas492 were not published.");
    expect(api.apercuNudgeCkd).toHaveBeenCalledWith("p3");

    fireEvent.change(corps, { target: { value: "  Your first day was Sunday: post every day from now on.  " } });
    expect(within(alice).getByText("modifié pour ce posteur")).toBeInTheDocument();
    fireEvent.click(within(alice).getByRole("button", { name: "Confirmer : Envoyer le nudge" }));
    await waitFor(() =>
      expect(api.deciderCkd).toHaveBeenCalledWith("p3", "nudge", null, {
        popup: { titre: "Some posts are missing", corps: "Your first day was Sunday: post every day from now on." },
        hm: null,
        suiviHm: false,
      }),
    );
  });

  it("prompt 15 : plus de message au HM ni de suivi dans #managers-hq, la décision part sans suivi", async () => {
    rendre();
    fireEvent.click(await screen.findByRole("tab", { name: "Jeudi : Recréer" }));
    const alice = await screen.findByTestId("proposition-alice.utvecklas492");
    fireEvent.click(within(alice).getByRole("button", { name: "Envoyer le nudge" }));
    await within(alice).findByRole("textbox", { name: "Texte du pop-up" });
    expect(within(alice).queryByRole("textbox", { name: "Message au HM" })).toBeNull();
    expect(within(alice).queryByRole("checkbox", { name: "Suivi du HM dans #managers-hq" })).toBeNull();
    expect(api.apercuHmCkd).not.toHaveBeenCalled();
    fireEvent.click(within(alice).getByRole("button", { name: "Confirmer : Envoyer le nudge" }));
    await waitFor(() =>
      expect(api.deciderCkd).toHaveBeenCalledWith("p3", "nudge", null, { popup: null, hm: null, suiviHm: false }),
    );
  });

  it("nudge sans retouche : le texte de Réglages, et un texte vidé bloque la confirmation", async () => {
    rendre();
    fireEvent.click(await screen.findByRole("tab", { name: "Jeudi : Recréer" }));
    const alice = await screen.findByTestId("proposition-alice.utvecklas492");
    fireEvent.click(within(alice).getByRole("button", { name: "Envoyer le nudge" }));
    const corps = await within(alice).findByRole("textbox", { name: "Texte du pop-up" });
    const confirmer = within(alice).getByRole("button", { name: "Confirmer : Envoyer le nudge" });

    fireEvent.change(corps, { target: { value: "   " } });
    expect(confirmer).toBeDisabled();
    expect(within(alice).getByText("Le titre et le texte ne peuvent pas être vides.")).toBeInTheDocument();

    fireEvent.click(within(alice).getByRole("button", { name: "Revenir au texte par défaut" }));
    expect(corps).toHaveValue("Some posts planned for @alice.utvecklas492 were not published.");
    expect(confirmer).toBeEnabled();
    fireEvent.click(confirmer);
    await waitFor(() =>
      expect(api.deciderCkd).toHaveBeenCalledWith("p3", "nudge", null, { popup: null, hm: null, suiviHm: false }),
    );
  });

  it("un nudge décidé sans suivi du HM : jamais à envoyer aux HM", async () => {
    const avant = api.listerPropositions.getMockImplementation()!;
    api.listerPropositions.mockImplementation(async (id: string) =>
      id === "ctrl-jeudi"
        ? [
          proposition({
            id: "p3",
            controle_id: "ctrl-jeudi",
            type: "jeudi",
            jour: "2026-10-22",
            regle: "jeudi",
            action: "nudge",
            decision: "nudge",
            decision_par: "admin-1",
            decision_at: "2026-10-22T10:00:00Z",
            hm_suivi: false,
            donnees: { ...proposition({}).donnees, handle: "alice.utvecklas492", motifs: ["discipline"] },
          }),
        ]
        : avant(id),
    );
    rendre();
    fireEvent.click(await screen.findByRole("tab", { name: "Jeudi : Recréer" }));
    const alice = await screen.findByTestId("proposition-alice.utvecklas492");
    expect(await within(alice).findByText(/par /)).toBeInTheDocument();
    expect(within(alice).queryByText(/pas encore envoyé au HM/)).toBeNull();
  });

  it("montre les nudges du jeudi avec leurs motifs", async () => {
    rendre();
    fireEvent.click(await screen.findByRole("tab", { name: "Jeudi : Recréer" }));
    const alice = await screen.findByTestId("proposition-alice.utvecklas492");
    expect(within(alice).getByText("à surveiller")).toBeInTheDocument();
    expect(within(alice).getByText("discipline")).toBeInTheDocument();
    expect(api.listerPropositions).toHaveBeenCalledWith("ctrl-jeudi");
  });

  it("règle une case par pays : la part se tape en %, le doublement en oui/non", async () => {
    rendre();
    fireEvent.click(await screen.findByRole("tab", { name: "Réglages" }));
    const tableau = (await screen.findByText("Par pays")).closest("[data-slot='card']") ?? document.body;
    // Le Portugal : doublement remplacé (non), en gras ; l'Allemagne hérite (oui).
    const lignePt = within(tableau as HTMLElement).getByText(/PT$/).closest("tr")!;
    const cellules = within(lignePt).getAllByRole("button");
    const partMediane = cellules[5];
    expect(partMediane).toHaveTextContent("60 %");
    fireEvent.click(partMediane);
    const saisie = within(lignePt).getByRole("textbox");
    fireEvent.change(saisie, { target: { value: "50" } });
    fireEvent.keyDown(saisie, { key: "Enter" });
    await waitFor(() => expect(api.reglerCkd).toHaveBeenCalledWith("part_mediane_pays", "PT", null, 0.5));
  });

  it("refuse une saisie qui n'a pas de sens, sans rien enregistrer", async () => {
    rendre();
    fireEvent.click(await screen.findByRole("tab", { name: "Réglages" }));
    const tableau = (await screen.findByText("Par pays")).closest("[data-slot='card']") ?? document.body;
    const ligneDe = within(tableau as HTMLElement).getByText(/DE$/).closest("tr")!;
    fireEvent.click(within(ligneDe).getAllByRole("button")[5]);
    const saisie = within(ligneDe).getByRole("textbox");
    fireEvent.change(saisie, { target: { value: "150" } });
    fireEvent.keyDown(saisie, { key: "Enter" });
    expect(await within(ligneDe).findByText("Une part entre 0 et 100 %.")).toBeInTheDocument();
    expect(api.reglerCkd).not.toHaveBeenCalled();
  });

  it("enregistre l'ID Slack d'un HM qui n'en a pas", async () => {
    rendre();
    fireEvent.click(await screen.findByRole("tab", { name: "Réglages" }));
    const saisie = await screen.findByRole("textbox", { name: "ID Slack de Sara B" });
    fireEvent.change(saisie, { target: { value: "u0bst9hkkbq" } });
    fireEvent.click(within(saisie.closest("tr")!).getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(api.enregistrerSlackHm).toHaveBeenCalledWith("sara", "U0BST9HKKBQ"));
  });

  describe("suivi cohorte → page Cohortes (prompt 17, partie B)", () => {
    function rendreAvecRoutes(entree: string) {
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      return render(
        <QueryClientProvider client={client}>
          <MemoryRouter initialEntries={[entree]}>
            <TooltipProvider>
              <Routes>
                <Route path="/" element={<AdminCheckKillDoublePage />} />
                <Route path="/admin/cohortes" element={<p>page cohortes</p>} />
              </Routes>
            </TooltipProvider>
          </MemoryRouter>
        </QueryClientProvider>,
      );
    }

    it("les onglets 1re semaine / warm-up sont retirés : ?vue=cohorte renvoie vers Cohortes", async () => {
      rendreAvecRoutes("/?vue=cohorte");
      expect(await screen.findByText("page cohortes")).toBeInTheDocument();
      expect(cohorteApi.lireCohorte).not.toHaveBeenCalled();
    });

    it("28 oct. : la page « Décisions », 4 onglets, la semaine et « À décider maintenant » ; plus de Cohorts ni de Vue HM", async () => {
      rendreAvecRoutes("/?vue=hm");
      expect(await screen.findByRole("heading", { name: /Décisions/ })).toBeInTheDocument();
      const onglets = screen.getAllByRole("tablist")[0]!;
      expect(within(onglets).getAllByRole("tab").map((o) => o.textContent)).toEqual([
        "Décisions",
        "Shadowban",
        "Historique",
        "Réglages",
      ]);
      expect(within(onglets).getByRole("tab", { name: "Décisions" })).toHaveAttribute("aria-selected", "true");
      expect(await screen.findByTestId("semaine-decisions")).toBeInTheDocument();
      expect(screen.getByTestId("a-decider")).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Cohortes" })).toBeNull();
      expect(screen.queryByText("Vue HM")).toBeNull();
      // Plus de « Jeudi : nudges » ni de grille « To recruit ».
      expect(screen.queryByRole("tab", { name: "Jeudi : nudges" })).toBeNull();
      expect(screen.queryByTestId("carte-recrutement")).toBeNull();
    });
  });
});
