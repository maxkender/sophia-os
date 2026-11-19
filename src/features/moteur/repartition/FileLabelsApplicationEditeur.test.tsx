/**
 * Réglages → File des créateurs par application : sélecteur d'application,
 * labels proposés selon `label_applications`, case UGC pour Sophia seulement,
 * entrée hors application signalée, tranche Sophia écrite comme avant.
 */
import * as React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@/locales";

const listerApplicationsMulti = vi.fn();
const listerLiensLabels = vi.fn();
vi.mock("../apiMultiApp", () => ({
  listerApplicationsMulti: () => listerApplicationsMulti(),
  listerLiensLabels: () => listerLiensLabels(),
}));

import type { Label, ReglagesFileLabels } from "../types";
import { FileLabelsApplicationEditeur, type ChangementFileLabels } from "./FileLabelsApplicationEditeur";

const ID_SOPHIA = "00000000-0000-4000-8000-000000000001";
const ID_UNSWIPE = "00000000-0000-4000-8000-000000000003";
const APPS = [
  { id: ID_SOPHIA, slug: "sophia", nom: "Sophia", created_at: "", langues: null, actif: true },
  { id: ID_UNSWIPE, slug: "unswipe", nom: "Unswipe", created_at: "", langues: ["fr", "de"], actif: true },
];
const lab = (id: string, nom: string): Label =>
  ({ id, nom, slug: nom.toLowerCase().replace(/\s+/g, "-"), manuel: false }) as Label;
const SMART = lab("l-smart", "Smart Girl");
const CLASSIC = lab("l-classic", "Classic Study");
const LIENS = [
  { label_id: SMART.id, application_id: ID_SOPHIA },
  { label_id: CLASSIC.id, application_id: ID_UNSWIPE },
];

const PROD: ReglagesFileLabels = {
  items: [],
  par_langue: { da: [{ label_id: SMART.id, ugc: false }] },
  par_application: { sophia: { items: [], par_langue: { da: [{ label_id: SMART.id, ugc: false }] } } },
};

interface Options {
  slugsEnPreparation?: readonly string[];
  partsCible?: Record<string, number> | null;
  labels?: Label[];
}

function Harnais({
  onChange,
  initial = PROD,
  options = {},
}: {
  onChange: (f: ReglagesFileLabels, chg: ChangementFileLabels) => void;
  initial?: ReglagesFileLabels;
  options?: Options;
}) {
  const [file, setFile] = React.useState(initial);
  return (
    <FileLabelsApplicationEditeur
      file={file}
      onChange={(f, chg) => {
        setFile(f);
        onChange(f, chg);
      }}
      enCours={false}
      labels={options.labels ?? [SMART, CLASSIC]}
      labelsUgc={[SMART.id]}
      slugsEnPreparation={options.slugsEnPreparation}
      partsCible={options.partsCible}
    />
  );
}

function rendre(onChange = vi.fn(), initial?: ReglagesFileLabels, options?: Options) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <Harnais onChange={onChange} initial={initial} options={options} />
    </QueryClientProvider>,
  );
  return onChange;
}

const selectAjout = () => screen.getByLabelText(/^(Ajouter un label|Add a label)$/) as HTMLSelectElement;
const toutesOptionsAjout = () =>
  within(selectAjout()).getAllByRole("option").map((o) => (o as HTMLOptionElement).value);
/** Les labels de l'application ÉDITÉE (ceux des autres applications ont une valeur « autre:… »). */
const optionsAjout = () => toutesOptionsAjout().filter((v) => !v.startsWith("autre:"));
/** Les labels des AUTRES applications, proposés dans la même liste. */
const optionsAutres = () => toutesOptionsAjout().filter((v) => v.startsWith("autre:"));

