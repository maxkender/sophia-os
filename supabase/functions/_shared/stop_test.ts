import { assert, assertEquals } from "jsr:@std/assert@1";

import { postersEnStop, stopDemande, stopDuContrat, typeUpworkPermisMalgreStop } from "./stop.ts";

/** Une fausse base : deux posteurs, Judy a dit STOP. */
function base() {
  const profils = [
    { id: "judy", upwork_contract_id: "C1", relances_stop_at: "2026-11-12T17:00:00Z" },
    { id: "ana", upwork_contract_id: "C2", relances_stop_at: null },
  ];
  return {
    from: () => {
      let lignes = [...profils];
      const q = {
        select: () => q,
        eq: (col: string, v: unknown) => ((lignes = lignes.filter((l) => (l as Record<string, unknown>)[col] === v)), q),
        in: (col: string, vs: unknown[]) => ((lignes = lignes.filter((l) => vs.includes((l as Record<string, unknown>)[col]))), q),
        not: (col: string) => ((lignes = lignes.filter((l) => (l as Record<string, unknown>)[col] !== null)), q),
        limit: () => Promise.resolve({ data: lignes, error: null }),
        maybeSingle: () => Promise.resolve({ data: lignes[0] ?? null, error: null }),
        then: (ok: (r: { data: unknown; error: null }) => unknown) => Promise.resolve({ data: lignes, error: null }).then(ok),
      };
      return q;
    },
  };
}

Deno.test("0684 : STOP lu sur la fiche, par posteur et par contrat Upwork", async () => {
  assert(await stopDemande(base(), "judy"));
  assert(!(await stopDemande(base(), "ana")));
  assert(await stopDuContrat(base(), "C1"));
  assert(!(await stopDuContrat(base(), "C2")));
  assertEquals([...(await postersEnStop(base(), ["judy", "ana", "judy"]))], ["judy"]);
});

Deno.test("0684 : sur Upwork, seuls la confirmation d'arrêt, la paie et un message tapé à la main passent malgré un STOP", () => {
  for (const t of ["stop", "bot_stop", "paie"]) assert(typeUpworkPermisMalgreStop(t, false), t);
  assert(typeUpworkPermisMalgreStop(undefined, true));
  assert(typeUpworkPermisMalgreStop("manuel", true));
  for (const t of ["warmup_check", "double", "parrainage", "bot_relance", "relance"]) assert(!typeUpworkPermisMalgreStop(t, false), t);
  assert(!typeUpworkPermisMalgreStop(undefined, false), "un envoi programmé sans type");
  assert(!typeUpworkPermisMalgreStop("double", true), "Doubler, même lancé à la main");
});
