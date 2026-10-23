import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@/locales";
import i18n from "@/locales";

// jsdom n'a pas PointerEvent ; l'interrupteur (base-ui) en construit un au clic.
if (typeof window.PointerEvent === "undefined") {
  (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = MouseEvent;
}

const majSeuil = vi.fn();
const majVerrou = vi.fn();
const choisir = vi.fn();
const majCanal = vi.fn();
const verifier = vi.fn();
const activer = vi.fn();

const REGIONS = [
  {
    langue: "de",
    region: "German-speaking countries",
    comment_master_id: "p-martin",
    comment_master: "Martin Befeld",
    slack_channel_id: "C0DE",
    slack_verifie_canal: "C0DE",
    slack_verifie_at: "2026-10-14T10:00:00Z",
    slack_canal_nom: "comments-de",
    slack_erreur: null,
    slack_erreur_at: null,
    fenetre_heures: 12,
    actif: true,
  },
  {
    langue: "tr",
    region: "Turkey",
    comment_master_id: null,
    comment_master: null,
    slack_channel_id: "C0TR",
    slack_verifie_canal: null,
    slack_verifie_at: null,
    slack_canal_nom: null,
    slack_erreur: "not_in_channel",
    slack_erreur_at: "2026-10-20T09:00:00Z",
    fenetre_heures: 12,
    actif: false,
  },
];

const PAYS = [
  { langue: "de", pays: "DE", seuil_vues: 8000, verrou: false, seuil_source: "initial", seuil_maj_at: null, seuil_detail: null },
  { langue: "de", pays: "AT", seuil_vues: 5000, verrou: true, seuil_source: "provisoire", seuil_maj_at: null, seuil_detail: null },
  { langue: "tr", pays: "TR", seuil_vues: 11000, verrou: false, seuil_source: "initial", seuil_maj_at: null, seuil_detail: null },
];

vi.mock("@/features/commentMasters/api", () => ({
  lireConfigCommentMasters: () =>
    Promise.resolve({
      regions: REGIONS,
      pays: PAYS,
      mandats: [
        { id: "m2", langue: "de", profile_id: "p-martin", nom: "Martin Befeld", debut: "2026-10-14T10:00:00Z", fin: null },
      ],
    }),
  listerCandidatsCommentMasters: () =>
    Promise.resolve([
      { langue: "de", profile_id: "p-martin", prenom: "Martin", nom: "Befeld", compte_id: "c-martin" },
      { langue: "de", profile_id: "p-lena", prenom: "Lena", nom: "Koch", compte_id: "c-lena" },
      { langue: "tr", profile_id: "p-ayse", prenom: "Ayşe", nom: "Kaya", compte_id: "c-ayse" },
    ]),
  lireStatsCommentMasters: () =>
    Promise.resolve({
      debut: "2026-09-30T22:00:00Z",
      fin: "2026-10-31T23:00:00Z",
      faits: [{ langue: "de", profile_id: "p-martin", nom: "Martin Befeld", faits: 23 }],
      regions: [{ langue: "de", envoyes: 26, faits: 23, retrouves: 20, likes: 31 }],
      releves_7j: { lots: 40, echecs: 1, releves: 1000 },
      commentaires_7j: 100,
      pays_7j: [{ langue: "de", pays: "DE", suivis: 300, conclus: 240, declenches: 12, abandonnes: 150 }],
    }),
  lireDernierRecalibrage: () => Promise.resolve(null),
  majSeuilPays: (...a: unknown[]) => majSeuil(...a),
  majVerrouPays: (...a: unknown[]) => majVerrou(...a),
  choisirCommentMaster: (...a: unknown[]) => choisir(...a),
  majCanalSlack: (...a: unknown[]) => majCanal(...a),
  verifierCanalSlack: (...a: unknown[]) => verifier(...a),
  activerRegionCommentMaster: (...a: unknown[]) => activer(...a),
}));

import { AdminCommentMastersPage } from "./AdminCommentMastersPage";

function rendre() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AdminCommentMastersPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AdminCommentMastersPage", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    majSeuil.mockResolvedValue(undefined);
    majVerrou.mockResolvedValue(undefined);
    choisir.mockResolvedValue(undefined);
    majCanal.mockResolvedValue(undefined);
    verifier.mockResolvedValue({ ok: false, code: "not_in_channel", bot: "comment_masters_bot" });
    activer.mockResolvedValue({ ok: true, actif: true });
    await i18n.changeLanguage("fr");
  });

  it("une carte par région, l'active en premier, avec son comment master et le lien vers sa fiche", async () => {
    rendre();
    const de = await screen.findByTestId("region-de");
    const cartes = screen.getAllByTestId(/^region-/);
    expect(cartes[0]).toBe(de);
    expect(within(de).getByText("Active")).toBeInTheDocument();
    expect(within(de).getByRole("link", { name: /Voir sa fiche/ })).toHaveAttribute("href", "/admin/createurs/c-martin");
    expect(within(de).getByText(/#comments-de : le bot est membre/)).toBeInTheDocument();
    expect(within(de).getByText("12 h après la publication (fixe)")).toBeInTheDocument();
  });

  it("relevés et coût de la semaine", async () => {
    rendre();
    const tuiles = await screen.findByTestId("tuiles-comment-masters");
    await waitFor(() => expect(within(tuiles).getByText("1,000")).toBeInTheDocument());
    // 1 000 × 0,0023 + 100 × 0,00075
    expect(within(tuiles).getByText("2.38 $")).toBeInTheDocument();
    expect(within(tuiles).getByText("1 / 2")).toBeInTheDocument();
  });

  it("commentaires du mois par personne, avec le bonus", async () => {
    rendre();
    const mois = await screen.findByTestId("mois-de");
    await waitFor(() => expect(within(mois).getByText("23 commentaires")).toBeInTheDocument());
    expect(within(mois).getByText("Martin Befeld")).toBeInTheDocument();
    expect(within(mois).getByText("bonus 10 $ · encore 17 pour le suivant")).toBeInTheDocument();
  });

  it("taux de déclenchement du pays sur 7 jours", async () => {
    rendre();
    const de = await screen.findByTestId("pays-de-DE");
    await waitFor(() => expect(within(de).getByText("7 j : 12/240 · 5 %")).toBeInTheDocument());
  });

  it("modifier un seuil l'enregistre, un seuil sous 3 000 est refusé", async () => {
    rendre();
    const ligne = await screen.findByTestId("pays-de-DE");
    const champ = within(ligne).getByRole("textbox", { name: "Seuil de vues DE" });

    fireEvent.change(champ, { target: { value: "2500" } });
    fireEvent.blur(champ);
    expect(await within(ligne).findByText(/au moins 3/)).toBeInTheDocument();
    expect(majSeuil).not.toHaveBeenCalled();

    fireEvent.change(champ, { target: { value: "9 500" } });
    fireEvent.keyDown(champ, { key: "Enter" });
    await waitFor(() => expect(majSeuil).toHaveBeenCalledWith("de", "DE", 9500));
  });

  it("le cadenas bascule", async () => {
    rendre();
    const at = await screen.findByTestId("pays-de-AT");
    fireEvent.click(within(at).getByRole("button", { name: "Déverrouiller le seuil" }));
    await waitFor(() => expect(majVerrou).toHaveBeenCalledWith("de", "AT", false));
    expect(within(at).getByText("provisoire")).toBeInTheDocument();
  });

  it("une région sans comment master ne s'allume pas, et l'erreur Slack s'affiche dans la page", async () => {
    rendre();
    const tr = await screen.findByTestId("region-tr");
    expect(within(tr).getByText("À configurer")).toBeInTheDocument();
    expect(within(tr).getByText(/Manque : un comment master, la vérification du canal/)).toBeInTheDocument();
    expect(within(tr).getByRole("switch")).toHaveAttribute("aria-disabled", "true");
    expect(within(tr).getByText(/Le bot n'est pas membre du canal \(not_in_channel\)/)).toBeInTheDocument();
    expect(within(tr).getByText(/Invite le bot des comment masters/)).toBeInTheDocument();
  });

  it("vérifier le canal donne le nom du bot à inviter", async () => {
    rendre();
    const tr = await screen.findByTestId("region-tr");
    fireEvent.click(within(tr).getByRole("button", { name: "Vérifier" }));
    await waitFor(() => expect(verifier).toHaveBeenCalledWith("tr"));
    expect(await within(tr).findByText(/\/invite @comment_masters_bot/)).toBeInTheDocument();
  });

  it("choisir un comment master parmi les posters actifs de la langue", async () => {
    rendre();
    const tr = await screen.findByTestId("region-tr");
    const select = within(tr).getByRole("combobox", { name: "Comment master" });
    await waitFor(() => expect(within(select).getByRole("option", { name: "Ayşe Kaya" })).toBeInTheDocument());
    expect(within(select).queryByRole("option", { name: "Lena Koch" })).toBeNull();
    fireEvent.change(select, { target: { value: "p-ayse" } });
    await waitFor(() => expect(choisir).toHaveBeenCalledWith("tr", "p-ayse"));
  });

  it("éteindre une région passe par la fonction", async () => {
    rendre();
    const de = await screen.findByTestId("region-de");
    fireEvent.click(within(de).getByRole("switch"));
    await waitFor(() => expect(activer).toHaveBeenCalledWith("de", false));
  });
});
