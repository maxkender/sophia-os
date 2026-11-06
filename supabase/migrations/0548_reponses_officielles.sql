-- 0548 : les « Réponses officielles » (question, réponse en anglais, validée par Max).
--
-- 1. Table reponses_officielles : seules les réponses validées (valide_at) et
--    actives servent. L'admin les écrit et les valide depuis la page
--    « Réponses officielles » ; les posteurs les lisent (lien « FAQ » de leur
--    dashboard).
-- 2. Le bot FAQ (Slack #questions et la bulle de l'OS) les lit en premier :
--    une réponse officielle prime sur tout, il répond avec elle dans le fil
--    (code : _shared/faq.ts, faq_moteur.ts).
-- 3. Les 3 bots les reçoivent dans probleme_bot_lire (« reponses_officielles »),
--    et une règle leur dit de s'en servir en priorité.
-- 4. Les 13 réponses validées par Max le 6/11.
--
-- Additif : une table, une clé de plus dans probleme_bot_lire, une règle.

create table if not exists public.reponses_officielles (
  id uuid primary key default gen_random_uuid(),
  question text not null check (length(btrim(question)) between 3 and 300),
  reponse text not null check (length(btrim(reponse)) between 3 and 2000),
  ordre integer not null default 100,
  actif boolean not null default true,
  valide_at timestamptz,
  valide_par uuid,
  cree_at timestamptz not null default now(),
  cree_par uuid,
  maj_at timestamptz not null default now()
);
alter table public.reponses_officielles enable row level security;
revoke all on public.reponses_officielles from anon;  -- (lecture/écriture : politiques ci-dessous)
grant select, insert, update on public.reponses_officielles to authenticated;

-- Politiques créées une seule fois (aucun « drop »).
do $p$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'reponses_officielles' and policyname = 'reponses_officielles_lire') then
    create policy reponses_officielles_lire on public.reponses_officielles
      for select to authenticated
      using (public.is_admin() or (actif and valide_at is not null));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'reponses_officielles' and policyname = 'reponses_officielles_admin_ecrire') then
    create policy reponses_officielles_admin_ecrire on public.reponses_officielles
      for insert to authenticated with check (public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'reponses_officielles' and policyname = 'reponses_officielles_admin_modifier') then
    create policy reponses_officielles_admin_modifier on public.reponses_officielles
      for update to authenticated using (public.is_admin()) with check (public.is_admin());
  end if;
end
$p$;

-- Toute modification du texte repasse « à valider » ; seul l'admin valide.
create or replace function public.reponses_officielles_avant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.maj_at := now();
  if tg_op = 'INSERT' then
    new.cree_par := coalesce(new.cree_par, auth.uid());
  end if;
  if tg_op = 'UPDATE' and (new.question is distinct from old.question or new.reponse is distinct from old.reponse)
     and new.valide_at is not distinct from old.valide_at then
    new.valide_at := null;
    new.valide_par := null;
  end if;
  if new.valide_at is not null and (tg_op = 'INSERT' or old.valide_at is null) then
    new.valide_par := coalesce(new.valide_par, auth.uid());
  end if;
  return new;
end;
$$;
revoke execute on function public.reponses_officielles_avant() from public, anon, authenticated;

create or replace trigger reponses_officielles_avant
  before insert or update on public.reponses_officielles
  for each row execute function public.reponses_officielles_avant();

-- Les 3 bots : les réponses officielles dans ce qu'ils lisent.
do $p$
declare
  d text := pg_get_functiondef('public.probleme_bot_lire(text,uuid)'::regprocedure);
  avant text := $a$    'bot', p_bot,
$a$;
begin
  if position(avant in d) = 0 then raise exception '0548 : probleme_bot_lire, morceau introuvable'; end if;
  execute replace(d, avant, avant || $a$    'reponses_officielles', coalesce((select jsonb_agg(jsonb_build_object('question', ro.question, 'reponse', ro.reponse) order by ro.ordre, ro.cree_at)
                                       from public.reponses_officielles ro where ro.actif and ro.valide_at is not null), '[]'::jsonb),
$a$);
end
$p$;

insert into public.regles_bots (bot, regle, exemple)
select 'tous',
       'Réponses officielles d''abord : si une question est couverte par « reponses_officielles » (validées par Max), réponds avec elle, '
       || 'en anglais, mot pour mot quand elle répond exactement. Elle prime sur le guide et sur tout le reste.',
       null
 where not exists (select 1 from public.regles_bots where regle like 'Réponses officielles d''abord%');

-- Les 13 réponses validées par Max (6/11).
insert into public.reponses_officielles (question, reponse, ordre, valide_at, valide_par, cree_par)
select v.question, v.reponse, v.ordre, now(), 'dde5916a-89b8-4fc3-897b-dc7f0d88e20e', 'dde5916a-89b8-4fc3-897b-dc7f0d88e20e'
  from (values
    (10, 'App links (for comments or if someone asks)',
     'Micabo → taap.it/micabo · Sophia → taap.it/sophia.culture · UnSwipe → taap.it/unswipe. Use the link of the app your account posts for (shown on your dashboard).'),
    (20, 'Android / iPhone / countries',
     'All apps are available on Android and iPhone, in every country (Turkey included).'),
    (30, 'When to post',
     'Any time of the day, just keep at least 1 hour between your 2 posts. Slot order doesn''t matter.'),
    (40, 'Ad label',
     'No need to add any ad or paid-partnership label on your posts.'),
    (50, 'Text readability',
     'If the text is hard to read on the image, move it or change its color so it''s clearly readable. You don''t have to match the exact color or format of the example.'),
    (60, 'DMs and comments',
     'No need to reply to DMs or comments, except when someone asks what the app is: then reply with the app link above.'),
    (70, 'Sound',
     'Use the sound shown on your dashboard. If it''s unavailable, pick a similar trending sound. A post already published with another sound can stay up, no need to delete it.'),
    (80, 'Where to paste the link',
     'On your dashboard, on the post card → "I posted it" → paste the TikTok link (Share → Copy link), the same day.'),
    (90, 'TikTok username',
     'Use exactly the @ shown on your dashboard. If yours is slightly different, change it in TikTok (Edit profile → Username) to match.'),
    (100, 'Follows or likes disappearing, can''t follow',
     'Normal on new accounts, TikTok limits them for a few days. Go slower (5–10 actions per session), use mobile data, no VPN.'),
    (110, 'Post "under review", link can''t be copied, video not visible',
     'Wait a few hours and add the link as soon as it''s available. If it happens again, tell us (we may give you a fresh account).'),
    (120, 'Covering the face with text',
     'Place the text where the example shows it. Readability comes first (see "Text readability").'),
    (130, 'TikTok language',
     'Set TikTok in the language of your country (the language of your posts).')
  ) as v(ordre, question, reponse)
 where not exists (select 1 from public.reponses_officielles r where r.question = v.question);
