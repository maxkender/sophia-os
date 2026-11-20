-- 0790 : le tirage ne met plus au plan un posteur qui a demandé à arrêter.
--
-- Depuis le 3/11, l'assignation ne sert plus un posteur dont la demande d'arrêt
-- est ouverte (`posteursEnRouge`, _shared/recrues_bloquees.ts). Le tirage de
-- 14 h ne connaissait que les recrues en rouge : le 20/11, 4 comptes (hu, tr,
-- tr, sl) étaient au plan avec 2 créneaux chacun, jamais servis. Le plan
-- annonçait 480 comptes pour 476 servables.
--
-- Ici, `bt_comptes` écarte aussi ces posteurs. Rien d'autre ne change : la
-- fonction en place est reprise telle quelle, une condition ajoutée.
--
-- Appliquée le 20/11 (API de gestion), avant le tirage de 14 h.
-- Retour arrière : retirer la condition `demandes_arret` de bleo_tirage.

do $do$
declare
  v_def text := pg_get_functiondef('public.bleo_tirage(date, text)'::regprocedure);
  v_ancre text := $a$and rr.etape in ('acces', 'tiktok', 'warmup'))$a$;
  v_ajout text := $a$
     -- 0790 : comme l'assignation (recrues_bloquees.ts), un posteur dont la demande d'arrêt est ouverte n'est pas au plan.
     and not exists (select 1 from demandes_arret da
                      where da.poster_id = co.poster_id and da.decision is null)$a$;
begin
  if position('demandes_arret' in v_def) > 0 then
    return; -- déjà aligné
  end if;
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) / length(v_ancre) <> 1 then
    raise exception 'bleo_tirage : ancre introuvable ou ambiguë';
  end if;
  execute replace(v_def, v_ancre, v_ancre || v_ajout);
end
$do$;
