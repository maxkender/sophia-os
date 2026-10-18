-- 0301 : warm-up jusqu'au lundi pour tous les posters (ticket Aram, 17/10).
--
-- Avant : « Start warmup » lançait un minuteur de 24 h (réglage `warmup`), et
-- les posts arrivaient la nuit suivant sa fin, n'importe quel jour. D'où des
-- règles à expliquer, des posters qui postaient trop tôt, des questions.
--
-- Maintenant : un clic sur « Start warmup », sans minuteur à surveiller. Le
-- warm-up dure jusqu'au LUNDI qui suit le clic, 00:00 heure de Paris, et les
-- premiers posts arrivent ce lundi-là. Lancé avant dimanche minuit : posts le
-- lundi qui vient ; lancé le lundi : posts le lundi d'après. Pas de minimum de
-- 24 h : lancé le dimanche à 23 h, les posts arrivent le lendemain.
--
-- Même mécanique que la cohorte Ruul (0296) : un trigger sur `comptes` repousse
-- `warmup_ends_at`, rien d'autre ne change (l'assignation lit toujours
-- `warmup_ends_at <= now()`). Les posters de la cohorte Ruul ne sont PAS
-- concernés : leur trigger et leur lundi de démarrage (`debut_le`) restent
-- tels quels. Le « skip warmup » de l'admin (fin = maintenant) n'est pas
-- touché, ni les comptes CM (pas de warm-up).
--
-- Les 24 warm-up déjà en cours (minuteur 24 h, fin avant lundi matin) ne sont
-- pas réécrits.
--
-- Retour arrière : `drop trigger comptes_warmup_jusqu_au_lundi on
-- public.comptes; drop function public.warmup_jusqu_au_lundi();`

create or replace function public.warmup_jusqu_au_lundi()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_jour date;
begin
  if new.warmup_ends_at is null
     or new.warmup_ends_at <= now()
     or new.warmup_ends_at is not distinct from old.warmup_ends_at
     or new.type_compte is distinct from 'perso' then
    return new;
  end if;
  -- Cohorte Ruul : son propre lundi (0296).
  if exists (
    select 1 from public.hub_posteurs h
    where h.profile_id = new.poster_id and h.statut = 'cree'
  ) then
    return new;
  end if;
  -- Jour du clic à Paris, puis le lundi qui suit (isodow : lundi 1 → +7,
  -- dimanche 7 → +1).
  v_jour := (coalesce(new.warmup_started_at, now()) at time zone 'Europe/Paris')::date;
  new.warmup_ends_at :=
    (v_jour + (8 - extract(isodow from v_jour))::int)::timestamp at time zone 'Europe/Paris';
  return new;
end;
$$;

drop trigger if exists comptes_warmup_jusqu_au_lundi on public.comptes;
create trigger comptes_warmup_jusqu_au_lundi
  before update of warmup_ends_at on public.comptes
  for each row execute function public.warmup_jusqu_au_lundi();
