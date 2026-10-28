-- 0408 — Pipeline, partie 2 : le check du lundi soir.
--
-- Chaque lundi à 20 h (heure du pays), la nouvelle cohorte (1er compte) et les
-- 2es comptes qui démarrent ce lundi : aucun post publié avec son lien ce
-- jour-là → un seul message, sur Upwork (réglage `lundi_soir_texte`). C'est
-- l'étape 6 du pipeline (carte orange). 48 h après, ni post ni réponse → Kill
-- automatique (`kill_auto`, 12 h pour annuler) ; un 2e compte : seul ce compte
-- s'arrête. Un post ou une réponse → plus de Kill.
-- Interrupteur `lundi_soir_auto` : off | test | on, défaut test (le message
-- est « prévu », rien ne part).
--
-- Additive : réglages, une colonne, une valeur de plus dans un check, une
-- fonction. Aucune donnée existante modifiée.
-- Retour arrière : drop function lundi_soir_posteurs ; alter table kills_auto
-- drop column compte_id ; remettre le check de kills_auto.etape sans
-- 'lundi_soir' ; delete des réglages lundi_soir_* et rappels_reprise_le.

insert into public.reglages (cle, valeur) values
  ('lundi_soir_auto', to_jsonb('test'::text)),
  ('lundi_soir_heure', to_jsonb(20)),
  ('lundi_soir_texte', to_jsonb(
    'Hi {prenom}, today is your first posting day and we don''t see any post on your dashboard yet. You still have until midnight: publish your 2 slideshows and paste each link on your dashboard. If something is blocking you, reply here.'::text))
on conflict (cle) do nothing;

-- Les rappels en pause jusqu'au lundi 2 nov. (minuit, Paris) : la cohorte du
-- 2 nov. est encore suivie par les HM. Ni message d'étape, ni message du
-- lundi, ni Nudge du jeudi, ni check du lundi soir, ni Kill automatique.
-- Vide : pas de pause. Modifiable dans Réglages → Interrupteurs.
insert into public.reglages (cle, valeur) values
  ('rappels_reprise_le', to_jsonb('2026-11-02'::text))
on conflict (cle) do nothing;

-- Le Kill du lundi soir : une étape de plus ; et, pour un 2e compte, le compte visé.
do $$
declare
  c text;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.kills_auto'::regclass and contype = 'c'
              and pg_get_constraintdef(oid) like '%etape%'
  loop
    execute format('alter table public.kills_auto drop constraint %I', c);
  end loop;
  alter table public.kills_auto add constraint kills_auto_etape_check
    check (etape in ('connexion', 'tiktok', 'warmup_lance', 'warmup_bien_fait', 'lundi_soir'));
end
$$;

alter table public.kills_auto add column if not exists compte_id uuid references public.comptes (id) on delete set null;

comment on column public.kills_auto.compte_id is
  'Pipeline, partie 2 (0408) : le Kill du lundi soir d''un 2e compte n''arrête que ce compte.';

-- ---------------------------------------------------------------------------
-- Les recrues du lundi `p_lundi` (recrues-check) : la cohorte (1er compte) et
-- les 2es comptes qui démarrent ce lundi ; leurs posts publiés ce jour-là,
-- le message (envoyé, ou prévu en test), la dernière réponse, le Kill.
-- ---------------------------------------------------------------------------
create or replace function public.lundi_soir_posteurs(p_lundi date)
returns table (
  poster_id       uuid,
  compte_id       uuid,
  deuxieme        boolean,
  prenom          text,
  fuseau          text,
  contrat_id      text,
  publies_lundi   integer,
  dernier_post_at timestamptz,
  message_at      timestamptz,
  message_id      uuid,
  message_erreur  text,
  prevu_at        timestamptz,
  repondu_at      timestamptz,
  kill_id         uuid,
  kill_statut     text
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if extract(isodow from p_lundi) <> 1 then
    raise exception 'lundi_soir_posteurs : % n''est pas un lundi', p_lundi;
  end if;
  return query
  with cartes as (
    -- La cohorte : son 1er compte.
    select pr.id as poster_id, c1.id as compte_id, false as deuxieme
      from public.profiles pr
      left join lateral (select c.id from public.comptes c where c.poster_id = pr.id and c.type_compte = 'perso'
                          order by c.created_at limit 1) c1 on true
     where pr.is_active and pr.cohorte_lundi = p_lundi
       and exists (select 1 from public.user_roles r where r.user_id = pr.id and r.role = 'poster')
    union all
    -- Les 2es comptes dont le 1er jour de posts tombe cette semaine.
    select c.poster_id, c.id, true
      from public.comptes c
      join public.profiles pr on pr.id = c.poster_id and pr.is_active
      left join public.comptes_premier_jour pj on pj.compte_id = c.id
     where c.type_compte = 'perso' and c.is_active
       and coalesce(pj.premier_jour - (extract(isodow from pj.premier_jour)::int - 1),
                    (c.warmup_ends_at at time zone 'Europe/Paris')::date) = p_lundi
       and exists (select 1 from public.comptes d where d.poster_id = c.poster_id and d.id <> c.id
                     and d.type_compte = 'perso' and d.created_at < c.created_at)
  )
  select ca.poster_id, ca.compte_id, ca.deuxieme, pr.prenom,
         case when cpt.pays is null then 'Europe/Paris' else public.fuseau_pays(cpt.pays) end,
         pr.upwork_contract_id,
         (select count(*) from public.passages p
           where p.compte_id = ca.compte_id and p.publie_url is not null
             and (p.date_publication_prevue = p_lundi
                  or (coalesce(p.publie_at, p.created_at)
                      at time zone (case when cpt.pays is null then 'Europe/Paris' else public.fuseau_pays(cpt.pays) end))::date = p_lundi))::int,
         (select max(coalesce(p.publie_at, p.created_at)) from public.passages p
           where p.compte_id = ca.compte_id and p.publie_url is not null),
         n.envoye_at, n.id, n.slack_erreur,
         v.premier_at,
         (select max(x.recu_at) from public.posteur_reponses x where x.poster_id = ca.poster_id),
         k.id, k.statut
    from cartes ca
    join public.profiles pr on pr.id = ca.poster_id
    left join public.comptes cpt on cpt.id = ca.compte_id
    left join lateral (select n.id, n.envoye_at, n.slack_erreur from public.nudges n
                        where n.poster_id = ca.poster_id and n.type = 'lundi_soir' and n.periode = p_lundi
                        order by n.envoye_at desc limit 1) n on true
    left join lateral (select v.premier_at from public.relances_prevues v
                        where v.poster_id = ca.poster_id and v.type = 'lundi_soir' and v.periode = p_lundi
                          and v.statut = 'prevu') v on true
    left join lateral (select k.id, k.statut from public.kills_auto k
                        where k.poster_id = ca.poster_id and k.etape = 'lundi_soir' and k.periode = p_lundi) k on true
   where not exists (select 1 from public.hub_posteurs h where h.profile_id = ca.poster_id)
     -- Déjà arrêté (Kill parti, « je ne veux plus », Arrêter) : plus rien.
     and not exists (select 1 from public.arrets a where a.poster_id = ca.poster_id and a.created_at >= p_lundi::timestamp - interval '7 days');
end;
$$;

revoke execute on function public.lundi_soir_posteurs(date) from public, anon;
grant execute on function public.lundi_soir_posteurs(date) to authenticated, service_role;

notify pgrst, 'reload schema';
