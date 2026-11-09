-- 0582 : les HM des pays ouverts sans HM (demande de Max, 9/11 : « affecte par
-- zone, logiquement »). Nouvelles recrues seulement : les posteurs actuels
-- gardent leur HM (manager_id n'est pas touché).
--   Amérique latine hispanophone (MX, CO, BO, EC, VE) → Margherita (Espagne,
--   parle espagnol) ; sa langue es-419 est ajoutée.
--   Liban et Arabie saoudite (LB, SA) → Nana (Émirats, parle arabe).
-- BG, RS, TR restent à Erla Menaj (0516).
-- Additif : zones et langues mises à jour (rien n'est retiré), lignes hm_pays
-- ajoutées (aucune ligne supprimée).

update public.profiles
   set zone_recrutement = 'Greece+Italy+Croatia+Slovenia+Spain+Mexico+Colombia+Bolivia+Ecuador+Venezuela',
       langues = (select array_agg(distinct l order by l) from unnest(coalesce(langues, '{}') || array['es', 'es-419']) l)
 where id = 'feadcf40-e449-4717-884f-5099ce31f772';

update public.profiles
   set zone_recrutement = 'Hungary + Poland + UAE + Saudi Arabia + Lebanon',
       langues = (select array_agg(distinct l order by l) from unnest(coalesce(langues, '{}') || array['ar']) l)
 where id = '1b9c219e-9e62-47df-9f4d-e2b1fb9a5cc2';

insert into public.hm_pays (pays, hm_id, hm_nom, zone, depuis)
select v.pays, p.id, trim(p.prenom || ' ' || coalesce(p.nom, '')), z.zone, current_date
  from (values
    ('MX', 'feadcf40-e449-4717-884f-5099ce31f772'::uuid), ('CO', 'feadcf40-e449-4717-884f-5099ce31f772'::uuid),
    ('BO', 'feadcf40-e449-4717-884f-5099ce31f772'::uuid), ('EC', 'feadcf40-e449-4717-884f-5099ce31f772'::uuid),
    ('VE', 'feadcf40-e449-4717-884f-5099ce31f772'::uuid),
    ('LB', '1b9c219e-9e62-47df-9f4d-e2b1fb9a5cc2'::uuid), ('SA', '1b9c219e-9e62-47df-9f4d-e2b1fb9a5cc2'::uuid)
  ) v(pays, hm)
  join public.profiles p on p.id = v.hm
  join public.zones_paie_pays z on z.pays = v.pays and z.retire_at is null
on conflict (pays) do update set hm_id = excluded.hm_id, hm_nom = excluded.hm_nom, zone = excluded.zone, maj_at = now()
 where public.hm_pays.hm_id is null;
