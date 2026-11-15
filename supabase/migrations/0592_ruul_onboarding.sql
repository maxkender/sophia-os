-- 0592 : Ruul, onboarding complet (décisions de Max du 10/11).
-- 1. La liste « à ajouter dans Ruul » tous les soirs à 18 h (Paris), à
--    support@vikstudios.com (réglage ruul_liste_destinataire) : les nouveaux
--    signés depuis la veille (ruul_a_ajouter_liste donne signe_at), et le reste.
--    La tâche ruul-dimanche passe du dimanche à tous les jours.
-- 2. Le texte de l'invitation Ruul (ruul_textes.invite_*).
-- Additif : un réglage, une fonction remplacée, un texte et un horaire changés à la demande de Max.

insert into public.reglages (cle, valeur) values ('ruul_liste_destinataire', to_jsonb('support@vikstudios.com'::text))
on conflict (cle) do nothing;

/* Les posteurs Ruul actifs avec un email Ruul, pas encore ajoutés dans Ruul (admin ou service seulement). */
create or replace function public.ruul_a_ajouter_liste()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'poster_id', pr.id, 'nom', coalesce(nullif(btrim(concat_ws(' ', pr.prenom, pr.nom)), ''), pr.email),
           'ruul_email', pr.ruul_email, 'pays', public.paie_pays_posteur(pr.id),
           'zone', coalesce(pr.ruul_zone, (select z.zone from public.zones_paie_pays z
                                            where upper(z.pays) = upper(public.paie_pays_posteur(pr.id)) and z.retire_at is null limit 1)),
           'tarif', public.ruul_tarif(pr.id),
           'signe_at', coalesce(h.cree_at, pr.created_at)) order by coalesce(h.cree_at, pr.created_at), pr.prenom), '[]'::jsonb)
    from public.profiles pr
    left join public.hub_posteurs h on h.profile_id = pr.id
   where pr.canal_paie = 'ruul' and pr.is_active and pr.ruul_ajoute_at is null
     and nullif(btrim(coalesce(pr.ruul_email, '')), '') is not null
     and not coalesce(h.exclu_suivi, false)
     and (auth.uid() is null or public.is_admin());
$$;

-- Le texte de l'invitation Ruul (Max, 10/11).
update public.reglages
   set valeur = coalesce(valeur, '{}'::jsonb) || jsonb_build_object(
         'invite_objet', 'Your Ruul invitation: this is how you get paid every Monday',
         'invite_texte', E'Hi {prenom}, you just received an invitation from Ruul at {email}. Ruul is the contractor platform we use to pay you every Monday. It''s really simple:\n1. Open the email from Ruul and create your free account from it.\n2. Verify your identity (ID + selfie, about 10 minutes).\n3. Add your bank account.\n\nWhen it''s done, click the button below.',
         'invite_bouton', 'It''s done'),
       updated_at = now()
 where cle = 'ruul_textes';

-- La liste part tous les soirs (16 h et 17 h UTC ; la fonction n'envoie qu'à 18 h Paris, une fois).
do $$
declare
  v_job bigint := (select jobid from cron.job where jobname = 'ruul-dimanche');
begin
  if v_job is not null then
    perform cron.alter_job(v_job, schedule := '0 16,17 * * *');
  end if;
end $$;

-- 3. Slack : un posteur Ruul au compte Slack relié rejoint #ruul-posters et
--    #posting-help (fonction hub-slack-cohorte, toutes les 15 min). Jamais
--    #upwork-posters ni les salons de zone. Réglage ruul_slack_salons (liste d'ids).
insert into public.reglages (cle, valeur) values ('ruul_slack_salons', '["C0CA5SH59N0", "C0CGA81NTDH"]'::jsonb)
on conflict (cle) do nothing;

create table if not exists public.ruul_slack_salons (
  poster_id   uuid not null references public.profiles(id),
  salon       text not null,
  ok          boolean not null default false,
  tentatives  integer not null default 0,
  erreur      text,
  maj_at      timestamptz not null default now(),
  primary key (poster_id, salon)
);
alter table public.ruul_slack_salons enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'ruul_slack_salons' and policyname = 'ruul_slack_salons_admin') then
    create policy ruul_slack_salons_admin on public.ruul_slack_salons for select to authenticated using (public.is_admin());
  end if;
end $$;

