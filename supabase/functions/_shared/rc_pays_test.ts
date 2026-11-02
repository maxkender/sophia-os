import { assert, assertEquals } from "jsr:@std/assert@1";
import { codePays, filtreNouvelles, lireRevenuParPays, lundiDeCohorte } from "./rc_pays.ts";

Deno.test("Pays : la semaine RevenueCat (dimanche UTC) va sous le lundi de l'OS", () => {
  // 1792281600 = dimanche 18/10/2026 00:00 UTC.
  assertEquals(lundiDeCohorte(1792281600), "2026-10-19");
  // Lundi 19/10 : lui-même ; mercredi 21/10 : le lundi 19/10.
  assertEquals(lundiDeCohorte(1792368000), "2026-10-19");
  assertEquals(lundiDeCohorte(1792540800), "2026-10-19");
});

Deno.test("Pays : noms RevenueCat → codes ISO", () => {
  assertEquals(codePays("Germany"), "DE");
  assertEquals(codePays("Türkiye"), "TR");
  assertEquals(codePays("United States"), "US");
  assertEquals(codePays("United Kingdom"), "GB");
  assertEquals(codePays("Czechia"), "CZ");
  assertEquals(codePays("Congo, The Democratic Republic of the"), "CD");
  assertEquals(codePays("Total"), null);
  assertEquals(codePays("Other"), null);
});

Deno.test("Pays : une réponse « revenue » → lignes pays × semaine (proceeds, transactions)", () => {
  const data = {
    segments: [{ display_name: "Total" }, { display_name: "Germany" }, { display_name: "Mexico" }],
    measures: [{ display_name: "Proceeds" }, { display_name: "Transactions" }, { display_name: "Ad Impressions" }],
    values: [
      { cohort: 1792281600, segment: 0, measure: 0, value: 100.456 },
      { cohort: 1792281600, segment: 0, measure: 1, value: 10 },
      { cohort: 1792281600, segment: 1, measure: 0, value: 60.1 },
      { cohort: 1792281600, segment: 1, measure: 1, value: 6, incomplete: true },
      { cohort: 1792281600, segment: 2, measure: 0, value: 40.35 },
      { cohort: 1792281600, segment: 2, measure: 2, value: 999 },
    ],
  };
  const lignes = lireRevenuParPays(data);
  assertEquals(lignes.length, 3);
  const de = lignes.find((l) => l.pays === "DE")!;
  assertEquals([de.semaine, de.proceeds, de.transactions, de.incomplet], ["2026-10-19", 60.1, 6, true]);
  const total = lignes.find((l) => l.pays_nom === "Total")!;
  assertEquals([total.pays, total.proceeds], [null, 100.46]);
  assertEquals(lignes.find((l) => l.pays === "MX")!.transactions, 0);
});

Deno.test("Pays : le filtre « transaction type = New » lu dans les options", () => {
  const options = { filters: [{ id: "country", display_name: "Country", values: [] }, { id: "txn_type", display_name: "Transaction Type", values: [{ id: "renewal", display_name: "Renewal" }, { id: "new", display_name: "New" }] }] };
  assertEquals(filtreNouvelles(options), { name: "txn_type", values: ["new"] });
  assert(filtreNouvelles({}) === null);
});
