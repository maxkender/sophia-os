-- 0476 — Quality Control (Tracking) et paiements à faire à la main (liste de paie du lundi).
--
-- Quality Control : chaque jour, 10 posts au hasard par label parmi ceux
-- publiés la veille (heure de Paris), le texte des slides traduit en anglais
-- (fonction ckd, action qc_traduire ; cron le matin, ou bouton de la page).
-- « Report a problem on post » : un signalement (motif + note) par post.
--
-- Paiements à la main : un montant détaillé (lignes) à payer hors de l'API,
-- affiché en haut de la liste de paie ; « Mark as paid » le note payé (aucun
-- argent ne part de l'OS).
--
-- Additive : 3 tables, 6 fonctions, 1 cron (commande reprise d'un cron ckd,
-- seule l'action change). Aucune donnée existante modifiée.

create table if not exists public.paie_manuels (
  id uuid primary key default gen_random_uuid(),
  poster_id uuid references public.profiles(id),
  contrat_id text,
  montant numeric not null check (montant > 0),
  lignes jsonb not null default '[]'::jsonb,
  note text,
  semaine date,
  cree_par uuid,
  cree_at timestamptz not null default now(),
  fait_at timestamptz,
  fait_par uuid
);
alter table public.paie_manuels enable row level security;

create or replace function public.paie_manuels_liste()
returns table (id uuid, poster_id uuid, poster_nom text, contrat_id text, montant numeric, lignes jsonb, note text,
               semaine date, cree_at timestamptz, fait_at timestamptz, fait_par_nom text, lien text)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not (public.is_admin() or exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'head_of_ops')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select m.id, m.poster_id, nullif(btrim(concat_ws(' ', p.prenom, p.nom)), ''), m.contrat_id, m.montant, m.lignes, m.note,
         m.semaine, m.cree_at, m.fait_at,
         (select nullif(btrim(concat_ws(' ', f.prenom, f.nom)), '') from public.profiles f where f.id = m.fait_par),
         case when m.contrat_id is not null then 'https://www.upwork.com/nx/wm/workroom/' || m.contrat_id || '/overview' end
    from public.paie_manuels m
    left join public.profiles p on p.id = m.poster_id
   where m.fait_at is null or m.fait_at > now() - interval '7 days'
   order by (m.fait_at is not null), m.cree_at;
end;
$$;
revoke all on function public.paie_manuels_liste() from public, anon;
grant execute on function public.paie_manuels_liste() to authenticated;

create or replace function public.paie_manuel_fait(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.is_admin() or exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'head_of_ops')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.paie_manuels set fait_at = now(), fait_par = auth.uid() where id = p_id and fait_at is null;
end;
$$;
revoke all on function public.paie_manuel_fait(uuid) from public, anon;
grant execute on function public.paie_manuel_fait(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Quality Control
-- ---------------------------------------------------------------------------

create table if not exists public.qc_echantillons (
  id uuid primary key default gen_random_uuid(),
  jour date not null,
  label_id uuid,
  label_nom text,
  passage_id uuid not null,
  langue text,
  compte_handle text,
  publie_url text,
  textes_orig jsonb not null default '[]'::jsonb,
  textes_en jsonb,
  traduit_at timestamptz,
  erreur text,
  cree_at timestamptz not null default now(),
  unique (jour, passage_id)
);
alter table public.qc_echantillons enable row level security;
create index if not exists qc_echantillons_jour on public.qc_echantillons (jour);

create table if not exists public.qc_signalements (
  id uuid primary key default gen_random_uuid(),
  echantillon_id uuid not null references public.qc_echantillons(id),
  passage_id uuid not null,
  motif text not null check (motif in ('no_cta', 'bad_translation', 'wrong_app', 'text_error', 'other')),
  note text,
  cree_par uuid,
  cree_at timestamptz not null default now()
);
alter table public.qc_signalements enable row level security;
create index if not exists qc_signalements_echantillon on public.qc_signalements (echantillon_id);

-- Le tirage du jour : 10 posts au hasard par label parmi les passages publiés
-- ce jour-là (heure de Paris). Déjà tiré : rien ne change (idempotent).
create or replace function public.qc_tirer(p_jour date)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  if not (public.is_admin() or coalesce(auth.role(), '') = 'service_role'
          or exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'head_of_ops')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if exists (select 1 from public.qc_echantillons e where e.jour = p_jour) then
    return 0;
  end if;
  insert into public.qc_echantillons (jour, label_id, label_nom, passage_id, langue, compte_handle, publie_url, textes_orig)
  select p_jour, x.label_id, x.label_nom, x.id, x.langue, x.handle, x.publie_url, x.textes
    from (
      select pa.id, pa.langue, pa.publie_url, l.id as label_id, l.nom as label_nom, c.handle_tiktok as handle,
             (select coalesce(jsonb_agg(jsonb_build_object(
                       'position', s ->> 'position',
                       'texte', coalesce(s ->> 'texte_overlay', ''),
                       'appli', coalesce((s ->> 'position_sophia')::boolean, false))
                     order by (s ->> 'position')::int nulls last), '[]'::jsonb)
                from jsonb_array_elements(case when jsonb_typeof(pa.slides) = 'array' then pa.slides else '[]'::jsonb end) s) as textes,
             row_number() over (partition by l.id order by random()) as rang
        from public.passages pa
        join public.contenu_labels cl on cl.contenu_id = pa.contenu_id
        join public.labels l on l.id = cl.label_id
        left join public.comptes c on c.id = pa.compte_id
       where pa.publie_at >= (p_jour::timestamp at time zone 'Europe/Paris')
         and pa.publie_at < ((p_jour + 1)::timestamp at time zone 'Europe/Paris')
         and jsonb_typeof(pa.slides) = 'array'
         and jsonb_array_length(pa.slides) > 0
    ) x
   where x.rang <= 10;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.qc_tirer(date) from public, anon;
grant execute on function public.qc_tirer(date) to authenticated, service_role;

create or replace function public.qc_liste(p_jour date)
returns table (id uuid, jour date, label_nom text, passage_id uuid, langue text, compte_handle text, publie_url text,
               textes_orig jsonb, textes_en jsonb, traduit_at timestamptz, erreur text, signalements jsonb)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not (public.is_admin() or exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'head_of_ops')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select e.id, e.jour, e.label_nom, e.passage_id, e.langue, e.compte_handle, e.publie_url, e.textes_orig, e.textes_en,
         e.traduit_at, e.erreur,
         (select coalesce(jsonb_agg(jsonb_build_object('motif', s.motif, 'note', s.note, 'at', s.cree_at,
                                                       'par', (select nullif(btrim(concat_ws(' ', p.prenom, p.nom)), '') from public.profiles p where p.id = s.cree_par))
                                    order by s.cree_at), '[]'::jsonb)
            from public.qc_signalements s where s.echantillon_id = e.id)
    from public.qc_echantillons e
   where e.jour = p_jour
   order by e.label_nom, e.langue, e.passage_id;
end;
$$;
revoke all on function public.qc_liste(date) from public, anon;
grant execute on function public.qc_liste(date) to authenticated;

create or replace function public.qc_signaler(p_echantillon uuid, p_motif text, p_note text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_passage uuid;
begin
  if not (public.is_admin() or exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'head_of_ops')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select e.passage_id into v_passage from public.qc_echantillons e where e.id = p_echantillon;
  if v_passage is null then
    raise exception 'post introuvable';
  end if;
  insert into public.qc_signalements (echantillon_id, passage_id, motif, note, cree_par)
  values (p_echantillon, v_passage, p_motif, nullif(btrim(coalesce(p_note, '')), ''), auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.qc_signaler(uuid, text, text) from public, anon;
grant execute on function public.qc_signaler(uuid, text, text) to authenticated;

-- Les signalements récents, tous jours confondus (bas de la page).
create or replace function public.qc_signalements_recents(p_jours int default 14)
returns table (id uuid, jour date, label_nom text, langue text, compte_handle text, publie_url text, motif text, note text,
               cree_at timestamptz, par text)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not (public.is_admin() or exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'head_of_ops')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select s.id, e.jour, e.label_nom, e.langue, e.compte_handle, e.publie_url, s.motif, s.note, s.cree_at,
         (select nullif(btrim(concat_ws(' ', p.prenom, p.nom)), '') from public.profiles p where p.id = s.cree_par)
    from public.qc_signalements s
    join public.qc_echantillons e on e.id = s.echantillon_id
   where s.cree_at > now() - make_interval(days => greatest(1, least(coalesce(p_jours, 14), 90)))
   order by s.cree_at desc;
end;
$$;
revoke all on function public.qc_signalements_recents(int) from public, anon;
grant execute on function public.qc_signalements_recents(int) to authenticated;

-- Le matin (Paris), le tirage de la veille et sa traduction.
do $c$
declare
  v text;
begin
  select regexp_replace(j.command, '"action"\s*:\s*"releve_warmup_planifie"', '"action":"qc_traduire"') into v
    from cron.job j where j.jobname = 'ckd-warmup-releve';
  if v is null or v !~ '"action":"qc_traduire"' then
    raise exception '0476 : commande du cron ckd-warmup-releve introuvable';
  end if;
  if not exists (select 1 from cron.job where jobname = 'qc-traduire-matin') then
    perform cron.schedule('qc-traduire-matin', '*/10 5,6 * * *', v);
  end if;
end;
$c$;

notify pgrst, 'reload schema';
