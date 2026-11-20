import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  emailMessageFin,
  nePlusContacter,
  nePlusContacterContrat,
  nePlusContacterEmail,
  permisApresArret,
  postersEnStop,
  stopDemande,
  stopDuContrat,
  typeUpworkPermisMalgreStop,
} from "./stop.ts";

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

/** 0797 : une fausse base qui répond aux fonctions « ne plus contacter ». */
function liste(bloques: { posteurs?: string[]; contrats?: string[]; emails?: string[] }) {
  return {
    rpc: (fn: string, args: Record<string, string>) => {
      const oui = fn === "ne_plus_contacter_bloque" ? (bloques.posteurs ?? []).includes(args.p_poster)
        : fn === "ne_plus_contacter_contrat" ? (bloques.contrats ?? []).includes(args.p_contrat)
        : fn === "ne_plus_contacter_email" ? (bloques.emails ?? []).includes(args.p_email)
        : false;
      return Promise.resolve({ data: oui, error: null });
    },
  };
}

Deno.test("0797 : liste « ne plus contacter » lue par posteur, par contrat et par email", async () => {
  const db = liste({ posteurs: ["judy"], contrats: ["C1"], emails: ["judy@example.com"] });
  assert(await nePlusContacter(db, "judy"));
  assert(!(await nePlusContacter(db, "ana")));
  assert(await nePlusContacterContrat(db, "C1"));
  assert(!(await nePlusContacterContrat(db, "C2")));
  assert(await nePlusContacterEmail(db, "judy@example.com"));
  assert(!(await nePlusContacterEmail(db, "pas-un-email")));
});

Deno.test("0797 : une lecture en échec ne bloque pas (l'erreur est notée)", async () => {
  const db = { rpc: () => Promise.resolve({ data: null, error: { message: "panne" } }) };
  assert(!(await nePlusContacter(db, "judy")));
});

Deno.test("0797 : après l'arrêt, seul le message de fin passe", () => {
  assert(permisApresArret("message_fin"));
  for (const m of ["confirmation_arret", "paie", "reponse", "manuel", undefined] as const) assert(!permisApresArret(m));
  assert(emailMessageFin(["fin_collaboration"]));
  assert(emailMessageFin(["x", "message_fin"]));
  assert(!emailMessageFin(["relance_kyc"]));
  assertEquals(emailMessageFin(null), false);
});
