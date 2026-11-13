-- 0581 : parrainage, éviter les mêmes questions (demande de Max, 9/11).
--
-- 1. Statut d'un filleul vu par le parrain : invité → a postulé → accepté →
--    a commencé → bonus payé (nouvelle étape « accepte » : candidature
--    acceptée ou signée sur le site, ou profil créé dans l'OS).
-- 2. La réponse officielle « How does referral work? » remplacée par le texte
--    de Max (validée : les bots l'utilisent seuls).
-- 3. Les règles des bots sur le parrainage : l'ancienne (2 semaines à 12
--    posts) désactivée, les nouvelles ajoutées.
-- 4. faq_faits_posteur : les filleuls du posteur et leur statut, pour
--    répondre à « où en est mon ami ? ».
-- Additif : fonctions remplacées ou patchées en place, une réponse et des
-- règles mises à jour (aucune ligne supprimée).

create or replace function public.parrainage_statut_filleul(i public.parrainage_invitations)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (select 1 from public.bonus b where b.referral_id = i.referral_id and b.statut = 'paye') then 'bonus_paye'
    when i.recrue_id is not null and exists (select 1 from public.profiles p where p.id = i.recrue_id and p.is_active)
         and exists (select 1 from public.passages ps join public.comptes c on c.id = ps.compte_id
                      where c.poster_id = i.recrue_id and ps.publie_url is not null) then 'actif'
    -- 0581 : accepté sur le site (lien de signature envoyé, signé) ou profil créé dans l'OS.
    when i.recrue_id is not null
         or exists (select 1 from public.ruul_candidatures rc where rc.email = i.email
                     and (rc.accepte_at is not null or rc.signe_at is not null
                          or rc.statut_site in ('accepted', 'contract_signed', 'os_created'))) then 'accepte'
    when i.statut = 'postule'
         or exists (select 1 from public.ruul_candidatures rc where rc.email = i.email) then 'postule'
    when i.statut = 'attente' then 'attente'
    when i.statut in ('desinscrit', 'rebond', 'expire', 'erreur') then 'arrete'
    else 'envoye' end;
$$;

update public.reponses_officielles
   set reponse = 'Here is how referral works:' || chr(10) ||
     '- Your friend doesn''t need Upwork or any freelancing account: they apply directly with the link we email them.' || chr(10) ||
     '- Same job as yours: 2 posts a day, 7 days a week, warm-up first, start on a Monday, ongoing week after week.' || chr(10) ||
     '- Your friend will see their weekly rate on their dashboard.' || chr(10) ||
     '- Your $10 bonus is paid on Upwork, as a bonus on your current contract, the Monday after your friend completes their first full week of posts. Nothing to do.' || chr(10) ||
     '- Tell your friend to watch their inbox (and spam folder): the email comes from Sophia.' || chr(10) ||
     '- You can follow each referral''s status on your dashboard ("Refer a friend"): invited → applied → accepted → started → bonus paid.',
       actif = true, valide_at = now(), maj_at = now()
 where question = 'How does referral work?';

update public.regles_bots set active = false, maj_at = now()
 where active and regle like 'Parrainage : renvoie toujours%';

insert into public.regles_bots (bot, regle)
select 'tous', r from (values
  ('Parrainage : toute question sur le parrainage (plateforme ou Upwork nécessaire pour l''ami, conditions de travail ou paie de l''ami, paiement ou délai du bonus) → réponds seul avec la réponse officielle « How does referral work? », sans demander de validation.'),
  ('Parrainage, tarif de l''ami : réponds « your friend will see their weekly rate on their dashboard ». Ne donne jamais de montant pour l''ami.'),
  ('Parrainage : ne parle jamais de la façon dont l''ami est payé ; dis seulement qu''il n''a pas besoin d''Upwork.'),
  ('Parrainage : ne promets jamais de date d''acceptation pour l''ami.'),
  ('Parrainage, « où en est mon ami ? » : réponds avec le statut de chaque ami donné dans les faits du posteur (parrainages) : invited, applied, accepted, started ou bonus paid.'),
  ('Ne parle jamais d''automatisation, de bot ni de message automatique.')
) v(r)
where not exists (select 1 from public.regles_bots b where b.regle = v.r);

do $p$
declare
  d text := pg_get_functiondef('public.faq_faits_posteur(uuid)'::regprocedure);
  avant text := $a$    'forcee', (select jsonb_build_object('situation', f.situation, 'jusqu_au', f.jusqu_au)$a$;
  apres text := $a$    /* 0581 : les amis parrainés et leur statut (invited, applied, accepted, started, bonus paid). */
    'parrainages', coalesce((select jsonb_agg(jsonb_build_object('ami', i.prenom, 'pays', i.pays,
                      'statut', case public.parrainage_statut_filleul(i)
                                  when 'envoye' then 'invited' when 'postule' then 'applied' when 'accepte' then 'accepted'
                                  when 'actif' then 'started' when 'bonus_paye' then 'bonus paid'
                                  when 'attente' then 'waiting list (not recruiting in that country yet)' else 'stopped' end,
                      'invite_le', i.cree_at::date) order by i.cree_at desc)
                     from public.parrainage_invitations i where i.parrain_id = pr.id), '[]'::jsonb),
    'forcee', (select jsonb_build_object('situation', f.situation, 'jusqu_au', f.jusqu_au)$a$;
begin
  if position('0581' in d) > 0 then return; end if;
  if position(avant in d) = 0 then raise exception '0581 : faq_faits_posteur ne correspond pas'; end if;
  execute replace(d, avant, apres);
end
$p$;
