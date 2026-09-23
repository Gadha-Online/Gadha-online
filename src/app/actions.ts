"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath, unstable_noStore as noStore } from "next/cache";
import { sanitizeText, validateEmail, validatePhone } from "@/lib/validate";
import { parseTimeToMinutes, intervalsOverlap, parseDayList, dayListsOverlap, weekdayNameForDate } from "@/lib/schedule";
import type { Tables, TablesInsert, TablesUpdate, Enums } from "@/lib/supabase/database.types";

// ----------------------------------------------------
// SHARED ROW SHAPES (mirrors common Supabase select() join patterns)
// ----------------------------------------------------

type ProfileName = Pick<Tables<"profiles">, "full_name">;
type ProfileNameEmail = Pick<Tables<"profiles">, "full_name" | "email">;
type ProfileNameAvatar = Pick<Tables<"profiles">, "full_name" | "avatar_url">;
type ProfileNameAvatarEmail = Pick<Tables<"profiles">, "full_name" | "avatar_url" | "email">;

type WithMentorProfile<P> = { mentor: ({ profile: P | null }) | null };
type MentorWithProfile<P> = Tables<"mentors"> & { profile: P | null };

type CourseWithMentor = Tables<"courses"> & WithMentorProfile<ProfileName>;
type SessionWithMentor = Tables<"sessions"> & WithMentorProfile<ProfileNameAvatar>;

type BookingAdminRow = Tables<"bookings"> & {
  parent: { profile: ProfileNameEmail | null } | null;
  student: { profile: ProfileNameEmail | null } | null;
  course: (Pick<Tables<"courses">, "title" | "mentor_id"> & WithMentorProfile<ProfileName>) | null;
  session: (Pick<Tables<"sessions">, "title" | "mentor_id"> & WithMentorProfile<ProfileName>) | null;
};

// ----------------------------------------------------
// HELPERS
// ----------------------------------------------------

// Subject styling fallback mapping for UI compatibility
function mapSubjectToStyle(subject: string) {
  switch (subject) {
    case "Mathematics":
      return { colorBg: "#dbeafe", iconName: "math" };
    case "Programming":
      return { colorBg: "#dcfce7", iconName: "code" };
    case "Science":
      return { colorBg: "#fef9c3", iconName: "flask" };
    case "English":
      return { colorBg: "#ede9fe", iconName: "writing" };
    default:
      return { colorBg: "#f5f8ff", iconName: "book" };
  }
}

// Helper: Find mentor UUID by full name
async function resolveMentorIdByName(name: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("full_name", name)
    .eq("role", "mentor")
    .limit(1)
    .single();

  if (error || !data) return null;
  return data.id;
}

// ----------------------------------------------------
// ACTIONS
// ----------------------------------------------------

export async function getHomepageData() {
  noStore();
  const supabase = await createClient();

  // 1. Get Hero Settings
  const { data: settings } = await supabase
    .from("homepage_settings")
    .select("*")
    .eq("id", 1)
    .single();

  // 2. Get Testimonials (visible only)
  const { data: testimonials } = await supabase
    .from("testimonials")
    .select("*")
    .eq("show_on_site", true)
    .order("created_at", { ascending: false });

  // 3. Get Active Courses
  const { data: dbCourses } = await supabase
    .from("courses")
    .select("*, mentor:mentors(profile:profiles(full_name))")
    .eq("status", "Active")
    .order("created_at", { ascending: false });

  const courses = (dbCourses || []).map((c: CourseWithMentor) => {
    const style = mapSubjectToStyle(c.subject);
    return {
      id: c.id,
      title: c.title,
      subject: c.subject,
      format: c.format,
      price: Number(c.price),
      mentor: c.mentor?.profile?.full_name || "Unknown Mentor",
      students: c.students_count,
      rating: Number(c.rating),
      status: c.status,
      colorBg: style.colorBg,
      iconName: style.iconName,
      coverImageUrl: c.cover_image_url || "",
      languages: c.languages || ["English"],
      class_level: c.class_level || "",
    };
  });

  // 4. Get Active Sessions
  const { data: dbSessions } = await supabase
    .from("sessions")
    .select("*, mentor:mentors!sessions_mentor_id_fkey(profile:profiles(full_name, avatar_url))")
    .eq("status", "Active")
    .order("created_at", { ascending: false });

  const sessions = (dbSessions || []).map((s: SessionWithMentor) => {
    const name = s.mentor?.profile?.full_name || "Unknown Mentor";
    const init = name.split(" ").map((w: string) => w[0]).join("").substring(0, 2).toUpperCase();
    return {
      id: s.id,
      title: s.title,
      description: s.description || "",
      mentor: name,
      mentorAvatar: init,
      mentorColor: s.color_bg || "#1B3A6B",
      type: s.type,
      bookings: s.bookings_count,
      subject: s.subject,
      price: Number(s.price),
      status: s.status,
      colorBg: s.color_bg || "#ede9fe",
      iconName: s.icon_name || "writing",
      class_level: s.class_level || "",
    };
  });

  // 5. Get Active Mentors
  const { data: dbMentors } = await supabase
    .from("mentors")
    .select("*, profile:profiles(full_name, avatar_url, email)")
    .eq("is_active", true)
    .order("rating", { ascending: false });

  const mentors = (dbMentors || [])
    .filter((m: MentorWithProfile<ProfileNameAvatarEmail>) => {
      const hasBio = m.bio && m.bio.trim() !== "" && m.bio !== "Biography...";
      const hasExpertise = m.expertise && m.expertise.length > 0;
      const hasRate = m.hourly_rate && Number(m.hourly_rate) > 0;
      const hasQual = m.qualification && m.qualification.trim() !== "" && m.qualification !== "Educator";
      const hasExp = m.experience && Number(m.experience) > 0;
      return hasBio && hasExpertise && hasRate && hasQual && hasExp;
    })
    .map((m: MentorWithProfile<ProfileNameAvatarEmail>) => {
      const name = m.profile?.full_name || "Unknown Mentor";
      const init = name.split(" ").map((w: string) => w[0]).join("").substring(0, 2).toUpperCase();
      return {
        id: m.id,
        name,
        subject: m.expertise.join(" & "),
        rating: Number(m.rating),
        students: 420,
        courses: 10,
        rate: Number(m.hourly_rate),
        verified: m.verified || false,
        avatarText: init,
        avatarBg: "#1B3A6B",
        qualification: m.qualification || "Educator",
        experience: m.experience || 5,
        bio: m.bio || "",
      };
    });

  return {
    settings: settings || {
      badge_text: "#1 online tutoring platform",
      headline: "Learn faster with expert mentors by your side",
      accented_text: "expert mentors",
      subheading: "Connect with top-rated tutors for 1-on-1 sessions, structured courses, and hourly lessons — all tailored to your pace and goals.",
      primary_cta: "Find a mentor",
      primary_link: "/mentors",
      secondary_cta: "Browse courses",
      secondary_link: "/courses",
      c1: "12,400+",
      cl1: "Students enrolled",
      c2: "840+",
      cl2: "Expert mentors",
      c3: "320+",
      cl3: "Courses available",
      c4: "98%",
      cl4: "Satisfaction rate",
      hero_image_url: null,
    },
    testimonials: testimonials || [],
    courses,
    sessions,
    mentors,
  };
}

export async function getAboutPageData() {
  noStore();
  const supabase = await createClient();

  const { data: settings } = await supabase
    .from("about_page_settings")
    .select("*")
    .eq("id", 1)
    .single();

  const { data: teamMembers } = await supabase
    .from("team_members")
    .select("*")
    .eq("show_on_site", true)
    .order("display_order", { ascending: true });

  const { data: achievements } = await supabase
    .from("achievements")
    .select("*")
    .eq("show_on_site", true)
    .order("display_order", { ascending: true });

  const effectiveTeam = teamMembers && teamMembers.length > 0 ? teamMembers : [
    {
      id: "tm-1",
      name: "Dr. Vikram Sethi",
      role: "Founder & CEO",
      bio: "Ex-IIT Delhi & Stanford Alum with 12+ years in education tech. Passionate about personalized learning for every student.",
      photo_url: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80",
      avatar_bg: "#1B3A6B",
      avatar_text: "VS",
    },
    {
      id: "tm-2",
      name: "Ananya Roy",
      role: "Head of Academics",
      bio: "M.Ed. Harvard University with 10+ years designing high-impact curricula for competitive exams and STEM education.",
      photo_url: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=400&q=80",
      avatar_bg: "#2F7FE8",
      avatar_text: "AR",
    },
    {
      id: "tm-3",
      name: "Kavita Rao",
      role: "VP of Product",
      bio: "Former Lead Product Manager at top edtech platforms. Dedicated to building engaging learning experiences.",
      photo_url: "https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=400&q=80",
      avatar_bg: "#0F6E56",
      avatar_text: "KR",
    },
    {
      id: "tm-4",
      name: "Rohan Deshmukh",
      role: "Head of Student Success",
      bio: "Experienced academic counselor committed to mentor matching, student growth, and career guidance.",
      photo_url: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80",
      avatar_bg: "#993556",
      avatar_text: "RD",
    },
  ];

  const effectiveAchievements = achievements && achievements.length > 0 ? achievements : [
    {
      id: "ach-1",
      stat_value: "15,000+",
      stat_label: "Active Learners Guided Across India",
      image_url: "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=600&q=80",
    },
    {
      id: "ach-2",
      stat_value: "98.4%",
      stat_label: "Exam Qualification & Grade Improvement Rate",
      image_url: "https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=600&q=80",
    },
    {
      id: "ach-3",
      stat_value: "500,000+",
      stat_label: "Hours of 1-on-1 Mentorship Delivered",
      image_url: "https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&w=600&q=80",
    },
    {
      id: "ach-4",
      stat_value: "50+",
      stat_label: "Top Universities & Dream Companies Placements",
      image_url: "https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=600&q=80",
    },
  ];

  return {
    settings: settings || {
      hero_title: "About Gadha Online",
      hero_subtitle: "Connecting students with expert mentors since day one.",
      vision_title: "Our Vision",
      vision_text: "To make quality, personalized education accessible to every student, everywhere.",
      mission_title: "Our Mission",
      mission_text: "We connect students with verified, expert mentors for 1-on-1 sessions and structured courses tailored to their pace and goals.",
    },
    teamMembers: effectiveTeam.map((m: Pick<Tables<"team_members">, "id" | "name" | "role" | "bio" | "photo_url" | "avatar_bg" | "avatar_text">) => ({
      id: m.id,
      name: m.name,
      role: m.role,
      bio: m.bio,
      photoUrl: m.photo_url || "",
      avatarBg: m.avatar_bg,
      avatarText: m.avatar_text,
    })),
    achievements: effectiveAchievements.map((a: Pick<Tables<"achievements">, "id" | "stat_value" | "stat_label" | "image_url">) => ({
      id: a.id,
      statValue: a.stat_value,
      statLabel: a.stat_label,
      imageUrl: a.image_url || "",
    })),
  };
}

export async function getAdminData() {
  noStore();
  const supabase = createAdminClient();

  // 1. Get Hero settings
  const { data: settings } = await supabase
    .from("homepage_settings")
    .select("*")
    .eq("id", 1)
    .single();

  // 1b. Get About Page settings
  const { data: aboutSettings } = await supabase
    .from("about_page_settings")
    .select("*")
    .eq("id", 1)
    .single();

  // 1c. Get Team Members (all, including hidden)
  const { data: dbTeamMembers } = await supabase
    .from("team_members")
    .select("*")
    .order("display_order", { ascending: true });

  // 1d. Get Achievements (all, including hidden)
  const { data: dbAchievements } = await supabase
    .from("achievements")
    .select("*")
    .order("display_order", { ascending: true });

  // 1e. Get Leads (contact form submissions)
  const { data: dbLeads } = await supabase
    .from("contact_messages")
    .select("*")
    .order("created_at", { ascending: false });

  // 1f. Get Admins + pending admin invitations
  const { data: dbAdmins } = await supabase
    .from("profiles")
    .select("*")
    .eq("role", "admin")
    .order("created_at", { ascending: false });

  const { data: dbAdminInvites } = await supabase
    .from("admin_invitations")
    .select("*")
    .order("created_at", { ascending: false });

  // 2. Get Testimonials
  const { data: testimonials } = await supabase
    .from("testimonials")
    .select("*")
    .order("created_at", { ascending: false });

  // 3. Get All Bookings for Admin (Moved to top to compute dynamic enrollment counts)
  const { data: dbBookings } = await supabase
    .from("bookings")
    .select(`
      *,
      parent:parents(profile:profiles(full_name, email)),
      student:students(profile:profiles(full_name, email)),
      course:courses(title, mentor_id, mentor:mentors(profile:profiles(full_name))),
      session:sessions(title, mentor_id, mentor:mentors!sessions_mentor_id_fkey(profile:profiles(full_name)))
    `)
    .order("created_at", { ascending: false });

  // Scheduled classes per booking, used by the admin confirmation UI to show
  // (and optionally revise) the date/time a parent picked at booking time.
  const { data: dbScheduledClasses } = await supabase
    .from("scheduled_classes")
    .select("id, booking_id, scheduled_at")
    .order("scheduled_at", { ascending: true });

  const classesByBooking: Record<string, { id: string; scheduled_at: string }[]> = {};
  (dbScheduledClasses || []).forEach((c: Pick<Tables<"scheduled_classes">, "id" | "booking_id" | "scheduled_at">) => {
    if (!classesByBooking[c.booking_id]) classesByBooking[c.booking_id] = [];
    classesByBooking[c.booking_id].push({ id: c.id, scheduled_at: c.scheduled_at });
  });

  const bookings = (dbBookings || []).map((b: BookingAdminRow) => {
    const studentProfile = b.student?.profile;
    const studentName = studentProfile?.full_name || "Unknown Student";
    const studentEmail = studentProfile?.email || "";

    const parentProfile = b.parent?.profile;
    let parentEmail = parentProfile?.email || "";
    let parentName = parentProfile?.full_name || "";

    if (!parentEmail && studentEmail) {
      parentEmail = studentEmail;
    }
    if (!parentName || parentName === "Unknown Parent") {
      parentName = parentEmail || "Unknown Parent";
    }

    let itemTitle = "1-on-1 Direct Private Session";
    let bookingType = "1-on-1 Session";
    let mentorName = "";

    if (b.course) {
      itemTitle = b.course.title;
      bookingType = "Course";
      mentorName = b.course.mentor?.profile?.full_name || "";
    } else if (b.session) {
      itemTitle = b.session.title;
      bookingType = "Session";
      mentorName = b.session.mentor?.profile?.full_name || "";
    }

    const bookingClasses = classesByBooking[b.id] || [];
    const isSingleClassBooking = bookingClasses.length === 1;

    const paid = Number(b.amount_paid || 0);
    const total = Number(b.total_amount || paid || 0);
    const remaining = Math.max(0, total - paid);

    return {
      id: b.id,
      parentName,
      parentEmail,
      studentName,
      bookingType,
      itemTitle,
      mentorName,
      amountPaid: paid,
      totalAmount: total,
      remainingBalance: remaining,
      dueDate: b.due_date || null,
      status: b.status,
      paymentStatus: b.payment_status,
      paymentMethod: b.payment_method || "",
      paymentReference: b.payment_reference || "",
      paymentCollectedAt: b.payment_collected_at || null,
      mentorConfirmed: b.mentor_confirmed || false,
      adminNotes: b.admin_notes || "",
      createdAt: b.created_at,
      scheduledClassId: isSingleClassBooking ? bookingClasses[0].id : null,
      scheduledAt: isSingleClassBooking ? bookingClasses[0].scheduled_at : null,
    };
  });

  // Calculate actual database enrollment count per course / session
  const courseBookingCounts: Record<string, number> = {};
  const sessionBookingCounts: Record<string, number> = {};

  (dbBookings || []).forEach((b: Pick<Tables<"bookings">, "course_id" | "session_id">) => {
    if (b.course_id) {
      courseBookingCounts[b.course_id] = (courseBookingCounts[b.course_id] || 0) + 1;
    }
    if (b.session_id) {
      sessionBookingCounts[b.session_id] = (sessionBookingCounts[b.session_id] || 0) + 1;
    }
  });

  // 4. Get All Courses
  const { data: dbCourses } = await supabase
    .from("courses")
    .select("*, mentor:mentors(profile:profiles(full_name))")
    .order("created_at", { ascending: false });

  const courses = (dbCourses || []).map((c: CourseWithMentor) => {
    const style = mapSubjectToStyle(c.subject);
    const dbBookingCount = courseBookingCounts[c.id] || 0;
    return {
      id: c.id,
      title: c.title,
      description: c.description || "",
      aboutCourse: c.about_course || "",
      coverImageUrl: c.cover_image_url || "",
      subject: c.subject,
      format: c.format,
      price: Number(c.price),
      mentor: c.mentor?.profile?.full_name || "Unknown Mentor",
      students: dbBookingCount, // Dynamic enrolled students count
      rating: Number(c.rating),
      status: c.status,
      learningOutcomes: c.learning_outcomes || [],
      curriculum: c.curriculum || [],
      inclusions: c.inclusions || [],
      inclusionsEnabled: c.inclusions_enabled || [],
      batchStartDate: c.batch_start_date || "",
      batchEndDate: c.batch_end_date || "",
      classDays: c.class_days || "",
      classTiming: c.class_timing || "",
      classTime: c.class_time || "",
      durationMinutes: c.duration_minutes || 60,
      durationDays: Number(c.duration_days || 30),
      totalSessions: Number(c.total_sessions || 10),
      sessionsPerWeek: Number(c.sessions_per_week || 2),
      colorBg: style.colorBg,
      iconName: style.iconName,
      languages: c.languages || ["English"],
      classLevel: c.class_level || "",
    };
  });

  // 5. Get All Sessions
  const { data: dbSessions } = await supabase
    .from("sessions")
    .select("*, mentor:mentors!sessions_mentor_id_fkey(profile:profiles(full_name, avatar_url))")
    .order("created_at", { ascending: false });

  // Every mentor eligible to teach each session (a session can have more
  // than one — students pick which one they want at booking time).
  const { data: dbSessionMentors } = await supabase
    .from("session_mentors")
    .select("session_id, mentor:mentors(id, profile:profiles(full_name))");

  const mentorNamesBySession: Record<string, string[]> = {};
  for (const sm of dbSessionMentors || []) {
    const name = sm.mentor?.profile?.full_name;
    if (!name) continue;
    if (!mentorNamesBySession[sm.session_id]) mentorNamesBySession[sm.session_id] = [];
    mentorNamesBySession[sm.session_id].push(name);
  }

  const sessions = (dbSessions || []).map((s: SessionWithMentor) => {
    const name = s.mentor?.profile?.full_name || "Unknown Mentor";
    const init = name.split(" ").map((w: string) => w[0]).join("").substring(0, 2).toUpperCase();
    const dbBookingCount = sessionBookingCounts[s.id] || 0;
    return {
      id: s.id,
      title: s.title,
      description: s.description || "",
      mentor: name,
      mentorNames: mentorNamesBySession[s.id]?.length ? mentorNamesBySession[s.id] : [name],
      mentorAvatar: init,
      mentorColor: s.color_bg || "#1B3A6B",
      type: s.type,
      bookings: dbBookingCount, // Dynamic bookings count
      subject: s.subject,
      price: Number(s.price),
      status: s.status,
      colorBg: s.color_bg || "#ede9fe",
      iconName: s.icon_name || "writing",
      aboutSession: s.about_session || "",
      whatsCovered: s.whats_covered || [],
      inclusions: s.inclusions || [],
      inclusionsEnabled: s.inclusions_enabled || [],
      durationOptions: s.duration_options || "60 or 90 min",
      platform: s.platform || "Zoom",
      language: s.language || "English / Hindi",
      days: (s.days || "Mon – Sat").replace(/^Every\s+/i, ""),
      reschedulePolicy: s.reschedule_policy || "Up to 4 hrs before",
      sessionDate: s.session_date || "",
      sessionTime: s.session_time || "",
      durationMinutes: s.duration_minutes || 60,
      isRepeatable: s.is_repeatable || false,
      classLevel: s.class_level || "",
    };
  });

  // 6. Get All Mentors
  const { data: dbMentors } = await supabase
    .from("mentors")
    .select("*, profile:profiles(full_name, avatar_url, email)")
    .order("created_at", { ascending: false });

  const activeMentors = (dbMentors || []).map((m: MentorWithProfile<ProfileNameAvatarEmail>) => {
    const name = m.profile?.full_name || "Unknown Mentor";
    const init = name.split(" ").map((w: string) => w[0]).join("").substring(0, 2).toUpperCase();
    return {
      id: m.id,
      name,
      email: m.profile?.email || "",
      subject: m.expertise.join(" & "),
      rating: Number(m.rating),
      students: 420,
      courses: 10,
      rate: Number(m.hourly_rate),
      verified: m.verified || false,
      avatarText: init,
      avatarBg: "#1B3A6B",
      qualification: m.qualification || "Educator",
      experience: m.experience || 5,
      bio: m.bio || "",
    };
  });

  // Get pending invitations
  const { data: dbInvites } = await supabase
    .from("mentor_invitations")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  const pendingInvites = (dbInvites || []).map((inv: Tables<"mentor_invitations">) => {
    const name = inv.full_name || "Pending Mentor";
    const init = name.split(" ").map((w: string) => w[0]).join("").substring(0, 2).toUpperCase();
    return {
      id: `inv-${inv.id}`,
      name,
      email: inv.email,
      subject: inv.expertise.join(" & "),
      rating: 5.0,
      students: 0,
      courses: 0,
      rate: Number(inv.hourly_rate),
      verified: false,
      avatarText: init,
      avatarBg: "#9BA8C0",
      qualification: inv.qualification || "Educator",
      experience: inv.experience || 1,
      bio: "Invitation pending. Ready for sign up.",
      isInvitation: true,
    };
  });

  const mentors = [...pendingInvites, ...activeMentors];


  return {
    settings: settings || {
      badge_text: "#1 online tutoring platform",
      headline: "Learn faster with expert mentors by your side",
      accented_text: "expert mentors",
      subheading: "Connect with top-rated tutors for 1-on-1 sessions, structured courses, and hourly lessons — all tailored to your pace and goals.",
      primary_cta: "Find a mentor",
      primary_link: "/mentors",
      secondary_cta: "Browse courses",
      secondary_link: "/courses",
      c1: "12,400+",
      cl1: "Students enrolled",
      c2: "840+",
      cl2: "Expert mentors",
      c3: "320+",
      cl3: "Courses available",
      c4: "98%",
      cl4: "Satisfaction rate",
      hero_image_url: null,
    },
    testimonials: (testimonials || []).map((t: Tables<"testimonials">) => ({
      id: t.id,
      studentName: t.student_name,
      role: t.role,
      quote: t.quote,
      rating: t.rating,
      showOnSite: t.show_on_site,
      avatarBg: t.avatar_bg,
      avatarText: t.avatar_text,
      mediaUrl: t.media_url || "",
      mediaType: t.media_type || "",
    })),
    aboutSettings: aboutSettings || {
      hero_title: "About Gadha Online",
      hero_subtitle: "Connecting students with expert mentors since day one.",
      vision_title: "Our Vision",
      vision_text: "To make quality, personalized education accessible to every student, everywhere.",
      mission_title: "Our Mission",
      mission_text: "We connect students with verified, expert mentors for 1-on-1 sessions and structured courses tailored to their pace and goals.",
    },
    teamMembers: (dbTeamMembers || []).map((m: Tables<"team_members">) => ({
      id: m.id,
      name: m.name,
      role: m.role,
      bio: m.bio,
      photoUrl: m.photo_url || "",
      avatarBg: m.avatar_bg,
      avatarText: m.avatar_text,
      displayOrder: m.display_order,
      showOnSite: m.show_on_site,
    })),
    achievements: (dbAchievements || []).map((a: Tables<"achievements">) => ({
      id: a.id,
      statValue: a.stat_value,
      statLabel: a.stat_label,
      imageUrl: a.image_url || "",
      displayOrder: a.display_order,
      showOnSite: a.show_on_site,
    })),
    leads: (dbLeads || []).map((l: Tables<"contact_messages">) => ({
      id: l.id,
      fullName: l.full_name,
      email: l.email,
      subject: l.subject,
      phone: l.phone || "",
      message: l.message,
      isResolved: l.is_resolved,
      createdAt: l.created_at,
    })),
    admins: (dbAdmins || []).map((p: Tables<"profiles">) => ({
      id: p.id,
      fullName: p.full_name,
      email: p.email,
      createdAt: p.created_at,
    })),
    adminInvitations: (dbAdminInvites || []).map((inv: Tables<"admin_invitations">) => ({
      id: inv.id,
      email: inv.email,
      fullName: inv.full_name || "",
      status: inv.status,
      createdAt: inv.created_at,
    })),
    courses,
    sessions,
    mentors,
    bookings,
  };
}

// ----------------------------------------------------
// HERO SETTINGS
// ----------------------------------------------------

interface HeroSettingsInput {
  headline?: string;
  accented_text?: string;
  accentedText?: string;
  subheading?: string;
  primary_cta?: string;
  primaryCta?: string;
  primary_link?: string;
  primaryLink?: string;
  secondary_cta?: string;
  secondaryCta?: string;
  secondary_link?: string;
  secondaryLink?: string;
  c1?: string;
  cl1?: string;
  c2?: string;
  cl2?: string;
  c3?: string;
  cl3?: string;
  c4?: string;
  cl4?: string;
  hero_image_url?: string;
  heroImageUrl?: string;
}

export async function updateHeroSettings(data: HeroSettingsInput) {
  const supabase = createAdminClient();
  const updatePayload: TablesUpdate<"homepage_settings"> = {
    headline: data.headline,
    accented_text: data.accented_text || data.accentedText,
    subheading: data.subheading,
    primary_cta: data.primary_cta || data.primaryCta,
    primary_link: data.primary_link || data.primaryLink,
    secondary_cta: data.secondary_cta || data.secondaryCta,
    secondary_link: data.secondary_link || data.secondaryLink,
    c1: data.c1,
    cl1: data.cl1,
    c2: data.c2,
    cl2: data.cl2,
    c3: data.c3,
    cl3: data.cl3,
    c4: data.c4,
    cl4: data.cl4,
    updated_at: new Date().toISOString(),
  };

  if (data.hero_image_url || data.heroImageUrl) {
    updatePayload.hero_image_url = data.hero_image_url || data.heroImageUrl;
  }

  const { error } = await supabase
    .from("homepage_settings")
    .update(updatePayload)
    .eq("id", 1);

  if (error) throw new Error(error.message);
  revalidatePath("/");
  revalidatePath("/admin");
  return { success: true };
}

