-- 0676 : chaque posteur dans le salon Slack de sa plateforme (Max, 12/11).
-- Upwork → #upwork-posters (C0CG13NM2HM) ; Ruul → #ruul-posters et #posting-help (0592, inchangé).
-- La tâche hub-slack-cohorte (toutes les 15 min) invite les posteurs actifs au Slack relié
-- qui n'y sont pas encore ; chaque essai est noté dans ruul_slack_salons (5 essais au plus).
-- Additif : un réglage, une fonction.

insert into public.reglages (cle, valeur) values ('upwork_slack_salons', '["C0CG13NM2HM"]'::jsonb)
on conflict (cle) do nothing;

/* Les posteurs actifs au Slack relié, pas encore dans chaque salon de leur plateforme. */
create or replace function public.slack_salons_a_faire()
returns table (poster_id uuid, slack_user_id text, salon text)
language sql
stable
security definer
set search_path = public
as $$
  select pr.id, pr.slack_user_id, s.salon
    from public.profiles pr
    cross join lateral jsonb_array_elements_text(
      case when pr.canal_paie = 'ruul'
           then coalesce((select r.valeur from public.reglages r where r.cle = 'ruul_slack_salons'), '["C0CA5SH59N0", "C0CGA81NTDH"]'::jsonb)
           else coalesce((select r.valeur from public.reglages r where r.cle = 'upwork_slack_salons'), '["C0CG13NM2HM"]'::jsonb) end) as s(salon)
    left join public.ruul_slack_salons x on x.poster_id = pr.id and x.salon = s.salon
   where pr.is_active
     and pr.canal_paie in ('ruul', 'upwork')
     and exists (select 1 from public.user_roles ur where ur.user_id = pr.id and ur.role::text = 'poster')
     and nullif(btrim(coalesce(pr.slack_user_id, '')), '') is not null
     and not coalesce(x.ok, false) and coalesce(x.tentatives, 0) < 5
   order by coalesce(x.tentatives, 0), pr.created_at desc
   limit 500;
$$;
revoke execute on function public.slack_salons_a_faire() from public, anon, authenticated;
grant execute on function public.slack_salons_a_faire() to service_role;
