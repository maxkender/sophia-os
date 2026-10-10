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
import { FileLabelsApplicationEditeur } from "./FileLabelsApplicationEditeur";

const ID_SOPHIA = "00000000-0000-4000-8000-000000000001";
const ID_UNSWIPE = "00000000-0000-4000-8000-000000000003";
const APPS = [
  { id: ID_SOPHIA, slug: "sophia", nom: "Sophia", created_at: "", langues: null, actif: true },
  { id: ID_UNSWIPE, slug: "unswipe", nom: "Unswipe", created_at: "", langues: ["fr", "de"], actif: true },
];
const lab = (id: string, nom: string): Label =>
  ({ id, nom, slug: nom.toLowerCase().replace(/\s+/g, "-"), ugc_ai_video: false }) as Label;
const SMART = lab("l-smart", "Smart Girl");
const CLASSIC = lab("l-classic", "Classic Study");
const LIENS = [{ label_id: CLASSIC.id, application_id: ID_UNSWIPE }];

const PROD: ReglagesFileLabels = {
  items: [],
  par_langue: { da: [{ label_id: SMART.id, ugc: false }] },
  par_application: { sophia: { items: [], par_langue: { da: [{ label_id: SMART.id, ugc: false }] } } },
};

function Harnais({ onChange, initial = PROD }: { onChange: (f: ReglagesFileLabels) => void; initial?: ReglagesFileLabels }) {
  const [file, setFile] = React.useState(initial);
  return (
    <FileLabelsApplicationEditeur
      file={file}
      onChange={(f) => {
        setFile(f);
        onChange(f);
      }}
      enCours={false}
      labels={[SMART, CLASSIC]}
      labelsUgc={[SMART.id]}
    />
  );
}

function rendre(onChange = vi.fn(), initial?: ReglagesFileLabels) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <Harnais onChange={onChange} initial={initial} />
    </QueryClientProvider>,
  );
  return onChange;
}

const selectAjout = () => screen.getByLabelText(/^(Ajouter un label|Add a label)$/) as HTMLSelectElement;
const optionsAjout = () => within(selectAjout()).getAllByRole("option").map((o) => (o as HTMLOptionElement).value);

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
