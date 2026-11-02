-- 0504 — upwork_messages : l'auteur par son identifiant Upwork, et la reprise
-- de l'historique, une seule fois, étalée la nuit.
--
-- 1. upwork_message_role(contrat, de, auteur_id, auteur_nom, at) : OS (un envoi
--    par l'API noté sur ce contrat à 3 min près), sinon Max (l'identifiant d'un
--    compte qui a déjà envoyé pour l'OS : Max ou le compte de secours), sinon la
--    HM ; « nous » si l'auteur n'est pas connu (ancien relevé).
-- 2. upwork_messages_garder : un message déjà gardé avec son auteur n'est pas
--    réécrit (les lectures toutes les 15 min ne coûtent presque rien en base).
-- 3. upwork_reprise : les conversations VIk Studios (actives et fermées, depuis
--    le 1er octobre) dont l'historique complet n'a jamais été lu. La fonction
--    upwork (action « reprise_conversations ») en lit quelques-unes par passage,
--    la nuit (01:10–04:40, Paris), au plus `upwork_reprise_par_passage`
--    (réglage, 20), jamais quand Upwork est plein ; chaque contrat une seule fois.
--
-- Additif : une table, un réglage, des fonctions, un cron. Aucune ligne supprimée.

create or replace function public.upwork_message_role(
  p_contrat text, p_de text, p_auteur_id text, p_auteur_nom text, p_at timestamptz
) returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_de = 'posteur' then 'posteur'
    when exists (select 1 from public.upwork_appels a
                  where a.contrat = p_contrat and a.action in ('message', 'message_salon', 'accueil_contrat')
                    and a.erreur is null and a.at between p_at - interval '3 minutes' and p_at + interval '3 minutes') then 'os'
    when p_auteur_id is null and p_auteur_nom is null then 'nous'
    when p_auteur_id is not null and exists (select 1 from public.upwork_messages m where m.auteur_upwork_id = p_auteur_id and m.role = 'os') then 'max'
    when p_auteur_nom ilike 'maximilien%' or p_auteur_nom ilike 'adrien%' then 'max'
    else 'hm' end;
$$;

create or replace function public.upwork_messages_garder(
  p_contrat text, p_poster uuid, p_room text, p_messages jsonb, p_source text default 'salon'
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org   text;
  v_debut timestamptz;
  v_n     integer := 0;
  m       jsonb;
  v_at    timestamptz;
begin
  if jsonb_typeof(p_messages) is distinct from 'array' then
    return 0;
  end if;
  select c.organisation_id, c.debut_at into v_org, v_debut from public.upwork_contrats c where c.contrat_id = p_contrat;
  if v_org is distinct from '2074065383597823773' then
    return 0;  -- jamais Calyra ni une autre équipe ; contrat inconnu : rien
  end if;
  for m in select * from jsonb_array_elements(p_messages) loop
    v_at := nullif(m ->> 'at', '')::timestamptz;
    continue when m ->> 'id' is null or v_at is null or coalesce(btrim(m ->> 'texte'), '') = '';
    continue when v_at < '2026-10-01'::timestamptz or (v_debut is not null and v_at < v_debut);
    -- Déjà gardé avec son auteur : rien à refaire.
    continue when exists (select 1 from public.upwork_messages x where x.id = m ->> 'id' and (x.auteur_upwork_id is not null or m ->> 'auteur_id' is null));
    insert into public.upwork_messages (id, contrat_id, organisation_id, poster_id, room_id, at, auteur_upwork_id, auteur_nom, role,
                                        texte, pieces, lien_conversation, source)
    values (m ->> 'id', p_contrat, v_org, p_poster, p_room, v_at, m ->> 'auteur_id', m ->> 'auteur_nom',
            public.upwork_message_role(p_contrat, m ->> 'de', m ->> 'auteur_id', m ->> 'auteur_nom', v_at),
            public.masquer_mot_de_passe(m ->> 'texte'),
            case when jsonb_typeof(m -> 'pieces') = 'array' then m -> 'pieces' else '[]'::jsonb end,
            case when p_room is not null then 'https://www.upwork.com/ab/messages/rooms/' || p_room
                 else 'https://www.upwork.com/nx/wm/workroom/' || p_contrat || '/messages' end,
            p_source)
    on conflict (id) do update
      set poster_id = coalesce(excluded.poster_id, upwork_messages.poster_id),
          room_id = coalesce(excluded.room_id, upwork_messages.room_id),
          auteur_upwork_id = coalesce(excluded.auteur_upwork_id, upwork_messages.auteur_upwork_id),
          auteur_nom = coalesce(excluded.auteur_nom, upwork_messages.auteur_nom),
          role = case when upwork_messages.role = 'nous' then excluded.role else upwork_messages.role end,
          pieces = case when jsonb_array_length(excluded.pieces) > 0 then excluded.pieces else upwork_messages.pieces end,
          lien_conversation = excluded.lien_conversation;
    v_n := v_n + 1;
  end loop;
  -- Une lecture complète de cette conversation : la reprise n'a plus à la lire.
  if p_source in ('salon', 'reponses', 'reprise') then
    insert into public.upwork_reprise (contrat_id, lu_at, source) values (p_contrat, now(), p_source)
    on conflict (contrat_id) do update set lu_at = now(), source = excluded.source;
  end if;
  return v_n;
end;
$$;

create table if not exists public.upwork_reprise (
  contrat_id text primary key,
  lu_at      timestamptz,
  source     text,
  erreur     text,
  essais     integer not null default 0
);
alter table public.upwork_reprise enable row level security;
do $p$
begin
  if not exists (select 1 from pg_policies where tablename = 'upwork_reprise' and policyname = 'upwork_reprise_admin') then
    create policy upwork_reprise_admin on public.upwork_reprise for select to authenticated using (public.is_admin());
  end if;
end
$p$;

insert into public.reglages (cle, valeur, updated_at) values ('upwork_reprise_par_passage', to_jsonb(20), now())
on conflict (cle) do nothing;

-- Les conversations à reprendre : VIk Studios, contrat commencé depuis le 1er octobre
-- (ou encore actif), jamais lues en entier, moins de 3 essais.
create or replace function public.upwork_reprise_a_faire(p_limite integer)
returns table (contrat_id text, poster_id uuid, organisation_id text, room_id text, freelance_id text)
language sql
stable
security definer
set search_path = public
as $$
  select c.contrat_id,
         (select p.id from public.profiles p where p.upwork_contract_id = c.contrat_id order by p.is_active desc limit 1),
         c.organisation_id, s.room_id, s.freelance_id
    from public.upwork_contrats c
    left join public.upwork_salons s on s.contrat_id = c.contrat_id
    left join public.upwork_reprise r on r.contrat_id = c.contrat_id
   where c.organisation_id = '2074065383597823773'
     and (c.debut_at >= '2026-10-01'::timestamptz or c.actif)
     and r.lu_at is null and coalesce(r.essais, 0) < 3
   order by c.debut_at desc
   limit greatest(0, p_limite);
$$;
revoke all on function public.upwork_reprise_a_faire(integer) from public, anon, authenticated;
grant execute on function public.upwork_reprise_a_faire(integer) to service_role;

-- L'appel de la nuit (le secret du cron est lu dans la base, jamais affiché).
create or replace function public.upwork_reprise_appeler()
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id bigint;
begin
  select net.http_post(
           url := 'https://mbikecieskoobeizixig.supabase.co/functions/v1/upwork',
           body := jsonb_build_object('action', 'reprise_conversations'),
           headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', public.cron_secret_lire()),
           timeout_milliseconds := 280000)
    into v_id;
  return v_id;
end;
$$;
revoke all on function public.upwork_reprise_appeler() from public, anon, authenticated;

do $c$
begin
  if not exists (select 1 from cron.job where jobname = 'upwork-reprise-conversations') then
    -- Toutes les 30 min, de 00:10 à 03:40 UTC (01:10–04:40 à Paris) : la nuit, loin des envois.
    perform cron.schedule('upwork-reprise-conversations', '10,40 0-3 * * *', 'select public.upwork_reprise_appeler()');
  end if;
end
$c$;

notify pgrst, 'reload schema';
