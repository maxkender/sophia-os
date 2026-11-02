import { assertEquals } from "jsr:@std/assert@1";
import { lireContactPoster } from "./contact_poster.ts";

Deno.test("contact poster : rien d'envoyé, rien de repris", () => {
  assertEquals(lireContactPoster({ prenom: "Ana" }), { ok: true, contact: {} });
  assertEquals(lireContactPoster({ upwork_url: "  ", email_perso: "" }), { ok: true, contact: {} });
});

Deno.test("contact poster : les trois champs, nettoyés", () => {
  assertEquals(
    lireContactPoster({
      upwork_url: " https://www.upwork.com/freelancers/~01ab ",
      upwork_contrat_url: "https://www.upwork.com/nx/wm/workroom/123",
      email_perso: " Ana.Silva@Gmail.com ",
    }),
    {
      ok: true,
      contact: {
        upwork_url: "https://www.upwork.com/freelancers/~01ab",
        upwork_contrat_url: "https://www.upwork.com/nx/wm/workroom/123",
        email_perso: "ana.silva@gmail.com",
      },
    },
  );
});

Deno.test("contact poster : email illisible refusé", () => {
  assertEquals(lireContactPoster({ email_perso: "ana.silva" }), { ok: false, erreur: "EMAIL_PERSO_INVALIDE" });
  assertEquals(lireContactPoster({ email_perso: "ana @gmail.com" }), { ok: false, erreur: "EMAIL_PERSO_INVALIDE" });
});
