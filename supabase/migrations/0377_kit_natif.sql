-- 0377 : Relecture native · étape 2, le kit natif (27/10).
--
-- Après son questionnaire, chaque relecteur écrit 15 slideshows depuis
-- l'anglais, de A à Z, CTA compris (sous-page Notion « Kit natif : les posts à
-- écrire de A à Z »). Les mêmes 15 pour toutes les langues.
--  A) `kit_natif` : les 15 posts, dans l'ordre (`rang`). Chacun porte son
--     appli, sa voie de CTA (reprise, forme, libre), la consigne montrée au
--     relecteur (en anglais), les références à adapter au pays, et une copie
--     figée de ses slides anglaises avec l'image de chaque slide (`slides_en`).
--     L'admin les modifie, les remplace ou les retire.
--  B) `kit_natif_ecritures` : la version du relecteur, slide par slide, plus
--     une remarque libre ; `rendu_at` quand il dit « ce post est fini ».
--  C) Le test : un relecteur « invite » qui a fini son questionnaire voit les
--     3 premiers posts (le test payé) ; passé « actif », il voit les 15.
--     Toujours seulement quand l'espace relecteur est ouvert (0376).
--  D) `presentations_applis_relecteur()` : la présentation courte de chaque
--     appli (« What is micabo? »), lisible par un relecteur sans ouvrir les
--     fiches complètes, réservées à l'admin.
--
-- Additive : deux tables, quatre fonctions, 15 lignes de kit créées si leur
-- rang est libre. Rien n'est branché sur la production.
-- Retour arrière :
--   drop table public.kit_natif_ecritures, public.kit_natif;
--   drop function public.relecteur_voit_kit(int), public.relecteur_peut_ecrire_kit(uuid, uuid),
--     public.presentations_applis_relecteur(), public.kit_natif_horodater();

-- ---------------------------------------------------------------------------
-- A) Les posts du kit
-- ---------------------------------------------------------------------------
create table if not exists public.kit_natif (
  id             uuid primary key default gen_random_uuid(),
  rang           int not null unique check (rang > 0),
  contenu_id     uuid not null references public.contenus (id) on delete restrict,
  application_id uuid not null references public.applications (id),
  voie           text not null check (voie in ('reprise', 'forme', 'libre')),
  slide_cta      int check (slide_cta is null or slide_cta > 0),
  consigne_cta   text not null default '',
  a_adapter      text not null default '',
  source_url     text,
  slides_en      jsonb not null default '[]'::jsonb,
  actif          boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table public.kit_natif is
  'Kit natif (0377) : les slideshows que chaque relecteur écrit de A à Z après son questionnaire. Rangs 1 à 3 : le test payé.';
comment on column public.kit_natif.slides_en is
  'Copie figée des slides anglaises : [{position, texte, image_url}]. Texte de base (OCR de l''original) quand il existe ; image de la slide source.';
comment on column public.kit_natif.consigne_cta is
  'Consigne du CTA montrée au relecteur, en anglais. Vide pour la voie libre.';

-- ---------------------------------------------------------------------------
-- B) Les versions des relecteurs
-- ---------------------------------------------------------------------------
create table if not exists public.kit_natif_ecritures (
  relecteur_id uuid not null references public.relecteurs_natifs (id) on delete cascade,
  kit_id       uuid not null references public.kit_natif (id) on delete cascade,
  slides       jsonb not null default '[]'::jsonb,
  remarque     text not null default '',
  rendu_at     timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (relecteur_id, kit_id)
);

comment on column public.kit_natif_ecritures.slides is
  'La version du relecteur, slide par slide : [{position, texte}].';

create or replace function public.kit_natif_horodater()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists kit_natif_horodater on public.kit_natif;
create trigger kit_natif_horodater
  before update on public.kit_natif
  for each row execute function public.kit_natif_horodater();

drop trigger if exists kit_natif_ecritures_horodater on public.kit_natif_ecritures;
create trigger kit_natif_ecritures_horodater
  before update on public.kit_natif_ecritures
  for each row execute function public.kit_natif_horodater();

-- ---------------------------------------------------------------------------
-- C) Qui voit quoi : questionnaire fini, espace ouvert, 3 posts en test
-- ---------------------------------------------------------------------------
create or replace function public.relecteur_voit_kit(p_rang int)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
           select 1
           from public.relecteurs_natifs r
           where r.profile_id = auth.uid()
             and r.questionnaire_termine_at is not null
             and (r.statut = 'actif' or (r.statut = 'invite' and p_rang <= 3))
         )
     and coalesce(
           (select (g.valeur ->> 'espace_ouvert')::boolean
            from public.reglages g
            where g.cle = 'relecture_native'),
           false
         );
$$;

