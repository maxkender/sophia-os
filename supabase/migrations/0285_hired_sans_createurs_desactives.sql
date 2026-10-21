-- 0285 : Hired ne compte plus les comptes des créateurs DÉSACTIVÉS.
--
-- Demande d'Aram du 14/10/2026. Le 13/10, la règle était « tout ce qui doit
-- partir est supprimé, donc on compte tout » : elle tenait parce qu'un
-- recruteur n'avait qu'un bouton Delete. Désormais un recruteur désactive (le
-- créateur ET ses comptes, cf. manage-users `activer`) et seuls l'admin et le
-- Head of Ops suppriment. Un créateur désactivé n'est plus recruté : ses comptes
-- sortent de Hired.
--
-- Le reste de 0282 ne change pas : warm-ups et dormants d'un créateur ACTIF
-- comptent toujours, compte marque (cm) et comptes sans pays restent exclus.
--
-- Retour arrière : réappliquer la vue de 0282 (sans la jointure `profiles`).

create or replace view public.hired_pays_application
with (security_invoker = true) as
select
  c.pays,
  case
    when c.parts_applications is null then 'sophia'
    when (
      select count(*) from jsonb_each(c.parts_applications) e
      where (e.value)::numeric > 0
    ) = 1 then (
      select e.key from jsonb_each(c.parts_applications) e
      where (e.value)::numeric > 0 limit 1
    )
    else null  -- compte partagé entre applications : le job doit s'arrêter
  end as application,
  count(*)::int as hired
from public.comptes c
join public.profiles p on p.id = c.poster_id
where coalesce(c.type_compte, '') <> 'cm'
  and c.pays is not null
  and p.is_active
group by 1, 2;

comment on view public.hired_pays_application is
  'Comptes TikTok par (pays × application) pour la colonne Hired de Notion. Warm-ups et dormants INCLUS, comptes des créateurs désactivés EXCLUS (0285), compte marque (cm) et comptes sans pays exclus. application NULL = compte partagé entre apps : anomalie, le job s''arrête.';
