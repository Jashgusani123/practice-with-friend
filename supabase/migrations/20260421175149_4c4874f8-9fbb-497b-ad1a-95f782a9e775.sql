CREATE POLICY "User can update own attempt"
  ON public.attempts FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);