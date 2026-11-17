ALTER TABLE public.ideas ADD COLUMN is_outcome boolean NOT NULL DEFAULT false;
UPDATE public.ideas i SET is_outcome=true FROM public.gardens g WHERE g.id=i.garden_id AND g.is_demo AND i.key='humans';
CREATE OR REPLACE FUNCTION public.set_idea_outcome(_garden uuid, _idea uuid, _outcome boolean) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE old_value boolean;
BEGIN
 IF auth.uid() IS NULL OR NOT public.can_write_garden(_garden) THEN RAISE EXCEPTION 'Only garden editors can set outcomes'; END IF;
 SELECT is_outcome INTO old_value FROM public.ideas WHERE id=_idea AND garden_id=_garden FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Idea not in this garden'; END IF;
 IF old_value IS NOT DISTINCT FROM _outcome THEN RETURN; END IF;
 UPDATE public.ideas SET is_outcome=_outcome, updated_at=now() WHERE id=_idea AND garden_id=_garden;
 PERFORM public.record_action(_garden,'idea_edited',_idea,jsonb_build_object('action',CASE WHEN _outcome THEN 'outcome_marked' ELSE 'outcome_unmarked' END,'before',old_value,'after',_outcome),'[]'::jsonb);
END $$;
REVOKE EXECUTE ON FUNCTION public.set_idea_outcome(uuid,uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_idea_outcome(uuid,uuid,boolean) TO authenticated;