import { assert, assertEquals } from "jsr:@std/assert@1";

import { jetonValide, lirePeriodeQg, QG_JOURS_MAX, routeQg } from "./qg.ts";

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

Deno.test("route : dernier segment du chemin", () => {
  assertEquals(routeQg("/functions/v1/qg/apps"), "apps");
  assertEquals(routeQg("/qg/apps/"), "apps");
  assertEquals(routeQg("/api/qg/apps"), "apps");
  assertEquals(routeQg("/qg"), "qg");
});
