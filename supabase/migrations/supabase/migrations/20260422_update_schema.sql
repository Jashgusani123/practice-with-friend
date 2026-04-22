-- ✅ ADD subject + chapter to questions
ALTER TABLE questions
ADD COLUMN IF NOT EXISTS subject TEXT,
ADD COLUMN IF NOT EXISTS chapter TEXT,
ADD COLUMN IF NOT EXISTS explanation TEXT,
ADD COLUMN IF NOT EXISTS passage_id UUID NULL;

-- ✅ ADD subject + chapter to passages
ALTER TABLE passages
ADD COLUMN IF NOT EXISTS subject TEXT,
ADD COLUMN IF NOT EXISTS chapter TEXT;

-- ✅ ENABLE RLS
ALTER TABLE passages ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;

-- ✅ POLICIES
DROP POLICY IF EXISTS "Allow insert passages" ON passages;
CREATE POLICY "Allow insert passages"
ON passages
FOR INSERT
WITH CHECK (true);

DROP POLICY IF EXISTS "Allow insert questions" ON questions;
CREATE POLICY "Allow insert questions"
ON questions
FOR INSERT
WITH CHECK (true);