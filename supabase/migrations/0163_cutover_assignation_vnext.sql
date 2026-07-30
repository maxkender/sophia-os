-- Cutover assignation : moteur v-next (labels ∩ + score → passages)
-- remplace le legacy recycle/remanie/nouveau pour minuit.
--
-- 1) Nouveau type de post « contenu » (pont poster, sans sémantique Recyclé)
-- 2) Active moteur_vnext
-- 3) Pause les crons assignation legacy ; schedule minuit-vnext
-- 4) posts_poster : titre depuis contenus si pas de sujet

-- ---------------------------------------------------------------------------
-- Type post pour les assignations v-next (pas recycle/remanie/nouveau)
-- ---------------------------------------------------------------------------
alter type public.post_type add value if not exists 'contenu';

-- ---------------------------------------------------------------------------
-- Flag runtime
-- ---------------------------------------------------------------------------
insert into public.reglages (cle, valeur) values
  ('moteur_vnext', '{"actif": true}'::jsonb)
on conflict (cle) do update
set valeur = jsonb_set(coalesce(public.reglages.valeur, '{}'::jsonb), '{actif}', 'true'::jsonb);

-- ---------------------------------------------------------------------------
-- Vue poster : titre du contenu si sujet absent (imports v-next purs)
-- ---------------------------------------------------------------------------
create or replace view public.posts_poster as
  select
    p.id,
    c.poster_id,
    p.compte_id,
    c.persona_nom,
    c.handle_tiktok,
    c.langue,
    p.date_publication_prevue,
    p.type,
    p.statut,
    p.musique_url,
    p.musique_titre,
    p.musique_plateforme,
    p.publie_at,
    p.publie_url,
    coalesce(s.titre, cont.titre) as sujet_titre,
    p.created_at
  from public.posts p
  join public.comptes c on c.id = p.compte_id
  left join public.sujets s on s.id = p.sujet_id
  left join public.passages pas on pas.post_id = p.id
  left join public.contenus cont on cont.id = pas.contenu_id
  where p.pipeline_statut = 'done'
    and coalesce(p.est_test, false) = false
    and (c.poster_id = auth.uid() or public.is_admin());

grant select on public.posts_poster to authenticated;

-- ---------------------------------------------------------------------------
-- Crons : pause legacy assignation ; active minuit-vnext (+ rattrapage)
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
  template text;
  cmd text;
  secret_ok boolean;
begin
  -- Pause assignation legacy (minuit + rattrapage)
  for r in
    select jobid, jobname
    from cron.job
    where jobname in ('assignation-minuit', 'assignation-rattrapage')
  loop
    perform cron.alter_job(r.jobid, active := false);
  end loop;

  -- Template avec le vrai x-cron-secret (depuis un job existant)
  select c.command into template
  from cron.job c
  where position('x-cron-secret' in c.command) > 0
    and position('mbikecieskoobeizixig.supabase.co/functions/v1/' in c.command) > 0
  order by case when c.jobname = 'preparation-nuit' then 0 else 1 end
  limit 1;

  if template is null then
    raise notice 'cutover v-next: aucun cron template avec secret — schedule manuelle minuit-vnext requise';
    return;
  end if;

  secret_ok := position('x-cron-secret' in template) > 0;

  -- Unschedule si déjà là (rejeu migration)
  for r in
    select jobname from cron.job
    where jobname in ('minuit-vnext', 'minuit-vnext-rattrapage')
  loop
    begin
      perform cron.unschedule(r.jobname);
    exception when others then
      null;
    end;
  end loop;

  -- Minuit Paris (22h UTC été) : stats + assignation
  cmd := regexp_replace(
    template,
    'functions/v1/[a-z0-9-]+',
    'functions/v1/minuit-vnext',
    'i'
  );
  cmd := regexp_replace(
    cmd,
    $$body\s*:=\s*'[^']*'::jsonb$$,
    $$body := '{}'::jsonb$$,
    'i'
  );
  if secret_ok and position('minuit-vnext' in cmd) > 0 then
    perform cron.schedule('minuit-vnext', '0 22 * * *', cmd);
  else
    raise notice 'cutover v-next: schedule minuit-vnext échoué (cmd invalide)';
  end if;

  -- Rattrapage 4h UTC : assignation seule
  cmd := regexp_replace(
    template,
    'functions/v1/[a-z0-9-]+',
    'functions/v1/minuit-vnext',
    'i'
  );
  cmd := regexp_replace(
    cmd,
    $$body\s*:=\s*'[^']*'::jsonb$$,
    $$body := '{"etapes":["assignation"]}'::jsonb$$,
    'i'
  );
  if secret_ok and position('minuit-vnext' in cmd) > 0 then
    perform cron.schedule('minuit-vnext-rattrapage', '0 4 * * *', cmd);
  else
    raise notice 'cutover v-next: schedule minuit-vnext-rattrapage échoué (cmd invalide)';
  end if;
end $$;
