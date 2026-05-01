CREATE TABLE public.library_changes (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id),
    changed_at timestamptz NOT NULL DEFAULT now(),
    added_ids text[] NOT NULL DEFAULT '{}',
    removed_ids text[] NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_library_changes_user_date
    ON public.library_changes (user_id, changed_at DESC);

ALTER TABLE public.library_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own changes"
    ON public.library_changes FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own changes"
    ON public.library_changes FOR INSERT
    WITH CHECK (auth.uid() = user_id);
