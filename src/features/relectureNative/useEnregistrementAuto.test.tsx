import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DELAI_ENREGISTREMENT, useEnregistrementAuto } from "./useEnregistrementAuto";

describe("useEnregistrementAuto", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const monter = (valeur: string, enregistree = "") => {
    const enregistrer = vi.fn();
    const rendu = renderHook(({ v, e }) => useEnregistrementAuto(v, e, enregistrer), {
      initialProps: { v: valeur, e: enregistree },
    });
    return { enregistrer, ...rendu };
  };

  it("n'enregistre rien tant que rien n'a changé", () => {
    const { enregistrer, result, unmount } = monter("Abitur", "Abitur");
    act(() => vi.advanceTimersByTime(DELAI_ENREGISTREMENT * 2));
    act(() => result.current());
    unmount();
    expect(enregistrer).not.toHaveBeenCalled();
  });

  it("enregistre quand la frappe s'arrête, une seule fois", () => {
    const { enregistrer, rerender } = monter("");
    rerender({ v: "Abi", e: "" });
    act(() => vi.advanceTimersByTime(DELAI_ENREGISTREMENT / 2));
    rerender({ v: "Abitur", e: "" });
    act(() => vi.advanceTimersByTime(DELAI_ENREGISTREMENT / 2));
    expect(enregistrer).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(DELAI_ENREGISTREMENT));
    expect(enregistrer).toHaveBeenCalledTimes(1);
    expect(enregistrer).toHaveBeenCalledWith("Abitur");
  });

  it("enregistre tout de suite en quittant le champ, sans renvoyer la même valeur ensuite", () => {
    const { enregistrer, rerender, result } = monter("");
    rerender({ v: "MSA", e: "" });
    act(() => result.current());
    expect(enregistrer).toHaveBeenCalledWith("MSA");
    act(() => vi.advanceTimersByTime(DELAI_ENREGISTREMENT * 2));
    act(() => result.current());
    expect(enregistrer).toHaveBeenCalledTimes(1);
  });

  it("enregistre ce qui reste quand le champ disparaît (changement de bloc)", () => {
    const { enregistrer, rerender, unmount } = monter("");
    rerender({ v: "Deutschland", e: "" });
    unmount();
    expect(enregistrer).toHaveBeenCalledWith("Deutschland");
  });

  it("enregistre ce qui reste quand on ferme la page", () => {
    const { enregistrer, rerender } = monter("");
    rerender({ v: "Gymnasium", e: "" });
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    expect(enregistrer).toHaveBeenCalledWith("Gymnasium");
  });
});