export async function uploadHeroImage(formData: FormData) {
  const file = formData.get("file") as File;
  if (!file) throw new Error("No file provided");

  const supabase = createAdminClient();
  const bucketName = "hero-images";
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) {
    console.error("Storage list error:", listError);
  }
  const bucketExists = buckets?.some((b) => b.name === bucketName);

  if (!bucketExists) {
    const { error: createError } = await supabase.storage.createBucket(bucketName, {
      public: true,
      fileSizeLimit: 10485760, // 10MB
    });
    if (createError) {
      console.warn("Storage bucket creation notice:", createError);
    }
  }

  const fileExt = file.name.split(".").pop();
  const fileName = `hero-${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error } = await supabase.storage
    .from(bucketName)
    .upload(fileName, buffer, {
      contentType: file.type,
      duplex: "half",
    });

  if (error) {
    throw new Error(`Upload failed: ${error.message}`);
  }

  const { data: { publicUrl } } = supabase.storage.from(bucketName).getPublicUrl(fileName);
  return { publicUrl };
}

// ----------------------------------------------------
// COURSES
// ----------------------------------------------------

interface CourseInput {
  id?: string;
  mentor: string;
  title: string;
  description?: string;
  aboutCourse?: string;
  subject: string;
  format: string;
  price: number | string;
  classLevel?: string;
  status: string;
  coverImageUrl?: string;
  students?: number;
  rating?: number;
  learningOutcomes?: string[];
  curriculum?: Tables<"courses">["curriculum"];
  inclusions?: string[];
  inclusionsEnabled?: boolean[];
  batchStartDate?: string;
  batchEndDate?: string;
  classDays?: string;
  classTiming?: string;
  classTime?: string;
  durationMinutes?: number;
  durationDays?: number;
  totalSessions?: number;
  sessionsPerWeek?: number;
  joinUrl?: string;
  languages?: string[];
}

export async function upsertCourse(course: CourseInput) {
  const supabase = createAdminClient();

  if (course.subject) await ensureSubjectExists(course.subject);

  // Resolve mentor string to a UUID
  let mentorId = await resolveMentorIdByName(course.mentor);
  if (!mentorId) {
    const { data } = await supabase.from("mentors").select("id").limit(1).single();
    mentorId = data?.id || null;
  }

  const courseData: TablesInsert<"courses"> = {
    title: course.title,
    description: course.description || `Structured course program in ${course.subject}.`,
    about_course: course.aboutCourse || "",
    subject: course.subject,
    format: course.format,
    price: Number(course.price),
    class_level: course.classLevel || null,
    mentor_id: mentorId,
    status: course.status,
    cover_image_url: course.coverImageUrl || "",
    students_count: Number(course.students || 0),
    rating: Number(course.rating || 5.0),
    learning_outcomes: course.learningOutcomes || [],
    curriculum: course.curriculum || [],
    inclusions: course.inclusions || [],
    batch_start_date: course.batchStartDate || "",
    batch_end_date: course.batchEndDate || "",
    class_days: course.classDays || "",
    class_timing: course.classTiming || "",
    class_time: course.classTime || null,
    duration_minutes: Number(course.durationMinutes || 60),
    duration_days: Number(course.durationDays || 30),
    total_sessions: Number(course.totalSessions || 10),
    sessions_per_week: Number(course.sessionsPerWeek || 2),
    join_url: course.joinUrl || null,
    languages: course.languages || ["English"],
    updated_at: new Date().toISOString(),
    ...(course.inclusionsEnabled ? { inclusions_enabled: course.inclusionsEnabled } : {}),
  };

  const isNew = !course.id || course.id.startsWith("c-");

  // Mentor schedule-conflict detection is handled separately (and
  // non-blockingly) by checkMentorScheduleConflict, called from the admin
  // drawer before this action runs. See src/lib/schedule.ts.

  if (isNew) {
    const { error } = await supabase.from("courses").insert([courseData]);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from("courses")
      .update(courseData)
      .eq("id", course.id!);
    if (error) throw new Error(error.message);
  }

  revalidatePath("/");
  revalidatePath("/admin");
  return { success: true };
}

export async function deleteCourse(id: string) {
  const supabase = createAdminClient();
  const { error } = await supabase.from("courses").delete().eq("id", id);
  if (error) {
    if (error.code === "23503") {
      throw new Error("This course has existing bookings and can't be deleted. Mark it as Draft/Inactive instead, or cancel its bookings first.");
    }
    throw new Error(error.message);
  }
  revalidatePath("/");
  revalidatePath("/admin");
  return { success: true };
}

export async function toggleCourseStatus(id: string, currentStatus: string) {
  const supabase = createAdminClient();
  const newStatus = currentStatus === "Active" ? "Draft" : "Active";
  const { error } = await supabase
    .from("courses")
    .update({ status: newStatus })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/");
  revalidatePath("/admin");
  return { success: true };
}

// ----------------------------------------------------
// SESSIONS
// ----------------------------------------------------

interface SessionInput {
  id?: string;
  session_id?: string;
  mentor: string;
  mentorNames?: string[];
  title?: string;
  description?: string;
  subject: string;
  type: string;
  price: number | string;
  classLevel?: string;
  status: string;
  colorBg?: string;
  iconName?: string;
  aboutSession?: string;
  whatsCovered?: string[];
  inclusions?: string[];
  inclusionsEnabled?: boolean[];
  durationOptions?: string;
  platform?: string;
  language?: string;
  days?: string;
  reschedulePolicy?: string;
  isRepeatable?: boolean;
  sessionDate?: string;
  sessionTime?: string;
  durationMinutes?: number;
  joinUrl?: string;
}

export async function upsertSession(session: SessionInput) {
  const supabase = createAdminClient();

  if (session.subject) await ensureSubjectExists(session.subject);

  // Resolve every assigned mentor's id — the primary `mentor` field stays
  // the session's default/display mentor (first in the list), while
  // session_mentors below tracks the full set students can choose between.
  const names = session.mentorNames && session.mentorNames.length > 0 ? session.mentorNames : [session.mentor];
  const resolvedIds: string[] = [];
  for (const name of names) {
    const id = await resolveMentorIdByName(name);
    if (id && !resolvedIds.includes(id)) resolvedIds.push(id);
  }

  let mentorId = resolvedIds[0] || null;
  if (!mentorId) {
    const { data } = await supabase.from("mentors").select("id").limit(1).single();
    mentorId = data?.id || null;
    if (mentorId) resolvedIds.push(mentorId);
  }

  if (!mentorId) {
    throw new Error("No mentors available to assign to this session.");
  }

  const sessionData: TablesInsert<"sessions"> = {
    title: session.title || "Untitled Session",
    description: session.description || "",
    mentor_id: mentorId,
    subject: session.subject,
    type: session.type,
    price: Number(session.price),
    class_level: session.classLevel || null,
    status: session.status,
    color_bg: session.colorBg || "#ede9fe",
    icon_name: session.iconName || "writing",
    about_session: session.aboutSession || "",
    whats_covered: session.whatsCovered || [],
    inclusions: session.inclusions || [],
    inclusions_enabled: session.inclusionsEnabled || [true, true, true, true, true],
    duration_options: session.durationOptions || "60 or 90 min",
    platform: session.platform || "Zoom",
    language: session.language || "English / Hindi",
    days: (session.days || "Mon – Sat").replace(/^Every\s+/i, ""),
    reschedule_policy: session.reschedulePolicy || "Up to 4 hrs before",
    session_date: session.isRepeatable ? null : (session.sessionDate || null),
    session_time: session.sessionTime || "",
    duration_minutes: Number(session.durationMinutes || 60),
    join_url: session.joinUrl || null,
    is_repeatable: session.isRepeatable || false,
  };

  const isNew = !session.id || session.id.startsWith("s-");
  let sessionId = session.id;

  if (isNew) {
    const { data, error } = await supabase.from("sessions").insert([sessionData]).select("id").single();
    if (error) throw new Error(error.message);
    sessionId = data.id;
  } else {
    const { error } = await supabase
      .from("sessions")
      .update(sessionData)
      .eq("id", session.id!);
    if (error) throw new Error(error.message);
    sessionId = session.id!;
  }

  // Sync the full set of eligible mentors for this session.
  await supabase.from("session_mentors").delete().eq("session_id", sessionId);
  const { error: mentorsErr } = await supabase
    .from("session_mentors")
    .insert(resolvedIds.map((id) => ({ session_id: sessionId!, mentor_id: id })));
  if (mentorsErr) throw new Error(mentorsErr.message);

  revalidatePath("/");
  revalidatePath("/admin");
  return { success: true };
}

export async function deleteSession(id: string) {
  const supabase = createAdminClient();
  const { error } = await supabase.from("sessions").delete().eq("id", id);
  if (error) {
    if (error.code === "23503") {
      throw new Error("This session has existing bookings and can't be deleted. Mark it as Inactive instead, or cancel its bookings first.");
    }
    throw new Error(error.message);
  }
  revalidatePath("/");
  revalidatePath("/admin");
  return { success: true };
}

export async function toggleSessionStatus(id: string, currentStatus: string) {
  const supabase = createAdminClient();
  const newStatus = currentStatus === "Active" ? "Inactive" : "Active";
  const { error } = await supabase
    .from("sessions")
    .update({ status: newStatus })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/");
  revalidatePath("/admin");
  return { success: true };
}

// ----------------------------------------------------
// MENTORS
// ----------------------------------------------------

interface MentorInput {
  id?: string;
  name: string;
  email: string;
  subject?: string;
  rate?: number | string;
  qualification?: string;
  experience?: number | string;
  verified?: boolean;
}

export async function upsertMentor(mentor: MentorInput) {
  const supabase = createAdminClient();

  const isNew = !mentor.id || mentor.id.startsWith("m-");

  if (isNew) {
    const expertiseArray = mentor.subject
      ? mentor.subject.split("&").map((s: string) => s.trim())
      : ["Mathematics"];

    const { error } = await supabase
      .from("mentor_invitations")
      .insert([
        {
          email: mentor.email.trim().toLowerCase(),
          full_name: mentor.name,
          hourly_rate: Number(mentor.rate || 0.00),
          expertise: expertiseArray,
          qualification: mentor.qualification || "Educator",
          experience: Number(mentor.experience || 1),
          status: "pending"
        }
      ]);

    if (error) throw new Error(error.message);
  } else if (mentor.id!.startsWith("inv-")) {
    const dbId = mentor.id!.replace("inv-", "");

    const { error } = await supabase
      .from("mentor_invitations")
      .update({
        email: mentor.email.trim().toLowerCase(),
        full_name: mentor.name,
      })
      .eq("id", dbId);

    if (error) throw new Error(error.message);
  } else {
    const { error: profileErr } = await supabase
      .from("profiles")
      .update({
        full_name: mentor.name,
        email: mentor.email?.trim().toLowerCase()
      })
      .eq("id", mentor.id!);

    if (profileErr) throw new Error(profileErr.message);

    const { error: mentorErr } = await supabase
      .from("mentors")
      .update({
        verified: mentor.verified,
      })
      .eq("id", mentor.id!);

    if (mentorErr) throw new Error(mentorErr.message);
  }

  revalidatePath("/");
  revalidatePath("/admin");
  return { success: true };
}

export async function deleteMentor(id: string) {
  const adminClient = createAdminClient();
  if (id.startsWith("inv-")) {
    const dbId = id.replace("inv-", "");
    const { error } = await adminClient
      .from("mentor_invitations")
      .delete()
      .eq("id", dbId);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await adminClient.auth.admin.deleteUser(id);
    if (error) throw new Error(error.message);
  }
  revalidatePath("/");
  revalidatePath("/admin");
  return { success: true };
}

// ----------------------------------------------------
// SUBJECTS
// ----------------------------------------------------

export async function getSubjects() {
  noStore();
  const supabase = await createClient();
  const { data: subjects, error } = await supabase
    .from("subjects")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);

  const { data: courses } = await supabase.from("courses").select("subject");
  const { data: sessions } = await supabase.from("sessions").select("subject");

  return (subjects || []).map((s) => ({
    id: s.id,
    name: s.name,
    iconName: s.icon_name,
    courseCount: (courses || []).filter((c) => c.subject === s.name).length,
    sessionCount: (sessions || []).filter((sess) => sess.subject === s.name).length,
  }));
}

export async function getSubjectDetails(name: string) {
  noStore();
  const supabase = await createClient();

  const { data: dbCourses } = await supabase
    .from("courses")
    .select("*, mentor:mentors(profile:profiles(full_name))")
    .eq("subject", name)
    .order("created_at", { ascending: false });

  const { data: dbSessions } = await supabase
    .from("sessions")
    .select("*, mentor:mentors!sessions_mentor_id_fkey(profile:profiles(full_name, avatar_url))")
    .eq("subject", name)
    .order("created_at", { ascending: false });

  return {
    courses: (dbCourses || []).map((c: CourseWithMentor) => ({
      id: c.id,
      title: c.title,
      format: c.format,
      price: Number(c.price),
      status: c.status,
      mentor: c.mentor?.profile?.full_name || "Unknown Mentor",
    })),
    sessions: (dbSessions || []).map((s: SessionWithMentor) => ({
      id: s.id,
      title: s.title,
      type: s.type,
      price: Number(s.price),
      status: s.status,
      mentor: s.mentor?.profile?.full_name || "Unknown Mentor",
    })),
  };
}

// Registers a subject name in the shared subjects table if it isn't already
// there. Used both by the admin Subjects page and by the "Create New
// Subject..." option in the course/session forms, so a subject typed in
// either place shows up everywhere subjects are listed.
export async function ensureSubjectExists(name: string, iconName: string = "book") {
  const trimmed = sanitizeText(name).trim();
  if (!trimmed) throw new Error("Subject name is required");

  const supabase = createAdminClient();

  // Case-insensitive check first — the DB unique constraint on `name` is
  // exact-match, so "Math" and "math" would otherwise both get created.
  const { data: existing } = await supabase
    .from("subjects")
    .select("id")
    .ilike("name", trimmed)
    .maybeSingle();

  if (existing) {
    revalidatePath("/");
    revalidatePath("/courses");
    revalidatePath("/sessions");
    revalidatePath("/mentors");
    revalidatePath("/admin/subjects");
    return { success: true };
  }

  const { error } = await supabase
    .from("subjects")
    .insert([{ name: trimmed, icon_name: iconName }])
    .select()
    .single();

  // Unique violation just means the subject already exists — that's fine.
  if (error && error.code !== "23505") throw new Error(error.message);

  revalidatePath("/");
  revalidatePath("/courses");
  revalidatePath("/sessions");
  revalidatePath("/mentors");
  revalidatePath("/admin/subjects");
  return { success: true };
}

export async function deleteSubject(id: string) {
  const supabase = createAdminClient();
  const { error } = await supabase.from("subjects").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/subjects");
  return { success: true };
}

// ----------------------------------------------------
// TESTIMONIALS
// ----------------------------------------------------

// Generic cleanup for any Supabase Storage public URL produced by the
// upload* actions in this file — parses "<bucket>/<path>" out of the public
// URL so callers don't need to track which bucket a given field came from.
export async function deleteStorageFileByUrl(url: string) {
  await assertAdminCaller();
  if (!url) return { success: false };

  const marker = "/storage/v1/object/public/";
  const idx = url.indexOf(marker);
  if (idx === -1) return { success: false };

  const rest = url.slice(idx + marker.length);
  const [bucket, ...pathParts] = rest.split("/");
  const path = decodeURIComponent(pathParts.join("/"));
  if (!bucket || !path) return { success: false };

  const adminClient = createAdminClient();
  const { error } = await adminClient.storage.from(bucket).remove([path]);
  if (error) {
    console.error("Failed to delete storage file:", error);
    return { success: false };
  }
  return { success: true };
}

export async function uploadTestimonialMedia(formData: FormData) {
  const file = formData.get("file") as File;
  if (!file) throw new Error("No file provided");

  const mediaType: "image" | "video" = file.type.startsWith("video/") ? "video" : "image";

  const supabase = createAdminClient();

  const bucketName = "testimonial-media";
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) {
    console.error("Storage list error:", listError);
  }
  const bucketExists = buckets?.some(b => b.name === bucketName);

  if (!bucketExists) {
    const { error: createError } = await supabase.storage.createBucket(bucketName, {
      public: true,
      fileSizeLimit: 26214400, // 25MB, video reviews need more headroom than images
    });
    if (createError) {
      console.warn("Storage bucket creation error or warning:", createError);
    }
  }

  const fileExt = file.name.split(".").pop();
  const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}.${fileExt}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error } = await supabase.storage
    .from(bucketName)
    .upload(fileName, buffer, {
      contentType: file.type,
      duplex: "half",
    });

  if (error) {
    throw new Error(`Upload failed: ${error.message}`);
  }

  const { data: { publicUrl } } = supabase.storage.from(bucketName).getPublicUrl(fileName);
  return { publicUrl, mediaType };
}

interface TestimonialInput {
  id?: string;
  studentName: string;
  role: string;
  quote: string;
  rating: number | string;
  showOnSite: boolean;
  avatarBg?: string;
  mediaUrl?: string;
  mediaType?: string;
}

export async function upsertTestimonial(testimonial: TestimonialInput) {
  const supabase = createAdminClient();

  const init = (testimonial.studentName || "S")
    .split(" ")
    .map((w: string) => w[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();

  const testiData: TablesInsert<"testimonials"> = {
    student_name: testimonial.studentName,
    role: testimonial.role,
    quote: testimonial.quote,
    rating: Number(testimonial.rating),
    show_on_site: testimonial.showOnSite,
    avatar_bg: testimonial.avatarBg || "#1B3A6B",
    avatar_text: init,
    media_url: testimonial.mediaUrl || null,
    media_type: testimonial.mediaUrl ? testimonial.mediaType || null : null,
  };

  const isNew = !testimonial.id || testimonial.id.startsWith("t-");

  if (isNew) {
    const { error } = await supabase.from("testimonials").insert([testiData]);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from("testimonials")
      .update(testiData)
      .eq("id", testimonial.id!);
    if (error) throw new Error(error.message);
  }

  revalidatePath("/");
  revalidatePath("/admin");
  return { success: true };
}

export async function deleteTestimonial(id: string) {
  const supabase = createAdminClient();
  const { error } = await supabase.from("testimonials").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/");
  revalidatePath("/admin");
  return { success: true };
}

export async function toggleTestimonialStatus(id: string, currentShow: boolean) {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("testimonials")
    .update({ show_on_site: !currentShow })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/");
  revalidatePath("/admin");
  return { success: true };
}

// ----------------------------------------------------
// ABOUT PAGE
// ----------------------------------------------------

interface AboutSettingsInput {
  heroTitle: string;
  heroSubtitle: string;
  visionTitle: string;
  visionText: string;
  missionTitle: string;
  missionText: string;
}

export async function updateAboutSettings(data: AboutSettingsInput) {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("about_page_settings")
    .update({
      hero_title: data.heroTitle,
      hero_subtitle: data.heroSubtitle,
      vision_title: data.visionTitle,
      vision_text: data.visionText,
      mission_title: data.missionTitle,
      mission_text: data.missionText,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);
  if (error) throw new Error(error.message);
  revalidatePath("/about");
  revalidatePath("/admin");
  return { success: true };
}

export async function uploadTeamMemberPhoto(formData: FormData) {
  const file = formData.get("file") as File;
  if (!file) throw new Error("No file provided");

  const supabase = createAdminClient();
  const bucketName = "team-photos";
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) {
    console.error("Storage list error:", listError);
  }
  const bucketExists = buckets?.some((b) => b.name === bucketName);

  if (!bucketExists) {
    const { error: createError } = await supabase.storage.createBucket(bucketName, {
      public: true,
      fileSizeLimit: 10485760, // 10MB
    });
    if (createError) {
      console.warn("Storage bucket creation notice:", createError);
    }
  }

  const fileExt = file.name.split(".").pop();
  const fileName = `team-${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error } = await supabase.storage
    .from(bucketName)
    .upload(fileName, buffer, {
      contentType: file.type,
      duplex: "half",
    });

  if (error) {
    throw new Error(`Upload failed: ${error.message}`);
  }

  const { data: { publicUrl } } = supabase.storage.from(bucketName).getPublicUrl(fileName);
  return { publicUrl };
}

interface TeamMemberInput {
  id?: string;
  name: string;
  role: string;
  bio?: string;
  photoUrl?: string;
  avatarBg?: string;
  displayOrder?: number;
  showOnSite: boolean;
}

