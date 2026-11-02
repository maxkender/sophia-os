-- 0411 — Partie E : tout réglable depuis l'OS, admin seulement, chaque
-- changement enregistré avec qui et quand.
--
-- 1. `reglages_journal` : chaque changement de `reglages` (insert, update,
--    delete) et des zones de paie (`zones_paie`, `zones_paie_pays`), avec
--    l'ancienne et la nouvelle valeur, qui (auth.uid()) et quand. Les
--    déclencheurs ne font jamais échouer l'écriture d'origine.
--    `reglages_journal_liste(p_cles)` : le journal lu par les pages.
-- 2. Admin seulement (politiques RESTRICTIVE, comme 0390) pour les réglages
--    de la partie E ; les zones de paie : écriture admin seulement.
-- 3. Les textes écrits en dur passent en réglages :
--      - `ckd_raison_textes` : la raison du nudge en une phrase (0362) ;
--      - `slack_boutons` : les libellés des boutons sous les messages Slack
--        de l'OS (Done / I need help / I want to stop, confirmation, merci).
--    Le lien à 1 000 abonnés (0325) lisait déjà ses textes dans `lien_1000` :
--    ils deviennent modifiables dans Settings.
-- 4. Étape 4 : le jour du message (`etapes_delais.warmup_bien_fait_jour`,
--    jour ISO, 6 = samedi, comme avant) à côté de son heure.
-- (Les réglages morts seront supprimés à part.)
--
-- Retour arrière : drop des déclencheurs reglages_journal_* et de la table ;
-- drop des politiques reglages_partie_e_* et zones_paie*_ecriture ;
-- recréer ckd_raison_nudge_brut depuis 0362.

-- ---------------------------------------------------------------------------
-- 1. Le journal
-- ---------------------------------------------------------------------------
create table if not exists public.reglages_journal (
  id        bigserial primary key,
  cle       text not null,
  ancienne  jsonb,
  nouvelle  jsonb,
  par       uuid references auth.users (id) on delete set null,
  at        timestamptz not null default now()
);

create index if not exists reglages_journal_cle on public.reglages_journal (cle, at desc);

comment on table public.reglages_journal is
  'Partie E (0411) : chaque changement de réglage (et des zones de paie), avec qui et quand.';

alter table public.reglages_journal enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'reglages_journal'
                  and policyname = 'reglages_journal lecture') then
    create policy "reglages_journal lecture" on public.reglages_journal
      for select to authenticated using ((select public.is_admin()));
  end if;
end $$;
revoke all on public.reglages_journal from public, anon, authenticated;
grant select on public.reglages_journal to authenticated;
grant all on public.reglages_journal to service_role;

create or replace function public.reglages_journal_noter(p_cle text, p_ancienne jsonb, p_nouvelle jsonb, p_par uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_ancienne is not distinct from p_nouvelle then
    return;
  end if;
  insert into public.reglages_journal (cle, ancienne, nouvelle, par)
  values (p_cle, p_ancienne, p_nouvelle, coalesce(auth.uid(), p_par));
exception when others then
  raise warning 'reglages_journal_noter : %', sqlerrm;
end;
$$;

revoke execute on function public.reglages_journal_noter(text, jsonb, jsonb, uuid) from public, anon, authenticated;

create or replace function public.reglages_journal_tg()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'reglages' then
    perform public.reglages_journal_noter(
      coalesce(new.cle, old.cle),
      case when tg_op <> 'INSERT' then old.valeur end,
      case when tg_op <> 'DELETE' then new.valeur end,
      -- `updated_by` ne vaut que s'il vient d'être écrit (sinon c'est l'auteur d'avant).
      case when tg_op = 'INSERT' or (tg_op = 'UPDATE' and new.updated_at is distinct from old.updated_at)
           then new.updated_by end);
  elsif tg_table_name = 'zones_paie' then
    perform public.reglages_journal_noter(
      'zones_paie:' || coalesce(new.zone, old.zone),
      case when tg_op <> 'INSERT' then to_jsonb(old.tarif) end,
      case when tg_op <> 'DELETE' then to_jsonb(new.tarif) end,
      null);
  elsif tg_table_name = 'zones_paie_pays' then
    perform public.reglages_journal_noter(
      'zones_paie_pays:' || coalesce(new.pays, old.pays),
      case when tg_op <> 'INSERT' then to_jsonb(old.zone) end,
      case when tg_op <> 'DELETE' then to_jsonb(new.zone) end,
      null);
  end if;
  return null;
exception when others then
  return null;
end;
$$;

create or replace trigger reglages_journal_reglages after insert or update or delete on public.reglages
  for each row execute function public.reglages_journal_tg();
create or replace trigger reglages_journal_zones after insert or update or delete on public.zones_paie
  for each row execute function public.reglages_journal_tg();
create or replace trigger reglages_journal_zones_pays after insert or update or delete on public.zones_paie_pays
  for each row execute function public.reglages_journal_tg();

-- Le journal d'une liste de clés (une clé finie par « : » = toutes celles qui
-- commencent ainsi, pour les zones), le plus récent d'abord.
create or replace function public.reglages_journal_liste(p_cles text[], p_limite integer default 20)
returns table (cle text, ancienne jsonb, nouvelle jsonb, par_nom text, at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select j.cle, j.ancienne, j.nouvelle,
         coalesce(nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), ''), u.email, 'OS'),
         j.at
    from public.reglages_journal j
    left join public.profiles pr on pr.id = j.par
    left join auth.users u on u.id = j.par
   where j.cle = any (p_cles)
      or exists (select 1 from unnest(p_cles) k where right(k, 1) = ':' and j.cle like k || '%')
   order by j.at desc
   limit greatest(coalesce(p_limite, 20), 1);