describe("FileLabelsApplicationEditeur", () => {
  beforeEach(() => {
    listerApplicationsMulti.mockReset();
    listerApplicationsMulti.mockResolvedValue(APPS);
    listerLiensLabels.mockReset();
    listerLiensLabels.mockResolvedValue(LIENS);
  });

  it("Sophia par défaut : labels qui servent Sophia, case UGC, écriture comme avant", async () => {
    const onChange = rendre();
    const selApp = await screen.findByLabelText(/^(Application|App)$/);
    expect(selApp).toHaveValue("sophia");
    await waitFor(() => expect(optionsAjout()).toEqual(["", SMART.id]));
    expect(screen.getByLabelText(/Compte UGC|UGC account/)).toBeInTheDocument();

    fireEvent.change(selectAjout(), { target: { value: SMART.id } });
    fireEvent.click(screen.getByLabelText(/Compte UGC|UGC account/));
    fireEvent.click(screen.getByRole("button", { name: /^(Ajouter|Add)$/ }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]![0]).toStrictEqual({
      items: [{ label_id: SMART.id, ugc: true }],
      par_langue: PROD.par_langue,
      par_application: {
        sophia: { items: [{ label_id: SMART.id, ugc: true }], par_langue: PROD.par_langue },
      },
    });
    // Le changement seul, que la page réapplique sur la valeur relue en base.
    expect(onChange.mock.calls[0]![1]).toStrictEqual({
      slug: "sophia",
      cle: "general",
      items: [{ label_id: SMART.id, ugc: true }],
    });
  });

  it("liens illisibles : la File Sophia propose quand même tous les labels slideshow", async () => {
    listerLiensLabels.mockReset();
    listerLiensLabels.mockRejectedValue(new Error("panne réseau"));
    rendre();
    await waitFor(() => expect(optionsAjout()).toEqual(["", SMART.id, CLASSIC.id]));
  });

  it("Unswipe : sa tranche seule, labels qui la servent, jamais UGC", async () => {
    const onChange = rendre();
    const selApp = await screen.findByLabelText(/^(Application|App)$/);
    fireEvent.change(selApp, { target: { value: "unswipe" } });
    await waitFor(() => expect(optionsAjout()).toEqual(["", CLASSIC.id]));
    expect(screen.queryByLabelText(/Compte UGC|UGC account/)).toBeNull();
    expect(screen.getByText(/Un compte Unswipe n’est jamais UGC|A Unswipe account is never UGC/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^(File à éditer|Queue to edit)$/), { target: { value: "fr" } });
    fireEvent.change(selectAjout(), { target: { value: CLASSIC.id } });
    fireEvent.click(screen.getByRole("button", { name: /^(Ajouter|Add)$/ }));
    const ecrit = onChange.mock.calls[0]![0] as ReglagesFileLabels;
    expect(ecrit.items).toBe(PROD.items);
    expect(ecrit.par_langue).toBe(PROD.par_langue);
    expect(ecrit.par_application).toStrictEqual({
      sophia: PROD.par_application!.sophia,
      unswipe: { items: [], par_langue: { fr: [{ label_id: CLASSIC.id, ugc: false }] } },
    });
  });

  it("entrée dont le label ne sert pas l'application : signalée, pas masquée", async () => {
    const initial: ReglagesFileLabels = {
      ...PROD,
      par_application: { ...PROD.par_application, unswipe: { items: [{ label_id: SMART.id, ugc: false }], par_langue: {} } },
    };
    rendre(vi.fn(), initial);
    const selApp = await screen.findByLabelText(/^(Application|App)$/);
    fireEvent.change(selApp, { target: { value: "unswipe" } });
    const liste = screen.getByTestId("file-labels-items");
    expect(within(liste).getByText("Smart Girl")).toBeInTheDocument();
    expect(await within(liste).findByText(/ne sert pas Unswipe|does not serve Unswipe/)).toBeInTheDocument();
  });

  it("aucun label ne sert l'application : message vers Pilotage → Labels", async () => {
    listerLiensLabels.mockResolvedValue([]);
    rendre();
    const selApp = await screen.findByLabelText(/^(Application|App)$/);
    fireEvent.change(selApp, { target: { value: "unswipe" } });
    expect(
      await screen.findByText(/Aucun label slideshow ne sert Unswipe|No slideshow label serves Unswipe/),
    ).toBeInTheDocument();
  });

  it("une seule application active : pas de sélecteur, Sophia éditée", async () => {
    listerApplicationsMulti.mockResolvedValue([APPS[0]]);
    rendre();
    await waitFor(() => expect(optionsAjout()).toEqual(["", SMART.id]));
    expect(screen.queryByLabelText(/^(Application|App)$/)).toBeNull();
  });
});

/**
 * Décider le label des prochains comptes d'Atala : inactive au 19/11, mais ses
 * comptes se recrutent déjà (migration 0770).
 */
