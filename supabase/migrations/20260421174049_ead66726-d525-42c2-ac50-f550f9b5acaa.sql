-- Backfill any missing profiles for existing users referenced in these tables,
-- so adding FKs to profiles does not fail.
INSERT INTO public.profiles (id, display_name)
SELECT DISTINCT a.user_id, 'Player'
FROM public.attempts a
LEFT JOIN public.profiles p ON p.id = a.user_id
WHERE p.id IS NULL;

INSERT INTO public.profiles (id, display_name)
SELECT DISTINCT rm.user_id, 'Player'
FROM public.room_members rm
LEFT JOIN public.profiles p ON p.id = rm.user_id
WHERE p.id IS NULL;

INSERT INTO public.profiles (id, display_name)
SELECT DISTINCT r.host_id, 'Player'
FROM public.rooms r
LEFT JOIN public.profiles p ON p.id = r.host_id
WHERE p.id IS NULL;

-- Add FK: attempts.user_id -> profiles.id
ALTER TABLE public.attempts
  ADD CONSTRAINT attempts_user_id_profiles_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- Add FK: room_members.user_id -> profiles.id
ALTER TABLE public.room_members
  ADD CONSTRAINT room_members_user_id_profiles_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- Add FK: rooms.host_id -> profiles.id
ALTER TABLE public.rooms
  ADD CONSTRAINT rooms_host_id_profiles_fkey
  FOREIGN KEY (host_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- Helpful indexes for the leaderboard / lobby queries
CREATE INDEX IF NOT EXISTS idx_attempts_room_id ON public.attempts(room_id);
CREATE INDEX IF NOT EXISTS idx_attempts_user_id ON public.attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_room_members_room_id ON public.room_members(room_id);

-- Prevent duplicate attempts per user per room at the DB level
CREATE UNIQUE INDEX IF NOT EXISTS attempts_room_user_unique
  ON public.attempts(room_id, user_id);