-- 0571 : « Donner un bonus » comprend n'importe quelle phrase et retrouve la
-- personne même mal écrite (« bogdan kugcas » → Bogdan Kocsis).
--
-- 1. bonus_personnes_proches(texte) : les posteurs dont le nom ressemble le
--    plus aux mots du texte (orthographe approchée, accents ignorés, mots
--    courants « donne », « bonus », « lundi »… écartés). Un nom exact et
--    unique est pris directement ; sinon la page propose les plus proches.
-- 2. bonus_donner_a(poster, …) : la ligne « manuel » à valider pour la
--    personne choisie (mêmes contrôles que bonus_donner, 0564).
-- Additif : deux fonctions. Rien n'est payé ici.

create or replace function public.bonus_personnes_proches(p_texte text, p_limite int default 5)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') and not public.is_admin() then
    raise exception 'réservé à l''admin et au Head of Ops';
  end if;
  return coalesce((
    with mots as (
      select distinct public.nom_cle(w) as m
        from regexp_split_to_table(coalesce(p_texte, ''), '[\s,;:!?()«»"/]+') w
       where length(public.nom_cle(w)) >= 2
         and public.nom_cle(w) not in (
           'donne', 'donner', 'donnez', 'ajoute', 'ajouter', 'mets', 'mettre', 'envoie', 'envoyer', 'paye', 'payer',
           'give', 'send', 'add', 'pay', 'bonus', 'bonuses', 'prime', 'de', 'du', 'des', 'le', 'la', 'les', 'un', 'une',
           'au', 'aux', 'et', 'en', 'pour', 'par', 'sur', 'avec', 'ce', 'cette', 'son', 'sa', 'ses', 'lui', 'elle', 'il',
           'to', 'for', 'of', 'the', 'an', 'and', 'on', 'his', 'her', 'their', 'lundi', 'monday', 'prochain', 'prochaine',
           'next', 'semaine', 'week', 'raison', 'reason', 'motif', 'because', 'car', 'parce', 'que', 'dollar', 'dollars',
           'usd', 'euro', 'euros', 'merci', 'thanks', 'svp', 'please', 'stp', 'bravo', 'super', 'top')
    ),
    pers as (
      select p.id, p.is_active,
             coalesce(nullif(btrim(concat_ws(' ', p.prenom, p.nom)), ''), p.email) as nom,
             array_remove(array[nullif(btrim(concat_ws(' ', p.prenom, p.nom)), ''),
                                nullif(btrim(concat_ws(' ', h.prenom_legal, h.nom_legal)), '')], null) as variantes
        from public.profiles p
        left join public.hub_posteurs h on h.profile_id = p.id
       where exists (select 1 from public.user_roles ur where ur.user_id = p.id and ur.role = 'poster')
    ),
    -- Chaque mot du nom (de chaque variante) et sa meilleure ressemblance avec un mot du texte.
    tok as (
      select pers.id, v.vi, t.ord, public.nom_cle(t.w) as n
        from pers
       cross join lateral unnest(pers.variantes) with ordinality v(variante, vi)
       cross join lateral regexp_split_to_table(v.variante, '[\s\-'']+') with ordinality t(w, ord)
       where length(public.nom_cle(t.w)) >= 2
    ),
    meilleur as (
      select tok.id, tok.vi, tok.ord,
             max(1 - levenshtein(tok.n, mots.m)::numeric / greatest(length(tok.n), length(mots.m))) as s
        from tok cross join mots
       group by 1, 2, 3
    ),
    variante as (
      -- Moitié : la moyenne des mots du nom ; moitié : le mot le mieux reconnu
      -- (« martin » seul : Martin Befeld avant Adrien Martinot).
      select id, vi, (avg(s) + max(s)) / 2 as score, max(s) as meilleur_mot, min(s) = 1 as exact
        from meilleur group by 1, 2
    ),
    score as (
      select id, max(score) as score, bool_or(exact) as exact from variante where meilleur_mot >= 0.7 group by 1
    )
    select jsonb_agg(jsonb_build_object('id', x.id, 'nom', x.nom, 'actif', x.is_active, 'score', round(x.score, 2), 'exact', x.exact)
                     order by x.score desc, x.is_active desc, x.nom)
      from (select pers.id, pers.nom, pers.is_active, s.score, s.exact
              from score s join pers on pers.id = s.id
             where s.score >= 0.6
             order by s.score desc, pers.is_active desc, pers.nom
             limit greatest(1, least(coalesce(p_limite, 5), 10))) x), '[]'::jsonb);
end;
$$;

revoke execute on function public.bonus_personnes_proches(text, int) from public, anon;
grant execute on function public.bonus_personnes_proches(text, int) to authenticated, service_role;

create or replace function public.bonus_donner_a(p_poster uuid, p_montant numeric, p_lundi date, p_raison text, p_par uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lundi date := coalesce(p_lundi, public.bonus_lundi_carte());
  v_id uuid;
  v_nom text;
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') and not public.is_admin() then
    raise exception 'réservé à l''admin et au Head of Ops';
  end if;
  if p_montant is null or p_montant <= 0 or p_montant > 100 then
    return jsonb_build_object('ok', false, 'erreur', 'montant entre 0 et 100 $');
  end if;
  if extract(isodow from v_lundi) <> 1 or v_lundi < public.bonus_lundi_carte() then
    return jsonb_build_object('ok', false, 'erreur', 'la date doit être un lundi à venir');
  end if;
  select coalesce(nullif(btrim(concat_ws(' ', p.prenom, p.nom)), ''), p.email) into v_nom
    from public.profiles p
   where p.id = p_poster
     and exists (select 1 from public.user_roles ur where ur.user_id = p.id and ur.role = 'poster');
  if v_nom is null then
    return jsonb_build_object('ok', false, 'erreur', 'posteur introuvable');
  end if;
  insert into public.bonus (poster_id, type, lundi_bonus, periode_debut, periode_fin, detail, quantite, montant, statut, raison, cree_par)
  values (p_poster, 'manuel', v_lundi, v_lundi, v_lundi, coalesce(nullif(btrim(p_raison), ''), 'bonus'), 1, round(p_montant, 2), 'a_valider',
          coalesce(nullif(btrim(p_raison), ''), 'bonus'), coalesce(p_par, auth.uid()))
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'nom', v_nom, 'montant', round(p_montant, 2), 'lundi', v_lundi);
end;
$$;

revoke execute on function public.bonus_donner_a(uuid, numeric, date, text, uuid) from public, anon;
grant execute on function public.bonus_donner_a(uuid, numeric, date, text, uuid) to authenticated, service_role;