/* Les posteurs Ruul actifs au Slack relié, pas encore dans chaque salon Ruul (5 essais au plus). */
create or replace function public.ruul_slack_salons_a_faire()
returns table (poster_id uuid, slack_user_id text, salon text)
language sql
stable
security definer
set search_path = public
as $$
  select pr.id, pr.slack_user_id, s.salon
    from public.profiles pr
    cross join lateral jsonb_array_elements_text(
      coalesce((select r.valeur from public.reglages r where r.cle = 'ruul_slack_salons'), '["C0CA5SH59N0", "C0CGA81NTDH"]'::jsonb)) as s(salon)
    left join public.ruul_slack_salons x on x.poster_id = pr.id and x.salon = s.salon
   where pr.canal_paie = 'ruul' and pr.is_active
     and nullif(btrim(coalesce(pr.slack_user_id, '')), '') is not null
     and not coalesce(x.ok, false) and coalesce(x.tentatives, 0) < 5
   order by pr.id
   limit 200;
$$;

create or replace function public.ruul_slack_salon_noter(p_poster uuid, p_salon text, p_ok boolean, p_erreur text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.ruul_slack_salons (poster_id, salon, ok, tentatives, erreur, maj_at)
  values (p_poster, p_salon, p_ok, 1, p_erreur, now())
  on conflict (poster_id, salon) do update
     set ok = excluded.ok, tentatives = public.ruul_slack_salons.tentatives + 1, erreur = excluded.erreur, maj_at = now();
$$;

revoke execute on function public.ruul_slack_salons_a_faire() from public, anon, authenticated;
revoke execute on function public.ruul_slack_salon_noter(uuid, text, boolean, text) from public, anon, authenticated;
grant execute on function public.ruul_slack_salons_a_faire() to service_role;
grant execute on function public.ruul_slack_salon_noter(uuid, text, boolean, text) to service_role;

-- 4. La checklist du dashboard d'un posteur Ruul : tout ce qu'il faut, en une lecture.
create or replace function public.ruul_mon_onboarding()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'ruul', coalesce(pr.canal_paie = 'ruul', false),
    'cohorte_lundi', pr.cohorte_lundi,
    'prenom_legal', h.prenom_legal,
    'nom_legal', h.nom_legal,
    'ruul_email', nullif(btrim(coalesce(pr.ruul_email, '')), ''),
    'email_candidature', coalesce(nullif(btrim(h.email_perso), ''), nullif(btrim(pr.email_perso), '')),
    'handle', c.handle_tiktok,
    'tiktok', coalesce(w.existe, false)
              or exists (select 1 from public.etape_declarations d where d.poster_id = pr.id and d.etape = 'tiktok' and d.statut <> 'refuse')
              or c.warmup_started_at is not null,
    'warmup_lance', c.warmup_started_at is not null,
    'abonnements', coalesce(w.abonnements, 0),
    'pret_warmup', coalesce(public.compte_pret(c.id), false),
    'slack', nullif(btrim(coalesce(pr.slack_user_id, '')), '') is not null
             or nullif(btrim(coalesce(h.slack_user_id, '')), '') is not null
             or exists (select 1 from public.etape_declarations d where d.poster_id = pr.id and d.etape = 'slack' and d.statut <> 'refuse'),
    'ruul_statut', pr.ruul_statut,
    'ruul_invite', pr.ruul_ajoute_at is not null,
    'ruul_pret', pr.ruul_statut in ('pret', 'paye_1x'))
    from public.profiles pr
    left join public.hub_posteurs h on h.profile_id = pr.id
    left join lateral (select x.* from public.comptes x where x.poster_id = pr.id and x.is_active and coalesce(x.type_compte, 'perso') = 'perso'
                        order by x.created_at limit 1) c on true
    left join lateral (select r.existe, r.abonnements from public.ckd_warmup_releves r
                        where r.compte_id = c.id and r.existe is not null order by r.releve_at desc limit 1) w on true
   where pr.id = auth.uid();
$$;

/* « It's done » depuis le dashboard : le compte Ruul du posteur est prêt (après l'invitation). */
create or replace function public.ruul_je_suis_pret()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '42501'; end if;
  update public.profiles
     set ruul_statut = case when ruul_statut = 'paye_1x' then ruul_statut else 'pret' end,
         ruul_pret_at = coalesce(ruul_pret_at, now())
   where id = auth.uid() and canal_paie = 'ruul' and ruul_ajoute_at is not null;
  if not found then return jsonb_build_object('ok', false, 'erreur', 'Your Ruul invitation has not been sent yet.'); end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.ruul_mon_onboarding() from public, anon;
revoke execute on function public.ruul_je_suis_pret() from public, anon;
grant execute on function public.ruul_mon_onboarding() to authenticated;
grant execute on function public.ruul_je_suis_pret() to authenticated;
