-- 0579 : l'email pour les posteurs Ruul (9/11, P5).
--
-- Un posteur du site n'a pas de contrat Upwork : avant son arrivée sur Slack,
-- les relances et messages de l'OS étaient « bloqués » (contrat_non_relie).
-- Ils partent maintenant par email (le même texte). Après son arrivée sur
-- Slack, le message part sur Slack ; sans réaction en 48 h, il est renvoyé
-- une fois par email, en secours. Jamais après un STOP (relances_stop_at ou
-- lien « Unsubscribe »), jamais deux fois le même message.
-- Additif : une table (le journal des envois par email) et une fonction.

create table if not exists public.ruul_relais (
  id         uuid primary key default gen_random_uuid(),
  poster_id  uuid not null references public.profiles(id),
  source     text not null check (source in ('bloque', 'secours')),
  ref        text not null,
  type       text,
  texte      text,
  statut     text not null default 'a_envoyer' check (statut in ('a_envoyer', 'envoye', 'erreur', 'stop')),
  erreur     text,
  created_at timestamptz not null default now(),
  envoye_at  timestamptz,
  unique (source, ref)
);
alter table public.ruul_relais enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'ruul_relais' and policyname = 'ruul_relais_admin') then
    create policy ruul_relais_admin on public.ruul_relais for select to authenticated using (public.is_admin());
  end if;
end $$;

/**
 * Les emails à envoyer (fonction ruul, toutes les 15 min) : les messages
 * bloqués faute de canal (24 h au plus) et les messages Slack restés 48 h sans
 * réaction (7 jours au plus), pour les posteurs Ruul actifs sans STOP.
 */
create or replace function public.ruul_relais_preparer()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n1 int;
  n2 int;
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') then raise exception 'réservé à la fonction ruul'; end if;
  insert into public.ruul_relais (poster_id, source, ref, type, texte)
  select rp.poster_id, 'bloque', rp.poster_id || ':' || rp.type || ':' || rp.periode, rp.type, rp.texte
    from public.relances_prevues rp
    join public.profiles p on p.id = rp.poster_id
   where rp.statut = 'bloque' and rp.raison = 'contrat_non_relie'
     and rp.maj_at > now() - interval '24 hours'
     and nullif(btrim(coalesce(rp.texte, '')), '') is not null
     and p.canal_paie = 'ruul' and p.is_active and p.relances_stop_at is null
     and nullif(btrim(coalesce(p.ruul_email, '')), '') is not null
  on conflict (source, ref) do nothing;
  get diagnostics n1 = row_count;

  insert into public.ruul_relais (poster_id, source, ref, type, texte)
  select n.poster_id, 'secours', n.id::text, n.type, n.texte
    from public.nudges n
    join public.profiles p on p.id = n.poster_id
   where n.envoye_at between now() - interval '7 days' and now() - interval '48 hours'
     and (coalesce(n.canaux, array[n.canal]) @> array['slack'])
     and nullif(btrim(coalesce(n.texte, '')), '') is not null
     and p.canal_paie = 'ruul' and p.is_active and p.relances_stop_at is null
     and nullif(btrim(coalesce(p.ruul_email, '')), '') is not null
     and not exists (select 1 from public.posteur_reponses r where r.poster_id = n.poster_id and r.recu_at > n.envoye_at)
     and not exists (select 1 from public.posteur_reactions x where x.poster_id = n.poster_id and x.slack_at > n.envoye_at)
  on conflict (source, ref) do nothing;
  get diagnostics n2 = row_count;
  return n1 + n2;
end;
$$;

revoke execute on function public.ruul_relais_preparer() from public, anon, authenticated;
grant execute on function public.ruul_relais_preparer() to service_role;

-- Interrupteur, éteint : rien ne part par email sans l'OK de Max.
insert into public.reglages (cle, valeur) values ('ruul_relais_email', 'false'::jsonb)
on conflict (cle) do nothing;
