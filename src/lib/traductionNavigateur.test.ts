import { afterEach, describe, expect, it, vi } from "vitest";

import { protegerContreTraduction } from "./traductionNavigateur";

/** Comme Chrome « Traduire » : le texte est remplacé par des <font>, dans le dos de React. */
function traduire(texte: Text): HTMLElement {
  const font = document.createElement("font");
  font.textContent = "traduit";
  texte.parentNode!.replaceChild(font, texte);
  return font;
}

describe("protegerContreTraduction", () => {
  let retirer: (() => void) | null = null;
  afterEach(() => {
    retirer?.();
    retirer = null;
    vi.restoreAllMocks();
  });

  it("sans protection, retirer un texte traduit lève NotFoundError (la page blanche)", () => {
    const parent = document.createElement("p");
    const texte = parent.appendChild(document.createTextNode("See the feedback"));
    traduire(texte);
    expect(() => parent.removeChild(texte)).toThrow(/not a child/);
  });

  it("avec protection, retirer un texte déplacé ne lève plus, et le reste marche comme avant", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    retirer = protegerContreTraduction();
    const parent = document.createElement("p");
    const texte = parent.appendChild(document.createTextNode("See the feedback"));
    const font = traduire(texte);
    expect(parent.removeChild(texte)).toBe(texte);
    expect(parent.firstChild).toBe(font);

    const autre = parent.appendChild(document.createElement("span"));
    parent.removeChild(autre);
    expect(autre.parentNode).toBeNull();
  });

  it("avec protection, insérer avant une référence déplacée ne lève plus", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    retirer = protegerContreTraduction();
    const parent = document.createElement("div");
    const ref = parent.appendChild(document.createTextNode("Got it"));
    traduire(ref);
    const nouveau = document.createElement("span");
    expect(parent.insertBefore(nouveau, ref)).toBe(nouveau);

    const ancre = parent.appendChild(document.createElement("b"));
    parent.insertBefore(nouveau, ancre);
    expect(nouveau.nextSibling).toBe(ancre);
  });

  it("se pose une seule fois et se retire proprement", () => {
    const original = Node.prototype.removeChild;
    retirer = protegerContreTraduction();
    expect(protegerContreTraduction()).toBe(retirer);
    expect(Node.prototype.removeChild).not.toBe(original);
    retirer();
    retirer = null;
    expect(Node.prototype.removeChild).toBe(original);
  });
});
