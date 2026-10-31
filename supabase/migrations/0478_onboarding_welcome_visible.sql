-- 0478 — Onboarding posters : le welcome apparaît dans « Messages sent » et dans le contexte.
--
-- onboarding_posteurs ne lisait que les relances (nudges) : un welcome envoyé
-- (accueils.message_at) n'apparaissait nulle part sur la carte (« No message
-- sent yet », « No conversation »). Il est ajouté à la liste des messages
-- (type « accueil », Upwork), le mot de passe masqué.
--
-- Additive : onboarding_posteurs réécrite (une seule ancre remplacée). Aucune donnée touchée.

do $p$
declare
  v_def text := pg_get_functiondef('public.onboarding_posteurs()'::regprocedure);
  v_ancre text := $a$where n.poster_id = e.poster_id and n.envoye_at > now() - interval '45 days'), '[]'::jsonb),$a$;
  v_ajout text := $a$where n.poster_id = e.poster_id and n.envoye_at > now() - interval '45 days'), '[]'::jsonb)
         || coalesce((select jsonb_agg(jsonb_build_object(
                     'id', 'accueil:' || a.contrat_id, 'type', 'accueil', 'at', a.message_at, 'canal', 'upwork', 'canaux', null,
                     'texte', regexp_replace(coalesce(a.message_texte, ''), '(password\s*[:·]?\s*)\S+', '\1••••••••', 'gi'),
                     'raison', null, 'expediteur', null, 'verif', null, 'hm_nom', null, 'statut', 'envoye', 'erreur', null,
                     'reponse', (select jsonb_build_object('at', r.recu_at, 'canal', r.canal, 'texte', left(r.texte, 300))
                                   from public.posteur_reponses r
                                  where r.poster_id = e.poster_id and r.recu_at >= a.message_at
                                  order by r.recu_at limit 1)))
                     from public.accueils a
                    where a.contrat_id = pr.upwork_contract_id::text and a.message_at is not null
                      and a.message_at > now() - interval '45 days'), '[]'::jsonb),$a$;
begin
  if position('''accueil:''' in v_def) > 0 then
    return;
  end if;
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) / length(v_ancre) <> 1 then
    raise exception '0478 : onboarding_posteurs : ancre introuvable ou en double';
  end if;
  execute replace(v_def, v_ancre, v_ajout);
end;
$p$;

notify pgrst, 'reload schema';
