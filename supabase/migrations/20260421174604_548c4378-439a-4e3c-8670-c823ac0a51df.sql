-- 1. Extend passages
ALTER TABLE public.passages
  ADD COLUMN IF NOT EXISTS paragraphs jsonb,
  ADD COLUMN IF NOT EXISTS difficulty text NOT NULL DEFAULT 'moderate';

-- 2. Highlights table (scoped per attempt)
CREATE TABLE IF NOT EXISTS public.highlights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL REFERENCES public.attempts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  paragraph_index int NOT NULL,
  start_offset int NOT NULL,
  end_offset int NOT NULL,
  text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_highlights_attempt ON public.highlights(attempt_id);
ALTER TABLE public.highlights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own highlights"
  ON public.highlights FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users insert own highlights"
  ON public.highlights FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own highlights"
  ON public.highlights FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- 3. Question marks (mark for review)
CREATE TABLE IF NOT EXISTS public.question_marks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL REFERENCES public.attempts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (attempt_id, question_id)
);
CREATE INDEX IF NOT EXISTS idx_qmarks_attempt ON public.question_marks(attempt_id);
ALTER TABLE public.question_marks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own marks"
  ON public.question_marks FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users insert own marks"
  ON public.question_marks FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own marks"
  ON public.question_marks FOR DELETE TO authenticated
  USING (auth.uid() = user_id);