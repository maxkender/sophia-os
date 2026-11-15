import { describe, expect, it } from "vitest";

import { AIDE_CATEGORIES, lireDemandeAide, texteDemandeAide, vueAide } from "../../../supabase/functions/_shared/reponses";

describe("6/11 : « I need help » ouvre une fenêtre (plus de carte vide)", () => {
  it("6 choix, une question obligatoire, une capture facultative", () => {
    const v = vueAide({ ts: "1.2", canal: "D1", response_url: null }) as { blocks: { block_id: string; optional?: boolean; element: { type: string } }[] };
    expect(AIDE_CATEGORIES.map((c) => c.libelle)).toEqual([
      "My post / my images", "My link", "TikTok (follow, review, likes)", "Login", "Pay", "Other: write your question",
    ]);
    expect(v.blocks.map((b) => [b.block_id, b.element.type, Boolean(b.optional)])).toEqual([
      ["categorie", "radio_buttons", false], ["texte", "plain_text_input", false], ["capture", "file_input", true],
    ]);
  });

  it("sans texte rien ne part ; avec texte, sujet + question + lien de la capture", () => {
    expect(lireDemandeAide({ categorie: { valeur: { selected_option: { value: "lien" } } }, texte: { valeur: { value: "  " } } })).toBeNull();
    const d = lireDemandeAide({
      categorie: { valeur: { selected_option: { value: "lien" } } },
      texte: { valeur: { value: "The link field is closed for yesterday's post" } },
      capture: { valeur: { files: [{ permalink: "https://slack.com/files/x" }] } },
    });
    expect(texteDemandeAide(d!)).toBe("I need help · My link: The link field is closed for yesterday's post\nScreenshot: https://slack.com/files/x");
  });
});