end;
$$;

revoke execute on function public.reglages_journal_liste(text[], integer) from public, anon;
grant execute on function public.reglages_journal_liste(text[], integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Admin seulement
-- ---------------------------------------------------------------------------
do $$
declare
  v_cles text := $c$array['accueil_message_texte', 'arret_message_texte', 'arret_raison_upwork', 'lundi_soir_heure',
    'etapes_delais', 'reponses_reglages', 'cohorte_jour_limite', 'accueil_contrats_depuis', 'lien_1000',
    'ckd_raison_textes', 'slack_boutons']$c$;
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'reglages'
                  and policyname = 'reglages_partie_e_upd') then
    execute format('create policy reglages_partie_e_upd on public.reglages as restrictive for update to authenticated
                      using (cle <> all (%1$s) or public.is_admin_strict())
                      with check (cle <> all (%1$s) or public.is_admin_strict())', v_cles);
    execute format('create policy reglages_partie_e_ins on public.reglages as restrictive for insert to authenticated
                      with check (cle <> all (%1$s) or public.is_admin_strict())', v_cles);
    execute format('create policy reglages_partie_e_del on public.reglages as restrictive for delete to authenticated
                      using (cle <> all (%1$s) or public.is_admin_strict())', v_cles);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'zones_paie'
                  and policyname = 'zones_paie_ecriture') then
    create policy zones_paie_ecriture on public.zones_paie for all to authenticated
      using (public.is_admin_strict()) with check (public.is_admin_strict());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'zones_paie_pays'
                  and policyname = 'zones_paie_pays_ecriture') then
    create policy zones_paie_pays_ecriture on public.zones_paie_pays for all to authenticated
      using (public.is_admin_strict()) with check (public.is_admin_strict());
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Les textes écrits en dur, en réglages
-- ---------------------------------------------------------------------------
insert into public.reglages (cle, valeur) values
  ('ckd_raison_textes', jsonb_build_object(
    'shadowban_zero', 'Your last {n} posts got 0 views: your account may be blocked. Your HM will contact you.',
    'shadowban_faibles', 'Your last {n} posts got almost no views ({max} or less): your account may be blocked. Your HM will contact you.',
    'vues_basses', 'Your views are far below the other accounts in your country (median {mediane} vs {mediane_ref}). Your HM will help you fix it.',
    'posts_manquants', '{manquants} of your {attendus} planned posts have no link in the OS. Publish every planned post and paste each link.')),
  ('slack_boutons', jsonb_build_object(
    'done', 'Done',
    'aide', 'I need help',
    'stop', 'I want to stop',
    'confirmer_titre', 'Are you sure?',
    'confirmer_texte', 'We will end your contract.',
    'confirmer_oui', 'Yes, I want to stop',
    'confirmer_non', 'No',
    'merci', 'Thanks, noted.'))
on conflict (cle) do nothing;

-- La raison du nudge (0362), mêmes phrases, lues dans le réglage.
create or replace function public.ckd_raison_nudge_brut(p_donnees jsonb)
returns text
language sql
stable
set search_path = public
as $$
  select case d->>'badge'
    when 'shadowban' then
      case when coalesce((d->>'derniers_max')::numeric, 0) = 0
           then replace(coalesce(t->>'shadowban_zero',
                  'Your last {n} posts got 0 views: your account may be blocked. Your HM will contact you.'),
                  '{n}', coalesce(d->>'derniers_morts', '4'))
           else replace(replace(coalesce(t->>'shadowban_faibles',
                  'Your last {n} posts got almost no views ({max} or less): your account may be blocked. Your HM will contact you.'),
                  '{n}', coalesce(d->>'derniers_morts', '4')), '{max}', coalesce(d->>'derniers_max', '')) end
    when 'vues_basses' then
      replace(replace(coalesce(t->>'vues_basses',
        'Your views are far below the other accounts in your country (median {mediane} vs {mediane_ref}). Your HM will help you fix it.'),
        '{mediane}', coalesce(d->>'mediane', '0')), '{mediane_ref}', coalesce(d->>'mediane_ref', ''))
    when 'posts_manquants' then
      replace(replace(coalesce(t->>'posts_manquants',
        '{manquants} of your {attendus} planned posts have no link in the OS. Publish every planned post and paste each link.'),
        '{manquants}', coalesce(((d->>'attendus')::int - (d->>'publies')::int)::text, '')), '{attendus}', coalesce(d->>'attendus', ''))
  end
  from (select public.ckd_diagnostic_brut(p_donnees) as d,
               coalesce((select r.valeur from public.reglages r where r.cle = 'ckd_raison_textes'), '{}'::jsonb) as t) x;
$$;

create or replace function public.ckd_raison_nudge(p_donnees jsonb)
returns text
language plpgsql
stable
set search_path = public
as $$
begin
  return public.ckd_raison_nudge_brut(p_donnees);
exception when others then
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Le jour de l'étape 4 (samedi, comme avant)
-- ---------------------------------------------------------------------------
update public.reglages
   set valeur = valeur || jsonb_build_object('warmup_bien_fait_jour', 6)
 where cle = 'etapes_delais' and not (valeur ? 'warmup_bien_fait_jour');

notify pgrst, 'reload schema';
