-- Drop the existing user_isolation policy that grants SELECT on music_tokens.
-- The frontend never queries this table directly — all token operations
-- go through the FastAPI backend using the service-role key (which bypasses RLS).
-- Keeping SELECT open lets any authenticated PostgREST/supabase-js client
-- read access_token and refresh_token for the logged-in user, which is
-- unnecessary exposure.
DROP POLICY IF EXISTS user_isolation ON public.music_tokens;

-- Re-create separate policies for INSERT, UPDATE, DELETE only (no SELECT).
CREATE POLICY music_tokens_insert ON public.music_tokens
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY music_tokens_update ON public.music_tokens
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY music_tokens_delete ON public.music_tokens
  FOR DELETE
  USING (user_id = auth.uid());