create or replace function public.relecteur_peut_ecrire_kit(p_relecteur_id uuid, p_kit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.relecteur_peut_ecrire(p_relecteur_id)
     and exists (
           select 1
           from public.relecteurs_natifs r
           join public.kit_natif k on k.id = p_kit_id and k.actif
           where r.id = p_relecteur_id
             and r.questionnaire_termine_at is not null
             and (r.statut = 'actif' or k.rang <= 3)
         );
$$;

-- ---------------------------------------------------------------------------
-- D) La présentation courte des applis, pour les relecteurs
-- ---------------------------------------------------------------------------
create or replace function public.presentations_applis_relecteur()
returns table (application_id uuid, nom text, slug text, presentation text)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, a.nom, a.slug, coalesce(f.presentation_relecteur, '')
  from public.applications a
  left join public.fiches_appli f on f.application_id = a.id
  where exists (
          select 1 from public.relecteurs_natifs r
          where r.profile_id = auth.uid() and r.statut in ('invite', 'actif')
        )
    and coalesce(
          (select (g.valeur ->> 'espace_ouvert')::boolean
           from public.reglages g
           where g.cle = 'relecture_native'),
          false
        );
$$;

-- ---------------------------------------------------------------------------
-- Droits
-- ---------------------------------------------------------------------------
alter table public.kit_natif enable row level security;
alter table public.kit_natif_ecritures enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'kit_natif'
                  and policyname = 'kit_natif admin') then
    create policy "kit_natif admin" on public.kit_natif
      for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'kit_natif'
                  and policyname = 'kit_natif lecture relecteur') then
    create policy "kit_natif lecture relecteur" on public.kit_natif
      for select to authenticated using (actif and public.relecteur_voit_kit(rang));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'kit_natif_ecritures'
                  and policyname = 'kit_natif_ecritures admin') then
    create policy "kit_natif_ecritures admin" on public.kit_natif_ecritures
      for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'kit_natif_ecritures'
                  and policyname = 'kit_natif_ecritures lecture soi') then
    create policy "kit_natif_ecritures lecture soi" on public.kit_natif_ecritures
      for select to authenticated using (
        exists (select 1 from public.relecteurs_natifs r
                where r.id = relecteur_id and r.profile_id = (select auth.uid()))
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'kit_natif_ecritures'
                  and policyname = 'kit_natif_ecritures ecriture soi') then
    create policy "kit_natif_ecritures ecriture soi" on public.kit_natif_ecritures
      for insert to authenticated with check (public.relecteur_peut_ecrire_kit(relecteur_id, kit_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'kit_natif_ecritures'
                  and policyname = 'kit_natif_ecritures modification soi') then
    create policy "kit_natif_ecritures modification soi" on public.kit_natif_ecritures
      for update to authenticated
      using (public.relecteur_peut_ecrire_kit(relecteur_id, kit_id))
      with check (public.relecteur_peut_ecrire_kit(relecteur_id, kit_id));
  end if;
end $$;

revoke all on public.kit_natif, public.kit_natif_ecritures from public, anon;
grant select, insert, update, delete on public.kit_natif, public.kit_natif_ecritures to authenticated;
grant all on public.kit_natif, public.kit_natif_ecritures to service_role;

revoke all on function public.relecteur_voit_kit(int) from public, anon;
revoke all on function public.relecteur_peut_ecrire_kit(uuid, uuid) from public, anon;
revoke all on function public.presentations_applis_relecteur() from public, anon;
grant execute on function public.relecteur_voit_kit(int) to authenticated, service_role;
grant execute on function public.relecteur_peut_ecrire_kit(uuid, uuid) to authenticated, service_role;
grant execute on function public.presentations_applis_relecteur() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Les 15 posts proposés le 27/10 (rangs 1 à 3 : le test)
-- ---------------------------------------------------------------------------
-- Les slides anglaises sont copiées depuis la base : texte d'origine
-- (`slides_base`) quand il existe, sinon `slides` ; image de la slide source.
insert into public.kit_natif
  (rang, contenu_id, application_id, voie, slide_cta, consigne_cta, a_adapter, source_url, slides_en)
select
  k.rang,
  c.id,
  a.id,
  k.voie,
  k.slide_cta,
  k.consigne,
  k.a_adapter,
  c.source_url,
  (select coalesce(jsonb_agg(jsonb_build_object(
            'position', (s ->> 'position')::int,
            'texte', coalesce(s ->> 'texte_overlay', ''),
            'image_url', (select coalesce(st ->> 'raw_url', st ->> 'reference_url')
                          from jsonb_array_elements(coalesce(c.structure_slides, '[]'::jsonb)) st
                          where (st ->> 'position')::int = (s ->> 'position')::int
                          limit 1)
          ) order by (s ->> 'position')::int), '[]'::jsonb)
   from jsonb_array_elements(coalesce(cl.slides_base, cl.slides, '[]'::jsonb)) s)
from (values
  (1, '1ab301c9-5abd-45b8-8207-637aa49bcf2e'::uuid, 'sophia', 'reprise', 5,
   'Slide 5 recommends another app ("unscroll") as a personal tip: "i use unscroll: it blocks the apps…". Keep that personal tip on slide 5, with Sophia instead.',
   'The weekly poem (pick a poet people know in your country), world capitals.'),
  (2, 'ceef7c0d-3c30-4557-aa04-4af1316b90cc'::uuid, 'micabo', 'forme', 5,
   'A form that already worked for micabo: "put your notes into an app like micabo for 10 minutes in the evening to test yourself". Put it on slide 5, the one about checking what stayed in your brain.',
   '"11:57 pm" deadlines, the semester, "another monday", the slang ("locked in", "girl…", "chic").'),
  (3, '2a9d2d47-9eb0-4122-bbba-49a09ba8a933'::uuid, 'sophia', 'libre', null, '',
   'Taxes, negotiating your salary, "open a bottle", fixing a flat tire. The last slide "STONE MAG." is the original account''s signature: turn it into a natural ending, without an account name.'),
  (4, '57a0b4be-ba6e-4bbd-98fc-2ca43900d05e'::uuid, 'unswipe', 'reprise', 4,
   'Slide 4 credits another app ("vent now") for a tip about cleaning up the social media feed. Keep that personal story on slide 4, with UnSwipe instead.',
   'Staring contests on the subway (no subway where you live?), "free upgrades", grocery stores.'),
  (5, 'dd089924-3f08-42f5-9acf-7b7e99442d41'::uuid, 'sophia', 'forme', 7,
   'Before / after, in the first person: "before, I … ; now I open Sophia every morning and …". On slide 7, the last tip before the sources.',
   'Fasting "8am to 6pm" (your time format), the gym, a sources slide in English.'),
  (6, '7f1ed494-8b7c-4f74-ad06-2e7fbfd11f2b'::uuid, 'sophia', 'libre', null, '',
   'The slang: "go ghost", "rebound", "get on your grind", "lock in".'),
  (7, 'bb2eeefa-d48f-4aab-9e65-405885ce9658'::uuid, 'micabo', 'reprise', 3,
   'Slide 3 recommends another app ("bycat"): "i upload my material to bycat and take a quiz BEFORE studying". Same idea on slide 3, with micabo.',
   'The grade "4/10" (use your country''s grading scale), the swearing (how far do people go?), "babe", "SCARY good".'),
  (8, 'ef149b0b-030d-438d-8d6c-71f4f654268a'::uuid, 'unswipe', 'forme', 8,
   'A form that already worked for UnSwipe: "I''ll never delete my social media, but UnSwipe removes the Reels and keeps my messages". Put it on slide 8, the one about screen time.',
   'Chanel, CeraVe, showering in winter vs summer, candles.'),
  (9, 'fb79100e-90ba-4169-a1b0-0b509de83e74'::uuid, 'unswipe', 'reprise', 4,
   'Slide 4 is "Replace doomscrolling with microlearning apps", with a screenshot of another app. Keep the tip on slide 4, with UnSwipe as the way to stop doomscrolling.',
   'Substack, the Spotify podcast "Stuff You Should Know": use what people in your country actually read and listen to.'),
  (10, '4674dd61-a5d0-4e34-b63a-d2b8ccf331a5'::uuid, 'sophia', 'reprise', 5,
   'Slide 5 already carries the idea: "five minutes a day of history, art or science". Keep it on slide 5 and say he does it with Sophia.',
   '"Mark… drove across Canada", Sarah, the Eiffel Tower, toasts ("Cheers, guys"), wine, pasta.'),
  (11, '34236ff7-e065-4119-a84b-c95fb6b68fcf'::uuid, 'sophia', 'forme', null,
   'Confidence comes from having unexpected things to talk about, and Sophia gives you those. Personal tone, a bit quirky. On one of the last 3 slides.',
   'Few references.'),
  (12, '21d54fb2-0b87-4d61-86ee-e6b2b61d9bc2'::uuid, 'micabo', 'libre', null, '',
   'Blair Waldorf, Hermione, Spencer Hastings, Rory Gilmore, Yale, finals: are these shows known in your country? Is there a local heroine people would name?'),
  (13, '98261a0a-53b2-4ea8-ae0e-b21097c9e603'::uuid, 'micabo', 'reprise', 3,
   'Slide 3 recommends another app ("quizlet"): "i put everything into quizlet… auto-generated quizzes save me". Same idea on slide 3, with micabo.',
   'GPA, "last quarter", finals, IXL (a US maths website): use your school system.'),
  (14, 'c66b71ce-a847-4d23-a445-499428f18fe3'::uuid, 'sophia', 'forme', null,
   'Knowing things is what makes people take him seriously, and Sophia is how he learns them. Short, sober sentences. On one of the last 3 slides.',
   'The social rules themselves (they start cleaning = time to leave; return a car with a full tank), "Bet."'),
  (15, '367627d1-175c-4fe0-8fff-45c923d6906d'::uuid, 'sophia', 'libre', null, '',
   'Don''t translate the words: pick 5 rare, elegant words of your language, with how to say them. The last slide "Follow for more daily words! Part 6".')
) as k (rang, contenu_id, slug, voie, slide_cta, consigne, a_adapter)
join public.contenus c on c.id = k.contenu_id
join public.applications a on a.slug = k.slug
left join public.contenu_langues cl on cl.contenu_id = c.id and cl.langue = 'en'
on conflict (rang) do nothing;
