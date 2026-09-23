-- ============================================================
-- MIGRATION: Tie resources to a specific course + allow file uploads
-- ============================================================

ALTER TABLE public.resources
  ADD COLUMN IF NOT EXISTS course_id UUID REFERENCES public.courses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS resources_course_id_idx ON public.resources(course_id);

-- Students can view resources shared directly with them, resources scoped to
-- a specific course they're booked into, or general (no student/no course)
-- resources from mentors they have an active booking with.
DROP POLICY IF EXISTS "Students can view resources shared with them" ON public.resources;
CREATE POLICY "Students can view resources shared with them"
  ON public.resources FOR SELECT
  USING (
    student_id = auth.uid() OR
    (course_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.student_id = auth.uid() AND b.course_id = resources.course_id
    )) OR
    (student_id IS NULL AND course_id IS NULL AND EXISTS (
      SELECT 1 FROM public.bookings b
      LEFT JOIN public.sessions s ON b.session_id = s.id
      LEFT JOIN public.courses c ON b.course_id = c.id
      WHERE b.student_id = auth.uid()
        AND (s.mentor_id = resources.mentor_id OR c.mentor_id = resources.mentor_id)
    ))
  );

-- Same widening for parents viewing resources on behalf of their children.
DROP POLICY IF EXISTS "Parents can view resources shared with their children" ON public.resources;
CREATE POLICY "Parents can view resources shared with their children"
  ON public.resources FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.students st
      WHERE st.parent_id = auth.uid() AND (
        st.id = resources.student_id OR
        (resources.course_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.bookings b
          WHERE b.student_id = st.id AND b.course_id = resources.course_id
        )) OR
        (resources.student_id IS NULL AND resources.course_id IS NULL AND EXISTS (
          SELECT 1 FROM public.bookings b
          LEFT JOIN public.sessions s ON b.session_id = s.id
          LEFT JOIN public.courses c ON b.course_id = c.id
          WHERE b.student_id = st.id
            AND (s.mentor_id = resources.mentor_id OR c.mentor_id = resources.mentor_id)
        ))
      )
    )
  );
