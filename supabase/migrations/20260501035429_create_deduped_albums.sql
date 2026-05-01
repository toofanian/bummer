CREATE TABLE public.deduped_albums (
    old_service_id text NOT NULL,
    new_service_id text NOT NULL,
    user_id uuid NOT NULL REFERENCES auth.users(id),
    deduped_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, old_service_id)
);

ALTER TABLE public.deduped_albums ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own deduped albums"
    ON public.deduped_albums FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own deduped albums"
    ON public.deduped_albums FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own deduped albums"
    ON public.deduped_albums FOR DELETE
    USING (auth.uid() = user_id);
