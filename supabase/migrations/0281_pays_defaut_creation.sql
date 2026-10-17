-- 0281 : le pays d'un compte se remplit tout seul à la création.
--
-- LE DÉFAUT CORRIGÉ. `comptes.pays` est arrivé avec 0278, mais AUCUN des six
-- chemins de création ne le renseignait : ni `preparerCompte` ni
-- `creerCompteCmPourPoster` (supabase/functions/manage-users/index.ts), ni
-- `creerCompte` ni `creerCompteUgcVideo` (src/features/moteur/api.ts), ni le
-- type d'entrée du front, qui ne porte même pas le champ. Pas de DEFAULT en
-- base, pas de trigger. La fonction `paysParDefaut()` de
-- src/features/moteur/pays.ts existait, était testée, et n'était appelée nulle
-- part : du code mort.
--
-- Conséquence observée le jour même : deux comptes créés après 0278 sont
-- ressortis sans pays (wilma.bocker328 à 15:53, adam.discipline949 à 19:47).
-- Un compte sans pays n'est compté dans AUCUNE ligne de la table Notion
-- « Recruitment Targets » : il disparaît du compteur « Hired » sans rien dire.
-- C'est le seul défaut capable de rendre ce tableau faux en silence.
--
-- POURQUOI UN TRIGGER ET PAS SIX CORRECTIFS. Un DEFAULT de colonne ne peut pas
-- lire une autre colonne de la ligne. Corriger les six chemins un par un aurait
-- laissé passer le septième. Le trigger prend l'insertion, d'où qu'elle vienne,
-- y compris les inserts PostgREST directs du front.
--
-- IL PROPOSE, IL N'ÉCRASE JAMAIS. Il ne s'applique qu'à l'INSERT et uniquement
-- si `pays` est NULL. Une valeur explicite, même fausse, est respectée : c'est
-- le HM qui tranche, via PaysCompteSelect dans la page Posters.
--
-- LES QUATRE LANGUES VOLONTAIREMENT ABSENTES de la table. Un défaut faux est
-- pire qu'un champ vide, parce que personne ne vient le vérifier.
--   • `en`      : Royaume-Uni, États-Unis, Australie, Nouvelle-Zélande, Irlande,
--                 Canada. Six marchés, et nous recrutons sur les six.
--   • `ar`      : Émirats et Égypte.
--   • `es-419`  : toute l'Amérique latine.
--   • `ru`      : la ligne Notion s'appelle « Russian-Speaking (not russia) » et
--                 couvre KZ, UA et BY. Mettre RU par défaut rangerait un nouveau
--                 compte dans un pays qui n'a AUCUNE ligne dans la table, donc
--                 hors de tout décompte. Nos deux comptes russophones actuels
--                 sont d'ailleurs kazakhs (corrigés en KZ par 0280).
--                 Note : 0278 et `PAYS_PAR_DEFAUT_LANGUE` mappaient encore
--                 ru -> RU ; src/features/moteur/pays.ts est aligné sur ce
--                 fichier dans le même lot.
--
-- Jumeau côté front : PAYS_PAR_DEFAUT_LANGUE dans src/features/moteur/pays.ts.
-- Les deux doivent rester synchronisés, comme LANGUES_CIBLES l'est déjà entre
-- le front et le runtime Deno.
--
-- Retour arrière : `drop trigger comptes_pays_defaut on public.comptes;`
-- Les lignes déjà créées gardent leur pays, rien n'est perdu.
--
-- APPLIQUÉE EN DEUX TEMPS le 13/10/2026, enregistrée sous `0281a_fonction_
-- pays_defaut` puis `0281b_trigger_pays_defaut` : l'outil `execute_sql` du MCP
-- Supabase reste bloqué sur un `drop` comme sur un `delete` (même un DELETE ne
-- touchant aucune ligne part en timeout à 60 s). Le `drop trigger if exists`
-- ci-dessous est conservé parce que c'est le bon SQL pour rejouer le fichier
-- par un autre chemin ; par le MCP, il faut le retirer.
--
-- Vérifié après pose, par une insertion annulée par exception :
--   sv=SE  pt-BR=BR  bg=BG  en=NULL  ru=NULL  ar=NULL  es-419=NULL

create or replace function public.comptes_pays_defaut()
returns trigger
language plpgsql
as $$
begin
  if new.pays is null and new.langue is not null then
    new.pays := case new.langue
      when 'fr'    then 'FR'
      when 'de'    then 'DE'
      when 'it'    then 'IT'
      when 'es'    then 'ES'
      when 'pt'    then 'PT'
      when 'pt-BR' then 'BR'
      when 'cs'    then 'CZ'
      when 'nl'    then 'NL'
      when 'el'    then 'GR'
      when 'hu'    then 'HU'
      when 'pl'    then 'PL'
      when 'ro'    then 'RO'
      when 'sv'    then 'SE'
      when 'tr'    then 'TR'
      when 'da'    then 'DK'
      when 'no'    then 'NO'
      when 'hr'    then 'HR'
      when 'sl'    then 'SI'
      when 'sk'    then 'SK'
      when 'sr'    then 'RS'
      when 'he'    then 'IL'
      when 'fi'    then 'FI'
      when 'et'    then 'EE'
      when 'bg'    then 'BG'
      else null  -- en, ar, es-419, ru : au HM de trancher
    end;
  end if;
  return new;
end;
$$;

comment on function public.comptes_pays_defaut() is
  'Remplit comptes.pays depuis la langue à la création, là où la langue ne désigne qu''un marché. Ne s''applique jamais à un pays déjà renseigné. en/ar/es-419/ru restent NULL : plusieurs marchés possibles, c''est au HM de choisir.';

drop trigger if exists comptes_pays_defaut on public.comptes;
create trigger comptes_pays_defaut
  before insert on public.comptes
  for each row
  execute function public.comptes_pays_defaut();
