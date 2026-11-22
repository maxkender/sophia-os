import { assert, assertEquals } from "jsr:@std/assert@1";

import { estRouteQg, jetonDeRequete, jetonValide, lireLundiQg, lirePeriodeQg, lundiSouple, QG_JOURS_MAX, raisonRefus, routeQg } from "./qg.ts";

const p = (q: string) => lirePeriodeQg(new URLSearchParams(q));

Deno.test("période : from et to obligatoires, valides, dans l'ordre, bornés", () => {
  assertEquals(p("from=2026-09-28&to=2026-11-22"), { ok: true, from: "2026-09-28", to: "2026-11-22" });
  assertEquals(p("from=2026-11-22&to=2026-11-22").ok, true);
  assertEquals(p("from=2026-09-28").ok, false);
  assertEquals(p("from=2026-02-30&to=2026-03-01").ok, false);
  assertEquals(p("from=28/09/2026&to=2026-11-22").ok, false);
  assertEquals(p("from=2026-11-22&to=2026-11-01").ok, false);
  assertEquals(p("from=2026-01-01&to=2026-12-31").ok, false);
  const fin = new Date(Date.parse("2026-01-01T00:00:00Z") + (QG_JOURS_MAX - 1) * 86_400_000).toISOString().slice(0, 10);
  assertEquals(p(`from=2026-01-01&to=${fin}`).ok, true);
});

Deno.test("jeton : égalité stricte, jamais sans jeton configuré", () => {
  const s = "a".repeat(40);
  assert(jetonValide(s, s));
  assert(!jetonValide(s + "b", s));
  assert(!jetonValide("a".repeat(39), s));
  assert(!jetonValide(null, s));
  assert(!jetonValide(s, undefined));
  assert(!jetonValide("court", "court"));
});

Deno.test("routes : tout ce qui suit qg", () => {
  assertEquals(routeQg("/functions/v1/qg/apps"), "apps");
  assertEquals(routeQg("/qg/apps/"), "apps");
  assertEquals(routeQg("/api/qg/apps"), "apps");
  assertEquals(routeQg("/api/qg/control/recrutement"), "control/recrutement");
  assertEquals(routeQg("/functions/v1/qg/control/paie"), "control/paie");
  assert(estRouteQg("control/autres"));
  assert(!estRouteQg("control"));
  assert(!estRouteQg("qg"));
});

Deno.test("lundi obligatoire pour cohorte et semaine", () => {
  assertEquals(lireLundiQg(new URLSearchParams("cohorte=2026-11-16"), "cohorte"), { ok: true, lundi: "2026-11-16" });
  assertEquals(lireLundiQg(new URLSearchParams("semaine=2026-11-17"), "semaine").ok, false);
  assertEquals(lireLundiQg(new URLSearchParams(""), "semaine").ok, false);
  assertEquals(lireLundiQg(new URLSearchParams("cohorte=16/11/2026"), "cohorte").ok, false);
});

Deno.test("QG réel : noms anglais, jeton en Bearer, paramètres souples", () => {
  assertEquals(routeQg("/functions/v1/qg/control/recruitment"), "control/recrutement");
  assertEquals(routeQg("/api/qg/control/payroll"), "control/paie");
  assertEquals(routeQg("/api/qg/control/issues"), "control/autres");
  const s = "b".repeat(20);
  assertEquals(jetonDeRequete(new Headers({ authorization: `Bearer ${s}` })), s);
  assertEquals(jetonDeRequete(new Headers({ "x-qg-token": ` ${s} ` })), s);
  assert(jetonValide(` ${s}\n`, s));
  assert(!jetonValide("court", "court"));
  assertEquals(raisonRefus(null, s), "jeton absent : en-tête x-qg-token (ou Authorization: Bearer)");
  assertEquals(raisonRefus("x", null).startsWith("QG_TOKEN absent"), true);
  assertEquals(lundiSouple(new URLSearchParams("week=2026-11-12"), ["semaine", "week"], "2026-11-16"), { ok: true, lundi: "2026-11-09" });
  assertEquals(lundiSouple(new URLSearchParams(""), ["semaine", "week"], "2026-11-16"), { ok: true, lundi: "2026-11-16" });
});