export async function upsertTeamMember(member: TeamMemberInput) {
  const supabase = createAdminClient();

  const init = (member.name || "T")
    .split(" ")
    .map((w: string) => w[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();

  const memberData: TablesInsert<"team_members"> = {
    name: member.name,
    role: member.role,
    bio: member.bio || "",
    photo_url: member.photoUrl || "",
    avatar_bg: member.avatarBg || "#1B3A6B",
    avatar_text: init,
    display_order: Number(member.displayOrder) || 0,
    show_on_site: member.showOnSite,
  };

  const isNew = !member.id;

  if (isNew) {
    const { error } = await supabase.from("team_members").insert([memberData]);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from("team_members")
      .update(memberData)
      .eq("id", member.id!);
    if (error) throw new Error(error.message);
  }

  revalidatePath("/about");
  revalidatePath("/admin");
  return { success: true };
}

export async function deleteTeamMember(id: string) {
  const supabase = createAdminClient();
  const { error } = await supabase.from("team_members").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/about");
  revalidatePath("/admin");
  return { success: true };
}

export async function toggleTeamMemberStatus(id: string, currentShow: boolean) {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("team_members")
    .update({ show_on_site: !currentShow })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/about");
  revalidatePath("/admin");
  return { success: true };
}

export async function reorderTeamMembers(items: { id: string; displayOrder: number }[]) {
  const supabase = createAdminClient();
  for (const item of items) {
    await supabase
      .from("team_members")
      .update({ display_order: item.displayOrder })
      .eq("id", item.id);
  }
  revalidatePath("/about");
  revalidatePath("/admin");
  return { success: true };
}

export async function uploadAchievementImage(formData: FormData) {
  const file = formData.get("file") as File;
  if (!file) throw new Error("No file provided");

  const supabase = createAdminClient();
  const bucketName = "achievement-images";
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) {
    console.error("Storage list error:", listError);
  }
  const bucketExists = buckets?.some((b) => b.name === bucketName);

  if (!bucketExists) {
    const { error: createError } = await supabase.storage.createBucket(bucketName, {
      public: true,
      fileSizeLimit: 10485760, // 10MB
    });
    if (createError) {
      console.warn("Storage bucket creation notice:", createError);
    }
  }

  const fileExt = file.name.split(".").pop();
  const fileName = `achievement-${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error } = await supabase.storage
    .from(bucketName)
    .upload(fileName, buffer, {
      contentType: file.type,
      duplex: "half",
    });

  if (error) {
    throw new Error(`Upload failed: ${error.message}`);
  }

  const { data: { publicUrl } } = supabase.storage.from(bucketName).getPublicUrl(fileName);
  return { publicUrl };
}

interface AchievementInput {
  id?: string;
  statValue: string;
  statLabel: string;
  imageUrl?: string;
  displayOrder?: number;
  showOnSite: boolean;
}

export async function upsertAchievement(achievement: AchievementInput) {
  const supabase = createAdminClient();

  const achievementData: TablesInsert<"achievements"> = {
    stat_value: achievement.statValue,
    stat_label: achievement.statLabel,
    image_url: achievement.imageUrl || "",
    display_order: Number(achievement.displayOrder) || 0,
    show_on_site: achievement.showOnSite,
  };

  const isNew = !achievement.id;

  if (isNew) {
    const { error } = await supabase.from("achievements").insert([achievementData]);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from("achievements")
      .update(achievementData)
      .eq("id", achievement.id!);
    if (error) throw new Error(error.message);
  }

  revalidatePath("/about");
  revalidatePath("/admin");
  return { success: true };
}

export async function deleteAchievement(id: string) {
  const supabase = createAdminClient();
  const { error } = await supabase.from("achievements").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/about");
  revalidatePath("/admin");
  return { success: true };
}

export async function toggleAchievementStatus(id: string, currentShow: boolean) {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("achievements")
    .update({ show_on_site: !currentShow })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/about");
  revalidatePath("/admin");
  return { success: true };
}

export async function reorderAchievements(items: { id: string; displayOrder: number }[]) {
  const supabase = createAdminClient();
  for (const item of items) {
    await supabase
      .from("achievements")
      .update({ display_order: item.displayOrder })
      .eq("id", item.id);
  }
  revalidatePath("/about");
  revalidatePath("/admin");
  return { success: true };
}

// ----------------------------------------------------
// CONTACT MESSAGES
// ----------------------------------------------------

interface ContactMessageInput {
  fullName: string;
  email?: string;
  subject: string;
  phone: string;
  message: string;
}

export async function submitContactMessage(data: ContactMessageInput) {
  const fullName = sanitizeText(data.fullName, 100);
  const email = (data.email || "").trim();
  const subject = sanitizeText(data.subject, 150);
  const phone = sanitizeText(data.phone, 20);
  const message = sanitizeText(data.message, 2000);

  if (!fullName) {
    throw new Error("Please enter your full name.");
  }
  if (email && !validateEmail(email).valid) {
    throw new Error("Please enter a valid email address.");
  }
  if (!phone) {
    throw new Error("Please enter your mobile number.");
  }
  if (!validatePhone(phone).valid) {
    throw new Error("Please enter a valid phone number.");
  }
  if (!message) {
    throw new Error("Please enter your message.");
  }

  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    if (profile?.role === "mentor") {
      throw new Error("Mentor accounts can't use this form. Please reach out from your mentor dashboard instead.");
    }
  }

  const { error } = await supabase.from("contact_messages").insert([
    {
      full_name: fullName,
      email: email,
      subject: subject || "General Inquiry",
      phone: phone,
      message: message,
    },
  ]);

  if (error) throw new Error(error.message);

  await notifyAdmins({
    type: "new_lead",
    title: "New contact form lead",
    message: `${fullName} sent a message: "${subject || "General Inquiry"}"`,
    linkUrl: "/admin/leads",
  });

  return { success: true };
}

// ----------------------------------------------------
// LEADS (contact form submissions)
// ----------------------------------------------------

export async function toggleLeadResolved(id: string, currentResolved: boolean) {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("contact_messages")
    .update({ is_resolved: !currentResolved })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
  return { success: true };
}

// ----------------------------------------------------
// ADMIN MANAGEMENT
// ----------------------------------------------------

export async function inviteAdmin(data: { email: string; fullName?: string }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const adminClient = createAdminClient();
  const { error } = await adminClient.from("admin_invitations").insert([
    {
      email: data.email.trim().toLowerCase(),
      full_name: data.fullName || null,
      invited_by: user?.id || null,
      status: "pending",
    },
  ]);

  if (error) throw new Error(error.message);
  revalidatePath("/admin");
  return { success: true };
}

export async function revokeAdminInvite(id: string) {
  const supabase = createAdminClient();
  const { error } = await supabase.from("admin_invitations").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
  return { success: true };
}

// ----------------------------------------------------
// MOCK DATA SYNCRONIZER
// ----------------------------------------------------

// Mock data for fallback / sync database
const INITIAL_HERO = {
  badge_text: "#1 online tutoring platform",
  headline: "Learn faster with expert mentors by your side",
  accented_text: "expert mentors",
  subheading: "Connect with top-rated tutors for 1-on-1 sessions, structured courses, and hourly lessons — all tailored to your pace and goals.",
  primary_cta: "Find a mentor",
  primary_link: "/mentors",
  secondary_cta: "Browse courses",
  secondary_link: "/courses",
  c1: "12,400+",
  cl1: "Students enrolled",
  c2: "840+",
  cl2: "Expert mentors",
  c3: "320+",
  cl3: "Courses available",
  c4: "98%",
  cl4: "Satisfaction rate",
};

const INITIAL_COURSES = [
  {
    title: "Advanced Calculus & Algebra",
    subject: "Mathematics",
    format: "Live batch",
    price: 4999,
    mentor: "Arjun Kapoor",
    students: 1240,
    rating: 4.9,
    status: "Active",
  },
  {
    title: "Python for Beginners",
    subject: "Programming",
    format: "Live batch",
    price: 3499,
    mentor: "Rahul Nair",
    students: 892,
    rating: 4.8,
    status: "Active",
  },
  {
    title: "Chemistry: Class 11 & 12",
    subject: "Science",
    format: "Live batch",
    price: 3999,
    mentor: "Sneha Mehta",
    students: 643,
    rating: 4.7,
    status: "Active",
  },
  {
    title: "English Essay Writing",
    subject: "English",
    format: "Recorded",
    price: 999,
    mentor: "Priya Sharma",
    students: 410,
    rating: 4.6,
    status: "Draft",
  },
  {
    title: "NEET Biology Crash Course",
    subject: "Science",
    format: "Live batch",
    price: 6499,
    mentor: "Sneha Mehta",
    students: 780,
    rating: 4.9,
    status: "Active",
  },
];

const INITIAL_SESSIONS = [
  {
    title: "English Essay Writing",
    mentor: "Priya Sharma",
    type: "1-on-1",
    description: "Improve essay structure, argumentation and grammar with live feedback and doubt-clearing.",
    bookings: 98,
    subject: "English",
    price: 399,
    status: "Active",
    colorBg: "#ede9fe",
    iconName: "writing",
  },
  {
    title: "Statistics & Probability",
    mentor: "Arjun Kapoor",
    type: "1-on-1",
    description: "Confidence intervals, hypothesis testing and data interpretation for JEE & board exams.",
    bookings: 115,
    subject: "Mathematics",
    price: 449,
    status: "Active",
    colorBg: "#dbeafe",
    iconName: "calculator",
  },
  {
    title: "Python Doubt-Solving",
    mentor: "Rahul Nair",
    type: "Group",
    description: "Live code reviews, debugging help and concept clarification for Python learners of all levels.",
    bookings: 203,
    subject: "Programming",
    price: 549,
    status: "Active",
    colorBg: "#dcfce7",
    iconName: "code",
  },
  {
    title: "Physics Problem-Solving",
    mentor: "Arjun Kapoor",
    type: "1-on-1",
    description: "Mechanics, electrostatics and optics problem-sets worked through in real time.",
    bookings: 154,
    subject: "Science",
    price: 499,
    status: "Inactive",
    colorBg: "#dbeafe",
    iconName: "science",
  },
  {
    title: "Chemistry Concept Clarification",
    mentor: "Sneha Mehta",
    type: "1-on-1",
    description: "Organic and inorganic chemistry explained simply for NEET and Class 12 students.",
    bookings: 86,
    subject: "Science",
    price: 449,
    status: "Active",
    colorBg: "#fef9c3",
    iconName: "flask",
  },
];

const INITIAL_MENTORS = [
  {
    name: "Arjun Kapoor",
    subject: "Maths & Physics",
    rating: 4.9,
    students: 420,
    courses: 12,
    rate: 499,
    verified: true,
    bio: "IIT Delhi graduate with 8 years of experience preparing students for JEE and NEET.",
    qualification: "IIT Delhi",
    experience: 8,
  },
  {
    name: "Priya Sharma",
    subject: "English & Lit.",
    rating: 4.8,
    students: 310,
    courses: 8,
    rate: 399,
    verified: true,
    bio: "MA English from Delhi University. Specialises in essay coaching and creative writing.",
    qualification: "MA English, DU",
    experience: 6,
  },
  {
    name: "Rahul Nair",
    subject: "Computer Science",
    rating: 5.0,
    students: 580,
    courses: 15,
    rate: 549,
    verified: true,
    bio: "Senior engineer at a top tech firm. Teaches Python, DSA, and web development.",
    qualification: "B.Tech CS, Senior Engineer",
    experience: 7,
  },
  {
    name: "Sneha Mehta",
    subject: "Chemistry & Bio",
    rating: 4.7,
    students: 270,
    courses: 9,
    rate: 449,
    verified: false,
    bio: "MBBS graduate with a passion for making science concepts simple and exam-ready.",
    qualification: "MBBS",
    experience: 5,
  },
  {
    name: "Vikram Khanna",
    subject: "Maths & Stats",
    rating: 4.9,
    students: 312,
    courses: 10,
    rate: 459,
    verified: true,
    bio: "Professional statistician and tutor specializing in exam preparation and data math.",
    qualification: "Actuary",
    experience: 9,
  },
];

const INITIAL_TESTIMONIALS = [
  {
    studentName: "Rohan Agarwal",
    role: "JEE Advanced 2024 — AIR 412",
    quote: "Gadha Online helped me crack JEE Advanced. Arjun sir's sessions were incredibly structured and the doubt-clearing was instant.",
    rating: 5,
    showOnSite: true,
    avatarBg: "#1B3A6B",
    avatarText: "RA",
  },
  {
    studentName: "Aisha Naik",
    role: "Class 12, CBSE Board 2024",
    quote: "I improved my English essay score from a C to an A in just 6 sessions. Priya ma'am really knows her craft.",
    rating: 5,
    showOnSite: true,
    avatarBg: "#993556",
    avatarText: "AN",
  },
  {
    studentName: "Karan Patel",
    role: "Placed at Google, 2025",
    quote: "Rahul sir made DSA feel like a breeze. Got placed at my dream company within 3 months of starting the course.",
    rating: 5,
    showOnSite: false,
    avatarBg: "#0F6E56",
    avatarText: "KP",
  },
  {
    studentName: "Maya Verma",
    role: "Class 10, ICSE 2024",
    quote: "The live math classes were amazing. I could ask questions directly and practice worksheets were really detailed.",
    rating: 4,
    showOnSite: true,
    avatarBg: "#534AB7",
    avatarText: "MV",
  },
];

export async function syncMockDataToBackend() {
  const supabase = createAdminClient();
  const adminClient = createAdminClient();

  // 1. Sync Hero Settings
  await updateHeroSettings(INITIAL_HERO);

  // 2. Sync Mentors
  const mentorNameMap: Record<string, string> = {};

  for (const m of INITIAL_MENTORS) {
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("full_name", m.name)
      .eq("role", "mentor")
      .limit(1)
      .maybeSingle();

    let mentorId = existingProfile?.id;

    if (!mentorId) {
      const email = `${m.name.toLowerCase().replace(/[^a-z0-9]/g, "")}_${Date.now()}@gadhaonline.com`;
      const { data: authUser, error: authError } = await adminClient.auth.admin.createUser({
        email,
        password: "password123",
        email_confirm: true,
        user_metadata: {
          full_name: m.name,
          role: "mentor",
        },
      });

      if (authError || !authUser.user) {
        console.error("Failed to create auth user for mentor:", m.name, authError);
        continue;
      }
      mentorId = authUser.user.id;
    }

    mentorNameMap[m.name] = mentorId;

    await supabase.from("profiles").update({ full_name: m.name }).eq("id", mentorId);

    const expertiseArray = m.subject
      ? m.subject.split("&").map((s: string) => s.trim())
      : ["Mathematics"];

    await supabase
      .from("mentors")
      .update({
        bio: m.bio || "",
        expertise: expertiseArray,
        hourly_rate: Number(m.rate || 0),
        qualification: m.qualification || "Educator",
        experience: Number(m.experience || 1),
        verified: m.verified || false,
        is_active: true,
      })
      .eq("id", mentorId);
  }

  // 3. Sync Courses
  for (const c of INITIAL_COURSES) {
    let mentorId: string | null = mentorNameMap[c.mentor] || null;
    if (!mentorId) {
      mentorId = await resolveMentorIdByName(c.mentor);
    }

    const { data: existingCourse } = await supabase
      .from("courses")
      .select("id")
      .eq("title", c.title)
      .limit(1)
      .maybeSingle();

    const courseData = {
      title: c.title,
      description: `Structured course program in ${c.subject}.`,
      subject: c.subject,
      format: c.format,
      price: Number(c.price),
      mentor_id: mentorId,
      status: c.status,
      updated_at: new Date().toISOString(),
    };

    if (existingCourse) {
      await supabase.from("courses").update(courseData).eq("id", existingCourse.id);
    } else {
      await supabase.from("courses").insert([courseData]);
    }
  }

  // 4. Sync Sessions
  for (const s of INITIAL_SESSIONS) {
    let mentorId: string | null = mentorNameMap[s.mentor] || null;
    if (!mentorId) {
      mentorId = await resolveMentorIdByName(s.mentor);
    }

    if (!mentorId) continue;

    const { data: existingSession } = await supabase
      .from("sessions")
      .select("id")
      .eq("title", s.title)
      .limit(1)
      .maybeSingle();

    const sessionData = {
      title: s.title,
      description: s.description || "",
      mentor_id: mentorId,
      subject: s.subject,
      type: s.type,
      price: Number(s.price),
      status: s.status,
      color_bg: s.colorBg || "#ede9fe",
      icon_name: s.iconName || "writing",
    };

    if (existingSession) {
      await supabase.from("sessions").update(sessionData).eq("id", existingSession.id);
    } else {
      await supabase.from("sessions").insert([sessionData]);
    }
  }

  // 5. Sync Testimonials
  for (const t of INITIAL_TESTIMONIALS) {
    const { data: existingTesti } = await supabase
      .from("testimonials")
      .select("id")
      .eq("student_name", t.studentName)
      .limit(1)
      .maybeSingle();

    const testiData = {
      student_name: t.studentName,
      role: t.role,
      quote: t.quote,
      rating: Number(t.rating),
      show_on_site: t.showOnSite,
      avatar_bg: t.avatarBg,
      avatar_text: t.avatarText,
    };

    if (existingTesti) {
      await supabase.from("testimonials").update(testiData).eq("id", existingTesti.id);
    } else {
      await supabase.from("testimonials").insert([testiData]);
    }
  }

  revalidatePath("/");
  revalidatePath("/admin");
  return { success: true };
}

// ----------------------------------------------------
// CHAT & MESSAGING
// ----------------------------------------------------

export async function getChatRooms() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  // Get chat room IDs where current user is a participant
  const { data: participations, error: partError } = await supabase
    .from("chat_participants")
    .select("chat_room_id")
    .eq("user_id", user.id);

  if (partError || !participations) return [];

  const roomIds = participations.map(p => p.chat_room_id);
  if (roomIds.length === 0) return [];

  // Fetch the chat rooms and their participants/messages
  const { data: rooms, error: roomsError } = await supabase
    .from("chat_rooms")
    .select(`
      id,
      name,
      room_type,
      created_at,
      chat_participants(
        user_id,
        profile:profiles(full_name, role, avatar_url)
      )
    `)
    .in("id", roomIds);

  if (roomsError) throw new Error(roomsError.message);

  return rooms || [];
}

export async function getMessages(chatRoomId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: messages, error } = await supabase
    .from("messages")
    .select(`
      id,
      chat_room_id,
      sender_id,
      content,
      file_url,
      created_at,
      sender:profiles(full_name, role, avatar_url)
    `)
    .eq("chat_room_id", chatRoomId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  return messages || [];
}

// Notifies every other participant in a chat room that a new message arrived.
// Admins are intentionally skipped here — support rooms have no admin
// participant row (see getOrCreateSupportChatRoom), so this never fires for
// them; new tickets are covered separately by the `new_support_ticket` admin
// notification fired on room creation.
async function notifyChatRecipients(chatRoomId: string, senderId: string, content: string) {
  const adminClient = createAdminClient();

  const { data: participants } = await adminClient
    .from("chat_participants")
    .select("user_id")
    .eq("chat_room_id", chatRoomId)
    .neq("user_id", senderId);

  const recipientIds = (participants || []).map((p) => p.user_id);
  if (recipientIds.length === 0) return;

  const [{ data: sender }, { data: recipientProfiles }] = await Promise.all([
    adminClient.from("profiles").select("full_name").eq("id", senderId).single(),
    adminClient.from("profiles").select("id, role").in("id", recipientIds),
  ]);
  const senderName = sender?.full_name || "Someone";
  const preview = content.length > 80 ? content.slice(0, 80) + "…" : content;

  const parentIds = (recipientProfiles || []).filter((p) => p.role === "parent").map((p) => p.id);
  let mutedParentIds = new Set<string>();
  if (parentIds.length > 0) {
    const { data: parentPrefs } = await adminClient
      .from("parents")
      .select("id, notification_preferences")
      .in("id", parentIds);
    mutedParentIds = new Set(
      (parentPrefs || [])
        .filter((p) => (p.notification_preferences as Record<string, boolean> | null)?.mentor_messages === false)
        .map((p) => p.id)
    );
  }

  const userNotifRows: TablesInsert<"user_notifications">[] = [];
  const mentorNotifRows: TablesInsert<"mentor_notifications">[] = [];

  (recipientProfiles || []).forEach((p) => {
    if (p.role === "mentor") {
      mentorNotifRows.push({
        mentor_id: p.id,
        type: "new_message",
        title: "New message",
        message: `${senderName}: ${preview}`,
        link_url: "/mentor/messages",
        scheduled_for: new Date().toISOString(),
      });
    } else if (p.role === "student") {
      userNotifRows.push({
        user_id: p.id,
        type: "new_message",
        title: "New message",
        message: `${senderName}: ${preview}`,
        link_url: "/lms/messages",
      });
    } else if (p.role === "parent" && !mutedParentIds.has(p.id)) {
      userNotifRows.push({
        user_id: p.id,
        type: "new_message",
        title: "New message",
        message: `${senderName}: ${preview}`,
        link_url: "/dashboard/messages",
      });
    }
  });

  if (userNotifRows.length > 0) await adminClient.from("user_notifications").insert(userNotifRows);
  if (mentorNotifRows.length > 0) await adminClient.from("mentor_notifications").insert(mentorNotifRows);
}

export async function sendMessage(chatRoomId: string, content: string, fileUrl?: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data, error } = await supabase
    .from("messages")
    .insert([
      {
        chat_room_id: chatRoomId,
        sender_id: user.id,
        content,
        file_url: fileUrl || null,
      }
    ])
    .select()
    .single();

  if (error) throw new Error(error.message);

  await notifyChatRecipients(chatRoomId, user.id, content);

  return data;
}

// Finds (or creates) the single 1:1 chat room between exactly these two users.
// Room creation bypasses RLS via the admin client since chat_rooms has no
// authenticated-role INSERT policy — only participant-adding is self-serve.
async function getOrCreateDirectChatRoom(userIdA: string, userIdB: string) {
  const adminClient = createAdminClient();

  const { data: roomsA } = await adminClient
    .from("chat_participants")
    .select("chat_room_id")
    .eq("user_id", userIdA);

  const candidateRoomIds = (roomsA || []).map((r) => r.chat_room_id);

  if (candidateRoomIds.length > 0) {
    const { data: sharedRooms } = await adminClient
      .from("chat_participants")
      .select("chat_room_id")
      .in("chat_room_id", candidateRoomIds)
      .eq("user_id", userIdB);

    for (const shared of sharedRooms || []) {
      const { count } = await adminClient
        .from("chat_participants")
        .select("user_id", { count: "exact", head: true })
        .eq("chat_room_id", shared.chat_room_id);
      // Only reuse rooms that are strictly 1:1 between these two users,
      // never a room that also has a third participant.
      if (count === 2) {
        return shared.chat_room_id;
      }
    }
  }

  const { data: room, error: roomError } = await adminClient
    .from("chat_rooms")
    .insert([{}])
    .select("id")
    .single();
  if (roomError || !room) throw new Error(roomError?.message || "Failed to create chat room");

  const { error: partError } = await adminClient
    .from("chat_participants")
    .insert([
      { chat_room_id: room.id, user_id: userIdA },
      { chat_room_id: room.id, user_id: userIdB },
    ]);
  if (partError) throw new Error(partError.message);

  return room.id;
}

// Student-initiated: only allowed with mentors the student is actually
// (or was) confirmed-booked with, so a student can't message an arbitrary mentor.
export async function startConversationWithMentor(mentorId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: bookings } = await supabase
    .from("bookings")
    .select(`
      session_id, course_id, mentor_id,
      session:sessions(mentor_id),
      course:courses(mentor_id)
    `)
    .eq("student_id", user.id)
    .eq("status", "confirmed");

  const isEnrolledWithMentor = (bookings || []).some((b) => {
    const targetMentorId = b.mentor_id || b.session?.mentor_id || b.course?.mentor_id;
    return targetMentorId === mentorId;
  });
  if (!isEnrolledWithMentor) throw new Error("You can only message mentors you are enrolled with.");

  return getOrCreateDirectChatRoom(user.id, mentorId);
}

// Parent-initiated: only allowed for a mentor actually teaching the
// specified child, and only for a child that belongs to the calling parent.
// This keeps the parent<->mentor room entirely separate from any
// student<->mentor room for the same pairing, so messages never cross.
export async function startConversationWithMentorAsParent(mentorId: string, childId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: child } = await supabase
    .from("students")
    .select("parent_id")
    .eq("id", childId)
    .single();
  if (!child || child.parent_id !== user.id) throw new Error("Unauthorized");

  const { data: bookings } = await supabase
    .from("bookings")
    .select(`
      session_id, course_id, mentor_id,
      session:sessions(mentor_id),
      course:courses(mentor_id)
    `)
    .eq("student_id", childId)
    .eq("status", "confirmed");

  const mentorTeachesChild = (bookings || []).some((b) => {
    const targetMentorId = b.mentor_id || b.session?.mentor_id || b.course?.mentor_id;
    return targetMentorId === mentorId;
  });
  if (!mentorTeachesChild) throw new Error("This mentor is not teaching your child.");

  return getOrCreateDirectChatRoom(user.id, mentorId);
}

// ─── Gadha Online Support Chat ──────────────────────────────────────
// Every signed-in user (student, mentor, or parent) gets exactly one
// persistent support room (room_type = 'support'). These rooms have no
// admin participant by default — the admin inbox reads/writes them via
// the admin client, which bypasses the participant-only RLS policies.
export async function getOrCreateSupportChatRoom() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const adminClient = createAdminClient();

  const { data: existing } = await adminClient
    .from("chat_participants")
    .select("chat_room_id, chat_rooms!inner(room_type)")
    .eq("user_id", user.id)
    .eq("chat_rooms.room_type", "support")
    .limit(1)
    .maybeSingle();

  if (existing) return existing.chat_room_id;

  const { data: room, error: roomError } = await adminClient
    .from("chat_rooms")
    .insert([{ room_type: "support" }])
    .select("id")
    .single();
  if (roomError || !room) throw new Error(roomError?.message || "Failed to start support conversation");

  const { error: partError } = await adminClient
    .from("chat_participants")
    .insert([{ chat_room_id: room.id, user_id: user.id }]);
  if (partError) throw new Error(partError.message);

  const { data: profile } = await adminClient
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();
  await notifyAdmins({
    type: "new_support_ticket",
    title: "New support conversation",
    message: `${profile?.full_name || "A user"} started a new support conversation.`,
    linkUrl: "/admin/support",
  });

  return room.id;
}

async function assertAdminCaller() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") throw new Error("Unauthorized");
  return user;
}

export async function getPlatformSettings() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("platform_settings")
    .select("commission_rate, allow_signups")
    .eq("id", 1)
    .single();
  if (error) throw new Error(error.message);
  return {
    commissionRate: Number(data.commission_rate),
    allowSignups: data.allow_signups,
  };
}

export async function updatePlatformSettings(data: { commissionRate: number; allowSignups: boolean }) {
  await assertAdminCaller();
  const adminClient = createAdminClient();
  const { error } = await adminClient
    .from("platform_settings")
    .update({
      commission_rate: data.commissionRate,
      allow_signups: data.allowSignups,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/settings");
  return { success: true };
}

export async function getSupportConversations() {
  await assertAdminCaller();
  const adminClient = createAdminClient();

  const { data: rooms, error } = await adminClient
    .from("chat_rooms")
    .select(`
      id,
      created_at,
      chat_participants(
        user_id,
        profile:profiles(full_name, email, role)
      ),
      messages(content, created_at, sender_id)
    `)
    .eq("room_type", "support");

  if (error) throw new Error(error.message);

  return (rooms || [])
    .map((r) => {
      const requester = r.chat_participants?.[0];
      const sortedMsgs = [...(r.messages || [])].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      const last = sortedMsgs[sortedMsgs.length - 1];
      return {
        id: r.id,
        requesterId: requester?.user_id || "",
        requesterName: requester?.profile?.full_name || "Unknown",
        requesterEmail: requester?.profile?.email || "",
        requesterRole: requester?.profile?.role || "",
        lastMessage: last?.content || "",
        lastMessageAt: last?.created_at || r.created_at,
        needsReply: !!last && last.sender_id === requester?.user_id,
      };
    })
    .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
}

export async function getSupportMessages(roomId: string) {
  await assertAdminCaller();
  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from("messages")
    .select(`
      id, chat_room_id, sender_id, content, file_url, created_at,
      sender:profiles(full_name, role, avatar_url)
    `)
    .eq("chat_room_id", roomId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function sendSupportReply(roomId: string, content: string) {
  const admin = await assertAdminCaller();
  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from("messages")
    .insert([{ chat_room_id: roomId, sender_id: admin.id, content }])
    .select()
    .single();
  if (error) throw new Error(error.message);

  await notifyChatRecipients(roomId, admin.id, content);

  return data;
}

export async function getCoursesPageData() {
  noStore();
  const supabase = await createClient();
  const { data: dbCourses, error } = await supabase
    .from("courses")
    .select("*, mentor:mentors(profile:profiles(full_name))")
    .eq("status", "Active")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  return (dbCourses || []).map((c: CourseWithMentor) => {
    const style = mapSubjectToStyle(c.subject);
    return {
      id: c.id,
      title: c.title,
      description: c.description || "",
      subject: c.subject,
      format: c.format,
      price: Number(c.price),
      mentor: c.mentor?.profile?.full_name || "Unknown Mentor",
      students: c.students_count,
      rating: Number(c.rating),
      status: c.status,
      colorBg: style.colorBg,
      iconName: style.iconName,
      coverImageUrl: c.cover_image_url || "",
      languages: c.languages || ["English"],
      class_level: c.class_level || "",
    };
  });
}

export async function getCourseDetails(id: string) {
  const adminClient = createAdminClient();

  // 1. Fetch Course details
  const { data: c, error } = await adminClient
    .from("courses")
    .select("*, mentor:mentors(profile:profiles(full_name, avatar_url, email), expertise, rating, qualification, experience, bio)")
    .eq("id", id)
    .single();

  if (error || !c) {
    throw new Error(error ? error.message : "Course not found");
  }

  // Fetch Course Units to dynamically construct curriculum
  const { data: dbUnits } = await adminClient
    .from("course_units")
    .select("id, title, duration_seconds, module_name")
    .eq("course_id", id)
    .order("order_index", { ascending: true });

  const dynamicCurriculum: { name: string; meta: string; lessons: string[] }[] = [];
  if (dbUnits && dbUnits.length > 0) {
    const modulesMap: Record<string, { lessons: string[]; duration: number }> = {};
    const modulesList: string[] = [];

    dbUnits.forEach((u) => {
      const modName = u.module_name || "General Lessons";
      if (!modulesMap[modName]) {
        modulesMap[modName] = { lessons: [], duration: 0 };
        modulesList.push(modName);
      }
      modulesMap[modName].lessons.push(u.title);
      modulesMap[modName].duration += u.duration_seconds || 0;
    });

    modulesList.forEach((name) => {
      const { lessons, duration } = modulesMap[name];
      const hours = Math.floor(duration / 3600);
      const minutes = Math.round((duration % 3600) / 60);
      
      let metaStr = `${lessons.length} lesson${lessons.length === 1 ? "" : "s"}`;
      if (hours > 0) {
        metaStr += ` · ${hours}h ${minutes}m`;
      } else if (minutes > 0) {
        metaStr += ` · ${minutes}m`;
      }

      dynamicCurriculum.push({
        name,
        meta: metaStr,
        lessons
      });
    });
  }

  const style = mapSubjectToStyle(c.subject);
  
  // Resolve initials for avatar fallback
  const mentorName = c.mentor?.profile?.full_name || "Unknown Mentor";
  const initials = mentorName.split(" ").map((w: string) => w[0]).join("").substring(0, 2).toUpperCase();

  const courseMapped = {
    id: c.id,
    title: c.title,
    description: c.description || "",
    aboutCourse: c.about_course || "",
    subject: c.subject,
    format: c.format,
    price: Number(c.price),
    class_level: c.class_level || "",
    mentor: {
      id: c.mentor_id,
      name: mentorName,
      email: c.mentor?.profile?.email || "",
      avatarUrl: c.mentor?.profile?.avatar_url || "",
      avatarText: initials,
      expertise: c.mentor?.expertise ? c.mentor.expertise.join(" & ") : "Educator",
      rating: Number(c.mentor?.rating || 5.0),
      qualification: c.mentor?.qualification || "Educator",
      experience: c.mentor?.experience || 5,
      bio: c.mentor?.bio || "",
      students: c.students_count || 420,
    },
    students: c.students_count,
    rating: Number(c.rating),
    learningOutcomes: c.learning_outcomes || [],
    curriculum: dynamicCurriculum.length > 0 ? dynamicCurriculum : (c.curriculum || []),
    inclusions: c.inclusions || [],
    inclusionsEnabled: c.inclusions_enabled || [],
    batchStartDate: c.batch_start_date || "",
    batchEndDate: c.batch_end_date || "",
    classDays: c.class_days || "",
    classTiming: c.class_timing || "",
    durationDays: Number(c.duration_days || 30),
    totalSessions: Number(c.total_sessions || 10),
    sessionsPerWeek: Number(c.sessions_per_week || 2),
    coverImageUrl: c.cover_image_url || "",
    colorBg: style.colorBg,
    iconName: style.iconName,
    languages: c.languages || ["English"],
  };

  // 2. Fetch Related Courses (same category/subject, excluding current course)
  const { data: dbRelated } = await adminClient
    .from("courses")
    .select("*, mentor:mentors(profile:profiles(full_name))")
    .eq("status", "Active")
    .eq("subject", c.subject)
    .neq("id", id)
    .limit(3);

  let relatedMapped = (dbRelated || []).map((rc) => {
    const rStyle = mapSubjectToStyle(rc.subject);
    return {
      id: rc.id,
      title: rc.title,
      subject: rc.subject,
      format: rc.format,
      price: Number(rc.price),
      mentor: rc.mentor?.profile?.full_name || "Unknown Mentor",
      students: rc.students_count,
      rating: Number(rc.rating),
      colorBg: rStyle.colorBg,
      iconName: rStyle.iconName,
    };
  });

  // Safe fallback if not enough related courses in same subject
  if (relatedMapped.length < 3) {
    const { data: dbBackup } = await adminClient
      .from("courses")
      .select("*, mentor:mentors(profile:profiles(full_name))")
      .eq("status", "Active")
      .neq("id", id)
      .limit(3 - relatedMapped.length);

    const backupMapped = (dbBackup || []).map((rc) => {
      const rStyle = mapSubjectToStyle(rc.subject);
      return {
        id: rc.id,
        title: rc.title,
        subject: rc.subject,
        format: rc.format,
        price: Number(rc.price),
        mentor: rc.mentor?.profile?.full_name || "Unknown Mentor",
        students: rc.students_count,
        rating: Number(rc.rating),
        colorBg: rStyle.colorBg,
        iconName: rStyle.iconName,
      };
    });

    const merged = [...relatedMapped, ...backupMapped];
    const seen = new Set();
    relatedMapped = merged.filter(item => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    }).slice(0, 3);
  }

  return {
    course: courseMapped,
    related: relatedMapped,
  };
}

export async function uploadCourseCover(formData: FormData) {
  const file = formData.get("file") as File;
  if (!file) throw new Error("No file provided");

  const supabase = createAdminClient();

  // Ensure bucket exists
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) {
    console.error("Storage list error:", listError);
  }
  
  const bucketName = "course-covers";
  const bucketExists = buckets?.some(b => b.name === bucketName);

  if (!bucketExists) {
    const { error: createError } = await supabase.storage.createBucket(bucketName, {
      public: true,
      fileSizeLimit: 5242880, // 5MB
    });
    if (createError) {
      console.warn("Storage bucket creation error or warning:", createError);
    }
  }

  // Upload file
  const fileExt = file.name.split(".").pop();
  const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}.${fileExt}`;
  
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error } = await supabase.storage
    .from(bucketName)
    .upload(fileName, buffer, {
      contentType: file.type,
      duplex: "half",
    });

  if (error) {
    throw new Error(`Upload failed: ${error.message}`);
  }

  // Get public URL
  const { data: { publicUrl } } = supabase.storage.from(bucketName).getPublicUrl(fileName);
  return { publicUrl };
}

