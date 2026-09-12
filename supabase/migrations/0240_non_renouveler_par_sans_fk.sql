-- ---------------------------------------------------------------------------
-- Retire la seconde clé étrangère de `comptes` vers `profiles`.
--
-- Pour les environnements où 0238 est passée AVANT ce correctif (dont la prod).
-- Sur un environnement neuf, 0238 ne crée déjà plus la contrainte et cette
-- migration ne fait rien.
--
-- Le bug : 0238 ajoutait `non_renouveler_par references profiles(id)` alors que
-- `comptes.poster_id` pointait déjà vers `profiles`. Deux chemins de jointure →
-- PostgREST ne sait plus lequel choisir et renvoie 300 Multiple Choices sur
-- TOUTE requête qui embarque `profiles(...)` depuis `comptes` :
--
--   GET /rest/v1/comptes?select=*,profiles(prenom,nom,upwork_url),… → 300
--
-- Côté UI : « 0 account(s) » sur chaque créateur de la page Posters, alors que
-- les comptes étaient bien en base. Les requêtes sans cet embed passaient, ce
-- qui rendait la panne partielle et trompeuse.
--
-- La colonne reste (trace de qui a proposé le non-renouvellement) mais sans
-- contrainte : cette provenance ne vaut pas de casser toutes les jointures
-- `profiles` du produit. `compte_nudges` et `compte_classement_historique` ne
-- sont pas concernées — un seul chemin vers `profiles` chacune.
--
-- Règle à retenir : avant d'ajouter une FK vers une table déjà référencée,
-- vérifier qu'aucun embed PostgREST ne devient ambigu.
-- ---------------------------------------------------------------------------
alter table public.comptes
  drop constraint if exists comptes_non_renouveler_par_fkey;

comment on column public.comptes.non_renouveler_par is
  'Qui a proposé le non-renouvellement. Volontairement SANS clé étrangère vers profiles : une seconde FK rendrait les embeds PostgREST `comptes → profiles` ambigus (300 Multiple Choices).';
