-- 0340 : le créateur peut contester un retour (« ce retour est faux »), et
-- l'admin vérifie sur /admin/retours-contestes.
--
-- Depuis 0296, l'agent de relecture envoie lui-même ses retours : il se
-- trompe parfois (mesure ratée, original mal assigné). Le créateur le dit
-- depuis le retour, en un mot s'il veut ; l'admin regarde les deux TikToks,
-- tranche (le créateur a raison, ou le retour était juste) et peut lui
-- répondre. Le créateur voit la réponse dans « Mes retours ». Pour un retour
-- de l'agent, l'admin juge aussi chaque point (relecture_avis, 0293) : ça
-- nourrit les comptes du banc d'essai.

alter table public.reviews add column if not exists contestee_at timestamptz;
-- Ce que le créateur dit du retour (facultatif).
alter table public.reviews add column if not exists contestation text;
-- La décision de l'admin : « fondee » (le créateur a raison, le retour était
-- faux) ou « non_fondee » (le retour était juste). Null tant que personne n'a tranché.
alter table public.reviews add column if not exists contestation_verdict text;
alter table public.reviews drop constraint if exists reviews_contestation_verdict_check;
alter table public.reviews add constraint reviews_contestation_verdict_check
  check (contestation_verdict in ('fondee', 'non_fondee'));
alter table public.reviews add column if not exists contestation_traitee_at timestamptz;
alter table public.reviews add column if not exists contestation_admin_id uuid references auth.users (id) on delete set null;
-- Réponse de l'admin au créateur (facultative), montrée dans « Mes retours ».
alter table public.reviews add column if not exists contestation_reponse text;

create index if not exists reviews_contestees_idx
  on public.reviews (contestee_at) where contestee_at is not null;

comment on column public.reviews.contestee_at is
  'Le créateur a contesté le retour (« ce retour est faux »). Voir 0340 et /admin/retours-contestes.';

-- Garde-fou : la policy reviews_poster_update (0114) laisse le créateur
-- modifier toute sa ligne. Il ne doit pouvoir que la marquer vue et la
-- contester, une seule fois ; le verdict et la réponse restent à l'admin.
create or replace function public.reviews_garde_createur()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  modifiables constant text[] := array['seen_at', 'contestee_at', 'contestation'];
begin
  -- Fonctions Edge (service_role), SQL d'admin, migrations : pas de garde.
  if current_user not in ('authenticated', 'anon') or public.is_admin() then
    return new;
  end if;
  if (to_jsonb(new) - modifiables) is distinct from (to_jsonb(old) - modifiables) then
    raise exception 'un créateur ne peut que marquer son retour vu ou le contester';
  end if;
  if old.contestee_at is not null then
    if new.contestee_at is distinct from old.contestee_at or new.contestation is distinct from old.contestation then
      raise exception 'retour déjà contesté';
    end if;
  elsif new.contestee_at is not null then
    -- L'heure vient du serveur, et le mot du créateur est borné.
    new.contestee_at := now();
    new.contestation := nullif(left(btrim(coalesce(new.contestation, '')), 2000), '');
  elsif new.contestation is not null then
    raise exception 'contestation sans date';
  end if;
  return new;
end;
$$;

drop trigger if exists reviews_garde_createur on public.reviews;
create trigger reviews_garde_createur
  before update on public.reviews
  for each row execute function public.reviews_garde_createur();
