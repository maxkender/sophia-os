-- 0515 — Corrections du 02/11 (bloc A).
--
-- 1. paie_jalons_semaine (contrat, milestone, semaine comptée) : un milestone
--    payé ou financé à la main sous le nom d'une autre semaine compte pour la
--    semaine dite ici, pas pour celle de son nom. La paie (plan, simulation,
--    relecture, réponse « suis-je payé ? ») lit cette table : sans elle, la
--    paie du 9/11 verrait « Week 45 » payée le 2/11 pour la semaine du 26/10 et
--    marquerait la semaine du 2/11 « déjà payée » (Ramazan, Selin), ou
--    bloquerait sur « Week 46 » financée qui paie la semaine du 2/11 (Alina).
--    Les lignes du 02/11 sont ajoutées ici (milestones lus chez Upwork le 02/11).
-- 2. lundi_soir_posteurs : jamais de check du lundi soir pour une recrue
--    « Start Tuesday » ou « Postpone » (choix du dimanche).
--
-- Additif : une table, une fonction modifiée par remplacement d'un morceau
-- (la migration échoue s'il n'est pas trouvé). Aucune ligne existante touchée.

create table if not exists public.paie_jalons_semaine (
  jalon_id    text primary key,
  contrat_id  text not null,
  nom         text,
  semaine     date not null check (extract(isodow from semaine) = 1),
  raison      text not null,
  cree_at     timestamptz not null default now(),
  cree_par    uuid,
  annule_at   timestamptz
);
create index if not exists paie_jalons_semaine_contrat on public.paie_jalons_semaine (contrat_id) where annule_at is null;
alter table public.paie_jalons_semaine enable row level security;
do $p$
begin
  if not exists (select 1 from pg_policies where tablename = 'paie_jalons_semaine' and policyname = 'paie_jalons_semaine_admin') then
    create policy paie_jalons_semaine_admin on public.paie_jalons_semaine for select to authenticated using (public.is_admin());
  end if;
end
$p$;

insert into public.paie_jalons_semaine (jalon_id, contrat_id, nom, semaine, raison) values
  ('52629401', '44735138', 'Week 45', '2026-10-26', 'Payé à la main le 02/11 (Pay Bot) pour la semaine du 26/10'),
  ('52513920', '44690085', 'Week 45', '2026-10-26', 'Payé à la main le 02/11 (Pay Bot) pour la semaine du 26/10'),
  ('52788812', '44039601', 'Week 45', '2026-10-26', 'Payé à la main le 02/11 (Pay Bot) pour la semaine du 26/10'),
  ('52567377', '44465474', 'Week 45', '2026-10-26', 'Complément 2e compte payé à la main le 02/11 pour la semaine du 26/10'),
  ('52568109', '44514063', 'Week 45', '2026-10-26', 'Complément 2e compte payé à la main le 02/11 pour la semaine du 26/10'),
  ('52567821', '44216733', 'Week 47', '2026-10-26', 'Payé à la main le 02/11 (Pay Bot) pour la semaine du 26/10'),
  ('52568110', '44514063', 'Week 46', '2026-11-02', 'Financé (7 $) : compte comme la semaine du 2/11 (décision de Max, 02/11)')
on conflict (jalon_id) do nothing;

do $m$
declare
  v_def text;
  a text := $a$     and (ca.deuxieme or not exists (select 1 from public.recrues_rouges rr
                                      where rr.poster_id = ca.poster_id and rr.periode = p_lundi));$a$;
  b text := $b$     and (ca.deuxieme or not exists (select 1 from public.recrues_rouges rr
                                      where rr.poster_id = ca.poster_id and rr.periode = p_lundi))
     -- 0515 : jamais pour une recrue « Start Tuesday » ou « Postpone » (choix du dimanche).
     and not exists (select 1 from public.debut_choix dc
                      where dc.poster_id = ca.poster_id and dc.lundi = p_lundi and dc.choix in ('mardi', 'reporter'));$b$;
begin
  v_def := pg_get_functiondef('public.lundi_soir_posteurs(date)'::regprocedure);
  if position('0515 :' in v_def) > 0 then
    return;
  end if;
  if position(a in v_def) = 0 then
    raise exception '0515 : morceau introuvable dans lundi_soir_posteurs';
  end if;
  execute replace(v_def, a, b);
end
$m$;

notify pgrst, 'reload schema';
