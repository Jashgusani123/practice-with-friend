DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typnamespace = 'public'::regnamespace AND typname = 'participant_status') THEN
    CREATE TYPE public.participant_status AS ENUM ('joined', 'ready', 'completed');
  END IF;
END $$;

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS subject TEXT,
  ADD COLUMN IF NOT EXISTS chapter TEXT;

UPDATE public.rooms
SET subject = 'Physics'
WHERE subject IS NULL;

ALTER TABLE public.rooms
  ALTER COLUMN subject SET NOT NULL;

ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS subject TEXT,
  ADD COLUMN IF NOT EXISTS chapter TEXT,
  ADD COLUMN IF NOT EXISTS topic TEXT,
  ADD COLUMN IF NOT EXISTS difficulty TEXT,
  ADD COLUMN IF NOT EXISTS explanation TEXT,
  ADD COLUMN IF NOT EXISTS total_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS correct_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS correct_answer TEXT;

UPDATE public.questions
SET subject = COALESCE(subject, 'Physics'),
    chapter = COALESCE(chapter, 'General'),
    topic = COALESCE(topic, 'Reading comprehension'),
    difficulty = COALESCE(difficulty, 'medium'),
    explanation = COALESCE(explanation, ''),
    correct_answer = COALESCE(correct_answer, CASE correct_index
      WHEN 0 THEN 'A'
      WHEN 1 THEN 'B'
      WHEN 2 THEN 'C'
      WHEN 3 THEN 'D'
      ELSE 'A'
    END)
WHERE subject IS NULL
   OR chapter IS NULL
   OR topic IS NULL
   OR difficulty IS NULL
   OR explanation IS NULL
   OR correct_answer IS NULL;

ALTER TABLE public.questions
  ALTER COLUMN subject SET NOT NULL,
  ALTER COLUMN chapter SET NOT NULL,
  ALTER COLUMN topic SET NOT NULL,
  ALTER COLUMN difficulty SET NOT NULL,
  ALTER COLUMN explanation SET NOT NULL,
  ALTER COLUMN correct_answer SET NOT NULL;

CREATE TABLE IF NOT EXISTS public.room_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL,
  user_id UUID NOT NULL,
  status public.participant_status NOT NULL DEFAULT 'joined',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (room_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.room_session_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL,
  question_id UUID NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (room_id, question_id),
  UNIQUE (room_id, order_index)
);

INSERT INTO public.room_participants (room_id, user_id, joined_at)
SELECT room_id, user_id, joined_at
FROM public.room_members
ON CONFLICT (room_id, user_id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attempts_user_id_profiles_fkey') THEN
    ALTER TABLE public.attempts
      ADD CONSTRAINT attempts_user_id_profiles_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'room_participants_room_id_fkey') THEN
    ALTER TABLE public.room_participants
      ADD CONSTRAINT room_participants_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.rooms(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'room_participants_user_id_profiles_fkey') THEN
    ALTER TABLE public.room_participants
      ADD CONSTRAINT room_participants_user_id_profiles_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'room_session_questions_room_id_fkey') THEN
    ALTER TABLE public.room_session_questions
      ADD CONSTRAINT room_session_questions_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.rooms(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'room_session_questions_question_id_fkey') THEN
    ALTER TABLE public.room_session_questions
      ADD CONSTRAINT room_session_questions_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.questions(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS attempts_room_user_unique_idx ON public.attempts (room_id, user_id);
CREATE INDEX IF NOT EXISTS room_participants_room_idx ON public.room_participants (room_id, joined_at);
CREATE INDEX IF NOT EXISTS room_participants_user_idx ON public.room_participants (user_id);
CREATE INDEX IF NOT EXISTS room_session_questions_room_order_idx ON public.room_session_questions (room_id, order_index);
CREATE INDEX IF NOT EXISTS room_subject_chapter_idx ON public.rooms (subject, chapter);
CREATE INDEX IF NOT EXISTS questions_subject_chapter_idx ON public.questions (subject, chapter);
CREATE INDEX IF NOT EXISTS questions_subject_difficulty_idx ON public.questions (subject, difficulty);

ALTER TABLE public.room_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_session_questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Participants can view room participants" ON public.room_participants;
CREATE POLICY "Participants can view room participants"
ON public.room_participants
FOR SELECT
TO authenticated
USING (public.is_room_member(room_id, auth.uid()));

DROP POLICY IF EXISTS "Users can join as themselves in room participants" ON public.room_participants;
CREATE POLICY "Users can join as themselves in room participants"
ON public.room_participants
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own participant row" ON public.room_participants;
CREATE POLICY "Users can update their own participant row"
ON public.room_participants
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can leave room participants" ON public.room_participants;
CREATE POLICY "Users can leave room participants"
ON public.room_participants
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Room members can view session questions" ON public.room_session_questions;
CREATE POLICY "Room members can view session questions"
ON public.room_session_questions
FOR SELECT
TO authenticated
USING (public.is_room_member(room_id, auth.uid()));

DROP POLICY IF EXISTS "Hosts can manage session questions" ON public.room_session_questions;
CREATE POLICY "Hosts can manage session questions"
ON public.room_session_questions
FOR ALL
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.rooms r WHERE r.id = room_id AND r.host_id = auth.uid()
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.rooms r WHERE r.id = room_id AND r.host_id = auth.uid()
));

CREATE OR REPLACE FUNCTION public.is_room_member(_room_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  select exists (
    select 1 from public.room_participants where room_id = _room_id and user_id = _user_id
  ) or exists (
    select 1 from public.room_members where room_id = _room_id and user_id = _user_id
  ) or exists (
    select 1 from public.rooms where id = _room_id and host_id = _user_id
  );
$$;