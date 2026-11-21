-- 0830 : les situations du bot support (21/11, Max). Additif.
-- 1. jour_crediter(poster, jour, raison) : les posts du jour comptent comme faits (0807) ; journal jours_credites.
-- 2. contenu_signalements : le contenu signalé à la qualité par le bot (images sans texte, texte faux, hors sujet).
-- 3. compte_reactiver_2e(poster) : réactive son 2e compte s'il existe, désactivé depuis moins de 14 jours, sans
--    non-renouvellement ni shadowban en attente ; renvoie son @ (sinon null : le cas va à Max).
-- 4. Les consignes générales du bot (vérifier avant, réponse adaptée, fermeture, Slack à Max, tickets).

create or replace function public.jour_crediter(p_poster uuid, p_jour date, p_raison text)
returns integer language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  update public.passages p set credite_raison = left(p_raison, 300)
    from public.comptes c
   where c.id = p.compte_id and c.poster_id = p_poster and p.date_publication_prevue = p_jour
     and p.publie_url is null and p.credite_raison is null and p.statut <> 'brouillon';
  get diagnostics v_n = row_count;
  insert into public.jours_credites (poster_id, jour, raison) values (p_poster, p_jour, left(p_raison, 300))
  on conflict (poster_id, jour) do nothing;
  return v_n;
end;
$$;
revoke execute on function public.jour_crediter(uuid, date, text) from public, anon, authenticated;
grant execute on function public.jour_crediter(uuid, date, text) to service_role;

create table if not exists public.contenu_signalements (
  id uuid primary key default gen_random_uuid(),
  poster_id uuid references public.profiles(id),
  demande_id uuid,
  texte text,
  traite_at timestamptz,
  cree_at timestamptz not null default now()
);
alter table public.contenu_signalements enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'contenu_signalements' and policyname = 'contenu_signalements_admin') then
    create policy contenu_signalements_admin on public.contenu_signalements for select to authenticated using (public.is_admin());
  end if;
end $$;

create or replace function public.compte_reactiver_2e(p_poster uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_handle text;
begin
  if not exists (select 1 from public.profiles where id = p_poster and is_active) then return null; end if;
  if not exists (select 1 from public.comptes where poster_id = p_poster and is_active and type_compte = 'perso') then return null; end if;
  select c.id, c.handle_tiktok into v_id, v_handle
    from public.comptes c
   where c.poster_id = p_poster and not c.is_active and c.type_compte = 'perso'
     and not coalesce(c.non_renouveler, false)
     and c.created_at > now() - interval '60 days'
     and not exists (select 1 from public.ckd_shadowban s where s.compte_id = c.id and s.recreation_at is null)
   order by c.created_at desc limit 1;
  if v_id is null then return null; end if;
  update public.comptes set is_active = true where id = v_id;
  return coalesce(v_handle, 'compte');
end;
$$;
revoke execute on function public.compte_reactiver_2e(uuid) from public, anon, authenticated;
grant execute on function public.compte_reactiver_2e(uuid) to service_role;

insert into public.support_consignes (texte, actif)
select x, true from unnest(array[
  'Vérifie avant de répondre : regarde l''état réel du posteur (cohorte, report, warm-up, posts du jour, liens, paie, Ruul ou Upwork) et réponds à sa situation, pas une réponse toute faite hors sujet.',
  'Ne dis jamais « Sorry for the late reply » et ne parle jamais d''un bot, d''une IA ou d''automatisation.',
  '« We''re checking » n''est jamais une réponse finale : la demande reste ouverte jusqu''à la vraie réponse, puis se ferme. Sans réponse du posteur pendant 24 h, elle se ferme.',
  'Un Slack à Max seulement pour une vraie panne, un problème grave, ou un cas que ni le pay bot ni le control bot n''arrivent à régler. Le message dit : quoi, combien de posteurs, depuis quand, ce qui a été répondu.',
  'Bug technique : un ticket dans #a-os-tickets, au format d''Adrien. « On it » du Claude d''Adrien veut dire pris en charge, pas répondu : la demande reste ouverte jusqu''à ce que ce soit réglé.',
  'Paie ou contrat Upwork (pas payé, 14 $ pour 2 comptes, contrat terminé mais pas fermé, pas de contrat cette semaine) : le pay bot corrige tout seul (jalon, montant x2 pour 2 comptes, contrat suivant) puis répond « Done, it''s fixed ». S''il n''y arrive pas : Slack à Max.',
  'Connexion au dashboard impossible : le lien de réinitialisation du mot de passe part automatiquement ; si ça bloque encore, un ticket.',
  'Messages contradictoires (warm-up, posts) : dis le vrai statut, clairement. Si le dashboard affiche une info fausse, un ticket.',
  'Questions simples (pays, APK, tutoriel, nombre de posts, horaires) : la réponse du Poster Guide, puis on ferme.',
  'Message trop vague (« me too ») : rattache-le au fil ou au message juste au-dessus ; sinon une seule question, et on ferme au bout de 24 h sans réponse.',
  'Ruul : Vik Studios paie les frais, les 10 $ arrivent entiers ; la banque valide en 1 à 2 jours ouvrés (mardi ou mercredi). « Je ne suis pas freelance » : No need to be a freelancer, Ruul pays you as an individual. Just finish your Ruul sign-up.'
]) x
where not exists (select 1 from public.support_consignes c where c.texte = x);
