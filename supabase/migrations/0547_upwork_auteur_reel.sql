-- 0547 : un message écrit par une HM, par Max ou par l'OS n'est jamais un
-- « message sans réponse » du posteur.
--
-- Constat (6/11, carte de Swan) : quand le posteur accepte une modification de
-- milestone, Upwork remet dans la conversation la note de la HM (« jai juste
-- changer le nom de la milestone… ») AU NOM DU POSTEUR. La carte affichait donc
-- le message de Sara B comme celui de Swan, en attente de réponse. 8 posteurs
-- touchés (9 messages), tous des copies d'un message de HM.
--
-- L'auteur réel, avec auteur_upwork_id :
--   1. un message « posteur » dont l'auteur n'est pas le freelancer du contrat
--      (upwork_contrats.freelancer_id) est celui d'une HM, de Max ou de l'OS
--      (upwork_message_role, comme pour les autres) ;
--   2. un message « posteur » qui reprend mot pour mot un message d'un autre
--      auteur de la même conversation (7 jours avant) est la copie de ce
--      message : il prend l'auteur de l'original.
-- Un trigger le fait à chaque message gardé (et pour une copie arrivée avant
-- son original) ; role_lu garde le rôle d'avant la correction.
--
-- Additif : une colonne, des fonctions, deux triggers ; le rôle de 9 messages
-- corrigé (l'ancien gardé dans role_lu). Aucune ligne supprimée.

alter table public.upwork_messages add column if not exists role_lu text;

create or replace function public.upwork_messages_auteur_reel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_freelancer text;
  v_role text;
begin
  if new.role is distinct from 'posteur' then return new; end if;
  select c.freelancer_id into v_freelancer from public.upwork_contrats c where c.contrat_id = new.contrat_id;
  -- 1. Pas le freelancer du contrat : une HM, Max ou l'OS.
  if new.auteur_upwork_id is not null and v_freelancer is not null and new.auteur_upwork_id <> v_freelancer then
    new.role_lu := coalesce(new.role_lu, new.role);
    new.role := public.upwork_message_role(new.contrat_id, 'hm', new.auteur_upwork_id, new.auteur_nom, new.at);
    return new;
  end if;
  -- 2. La copie d'un message d'un autre auteur (ex. la note de milestone remise au nom du posteur).
  select o.role into v_role
    from public.upwork_messages o
   where o.room_id = new.room_id and o.id <> new.id and o.role <> 'posteur'
     and o.at < new.at and o.at > new.at - interval '7 days'
     and btrim(o.texte) = btrim(new.texte)
   order by o.at desc
   limit 1;
  if v_role is not null then
    new.role_lu := coalesce(new.role_lu, new.role);
    new.role := v_role;
  end if;
  return new;
end;
$$;

-- L'original arrivé après sa copie (même lecture) : la copie prend son auteur.
create or replace function public.upwork_messages_copies_corriger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role = 'posteur' then return null; end if;
  update public.upwork_messages m
     set role = new.role, role_lu = coalesce(m.role_lu, m.role)
   where m.room_id = new.room_id and m.id <> new.id and m.role = 'posteur'
     and m.at > new.at and m.at < new.at + interval '7 days'
     and btrim(m.texte) = btrim(new.texte);
  return null;
end;
$$;

revoke execute on function public.upwork_messages_auteur_reel() from public, anon, authenticated;
revoke execute on function public.upwork_messages_copies_corriger() from public, anon, authenticated;

create or replace trigger upwork_messages_auteur_reel
  before insert or update of role, texte, auteur_upwork_id on public.upwork_messages
  for each row execute function public.upwork_messages_auteur_reel();

create or replace trigger upwork_messages_copies_corriger
  after insert on public.upwork_messages
  for each row execute function public.upwork_messages_copies_corriger();

-- Les messages déjà gardés : le trigger recalcule l'auteur des messages « posteur ».
update public.upwork_messages set role = role where role = 'posteur';
