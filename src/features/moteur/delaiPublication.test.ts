/**
 * Le compte à rebours entre deux publications.
 *
 * Deux pièges, et ce sont eux qui sont testés plutôt que l'arithmétique :
 *
 *  - l'arrondi. Le trigger refuse tant qu'il reste la moindre seconde ; une
 *    interface qui arrondit au plus proche afficherait « 0 min » pendant que
 *    le serveur refuse encore, et le refus passerait pour un bug.
 *
 *  - le type de l'erreur. Supabase rejette avec un `PostgrestError`, un objet
 *    nu qui n'est PAS une instance d'Error. C'est déjà ce qui fait afficher
 *    « Lien TikTok obligatoire » à la place du vrai message dans la page
 *    poster : un `instanceof Error` y laisse passer tous les refus serveur.
 */

import { describe, expect, it } from "vitest";

import {
  DELAI_PUBLICATION_MIN_DEFAUT,
  minutesAvantPublication,
  minutesDepuisErreurPublication,
} from "./delaiPublication";

const MAINTENANT = new Date("2026-10-02T12:00:00.000Z");

function ilYA(minutes: number): string {
  return new Date(MAINTENANT.getTime() - minutes * 60_000).toISOString();
}

describe("minutesAvantPublication", () => {
  it("aucune publication précédente : rien ne bloque", () => {
    expect(minutesAvantPublication(null, 25, MAINTENANT)).toBe(0);
    expect(minutesAvantPublication(undefined, 25, MAINTENANT)).toBe(0);
  });

  it("publication récente : il reste le complément à 25 min", () => {
    expect(minutesAvantPublication(ilYA(0), 25, MAINTENANT)).toBe(25);
    expect(minutesAvantPublication(ilYA(10), 25, MAINTENANT)).toBe(15);
    expect(minutesAvantPublication(ilYA(24), 25, MAINTENANT)).toBe(1);
  });

  it("délai écoulé : publication autorisée", () => {
    expect(minutesAvantPublication(ilYA(25), 25, MAINTENANT)).toBe(0);
    expect(minutesAvantPublication(ilYA(400), 25, MAINTENANT)).toBe(0);
  });

  it("arrondit au SUPÉRIEUR : jamais 0 tant que le serveur refuse", () => {
    // 30 secondes restantes : le trigger refuse encore, l'interface doit le dire.
    const presque = new Date(MAINTENANT.getTime() - 24.5 * 60_000).toISOString();
    expect(minutesAvantPublication(presque, 25, MAINTENANT)).toBe(1);
  });

  it("délai nul ou absurde : on ne bloque pas", () => {
    expect(minutesAvantPublication(ilYA(1), 0, MAINTENANT)).toBe(0);
    expect(minutesAvantPublication(ilYA(1), -5, MAINTENANT)).toBe(0);
    expect(minutesAvantPublication(ilYA(1), Number.NaN, MAINTENANT)).toBe(0);
  });

  it("date illisible : on laisse le serveur trancher plutôt qu'inventer un blocage", () => {
    expect(minutesAvantPublication("pas une date", 25, MAINTENANT)).toBe(0);
  });

  it("accepte un Date comme une chaîne", () => {
    const d = new Date(MAINTENANT.getTime() - 5 * 60_000);
    expect(minutesAvantPublication(d, 25, MAINTENANT)).toBe(20);
  });

  it("le défaut est aligné sur le réglage serveur", () => {
    expect(DELAI_PUBLICATION_MIN_DEFAUT).toBe(25);
    expect(minutesAvantPublication(ilYA(10), undefined, MAINTENANT)).toBe(15);
  });
});

describe("minutesDepuisErreurPublication", () => {
  it("lit les minutes dans un PostgrestError, qui n'est PAS une Error", () => {
    const postgrest = {
      message: "DELAI_ENTRE_PUBLICATIONS:15 attends encore 15 min (minimum 25 min)",
      details: null,
      hint: null,
      code: "23514",
    };
    expect(postgrest instanceof Error).toBe(false);
    expect(minutesDepuisErreurPublication(postgrest)).toBe(15);
  });

  it("lit aussi une vraie Error et une chaîne", () => {
    expect(minutesDepuisErreurPublication(new Error("DELAI_ENTRE_PUBLICATIONS:3 ..."))).toBe(3);
    expect(minutesDepuisErreurPublication("DELAI_ENTRE_PUBLICATIONS:1")).toBe(1);
  });

  it("renvoie null pour toute autre erreur", () => {
    expect(minutesDepuisErreurPublication({ message: "publie_url obligatoire" })).toBeNull();
    expect(minutesDepuisErreurPublication(new Error("réseau"))).toBeNull();
    expect(minutesDepuisErreurPublication(null)).toBeNull();
    expect(minutesDepuisErreurPublication(undefined)).toBeNull();
    expect(minutesDepuisErreurPublication(42)).toBeNull();
  });
});
