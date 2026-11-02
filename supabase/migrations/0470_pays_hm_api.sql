-- 0470 — Pays et HM du nouveau posteur, à partir de l'API.
--
-- - accueils : ce que l'API dit du contrat : où vit le freelance (pays, ville,
--   la requête qui a marché), la HM du contrat (hiringManager) et le
--   superviseur avec leurs noms, d'où vient le pays (main, annonce, freelance)
--   et l'écart « Lives in X, job post Y » (Onboarding posters).
-- - upwork_contrats.freelancer_ville (freelancer_pays existe depuis 0387).
-- - hm_upwork : les HM Upwork vues sur les contrats (id, nom) ; hm_id se met à
--   la main si le nom ne suffit pas (sinon : même prénom, même initiale).
-- - needs_you : la carte « Contract to link » montre l'équipe Upwork du contrat
--   et où vit le freelance ; nouvelle alerte « contrat_hors_vik » quand un
--   contrat de posteur est créé hors de « VIk Studios ».
--
-- Additive : colonnes, 1 table, needs_you modifiée. Aucune donnée existante modifiée.

alter table public.accueils
  add column if not exists freelance_pays text,
  add column if not exists freelance_ville text,
  add column if not exists freelance_requete text,
  add column if not exists freelance_lu_at timestamptz,
  add column if not exists hm_upwork_nom text,
  add column if not exists superviseur_upwork_id text,
  add column if not exists superviseur_upwork_nom text,
  add column if not exists pays_source text,
  add column if not exists ecart_pays text;

alter table public.upwork_contrats add column if not exists freelancer_ville text;

create table if not exists public.hm_upwork (
  upwork_id text primary key,
  nom text,
  hm_id uuid references public.profiles(id) on delete set null,
  vu_at timestamptz not null default now()
);
alter table public.hm_upwork enable row level security;
create policy "hm_upwork lecture" on public.hm_upwork for select using ((select public.is_admin()));

-- Les HM déjà vues sur les contrats lus (journal des appels), sans HM de l'OS : le nom suffit.
insert into public.hm_upwork (upwork_id, nom)
select distinct on (x.id) x.id, x.nom
  from (select a.reponse->'data'->'contractDetails'->'hiringManager'->>'id' as id,
               a.reponse->'data'->'contractDetails'->'hiringManager'->>'name' as nom, a.at
          from public.upwork_appels a
         where a.action = 'accueil_contrat' and a.reponse->'data'->'contractDetails'->'hiringManager'->>'id' is not null) x
 order by x.id, x.at desc
on conflict (upwork_id) do nothing;

do $p$
declare
  v_def text := pg_get_functiondef('public.needs_you()'::regprocedure);
  v_vu text := $a$format('Contrat %s%s', a.contrat_id, coalesce(' · ' || a.job_titre, ''))$a$;
  v_vu_neuf text := $a$format('Contract %s%s · Team: %s%s', a.contrat_id, coalesce(' · ' || a.job_titre, ''),
                  coalesce((select btrim(uc.organisation_nom) from public.upwork_contrats uc
                             where uc.contrat_id = a.contrat_id order by uc.lu_at desc limit 1), '?'),
                  coalesce(' · lives in ' || nullif(concat_ws(', ', a.freelance_ville, a.freelance_pays), ''), ''))$a$;
  v_ancre text := $a$    union all
    select 'samedi:' || cp.id$a$;
  v_ajout text := $a$    union all
    select 'hors_vik:' || a.contrat_id, 'bloque', 'contrat_hors_vik', a.poster_id, nullif(btrim(concat_ws(' ', a.prenom, a.nom)), ''),
           format('Contract %s · team « %s », not « VIk Studios »%s', a.contrat_id, btrim(uc.organisation_nom), coalesce(' · ' || a.job_titre, '')),
           'A poster contract was created outside « VIk Studios ». Payroll, closing and messages use this team''s Upwork access. Check it is on purpose.',
           null, 'rien', coalesce(a.created_at, uc.debut_at), array['ouvrir', 'ignorer'], a.contrat_id,
           'https://www.upwork.com/nx/wm/workroom/' || a.contrat_id || '/overview', null, 1
      from public.accueils a
      join lateral (select u.organisation_nom, u.debut_at from public.upwork_contrats u
                     where u.contrat_id = a.contrat_id and u.actif order by u.lu_at desc limit 1) uc on true
     where btrim(coalesce(uc.organisation_nom, '')) !~* '^vik studios$'
       and coalesce(a.job_titre, '') ~* 'tiktok|slideshow|poster'
$a$;
begin
  if (length(v_def) - length(replace(v_def, v_vu, ''))) / length(v_vu) <> 1 then
    raise exception '0470 : needs_you : la carte accueil (format Contrat) est introuvable ou en double';
  end if;
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) / length(v_ancre) <> 1 then
    raise exception '0470 : needs_you : l''ancre samedi est introuvable ou en double';
  end if;
  v_def := replace(v_def, v_vu, v_vu_neuf);
  execute replace(v_def, v_ancre, v_ajout || v_ancre);
end;
$p$;

notify pgrst, 'reload schema';
