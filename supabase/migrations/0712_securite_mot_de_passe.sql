-- 0712 : Support, Phase 1 « sécurité » (Max, 13/11 ; réécriture validée dans le plan de la refonte).
-- 1. La règle support_infos « mot_de_passe » disait « 12345678 pour tout le monde, jamais de lien » : fausse.
--    Nouvelle règle : jamais de mot de passe, toujours le login + le lien « choisir mon mot de passe ».
-- 2. Page Contrôle : les actions des bots Grok (bot_actions) comptent aussi dans les compteurs du jour.

update public.support_infos
   set valeur = 'Never write a password in a message (no default password exists). The login is the poster''s @sophia.com address. '
             || 'If a poster can''t log in or forgot the password: use the action lien_mot_de_passe. It emails the poster (to their real email) '
             || 'their login and a personal "Choose my password" link (works once, 14 days). Then tell them to check their inbox and spam.'
 where cle = 'mot_de_passe';

create or replace function public.controle_lire()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_jour timestamptz := (date_trunc('day', now() at time zone 'Europe/Paris')) at time zone 'Europe/Paris';
begin
  if not public.is_admin() then raise exception 'réservé à l''admin' using errcode = '42501'; end if;
  return jsonb_build_object(
    'reglage', (select valeur from public.reglages where cle = 'controle'),
    'compteurs', coalesce((select jsonb_object_agg(quoi, n) from (
        select quoi, sum(n)::int n from (
          select quoi, count(*) n from public.journal_auto where at >= v_jour and mode = 'agir' and annule_at is null group by 1
          union all
          select action, count(*) from public.bot_actions where at >= v_jour and statut not in ('refuse', 'annule') and annule_at is null group by 1
        ) u group by 1) x), '{}'::jsonb),
    'propositions', coalesce((select jsonb_object_agg(quoi, n) from (
        select quoi, count(*) n from public.journal_auto where at >= v_jour and mode = 'proposer' group by 1) x), '{}'::jsonb),
    'journal', coalesce((select jsonb_agg(x order by x->>'at' desc) from (
        select jsonb_build_object('id', j.id, 'at', j.at, 'qui', j.qui, 'quoi', j.quoi, 'mode', j.mode, 'poster_id', j.poster_id,
                 'nom', nullif(btrim(concat_ws(' ', p.prenom, p.nom)), ''), 'canal', j.canal, 'montant', j.montant, 'resultat', j.resultat,
                 'annulable', j.annulable and j.annule_at is null, 'annule_at', j.annule_at, 'source', 'journal') x
          from public.journal_auto j left join public.profiles p on p.id = j.poster_id
         where j.at > now() - interval '3 days'
        union all
        select jsonb_build_object('id', b.id, 'at', b.at, 'qui', b.bot, 'quoi', b.action, 'mode', case when b.statut = 'refuse' then 'bloque' else 'agir' end,
                 'poster_id', b.poster_id, 'nom', nullif(btrim(concat_ws(' ', p.prenom, p.nom)), ''), 'canal', b.canal, 'montant', null,
                 'resultat', b.statut || coalesce(' : ' || b.raison, ''), 'annulable', b.statut = 'prevu' and b.annule_at is null,
                 'annule_at', b.annule_at, 'source', 'bot_actions')
          from public.bot_actions b left join public.profiles p on p.id = b.poster_id
         where b.at > now() - interval '3 days'
      ) t), '[]'::jsonb));
end;
$$;
