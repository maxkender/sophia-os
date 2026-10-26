-- 0360 : le dashboard de cohorte de la HM (sa page d'accueil, /manager/accueil).
--
-- `ckd_cohorte` (0356) était réservée à l'admin. La HM lit maintenant les mêmes
-- données, limitées à SES posteurs (profiles.manager_id = elle). Admin et Head
-- of Ops (is_admin) : inchangé, tout. Le corps est celui de 0356 à l'identique,
-- seuls le contrôle d'accès et le filtre final changent. La cohorte RUUL
-- (hub_posteurs) restait déjà hors de `ckd_cohorte_comptes`.
--
-- Additive : une fonction réécrite, même signature, même résultat pour l'admin.
-- Retour arrière : réappliquer la fonction de 0356.

create or replace function public.ckd_cohorte(p_lundi date)
returns table (
  compte_id       uuid,
  poster_id       uuid,
  hm_id           uuid,
  handle          text,
  pays            text,
  langue          text,
  application     text,
  is_active       boolean,
  cree_le         timestamptz,
  warmup_lance_le timestamptz,
  warmup_fin      timestamptz,
  premier_jour    date,
  glisse_de       date,
  seuil_mort      numeric,
  seuil_bon       numeric,
  posts           jsonb,
  releves         jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_hm uuid;
begin
  -- Admin (et Head of Ops, via is_admin) : tout. HM / DM : ses posteurs.
  if coalesce(auth.role(), '') in ('anon', 'authenticated') and not public.is_admin() then
    if not public.is_hiring_manager() then
      raise exception 'ckd_cohorte : réservé à l''admin et aux HMs';
    end if;
    v_hm := auth.uid();
  end if;
  if extract(isodow from p_lundi) <> 1 then
    raise exception 'ckd_cohorte : % n''est pas un lundi', p_lundi;
  end if;

  return query
  select m.compte_id, c.poster_id, pr.manager_id, c.handle_tiktok, c.pays, c.langue,
         public.application_principale(c.parts_applications),
         c.is_active, c.created_at, c.warmup_started_at, c.warmup_ends_at, pj.premier_jour,
         case when m.lundi > m.attendu then m.attendu end,
         s.seuil_mort, s.seuil_bon,
         -- Les posts du lundi au vendredi, mesurés comme Check, Kill or Double (0326).
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'jour', x.date_publication_prevue,
                    'vues', x.vues,
                    'url', x.publie_url,
                    'mesure', (x.publie_url is not null and x.vues is not null and x.stats_maj_at is not null
                               and x.stats_maj_at - coalesce(x.tiktok_publie_at, x.publie_at)
                                   >= s.age_min::double precision * interval '1 hour'))
                  order by x.date_publication_prevue, x.created_at)
             from public.passages x
            where x.compte_id = m.compte_id
              and not coalesce(x.est_rappel, false)
              and x.statut <> 'brouillon'
              and x.date_publication_prevue between p_lundi and p_lundi + 4), '[]'::jsonb),
         -- Les relevés de la semaine de warm-up (et du lundi matin).
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'at', r.releve_at,
                    'existe', r.existe,
                    'cree_tiktok_at', r.cree_tiktok_at,
                    'abonnements', r.abonnements,
                    'likes', r.likes,
                    'abonnes', r.abonnes,
                    'videos', r.videos)
                  order by r.releve_at)
             from public.ckd_warmup_releves r
            where r.compte_id = m.compte_id
              and r.releve_at >= ((p_lundi - 7)::timestamp at time zone 'Europe/Paris')
              and r.releve_at < ((p_lundi + 1)::timestamp at time zone 'Europe/Paris')), '[]'::jsonb)
    from public.ckd_cohorte_comptes(p_lundi) m
    join public.comptes c on c.id = m.compte_id
    join public.profiles pr on pr.id = c.poster_id
    left join public.comptes_premier_jour pj on pj.compte_id = m.compte_id
    -- Les seuils du compte, par pays et label comme `ckd_calculer` (0326) ; le
    -- bon post retombe sur celui des comment masters du pays.
    cross join lateral (
      select (select cl.label_id from public.compte_labels cl
                where cl.compte_id = c.id order by cl.label_id limit 1) as label_id
    ) l
    cross join lateral (
      select coalesce((select (r.valeur #>> '{}')::numeric
                         from public.ckd_reglage('age_min_heures', c.pays, l.label_id) r), 10) as age_min,
             coalesce((select (r.valeur #>> '{}')::numeric
                         from public.ckd_reglage('seuil_mort', c.pays, l.label_id) r), 50) as seuil_mort,
             coalesce((select (r.valeur #>> '{}')::numeric
                         from public.ckd_reglage('seuil_bon_post', c.pays, l.label_id) r),
                      (select cm.seuil_vues from public.comment_master_pays cm
                        where cm.pays = c.pays order by (cm.langue = c.langue) desc limit 1),
                      5000) as seuil_bon
    ) s
   where v_hm is null or pr.manager_id = v_hm;
end;
$$;
