-- 0486 — Israël en zone A (14 $) pour les nouvelles offres ; nouvelle répartition HM ↔ pays.
--
-- 1. D'abord, le tarif de chaque posteur actif d'Israël est figé à ce qu'il est
--    payé aujourd'hui (contrats_tarifs.force_tarif, seulement s'il n'est pas déjà
--    figé) : aucun posteur israélien existant ne passe à 14 $ par erreur.
-- 2. Israël passe de la zone B à la zone A (zones_paie_pays) : les nouvelles
--    recrues d'Israël sont payées 14 $.
-- 3. Les pays de recrutement des HM (profiles.zone_recrutement), pour les
--    nouvelles recrues ; les posteurs existants gardent leur HM (manager_id
--    n'est pas touché). Les langues des pays sont ajoutées aux langues de la HM
--    (rien n'est retiré) pour que le routage du site les ouvre.
--      A : Rana (US, UK, NL), Regina (DE, NO, SE, FI, DK), Sara (FR, BE, JP), Amanda (IL)
--      B : Olizhia (CZ, SK, EE, LT, LV), Margherita (GR, IT, HR, SI, ES), Nana (HU, PL, AE)
--      C : Kris (RO, KZ, BG, TR, RS)
--    Lucia n'a plus de pays attribués.
--
-- Aucune ligne supprimée.

do $m$
declare
  n_figes int;
begin
  -- 1. Les tarifs israéliens d'aujourd'hui, figés.
  with il as (
    select pr.upwork_contract_id as contrat,
           coalesce(public.paie_tarif_contrat(pr.id), pr.tarif_hebdo, public.paie_tarif_zone(pr.id)) as tarif
      from public.profiles pr
     where pr.is_active and pr.upwork_contract_id is not null
       and public.paie_pays_posteur(pr.id) = 'IL'
  ),
  ins as (
    insert into public.contrats_tarifs (contrat_id, rythme, raison, force_tarif, force_at)
    select il.contrat, 'a_verifier', 'figé avant Israël zone A (1/11)', il.tarif, now()
      from il where il.tarif is not null
    on conflict (contrat_id) do update
      set force_tarif = excluded.force_tarif, force_at = now(),
          raison = coalesce(contrats_tarifs.raison || ' · ', '') || 'figé avant Israël zone A (1/11)'
      where contrats_tarifs.force_tarif is null
    returning 1
  )
  select count(*) into n_figes from ins;
  raise notice '0486 : % contrats israéliens figés', n_figes;

  if exists (
    select 1 from public.profiles pr
     where pr.is_active and public.paie_pays_posteur(pr.id) = 'IL'
       and (pr.upwork_contract_id is null
            or not exists (select 1 from public.contrats_tarifs ct where ct.contrat_id = pr.upwork_contract_id and ct.force_tarif is not null))
  ) then
    raise exception '0486 : un posteur israélien actif n''a pas de tarif figé (rien n''est changé)';
  end if;

  -- 2. Israël en zone A.
  update public.zones_paie_pays set zone = 'A' where pays = 'IL' and zone <> 'A';
  insert into public.zones_paie_pays (pays, zone) select 'IL', 'A'
   where not exists (select 1 from public.zones_paie_pays where pays = 'IL');

  -- 3. Les pays des HM (nouvelles recrues seulement).
  update public.profiles p
     set zone_recrutement = v.zone,
         langues = (select array_agg(distinct l order by l) from unnest(coalesce(p.langues, '{}') || v.langues) l)
    from (values
      ('9b05fd3b-1124-4c09-ad39-d96fcc9e63ba'::uuid, 'US + UK + Netherlands', array['en', 'nl']),
      ('77aef269-2432-4df7-be5b-84666b556f74'::uuid, 'Germany + Norway + Sweden + Finland + Denmark', array['de', 'no', 'sv', 'fi', 'da']),
      ('7b82f9c4-833a-434e-9b40-8cc4a7ab6577'::uuid, 'France + Belgium + Japan', array['fr', 'ja']),
      ('b1c280eb-02aa-4475-9c80-cbaa9c723654'::uuid, 'Israel', array['he']),
      ('e47ae922-d8c9-4b62-902d-8d6fd6e99d9f'::uuid, 'Czechia + Slovakia + Estonia + Lithuania + Latvia', array['cs', 'sk', 'et', 'lt', 'lv']),
      ('feadcf40-e449-4717-884f-5099ce31f772'::uuid, 'Greece + Italy + Croatia + Slovenia + Spain', array['el', 'it', 'hr', 'sl', 'es']),
      ('1b9c219e-9e62-47df-9f4d-e2b1fb9a5cc2'::uuid, 'Hungary + Poland + UAE', array['hu', 'pl', 'ar']),
      ('bcde6389-cfdb-4c23-a37e-d7f4f7b71343'::uuid, 'Romania + Kazakhstan + Bulgaria + Turkey + Serbia', array['ro', 'ru', 'bg', 'tr', 'sr'])
    ) as v(id, zone, langues)
   where p.id = v.id;

  -- Lucia : plus de pays attribués.
  update public.profiles set zone_recrutement = null where id = '7036791d-e2dd-4637-913c-247afc65d1b3';
end;
$m$;
