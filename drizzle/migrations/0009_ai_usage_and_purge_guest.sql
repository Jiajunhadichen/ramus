CREATE TABLE public.ai_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  garden_id uuid NULL,
  kind text NOT NULL CHECK (kind IN ('tree','structure','inventory','harvest','regrow','rebuild')),
  model text NULL,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  usd numeric(12,6) NOT NULL DEFAULT 0,
  guest boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_usage_user_kind_time ON public.ai_usage (user_id, kind, created_at);
CREATE INDEX ai_usage_time ON public.ai_usage (created_at);
REVOKE ALL ON public.ai_usage FROM anon, authenticated;
GRANT ALL ON public.ai_usage TO service_role;
ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.purge_guest(_user uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE g uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = _user AND is_anonymous = true) THEN
    RAISE EXCEPTION 'purge_guest: % is not a guest', _user;
  END IF;
  FOR g IN SELECT id FROM public.gardens WHERE created_by = _user LOOP
    PERFORM set_config('ramus.purge', g::text, true);
    DELETE FROM public.gardens WHERE id = g;
  END LOOP;
  PERFORM set_config('ramus.purge', '', true);
END;
$$;
REVOKE ALL ON FUNCTION public.purge_guest(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_guest(uuid) TO service_role;