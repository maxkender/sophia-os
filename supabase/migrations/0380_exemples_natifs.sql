-- 0380 : Relecture native · la banque d'exemples natifs (29/10).
--
-- Une vingtaine de slideshows écrits par de vrais créateurs de chaque langue,
-- tous labels confondus, pour que la traduction ancrée
-- (`_shared/traduction_native.ts`) sonne native même sans relecteur. Jusqu'ici
-- les ancres ne venaient que de nos propres imports, presque tous en anglais
-- et en français : aucune ancre en allemand, en turc…
--
-- L'admin colle des liens TikTok (ou des comptes) ; la fonction
-- `exemples-natifs` récupère les slides via Apify et en lit le texte (OCR).
-- Ces slideshows ne sont PAS des contenus : ils ne passent jamais dans le
-- moteur et ne sont jamais publiés. Ils servent seulement d'exemples de style.
--
-- Retour arrière : drop table public.exemples_natifs;

create table if not exists public.exemples_natifs (
  id          uuid primary key default gen_random_uuid(),
  langue      text not null,
  source_url  text not null,
  handle      text,
  label_id    uuid references public.labels (id) on delete set null,
  slides      jsonb not null default '[]'::jsonb,
  vues        bigint,
  statut      text not null default 'en_attente'
                check (statut in ('en_attente', 'pret', 'erreur')),
  erreur      text,
  created_by  uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (langue, source_url)
);

comment on table public.exemples_natifs is
  'Banque d''exemples natifs (0380) : slideshows de créateurs natifs, par langue, lus par la traduction ancrée. Jamais publiés.';
comment on column public.exemples_natifs.slides is
  'Le texte de chaque slide, lu par OCR : [{position, texte}].';
comment on column public.exemples_natifs.statut is
  'en_attente : lien collé, pas encore lu ; pret : texte lu ; erreur : voir la colonne erreur.';

create index if not exists exemples_natifs_langue on public.exemples_natifs (langue, statut);

drop trigger if exists exemples_natifs_horodater on public.exemples_natifs;
create trigger exemples_natifs_horodater
  before update on public.exemples_natifs
  for each row execute function public.kit_natif_horodater();

alter table public.exemples_natifs enable row level security;

do $$
begin
  -- L'admin seulement ; la fonction passe par le service.
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'exemples_natifs'
                  and policyname = 'exemples_natifs admin') then
    create policy "exemples_natifs admin" on public.exemples_natifs
      for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
  end if;
end;
$$;
