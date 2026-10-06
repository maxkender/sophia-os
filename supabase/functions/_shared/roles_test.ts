/**
 * Qui peut créer quoi, et sous qui le nouveau recruteur atterrit.
 *
 * Ces trois fonctions sont la frontière réelle : l'interface peut cacher une
 * carte, elle n'accorde rien. Ce qui est vérifié ici est donc ce qui tient.
 */
import { assertEquals } from "jsr:@std/assert@1";

import { estRoleManager, rattachementNouvelHm, roleACreer } from "./roles.ts";

Deno.test("estRoleManager couvre les trois rôles de l'espace recrutement", () => {
  for (const r of ["hiring_manager", "directing_manager", "head_of_ops"]) {
    assertEquals(estRoleManager(r), true, r);
  }
  for (const r of ["admin", "poster", "", null, undefined, "HIRING_MANAGER"]) {
    assertEquals(estRoleManager(r), false, String(r));
  }
});

Deno.test("un recruteur peut créer un recruteur, comme l'admin", () => {
  for (const createur of ["admin", "hiring_manager", "directing_manager", "head_of_ops"]) {
    assertEquals(roleACreer("hiring_manager", createur), "hiring_manager", createur);
  }
});

Deno.test("PLAFOND : aucun chemin ne fabrique mieux qu'un hiring_manager", () => {
  // Un recruteur qui demanderait un rôle plus élevé obtient un créateur.
  for (const demande of ["admin", "directing_manager", "head_of_ops", "poster", "", null, 42]) {
    for (const createur of ["admin", "hiring_manager", "directing_manager", "head_of_ops"]) {
      assertEquals(
        roleACreer(demande, createur),
        "poster",
        `${createur} demandant ${String(demande)}`,
      );
    }
  }
});

Deno.test("un créateur ne crée pas de recruteur", () => {
  // `poster` n'atteint pas manage-users (assertRole le refuse), mais la
  // fonction doit rester juste seule : une garde ne s'appuie pas sur l'autre.
  assertEquals(roleACreer("hiring_manager", "poster"), "poster");
  assertEquals(roleACreer("hiring_manager", "inconnu"), "poster");
});

Deno.test("le HM qui crée un HM le rattache à SON DM, pas à lui-même", () => {
  // Le piège : rattacher le nouveau au créateur formerait une chaîne HM -> HM,
  // que `equipesParDm` et `hmsSansDm` ne savent pas lire (ils ne regardent que
  // DM -> HM). Le nouveau recruteur serait invisible de la page Posters, et
  // ses créateurs avec lui.
  assertEquals(rattachementNouvelHm("hiring_manager", "hm-1", "dm-9"), "dm-9");
  assertEquals(rattachementNouvelHm("head_of_ops", "ho-1", "dm-9"), "dm-9");
});

Deno.test("un recruteur sans DM en crée un sans DM, comme l'admin", () => {
  assertEquals(rattachementNouvelHm("hiring_manager", "hm-1", null), null);
  assertEquals(rattachementNouvelHm("head_of_ops", "ho-1", null), null);
});

Deno.test("le DM se rattache ses recruteurs, l'admin ne rattache rien", () => {
  assertEquals(rattachementNouvelHm("directing_manager", "dm-1", null), "dm-1");
  assertEquals(rattachementNouvelHm("directing_manager", "dm-1", "autre-dm"), "dm-1");
  // `undefined` = ne pas écrire le champ, pour ne pas écraser un rattachement.
  assertEquals(rattachementNouvelHm("admin", "admin-1", null), undefined);
});

Deno.test("le cron ne rattache à personne", () => {
  for (const r of ["admin", "hiring_manager", "directing_manager", "head_of_ops"]) {
    assertEquals(rattachementNouvelHm(r, "cron", "dm-9"), undefined, r);
  }
});
