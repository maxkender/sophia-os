-- 0749 : salons Slack Ruul, « cant_invite » (Max, 18/11). Un posteur dont le compte Slack relié est désactivé
-- (slack_membres.supprime) n'est plus dans le workspace : l'inviter dans un salon échoue 5 fois (« cant_invite »).
-- 1. ruul_slack_salons : statut « en attente qu'il rejoigne » (en_attente_at) et date du lien d'invitation envoyé
--    (invitation_at, une seule fois).
-- 2. ruul_slack_salons_a_faire ne propose plus ces posteurs (rien à réessayer tant qu'ils n'ont pas rejoint).
-- 3. ruul_slack_a_inviter() : les posteurs Ruul actifs en attente, pas encore invités (la fonction ruul leur envoie
--    le lien d'invitation une fois et le note).
-- 4. Quand le compte Slack d'un posteur change (il a rejoint, compte relié), ses salons en échec repartent à zéro.
-- Additif : deux colonnes, des fonctions, un trigger ; les 12 lignes en échec passent « en attente ».

alter table public.ruul_slack_salons add column if not exists en_attente_at timestamptz;
alter table public.ruul_slack_salons add column if not exists invitation_at timestamptz;

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
     and x.en_attente_at is null
     -- 0749 : un compte Slack désactivé n'est plus dans le workspace : en attente qu'il rejoigne.
     and not exists (select 1 from public.slack_membres m where m.slack_user_id = pr.slack_user_id and m.supprime)
   order by pr.id
   limit 200;
$$;

-- Les posteurs Ruul actifs qui ne sont plus dans le workspace (compte désactivé, ou « cant_invite » au 5e essai),
-- pas encore invités : à qui envoyer le lien d'invitation Slack (une fois).
create or replace function public.ruul_slack_a_inviter()
returns table (poster_id uuid, prenom text, email text, langue text)
language sql
stable
security definer
set search_path = public
as $$
  select distinct pr.id, pr.prenom, pr.email,
         public.parrainage_langue_pays((select c.pays from public.comptes c where c.poster_id = pr.id and c.is_active order by c.created_at limit 1))
    from public.ruul_slack_salons x
    join public.profiles pr on pr.id = x.poster_id
   where not x.ok and x.invitation_at is null
     and pr.canal_paie = 'ruul' and pr.is_active and pr.relances_stop_at is null
     and (x.en_attente_at is not null
          or (x.erreur like '%cant_invite%' and x.tentatives >= 5)
          or exists (select 1 from public.slack_membres m where m.slack_user_id = pr.slack_user_id and m.supprime));
$$;

-- Le lien est parti : toutes les lignes en échec du posteur passent « en attente », avec la date d'invitation.
create or replace function public.ruul_slack_invitation_noter(p_poster uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.ruul_slack_salons
     set en_attente_at = coalesce(en_attente_at, now()), invitation_at = now(),
         erreur = 'en attente qu''il rejoigne le workspace (lien d''invitation envoyé)', maj_at = now()
   where poster_id = p_poster and not ok;
$$;

create or replace function public.ruul_slack_salons_relance()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if new.slack_user_id is distinct from old.slack_user_id and nullif(btrim(coalesce(new.slack_user_id, '')), '') is not null then
    update public.ruul_slack_salons
       set tentatives = 0, en_attente_at = null, erreur = null, maj_at = now()
     where poster_id = new.id and not ok;
  end if;
  return new;
end;
$function$;

create or replace trigger ruul_slack_salons_relance
after update of slack_user_id on public.profiles
for each row execute function public.ruul_slack_salons_relance();

-- Les 12 lignes « cant_invite » dont le compte Slack est désactivé : en attente (l'invitation part au prochain passage).
update public.ruul_slack_salons x
   set en_attente_at = now(), erreur = 'en attente qu''il rejoigne le workspace', maj_at = now()
  from public.profiles pr
 where pr.id = x.poster_id and not x.ok and x.en_attente_at is null and x.erreur like '%cant_invite%'
   and exists (select 1 from public.slack_membres m where m.slack_user_id = pr.slack_user_id and m.supprime);

revoke all on function public.ruul_slack_a_inviter() from public, anon, authenticated;
revoke all on function public.ruul_slack_invitation_noter(uuid) from public, anon, authenticated;
grant execute on function public.ruul_slack_a_inviter() to service_role;
grant execute on function public.ruul_slack_invitation_noter(uuid) to service_role;
