CREATE TABLE public.tags (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name text NOT NULL,
    parent_tag_id uuid REFERENCES public.tags(id) ON DELETE CASCADE,
    position integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE NULLS NOT DISTINCT (user_id, parent_tag_id, name)
);

CREATE INDEX idx_tags_user_parent ON public.tags(user_id, parent_tag_id, position);

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own tags" ON public.tags
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own tags" ON public.tags
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own tags" ON public.tags
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own tags" ON public.tags
    FOR DELETE USING (auth.uid() = user_id);

CREATE TABLE public.collection_tags (
    collection_id uuid NOT NULL REFERENCES public.collections(id) ON DELETE CASCADE,
    tag_id uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (collection_id, tag_id)
);

CREATE INDEX idx_collection_tags_tag ON public.collection_tags(tag_id);

ALTER TABLE public.collection_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own collection_tags" ON public.collection_tags
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.collections c WHERE c.id = collection_id AND c.user_id = auth.uid())
    );
CREATE POLICY "Users insert own collection_tags" ON public.collection_tags
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM public.collections c WHERE c.id = collection_id AND c.user_id = auth.uid())
        AND EXISTS (SELECT 1 FROM public.tags t WHERE t.id = tag_id AND t.user_id = auth.uid())
    );
CREATE POLICY "Users delete own collection_tags" ON public.collection_tags
    FOR DELETE USING (
        EXISTS (SELECT 1 FROM public.collections c WHERE c.id = collection_id AND c.user_id = auth.uid())
    );
