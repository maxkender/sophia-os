-- 0678 : plus rien à relier à la main (Max, 12/11).
-- La règle « HM inconnue » vit dans la fonction upwork (HM qui couvre le pays ou la langue,
-- la moins chargée). Ici :
-- 1. accueil_ecarter(contrat, raison) : « Ne pas créer » pour un contrat d'un pays fermé
--    (le contrat sort de la liste, rien n'est créé ni envoyé ; la ligne reste, statut doublon).
-- 2. os_aujourdhui() : + contrats_a_relier (seulement pays introuvable ou fermé, équipe VIk).
-- 3. L'Indonésie fermée au recrutement (avec le Portugal), dans la liste et dans la règle
--    « Pays fermés » du support.
-- Additif : une fonction, une fonction réécrite, deux lignes de réglage modifiées (OK de Max).

create or replace function public.accueil_ecarter(p_contrat text, p_raison text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'accueil_ecarter : réservé à l''admin et au Head of Ops' using errcode = '42501';
  end if;
  update public.accueils
     set statut = 'doublon', raison = 'écarté : ' || coalesce(nullif(btrim(p_raison), ''), 'pas créé'),
         relie_par = auth.uid(), relie_at = now(), updated_at = now()
   where contrat_id = p_contrat and statut = 'a_relier';
  if not found then raise exception 'accueil_ecarter : contrat introuvable ou déjà traité'; end if;
end;
$$;
revoke execute on function public.accueil_ecarter(text, text) from public, anon;
grant execute on function public.accueil_ecarter(text, text) to authenticated;

create or replace function public.os_aujourdhui()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'pour_max', (select count(*) from public.support_demandes where niveau = 'max' and statut in ('ouvert', 'attente_posteur')),
    'pour_adrien', (select count(*) from public.support_demandes where coalesce(niveau, 'adrien') = 'adrien'
                      and escalade_at is not null and statut in ('ouvert', 'attente_posteur')),
    'ruul_a_inviter', (select count(*) from public.profiles where canal_paie = 'ruul' and is_active and ruul_statut = 'a_ajouter'),
    -- 12/11 : seulement ce que la règle ne peut pas trancher (pays introuvable ou fermé).
    'contrats_a_relier', (select count(*) from public.accueils a
                           left join public.upwork_contrats u on u.contrat_id::text = a.contrat_id
                          where a.statut = 'a_relier' and a.classement is null
                            and coalesce(btrim(u.organisation_nom), 'VIk Studios') ilike 'vik studios'))
  where public.is_admin();
$$;
revoke execute on function public.os_aujourdhui() from public, anon;
grant execute on function public.os_aujourdhui() to authenticated;

update public.parrainage_pays set recrutement_ouvert = false where pays = 'ID' and recrutement_ouvert;

insert into public.support_infos_historique (cle, avant, apres, par)
select cle, valeur, 'Portugal (PT) and Indonesia (ID) are closed: no new posters.', null
  from public.support_infos where cle = 'pays_fermes' and valeur <> 'Portugal (PT) and Indonesia (ID) are closed: no new posters.';
update public.support_infos
   set valeur = 'Portugal (PT) and Indonesia (ID) are closed: no new posters.', maj_at = now()
 where cle = 'pays_fermes';