describe("FileLabelsApplicationEditeur — une application en préparation, et des comptes par dizaines", () => {
  const ID_ATALA = "00000000-0000-4000-8000-000000000004";
  const ATALA = { id: ID_ATALA, slug: "atala", nom: "Atala", created_at: "", langues: null, actif: false };
  const MALE = lab("l-male", "male_run");
  const GIRL = lab("l-girl", "classic_girl_run");
  const LIENS_ATALA = [
    ...LIENS,
    { label_id: MALE.id, application_id: ID_ATALA },
    { label_id: GIRL.id, application_id: ID_ATALA },
  ];
  const LABELS = [SMART, CLASSIC, MALE, GIRL];
  const enPreparation = { slugsEnPreparation: ["atala"], labels: LABELS };

  beforeEach(() => {
    listerApplicationsMulti.mockReset();
    listerApplicationsMulti.mockResolvedValue([...APPS, ATALA]);
    listerLiensLabels.mockReset();
    listerLiensLabels.mockResolvedValue(LIENS_ATALA);
  });

  const optionsApp = async () =>
    within(await screen.findByLabelText(/^(Application|App)$/))
      .getAllByRole("option")
      .map((o) => (o as HTMLOptionElement).value);

  async function choisirAtala() {
    const selApp = await screen.findByLabelText(/^(Application|App)$/);
    await waitFor(() => expect(within(selApp).queryByRole("option", { name: /Atala/ })).not.toBeNull());
    fireEvent.change(selApp, { target: { value: "atala" } });
    await waitFor(() => expect(optionsAjout()).toEqual(["", MALE.id, GIRL.id]));
  }

  it("inactive et pas en préparation : elle n'a pas de File", async () => {
    rendre(vi.fn(), undefined, { labels: LABELS });
    await waitFor(async () => expect(await optionsApp()).toEqual(["sophia", "unswipe"]));
  });

  it("en préparation : sa File s'édite, et le sélecteur dit qu'elle est inactive", async () => {
    rendre(vi.fn(), undefined, enPreparation);
    await waitFor(async () => expect(await optionsApp()).toEqual(["sophia", "atala", "unswipe"]));
    const selApp = await screen.findByLabelText(/^(Application|App)$/);
    expect(within(selApp).getByRole("option", { name: /Atala/ }).textContent).toMatch(/inactive/);
    // Choisie, elle reste choisie : l'éditeur ne la renvoie pas sur Sophia.
    await choisirAtala();
    expect(selApp).toHaveValue("atala");
  });

  it("50 comptes d'un coup : 50 entrées écrites, une seule ligne à l'écran", async () => {
    const onChange = rendre(vi.fn(), undefined, enPreparation);
    await choisirAtala();
    fireEvent.change(selectAjout(), { target: { value: MALE.id } });
    fireEvent.change(screen.getByLabelText(/^(Nombre de comptes|Number of accounts)$/), { target: { value: "50" } });
    fireEvent.click(screen.getByRole("button", { name: /^(Ajouter|Add)$/ }));

    const chg = onChange.mock.calls[0]![1] as ChangementFileLabels;
    expect(chg.slug).toBe("atala");
    expect(chg.cle).toBe("general");
    expect(chg.items).toHaveLength(50);
    expect(chg.items.every((i) => i.label_id === MALE.id && i.ugc === false)).toBe(true);
    // La tranche Sophia n'a pas bougé.
    const ecrit = onChange.mock.calls[0]![0] as ReglagesFileLabels;
    expect(ecrit.par_application!.sophia).toStrictEqual(PROD.par_application!.sophia);

    const liste = screen.getByTestId("file-labels-items");
    expect(within(liste).getAllByRole("listitem")).toHaveLength(1);
    expect(liste.textContent).toMatch(/1–50\./);
    expect(liste.textContent).toMatch(/×50/);
    expect(screen.getByTestId("file-total").textContent).toMatch(/50 comptes|50 accounts/);
    // Le nombre revient à 1 : l'ajout suivant ne repart pas à 50 par mégarde.
    expect(screen.getByLabelText(/^(Nombre de comptes|Number of accounts)$/)).toHaveValue(1);
  });

  it("20 d'un label puis 30 d'un autre : deux groupes, dans l'ordre, qu'on peut inverser", async () => {
    const initial: ReglagesFileLabels = {
      ...PROD,
      par_application: {
        ...PROD.par_application,
        atala: {
          items: [
            ...Array.from({ length: 20 }, () => ({ label_id: MALE.id, ugc: false })),
            ...Array.from({ length: 30 }, () => ({ label_id: GIRL.id, ugc: false })),
          ],
          par_langue: {},
        },
      },
    };
    const onChange = rendre(vi.fn(), initial, enPreparation);
    await choisirAtala();
    const lignes = within(screen.getByTestId("file-labels-items")).getAllByRole("listitem");
    expect(lignes.map((l) => l.textContent)).toEqual([
      expect.stringMatching(/1–20\.male_run×20/),
      expect.stringMatching(/21–50\.classic_girl_run×30/),
    ]);

    // classic_girl_run passe devant, en bloc.
    fireEvent.click(screen.getByRole("button", { name: /^(Monter classic_girl_run|Move classic_girl_run up)$/ }));
    const items = (onChange.mock.calls.at(-1)![1] as ChangementFileLabels).items;
    expect(items).toHaveLength(50);
    expect(items.slice(0, 30).every((i) => i.label_id === GIRL.id)).toBe(true);
    expect(items.slice(30).every((i) => i.label_id === MALE.id)).toBe(true);
  });

  it("retirer un compte d'un groupe, ou le groupe entier", async () => {
    const initial: ReglagesFileLabels = {
      ...PROD,
      par_application: {
        ...PROD.par_application,
        atala: { items: Array.from({ length: 3 }, () => ({ label_id: MALE.id, ugc: false })), par_langue: {} },
      },
    };
    const onChange = rendre(vi.fn(), initial, enPreparation);
    await choisirAtala();
    fireEvent.click(screen.getByRole("button", { name: /(Retirer un compte de|Remove one account from) male_run/ }));
    expect((onChange.mock.calls.at(-1)![1] as ChangementFileLabels).items).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: /(Retirer les 2 comptes de|Remove the 2 accounts of) male_run/ }));
    expect((onChange.mock.calls.at(-1)![1] as ChangementFileLabels).items).toEqual([]);
  });

  it("ses labels sont dans « Ajouter un label » dès l'ouverture, sans changer d'application d'abord", async () => {
    // Le piège du 19/11 : l'éditeur s'ouvre sur Sophia, et la liste ne montrait
    // que ses labels. Ceux d'Atala « n'étaient pas là ».
    rendre(vi.fn(), undefined, enPreparation);
    const selApp = await screen.findByLabelText(/^(Application|App)$/);
    expect(selApp).toHaveValue("sophia");
    await waitFor(() =>
      expect(optionsAutres()).toEqual([
        `autre:atala:${MALE.id}`,
        `autre:atala:${GIRL.id}`,
        `autre:unswipe:${CLASSIC.id}`,
      ]),
    );
    // Rangés par application, celle qu'on édite d'abord.
    const groupes = within(selectAjout()).getAllByRole("group").map((g) => (g as HTMLOptGroupElement).label);
    expect(groupes).toEqual(["Sophia", "Atala", "Unswipe"]);
    expect(screen.getByText(/rangés par appli|grouped by app/)).toBeInTheDocument();
  });

  it("choisir un label d'Atala depuis Sophia ouvre la File d'Atala, et l'entrée part chez elle", async () => {
    const onChange = rendre(vi.fn(), undefined, enPreparation);
    const selApp = await screen.findByLabelText(/^(Application|App)$/);
    await waitFor(() => expect(optionsAutres()).toContain(`autre:atala:${MALE.id}`));
    // Le nombre saisi AVANT de choisir le label est gardé.
    fireEvent.change(screen.getByLabelText(/^(Nombre de comptes|Number of accounts)$/), { target: { value: "50" } });
    fireEvent.change(selectAjout(), { target: { value: `autre:atala:${MALE.id}` } });

    expect(selApp).toHaveValue("atala");
    expect(selectAjout()).toHaveValue(MALE.id);
    expect(screen.getByLabelText(/^(Nombre de comptes|Number of accounts)$/)).toHaveValue(50);

    fireEvent.click(screen.getByRole("button", { name: /^(Ajouter|Add)$/ }));
    const chg = onChange.mock.calls[0]![1] as ChangementFileLabels;
    expect(chg.slug).toBe("atala");
    expect(chg.items).toHaveLength(50);
    expect(chg.items.every((i) => i.label_id === MALE.id)).toBe(true);
    // Rien dans la File de Sophia.
    const ecrit = onChange.mock.calls[0]![0] as ReglagesFileLabels;
    expect(ecrit.items).toEqual([]);
  });

  it("en mode UGC, seuls les labels de Sophia : une entrée UGC n'existe que pour elle", async () => {
    rendre(vi.fn(), undefined, enPreparation);
    await waitFor(() => expect(optionsAutres().length).toBeGreaterThan(0));
    fireEvent.click(screen.getByLabelText(/Compte UGC|UGC account/));
    expect(optionsAutres()).toEqual([]);
    expect(optionsAjout()).toEqual(["", SMART.id]);
  });

  it("à 0 % dans la cible, la File ne sera pas lue : l'éditeur le dit", async () => {
    rendre(vi.fn(), undefined, { ...enPreparation, partsCible: { sophia: 100, atala: 0 } });
    // Sophia d'abord : rien à signaler, même si la cible ne dit rien d'elle.
    await screen.findByLabelText(/^(Application|App)$/);
    expect(screen.queryByTestId("file-sans-part")).toBeNull();
    await choisirAtala();
    expect(screen.getByTestId("file-sans-part").textContent).toMatch(/Atala a 0 %|Atala has 0 %/);
  });

  it("avec une part dans la cible, ou sans cible connue, pas d'avertissement", async () => {
    rendre(vi.fn(), undefined, { ...enPreparation, partsCible: { atala: 100 } });
    await choisirAtala();
    expect(screen.queryByTestId("file-sans-part")).toBeNull();
  });
});

