-- 0677 : « OS clair », partie 1 (Max, 12/11). Menu à 7 entrées et section Support.
-- 1. support_consignes : les consignes de Max au bot, en une phrase, avec on/off,
--    historique et retour arrière. Le bot les lit à chaque réponse.
-- 2. support_demandes_de(poster) : l'espace Help d'un posteur, vu par l'admin (aperçu).
-- 3. os_aujourdhui() : les chiffres de la page « Aujourd'hui ».
-- 4. support_infos (Règles qui changent) : 3 règles connues ajoutées (jour de paie,
--    lien du dashboard, fin de collaboration) ; les autres, Max les ajoute lui-même.
-- Additif : deux tables, des fonctions, trois lignes de règles.

-- 1. Consignes -----------------------------------------------------------------
create table if not exists public.support_consignes (
  id       uuid primary key default gen_random_uuid(),
  texte    text not null,
  actif    boolean not null default true,
  cree_at  timestamptz not null default now(),
  cree_par uuid,
  maj_at   timestamptz not null default now(),
  maj_par  uuid
);
create table if not exists public.support_consignes_historique (
  id          uuid primary key default gen_random_uuid(),
  consigne_id uuid not null,
  avant       jsonb,
  apres       jsonb,
  par         uuid,
  at          timestamptz not null default now()
);
alter table public.support_consignes enable row level security;
alter table public.support_consignes_historique enable row level security;
revoke all on public.support_consignes, public.support_consignes_historique from anon;
grant select on public.support_consignes, public.support_consignes_historique to authenticated;
do $p$
begin
  if not exists (select 1 from pg_policies where tablename = 'support_consignes' and policyname = 'support_consignes_admin') then
    create policy support_consignes_admin on public.support_consignes for select to authenticated using (public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'support_consignes_historique' and policyname = 'support_consignes_historique_admin') then
    create policy support_consignes_historique_admin on public.support_consignes_historique for select to authenticated using (public.is_admin());
  end if;
end
$p$;

create or replace function public.support_consignes_journal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.support_consignes_historique (consigne_id, avant, apres, par)
  values (new.id, case when tg_op = 'UPDATE' then to_jsonb(old) end, to_jsonb(new), auth.uid());
  return new;
end;
$$;
revoke execute on function public.support_consignes_journal() from public, anon, authenticated;
create or replace trigger support_consignes_journal
  after insert or update on public.support_consignes
  for each row execute function public.support_consignes_journal();

/* Ajoute (p_id null) ou modifie une consigne. */
create or replace function public.support_consigne_enregistrer(p_id uuid, p_texte text, p_actif boolean)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_admin_strict() then raise exception 'réservé aux admins' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_texte, ''))) < 3 then raise exception 'consigne vide'; end if;
  if p_id is null then
    insert into public.support_consignes (texte, actif, cree_par, maj_par)
    values (btrim(p_texte), coalesce(p_actif, true), auth.uid(), auth.uid())
    returning id into v_id;
  else
    update public.support_consignes
       set texte = btrim(p_texte), actif = coalesce(p_actif, actif), maj_at = now(), maj_par = auth.uid()
     where id = p_id
    returning id into v_id;
    if v_id is null then raise exception 'consigne introuvable'; end if;
  end if;
  return v_id;
end;
$$;

/* Retour arrière : la consigne reprend son état d'avant une modification. */
create or replace function public.support_consigne_restaurer(p_historique uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  h public.support_consignes_historique%rowtype;
begin
  if not public.is_admin_strict() then raise exception 'réservé aux admins' using errcode = '42501'; end if;
  select * into h from public.support_consignes_historique where id = p_historique;
  if not found or h.avant is null then raise exception 'rien à restaurer'; end if;
  update public.support_consignes
     set texte = h.avant->>'texte', actif = coalesce((h.avant->>'actif')::boolean, true), maj_at = now(), maj_par = auth.uid()
   where id = h.consigne_id;
end;
$$;

revoke execute on function public.support_consigne_enregistrer(uuid, text, boolean) from public, anon;
revoke execute on function public.support_consigne_restaurer(uuid) from public, anon;
grant execute on function public.support_consigne_enregistrer(uuid, text, boolean) to authenticated;
grant execute on function public.support_consigne_restaurer(uuid) to authenticated;

-- 2. Aperçu posteur -------------------------------------------------------------
/* L'espace Help d'un posteur tel qu'il le voit (sans le brouillon de l'équipe), pour l'admin. */
create or replace function public.support_demandes_de(p_poster uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', d.id, 'type', d.type, 'categorie', d.categorie, 'texte', d.texte, 'statut', d.statut,
           'equipe_a_repondu', d.equipe_at is not null, 'cree_at', d.cree_at, 'resolu_at', d.resolu_at,
           'messages', coalesce((select jsonb_agg(jsonb_build_object('auteur', m.auteur, 'texte', m.texte, 'cree_at', m.cree_at) order by m.cree_at)
                                   from public.support_messages m where m.demande_id = d.id), '[]'::jsonb))
           order by d.cree_at desc), '[]'::jsonb)
    from (select * from public.support_demandes where poster_id = p_poster order by cree_at desc limit 100) d
   where public.is_admin();
$$;
revoke execute on function public.support_demandes_de(uuid) from public, anon;
grant execute on function public.support_demandes_de(uuid) to authenticated;

-- 3. Aujourd'hui ----------------------------------------------------------------
create or replace function public.os_aujourdhui()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'pour_max', (select count(*) from public.support_demandes where niveau = 'max' and statut in ('ouvert', 'attente_posteur')),
    'pour_adrien', (select count(*) from public.support_demandes where coalesce(niveau, 'adrien') = 'adrien'
                      and escalade_at is not null and statut in ('ouvert', 'attente_posteur')),
    'ruul_a_inviter', (select count(*) from public.profiles where canal_paie = 'ruul' and is_active and ruul_statut = 'a_ajouter'))
  where public.is_admin();
$$;
revoke execute on function public.os_aujourdhui() from public, anon;
grant execute on function public.os_aujourdhui() to authenticated;

-- 4. Règles qui changent : 3 règles connues --------------------------------------
insert into public.support_infos (cle, titre, valeur, ordre) values
  ('jour_paie', 'Jour de paie', 'Every Monday, for the week of posts that just ended (Monday to Sunday).', 5),
  ('lien_dashboard', 'Lien du dashboard', 'https://sophia-marketing-orga.vercel.app', 55),
  ('fin_collaboration', 'Fin de collaboration', 'When the collaboration ends, the last week of posts is paid.', 75)
on conflict (cle) do nothing;
