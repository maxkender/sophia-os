-- 0794 : la place libre d'un podz passe avant tout au choix de label, et un
-- label fermé se réaffecte tout de suite dans le même thème (décisions d'Adrien
-- du 20/11).
--
-- 1. PRIORITÉ ABSOLUE AUX PLACES LIBRES. Une langue OUVERTE par un podz actif
--    (`pods.langues`) où son label n'a aucun compte reçoit le prochain compte de
--    cette langue, tout le temps : pendant le test du podz (même au-delà de ses
--    comptes de test) et après. Avant, seul le « démarrage » (0716) donnait
--    cette priorité, pour les 3 ou 4 premiers comptes ; ensuite le podz
--    retombait dans le classement général.
--    La règle vit dans `_shared/choix_label_equilibre.ts` (`placeLibrePod`).
--    Cette migration lui donne ce qu'il lui manquait : savoir qu'un podz ACTIF
--    a ouvert la langue. `livre_langue` (0352, 0654) ne suffit pas : il est
--    vrai partout pour un label 100 % podz en texte + banque, et pour un podz
--    en pause (Plony : 0 compte, sert Sophia ; il aurait pris toutes les
--    recrues de toutes les langues).
--    Restent écartés : un label fermé, et un podz qui n'a encore livré aucun
--    contenu (il n'aurait rien à poster).
--
-- 2. FERMER UN LABEL = RÉAFFECTER TOUT DE SUITE, DANS LE MÊME THÈME. Rien en
--    base : `_shared/fermeture_labels.ts` (option `labels`, `paliersTheme`) et
--    la page Allocation. Chaque déplacement passe par `compte_deplacer` (0782),
--    donc par le journal `comptes_deplacements`.
--
-- Additive : une fonction de lecture. Sans elle, le moteur ne voit aucune
-- place libre et choisit comme avant (`labelsLangueOuverte` ne lève jamais).
-- Retour arrière : `drop function public.podz_labels_langue_ouverte(text)`.

set lock_timeout = '5s';

create or replace function public.podz_labels_langue_ouverte(p_langue text)
returns table (label_id uuid)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select distinct p.label_id
    from pods p
   where p.actif
     and p.label_id is not null
     and p.langues is not null
     and nullif(btrim(coalesce(p_langue, '')), '') is not null
     -- La langue du compte, ou sa langue de base (« es » sert « es-419 »), comme `pod_langues` (0654).
     and exists (select 1 from unnest(p.langues) x
                  where lower(x) in (lower(btrim(p_langue)), split_part(lower(btrim(p_langue)), '-', 1)));
$function$;

revoke all on function public.podz_labels_langue_ouverte(text) from public, anon;
grant execute on function public.podz_labels_langue_ouverte(text) to authenticated, service_role;

comment on function public.podz_labels_langue_ouverte(text) is
  'Les labels dont un podz ACTIF a ouvert cette langue (0794), langue de base comprise. Lue par le choix de label : une langue ouverte sans compte du label passe avant tout.';
