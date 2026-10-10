/**
 * File des créateurs par application : la tranche Sophia reste celle d'avant
 * (racine), les autres tranches se lisent et survivent aux réécritures, et une
 * entrée tirée revient en tête de SA tranche.
 */
import { assertEquals } from "jsr:@std/assert@1";

import {
  avecSliceApplication,
  normaliserFileLabelsValeur,
  remettreEnTete,
  sliceFileLabels,
  valeurFileLabels,
} from "./file_labels_comptes.ts";

const SMART = { label_id: "smart_girl", ugc: false };
const CLASSIC = { label_id: "classic-study", ugc: false };
const CLEAN = { label_id: "clean-study", ugc: false };

/** Forme de la prod : tranche Sophia à la racine et dans par_application.sophia. */
const PROD = {
  items: [],
  par_langue: { da: [SMART], he: [SMART] },
  par_application: {
    sophia: { items: [], par_langue: { da: [SMART], he: [SMART] } },
  },
};

Deno.test("Sophia : lue à la racine, comme avant (format prod)", () => {
  const file = normaliserFileLabelsValeur(PROD);
  assertEquals(sliceFileLabels(file, "sophia"), {
    items: [],
    par_langue: { da: [SMART], he: [SMART] },
  });
});

Deno.test("Sophia : la racine fait foi même si par_application.sophia diverge", () => {
  const file = normaliserFileLabelsValeur({
    items: [SMART],
    par_langue: {},
    par_application: { sophia: { items: [CLASSIC], par_langue: {} } },
  });
  assertEquals(sliceFileLabels(file, "sophia").items, [SMART]);
});

Deno.test("format d'avant les applications (+ legacy label_ids) : tranche Sophia", () => {
  assertEquals(
    sliceFileLabels(
      normaliserFileLabelsValeur({ items: [SMART], par_langue: { fr: [CLEAN] } }),
      "sophia",
    ),
    { items: [SMART], par_langue: { fr: [CLEAN] } },
  );
  assertEquals(
    sliceFileLabels(normaliserFileLabelsValeur({ label_ids: ["smart_girl"] }), "sophia").items,
    [SMART],
  );
  assertEquals(sliceFileLabels(normaliserFileLabelsValeur(null), "sophia"), {
    items: [],
    par_langue: {},
  });
});

Deno.test("Unswipe : sa tranche par_application, vide si absente", () => {
  assertEquals(sliceFileLabels(normaliserFileLabelsValeur(PROD), "unswipe"), {
    items: [],
    par_langue: {},
  });
  const file = normaliserFileLabelsValeur({
    ...PROD,
    par_application: {
      ...PROD.par_application,
      unswipe: { items: [CLASSIC], par_langue: { FR: [CLEAN, { label_id: "" }], de: [] } },
    },
  });
  // Codes de langue en minuscules, entrées sans label et listes vides retirées.
  assertEquals(sliceFileLabels(file, "unswipe"), {
    items: [CLASSIC],
    par_langue: { fr: [CLEAN] },
  });
});

Deno.test("réécrire la tranche Sophia CONSERVE la tranche Unswipe", () => {
  const file = normaliserFileLabelsValeur({
    ...PROD,
    par_application: {
      ...PROD.par_application,
      unswipe: { items: [CLASSIC], par_langue: { fr: [CLEAN] } },
    },
  });
  // Ce que fait popLabelFile après avoir tiré smart_girl de la file `da`.
  const apres = valeurFileLabels(
    avecSliceApplication(file, "sophia", { items: [], par_langue: { da: [], he: [SMART] } }),
  );
  assertEquals(apres, {
    items: [],
    par_langue: { he: [SMART] },
    par_application: {
      sophia: { items: [], par_langue: { he: [SMART] } },
      unswipe: { items: [CLASSIC], par_langue: { fr: [CLEAN] } },
    },
  });
});

Deno.test("réécrire la tranche Unswipe ne touche ni la racine ni la tranche Sophia", () => {
  const file = normaliserFileLabelsValeur({
    ...PROD,
    par_application: {
      ...PROD.par_application,
      unswipe: { items: [CLASSIC], par_langue: { fr: [CLEAN] } },
    },
  });
  const apres = valeurFileLabels(
    avecSliceApplication(file, "unswipe", { items: [CLASSIC], par_langue: {} }),
  );
  assertEquals(apres, {
    items: [],
    par_langue: { da: [SMART], he: [SMART] },
    par_application: {
      sophia: { items: [], par_langue: { da: [SMART], he: [SMART] } },
      unswipe: { items: [CLASSIC], par_langue: {} },
    },
  });
});

Deno.test("remettre en tête : dans la file d'origine de la BONNE tranche", () => {
  const file = normaliserFileLabelsValeur({
    ...PROD,
    par_application: {
      ...PROD.par_application,
      unswipe: { items: [CLEAN], par_langue: {} },
    },
  });
  // Entrée Unswipe tirée de la file fr (vidée depuis) : revient en fr, tranche Unswipe.
  const unswipe = remettreEnTete(file, {
    item: CLASSIC,
    queueKey: "fr",
    applicationSlug: "unswipe",
  });
  assertEquals(sliceFileLabels(unswipe, "unswipe"), {
    items: [CLEAN],
    par_langue: { fr: [CLASSIC] },
  });
  assertEquals(sliceFileLabels(unswipe, "sophia"), sliceFileLabels(file, "sophia"));

  // Entrée Unswipe de la file générale : en tête de la générale Unswipe.
  const general = remettreEnTete(file, {
    item: CLASSIC,
    queueKey: "general",
    applicationSlug: "unswipe",
  });
  assertEquals(sliceFileLabels(general, "unswipe").items, [CLASSIC, CLEAN]);
  assertEquals(general.items, []);

  // Sans applicationSlug : tranche Sophia (racine), comme avant.
  const sophia = remettreEnTete(file, { item: SMART, queueKey: "da" });
  assertEquals(sophia.par_langue.da, [SMART, SMART]);
  assertEquals(sliceFileLabels(sophia, "unswipe").items, [CLEAN]);
});
