/**
 * Localisation scolaire : la ligne du pays quand la langue n'a qu'un pays,
 * des mots neutres sinon. Sans réseau.
 */
import { assert, assertEquals } from "jsr:@std/assert@1";

import { blocLocalisationScolaire, lireLocalisationScolaire } from "./localisation_scolaire.ts";

const PROMPT = [
  "# LOCALISATION SCOLAIRE",
  "Remplace les notes et examens d'un autre pays.",
  "",
  "TR : notes sur 100 · YKS, LGS · ₺",
  "DE : notes de 1 à 6 · Abitur · €",
  "AR : notes de 1 à 10 · pesos",
  "CL : notes de 1,0 à 7,0 · pesos",
].join("\n");

Deno.test("lit la règle et une ligne par pays", () => {
  const { regle, parPays } = lireLocalisationScolaire(PROMPT);
  assertEquals(regle, "# LOCALISATION SCOLAIRE\nRemplace les notes et examens d'un autre pays.");
  assertEquals([...parPays.keys()], ["TR", "DE", "AR", "CL"]);
  assertEquals(parPays.get("TR"), "notes sur 100 · YKS, LGS · ₺");
});

Deno.test("un seul pays : sa ligne", () => {
  const bloc = blocLocalisationScolaire(PROMPT, ["TR", "tr "])!;
  assert(bloc.startsWith("# LOCALISATION SCOLAIRE"));
  assert(bloc.endsWith("SYSTÈME SCOLAIRE CIBLE : TR · notes sur 100 · YKS, LGS · ₺"));
});

Deno.test("plusieurs pays (es-419) : mots neutres, les pays nommés", () => {
  const bloc = blocLocalisationScolaire(PROMPT, ["CL", "AR"])!;
  assert(bloc.includes("plusieurs pays : AR, CL"));
  assert(bloc.includes("Ne cite aucun barème chiffré"));
  assert(!bloc.includes("1,0 à 7,0"));
});

Deno.test("pays sans ligne, ou aucun compte : mots neutres", () => {
  assert(blocLocalisationScolaire(PROMPT, ["AT"])!.includes("aucun en particulier."));
  assert(blocLocalisationScolaire(PROMPT, [])!.includes("Ne cite aucun barème chiffré"));
});

Deno.test("pas de prompt : rien d'ajouté, traduction d'avant", () => {
  assertEquals(blocLocalisationScolaire(null, ["TR"]), null);
  assertEquals(blocLocalisationScolaire("   ", ["TR"]), null);
});
