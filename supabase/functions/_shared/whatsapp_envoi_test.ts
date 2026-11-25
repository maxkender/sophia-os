import { assertEquals } from "jsr:@std/assert@1";

import { texteErreurGraph } from "./whatsapp_envoi.ts";
import { limiteMeta } from "./whatsapp_traductions.ts";

Deno.test("erreur Meta : code, sous-code et explication donnée à l'utilisateur", () => {
  assertEquals(texteErreurGraph({ code: 100, message: "Invalid parameter" }, 400), "100 Invalid parameter");
  assertEquals(
    texteErreurGraph({
      code: 100, error_subcode: 2388023, message: "Invalid parameter", error_user_title: "Language is being deleted",
      error_user_msg: "New content can't be added\nwhile the existing tr content is being deleted.",
    }, 400),
    "100/2388023 Invalid parameter — Language is being deleted : New content can't be added while the existing tr content is being deleted.",
  );
  assertEquals(texteErreurGraph({}, 500), "500");
  // La limite de Meta reste reconnue avec un sous-code.
  assertEquals(limiteMeta(texteErreurGraph({ code: 4, error_subcode: 1, message: "Application request limit reached" }, 400)), true);
  assertEquals(limiteMeta(texteErreurGraph({ code: 100, error_subcode: 2388023, message: "Invalid parameter" }, 400)), false);
});