export async function uploadBookingAttachment(formData: FormData) {
  const file = formData.get("file") as File;
  if (!file) throw new Error("No file provided");

  const supabase = createAdminClient();

  // Ensure bucket exists
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) {
    console.error("Storage list error:", listError);
  }
  
  const bucketName = "booking-attachments";
  const bucketExists = buckets?.some(b => b.name === bucketName);

  if (!bucketExists) {
    const { error: createError } = await supabase.storage.createBucket(bucketName, {
      public: true,
      fileSizeLimit: 5242880, // 5MB
    });
    if (createError) {
      console.warn("Storage bucket creation error or warning:", createError);
    }
  }

  // Upload file
  const fileExt = file.name.split(".").pop();
  const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}.${fileExt}`;
  
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error } = await supabase.storage
    .from(bucketName)
    .upload(fileName, buffer, {
      contentType: file.type,
      duplex: "half",
    });

  if (error) {
    throw new Error(`Upload failed: ${error.message}`);
  }

  // Get public URL
  const { data: { publicUrl } } = supabase.storage.from(bucketName).getPublicUrl(fileName);
  return { publicUrl };
}

export async function getSessionsPageData() {
  noStore();
  const supabase = await createClient();
  const { data: dbSessions, error } = await supabase
    .from("sessions")
    .select("*, mentor:mentors!sessions_mentor_id_fkey(profile:profiles(full_name, avatar_url))")
    .eq("status", "Active")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  const sessionIds = (dbSessions || []).map((s) => s.id);
  const ratingBySession = new Map<string, number>();
  if (sessionIds.length > 0) {
    const { data: reviewRows } = await supabase
      .from("reviews")
      .select("session_id, rating")
      .in("session_id", sessionIds);
    const sums = new Map<string, { total: number; count: number }>();
    for (const r of reviewRows || []) {
      if (!r.session_id) continue;
      const entry = sums.get(r.session_id) || { total: 0, count: 0 };
      entry.total += r.rating;
      entry.count += 1;
      sums.set(r.session_id, entry);
    }
    for (const [id, { total, count } ] of sums) {
      ratingBySession.set(id, Math.round((total / count) * 10) / 10);
    }
  }

  return (dbSessions || []).map((s) => {
    const name = s.mentor?.profile?.full_name || "Unknown Mentor";
    const init = name.split(" ").map((w: string) => w[0]).join("").substring(0, 2).toUpperCase();
    return {
      id: s.id,
      title: s.title,
      description: s.description || "",
      mentor: name,
      mentorAvatar: init,
      mentorColor: s.color_bg || "#1B3A6B",
      type: s.type,
      bookings: s.bookings_count,
      subject: s.subject,
      price: Number(s.price),
      status: s.status,
      colorBg: s.color_bg || "#ede9fe",
      iconName: s.icon_name || "writing",
      class_level: s.class_level || "",
      rating: ratingBySession.get(s.id) || null,
    };
  });
}

export async function getSessionDetails(id: string) {
  const supabase = await createClient();

  // 1. Fetch Session details
  const { data: s, error } = await supabase
    .from("sessions")
    .select("*, mentor:mentors!sessions_mentor_id_fkey(profile:profiles(full_name, avatar_url, email), expertise, rating, qualification, experience, bio)")
    .eq("id", id)
    .single();

  if (error || !s) {
    throw new Error(error ? error.message : "Session not found");
  }

  // Resolve initials for avatar fallback
  const mentorName = s.mentor?.profile?.full_name || "Unknown Mentor";
  const initials = mentorName.split(" ").map((w: string) => w[0]).join("").substring(0, 2).toUpperCase();

  // Every mentor eligible to teach this session — a student picks one at
  // booking time when there's more than one.
  const { data: dbSessionMentors } = await supabase
    .from("session_mentors")
    .select("mentor:mentors(id, profile:profiles(full_name, avatar_url))")
    .eq("session_id", id);

  const availableMentors = (dbSessionMentors || [])
    .filter((sm) => sm.mentor?.id)
    .map((sm) => {
      const name = sm.mentor!.profile?.full_name || "Unknown Mentor";
      return {
        id: sm.mentor!.id,
        name,
        avatarUrl: sm.mentor!.profile?.avatar_url || "",
        avatarText: name.split(" ").map((w: string) => w[0]).join("").substring(0, 2).toUpperCase(),
      };
    });

  const sessionMapped = {
    id: s.id,
    title: s.title,
    description: s.description || "",
    subject: s.subject,
    type: s.type,
    price: Number(s.price),
    bookings: s.bookings_count,
    colorBg: s.color_bg || "#ede9fe",
    iconName: s.icon_name || "writing",
    class_level: s.class_level || "",
    aboutSession: s.about_session || "",
    whatsCovered: s.whats_covered || [],
    inclusions: s.inclusions || [],
    inclusionsEnabled: s.inclusions_enabled || [],
    durationOptions: s.duration_options || "60 or 90 min",
    platform: s.platform || "Zoom",
    language: s.language || "English / Hindi",
    days: (s.days || "").replace(/^Every\s+/i, ""),
    reschedulePolicy: s.reschedule_policy || "Up to 4 hrs before",
    sessionDate: s.session_date || "",
    sessionTime: s.session_time || "",
    isRepeatable: s.is_repeatable || false,
    mentor: {
      id: s.mentor_id,
      name: mentorName,
      email: s.mentor?.profile?.email || "",
      avatarUrl: s.mentor?.profile?.avatar_url || "",
      avatarText: initials,
      expertise: s.mentor?.expertise ? s.mentor.expertise.join(" & ") : "Educator",
      rating: Number(s.mentor?.rating || 5.0),
      qualification: s.mentor?.qualification || "Educator",
      experience: s.mentor?.experience || 5,
      bio: s.mentor?.bio || "",
    },
    availableMentors: availableMentors.length > 0
      ? availableMentors
      : [{ id: s.mentor_id, name: mentorName, avatarUrl: s.mentor?.profile?.avatar_url || "", avatarText: initials }],
  };

  // 2. Fetch Related Sessions (same subject, excluding current session)
  const { data: dbRelated } = await supabase
    .from("sessions")
    .select("*, mentor:mentors!sessions_mentor_id_fkey(profile:profiles(full_name))")
    .eq("status", "Active")
    .eq("subject", s.subject)
    .neq("id", id)
    .limit(3);

  let relatedMapped = (dbRelated || []).map((rs) => {
    return {
      id: rs.id,
      title: rs.title,
      subject: rs.subject,
      type: rs.type,
      price: Number(rs.price),
      mentor: rs.mentor?.profile?.full_name || "Unknown Mentor",
      bookings: rs.bookings_count,
      colorBg: rs.color_bg || "#ede9fe",
      iconName: rs.icon_name || "writing",
    };
  });

  // Safe fallback if not enough related sessions in same subject
  if (relatedMapped.length < 3) {
    const { data: dbBackup } = await supabase
      .from("sessions")
      .select("*, mentor:mentors!sessions_mentor_id_fkey(profile:profiles(full_name))")
      .eq("status", "Active")
      .neq("id", id)
      .limit(3 - relatedMapped.length);

    const backupMapped = (dbBackup || []).map((rs) => {
      return {
        id: rs.id,
        title: rs.title,
        subject: rs.subject,
        type: rs.type,
        price: Number(rs.price),
        mentor: rs.mentor?.profile?.full_name || "Unknown Mentor",
        bookings: rs.bookings_count,
        colorBg: rs.color_bg || "#ede9fe",
        iconName: rs.icon_name || "writing",
      };
    });

    const merged = [...relatedMapped, ...backupMapped];
    const seen = new Set();
    relatedMapped = merged.filter(item => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    }).slice(0, 3);
  }

  return {
    session: sessionMapped,
    related: relatedMapped,
  };
}

export async function getMentorsPageData() {
  const supabase = await createClient();

  const { data: dbMentors, error } = await supabase
    .from("mentors")
    .select("*, profile:profiles(full_name, avatar_url, email)")
    .eq("is_active", true)
    .order("rating", { ascending: false });

  if (error) throw new Error(error.message);

  return (dbMentors || [])
    .filter((m) => {
      const hasBio = m.bio && m.bio.trim() !== "" && m.bio !== "Biography...";
      const hasExpertise = m.expertise && m.expertise.length > 0;
      const hasRate = m.hourly_rate && Number(m.hourly_rate) > 0;
      const hasQual = m.qualification && m.qualification.trim() !== "" && m.qualification !== "Educator";
      const hasExp = m.experience && Number(m.experience) > 0;
      return hasBio && hasExpertise && hasRate && hasQual && hasExp;
    })
    .map((m) => {
      const name = m.profile?.full_name || "Unknown Mentor";
      const init = name.split(" ").map((w: string) => w[0]).join("").substring(0, 2).toUpperCase();
      return {
        id: m.id,
        name,
        expertise: m.expertise || [],
        subject: (m.expertise || []).join(" & "),
        rating: Number(m.rating),
        students: 420,
        courses: 10,
        rate: Number(m.hourly_rate),
        verified: m.verified || false,
        avatarText: init,
        avatarBg: "#1B3A6B",
        qualification: m.qualification || "Educator",
        experience: m.experience || 5,
        bio: m.bio || "",
      };
    });
}

export async function getMentorDetailsData(mentorId: string) {
  const supabase = await createClient();

  // 1. Fetch Mentor Profile
  const { data: m, error } = await supabase
    .from("mentors")
    .select("*, profile:profiles(full_name, avatar_url, email)")
    .eq("id", mentorId)
    .single();

  if (error || !m) {
    throw new Error(error ? error.message : "Mentor not found");
  }

  const name = m.profile?.full_name || "Unknown Mentor";
  const init = name.split(" ").map((w: string) => w[0]).join("").substring(0, 2).toUpperCase();
  const mentorMapped = {
    id: m.id,
    name,
    email: m.profile?.email || "",
    expertise: m.expertise || [],
    subject: (m.expertise || []).join(" & "),
    rating: Number(m.rating),
    students: 420,
    courses: 10,
    rate: Number(m.hourly_rate),
    verified: m.verified || false,
    avatarText: init,
    avatarBg: "#1B3A6B",
    qualification: m.qualification || "Educator",
    experience: m.experience || 5,
    bio: m.bio || "",
    availability: m.availability || {},
  };

  // 2. Fetch Mentor Courses
  const { data: dbCourses } = await supabase
    .from("courses")
    .select("*, mentor:mentors(profile:profiles(full_name))")
    .eq("mentor_id", mentorId)
    .eq("status", "Active")
    .order("created_at", { ascending: false });

  const coursesMapped = (dbCourses || []).map((c) => {
    const style = mapSubjectToStyle(c.subject);
    return {
      id: c.id,
      title: c.title,
      description: c.description || "",
      subject: c.subject,
      format: c.format,
      price: Number(c.price),
      mentor: c.mentor?.profile?.full_name || "Unknown Mentor",
      students: c.students_count,
      rating: Number(c.rating),
      status: c.status,
      colorBg: style.colorBg,
      iconName: style.iconName,
    };
  });

  // 3. Fetch Mentor Sessions
  const { data: dbSessions } = await supabase
    .from("sessions")
    .select("*, mentor:mentors!sessions_mentor_id_fkey(profile:profiles(full_name, avatar_url))")
    .eq("mentor_id", mentorId)
    .eq("status", "Active")
    .order("created_at", { ascending: false });

  const sessionsMapped = (dbSessions || []).map((s) => {
    const name = s.mentor?.profile?.full_name || "Unknown Mentor";
    const init = name.split(" ").map((w: string) => w[0]).join("").substring(0, 2).toUpperCase();
    return {
      id: s.id,
      title: s.title,
      description: s.description || "",
      mentor: name,
      mentorAvatar: init,
      mentorColor: s.color_bg || "#1B3A6B",
      type: s.type,
      bookings: s.bookings_count,
      subject: s.subject,
      price: Number(s.price),
      status: s.status,
      colorBg: s.color_bg || "#ede9fe",
      iconName: s.icon_name || "writing",
    };
  });

  // 4. Fetch Mentor Scheduled Classes
  const { data: dbClasses } = await supabase
    .from("scheduled_classes")
    .select(`
      id, 
      title, 
      scheduled_at, 
      duration_minutes,
      student:students(profile:profiles(full_name)),
      booking:bookings(
        id,
        course_id,
        session_id,
        course:courses(title, format),
        session:sessions(title, type)
      )
    `)
    .eq("mentor_id", mentorId);

  const classesMapped = (dbClasses || []).map((cls) => {
    const studentName = cls.student?.profile?.full_name || "Unknown Student";
    let bookingType = "1-on-1 Session";
    let itemName = cls.title;

    if (cls.booking) {
      if (cls.booking.course) {
        bookingType = `Course (${cls.booking.course.format || "Live batch"})`;
        itemName = cls.booking.course.title || cls.title;
      } else if (cls.booking.session) {
        bookingType = `Session (${cls.booking.session.type || "1-on-1"})`;
        itemName = cls.booking.session.title || cls.title;
      }
    }

    return {
      id: cls.id,
      title: cls.title,
      itemName,
      bookingType,
      studentName,
      scheduledAt: cls.scheduled_at,
      durationMinutes: cls.duration_minutes || 60,
    };
  });

  return {
    mentor: mentorMapped,
    courses: coursesMapped,
    sessions: sessionsMapped,
    scheduledClasses: classesMapped,
  };
}

// ----------------------------------------------------
// PARENT DASHBOARD ACTIONS
// ----------------------------------------------------

export async function getParentProfile() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("*, parents(*)")
    .eq("id", user.id)
    .single();

  if (profileErr) throw new Error(profileErr.message);

  return {
    id: profile.id,
    email: profile.email,
    name: profile.full_name,
    avatarUrl: profile.avatar_url || "",
    role: profile.role,
    phone: profile.parents?.phone || "",
    address: profile.parents?.address || "",
    twoFactorEnabled: profile.parents?.two_factor_enabled || false,
    notificationPreferences: profile.parents?.notification_preferences || {
      booking_confirmations: true,
      class_reminders: true,
      assignment_updates: true,
      mentor_messages: true,
      offers_promotions: false
    },
    createdAt: profile.created_at,
    emailConfirmedAt: user.email_confirmed_at || null,
  };
}

export async function updateParentProfile(data: { name: string; phone: string }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { error: profileErr } = await supabase
    .from("profiles")
    .update({ full_name: data.name })
    .eq("id", user.id);

  if (profileErr) throw new Error(profileErr.message);

  const { error: parentErr } = await supabase
    .from("parents")
    .update({ phone: data.phone })
    .eq("id", user.id);

  if (parentErr) throw new Error(parentErr.message);

  revalidatePath("/profile");
  return { success: true };
}

export async function updateParentSecurityAndNotifications(data: {
  twoFactorEnabled?: boolean;
  notificationPreferences?: Tables<"parents">["notification_preferences"];
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const updatePayload: TablesUpdate<"parents"> = {};
  if (data.twoFactorEnabled !== undefined) {
    updatePayload.two_factor_enabled = data.twoFactorEnabled;
  }
  if (data.notificationPreferences !== undefined) {
    updatePayload.notification_preferences = data.notificationPreferences;
  }

  const { error } = await supabase
    .from("parents")
    .update(updatePayload)
    .eq("id", user.id);

  if (error) throw new Error(error.message);

  revalidatePath("/profile");
  return { success: true };
}

export async function updateParentPassword(password: string) {
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw new Error(error.message);
  return { success: true };
}

export async function getParentChildren() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  // 1. Fetch active students — graceful fallback if RLS blocks
  const { data: dbStudents } = await supabase
    .from("students")
    .select("*, profile:profiles(full_name, email, avatar_url)")
    .eq("parent_id", user.id);

  const students = (dbStudents || []).map((s) => {
    const name = s.profile?.full_name || "Child User";
    const initials = name.split(" ").map((w: string) => w[0]).join("").substring(0, 2).toUpperCase();
    return {
      id: s.id,
      name,
      email: s.profile?.email || "",
      grade: s.grade_level || "Not Specified",
      school: s.school_name || "",
      avatarText: initials,
      joined: true,
      attendance: null,
      recentActivity: []
    };
  });

  // 2. Fetch pending student invitations — graceful fallback if RLS blocks
  const { data: dbInvites } = await supabase
    .from("student_invitations")
    .select("*")
    .eq("parent_id", user.id)
    .neq("status", "accepted");

  const invitations = (dbInvites || []).map((i) => {
    const name = i.full_name;
    const initials = name.split(" ").map((w: string) => w[0]).join("").substring(0, 2).toUpperCase();
    return {
      id: i.id,
      name,
      email: i.email,
      grade: i.grade_level || "Not Specified",
      school: i.school_name || "",
      avatarText: initials,
      joined: false,
      status: i.status,
      attendance: null,
      recentActivity: []
    };
  });

  return [...students, ...invitations];
}

export async function inviteChild(data: {
  name: string;
  email: string;
  grade: string;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const emailLower = data.email.trim().toLowerCase();
  const adminClient = createAdminClient();

  // 1. Check if email is already in profiles (any registered account)
  const { data: existingProfile } = await adminClient
    .from("profiles")
    .select("email")
    .eq("email", emailLower)
    .maybeSingle();

  if (existingProfile) {
    throw new Error("This email is already in use by another user.");
  }

  // 2. Check if email is already in student_invitations (pending/invited)
  const { data: existingInvite } = await adminClient
    .from("student_invitations")
    .select("email")
    .eq("email", emailLower)
    .neq("status", "accepted")
    .maybeSingle();

  if (existingInvite) {
    throw new Error("This child email has already been added.");
  }

  const { error } = await supabase
    .from("student_invitations")
    .insert([
      {
        parent_id: user.id,
        email: emailLower,
        full_name: data.name,
        grade_level: data.grade,
        status: "pending"
      }
    ]);

  if (error) throw new Error(error.message);

  // 3. Auto-register a shadow auth account for the child so they are immediately active and bookable
  const prefix = emailLower.split('@')[0];
  const password = `${prefix}123`;

  try {
    await adminClient.auth.admin.createUser({
      email: emailLower,
      password: password,
      email_confirm: true,
      user_metadata: {
        full_name: data.name,
        role: "student"
      }
    });
  } catch (authError) {
    console.error("Shadow auth creation failed for child:", authError instanceof Error ? authError.message : authError);
  }

  revalidatePath("/my-children");
  return { success: true };
}

export async function deleteChild(childId: string, isInvitation: boolean) {
  const userClient = await createClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const adminClient = createAdminClient(); // Use admin client to allow user cascading / deletion

  if (isInvitation) {
    const { data: invite, error: fetchErr } = await adminClient
      .from("student_invitations")
      .select("parent_id")
      .eq("id", childId)
      .single();
    if (fetchErr || !invite || invite.parent_id !== user.id) throw new Error("Invitation not found.");

    const { error } = await adminClient
      .from("student_invitations")
      .delete()
      .eq("id", childId);

    if (error) throw new Error(error.message);
  } else {
    const { data: student, error: fetchErr } = await adminClient
      .from("students")
      .select("parent_id")
      .eq("id", childId)
      .single();
    if (fetchErr || !student || student.parent_id !== user.id) throw new Error("Child profile not found.");

    // Delete the student's auth user which cascades to profiles, students, etc.
    const { error } = await adminClient.auth.admin.deleteUser(childId);
    if (error) throw new Error(error.message);
  }

  revalidatePath("/my-children");
  return { success: true };
}

export async function updateChild(
  childId: string,
  isInvitation: boolean,
  data: { name: string; grade: string; email?: string }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const adminClient = createAdminClient();

  if (isInvitation) {
    const { data: invite, error: fetchErr } = await adminClient
      .from("student_invitations")
      .select("parent_id")
      .eq("id", childId)
      .single();
    if (fetchErr || !invite || invite.parent_id !== user.id) throw new Error("Invitation not found.");

    const { error } = await adminClient
      .from("student_invitations")
      .update({
        full_name: data.name,
        grade_level: data.grade,
        email: data.email ? data.email.trim().toLowerCase() : undefined,
      })
      .eq("id", childId);
    if (error) throw new Error(error.message);
  } else {
    const { data: student, error: fetchErr } = await adminClient
      .from("students")
      .select("parent_id")
      .eq("id", childId)
      .single();
    if (fetchErr || !student || student.parent_id !== user.id) throw new Error("Child profile not found.");

    const { error: profileErr } = await adminClient
      .from("profiles")
      .update({ full_name: data.name })
      .eq("id", childId);
    if (profileErr) throw new Error(profileErr.message);

    const { error: studentErr } = await adminClient
      .from("students")
      .update({ grade_level: data.grade })
      .eq("id", childId);
    if (studentErr) throw new Error(studentErr.message);
  }

  revalidatePath("/my-children");
  return { success: true };
}

export async function resendChildInvitation(invitationId: string) {
  const supabase = await createClient();
  // Simulated resend: update created_at timestamp
  const { error } = await supabase
    .from("student_invitations")
    .update({ created_at: new Date().toISOString() })
    .eq("id", invitationId);

  if (error) throw new Error(error.message);
  return { success: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// INDEPENDENT STUDENT SELF-SIGNUP
// Reuses the student_invitations mechanism the handle_new_user() trigger
// already checks, instead of trusting a client-supplied role on signUp.
// ─────────────────────────────────────────────────────────────────────────────

export async function createSelfStudentInvite(email: string, fullName: string) {
  const emailLower = email.trim().toLowerCase();
  const adminClient = createAdminClient();

  const { data: existingProfile } = await adminClient
    .from("profiles")
    .select("email")
    .eq("email", emailLower)
    .maybeSingle();
  if (existingProfile) {
    throw new Error("This email is already registered.");
  }

  // Clear any stale self-signup invite for this email (parent_id is null for
  // independent student signups) so retries don't accumulate duplicates.
  await adminClient
    .from("student_invitations")
    .delete()
    .is("parent_id", null)
    .eq("email", emailLower);

  const { error } = await adminClient
    .from("student_invitations")
    .insert([{
      parent_id: null,
      email: emailLower,
      full_name: fullName,
      status: "pending",
    }]);
  if (error) throw new Error(error.message);

  return { success: true };
}

export async function getParentBookings() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  // Fetch all bookings for this parent
  const { data: dbBookings, error } = await supabase
    .from("bookings")
    .select(`
      id,
      status,
      payment_status,
      amount_paid,
      student_id,
      session_id,
      course_id,
      created_at,
      student:students(profile:profiles(full_name)),
      session:sessions(title, type, price, subject, color_bg, icon_name, mentor:mentors!sessions_mentor_id_fkey(profile:profiles(full_name))),
      course:courses(title, format, price, subject, batch_start_date, batch_end_date, duration_days, mentor:mentors(profile:profiles(full_name)))
    `)
    .eq("parent_id", user.id);

  if (error) throw new Error(error.message);

  // Session bookings get their real scheduled date/time from scheduled_classes
  // (created alongside the booking — see createBookingRecord), not a fixed string.
  const sessionBookingIds = (dbBookings || []).filter((b) => !b.course_id).map((b) => b.id);
  const scheduledByBookingId = new Map<string, { scheduled_at: string; duration_minutes: number | null }>();
  if (sessionBookingIds.length > 0) {
    const { data: scheduledClasses } = await supabase
      .from("scheduled_classes")
      .select("booking_id, scheduled_at, duration_minutes")
      .in("booking_id", sessionBookingIds);
    for (const sc of scheduledClasses || []) {
      if (sc.booking_id) scheduledByBookingId.set(sc.booking_id, sc);
    }
  }

  return (dbBookings || []).map((b) => {
    const childName = b.student?.profile?.full_name || "Unknown Child";
    const childInitials = childName.split(" ").map((w: string) => w[0]).join("").substring(0, 2).toUpperCase();

    const isCourse = !!b.course_id;
    const courseTarget = b.course;
    const sessionTarget = b.session;

    const mentorName = (isCourse ? courseTarget?.mentor?.profile?.full_name : sessionTarget?.mentor?.profile?.full_name) || "Unknown Mentor";

    let dateTimeStr = "";
    let durationStr = "";

    if (!isCourse) {
      const scheduled = scheduledByBookingId.get(b.id);
      if (scheduled) {
        const d = new Date(scheduled.scheduled_at);
        dateTimeStr = d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }) + " · " + d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
        durationStr = `${scheduled.duration_minutes || 60} min`;
      } else {
        dateTimeStr = "Timing to be confirmed";
        durationStr = "";
      }
    } else {
      const format = courseTarget?.format || "Live batch";
      if (format === "Recorded") {
        dateTimeStr = "Enrolled · Self-paced";
        durationStr = "Lifetime Access";
      } else {
        const durationDays = courseTarget?.duration_days ? Number(courseTarget.duration_days) : 0;
        const durationWeeks = durationDays > 0 ? Math.ceil(durationDays / 7) : 8;
        dateTimeStr = `Enrolled · ${durationWeeks} weeks`;

        if (courseTarget?.batch_start_date) {
          try {
            const start = new Date(courseTarget.batch_start_date);
            const now = new Date();
            const diffMs = now.getTime() - start.getTime();
            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
            const currentWeek = Math.max(1, Math.ceil((diffDays + 1) / 7));
            if (currentWeek <= durationWeeks) {
              durationStr = `Week ${currentWeek} of ${durationWeeks}`;
            } else {
              durationStr = "Completed";
            }
          } catch {
            durationStr = `Week 1 of ${durationWeeks}`;
          }
        } else {
          durationStr = `Week 1 of ${durationWeeks}`;
        }
      }
    }

    return {
      id: b.id,
      studentId: b.student_id,
      childName,
      childInitials,
      title: (isCourse ? courseTarget?.title : sessionTarget?.title) || "Untitled",
      subject: (isCourse ? courseTarget?.subject : sessionTarget?.subject) || "Subject",
      type: isCourse ? "Course" : (sessionTarget?.type || "Session"),
      format: isCourse ? (courseTarget?.format || "Live batch") : (sessionTarget?.type || "1-on-1"),
      mentorName,
      price: Number(b.amount_paid || (isCourse ? courseTarget?.price : sessionTarget?.price) || 0),
      status: b.status, // pending, confirmed, cancelled, completed
      paymentStatus: b.payment_status, // unpaid, paid, refunded
      colorBg: !isCourse ? (sessionTarget?.color_bg || "#ede9fe") : (courseTarget?.subject === "Programming" ? "#dcfce7" : courseTarget?.subject === "Mathematics" ? "#dbeafe" : courseTarget?.subject === "Science" ? "#fef9c3" : "#ede9fe"),
      iconName: !isCourse ? (sessionTarget?.icon_name || "writing") : (courseTarget?.subject === "Programming" ? "code" : courseTarget?.subject === "Mathematics" ? "math" : courseTarget?.subject === "Science" ? "flask" : "book"),
      dateTime: dateTimeStr,
      duration: durationStr,
      batchStartDate: isCourse ? courseTarget?.batch_start_date : null,
      batchEndDate: isCourse ? courseTarget?.batch_end_date : null,
      durationDays: isCourse ? courseTarget?.duration_days : null,
      createdAt: b.created_at,
    };
  });
}

// ----------------------------------------------------
// PARENT DASHBOARD — PAGE-LEVEL ACTIONS
// ----------------------------------------------------

export async function getChildOverviewStats(childId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: dbBookings } = await supabase
    .from("bookings")
    .select(`
      id, status, payment_status, amount_paid, student_id, session_id, course_id,
      session:sessions(title, subject, icon_name, mentor:mentors!sessions_mentor_id_fkey(profile:profiles(full_name))),
      course:courses(title, subject, mentor:mentors(profile:profiles(full_name)))
    `)
    .eq("student_id", childId)
    .neq("status", "cancelled");

  const bookings = dbBookings || [];
  const activeCourses = bookings.filter((b) => !!b.course_id && b.status === "confirmed").length;
  const activeSessions = bookings.filter((b) => !!b.session_id && b.status === "confirmed").length;

  const { data: dbAttendance } = await supabase
    .from("attendance_records")
    .select("id, status, session_date, subject")
    .eq("student_id", childId);

  const attendance = dbAttendance || [];
  const totalClasses = attendance.length;
  const attendedClasses = attendance.filter((a) => a.status === "present").length;
  const attendanceRate = totalClasses > 0 ? Math.round((attendedClasses / totalClasses) * 100) : null;

  const subjectMap: Record<string, { total: number; present: number }> = {};
  for (const rec of attendance) {
    const s: string = rec.subject || "General";
    if (!subjectMap[s]) subjectMap[s] = { total: 0, present: 0 };
    subjectMap[s].total++;
    if (rec.status === "present") subjectMap[s].present++;
  }
  const subjectAttendance = Object.entries(subjectMap).map(([name, v]) => ({
    name,
    pct: Math.round((v.present / v.total) * 100),
  }));

  const { data: dbUpcoming } = await supabase
    .from("scheduled_classes")
    .select("*, mentor:mentors(profile:profiles(full_name))")
    .eq("student_id", childId)
    .eq("status", "scheduled")
    .gte("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(1);

  const firstUpcoming = (dbUpcoming || [])[0] ?? null;
  const upcomingClass = firstUpcoming
    ? {
        title: firstUpcoming.title,
        subject: firstUpcoming.subject,
        mentor: firstUpcoming.mentor?.profile?.full_name || "Mentor",
        dateTime: new Date(firstUpcoming.scheduled_at).toLocaleString("en-IN", {
          weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
        }),
        iconName: firstUpcoming.icon_name || "book",
        joinUrl: firstUpcoming.join_url,
      }
    : null;

  const { data: dbAssignments } = await supabase
    .from("assignments")
    .select("id, title, subject, due_date, status")
    .eq("student_id", childId)
    .neq("status", "graded");

  const assignments = dbAssignments || [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const pendingAssignments = assignments.filter((a) => a.status !== "submitted" && a.status !== "graded");
  const overdueAssignments = pendingAssignments.filter(
    (a) => a.due_date && new Date(a.due_date) < today
  );

  const recentActivity: { text: string; time: string; type: string }[] = [];
  const recentAttendance = [...attendance]
    .sort((a, b) => new Date(b.session_date).getTime() - new Date(a.session_date).getTime())
    .slice(0, 3);
  for (const rec of recentAttendance) {
    recentActivity.push({
      text: `${rec.status === "present" ? "Attended" : "Missed"} ${rec.subject} session`,
      time: new Date(rec.session_date).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" }),
      type: rec.status === "present" ? "attended" : "missed",
    });
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thisMonthRecords = attendance.filter((r) => new Date(r.session_date) >= thirtyDaysAgo);

  return {
    activeCourses,
    activeSessions,
    totalEnrolled: activeCourses + activeSessions,
    attendanceRate,
    attendedClasses,
    totalClasses,
    thisMonthAttended: thisMonthRecords.filter((r) => r.status === "present").length,
    thisMonthTotal: thisMonthRecords.length,
    subjectAttendance,
    upcomingClass,
    pendingAssignmentsCount: pendingAssignments.length,
    overdueAssignmentsCount: overdueAssignments.length,
    recentActivity,
  };
}

export async function getChildScheduledClasses(childId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: dbClasses, error } = await supabase
    .from("scheduled_classes")
    .select("*, mentor:mentors(profile:profiles(full_name))")
    .eq("student_id", childId)
    .order("scheduled_at", { ascending: true });

  if (error) throw new Error(error.message);

  return (dbClasses || []).map((c) => ({
    id: c.id,
    title: c.title,
    subject: c.subject,
    mentor: c.mentor?.profile?.full_name || "Unknown Mentor",
    scheduledAt: c.scheduled_at,
    dateTime: new Date(c.scheduled_at).toLocaleString("en-IN", {
      weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
    }),
    durationMinutes: c.duration_minutes,
    status: c.status,
    joinUrl: c.join_url,
    iconName: c.icon_name || "book",
  }));
}

export async function getChildAttendance(childId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: dbRecords, error } = await supabase
    .from("attendance_records")
    .select("*")
    .eq("student_id", childId)
    .order("session_date", { ascending: false });

  if (error) throw new Error(error.message);

  const records = dbRecords || [];
  const totalClasses = records.length;
  const attendedClasses = records.filter((r) => r.status === "present").length;
  const attendanceRate = totalClasses > 0 ? Math.round((attendedClasses / totalClasses) * 100) : null;

  const subjectMap: Record<string, { total: number; present: number }> = {};
  for (const rec of records) {
    const s: string = rec.subject || "General";
    if (!subjectMap[s]) subjectMap[s] = { total: 0, present: 0 };
    subjectMap[s].total++;
    if (rec.status === "present") subjectMap[s].present++;
  }
  const subjectBreakdown = Object.entries(subjectMap).map(([name, v]) => ({
    name,
    attended: v.present,
    total: v.total,
    pct: Math.round((v.present / v.total) * 100),
  }));

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thisMonthRecords = records.filter((r) => new Date(r.session_date) >= thirtyDaysAgo);

  return {
    attendanceRate,
    attendedClasses,
    totalClasses,
    thisMonthAttended: thisMonthRecords.filter((r) => r.status === "present").length,
    thisMonthTotal: thisMonthRecords.length,
    subjectBreakdown,
    records: records.map((r) => ({
      id: r.id,
      date: r.session_date,
      subject: r.subject,
      status: r.status,
      notes: r.notes || "",
    })),
  };
}

export async function getChildAssignments(childId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: dbAssignments, error } = await supabase
    .from("assignments")
    .select("*, mentor:mentors(profile:profiles(full_name))")
    .eq("student_id", childId)
    .order("due_date", { ascending: true });

  if (error) throw new Error(error.message);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (dbAssignments || []).map((a) => {
    let status = a.status;
    if (status === "pending" && a.due_date && new Date(a.due_date) < today) {
      status = "overdue";
    }
    const dueDate = a.due_date ? new Date(a.due_date) : null;
    const dueMeta = dueDate
      ? status === "overdue"
        ? `was due ${dueDate.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`
        : `due ${dueDate.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`
      : "No deadline";

    return {
      id: a.id,
      title: a.title,
      subject: a.subject,
      status: status.charAt(0).toUpperCase() + status.slice(1),
      dueMeta,
      score: a.score,
      feedback: a.feedback || "",
      mentor: a.mentor?.profile?.full_name || "Mentor",
    };
  });
}

export async function getChildEnrolledMentors(childId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: dbBookings, error } = await supabase
    .from("bookings")
    .select(`
      id, session_id, course_id, status,
      session:sessions(title, subject, icon_name, mentor:mentors!sessions_mentor_id_fkey(id, profile:profiles(full_name, avatar_url))),
      course:courses(title, subject, mentor:mentors(id, profile:profiles(full_name, avatar_url)))
    `)
    .eq("student_id", childId)
    .eq("status", "confirmed");

  if (error) throw new Error(error.message);

  const mentorMap: Record<string, { id: string; name: string; subject: string; initials: string }> = {};

  for (const b of (dbBookings || [])) {
    const target = b.session_id ? b.session : b.course;
    if (!target?.mentor) continue;

    const mentorId = target.mentor.id;
    const mentorName = target.mentor.profile?.full_name || "Unknown Mentor";
    const subject = target.subject || "Tutoring";

    if (!mentorMap[mentorId]) {
      const initials = mentorName
        .split(" ")
        .map((w: string) => w[0])
        .join("")
        .substring(0, 2)
        .toUpperCase();

      mentorMap[mentorId] = { id: mentorId, name: mentorName, subject, initials };
    }
  }

  return Object.values(mentorMap);
}

// ============================================================
// STUDENT DASHBOARD ACTIONS
// ============================================================

export async function getStudentProfile() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, avatar_url")
    .eq("id", user.id)
    .single();

  const { data: student } = await supabase
    .from("students")
    .select("grade_level, school_name, interests")
    .eq("id", user.id)
    .single();

  return {
    id: profile?.id ?? user.id,
    name: profile?.full_name ?? "Student",
    email: profile?.email ?? user.email ?? "",
    role: profile?.role ?? "student",
    avatarText: (profile?.full_name ?? "S")
      .split(" ")
      .map((w: string) => w[0])
      .join("")
      .substring(0, 2)
      .toUpperCase(),
    gradeLevel: student?.grade_level ?? null,
    schoolName: student?.school_name ?? null,
  };
}

export async function getStudentOverviewStats() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const studentId = user.id;

  // Attendance
  const { data: attRows } = await supabase
    .from("attendance_records")
    .select("status, session_date, subject")
    .eq("student_id", studentId)
    .order("session_date", { ascending: false });

  const allAtt = attRows || [];
  const totalAtt = allAtt.length;
  const presentAtt = allAtt.filter((r) => r.status === "present").length;
  const attendanceRate = totalAtt > 0 ? Math.round((presentAtt / totalAtt) * 100) : null;

  // Subject attendance breakdown
  const subjMap: Record<string, { present: number; total: number }> = {};
  for (const r of allAtt) {
    if (!subjMap[r.subject]) subjMap[r.subject] = { present: 0, total: 0 };
    subjMap[r.subject].total++;
    if (r.status === "present") subjMap[r.subject].present++;
  }
  const subjectAttendance = Object.entries(subjMap).map(([name, v]) => ({
    name,
    pct: Math.round((v.present / v.total) * 100),
  }));

  // Next class
  const now = new Date().toISOString();
  const { data: nextClassRows } = await supabase
    .from("scheduled_classes")
    .select("id, title, subject, scheduled_at, duration_minutes, join_url, mentor:mentors(profile:profiles(full_name))")
    .eq("student_id", studentId)
    .eq("status", "scheduled")
    .gte("scheduled_at", now)
    .order("scheduled_at", { ascending: true })
    .limit(1);

  const nc = (nextClassRows || [])[0];
  const nextClass = nc
    ? {
        id: nc.id,
        title: nc.title,
        subject: nc.subject,
        mentor: nc.mentor?.profile?.full_name ?? "Mentor",
        scheduledAt: nc.scheduled_at,
        dateTime: new Date(nc.scheduled_at).toLocaleString("en-IN", {
          weekday: "short", day: "numeric", month: "short",
          hour: "2-digit", minute: "2-digit",
        }),
        joinUrl: nc.join_url ?? null,
        durationMinutes: nc.duration_minutes,
      }
    : null;

  // Today's classes
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const { data: todayRows } = await supabase
    .from("scheduled_classes")
    .select("id, title, subject, scheduled_at, duration_minutes, join_url, status, mentor:mentors(profile:profiles(full_name))")
    .eq("student_id", studentId)
    .gte("scheduled_at", todayStart.toISOString())
    .lte("scheduled_at", todayEnd.toISOString())
    .order("scheduled_at", { ascending: true });

  const todayClasses = (todayRows || []).map((c) => ({
    id: c.id,
    title: c.title,
    subject: c.subject,
    mentor: c.mentor?.profile?.full_name ?? "Mentor",
    scheduledAt: c.scheduled_at,
    timeLabel: new Date(c.scheduled_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
    joinUrl: c.join_url ?? null,
    durationMinutes: c.duration_minutes,
    status: c.status,
  }));

  // Pending assignments
  const { data: assignRows } = await supabase
    .from("assignments")
    .select("id, title, subject, due_date, status, score, feedback, created_by, mentor:mentors(profile:profiles(full_name))")
    .eq("student_id", studentId);

  const allAssign = assignRows || [];
  const now2 = new Date();
  const pendingAssignments = allAssign
    .filter((a) => a.status === "pending" || a.status === "overdue")
    .map((a) => {
      const due = a.due_date ? new Date(a.due_date) : null;
      const isOverdue = due && due < now2;
      return {
        id: a.id,
        title: a.title,
        subject: a.subject,
        status: isOverdue ? "Overdue" : "Pending",
        dueMeta: due
          ? isOverdue
            ? `was due ${due.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`
            : `due ${due.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`
          : "No due date",
        mentor: a.mentor?.profile?.full_name ?? "Mentor",
      };
    });

  const overdueCount = pendingAssignments.filter((a) => a.status === "Overdue").length;

  // Recent activity (last 5 attendance records)
  const recentActivity = allAtt.slice(0, 5).map((r) => ({
    type: "attendance",
    text: `${r.status === "present" ? "Attended" : "Missed"} class`,
    subject: r.subject,
    date: new Date(r.session_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
    status: r.status,
  }));

  return {
    attendanceRate,
    subjectAttendance,
    nextClass,
    todayClasses,
    pendingAssignments,
    overdueCount,
    recentActivity,
    totalClassesToday: todayClasses.length,
    pendingCount: pendingAssignments.length,
  };
}

export async function getStudentClasses() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const studentId = user.id;
  const now = new Date();
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);

  const { data: rows } = await supabase
    .from("scheduled_classes")
    .select("id, title, subject, scheduled_at, duration_minutes, status, join_url, recording_url, icon_name, mentor:mentors(id, profile:profiles(full_name))")
    .eq("student_id", studentId)
    .order("scheduled_at", { ascending: false });

  const classes = (rows || []).map((c) => {
    const scheduledAt = new Date(c.scheduled_at);
    const endAt = new Date(scheduledAt.getTime() + c.duration_minutes * 60000);
    const isNow = scheduledAt <= now && now <= endAt;
    const isPast = endAt < now;
    const isToday = scheduledAt >= todayStart && scheduledAt <= todayEnd;

    const mentorObj = Array.isArray(c.mentor) ? c.mentor[0] : c.mentor;
    const mentorProfile = mentorObj ? (Array.isArray(mentorObj.profile) ? mentorObj.profile[0] : mentorObj.profile) : null;

    return {
      id: c.id,
      title: c.title,
      subject: c.subject,
      mentor: mentorProfile?.full_name ?? "Mentor",
      scheduledAt: c.scheduled_at,
      dateLabel: scheduledAt.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }),
      timeLabel: `${scheduledAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })} – ${endAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`,
      durationMinutes: c.duration_minutes,
      status: isNow ? "live" : c.status,
      joinUrl: c.join_url ?? null,
      recordingUrl: c.recording_url ?? null,
      iconName: c.icon_name ?? null,
      isToday,
      isUpcoming: !isPast && !isNow && !isToday,
      isPast: isPast && !isNow,
      isLive: isNow,
    };
  });

  return {
    today: classes.filter((c) => c.isToday || c.isLive),
    upcoming: classes.filter((c) => c.isUpcoming),
    recorded: classes.filter((c) => c.isPast && c.recordingUrl),
    history: classes.filter((c) => c.isPast),
  };
}

export async function getStudentAssignments() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const studentId = user.id;
  const now = new Date();

  const { data: rows } = await supabase
    .from("assignments")
    .select("id, title, subject, due_date, status, score, feedback, created_at, mentor:mentors(id, profile:profiles(full_name))")
    .eq("student_id", studentId)
    .order("created_at", { ascending: false });

  return (rows || []).map((a) => {
    const due = a.due_date ? new Date(a.due_date) : null;
    const isOverdue = a.status === "pending" && due && due < now;
    const computedStatus = isOverdue ? "Overdue" : 
      a.status === "pending" ? "Pending" :
      a.status === "submitted" ? "Submitted" :
      a.status === "graded" ? "Graded" : "Pending";
    return {
      id: a.id,
      title: a.title,
      subject: a.subject,
      mentor: a.mentor?.profile?.full_name ?? "Mentor",
      dueDate: a.due_date,
      dueMeta: due
        ? isOverdue
          ? `was due ${due.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`
          : `due ${due.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`
        : "No due date",
      status: computedStatus,
      score: a.score ?? null,
      feedback: a.feedback ?? null,
    };
  });
}

export async function submitAssignment(assignmentId: string, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: assignment, error: fetchErr } = await supabase
    .from("assignments")
    .select("id, student_id, status")
    .eq("id", assignmentId)
    .single();

  if (fetchErr || !assignment) throw new Error("Assignment not found.");
  if (assignment.student_id !== user.id) throw new Error("You can only submit your own assignments.");
  if (assignment.status === "graded") throw new Error("This assignment has already been graded.");

  const file = formData.get("file") as File | null;
  if (!file) throw new Error("Please attach a file before submitting.");

  const adminClient = createAdminClient();
  const bucketName = "assignment-submissions";
  const { data: buckets } = await adminClient.storage.listBuckets();
  if (!buckets?.some((b) => b.name === bucketName)) {
    await adminClient.storage.createBucket(bucketName, { public: true, fileSizeLimit: 10485760 });
  }

  const fileExt = file.name.split(".").pop();
  const fileName = `${assignmentId}-${Date.now()}.${fileExt}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadErr } = await adminClient.storage
    .from(bucketName)
    .upload(fileName, buffer, { contentType: file.type, duplex: "half" });
  if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`);

  const { data: { publicUrl } } = adminClient.storage.from(bucketName).getPublicUrl(fileName);

  const { error: updateErr } = await adminClient
    .from("assignments")
    .update({
      status: "submitted",
      submission_url: publicUrl,
      submitted_at: new Date().toISOString(),
    })
    .eq("id", assignmentId);

  if (updateErr) throw new Error(updateErr.message);

  revalidatePath("/lms/assignments");
  return { success: true };
}

export async function getStudentPerformance() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const studentId = user.id;

  // Attendance
  const { data: attRows } = await supabase
    .from("attendance_records")
    .select("status, session_date, subject")
    .eq("student_id", studentId)
    .order("session_date", { ascending: false });

  const allAtt = attRows || [];
  const totalAtt = allAtt.length;
  const presentAtt = allAtt.filter((r) => r.status === "present").length;
  const attendanceRate = totalAtt > 0 ? Math.round((presentAtt / totalAtt) * 100) : null;

  // Subject attendance
  const subjMap: Record<string, { present: number; total: number }> = {};
  for (const r of allAtt) {
    if (!subjMap[r.subject]) subjMap[r.subject] = { present: 0, total: 0 };
    subjMap[r.subject].total++;
    if (r.status === "present") subjMap[r.subject].present++;
  }
  const subjectAttendance = Object.entries(subjMap).map(([name, v]) => ({
    name,
    pct: Math.round((v.present / v.total) * 100),
  }));

  // Assignments / scores
  const { data: assignRows } = await supabase
    .from("assignments")
    .select("id, title, subject, due_date, status, score, feedback, created_at, mentor:mentors(id, profile:profiles(full_name))")
    .eq("student_id", studentId)
    .order("created_at", { ascending: false });

  const allAssign = assignRows || [];
  const gradedAssign = allAssign.filter((a) => a.status === "graded" && a.score !== null);
  const submittedCount = allAssign.filter((a) => a.status === "graded" || a.status === "submitted").length;
  const avgScore = gradedAssign.length > 0
    ? Math.round(gradedAssign.reduce((sum, a) => sum + Number(a.score), 0) / gradedAssign.length)
    : null;

  // Best subject by avg score
  const subjectScores: Record<string, number[]> = {};
  for (const a of gradedAssign) {
    if (!subjectScores[a.subject]) subjectScores[a.subject] = [];
    subjectScores[a.subject].push(Number(a.score));
  }
  let bestSubject: string | null = null;
  let bestAvg = 0;
  for (const [subj, scores] of Object.entries(subjectScores)) {
    const avg = scores.reduce((s, n) => s + n, 0) / scores.length;
    if (avg > bestAvg) { bestAvg = avg; bestSubject = subj; }
  }

  // Recent scores
  const recentScores = gradedAssign.slice(0, 6).map((a) => ({
    id: a.id,
    title: a.title,
    subject: a.subject,
    date: new Date(a.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
    score: Number(a.score),
  }));

  // Mentor feedback from graded assignments
  const mentorFeedback = allAssign
    .filter((a) => a.feedback && a.mentor?.profile?.full_name)
    .slice(0, 4)
    .map((a) => {
      const mentorName = a.mentor?.profile?.full_name || "";
      return {
        mentor: mentorName,
        initials: mentorName.split(" ").map((w: string) => w[0]).join("").substring(0, 2).toUpperCase(),
        date: new Date(a.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
        feedback: a.feedback,
      };
    });

  return {
    attendanceRate,
    subjectAttendance,
    avgScore,
    submittedCount,
    totalAssignments: allAssign.length,
    bestSubject,
    bestSubjectAvg: bestSubject ? Math.round(bestAvg) : null,
    recentScores,
    mentorFeedback,
  };
}

export async function getStudentMentors() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const studentId = user.id;

  const { data: bookings } = await supabase
    .from("bookings")
    .select(`
      session_id, course_id, status,
      session:sessions(title, subject, mentor:mentors!sessions_mentor_id_fkey(id, profile:profiles(full_name))),
      course:courses(title, subject, mentor:mentors(id, profile:profiles(full_name)))
    `)
    .eq("student_id", studentId)
    .eq("status", "confirmed");

  const mentorMap: Record<string, { id: string; name: string; subject: string; initials: string }> = {};
  for (const b of (bookings || [])) {
    const target = b.session_id ? b.session : b.course;
    if (!target?.mentor) continue;
    const mentorId = target.mentor.id;
    const mentorName = target.mentor.profile?.full_name ?? "Mentor";
    if (!mentorMap[mentorId]) {
      mentorMap[mentorId] = {
        id: mentorId,
        name: mentorName,
        subject: target.subject ?? "Tutoring",
        initials: mentorName.split(" ").map((w: string) => w[0]).join("").substring(0, 2).toUpperCase(),
      };
    }
  }
  return Object.values(mentorMap);
}

// ----------------------------------------------------
// MENTOR DASHBOARD ACTIONS
// ----------------------------------------------------

export async function getMentorOverviewStats() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const todayStart = new Date();
  todayStart.setHours(0,0,0,0);
  const todayEnd = new Date();
  todayEnd.setHours(23,59,59,999);

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  // Run queries in parallel
  const [
    todayClassesRes,
    upcomingClassesRes,
    pendingAssignmentsRes,
    participationsRes,
    bookingsRes
  ] = await Promise.all([
    supabase
      .from("scheduled_classes")
      .select("id")
      .eq("mentor_id", user.id)
      .eq("status", "scheduled")
      .gte("scheduled_at", todayStart.toISOString())
      .lte("scheduled_at", todayEnd.toISOString()),
      
    supabase
      .from("scheduled_classes")
      .select("id")
      .eq("mentor_id", user.id)
      .eq("status", "scheduled")
      .gt("scheduled_at", new Date().toISOString()),
      
    supabase
      .from("assignments")
      .select("id")
      .eq("created_by", user.id)
      .eq("status", "submitted"),
      
    supabase
      .from("chat_participants")
      .select("chat_room_id")
      .eq("user_id", user.id),
      
    supabase
      .from("bookings")
      .select("amount_paid")
      .eq("payment_status", "paid")
      .eq("mentor_id", user.id)
      .gte("created_at", startOfMonth.toISOString())
  ]);

  const todayClasses = todayClassesRes.data;
  const upcomingClasses = upcomingClassesRes.data;
  const pendingAssignments = pendingAssignmentsRes.data;
  const participations = participationsRes.data;
  const bookings = bookingsRes.data;

  // Unread messages
  const roomIds = (participations || []).map(p => p.chat_room_id);
  let unreadCount = 0;
  if (roomIds.length > 0) {
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .in("chat_room_id", roomIds)
      .neq("sender_id", user.id)
      .gte("created_at", last24h);
    unreadCount = count || 0;
  }

  // Earnings this month
  const earningsThisMonth = (bookings || []).reduce((acc: number, b) => acc + Number(b.amount_paid), 0);

  return {
    todayClassesCount: todayClasses?.length || 0,
    upcomingClassesCount: upcomingClasses?.length || 0,
    pendingAssignmentsCount: pendingAssignments?.length || 0,
    unreadMessagesCount: unreadCount,
    earningsThisMonth,
  };
}

export async function getMentorClasses() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: classes, error } = await supabase
    .from("scheduled_classes")
    .select(`
      *,
      student:students(
        id,
        profile:profiles(full_name, avatar_url, email)
      )
    `)
    .eq("mentor_id", user.id)
    .order("scheduled_at", { ascending: true });

  if (error) throw new Error(error.message);
  return (classes || []).map((c) => ({
    ...c,
    studentName: c.student?.profile?.full_name || "Unknown Student",
    studentEmail: c.student?.profile?.email || "",
    studentAvatar: c.student?.profile?.avatar_url || "",
  }));
}

export async function createScheduledClass(data: {
  bookingId: string;
  studentId: string;
  title: string;
  subject: string;
  scheduledAt: string;
  durationMinutes: number;
  joinUrl?: string;
  iconName?: string;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: newClass, error } = await supabase
    .from("scheduled_classes")
    .insert([
      {
        booking_id: data.bookingId,
        student_id: data.studentId,
        mentor_id: user.id,
        title: data.title,
        subject: data.subject,
        scheduled_at: data.scheduledAt,
        duration_minutes: data.durationMinutes,
        join_url: data.joinUrl || null,
        icon_name: data.iconName || "video",
        status: "scheduled",
      }
    ])
    .select()
    .single();

  if (error) throw new Error(error.message);
  revalidatePath("/mentor/classes");
  revalidatePath("/mentor/overview");
  return newClass;
}

export async function updateScheduledClass(
  classId: string,
  updates: {
    title?: string;
    subject?: string;
    scheduledAt?: string;
    durationMinutes?: number;
    joinUrl?: string;
    status?: string;
  }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const dbUpdates: TablesUpdate<"scheduled_classes"> = {};
  if (updates.title !== undefined) dbUpdates.title = updates.title;
  if (updates.subject !== undefined) dbUpdates.subject = updates.subject;
  if (updates.scheduledAt !== undefined) dbUpdates.scheduled_at = updates.scheduledAt;
  if (updates.durationMinutes !== undefined) dbUpdates.duration_minutes = updates.durationMinutes;
  if (updates.joinUrl !== undefined) dbUpdates.join_url = updates.joinUrl;
  if (updates.status !== undefined) dbUpdates.status = updates.status;

  const { data, error } = await supabase
    .from("scheduled_classes")
    .update(dbUpdates)
    .eq("id", classId)
    .eq("mentor_id", user.id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  revalidatePath("/mentor/classes");
  revalidatePath("/mentor/overview");

  if (updates.status === "cancelled") {
    await notifyStudentAndParent(data.student_id, {
      type: "class_cancelled",
      title: "Class cancelled",
      message: `"${data.title}" has been cancelled by your mentor`,
      studentLinkUrl: "/lms/classes",
      parentLinkUrl: "/dashboard/classes",
      preferenceKey: "class_reminders",
    });
  } else if (updates.scheduledAt !== undefined) {
    await notifyStudentAndParent(data.student_id, {
      type: "class_rescheduled",
      title: "Class rescheduled",
      message: `"${data.title}" has been rescheduled to ${new Date(updates.scheduledAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}`,
      studentLinkUrl: "/lms/classes",
      parentLinkUrl: "/dashboard/classes",
      preferenceKey: "class_reminders",
    });
  }

  return data;
}

export async function cancelScheduledClass(classId: string) {
  return updateScheduledClass(classId, { status: "cancelled" });
}

export async function getMentorStudents() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  // Fetch bookings actually assigned to this mentor (a session can have
  // several eligible mentors, so this must be the booking's own mentor_id,
  // not just any booking against a session/course this mentor is listed on)
  const { data: bookings, error } = await supabase
    .from("bookings")
    .select(`
      id,
      status,
      payment_status,
      created_at,
      student_id,
      student:students(
        grade_level,
        school_name,
        profile:profiles(full_name, email, avatar_url),
        parent:parents(phone, profile:profiles(full_name, email))
      ),
      session:sessions(title, subject),
      course:courses(title, subject)
    `)
    .eq("mentor_id", user.id);

  if (error) throw new Error(error.message);

  interface MentorStudentEntry {
    id: string;
    bookingId: string;
    name: string;
    email: string;
    avatarUrl: string;
    grade: string;
    school: string;
    parentName: string;
    parentPhone: string;
    subject: string;
    enrolledAt: string;
    totalClasses: number;
    attendedClasses: number;
  }

  const studentsMap: Record<string, MentorStudentEntry> = {};
  for (const b of (bookings || [])) {
    const studentId = b.student_id;
    const studentInfo = b.student;
    if (!studentInfo) continue;

    if (!studentsMap[studentId]) {
      studentsMap[studentId] = {
        id: studentId,
        bookingId: b.id,
        name: studentInfo.profile?.full_name || "Student",
        email: studentInfo.profile?.email || "",
        avatarUrl: studentInfo.profile?.avatar_url || "",
        grade: studentInfo.grade_level || "Class 10",
        school: studentInfo.school_name || "High School",
        parentName: studentInfo.parent?.profile?.full_name || "Parent",
        parentPhone: studentInfo.parent?.phone || "N/A",
        subject: b.session?.subject || b.course?.subject || "General",
        enrolledAt: new Date(b.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }),
        totalClasses: 0,
        attendedClasses: 0,
      };
    }
  }

  // Count attendance/classes for each student, scoped to THIS mentor's own
  // classes only — a student attendance rate shouldn't include classes taken
  // with other mentors.
  const studentIds = Object.keys(studentsMap);
  if (studentIds.length > 0) {
    const { data: classes } = await supabase
      .from("scheduled_classes")
      .select("id, student_id")
      .eq("mentor_id", user.id)
      .in("student_id", studentIds);

    for (const cl of (classes || [])) {
      if (studentsMap[cl.student_id]) {
        studentsMap[cl.student_id].totalClasses++;
      }
    }

    const mentorClassIds = (classes || []).map((cl) => cl.id);
    if (mentorClassIds.length > 0) {
      const { data: attendance } = await supabase
        .from("attendance_records")
        .select("student_id, status")
        .in("scheduled_class_id", mentorClassIds);

      for (const att of (attendance || [])) {
        if (studentsMap[att.student_id] && att.status === "present") {
          studentsMap[att.student_id].attendedClasses++;
        }
      }
    }
  }

  return Object.values(studentsMap);
}

export async function getMentorAssignments() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: assignments, error } = await supabase
    .from("assignments")
    .select(`
      *,
      student:students(
        id,
        profile:profiles(full_name, email, avatar_url)
      )
    `)
    .eq("created_by", user.id)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (assignments || []).map((a) => ({
    ...a,
    studentName: a.student?.profile?.full_name || "Student",
    studentAvatar: a.student?.profile?.avatar_url || "",
  }));
}

export async function createAssignment(data: {
  studentId: string;
  bookingId: string;
  title: string;
  subject: string;
  dueDate: string;
  description?: string;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: newAssign, error } = await supabase
    .from("assignments")
    .insert([
      {
        student_id: data.studentId,
        booking_id: data.bookingId,
        title: data.title,
        subject: data.subject,
        due_date: data.dueDate,
        feedback: data.description || null,
        created_by: user.id,
        status: "pending",
      }
    ])
    .select()
    .single();

  if (error) throw new Error(error.message);
  revalidatePath("/mentor/assignments");

  await notifyStudentAndParent(data.studentId, {
    type: "new_assignment",
    title: "New assignment",
    message: `A new assignment "${data.title}" was posted, due ${data.dueDate}`,
    studentLinkUrl: "/lms/assignments",
    parentLinkUrl: "/dashboard/assignments",
    preferenceKey: "assignment_updates",
  });

  return newAssign;
}

export async function reviewAssignmentSubmission(assignmentId: string, score: number, feedback: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data, error } = await supabase
    .from("assignments")
    .update({
      score,
      feedback,
      status: "reviewed",
    })
    .eq("id", assignmentId)
    .eq("created_by", user.id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  revalidatePath("/mentor/assignments");
  revalidatePath("/mentor/overview");

  await notifyStudentAndParent(data.student_id, {
    type: "assignment_graded",
    title: "Assignment graded",
    message: `"${data.title}" was graded: ${score}/100`,
    studentLinkUrl: "/lms/assignments",
    parentLinkUrl: "/dashboard/assignments",
    preferenceKey: "assignment_updates",
  });

  return data;
}

export async function getMentorResources() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: resources, error } = await supabase
    .from("resources")
    .select(`
      *,
      student:students(
        profile:profiles(full_name)
      ),
      course:courses(title)
    `)
    .eq("mentor_id", user.id)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (resources || []).map((r) => ({
    ...r,
    studentName: r.student?.profile?.full_name || "All Students",
    courseName: r.course?.title || null,
  }));
}

export async function getMentorCourseOptions() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: courses, error } = await supabase
    .from("courses")
    .select("id, title, subject")
    .eq("mentor_id", user.id)
    .order("title", { ascending: true });

  if (error) throw new Error(error.message);
  return courses || [];
}

export async function uploadResourceFile(formData: FormData) {
  const file = formData.get("file") as File;
  if (!file) throw new Error("No file provided");

  const supabase = createAdminClient();

  // Ensure bucket exists
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) {
    console.error("Storage list error:", listError);
  }

  const bucketName = "resource-files";
  const bucketExists = buckets?.some(b => b.name === bucketName);

  if (!bucketExists) {
    const { error: createError } = await supabase.storage.createBucket(bucketName, {
      public: true,
      fileSizeLimit: 26214400, // 25MB
    });
    if (createError) {
      console.warn("Storage bucket creation error or warning:", createError);
    }
  }

  // Upload file
  const fileExt = file.name.split(".").pop();
  const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}.${fileExt}`;

  const buffer = Buffer.from(await file.arrayBuffer());

  const { error } = await supabase.storage
    .from(bucketName)
    .upload(fileName, buffer, {
      contentType: file.type,
      duplex: "half",
    });

  if (error) {
    throw new Error(`Upload failed: ${error.message}`);
  }

  // Get public URL
  const { data: { publicUrl } } = supabase.storage.from(bucketName).getPublicUrl(fileName);
  return { publicUrl };
}

export async function createResource(data: {
  name: string;
  type: "pdf" | "video" | "link" | "document";
  subject: string;
  url: string;
  size?: string;
  studentId?: string;
  courseId?: string;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: resource, error } = await supabase
    .from("resources")
    .insert([
      {
        mentor_id: user.id,
        student_id: data.studentId || null,
        course_id: data.courseId || null,
        name: data.name,
        type: data.type,
        subject: data.subject,
        url: data.url,
        size: data.size || null,
      }
    ])
    .select()
    .single();

  if (error) throw new Error(error.message);
  revalidatePath("/mentor/resources");

  if (data.studentId) {
    await notifyStudentAndParent(data.studentId, {
      type: "new_resource",
      title: "New resource shared",
      message: `A new ${data.type} "${data.name}" was shared with you`,
      studentLinkUrl: "/lms/resources",
      parentLinkUrl: "/dashboard/overview",
      preferenceKey: "assignment_updates",
    });
  }

  return resource;
}

export async function deleteResource(resourceId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { error } = await supabase
    .from("resources")
    .delete()
    .eq("id", resourceId)
    .eq("mentor_id", user.id);

  if (error) throw new Error(error.message);
  revalidatePath("/mentor/resources");
  return { success: true };
}

export async function saveAttendanceRecord(data: {
  studentId: string;
  scheduledClassId: string;
  bookingId?: string;
  sessionDate: string;
  subject: string;
  status: "present" | "absent" | "excused";
  notes?: string;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  // Check if attendance already exists for this scheduled class
  const { data: existing } = await supabase
    .from("attendance_records")
    .select("id")
    .eq("scheduled_class_id", data.scheduledClassId)
    .eq("student_id", data.studentId)
    .limit(1)
    .single();

  let result;
  if (existing) {
    const { data: updated, error } = await supabase
      .from("attendance_records")
      .update({
        status: data.status,
        notes: data.notes || null,
      })
      .eq("id", existing.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    result = updated;
  } else {
    const { data: inserted, error } = await supabase
      .from("attendance_records")
      .insert([
        {
          student_id: data.studentId,
          scheduled_class_id: data.scheduledClassId,
          booking_id: data.bookingId || null,
          session_date: data.sessionDate,
          subject: data.subject,
          status: data.status,
          notes: data.notes || null,
        }
      ])
      .select()
      .single();
    if (error) throw new Error(error.message);
    result = inserted;
  }

  // Mark the scheduled class as completed as well
  await supabase
    .from("scheduled_classes")
    .update({ status: "completed" })
    .eq("id", data.scheduledClassId);

  revalidatePath("/mentor/attendance");
  revalidatePath("/mentor/classes");
  return result;
}

export async function getMentorEarnings() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  // Fetch all paid bookings actually assigned to this mentor
  const { data: bookings, error } = await supabase
    .from("bookings")
    .select(`
      id,
      status,
      payment_status,
      amount_paid,
      created_at,
      session_id,
      course_id,
      student:students(
        profile:profiles(full_name)
      ),
      session:sessions(title, subject, price),
      course:courses(title, subject, price)
    `)
    .eq("payment_status", "paid")
    .eq("mentor_id", user.id);

  if (error) throw new Error(error.message);

  const mentorBookings = bookings || [];

  const totalEarnings = mentorBookings.reduce((acc, b) => acc + Number(b.amount_paid), 0);

  const now = new Date();
  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();

  const thisMonthEarnings = mentorBookings
    .filter((b) => {
      const d = new Date(b.created_at);
      return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
    })
    .reduce((acc, b) => acc + Number(b.amount_paid), 0);

  // Group by month for chart
  const monthlyData: Record<string, number> = {};
  for (const b of mentorBookings) {
    const d = new Date(b.created_at);
    const monthKey = d.toLocaleString("en-IN", { month: "short", year: "2-digit" });
    monthlyData[monthKey] = (monthlyData[monthKey] || 0) + Number(b.amount_paid);
  }

  const chartData = Object.entries(monthlyData).map(([name, amount]) => ({
    name,
    amount,
  })).reverse(); // Order from oldest to newest

  const transactions = mentorBookings.map((b) => ({
    id: b.id,
    studentName: b.student?.profile?.full_name || "Student",
    title: b.session?.title || b.course?.title || "Booking",
    subject: b.session?.subject || b.course?.subject || "General",
    type: b.session_id ? "1-on-1 Session" : "Course Batch",
    amount: Number(b.amount_paid),
    date: new Date(b.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }),
  }));

  return {
    totalEarnings,
    thisMonthEarnings,
    chartData,
    transactions,
  };
}

export async function getMentorProfile() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, avatar_url")
    .eq("id", user.id)
    .single();

  const { data: mentor } = await supabase
    .from("mentors")
    .select("qualification, expertise, bio, hourly_rate")
    .eq("id", user.id)
    .single();

  return {
    id: profile?.id ?? user.id,
    name: profile?.full_name ?? "Mentor",
    email: profile?.email ?? user.email ?? "",
    role: profile?.role ?? "mentor",
    avatarUrl: profile?.avatar_url ?? "",
    avatarText: (profile?.full_name ?? "M")
      .split(" ")
      .map((w: string) => w[0])
      .join("")
      .substring(0, 2)
      .toUpperCase(),
    qualification: mentor?.qualification ?? "Educator",
    expertise: mentor?.expertise ?? [],
    bio: mentor?.bio ?? "",
    hourlyRate: Number(mentor?.hourly_rate ?? 0),
  };
}

export async function checkMentorInvitation(email: string) {
  const emailCheck = validateEmail(email);
  if (!emailCheck.valid) {
    return { success: false, error: emailCheck.error };
  }

  try {
    const adminClient = createAdminClient();
    const { data: invite, error: inviteErr } = await adminClient
      .from("mentor_invitations")
      .select("id, status")
      .eq("email", email.trim().toLowerCase())
      .eq("status", "pending")
      .maybeSingle();

    if (inviteErr) {
      return { success: false, error: "Failed to verify invitation status" };
    }

    if (!invite) {
      return { success: false, error: "No pending invitation found for this email address. Tutors must be pre-registered by the administrator." };
    }

    return { success: true };
  } catch (err) {
    console.error("checkMentorInvitation error:", err);
    return { success: false, error: "An unexpected error occurred. Please try again." };
  }
}

export async function checkAdminInvitation(email: string) {
  const emailCheck = validateEmail(email);
  if (!emailCheck.valid) {
    return { success: false, error: emailCheck.error };
  }

  try {
    const adminClient = createAdminClient();
    const { data: invite, error: inviteErr } = await adminClient
      .from("admin_invitations")
      .select("id, status")
      .eq("email", email.trim().toLowerCase())
      .eq("status", "pending")
      .maybeSingle();

    if (inviteErr) {
      return { success: false, error: "Failed to verify invitation status" };
    }

    if (!invite) {
      return { success: false, error: "No pending invitation found for this email address. Admin accounts can only be created by invitation." };
    }

    return { success: true };
  } catch (err) {
    console.error("checkAdminInvitation error:", err);
    return { success: false, error: "An unexpected error occurred. Please try again." };
  }
}

// Shared core: resolves a course/session/mentor target and creates the
// booking + its scheduled_classes rows (always as pending/pending_confirmation
// — callers that need it confirmed immediately, e.g. admin manual bookings,
// call finalizeBookingConfirmation right after). Always runs on the admin
// client since admin-initiated bookings have no "owning" caller session that
// would satisfy the bookings-table RLS insert policies.
async function createBookingRecord(params: {
  targetId: string;
  targetType: "course" | "session";
  studentId: string;
  parentId: string | null;
  durationMinutes?: number;
  selectedSlot?: { day: string; time: string };
  selectedDate?: string;
  subject?: string;
  topicDetails?: string;
  attachmentUrl?: string;
  notifyAdminsOnCreate?: boolean;
  selectedMentorId?: string;
}): Promise<{ bookingId: string }> {
  const adminClient = createAdminClient();
  const { targetId, targetType, studentId, parentId } = params;

  let amountPaid = 0;
  let title = "";
  let subject = "";
  let mentorId: string | null = null;
  let iconName = "book";
  let isLiveIndividual = false;
  let sessionId: string | null = null;
  let courseId: string | null = null;

  if (targetType === "course") {
    const { data: course, error: fetchErr } = await adminClient
      .from("courses")
      .select("title, subject, price, mentor_id, format")
      .eq("id", targetId)
      .single();
    if (fetchErr || !course) throw new Error("Course not found.");
    amountPaid = Number(course.price);
    title = course.title;
    subject = course.subject;
    mentorId = course.mentor_id;
    iconName = course.subject === "Programming" ? "code" : course.subject === "Mathematics" ? "math" : course.subject === "Science" ? "flask" : "book";
    isLiveIndividual = course.format === "Live individual";
    courseId = targetId;
  } else if (targetType === "session") {
    const { data: session, error: fetchErr } = await adminClient
      .from("sessions")
      .select("title, subject, price, mentor_id, type, icon_name")
      .eq("id", targetId)
      .single();
    if (fetchErr || !session) throw new Error("Session not found.");

    const basePrice = Number(session.price);
    if (params.durationMinutes === 90) {
      amountPaid = Math.round(basePrice * 1.5);
    } else {
      amountPaid = basePrice;
    }
    title = session.title;
    subject = session.subject;
    mentorId = session.mentor_id;
    iconName = session.icon_name || "book";
    isLiveIndividual = session.type === "1-on-1";
    sessionId = targetId;

    // If this session has more than one eligible mentor, the student must
    // pick one — and it must actually be assigned to this session.
    if (params.selectedMentorId) {
      const { data: eligible } = await adminClient
        .from("session_mentors")
        .select("mentor_id")
        .eq("session_id", targetId)
        .eq("mentor_id", params.selectedMentorId)
        .maybeSingle();
      if (!eligible) throw new Error("The selected tutor isn't available for this session.");
      mentorId = params.selectedMentorId;
    }
  }

  const bookingData: TablesInsert<"bookings"> = {
    parent_id: parentId,
    student_id: studentId,
    status: "pending",
    payment_status: "unpaid",
    amount_paid: amountPaid,
    mentor_id: mentorId,
  };

  if (courseId) {
    bookingData.course_id = courseId;
  } else if (sessionId) {
    bookingData.session_id = sessionId;
  }

  const { data: newBooking, error: bookingErr } = await adminClient
    .from("bookings")
    .insert([bookingData])
    .select("id")
    .single();

  if (bookingErr) {
    if (bookingErr.code === "23505") {
      throw new Error("This student already has a booking for this target.");
    }
    throw new Error(bookingErr.message);
  }

  if (isLiveIndividual && params.selectedSlot) {
    let scheduledAtStr = "";

    {
      const daysOfWeek: Record<string, number> = {
        Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6
      };
      const targetDay = daysOfWeek[params.selectedSlot.day] ?? 1;

      const timeMatch = params.selectedSlot.time.match(/^(\d+)\s*(AM|PM)$/i);
      let hours = 9;
      if (timeMatch) {
        let rawHours = parseInt(timeMatch[1], 10);
        const meridiem = timeMatch[2].toUpperCase();
        if (meridiem === "PM" && rawHours < 12) rawHours += 12;
        if (meridiem === "AM" && rawHours === 12) rawHours = 0;
        hours = rawHours;
      }

      const scheduledAt = new Date();
      const currentDay = scheduledAt.getDay();
      let daysToAdd = targetDay - currentDay;
      if (daysToAdd <= 0) daysToAdd += 7;

      scheduledAt.setDate(scheduledAt.getDate() + daysToAdd);
      scheduledAt.setHours(hours, 0, 0, 0);
      scheduledAtStr = scheduledAt.toISOString();
    }

    const duration = params.durationMinutes || 60;
    const classData = {
      booking_id: newBooking.id,
      student_id: studentId,
      mentor_id: mentorId,
      title: title,
      subject: subject,
      scheduled_at: scheduledAtStr,
      duration_minutes: duration,
      status: "pending_confirmation",
      join_url: null,
      icon_name: iconName,
      topic_details: params.topicDetails || null,
      attachment_url: params.attachmentUrl || null,
    };

    const { error: classErr } = await adminClient
      .from("scheduled_classes")
      .insert([classData])
      .select("id")
      .single();

    if (classErr) {
      throw new Error("Booking created but failed to schedule class: " + classErr.message);
    }

    // Mentor is contacted manually by the admin team once the booking is
    // reviewed — no in-app notification is fired until the admin confirms it
    // (see finalizeBookingConfirmation).
  } else if (targetType === "session" && !isLiveIndividual) {
    // Schedule class for Group Session as per configured date/time in admin panel
    const { data: sessionData } = await adminClient
      .from("sessions")
      .select("session_date, session_time, is_repeatable")
      .eq("id", targetId)
      .single();

    const targetDateStr = sessionData?.is_repeatable ? params.selectedDate : sessionData?.session_date;

    if (sessionData && targetDateStr && sessionData.session_time) {
      const date = new Date(targetDateStr);

      // Parse timing like "05:00 PM"
      const timeMatch = sessionData.session_time.match(/^(\d+):?(\d*)\s*(AM|PM)$/i);
      let hours = 9;
      let minutes = 0;
      if (timeMatch) {
        let rawHours = parseInt(timeMatch[1], 10);
        if (timeMatch[2]) {
          minutes = parseInt(timeMatch[2], 10);
        }
        const meridiem = timeMatch[3].toUpperCase();
        if (meridiem === "PM" && rawHours < 12) rawHours += 12;
        if (meridiem === "AM" && rawHours === 12) rawHours = 0;
        hours = rawHours;
      }
      date.setHours(hours, minutes, 0, 0);

      const classData = {
        booking_id: newBooking.id,
        student_id: studentId,
        mentor_id: mentorId,
        title: title,
        subject: subject,
        scheduled_at: date.toISOString(),
        duration_minutes: params.durationMinutes || 60,
        status: "pending_confirmation",
        join_url: null,
        icon_name: iconName,
        topic_details: params.topicDetails || null,
        attachment_url: params.attachmentUrl || null,
      };

      const { error: classErr } = await adminClient
        .from("scheduled_classes")
        .insert([classData])
        .select("id")
        .single();

      if (classErr) {
        throw new Error("Booking created but failed to schedule group session class: " + classErr.message);
      }
    }
  } else if (targetType === "course" && !isLiveIndividual) {
    // Schedule recurring classes for Live batch courses spanning start to end date
    const { data: courseData } = await adminClient
      .from("courses")
      .select("batch_start_date, batch_end_date, class_days, class_timing, format")
      .eq("id", targetId)
      .single();

    if (courseData && courseData.format === "Live batch" && courseData.batch_start_date && courseData.batch_end_date && courseData.class_days && courseData.class_timing) {
      const startDate = new Date(courseData.batch_start_date);
      const endDate = new Date(courseData.batch_end_date);

      // Parse timing like "05:00 PM"
      const timeMatch = courseData.class_timing.match(/^(\d+):?(\d*)\s*(AM|PM)$/i);
      let hours = 9;
      let minutes = 0;
      if (timeMatch) {
        let rawHours = parseInt(timeMatch[1], 10);
        if (timeMatch[2]) {
          minutes = parseInt(timeMatch[2], 10);
        }
        const meridiem = timeMatch[3].toUpperCase();
        if (meridiem === "PM" && rawHours < 12) rawHours += 12;
        if (meridiem === "AM" && rawHours === 12) rawHours = 0;
        hours = rawHours;
      }

      // Map day names to number indices
      const dayMap: Record<string, number> = {
        sunday: 0, sun: 0,
        monday: 1, mon: 1,
        tuesday: 2, tue: 2,
        wednesday: 3, wed: 3,
        thursday: 4, thu: 4,
        friday: 5, fri: 5,
        saturday: 6, sat: 6
      };

      const targetDays = courseData.class_days
        .split(",")
        .map((d: string) => d.trim().toLowerCase())
        .map((d: string) => dayMap[d])
        .filter((d): d is number => d !== undefined);

      const classesToInsert: TablesInsert<"scheduled_classes">[] = [];
      const loopDate = new Date(startDate);

      while (loopDate <= endDate) {
        if (targetDays.includes(loopDate.getDay())) {
          const classDate = new Date(loopDate);
          classDate.setHours(hours, minutes, 0, 0);

          classesToInsert.push({
            booking_id: newBooking.id,
            student_id: studentId,
            mentor_id: mentorId,
            title: `${title} - Session ${classesToInsert.length + 1}`,
            subject: subject,
            scheduled_at: classDate.toISOString(),
            duration_minutes: 60,
            status: "pending_confirmation",
            join_url: null,
            icon_name: iconName,
          });
        }
        loopDate.setDate(loopDate.getDate() + 1);
      }

      if (classesToInsert.length > 0) {
        const { error: classErr } = await adminClient
          .from("scheduled_classes")
          .insert(classesToInsert);

        if (classErr) {
          throw new Error("Booking created but failed to schedule batch course classes: " + classErr.message);
        }
      }
    }
  }

  if (params.notifyAdminsOnCreate) {
    const { data: studentProfile } = await adminClient
      .from("profiles")
      .select("full_name")
      .eq("id", studentId)
      .single();
    await notifyAdmins({
      type: "new_booking_request",
      title: "New booking placed",
      message: `${studentProfile?.full_name || "A student"} placed a booking for "${title}" — awaiting review.`,
      linkUrl: "/admin/bookings",
    });
  }

  return { bookingId: newBooking.id };
}

export async function bookCourseOrSessionAction(data: {
  targetId: string;
  targetType: "course" | "session";
  studentId: string;
  durationMinutes?: number;
  selectedSlot?: { day: string; time: string };
  selectedDate?: string;
  subject?: string;
  topicDetails?: string;
  attachmentUrl?: string;
  selectedMentorId?: string;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized: Please sign in.");

  // Resolve user role
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  let parentId: string | null;
  let studentId: string = data.studentId;

  if (profile?.role === "parent") {
    parentId = user.id;
    // Verify student belongs to this parent
    const { data: student } = await supabase
      .from("students")
      .select("parent_id")
      .eq("id", studentId)
      .single();
    if (!student || student.parent_id !== parentId) {
      throw new Error("Invalid student selection.");
    }
  } else if (profile?.role === "student") {
    // Resolve parent
    const { data: student } = await supabase
      .from("students")
      .select("parent_id")
      .eq("id", user.id)
      .single();
    if (!student) throw new Error("Student profile not found.");
    parentId = student.parent_id;
    studentId = user.id;
  } else {
    throw new Error("Only parents and students can make bookings.");
  }

  await createBookingRecord({
    targetId: data.targetId,
    targetType: data.targetType,
    studentId,
    parentId,
    durationMinutes: data.durationMinutes,
    selectedSlot: data.selectedSlot,
    selectedDate: data.selectedDate,
    subject: data.subject,
    topicDetails: data.topicDetails,
    attachmentUrl: data.attachmentUrl,
    selectedMentorId: data.selectedMentorId,
    notifyAdminsOnCreate: true,
  });

  revalidatePath("/bookings");
  revalidatePath("/dashboard/overview");
  revalidatePath("/lms/overview");
  revalidatePath("/mentor/classes");
  return { success: true };
}

export type MentorAvailability = Record<string, { start: string; end: string }[]>;

export async function getMentorAvailability(): Promise<MentorAvailability> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data, error } = await supabase
    .from("mentors")
    .select("availability")
    .eq("id", user.id)
    .single();

  if (error) {
    if (error.message.includes("column") || error.message.includes("does not exist")) {
      return {};
    }
    throw new Error(error.message);
  }
  return (data?.availability as MentorAvailability | null) || {};
}

export async function updateMentorAvailability(availability: MentorAvailability) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const adminClient = createAdminClient();
  const { error } = await adminClient
    .from("mentors")
    .update({ availability })
    .eq("id", user.id);

  if (error) throw new Error(error.message);

  revalidatePath("/mentor/availability");
  revalidatePath("/mentor/overview");
  return { success: true };
}

export type ScheduleConflict = {
  type: "course" | "session";
  id: string;
  name: string;
  days: string | null;
  date: string | null;
  time: string | null;
};

type NormalizedSchedule = {
  type: "course" | "session";
  id: string;
  name: string;
  days: string[] | null;
  date: string | null;
  startMin: number;
  endMin: number;
  displayDays: string | null;
  displayTime: string;
};

function schedulesOverlap(a: NormalizedSchedule, b: NormalizedSchedule): boolean {
  if (!intervalsOverlap(a.startMin, a.endMin, b.startMin, b.endMin)) return false;
  if (a.days && b.days) return dayListsOverlap(a.days, b.days);
  if (a.days && b.date) return a.days.includes(weekdayNameForDate(b.date));
  if (a.date && b.days) return b.days.includes(weekdayNameForDate(a.date));
  if (a.date && b.date) return a.date === b.date;
  return false;
}

async function getMentorNormalizedSchedule(
  mentorId: string,
  exclude?: { id?: string; type?: "course" | "session" }
): Promise<NormalizedSchedule[]> {
  const adminClient = createAdminClient();

  const [{ data: courses }, { data: sessions }] = await Promise.all([
    adminClient
      .from("courses")
      .select("id, title, class_days, class_time, duration_minutes")
      .eq("mentor_id", mentorId)
      .eq("status", "Active"),
    adminClient
      .from("sessions")
      .select("id, title, days, session_date, session_time, duration_minutes, is_repeatable")
      .eq("mentor_id", mentorId)
      .eq("status", "Active"),
  ]);

  const normalized: NormalizedSchedule[] = [];

  for (const c of courses || []) {
    if (exclude?.type === "course" && exclude.id === c.id) continue;
    if (!c.class_time) continue;
    const days = parseDayList(c.class_days);
    if (days.length === 0) continue;
    const startMin = parseTimeToMinutes(c.class_time);
    normalized.push({
      type: "course",
      id: c.id,
      name: c.title,
      days,
      date: null,
      startMin,
      endMin: startMin + (c.duration_minutes || 60),
      displayDays: days.join("/"),
      displayTime: c.class_time,
    });
  }

  for (const s of sessions || []) {
    if (exclude?.type === "session" && exclude.id === s.id) continue;
    if (!s.session_time) continue;
    const startMin = parseTimeToMinutes(s.session_time);
    const endMin = startMin + (s.duration_minutes || 60);
    if (s.is_repeatable && s.days) {
      const days = parseDayList(s.days);
      if (days.length === 0) continue;
      normalized.push({
        type: "session",
        id: s.id,
        name: s.title,
        days,
        date: null,
        startMin,
        endMin,
        displayDays: days.join("/"),
        displayTime: s.session_time,
      });
    } else if (s.session_date) {
      normalized.push({
        type: "session",
        id: s.id,
        name: s.title,
        days: null,
        date: s.session_date,
        startMin,
        endMin,
        displayDays: null,
        displayTime: s.session_time,
      });
    }
  }

  return normalized;
}

// Fetches the mentor's other Active courses/sessions and flags any that
// overlap the proposed days/date + time window. Never blocks — the caller
// decides whether to warn-and-allow ("Save anyway").
export async function checkMentorScheduleConflict(
  mentorId: string,
  params: {
    days?: string[];
    sessionDate?: string;
    startTime: string;
    endTime: string;
    excludeId?: string;
    excludeType?: "course" | "session";
  }
): Promise<ScheduleConflict[]> {
  if (!mentorId || !params.startTime || !params.endTime) return [];
  if (!params.days?.length && !params.sessionDate) return [];

  const existing = await getMentorNormalizedSchedule(mentorId, {
    id: params.excludeId,
    type: params.excludeType,
  });

  const target: NormalizedSchedule = {
    type: "course",
    id: "__target__",
    name: "",
    days: params.days?.length ? params.days : null,
    date: params.sessionDate || null,
    startMin: parseTimeToMinutes(params.startTime),
    endMin: parseTimeToMinutes(params.endTime),
    displayDays: params.days?.join("/") || null,
    displayTime: params.startTime,
  };

  return existing
    .filter((other) => schedulesOverlap(target, other))
    .map((other) => ({
      type: other.type,
      id: other.id,
      name: other.name,
      days: other.displayDays,
      date: other.date,
      time: `${other.displayTime} (${other.endMin - other.startMin} min)`,
    }));
}

// Same conflict check as checkMentorScheduleConflict, but scoped to the
// calling mentor themself — used when a mentor schedules their own class.
export async function checkMyScheduleConflict(
  params: {
    days?: string[];
    sessionDate?: string;
    startTime: string;
    endTime: string;
    excludeId?: string;
    excludeType?: "course" | "session";
  }
): Promise<ScheduleConflict[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  return checkMentorScheduleConflict(user.id, params);
}

// Used by the mentor's own availability page to render already-committed
// slots (from assigned courses/sessions) as a read-only overlay.
export async function getMentorBusySlots(): Promise<ScheduleConflict[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const schedule = await getMentorNormalizedSchedule(user.id);

  return schedule.map((s) => ({
    type: s.type,
    id: s.id,
    name: s.name,
    days: s.displayDays,
    date: s.date,
    time: `${s.displayTime} (${s.endMin - s.startMin} min)`,
  }));
}

export async function updateMentorProfile(data: {
  name: string;
  bio: string;
  qualification: string;
  expertise: string[];
  hourlyRate: number;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const adminClient = createAdminClient();

  const { error: profileErr } = await adminClient
    .from("profiles")
    .update({ full_name: data.name })
    .eq("id", user.id);

  if (profileErr) throw new Error(profileErr.message);

  const { error: mentorErr } = await adminClient
    .from("mentors")
    .update({
      bio: data.bio || null,
      qualification: data.qualification || 'Educator',
      expertise: data.expertise || [],
      hourly_rate: data.hourlyRate || 0,
    })
    .eq("id", user.id);

  if (mentorErr) throw new Error(mentorErr.message);

  revalidatePath("/mentor/profile");
  revalidatePath("/mentor/overview");
  return { success: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// COURSE UNITS (Recorded Courses)
// ─────────────────────────────────────────────────────────────────────────────

export async function getCourseUnits(courseId: string) {
  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from("course_units")
    .select("id, title, description, order_index, duration_seconds, youtube_url, module_name")
    .eq("course_id", courseId)
    .order("order_index", { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

// Returns units with video_id ONLY (never exposes full youtube_url to browser)
export async function getCourseUnitsForStudent(courseId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from("course_units")
    .select("id, title, description, order_index, duration_seconds, youtube_url, module_name")
    .eq("course_id", courseId)
    .order("order_index", { ascending: true });
  if (error) throw new Error(error.message);

  // Strip youtube_url, extract only video_id
  return (data || []).map((u) => {
    let videoId = "";
    try {
      const url = new URL(u.youtube_url);
      if (url.hostname.includes("youtu.be")) {
        videoId = url.pathname.slice(1);
      } else {
        videoId = url.searchParams.get("v") || "";
      }
    } catch {}
    return {
      id: u.id,
      title: u.title,
      description: u.description,
      order_index: u.order_index,
      duration_seconds: u.duration_seconds,
      video_id: videoId,
      module_name: u.module_name || "",
    };
  });
}

export async function upsertCourseUnit(data: {
  id?: string;
  courseId: string;
  title: string;
  description?: string;
  youtubeUrl: string;
  orderIndex: number;
  durationSeconds?: number;
  moduleName?: string;
}) {
  const adminClient = createAdminClient();
  const payload: TablesInsert<"course_units"> = {
    course_id: data.courseId,
    title: data.title,
    description: data.description || null,
    youtube_url: data.youtubeUrl,
    order_index: data.orderIndex,
    duration_seconds: data.durationSeconds || 0,
    module_name: data.moduleName || null,
  };
  if (data.id) payload.id = data.id;

  const { error } = await adminClient.from("course_units").upsert(payload);
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
  return { success: true };
}

export async function deleteCourseUnit(unitId: string) {
  const adminClient = createAdminClient();
  const { error } = await adminClient.from("course_units").delete().eq("id", unitId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
  return { success: true };
}

export async function reorderCourseUnits(unitIds: string[]) {
  const adminClient = createAdminClient();
  const updates = unitIds.map((id, idx) =>
    adminClient.from("course_units").update({ order_index: idx }).eq("id", id)
  );
  await Promise.all(updates);
  revalidatePath("/admin");
  return { success: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// VIDEO PROGRESS
// ─────────────────────────────────────────────────────────────────────────────

export async function getVideoProgress(courseId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const adminClient = createAdminClient();
  const { data: units } = await adminClient
    .from("course_units")
    .select("id")
    .eq("course_id", courseId);

  if (!units || units.length === 0) return {};

  const unitIds = units.map((u) => u.id);
  const { data: progress } = await adminClient
    .from("video_progress")
    .select("unit_id, watch_percentage, completed")
    .eq("student_id", user.id)
    .in("unit_id", unitIds);

  const result: Record<string, { watch_percentage: number; completed: boolean }> = {};
  (progress || []).forEach((p) => {
    result[p.unit_id] = {
      watch_percentage: Number(p.watch_percentage),
      completed: p.completed,
    };
  });
  return result;
}

export async function updateVideoProgress(unitId: string, watchPercentage: number) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const completed = watchPercentage >= 80;

  const adminClient = createAdminClient();
  const { error } = await adminClient
    .from("video_progress")
    .upsert({
      student_id: user.id,
      unit_id: unitId,
      watch_percentage: watchPercentage,
      completed,
      last_watched_at: new Date().toISOString(),
    }, { onConflict: "student_id,unit_id" });

  if (error) throw new Error(error.message);
  return { success: true, completed };
}

// ─────────────────────────────────────────────────────────────────────────────
// ATTENDANCE
// ─────────────────────────────────────────────────────────────────────────────

export async function getClassAttendance(classId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const adminClient = createAdminClient();

  const { data: cls } = await adminClient
    .from("scheduled_classes")
    .select("id, booking_id, student_id, mentor_id, title, subject, scheduled_at")
    .eq("id", classId)
    .single();

  if (!cls) return { class: null, students: [], attendance: {} };
  if (cls.mentor_id !== user.id) throw new Error("Unauthorized: this class doesn't belong to you.");

  const { data: booking } = await adminClient
    .from("bookings")
    .select("session_id, course_id")
    .eq("id", cls.booking_id)
    .single();

  let allStudentIds: string[] = [cls.student_id];

  if (booking?.session_id) {
    const { data: siblings } = await adminClient
      .from("bookings")
      .select("student_id")
      .eq("session_id", booking.session_id)
      .eq("status", "confirmed");
    if (siblings) allStudentIds = [...new Set(siblings.map((b) => b.student_id))];
  } else if (booking?.course_id) {
    const { data: siblings } = await adminClient
      .from("bookings")
      .select("student_id")
      .eq("course_id", booking.course_id)
      .eq("status", "confirmed");
    if (siblings) allStudentIds = [...new Set(siblings.map((b) => b.student_id))];
  }

  const { data: profiles } = await adminClient
    .from("profiles")
    .select("id, full_name, avatar_url")
    .in("id", allStudentIds);

  const { data: attendanceRecords } = await adminClient
    .from("attendance_records")
    .select("student_id, status")
    .eq("scheduled_class_id", classId);

  const attendance: Record<string, string> = {};
  (attendanceRecords || []).forEach((r) => {
    attendance[r.student_id] = r.status;
  });

  return { class: cls, students: profiles || [], attendance };
}

export async function markAttendance(
  classId: string,
  records: { studentId: string; status: "present" | "absent" | "excused" }[]
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const adminClient = createAdminClient();

  const { data: cls } = await adminClient
    .from("scheduled_classes")
    .select("scheduled_at, subject, booking_id, mentor_id")
    .eq("id", classId)
    .single();

  if (!cls) throw new Error("Class not found");
  if (cls.mentor_id !== user.id) throw new Error("Unauthorized: this class doesn't belong to you.");

  const sessionDate = new Date(cls.scheduled_at).toISOString().split("T")[0];

  for (const r of records) {
    await adminClient
      .from("attendance_records")
      .upsert({
        scheduled_class_id: classId,
        student_id: r.studentId,
        status: r.status,
        booking_id: cls.booking_id,
        session_date: sessionDate,
        subject: cls.subject,
      }, { onConflict: "scheduled_class_id,student_id" });
  }

  revalidatePath("/mentor/classes");
  return { success: true };
}

export async function markClassCompleted(classId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const adminClient = createAdminClient();
  const { error } = await adminClient
    .from("scheduled_classes")
    .update({ status: "completed" })
    .eq("id", classId)
    .eq("mentor_id", user.id);

  if (error) throw new Error(error.message);

  revalidatePath("/mentor/classes");
  revalidatePath("/dashboard/classes");
  return { success: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// MENTOR NOTIFICATIONS
// ─────────────────────────────────────────────────────────────────────────────

export async function getMentorNotifications() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from("mentor_notifications")
    .select("*")
    .eq("mentor_id", user.id)
    .lte("scheduled_for", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) throw new Error(error.message);
  return data || [];
}

export async function getUnreadNotificationCount() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 0;

  const adminClient = createAdminClient();
  const { count } = await adminClient
    .from("mentor_notifications")
    .select("id", { count: "exact", head: true })
    .eq("mentor_id", user.id)
    .eq("is_read", false)
    .lte("scheduled_for", new Date().toISOString());

  return count || 0;
}

export async function markNotificationsRead(ids: string[]) {
  const adminClient = createAdminClient();
  const { error } = await adminClient
    .from("mentor_notifications")
    .update({ is_read: true })
    .in("id", ids);
  if (error) throw new Error(error.message);
  return { success: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// PARENT / STUDENT NOTIFICATIONS
// ─────────────────────────────────────────────────────────────────────────────

export async function getUserNotifications() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from("user_notifications")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) throw new Error(error.message);
  return data || [];
}

export async function getUnreadUserNotificationCount() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 0;

  const adminClient = createAdminClient();
  const { count } = await adminClient
    .from("user_notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("is_read", false);

  return count || 0;
}

export async function markUserNotificationsRead(ids: string[]) {
  const adminClient = createAdminClient();
  const { error } = await adminClient
    .from("user_notifications")
    .update({ is_read: true })
    .in("id", ids);
  if (error) throw new Error(error.message);
  return { success: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN NOTIFICATIONS
// ─────────────────────────────────────────────────────────────────────────────

export async function getAdminNotifications() {
  await assertAdminCaller();

  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from("admin_notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) throw new Error(error.message);
  return data || [];
}

export async function getUnreadAdminNotificationCount() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 0;

  const adminClient = createAdminClient();
  const { data: profile } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") return 0;

  const { count } = await adminClient
    .from("admin_notifications")
    .select("id", { count: "exact", head: true })
    .eq("is_read", false);

  return count || 0;
}

export async function markAdminNotificationsRead(ids: string[]) {
  await assertAdminCaller();

  const adminClient = createAdminClient();
  const { error } = await adminClient
    .from("admin_notifications")
    .update({ is_read: true })
    .in("id", ids);
  if (error) throw new Error(error.message);
  return { success: true };
}

async function notifyAdmins(params: {
  type: "new_booking_request" | "new_lead" | "new_support_ticket" | "mentor_invite_accepted";
  title: string;
  message: string;
  linkUrl?: string;
}) {
  const adminClient = createAdminClient();
  await adminClient.from("admin_notifications").insert({
    type: params.type,
    title: params.title,
    message: params.message,
    link_url: params.linkUrl || null,
  });
}

async function createMentorNotifications(params: {
  mentorId: string;
  itemTitle: string;
  studentName: string;
  firstClassAt: string | null;
  classId?: string | null;
}) {
  const adminClient = createAdminClient();
  const now = new Date().toISOString();
  const toInsert: TablesInsert<"mentor_notifications">[] = [];

  toInsert.push({
    mentor_id: params.mentorId,
    type: "new_booking",
    title: "New Booking",
    message: `${params.studentName} enrolled in ${params.itemTitle}`,
    link_url: "/mentor/classes",
    class_id: params.classId || null,
    scheduled_for: now,
  });

  if (params.firstClassAt) {
    const classTime = new Date(params.firstClassAt).getTime();
    toInsert.push({
      mentor_id: params.mentorId,
      type: "reminder_3h",
      title: "Session in 3 Hours",
      message: `"${params.itemTitle}" starts in 3 hours — please add your meeting link`,
      link_url: "/mentor/classes",
      class_id: params.classId || null,
      scheduled_for: new Date(classTime - 3 * 60 * 60 * 1000).toISOString(),
    });
    toInsert.push({
      mentor_id: params.mentorId,
      type: "reminder_1h",
      title: "Session in 1 Hour!",
      message: `"${params.itemTitle}" starts in 1 hour — meeting link required`,
      link_url: "/mentor/classes",
      class_id: params.classId || null,
      scheduled_for: new Date(classTime - 1 * 60 * 60 * 1000).toISOString(),
    });
  }

  await adminClient.from("mentor_notifications").insert(toInsert);
}

// ─────────────────────────────────────────────────────────────────────────────
// SESSION LINK MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

export async function updateCourseJoinUrl(courseId: string, joinUrl: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from("courses")
    .update({ join_url: joinUrl || null })
    .eq("id", courseId)
    .eq("mentor_id", user.id)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Unauthorized: this course doesn't belong to you.");
  revalidatePath("/mentor/classes");
  revalidatePath("/dashboard/classes");
  return { success: true };
}

export async function updateSessionJoinUrl(sessionId: string, joinUrl: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from("sessions")
    .update({ join_url: joinUrl || null })
    .eq("id", sessionId)
    .eq("mentor_id", user.id)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Unauthorized: this session doesn't belong to you.");
  revalidatePath("/mentor/classes");
  revalidatePath("/dashboard/classes");
  return { success: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// CANCEL BOOKING (Admin)
// ─────────────────────────────────────────────────────────────────────────────

async function buildUserNotificationLinks(adminClient: ReturnType<typeof createAdminClient>, userIds: string[]) {
  const { data } = await adminClient.from("profiles").select("id, role").in("id", userIds);
  const links: Record<string, string> = {};
  (data || []).forEach((p) => {
    links[p.id] = p.role === "student" ? "/lms/courses" : "/bookings";
  });
  return links;
}

type ParentPreferenceKey =
  | "booking_confirmations"
  | "class_reminders"
  | "assignment_updates"
  | "mentor_messages"
  | "offers_promotions";

async function isParentNotifAllowed(
  adminClient: ReturnType<typeof createAdminClient>,
  parentId: string,
  key: ParentPreferenceKey
) {
  const { data: parent } = await adminClient
    .from("parents")
    .select("notification_preferences")
    .eq("id", parentId)
    .single();
  const prefs = parent?.notification_preferences as Record<string, boolean> | null;
  return prefs?.[key] !== false;
}

// Notifies a student and, if they have one, their parent — used for
// classroom-side events (grading, resources, reschedules) that aren't
// booking/payment notifications. The parent leg is skipped if they've
// switched off the matching notification_preferences toggle.
async function notifyStudentAndParent(
  studentId: string,
  params: {
    type: string;
    title: string;
    message: string;
    studentLinkUrl?: string;
    parentLinkUrl?: string;
    preferenceKey?: ParentPreferenceKey;
  }
) {
  const adminClient = createAdminClient();

  const { data: student } = await adminClient
    .from("students")
    .select("parent_id")
    .eq("id", studentId)
    .single();

  const rows: TablesInsert<"user_notifications">[] = [
    {
      user_id: studentId,
      type: params.type,
      title: params.title,
      message: params.message,
      link_url: params.studentLinkUrl || "/lms/overview",
    },
  ];

  if (student?.parent_id) {
    let parentAllowed = true;
    if (params.preferenceKey) {
      const { data: parent } = await adminClient
        .from("parents")
        .select("notification_preferences")
        .eq("id", student.parent_id)
        .single();
      const prefs = parent?.notification_preferences as Record<string, boolean> | null;
      parentAllowed = prefs?.[params.preferenceKey] !== false;
    }
    if (parentAllowed) {
      rows.push({
        user_id: student.parent_id,
        type: params.type,
        title: params.title,
        message: params.message,
        link_url: params.parentLinkUrl || "/dashboard/overview",
      });
    }
  }

  await adminClient.from("user_notifications").insert(rows);
}

export async function cancelBooking(bookingId: string) {
  const adminClient = createAdminClient();

  const { data: booking } = await adminClient
    .from("bookings")
    .select(`
      student_id, parent_id, status, mentor_confirmed,
      course:courses(title, mentor_id),
      session:sessions(title, mentor_id)
    `)
    .eq("id", bookingId)
    .single();

  const { error: bookErr } = await adminClient
    .from("bookings")
    .update({ status: "cancelled" })
    .eq("id", bookingId);
  if (bookErr) throw new Error(bookErr.message);

  const { error: classErr } = await adminClient
    .from("scheduled_classes")
    .update({ status: "cancelled" })
    .eq("booking_id", bookingId);
  if (classErr) throw new Error(classErr.message);

  if (booking) {
    const courseData = Array.isArray(booking.course) ? booking.course[0] : booking.course;
    const sessionData = Array.isArray(booking.session) ? booking.session[0] : booking.session;
    const itemTitle = courseData?.title || sessionData?.title || "your session";

    const recipientIds = new Set<string>([booking.student_id]);
    if (booking.parent_id && await isParentNotifAllowed(adminClient, booking.parent_id, "booking_confirmations")) {
      recipientIds.add(booking.parent_id);
    }
    const links = await buildUserNotificationLinks(adminClient, Array.from(recipientIds));

    const notifRows = Array.from(recipientIds).map((uid) => ({
      user_id: uid,
      type: "booking_cancelled",
      title: "Booking Cancelled",
      message: `Your booking for "${itemTitle}" has been cancelled.`,
      link_url: links[uid] || "/bookings",
    }));
    const { error: notifErr } = await adminClient.from("user_notifications").insert(notifRows);
    if (notifErr) console.error(notifErr);

    // Only notify the mentor if they'd already been told about this booking
    // (i.e. it was confirmed) — mentors aren't notified of bookings still
    // pending admin review, so there's nothing for them to "un-know" here.
    const mentorId = courseData?.mentor_id || sessionData?.mentor_id;
    if (mentorId && booking.status === "confirmed") {
      await adminClient.from("mentor_notifications").insert({
        mentor_id: mentorId,
        type: "booking_cancelled",
        title: "Booking cancelled",
        message: `A student's booking for "${itemTitle}" has been cancelled.`,
        link_url: "/mentor/classes",
        scheduled_for: new Date().toISOString(),
      });
    }
  }

  revalidatePath("/admin");
  revalidatePath("/dashboard/classes");
  revalidatePath("/bookings");
  revalidatePath("/lms/courses");
  return { success: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// FINALIZE BOOKING CONFIRMATION (Admin) — manual payment collection +
// mentor availability confirmation, replacing the old instant auto-confirm.
// ─────────────────────────────────────────────────────────────────────────────

export async function finalizeBookingConfirmation(bookingId: string, params: {
  paymentMethod: string;
  paymentReference?: string;
  amountCollected: number;
  revisedDate?: string;
  revisedTime?: string;
  adminNotes?: string;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const adminClient = createAdminClient();

  const { data: booking, error: bookingFetchErr } = await adminClient
    .from("bookings")
    .select(`
      id, student_id, parent_id,
      course:courses(title, mentor_id),
      session:sessions(title, mentor_id)
    `)
    .eq("id", bookingId)
    .single();
  if (bookingFetchErr || !booking) throw new Error("Booking not found.");

  const courseData = Array.isArray(booking.course) ? booking.course[0] : booking.course;
  const sessionData = Array.isArray(booking.session) ? booking.session[0] : booking.session;
  const itemTitle = courseData?.title || sessionData?.title || "1-on-1 Session";
  const mentorId = courseData?.mentor_id || sessionData?.mentor_id || null;

  // If this booking has exactly one scheduled class (a 1-on-1/single group
  // session, not a multi-class batch), allow the admin to revise the date/time
  // the parent originally picked.
  const { data: existingClasses } = await adminClient
    .from("scheduled_classes")
    .select("id, scheduled_at")
    .eq("booking_id", bookingId)
    .order("scheduled_at", { ascending: true });

  if (existingClasses && existingClasses.length === 1 && params.revisedDate && params.revisedTime) {
    const timeMatch = params.revisedTime.match(/^(\d+):?(\d*)\s*(AM|PM)$/i);
    let hours = 9;
    let minutes = 0;
    if (timeMatch) {
      let rawHours = parseInt(timeMatch[1], 10);
      if (timeMatch[2]) minutes = parseInt(timeMatch[2], 10);
      const meridiem = timeMatch[3].toUpperCase();
      if (meridiem === "PM" && rawHours < 12) rawHours += 12;
      if (meridiem === "AM" && rawHours === 12) rawHours = 0;
      hours = rawHours;
    }
    const revisedAt = new Date(params.revisedDate);
    revisedAt.setHours(hours, minutes, 0, 0);

    const { error: rescheduleErr } = await adminClient
      .from("scheduled_classes")
      .update({ scheduled_at: revisedAt.toISOString() })
      .eq("id", existingClasses[0].id);
    if (rescheduleErr) throw new Error(rescheduleErr.message);
  }

  const { error: classErr } = await adminClient
    .from("scheduled_classes")
    .update({ status: "scheduled" })
    .eq("booking_id", bookingId);
  if (classErr) throw new Error(classErr.message);

  const { error: updateErr } = await adminClient
    .from("bookings")
    .update({
      status: "confirmed",
      payment_status: "paid",
      amount_paid: params.amountCollected,
      payment_method: params.paymentMethod,
      payment_reference: params.paymentReference || null,
      payment_collected_at: new Date().toISOString(),
      payment_collected_by: user.id,
      mentor_confirmed: true,
      mentor_confirmed_at: new Date().toISOString(),
      admin_notes: params.adminNotes || null,
    })
    .eq("id", bookingId);
  if (updateErr) throw new Error(updateErr.message);

  const { data: finalClasses } = await adminClient
    .from("scheduled_classes")
    .select("id, scheduled_at")
    .eq("booking_id", bookingId)
    .order("scheduled_at", { ascending: true });
  const firstClassAt = finalClasses?.[0]?.scheduled_at || null;

  const { data: studentProfile } = await adminClient
    .from("profiles").select("full_name").eq("id", booking.student_id).single();

  if (mentorId) {
    await createMentorNotifications({
      mentorId,
      itemTitle,
      studentName: studentProfile?.full_name || "A student",
      firstClassAt,
      classId: finalClasses?.[0]?.id || null,
    }).catch(console.error);
  }

  const dateLabel = firstClassAt
    ? new Date(firstClassAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })
    : null;

  const recipientIds = new Set<string>([booking.student_id]);
  if (booking.parent_id && await isParentNotifAllowed(adminClient, booking.parent_id, "booking_confirmations")) {
    recipientIds.add(booking.parent_id);
  }
  const links = await buildUserNotificationLinks(adminClient, Array.from(recipientIds));

  const notifRows = Array.from(recipientIds).map((uid) => ({
    user_id: uid,
    type: "booking_confirmed",
    title: "Booking Confirmed",
    message: dateLabel
      ? `Your booking for "${itemTitle}" is confirmed — scheduled ${dateLabel} IST.`
      : `Your booking for "${itemTitle}" is confirmed.`,
    link_url: links[uid] || "/bookings",
  }));
  const { error: notifErr } = await adminClient.from("user_notifications").insert(notifRows);
  if (notifErr) console.error(notifErr);

  revalidatePath("/admin/bookings");
  revalidatePath("/bookings");
  revalidatePath("/lms/courses");
  revalidatePath("/mentor/classes");
  return { success: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// MANUAL BOOKING (Admin) — phone/walk-in orders entered directly by staff
// ─────────────────────────────────────────────────────────────────────────────

export async function searchAdminCustomers(query: string) {
  const term = query.trim().replace(/[,()%]/g, "");
  if (term.length < 2) return [];

  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from("profiles")
    .select("id, full_name, email, role")
    .in("role", ["parent", "student"])
    .or(`full_name.ilike.%${term}%,email.ilike.%${term}%`)
    .limit(15);

  if (error) throw new Error(error.message);

  const parentIds = (data || []).filter((p) => p.role === "parent").map((p) => p.id);
  const childrenCountByParent: Record<string, number> = {};
  if (parentIds.length > 0) {
    const { data: children } = await adminClient
      .from("students")
      .select("id, parent_id")
      .in("parent_id", parentIds);
    (children || []).forEach((c) => {
      if (!c.parent_id) return;
      childrenCountByParent[c.parent_id] = (childrenCountByParent[c.parent_id] || 0) + 1;
    });
  }

  return (data || []).map((p) => ({
    id: p.id,
    fullName: p.full_name,
    email: p.email,
    role: p.role as "parent" | "student",
    childrenCount: p.role === "parent" ? (childrenCountByParent[p.id] || 0) : undefined,
  }));
}

export async function getAdminParentChildren(parentId: string) {
  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from("students")
    .select("id, grade_level, profile:profiles(full_name, email)")
    .eq("parent_id", parentId);
  if (error) throw new Error(error.message);

  return (data || []).map((s) => {
    const profileData = Array.isArray(s.profile) ? s.profile[0] : s.profile;
    return {
      id: s.id,
      name: profileData?.full_name || "Child",
      email: profileData?.email || "",
      grade: s.grade_level || "",
    };
  });
}

// Creates an independent student account (no parent) for phone/walk-in
// customers who don't have one yet — mirrors the shadow-account pattern
// inviteChild() already uses for parent-invited children.
export async function createManualStudentAccount(email: string, fullName: string) {
  const emailLower = email.trim().toLowerCase();
  if (!emailLower) throw new Error("Email is required.");

  const adminClient = createAdminClient();

  const { data: existingProfile } = await adminClient
    .from("profiles")
    .select("id")
    .eq("email", emailLower)
    .maybeSingle();
  if (existingProfile) {
    throw new Error("An account with this email already exists — search for it instead.");
  }

  const tempPassword = `${emailLower.split("@")[0]}${Math.floor(1000 + Math.random() * 9000)}`;

  const { data: created, error } = await adminClient.auth.admin.createUser({
    email: emailLower,
    password: tempPassword,
    email_confirm: true,
    user_metadata: {
      full_name: fullName.trim() || emailLower.split("@")[0],
      role: "student",
    },
  });

  if (error || !created?.user) {
    throw new Error(error?.message || "Failed to create student account.");
  }

  return { studentId: created.user.id, tempPassword };
}

export async function createManualBooking(params: {
  targetId: string;
  targetType: "course" | "session";
  studentId: string;
  parentId: string | null;
  durationMinutes?: number;
  selectedSlot?: { day: string; time: string };
  selectedDate?: string;
  subject?: string;
  topicDetails?: string;
  paymentMode?: "full" | "partial" | "none";
  paymentDone?: boolean;
  paymentMethod?: string;
  paymentReference?: string;
  amountCollected?: number;
  totalAmount?: number;
  dueDate?: string;
  adminNotes?: string;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { bookingId } = await createBookingRecord({
    targetId: params.targetId,
    targetType: params.targetType,
    studentId: params.studentId,
    parentId: params.parentId,
    durationMinutes: params.durationMinutes,
    selectedSlot: params.selectedSlot,
    selectedDate: params.selectedDate,
    subject: params.subject,
    topicDetails: params.topicDetails,
  });

  const adminClient = createAdminClient();

  let mode = params.paymentMode;
  if (!mode) {
    mode = params.paymentDone ? "full" : "none";
  }

  const calculatedTotal = Number(params.totalAmount || params.amountCollected || 0);
  const collected = Number(params.amountCollected || 0);

  if (mode === "full") {
    let amount = collected || calculatedTotal;
    if (!amount) {
      const { data: b } = await adminClient.from("bookings").select("amount_paid").eq("id", bookingId).single();
      amount = Number(b?.amount_paid || 0);
    }
    await finalizeBookingConfirmation(bookingId, {
      paymentMethod: params.paymentMethod || "Cash",
      paymentReference: params.paymentReference,
      amountCollected: amount,
      adminNotes: params.adminNotes,
    });
    if (calculatedTotal) {
      await adminClient.from("bookings").update({ total_amount: calculatedTotal }).eq("id", bookingId);
    }
  } else if (mode === "partial") {
    const remaining = Math.max(0, calculatedTotal - collected);

    // Confirm classes so join_urls and schedule are active for student
    await adminClient.from("scheduled_classes").update({ status: "scheduled" }).eq("booking_id", bookingId);

    const { error: updateErr } = await adminClient
      .from("bookings")
      .update({
        status: "confirmed",
        payment_status: "partially_paid",
        amount_paid: collected,
        total_amount: calculatedTotal,
        due_date: params.dueDate || null,
        payment_method: params.paymentMethod || "Cash",
        payment_reference: params.paymentReference || null,
        payment_collected_at: new Date().toISOString(),
        payment_collected_by: user.id,
        mentor_confirmed: true,
        mentor_confirmed_at: new Date().toISOString(),
        admin_notes: params.adminNotes || null,
      })
      .eq("id", bookingId);

    if (updateErr) throw new Error(updateErr.message);

    // Try logging installment branch
    try {
      await adminClient.from("booking_payment_logs").insert({
        booking_id: bookingId,
        amount: collected,
        payment_method: params.paymentMethod || "Cash",
        payment_reference: params.paymentReference || null,
        notes: `Initial partial payment. Remaining due: ₹${remaining.toLocaleString()}`,
        recorded_by: user.id,
        created_at: new Date().toISOString(),
      });
    } catch (err) {
      console.warn("Could not insert into booking_payment_logs:", err);
    }

    // Send Notifications to Student, Parent & Admin
    const recipientIds = new Set<string>([params.studentId]);
    if (params.parentId && await isParentNotifAllowed(adminClient, params.parentId, "booking_confirmations")) {
      recipientIds.add(params.parentId);
    }

    const dueText = params.dueDate ? ` Dues of ₹${remaining.toLocaleString()} are scheduled for ${params.dueDate}.` : ` Remaining balance of ₹${remaining.toLocaleString()} is due soon.`;
    const notifRows = Array.from(recipientIds).map((uid) => ({
      user_id: uid,
      type: "booking_partially_paid",
      title: "Booking Confirmed (Partial Payment)",
      message: `Your booking is confirmed with an initial deposit of ₹${collected.toLocaleString()}.${dueText}`,
      link_url: "/bookings",
    }));
    try {
      await adminClient.from("user_notifications").insert(notifRows);
    } catch (err) {
      console.error(err);
    }

  } else if (params.adminNotes) {
    await adminClient.from("bookings").update({ admin_notes: params.adminNotes, total_amount: calculatedTotal }).eq("id", bookingId);
  }

  revalidatePath("/admin/bookings");
  revalidatePath("/admin/payments");
  revalidatePath("/bookings");
  revalidatePath("/lms/courses");
  revalidatePath("/mentor/classes");
  return { success: true, bookingId };
}

export async function recordBookingInstallment(params: {
  bookingId: string;
  amountPaid: number;
  paymentMethod: string;
  paymentReference?: string;
  notes?: string;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const adminClient = createAdminClient();

  const { data: booking, error } = await adminClient
    .from("bookings")
    .select("id, amount_paid, total_amount, payment_status, student_id, parent_id, course:courses(title), session:sessions(title)")
    .eq("id", params.bookingId)
    .single();

  if (error || !booking) throw new Error("Booking not found");

  const currentPaid = Number(booking.amount_paid || 0);
  const newPaid = currentPaid + Number(params.amountPaid);
  const totalAmount = Number(booking.total_amount || currentPaid);
  const newPaymentStatus = newPaid >= totalAmount ? "paid" : "partially_paid";

  // Update booking record
  const { error: updateErr } = await adminClient
    .from("bookings")
    .update({
      amount_paid: newPaid,
      payment_status: newPaymentStatus,
      payment_method: params.paymentMethod,
      payment_reference: params.paymentReference || null,
      payment_collected_at: new Date().toISOString(),
    })
    .eq("id", params.bookingId);

  if (updateErr) throw new Error(updateErr.message);

  // Insert installment log
  try {
    await adminClient.from("booking_payment_logs").insert({
      booking_id: params.bookingId,
      amount: params.amountPaid,
      payment_method: params.paymentMethod,
      payment_reference: params.paymentReference || null,
      notes: params.notes || null,
      recorded_by: user.id,
      created_at: new Date().toISOString(),
    });
  } catch (logErr) {
    console.warn("Could not insert into booking_payment_logs:", logErr);
  }

  // Send notifications to Student & Parent
  const courseData = Array.isArray(booking.course) ? booking.course[0] : booking.course;
  const sessionData = Array.isArray(booking.session) ? booking.session[0] : booking.session;
  const itemTitle = courseData?.title || sessionData?.title || "Booking";

  const recipientIds = new Set<string>();
  if (booking.student_id) recipientIds.add(booking.student_id);
  if (booking.parent_id && await isParentNotifAllowed(adminClient, booking.parent_id, "booking_confirmations")) {
    recipientIds.add(booking.parent_id);
  }

  const notifRows = Array.from(recipientIds).map((uid) => ({
    user_id: uid,
    type: "payment_received",
    title: newPaymentStatus === "paid" ? "Full Payment Completed" : "Payment Installment Received",
    message: `Payment installment of ₹${params.amountPaid.toLocaleString()} recorded for "${itemTitle}". Total paid: ₹${newPaid.toLocaleString()} of ₹${totalAmount.toLocaleString()}.`,
    link_url: "/bookings",
  }));

  if (notifRows.length > 0) {
    try {
      await adminClient.from("user_notifications").insert(notifRows);
    } catch (err) {
      console.error(err);
    }
  }

  revalidatePath("/admin/payments");
  revalidatePath("/admin/bookings");
  revalidatePath("/bookings");
  return { success: true, newPaid, newPaymentStatus };
}

export async function getBookingPaymentLogs(bookingId: string) {
  const adminClient = createAdminClient();
  try {
    const { data: logs, error } = await adminClient
      .from("booking_payment_logs")
      .select("*")
      .eq("booking_id", bookingId)
      .order("created_at", { ascending: true });

    if (error) throw error;
    return logs || [];
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STUDENT: Scheduled classes with resolved join_url by booking type
// ─────────────────────────────────────────────────────────────────────────────

export async function getStudentScheduledClassesResolved(bookingId: string) {
  const adminClient = createAdminClient();

  const { data: classes, error } = await adminClient
    .from("scheduled_classes")
    .select("*, booking:bookings(course_id, session_id, created_at)")
    .eq("booking_id", bookingId)
    .order("scheduled_at", { ascending: true });

  if (error) throw new Error(error.message);

  // Fetch attendance records for this booking to attach status
  const { data: attendance } = await adminClient
    .from("attendance_records")
    .select("*")
    .eq("booking_id", bookingId);

  // For each class, resolve the correct join_url
  const resolved = await Promise.all((classes || []).map(async (cls) => {
    let resolvedJoinUrl = cls.join_url;

    if (cls.booking?.course_id) {
      const { data: course } = await adminClient
        .from("courses")
        .select("join_url, format")
        .eq("id", cls.booking.course_id)
        .single();
      if (course?.join_url) resolvedJoinUrl = course.join_url;
    } else if (cls.booking?.session_id) {
      const { data: session } = await adminClient
        .from("sessions")
        .select("join_url, type")
        .eq("id", cls.booking.session_id)
        .single();
      if (session?.join_url) resolvedJoinUrl = session.join_url;
    }

    const attendanceRec = (attendance || []).find((a) => a.scheduled_class_id === cls.id);
    const attendanceStatus = attendanceRec ? attendanceRec.status : null;

    return { 
      ...cls, 
      join_url: resolvedJoinUrl,
      attendance_status: attendanceStatus,
      booking_created_at: cls.booking?.created_at || null
    };
  }));

  return resolved;
}

export async function getStudentBookingsWithJoinUrls(studentId: string) {
  const adminClient = createAdminClient();

  const { data: dbBookings, error } = await adminClient
    .from("bookings")
    .select(`
      id,
      status,
      payment_status,
      amount_paid,
      student_id,
      session_id,
      course_id,
      created_at,
      session:sessions(title, type, price, subject, join_url, mentor:mentors!sessions_mentor_id_fkey(profile:profiles(full_name))),
      course:courses(title, format, price, subject, join_url, mentor:mentors(profile:profiles(full_name)))
    `)
    .eq("student_id", studentId)
    .neq("status", "cancelled");

  if (error) throw new Error(error.message);

  return (dbBookings || []).map((b) => {
    const isCourse = !!b.course_id;
    const courseTarget = b.course;
    const sessionTarget = b.session;
    const mentorName = (isCourse ? courseTarget?.mentor?.profile?.full_name : sessionTarget?.mentor?.profile?.full_name) || "Unknown Mentor";

    return {
      id: b.id,
      bookingType: isCourse ? "Course" : "Session",
      courseFormat: isCourse ? courseTarget?.format : null,
      courseId: b.course_id,
      sessionId: b.session_id,
      itemTitle: (isCourse ? courseTarget?.title : sessionTarget?.title) || "Untitled",
      mentorName,
      amountPaid: Number(b.amount_paid || 0),
      paymentStatus: b.payment_status,
      status: b.status,
      createdAt: b.created_at,
      joinUrl: (isCourse ? courseTarget?.join_url : sessionTarget?.join_url) || null,
    };
  });
}

export async function getStudentBookingsAction() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  return getStudentBookingsWithJoinUrls(user.id);
}

export async function getStudentCourseDetails(courseId: string) {
  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from("courses")
    .select("id, title, description, subject, mentor:mentors(id, profile:profiles(full_name))")
    .eq("id", courseId)
    .single();
  if (error) throw new Error(error.message);
  const mentorObj = Array.isArray(data.mentor) ? data.mentor[0] : data.mentor;
  const mentorProfile = mentorObj ? (Array.isArray(mentorObj.profile) ? mentorObj.profile[0] : mentorObj.profile) : null;

  return {
    id: data.id,
    title: data.title,
    description: data.description,
    subject: data.subject,
    mentorName: mentorProfile?.full_name || "Mentor",
  };
}

export async function getItemReviews(itemId: string, type: "course" | "session") {
  const supabase = createAdminClient();
  const query = supabase
    .from("reviews")
    .select(`
      id,
      student_id,
      student_name,
      rating,
      comment,
      created_at,
      profile:profiles(full_name)
    `);

  if (type === "course") {
    query.eq("course_id", itemId);
  } else {
    query.eq("session_id", itemId);
  }

  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  return (data || []).map((r) => {
    const profileName = Array.isArray(r.profile)
      ? r.profile[0]?.full_name
      : r.profile?.full_name;
    const name = profileName || r.student_name || "Anonymous Student";
    const init = name.split(" ").map((w: string) => w[0]).join("").substring(0, 2).toUpperCase();

    return {
      id: r.id,
      studentName: name,
      avatarText: init || "S",
      rating: Number(r.rating),
      comment: r.comment || "",
      createdAt: r.created_at,
    };
  });
}

export async function addReview(review: {
  itemId: string;
  type: "course" | "session";
  rating: number;
  comment: string;
  studentName?: string;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const insertData: TablesInsert<"reviews"> = {
    rating: Number(review.rating),
    comment: review.comment || "",
  };

  if (user) {
    insertData.student_id = user.id;
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .single();
    if (profile?.full_name) {
      insertData.student_name = profile.full_name;
    }
  }

  if (review.studentName) {
    insertData.student_name = review.studentName;
  }

  if (review.type === "course") {
    insertData.course_id = review.itemId;
  } else {
    insertData.session_id = review.itemId;
  }

  const adminClient = createAdminClient();
  const { error } = await adminClient.from("reviews").insert([insertData]);
  if (error) throw new Error(error.message);

  revalidatePath(`/courses/${review.itemId}`);
  revalidatePath(`/sessions/${review.itemId}`);
  revalidatePath("/");
  return { success: true };
}

export async function getStudentResources() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: resources, error } = await supabase
    .from("resources")
    .select(`
      *,
      mentor:mentors(
        profile:profiles(full_name)
      ),
      course:courses(title)
    `)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  return (resources || []).map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type === "video" ? "link" : r.type,
    subject: r.subject,
    mentor: r.mentor?.profile?.full_name || "Unknown Mentor",
    courseName: r.course?.title || null,
    date: new Date(r.created_at).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric"
    }),
    size: r.size || undefined,
    url: r.url
  }));
}

export async function getStudentBookingDashboardDetails(bookingId: string) {
  const adminClient = createAdminClient();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  // 1. Fetch Booking info
  const { data: b, error: bErr } = await adminClient
    .from("bookings")
    .select(`
      id,
      status,
      payment_status,
      amount_paid,
      student_id,
      session_id,
      course_id,
      created_at,
      session:sessions(title, type, price, subject, join_url, mentor:mentors!sessions_mentor_id_fkey(id, profile:profiles(full_name))),
      course:courses(title, format, price, subject, join_url, mentor:mentors(id, profile:profiles(full_name)))
    `)
    .eq("id", bookingId)
    .single();

  if (bErr || !b) throw new Error("Booking not found: " + (bErr?.message || ""));

  // Verify student owns this booking
  if (b.student_id !== user.id) {
    // If not direct student, check if it's the parent of the student
    const { data: student } = await adminClient
      .from("students")
      .select("parent_id")
      .eq("id", b.student_id)
      .single();
    if (!student || student.parent_id !== user.id) {
      throw new Error("Access denied: Not authorized to view this booking.");
    }
  }

  const isCourse = !!b.course_id;
  const courseTarget = b.course;
  const sessionTarget = b.session;
  const target = isCourse ? courseTarget : sessionTarget;

  const mentorObj = isCourse ? courseTarget?.mentor : sessionTarget?.mentor;
  const mentorId = mentorObj?.id;
  const mentorName = mentorObj?.profile?.full_name || "Unknown Mentor";

  const bookingDetails = {
    id: b.id,
    bookingType: isCourse ? "Course" : "Session",
    courseFormat: isCourse ? courseTarget?.format : null,
    courseId: b.course_id,
    sessionId: b.session_id,
    itemTitle: target?.title || "Untitled",
    mentorName,
    mentorId,
    subject: target?.subject || "General",
    amountPaid: Number(b.amount_paid || 0),
    paymentStatus: b.payment_status,
    status: b.status,
    createdAt: b.created_at,
    joinUrl: target?.join_url || null,
  };

  // 2. Fetch Scheduled classes for this booking
  const { data: classes } = await adminClient
    .from("scheduled_classes")
    .select("*")
    .eq("booking_id", bookingId)
    .order("scheduled_at", { ascending: true });

  // Resolve join URLs
  const resolvedClasses = (classes || []).map((cls) => {
    const resolvedJoinUrl = cls.join_url || bookingDetails.joinUrl;
    return { ...cls, join_url: resolvedJoinUrl };
  });

  // 3. Fetch Assignments for this booking
  const { data: assignments } = await adminClient
    .from("assignments")
    .select("*")
    .eq("booking_id", bookingId)
    .order("due_date", { ascending: true });

  // 4. Fetch Attendance records for this booking
  const { data: attendance } = await adminClient
    .from("attendance_records")
    .select("*")
    .eq("booking_id", bookingId);

  // 5. Fetch resources for this mentor
  interface MappedResource {
    id: string;
    name: string;
    type: string;
    subject: string;
    mentor: string;
    date: string;
    size: string | undefined;
    url: string;
  }
  let mappedResources: MappedResource[] = [];
  if (mentorId) {
    const { data: resources } = await adminClient
      .from("resources")
      .select("*")
      .eq("mentor_id", mentorId)
      .order("created_at", { ascending: false });

    mappedResources = (resources || []).map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type === "video" ? "link" : r.type,
      subject: r.subject,
      mentor: mentorName,
      date: new Date(r.created_at).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric"
      }),
      size: r.size || undefined,
      url: r.url
    }));
  }

  return {
    booking: bookingDetails,
    classes: resolvedClasses,
    assignments: assignments || [],
    attendance: attendance || [],
    resources: mappedResources,
  };
}

export async function getAdminSchedules() {
  noStore();
  const supabase = createAdminClient();

  const { data: dbClasses, error } = await supabase
    .from("scheduled_classes")
    .select(`
      *,
      student:students(id, profile:profiles(full_name, email)),
      mentor:mentors(id, profile:profiles(full_name)),
      booking:bookings(
        id,
        course:courses(id, title, subject, format),
        session:sessions(id, title, subject, type)
      ),
      attendance_records(id, status)
    `)
    .order("scheduled_at", { ascending: true });

  if (error) {
    console.error("Error fetching scheduled classes:", error);
    return [];
  }

  return (dbClasses || []).map((cls) => {
    const courseTitle = cls.booking?.course?.title || cls.booking?.session?.title || "1-on-1 Direct Private Session";
    const lessonTopic = cls.title;
    const mentorName = cls.mentor?.profile?.full_name || "Unknown Mentor";
    
    const dateObj = new Date(cls.scheduled_at);
    const dateStr = dateObj.toLocaleDateString("en-IN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).split("/").reverse().join("-");

    const timeStr = dateObj.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });

    const subject = cls.booking?.course?.subject || cls.booking?.session?.subject || cls.subject || "General";
    
    let itemType: "course" | "session" = "session";
    let subType = "1 on 1";
    if (cls.booking?.course) {
      itemType = "course";
      const f = cls.booking.course.format?.toLowerCase() || "";
      if (f.includes("batch")) subType = "Live Batch";
      else if (f.includes("individual")) subType = "Live Individual";
      else if (f.includes("recorded")) subType = "Recorded";
      else subType = "Recorded";
    } else if (cls.booking?.session) {
      itemType = "session";
      const t = cls.booking.session.type?.toLowerCase() || "";
      if (t.includes("group")) subType = "Group";
      else subType = "1 on 1";
    }

    return {
      id: cls.id,
      courseTitle,
      lessonTopic,
      date: dateStr,
      time: timeStr,
      scheduledAt: cls.scheduled_at,
      mentor: mentorName,
      mentorId: cls.mentor_id,
      zoomLink: cls.join_url,
      subject,
      itemType,
      subType,
      studentInfo: {
        studentId: cls.student?.id,
        studentName: cls.student?.profile?.full_name || "Unknown Student",
        studentEmail: cls.student?.profile?.email || "",
        bookingId: cls.booking?.id,
        scheduledClassId: cls.id,
        attendanceRecordId: cls.attendance_records?.[0]?.id || null,
        status: (cls.attendance_records?.[0]?.status ?? "unmarked") as Enums<"attendance_status"> | "unmarked",
      }
    };
  });
}

export async function markAdminAttendance(records: {
  studentId: string;
  scheduledClassId: string;
  bookingId: string;
  status: "present" | "absent" | "excused";
  date: string;
  subject: string;
}[]) {
  noStore();
  const supabase = createAdminClient();

  const results = [];
  for (const record of records) {
    // Check if record exists
    const { data: existing } = await supabase
      .from("attendance_records")
      .select("id")
      .eq("student_id", record.studentId)
      .eq("scheduled_class_id", record.scheduledClassId)
      .limit(1)
      .maybeSingle();

    if (existing) {
      // Update
      const { data, error } = await supabase
        .from("attendance_records")
        .update({
          status: record.status,
          session_date: record.date,
          subject: record.subject,
        })
        .eq("id", existing.id)
        .select();
      if (error) throw error;
      results.push(data);
    } else {
      // Insert
      const { data, error } = await supabase
        .from("attendance_records")
        .insert({
          student_id: record.studentId,
          scheduled_class_id: record.scheduledClassId,
          booking_id: record.bookingId || null,
          status: record.status,
          session_date: record.date,
          subject: record.subject,
        })
        .select();
      if (error) throw error;
      results.push(data);
    }
  }

  revalidatePath("/admin/schedules");
  return { success: true, count: results.length };
}

export async function getAdminCourseDetails(courseId: string) {
  noStore();
  const supabase = createAdminClient();

  // 1. Fetch Course details
  const { data: course, error } = await supabase
    .from("courses")
    .select("*, mentor:mentors(profile:profiles(full_name, avatar_url, email), qualification, experience, rating)")
    .eq("id", courseId)
    .single();

  if (error || !course) {
    throw new Error(error ? error.message : "Course not found");
  }

  // 2. Fetch bookings for this course
  const { data: dbBookings } = await supabase
    .from("bookings")
    .select(`
      *,
      student:students(profile:profiles(full_name, email)),
      parent:parents(profile:profiles(full_name, email))
    `)
    .eq("course_id", courseId)
    .order("created_at", { ascending: false });

  const bookings = (dbBookings || []).map((b) => {
    return {
      id: b.id,
      studentName: b.student?.profile?.full_name || "Unknown Student",
      studentEmail: b.student?.profile?.email || "",
      parentName: b.parent?.profile?.full_name || "Unknown Parent",
      parentEmail: b.parent?.profile?.email || "",
      amountPaid: Number(b.amount_paid),
      status: b.status,
      paymentStatus: b.payment_status,
      createdAt: b.created_at,
    };
  });

  return {
    course: {
      id: course.id,
      title: course.title,
      description: course.description || "",
      aboutCourse: course.about_course || "",
      coverImageUrl: course.cover_image_url || "",
      subject: course.subject,
      format: course.format,
      price: Number(course.price),
      status: course.status,
      rating: Number(course.rating),
      durationDays: Number(course.duration_days || 30),
      totalSessions: Number(course.total_sessions || 10),
      sessionsPerWeek: Number(course.sessions_per_week || 2),
      classDays: course.class_days || "",
      classTiming: course.class_timing || "",
      languages: course.languages || ["English"],
      classLevel: course.class_level || "",
      learningOutcomes: course.learning_outcomes || [],
      mentor: course.mentor ? {
        name: course.mentor.profile?.full_name || "Unknown Mentor",
        email: course.mentor.profile?.email || "",
        avatarUrl: course.mentor.profile?.avatar_url || "",
        qualification: course.mentor.qualification || "Educator",
        experience: course.mentor.experience || 5,
        rating: Number(course.mentor.rating || 5.0),
      } : null,
    },
    bookings,
  };
}

export async function getAdminSessionDetails(sessionId: string) {
  noStore();
  const supabase = createAdminClient();

  // 1. Fetch Session details
  const { data: session, error } = await supabase
    .from("sessions")
    .select("*, mentor:mentors!sessions_mentor_id_fkey(profile:profiles(full_name, avatar_url, email), qualification, experience, rating)")
    .eq("id", sessionId)
    .single();

  if (error || !session) {
    throw new Error(error ? error.message : "Session not found");
  }

  // 2. Fetch bookings for this session
  const { data: dbBookings } = await supabase
    .from("bookings")
    .select(`
      *,
      student:students(profile:profiles(full_name, email)),
      parent:parents(profile:profiles(full_name, email))
    `)
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false });

  const bookings = (dbBookings || []).map((b) => {
    return {
      id: b.id,
      studentName: b.student?.profile?.full_name || "Unknown Student",
      studentEmail: b.student?.profile?.email || "",
      parentName: b.parent?.profile?.full_name || "Unknown Parent",
      parentEmail: b.parent?.profile?.email || "",
      amountPaid: Number(b.amount_paid),
      status: b.status,
      paymentStatus: b.payment_status,
      createdAt: b.created_at,
    };
  });

  return {
    session: {
      id: session.id,
      title: session.title,
      description: session.description || "",
      aboutSession: session.about_session || "",
      subject: session.subject,
      type: session.type,
      price: Number(session.price),
      status: session.status,
      colorBg: session.color_bg || "#ede9fe",
      iconName: session.icon_name || "writing",
      durationOptions: session.duration_options || "60 or 90 min",
      platform: session.platform || "Zoom",
      language: session.language || "English / Hindi",
      days: session.days || "Mon – Sat",
      reschedulePolicy: session.reschedule_policy || "Up to 4 hrs before",
      sessionDate: session.session_date || "",
      sessionTime: session.session_time || "",
      isRepeatable: session.is_repeatable || false,
      classLevel: session.class_level || "",
      mentor: session.mentor ? {
        name: session.mentor.profile?.full_name || "Unknown Mentor",
        email: session.mentor.profile?.email || "",
        avatarUrl: session.mentor.profile?.avatar_url || "",
        qualification: session.mentor.qualification || "Educator",
        experience: session.mentor.experience || 5,
        rating: Number(session.mentor.rating || 5.0),
      } : null,
    },
    bookings,
  };
}

export async function updateMentorRate(mentorId: string, rate: number) {
  noStore();
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("mentors")
    .update({ hourly_rate: rate })
    .eq("id", mentorId);

  if (error) throw error;
  revalidatePath(`/admin/mentors/${mentorId}`);
  return { success: true };
}

export async function updateMentorProfileByAdmin(mentorId: string, data: {
  name: string;
  email: string;
  rate: number;
  verified: boolean;
  qualification: string;
  experience: number;
  bio: string;
}) {
  noStore();
  const supabase = createAdminClient();

  // 1. Update mentors table
  const { error: mentorError } = await supabase
    .from("mentors")
    .update({
      hourly_rate: data.rate,
      verified: data.verified,
      qualification: data.qualification,
      experience: data.experience,
      bio: data.bio
    })
    .eq("id", mentorId);

  if (mentorError) throw mentorError;

  // 2. Update profiles table
  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      full_name: data.name,
      email: data.email
    })
    .eq("id", mentorId);

  if (profileError) throw profileError;

  revalidatePath(`/admin/mentors/${mentorId}`);
  return { success: true };
}


