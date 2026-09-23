"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  IconCode,
  IconFlask,
  IconMap,
  IconBrandInstagram,
  IconBrandTwitter,
  IconBrandLinkedin,
  IconBrandYoutube,
  IconMath,
  IconPencil,
  IconStar,
  IconBook,
  IconPlayerPlayFilled,
  IconX,
} from "@tabler/icons-react";
import { getHomepageData, submitContactMessage } from "./actions";
import { createClient } from "@/lib/supabase/client";

type HomepageData = Awaited<ReturnType<typeof getHomepageData>>;
import BookingModal from "@/components/BookingModal";
import { validateEmail, validateName, validatePhone, validateMessage, validateSubject, sanitizeText } from "@/lib/validate";

// Dynamic Icon Picker Helper
const getIconComponent = (name: string) => {
  switch (name) {
    case "math":
    case "calculator":
      return <IconMath className="w-12 h-12 text-secondary" />;
    case "code":
      return <IconCode className="w-12 h-12 text-green-700" />;
    case "flask":
    case "science":
      return <IconFlask className="w-12 h-12 text-yellow-700" />;
    case "writing":
    case "pencil":
      return <IconPencil className="w-12 h-12 text-purple-700" />;
    case "map":
      return <IconMap className="w-12 h-12 text-pink-700" />;
    default:
      return <IconBook className="w-12 h-12 text-primary" />;
  }
};

// Subject Color Class Mapper
const getSubjectBgColor = (subject: string) => {
  switch (subject) {
    case "Mathematics":
      return "bg-blue-50";
    case "Programming":
      return "bg-green-50";
    case "Science":
      return "bg-yellow-50";
    case "English":
      return "bg-purple-50";
    default:
      return "bg-slate-50";
  }
};

// Animated scroll-triggered counter component
function AnimatedCounter({ value }: { value: string }) {
  const [count, setCount] = useState(0);
  const [hasAnimated, setHasAnimated] = useState(false);
  const elementRef = useRef<HTMLSpanElement>(null);

  const match = value.match(/^([\d,]+)(.*)$/);
  const numStr = match ? match[1] : "";
  const suffix = match ? match[2] : "";
  const target = match ? parseInt(numStr.replace(/,/g, ""), 10) : 0;

  useEffect(() => {
    const currentElement = elementRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && !hasAnimated) {
          setHasAnimated(true);
        }
      },
      { threshold: 0.1 }
    );

    if (currentElement) {
      observer.observe(currentElement);
    }

    return () => {
      if (currentElement) {
        observer.unobserve(currentElement);
      }
    };
  }, [hasAnimated]);

  useEffect(() => {
    if (!numStr || !hasAnimated || isNaN(target)) return;

    const duration = 2000; // 2 seconds animation duration
    const frameRate = 1000 / 60; // 60 fps
    const totalFrames = Math.round(duration / frameRate);
    let frame = 0;

    const timer = setInterval(() => {
      frame++;
      const progress = frame / totalFrames;
      // Easing out quadratic: f(t) = t * (2 - t)
      const easeProgress = progress * (2 - progress);
      const current = Math.round(easeProgress * target);
      
      setCount(current);

      if (frame >= totalFrames) {
        clearInterval(timer);
        setCount(target);
      }
    }, frameRate);

    return () => clearInterval(timer);
  }, [hasAnimated, target, numStr]);

  if (!match) {
    return <span>{value}</span>;
  }

  const formattedCount = numStr.includes(",") 
    ? count.toLocaleString("en-US")
    : count.toString();

  return (
    <span ref={elementRef}>
      {formattedCount}
      {suffix}
    </span>
  );
}

export default function Home() {
  const [data, setData] = useState<HomepageData | null>(null);
  const [activeBooking, setActiveBooking] = useState<{
    id: string;
    type: "course" | "session";
    title: string;
    price: number;
    mentorName: string;
    isLiveIndividual?: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    subject: "",
    phone: "",
    message: "",
  });
  const [formSubmitted, setFormSubmitted] = useState(false);
  const [isSubmittingForm, setIsSubmittingForm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [activeReviewIndex, setActiveReviewIndex] = useState<number | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [testimonialCardWidth, setTestimonialCardWidth] = useState<number | null>(null);
  const testimonialObserverRef = useRef<ResizeObserver | null>(null);

  // Callback ref (not useRef+useEffect): the marquee div only mounts once
  // `loading` flips false, so a mount-time effect would miss it entirely.
  const marqueeViewportRef = React.useCallback((node: HTMLDivElement | null) => {
    testimonialObserverRef.current?.disconnect();
    testimonialObserverRef.current = null;
    if (!node) return;

    const TESTIMONIAL_GAP = 16; // px, matches gap-4
    const recalc = (width: number) => {
      const visibleCount = width < 640 ? 2.2 : width < 1024 ? 3.5 : 4.5;
      setTestimonialCardWidth((width - TESTIMONIAL_GAP * (visibleCount - 1)) / visibleCount);
    };

    recalc(node.getBoundingClientRect().width);

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        recalc(entry.contentRect.width);
      }
    });
    observer.observe(node);
    testimonialObserverRef.current = observer;
  }, []);

  const testimonialTrackRef = useRef<HTMLDivElement>(null);
  const testimonialHoveredRef = useRef(false);

  useEffect(() => {
    async function loadData() {
      try {
        const res = await getHomepageData();
        setData(res);
      } catch (err) {
        console.error("Failed to load homepage content:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Mentors can browse the public site but shouldn't book or contact support
  // from here — they have their own dashboard for that.
  useEffect(() => {
    const cachedRole = localStorage.getItem("tutoboard_user_role_cache");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- seeds state from a synchronous cache read before the async role fetch below resolves
    if (cachedRole) setUserRole(cachedRole);

    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { setUserRole(null); return; }
      supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single()
        .then(({ data: profile }) => {
          if (profile?.role) setUserRole(profile.role);
        });
    });
  }, []);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Validate all fields before sending
    const nameCheck = validateName(formData.fullName);
    if (!nameCheck.valid) { setFormError(nameCheck.error!); return; }

    if (formData.email.trim()) {
      const emailCheck = validateEmail(formData.email);
      if (!emailCheck.valid) { setFormError(emailCheck.error!); return; }
    }

    if (!formData.phone.trim()) { setFormError("Please enter your mobile number."); return; }
    const phoneCheck = validatePhone(formData.phone);
    if (!phoneCheck.valid) { setFormError(phoneCheck.error!); return; }

    const subjectCheck = validateSubject(formData.subject);
    if (!subjectCheck.valid) { setFormError(subjectCheck.error!); return; }

    const messageCheck = validateMessage(formData.message);
    if (!messageCheck.valid) { setFormError(messageCheck.error!); return; }

    setIsSubmittingForm(true);
    try {
      await submitContactMessage({
        fullName: sanitizeText(formData.fullName).trim(),
        email: formData.email.trim(),
        subject: sanitizeText(formData.subject).trim(),
        phone: formData.phone.trim(),
        message: sanitizeText(formData.message).trim(),
      });
      setFormSubmitted(true);
      setFormData({ fullName: "", email: "", subject: "", phone: "", message: "" });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to send message. Please try again.");
    } finally {
      setIsSubmittingForm(false);
    }
  };


  const settings = data?.settings || {
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
    hero_image_url: null as string | null,
  };

  const courses = data?.courses || [];
  const sessions = data?.sessions || [];
  const mentors = data?.mentors || [];
  const testimonials = data?.testimonials || [];

  // JS-driven (not CSS @keyframes) so hovering eases the speed down to 0
  // and back up smoothly, instead of an instantaneous animation-play-state pause.
  useEffect(() => {
    const track = testimonialTrackRef.current;
    if (!track || testimonialCardWidth === null || testimonials.length === 0) return;

    const GAP = 16;
    const singleSetWidth = (testimonialCardWidth + GAP) * testimonials.length;
    const targetSpeed = singleSetWidth / Math.max(testimonials.length * 6, 20); // px/sec at full speed

    let raf: number;
    let last = performance.now();
    let currentSpeed = 0;
    let offset = 0;

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const wantedSpeed = testimonialHoveredRef.current ? 0 : targetSpeed;
      currentSpeed += (wantedSpeed - currentSpeed) * Math.min(1, 3 * dt);
      offset -= currentSpeed * dt;
      if (offset <= -singleSetWidth) offset += singleSetWidth;
      track.style.transform = `translateX(${offset}px)`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [testimonialCardWidth, testimonials.length]);



  const renderHeadline = () => {
    const text = settings.headline;
    const phrase = settings.accented_text;
    if (!phrase || !text.includes(phrase)) {
      return text;
    }
    const parts = text.split(phrase);
    return (
      <>
        {parts[0]}
        <span className="text-secondary">{phrase}</span>
        {parts[1]}
      </>
    );
  };

  return (
    <div className="w-full bg-white text-primary flex-1">
      {/* HERO SECTION */}
      <section className="bg-surface px-6 md:px-12 py-12 lg:py-16 flex items-center justify-center border-b border-border-subtle min-h-[calc(100vh-70px)]">
        <div className={`max-w-7xl mx-auto w-full ${settings.hero_image_url ? "grid grid-cols-1 lg:grid-cols-2 gap-10 items-center" : "max-w-3xl flex flex-col items-center text-center gap-6"}`}>
          <div className={`flex flex-col gap-6 ${settings.hero_image_url ? "items-center lg:items-start text-center lg:text-left" : "items-center text-center"}`}>
            <h1 className="font-heading text-4xl md:text-5xl lg:text-6xl font-extrabold text-primary leading-tight">
              {renderHeadline()}
            </h1>
            <p className="text-sm md:text-base text-text-muted leading-relaxed max-w-[580px]">
              {settings.subheading}
            </p>
            <div className={`flex flex-wrap gap-4 pt-2 ${settings.hero_image_url ? "justify-center lg:justify-start" : "justify-center"}`}>
              <a
                href={settings.primary_link}
                className="text-sm font-semibold px-6 py-3 rounded-lg bg-primary text-white hover:bg-primary/95 hover:shadow-md transition-all cursor-pointer"
              >
                {settings.primary_cta}
              </a>
              <a
                href={settings.secondary_link}
                className="text-sm font-semibold px-6 py-3 rounded-lg bg-transparent text-primary border-2 border-primary hover:bg-primary/5 transition-all cursor-pointer"
              >
                {settings.secondary_cta}
              </a>
            </div>
          </div>

          {settings.hero_image_url && (
            <div className="relative w-full aspect-[4/3] max-w-md mx-auto lg:max-w-none rounded-3xl overflow-hidden shadow-xl border border-border-subtle bg-slate-900">
              <Image
                src={settings.hero_image_url}
                alt="Hero visual"
                fill
                className="object-cover"
              />
            </div>
          )}
        </div>
      </section>

      {/* COUNTERS */}
      <section className="bg-primary px-2 sm:px-6 md:px-12 py-6 sm:py-10 grid grid-cols-4 gap-1 sm:gap-4 md:gap-0">
        <div className="text-center border-r border-white/15 py-1 sm:py-2 px-1">
          <div className="font-heading text-lg sm:text-3xl md:text-4xl font-extrabold text-accent leading-none">
            <AnimatedCounter value={settings.c1} />
          </div>
          <div className="text-[9px] sm:text-xs text-white/70 mt-1 font-medium leading-tight">
            {settings.cl1}
          </div>
        </div>
        <div className="text-center border-r border-white/15 py-1 sm:py-2 px-1">
          <div className="font-heading text-lg sm:text-3xl md:text-4xl font-extrabold text-accent leading-none">
            <AnimatedCounter value={settings.c2} />
          </div>
          <div className="text-[9px] sm:text-xs text-white/70 mt-1 font-medium leading-tight">
            {settings.cl2}
          </div>
        </div>
        <div className="text-center border-r border-white/15 py-1 sm:py-2 px-1">
          <div className="font-heading text-lg sm:text-3xl md:text-4xl font-extrabold text-accent leading-none">
            <AnimatedCounter value={settings.c3} />
          </div>
          <div className="text-[9px] sm:text-xs text-white/70 mt-1 font-medium leading-tight">
            {settings.cl3}
          </div>
        </div>
        <div className="text-center py-1 sm:py-2 px-1">
          <div className="font-heading text-lg sm:text-3xl md:text-4xl font-extrabold text-accent leading-none">
            <AnimatedCounter value={settings.c4} />
          </div>
          <div className="text-[9px] sm:text-xs text-white/70 mt-1 font-medium leading-tight">
            {settings.cl4}
          </div>
        </div>
      </section>

      {/* POPULAR COURSES */}
      <section id="courses" className="py-10 sm:py-16">
        <div className="px-6 md:px-12 max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-6 sm:mb-10 text-left gap-2 sm:gap-4">
            <div>
              <span className="hidden sm:block text-[11px] font-bold text-secondary uppercase tracking-wider mb-1">
                What we offer
              </span>
              <h2 className="font-heading text-2xl sm:text-3xl font-extrabold text-primary">
                Popular courses
              </h2>
              <p className="text-sm text-text-muted mt-1">
                Structured programs taught by verified educators
              </p>
            </div>
            <Link
              href="/courses"
              className="text-xs sm:text-sm font-semibold sm:font-bold text-secondary hover:text-secondary/80 flex items-center gap-1 transition-colors whitespace-nowrap self-start md:self-auto group"
            >
              <span>Explore all courses</span>
              <span className="transition-transform group-hover:translate-x-1 duration-200">➔</span>
            </Link>
          </div>
          {/* MOBILE: single-card peek carousel (md:+ unchanged, see below) */}
          <div className="md:hidden">
            {loading ? (
              <div className="flex gap-3 overflow-x-auto pb-6 snap-x snap-mandatory premium-scrollbar">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="w-[85%] min-w-[85%] snap-center shrink-0 bg-white border border-border-subtle rounded-2xl overflow-hidden animate-pulse">
                    <div className="w-full h-32 bg-slate-100" />
                    <div className="p-3 space-y-2">
                      <div className="h-3.5 bg-slate-200 rounded w-full" />
                      <div className="h-3.5 bg-slate-200 rounded w-2/3" />
                      <div className="flex items-center justify-between pt-0.5">
                        <div className="h-2.5 bg-slate-100 rounded w-16" />
                        <div className="h-2.5 bg-slate-100 rounded w-8" />
                      </div>
                      <div className="h-2.5 bg-slate-100 rounded w-10" />
                      <div className="flex gap-2 pt-1">
                        <div className="flex-1 h-9 bg-slate-200 rounded-lg" />
                        <div className="flex-1 h-9 bg-slate-100 rounded-lg" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : courses.length === 0 ? (
              <div className="text-center py-10 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                <p className="text-sm text-text-muted">No active courses listed currently.</p>
              </div>
            ) : (
              <div className="flex gap-3 overflow-x-auto pb-6 snap-x snap-mandatory premium-scrollbar">
                {courses.map((c) => (
                  <div key={c.id} className="w-[85%] min-w-[85%] snap-center shrink-0 bg-white border border-border-subtle rounded-2xl overflow-hidden hover:shadow-lg transition-shadow flex flex-col justify-between">
                    {/* Image header with subject overlay */}
                    <div className="relative w-full h-32 overflow-hidden bg-slate-100">
                      {c.coverImageUrl ? (
                        <Image src={c.coverImageUrl} alt={c.title} fill className="object-cover" />
                      ) : (
                        <div className={`w-full h-full flex items-center justify-center ${getSubjectBgColor(c.subject)}`}>
                          {getIconComponent(c.iconName)}
                        </div>
                      )}
                      {/* Badges Overlay */}
                      <div className="absolute inset-0 p-2 flex flex-col pointer-events-none">
                        {/* Top Badges */}
                        <div className="flex items-center gap-1 flex-wrap">
                          <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-white/95 text-[#1B3A6B] shadow-xs">
                            {c.subject}
                          </span>
                          {c.class_level && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-900/70 text-white backdrop-blur-xs">
                              {c.class_level}
                            </span>
                          )}
                          <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${
                            c.format === "Recorded"
                              ? "bg-emerald-500 text-white"
                              : c.format === "Live individual"
                              ? "bg-purple-500 text-white"
                              : "bg-orange-500 text-white"
                          }`}>
                            {c.format}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Body details below image */}
                    <div className="p-3 flex-1 flex flex-col justify-between gap-2">
                      <div>
                        <h3 className="font-heading text-sm font-extrabold text-primary leading-snug line-clamp-2 mb-1.5">
                          {c.title}
                        </h3>
                        <div className="flex items-center justify-between text-[10px] text-text-muted mb-1">
                          <span className="truncate max-w-[110px]">By {c.mentor}</span>
                          <span className="font-heading font-extrabold text-primary text-xs shrink-0">
                            ₹{c.price}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 text-[9px] text-text-muted mb-2">
                          <span className="font-bold text-accent flex items-center gap-0.5">
                            <IconStar className="w-3 h-3 fill-accent" /> {c.rating}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setActiveBooking({
                            id: c.id,
                            type: "course",
                            title: c.title,
                            price: c.price,
                            mentorName: c.mentor,
                            isLiveIndividual: c.format === "Live individual"
                          })}
                          className="flex-1 text-xs font-semibold py-3 rounded-lg bg-secondary text-white hover:bg-secondary/90 transition-colors cursor-pointer"
                        >
                          Book
                        </button>
                        <a href={`/courses/${c.id}`} className="flex-1 text-xs font-semibold py-3 rounded-lg bg-transparent text-primary border border-primary hover:bg-primary/5 transition-colors cursor-pointer text-center">
                          Details
                        </a>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* DESKTOP (md:+): original carousel, unchanged */}
          <div className="hidden md:block">
            {loading ? (
              <div className="flex gap-6 overflow-x-auto pb-6 snap-x snap-mandatory premium-scrollbar">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="w-[calc(50%_-_12px)] lg:w-[calc(33.333%_-_16px)] min-w-[calc(50%_-_12px)] lg:min-w-[calc(33.333%_-_16px)] snap-start shrink-0 bg-white border border-border-subtle rounded-2xl overflow-hidden animate-pulse">
                    <div className="w-full h-44 bg-slate-100" />
                    <div className="p-5 space-y-2.5">
                      <div className="flex items-center gap-2">
                        <div className="h-6 w-16 bg-slate-100 rounded-full" />
                        <div className="h-6 w-14 bg-slate-100 rounded-full" />
                        <div className="h-6 w-16 bg-slate-100 rounded-full" />
                      </div>
                      <div className="h-[18px] bg-slate-200 rounded w-full" />
                      <div className="h-3 bg-slate-100 rounded w-1/3" />
                      <div className="flex items-center justify-between pt-1">
                        <div className="h-3.5 bg-slate-100 rounded w-10" />
                        <div className="h-[18px] bg-slate-200 rounded w-16" />
                      </div>
                      <div className="flex gap-3 pt-2">
                        <div className="flex-1 h-9 bg-slate-200 rounded-xl" />
                        <div className="flex-1 h-9 bg-slate-100 rounded-xl" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : courses.length === 0 ? (
              <div className="text-center py-10 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                <p className="text-sm text-text-muted">No active courses listed currently.</p>
              </div>
            ) : (
              <div className="flex gap-6 overflow-x-auto pb-6 snap-x snap-mandatory premium-scrollbar">
                {courses.map((c) => (
                  <div key={c.id} className="w-[calc(50%_-_12px)] lg:w-[calc(33.333%_-_16px)] min-w-[calc(50%_-_12px)] lg:min-w-[calc(33.333%_-_16px)] snap-start shrink-0 bg-white border border-border-subtle rounded-2xl overflow-hidden hover:shadow-lg transition-shadow flex flex-col justify-between">
                    {/* Clean Cover Image Header */}
                    <div className="relative w-full h-44 overflow-hidden bg-slate-900">
                      {c.coverImageUrl ? (
                        <Image src={c.coverImageUrl} alt={c.title} fill className="object-cover" />
                      ) : (
                        <div className={`w-full h-full flex items-center justify-center ${getSubjectBgColor(c.subject)}`}>
                          {getIconComponent(c.iconName)}
                        </div>
                      )}
                    </div>

                    {/* Card Body */}
                    <div className="p-5 flex-1 flex flex-col justify-between gap-4">
                      <div className="space-y-2.5">
                        {/* Badges Row */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-semibold px-3 py-1 rounded-full bg-[#EBF2FF] text-[#1B3A6B]">
                            {c.subject}
                          </span>
                          {c.class_level && (
                            <span className="text-xs font-semibold px-3 py-1 rounded-full bg-slate-100 text-slate-700">
                              {c.class_level}
                            </span>
                          )}
                          <span className={`text-xs font-semibold px-3 py-1 rounded-full ${
                            c.format === "Recorded"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : c.format === "Live individual"
                              ? "bg-purple-50 text-purple-700 border border-purple-200"
                              : "bg-orange-50 text-orange-700 border border-orange-200"
                          }`}>
                            {c.format}
                          </span>
                        </div>

                        {/* Course Title */}
                        <h3 className="font-heading text-base font-extrabold text-primary leading-snug line-clamp-2">
                          {c.title}
                        </h3>

                        {/* Mentor Line */}
                        <p className="text-xs text-text-muted font-medium">
                          Course by {c.mentor}
                        </p>

                        {/* Rating & Price Row */}
                        <div className="flex items-center justify-between pt-1">
                          <span className="font-bold text-amber-500 text-xs flex items-center gap-1">
                            <IconStar className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                            <span>{c.rating}</span>
                          </span>
                          <strong className="font-heading font-extrabold text-primary text-base">
                            ₹{c.price.toLocaleString("en-IN")}
                          </strong>
                        </div>
                      </div>

                      {/* Buttons Row */}
                      <div className="flex gap-3 pt-2">
                        <button
                          onClick={() => setActiveBooking({
                            id: c.id,
                            type: "course",
                            title: c.title,
                            price: c.price,
                            mentorName: c.mentor,
                            isLiveIndividual: c.format === "Live individual"
                          })}
                          className="flex-1 text-xs font-bold py-2.5 rounded-xl bg-secondary text-white hover:bg-secondary/90 transition-all cursor-pointer text-center"
                        >
                          Book now
                        </button>
                        <a 
                          href={`/courses/${c.id}`} 
                          className="flex-1 text-xs font-bold py-2.5 rounded-xl border border-slate-200 text-primary hover:bg-slate-50 transition-all cursor-pointer text-center"
                        >
                          Details
                        </a>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* HOURLY SESSIONS */}
      <section id="sessions" className="bg-surface py-10 sm:py-16">
        <div className="px-6 md:px-12 max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-6 sm:mb-10 text-left gap-2 sm:gap-4">
            <div>
              <span className="hidden sm:block text-[11px] font-bold text-secondary uppercase tracking-wider mb-1">
                Flexible learning
              </span>
              <h2 className="font-heading text-2xl sm:text-3xl font-extrabold text-primary">
                Hourly sessions
              </h2>
              <p className="text-sm text-text-muted mt-1">
                Pay per session — no long-term commitment required
              </p>
            </div>
            <Link
              href="/sessions"
              className="text-xs sm:text-sm font-semibold sm:font-bold text-secondary hover:text-secondary/80 flex items-center gap-1 transition-colors whitespace-nowrap self-start md:self-auto group"
            >
              <span>Explore all sessions</span>
              <span className="transition-transform group-hover:translate-x-1 duration-200">➔</span>
            </Link>
          </div>
          {/* MOBILE: single-card peek carousel (md:+ unchanged, see below) */}
          <div className="md:hidden">
            {loading ? (
              <div className="flex gap-3 overflow-x-auto pb-6 snap-x snap-mandatory premium-scrollbar">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="w-[85%] min-w-[85%] snap-center shrink-0 bg-white border border-border-subtle rounded-2xl overflow-hidden animate-pulse">
                    <div className="w-full h-32 bg-slate-100" />
                    <div className="p-3 space-y-2">
                      <div className="h-3.5 bg-slate-200 rounded w-full" />
                      <div className="h-3.5 bg-slate-200 rounded w-2/3" />
                      <div className="flex items-center justify-between pt-0.5">
                        <div className="h-2.5 bg-slate-100 rounded w-16" />
                        <div className="h-2.5 bg-slate-100 rounded w-8" />
                      </div>
                      <div className="h-2.5 bg-slate-100 rounded w-10" />
                      <div className="flex gap-2 pt-1">
                        <div className="flex-1 h-9 bg-slate-200 rounded-lg" />
                        <div className="flex-1 h-9 bg-slate-100 rounded-lg" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : sessions.length === 0 ? (
              <div className="text-center py-10 bg-white rounded-2xl border border-dashed border-slate-200">
                <p className="text-sm text-text-muted">No active sessions scheduled currently.</p>
              </div>
            ) : (
              <div className="flex gap-3 overflow-x-auto pb-6 snap-x snap-mandatory premium-scrollbar">
                {sessions.map((s) => (
                  <div key={s.id} className="w-[85%] min-w-[85%] snap-center shrink-0 bg-white border border-border-subtle rounded-2xl overflow-hidden hover:shadow-lg transition-shadow flex flex-col justify-between">
                    {/* Image header with subject overlay */}
                    <div className={`relative w-full h-32 overflow-hidden flex items-center justify-center ${getSubjectBgColor(s.subject)}`}>
                      <div className="opacity-40 scale-125">
                        {getIconComponent(s.iconName)}
                      </div>
                      {/* Badges Overlay */}
                      <div className="absolute inset-0 p-2 flex flex-col pointer-events-none">
                        {/* Top Badges */}
                        <div className="flex items-center gap-1 flex-wrap">
                          <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-white/95 text-[#1B3A6B] shadow-xs">
                            {s.subject}
                          </span>
                          {s.class_level && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-900/70 text-white backdrop-blur-xs">
                              {s.class_level}
                            </span>
                          )}
                          <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${
                            s.type === "Group"
                              ? "bg-purple-500 text-white"
                              : "bg-blue-500 text-white"
                          }`}>
                            {s.type}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Body details below image */}
                    <div className="p-3 flex-1 flex flex-col justify-between gap-2">
                      <div>
                        <h3 className="font-heading text-sm font-extrabold text-primary leading-snug line-clamp-2 mb-1.5">
                          {s.title}
                        </h3>
                        <div className="flex items-center justify-between text-[10px] text-text-muted mb-1">
                          <span className="truncate max-w-[110px]">With {s.mentor}</span>
                          <span className="font-heading font-extrabold text-primary text-xs shrink-0">
                            ₹{s.price}/hr
                          </span>
                        </div>
                        <div className="flex items-center gap-1 text-[9px] text-text-muted mb-2">
                          <span className="font-bold text-accent flex items-center gap-0.5">
                            <IconStar className="w-3 h-3 fill-accent" /> 5.0
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setActiveBooking({
                            id: s.id,
                            type: "session",
                            title: s.title,
                            price: s.price,
                            mentorName: s.mentor,
                            isLiveIndividual: s.type === "1-on-1"
                          })}
                          className="flex-1 text-xs font-semibold py-3 rounded-lg bg-secondary text-white hover:bg-secondary/90 transition-colors cursor-pointer"
                        >
                          Book
                        </button>
                        <Link
                          href={`/sessions/${s.id}`}
                          className="flex-1 text-xs font-semibold py-3 rounded-lg bg-transparent text-primary border border-primary hover:bg-primary/5 transition-colors cursor-pointer text-center"
                        >
                          Details
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* DESKTOP (md:+): original carousel, unchanged */}
          <div className="hidden md:block">
            {loading ? (
              <div className="flex gap-6 overflow-x-auto pb-6 snap-x snap-mandatory premium-scrollbar">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="w-[calc(50%_-_12px)] lg:w-[calc(33.333%_-_16px)] min-w-[calc(50%_-_12px)] lg:min-w-[calc(33.333%_-_16px)] snap-start shrink-0 bg-white border border-border-subtle rounded-2xl overflow-hidden animate-pulse">
                    <div className="w-full h-44 bg-slate-100" />
                    <div className="p-5 space-y-2.5">
                      <div className="flex items-center gap-2">
                        <div className="h-6 w-16 bg-slate-100 rounded-full" />
                        <div className="h-6 w-14 bg-slate-100 rounded-full" />
                        <div className="h-6 w-16 bg-slate-100 rounded-full" />
                      </div>
                      <div className="h-[18px] bg-slate-200 rounded w-full" />
                      <div className="h-3 bg-slate-100 rounded w-1/3" />
                      <div className="flex items-center justify-between pt-1">
                        <div className="h-3.5 bg-slate-100 rounded w-10" />
                        <div className="h-[18px] bg-slate-200 rounded w-16" />
                      </div>
                      <div className="flex gap-3 pt-2">
                        <div className="flex-1 h-9 bg-slate-200 rounded-xl" />
                        <div className="flex-1 h-9 bg-slate-100 rounded-xl" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : sessions.length === 0 ? (
              <div className="text-center py-14 bg-white rounded-2xl border border-dashed border-slate-200">
                <p className="text-sm text-text-muted">No active sessions scheduled currently.</p>
              </div>
            ) : (
              <div className="flex gap-6 overflow-x-auto pb-6 snap-x snap-mandatory premium-scrollbar">
                {sessions.map((s) => (
                  <div key={s.id} className="w-[calc(50%_-_12px)] lg:w-[calc(33.333%_-_16px)] min-w-[calc(50%_-_12px)] lg:min-w-[calc(33.333%_-_16px)] snap-start shrink-0 bg-white border border-border-subtle rounded-2xl overflow-hidden hover:shadow-lg transition-shadow flex flex-col justify-between">
                    {/* Cover Image Header */}
                    <div className={`relative w-full h-44 overflow-hidden flex items-center justify-center ${getSubjectBgColor(s.subject)}`}>
                      <div className="opacity-40 scale-125">
                        {getIconComponent(s.iconName)}
                      </div>
                    </div>

                    {/* Card Body */}
                    <div className="p-5 flex-1 flex flex-col justify-between gap-4">
                      <div className="space-y-2.5">
                        {/* Badges Row */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-semibold px-3 py-1 rounded-full bg-[#EBF2FF] text-[#1B3A6B]">
                            {s.subject}
                          </span>
                          {s.class_level && (
                            <span className="text-xs font-semibold px-3 py-1 rounded-full bg-slate-100 text-slate-700">
                              {s.class_level}
                            </span>
                          )}
                          <span className={`text-xs font-semibold px-3 py-1 rounded-full ${
                            s.type === "Group"
                              ? "bg-purple-50 text-purple-700 border border-purple-200"
                              : "bg-blue-50 text-blue-700 border border-blue-200"
                          }`}>
                            {s.type}
                          </span>
                        </div>

                        {/* Session Title */}
                        <h3 className="font-heading text-base font-extrabold text-primary leading-snug line-clamp-2">
                          {s.title}
                        </h3>

                        {/* Mentor Line */}
                        <p className="text-xs text-text-muted font-medium">
                          Led by {s.mentor}
                        </p>

                        {/* Rating & Price Row */}
                        <div className="flex items-center justify-between pt-1">
                          <span className="font-bold text-amber-500 text-xs flex items-center gap-1">
                            <IconStar className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                            <span>5.0</span>
                          </span>
                          <strong className="font-heading font-extrabold text-primary text-base">
                            ₹{s.price.toLocaleString("en-IN")}/hr
                          </strong>
                        </div>
                      </div>

                      {/* Buttons Row */}
                      <div className="flex gap-3 pt-2">
                        <button
                          onClick={() => setActiveBooking({
                            id: s.id,
                            type: "session",
                            title: s.title,
                            price: s.price,
                            mentorName: s.mentor,
                            isLiveIndividual: s.type === "1-on-1"
                          })}
                          className="flex-1 text-xs font-bold py-2.5 rounded-xl bg-secondary text-white hover:bg-secondary/90 transition-all cursor-pointer text-center"
                        >
                          Book now
                        </button>
                        <Link 
                          href={`/sessions/${s.id}`} 
                          className="flex-1 text-xs font-bold py-2.5 rounded-xl border border-slate-200 text-primary hover:bg-slate-50 transition-all cursor-pointer text-center"
                        >
                          Details
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* TOP MENTORS */}
      <section id="mentors" className="py-10 sm:py-16">
        <div className="px-6 md:px-12 max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-6 sm:mb-10 text-left gap-2 sm:gap-4">
            <div>
              <span className="hidden sm:block text-[11px] font-bold text-secondary uppercase tracking-wider mb-1">
                Meet the team
              </span>
              <h2 className="font-heading text-2xl sm:text-3xl font-extrabold text-primary">
                Our top mentors
              </h2>
              <p className="text-sm text-text-muted mt-1">
                Verified experts with proven teaching track records
              </p>
            </div>
            <Link
              href="/mentors"
              className="text-xs sm:text-sm font-semibold sm:font-bold text-secondary hover:text-secondary/80 flex items-center gap-1 transition-colors whitespace-nowrap self-start md:self-auto group"
            >
              <span>Explore all mentors</span>
              <span className="transition-transform group-hover:translate-x-1 duration-200">➔</span>
            </Link>
          </div>
          {/* MOBILE: single-card peek carousel (md:+ unchanged, see below) */}
          <div className="md:hidden">
            {loading ? (
              <div className="flex gap-3 overflow-x-auto pb-6 snap-x snap-mandatory premium-scrollbar">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="w-[85%] min-w-[85%] snap-center shrink-0 bg-white border border-border-subtle rounded-2xl overflow-hidden animate-pulse">
                    <div className="w-full h-32 bg-blue-50 flex items-center justify-center">
                      <div className="w-16 h-16 rounded-full bg-slate-200" />
                    </div>
                    <div className="p-3 space-y-2">
                      <div className="h-3.5 bg-slate-200 rounded w-full" />
                      <div className="h-3.5 bg-slate-200 rounded w-2/3" />
                      <div className="flex items-center justify-between pt-0.5">
                        <div className="h-2.5 bg-slate-100 rounded w-16" />
                        <div className="h-2.5 bg-slate-100 rounded w-8" />
                      </div>
                      <div className="h-2.5 bg-slate-100 rounded w-10" />
                      <div className="flex gap-2 pt-1">
                        <div className="flex-1 h-9 bg-slate-200 rounded-lg" />
                        <div className="flex-1 h-9 bg-slate-100 rounded-lg" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : mentors.length === 0 ? (
              <div className="text-center py-10 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                <p className="text-sm text-text-muted">No mentors available at the moment.</p>
              </div>
            ) : (
              <div className="flex gap-3 overflow-x-auto pb-6 snap-x snap-mandatory premium-scrollbar">
                {mentors.map((m) => (
                  <div key={m.id} className="w-[85%] min-w-[85%] snap-center shrink-0 bg-white border border-border-subtle rounded-2xl overflow-hidden hover:shadow-lg transition-shadow flex flex-col justify-between">
                    {/* Avatar panel */}
                    <a href={`/mentors/${m.id}`} className="relative w-full h-32 bg-blue-50 flex items-center justify-center hover:bg-blue-100/70 transition-colors">
                      <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center font-heading text-xl font-extrabold text-accent">
                        {m.avatarText}
                      </div>
                      <span className="absolute top-2 left-2 inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded bg-white/95 text-blue-700 shadow-xs">
                        Verified
                      </span>
                    </a>

                    {/* Body details below avatar panel */}
                    <div className="p-3 flex-1 flex flex-col justify-between gap-2">
                      <div>
                        <h3 className="font-heading text-sm font-extrabold text-primary leading-snug line-clamp-1 mb-1 hover:text-secondary transition-colors">
                          <a href={`/mentors/${m.id}`}>{m.name}</a>
                        </h3>
                        <div className="flex items-center justify-between text-[10px] text-text-muted mb-1">
                          <span className="truncate max-w-[110px] font-semibold text-secondary">{m.subject}</span>
                        </div>
                        <div className="flex items-center gap-1 text-[9px] text-text-muted mb-2">
                          <span className="font-bold text-accent flex items-center gap-0.5">
                            <IconStar className="w-3 h-3 fill-accent" /> {m.rating}
                          </span>
                        </div>
                      </div>
                      <a href={`/mentors/${m.id}`} className="block w-full text-xs font-semibold py-3 rounded-lg bg-secondary text-white hover:bg-secondary/90 transition-colors cursor-pointer text-center">
                        Details
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* DESKTOP (md:+): original horizontal avatar-left carousel, unchanged */}
          <div className="hidden md:block">
            {loading ? (
              <div className="grid grid-flow-col grid-rows-2 gap-6 overflow-x-auto pb-6 snap-x snap-mandatory premium-scrollbar auto-cols-[calc(50%-12px)]">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="bg-white border border-border-subtle rounded-2xl overflow-hidden flex flex-row animate-pulse snap-start shrink-0">
                    <div className="w-[130px] bg-blue-50 flex items-center justify-center p-6">
                      <div className="w-20 h-20 rounded-full bg-slate-200" />
                    </div>
                    <div className="p-6 flex-1 flex flex-col gap-3">
                      <div className="flex items-center gap-2">
                        <div className="h-4 bg-slate-200 rounded w-32" />
                        <div className="h-4 bg-blue-100 rounded w-14" />
                      </div>
                      <div className="h-3.5 bg-slate-100 rounded w-24" />
                      <div className="h-3 bg-slate-100 rounded w-full" />
                      <div className="h-3 bg-slate-100 rounded w-4/5" />
                      <div className="flex items-center gap-4 border-t border-border-subtle pt-3 mt-auto">
                        <div className="h-3.5 bg-slate-100 rounded w-16" />
                        <div className="h-3.5 bg-slate-100 rounded w-16" />
                        <div className="h-3.5 bg-slate-200 rounded w-14" />
                        <div className="ml-auto h-9 bg-slate-200 rounded-lg w-20" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : mentors.length === 0 ? (
              <div className="text-center py-10 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                <p className="text-sm text-text-muted">No mentors available at the moment.</p>
              </div>
            ) : (
              <div className="grid grid-flow-col grid-rows-2 gap-6 overflow-x-auto pb-6 snap-x snap-mandatory premium-scrollbar auto-cols-[calc(50%-12px)]">
                {mentors.map((m) => (
                  <div key={m.id} className="bg-white border border-border-subtle rounded-2xl overflow-hidden flex flex-row hover:shadow-md transition-shadow snap-start shrink-0">
                    <a href={`/mentors/${m.id}`} className="w-[130px] bg-blue-50 flex items-center justify-center p-6 hover:bg-blue-100/70 transition-colors">
                      <div className="w-20 h-20 rounded-full bg-primary flex items-center justify-center font-heading text-2xl font-extrabold text-accent">
                        {m.avatarText}
                      </div>
                    </a>
                    <div className="p-6 flex-1 flex flex-col justify-between">
                      <div>
                        <h3 className="font-heading text-base font-bold text-primary flex items-center gap-1.5 hover:text-secondary transition-colors">
                          <a href={`/mentors/${m.id}`}>{m.name}</a>
                          <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-150 shrink-0">
                            Verified
                          </span>
                        </h3>
                        <p className="text-xs text-secondary font-semibold mb-2">
                          {m.subject}
                        </p>
                        <p className="text-xs text-text-muted leading-relaxed mb-4 line-clamp-2">
                          {m.bio || `${m.qualification} with ${m.experience} years of teaching expertise.`}
                        </p>
                      </div>
                      <div className="flex items-center gap-4 text-xs border-t border-border-subtle pt-3 text-text-muted">
                        <div>
                          <strong className="text-primary font-bold">★ {m.rating}</strong> rating
                        </div>
                        <a
                          href={`/mentors/${m.id}`}
                          className="ml-auto text-xs font-semibold px-4 py-2.5 rounded-lg bg-transparent text-primary border border-primary hover:bg-primary/5 transition-colors cursor-pointer text-center shrink-0"
                        >
                          Details
                        </a>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="bg-surface py-10 sm:py-16">
        <div className="px-6 md:px-12 max-w-7xl mx-auto">
          <div className="mb-6 sm:mb-10 text-left">
            <span className="hidden sm:block text-[11px] font-bold text-secondary uppercase tracking-wider mb-1">
              Student stories
            </span>
            <h2 className="font-heading text-2xl sm:text-3xl font-extrabold text-primary">
              What our students say
            </h2>
            <p className="text-sm text-text-muted mt-1">
              Real results from real learners
            </p>
          </div>
          {/* MOBILE: text-forward, manual swipe carousel (md:+ unchanged, see below) */}
          <div className="md:hidden">
            {loading ? (
              <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory premium-scrollbar">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="w-[85%] min-w-[85%] snap-center shrink-0 bg-white border border-border-subtle rounded-2xl p-4 space-y-3 animate-pulse">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-full bg-slate-200 flex-shrink-0" />
                      <div className="space-y-1.5 flex-1">
                        <div className="h-3 bg-slate-200 rounded w-24" />
                        <div className="h-2.5 bg-slate-100 rounded w-16" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="h-3 bg-slate-100 rounded w-full" />
                      <div className="h-3 bg-slate-100 rounded w-4/5" />
                    </div>
                  </div>
                ))}
              </div>
            ) : testimonials.length === 0 ? (
              <div className="text-center py-10 bg-white rounded-2xl border border-dashed border-slate-200">
                <p className="text-sm text-text-muted">No testimonials to show.</p>
              </div>
            ) : (
              <div className="overflow-hidden">
                <div className="animate-marquee flex gap-3">
                  {[...testimonials, ...testimonials, ...testimonials].map((t, idx: number) => (
                    <button
                      type="button"
                      key={`${t.id}-${idx}`}
                      onClick={() => setActiveReviewIndex(idx % testimonials.length)}
                      className={`relative w-[220px] h-[260px] shrink-0 border border-border-subtle rounded-2xl overflow-hidden text-left cursor-pointer active:scale-[0.98] transition-transform ${!t.media_url ? "bg-gradient-to-br from-[#EAF2FF] to-[#F5F8FF]" : "bg-[#0f2347]"}`}
                    >
                      {/* Media fills the card; fallback is a light on-brand tint */}
                      {t.media_url ? (
                        t.media_type === "video" ? (
                          <video src={t.media_url} className="absolute inset-0 w-full h-full object-cover" muted preload="metadata" />
                        ) : (
                          <Image src={t.media_url} alt={t.student_name} fill className="object-cover" />
                        )
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="font-heading text-6xl font-extrabold leading-none text-[#1B3A6B]/10">
                            &ldquo;
                          </span>
                        </div>
                      )}

                      {t.media_type === "video" && t.media_url && (
                        <span className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/90 flex items-center justify-center shadow-md">
                          <IconPlayerPlayFilled className="w-3.5 h-3.5 text-primary ml-0.5" />
                        </span>
                      )}

                      {/* Text overlay on top of image/video */}
                      <div className={`absolute inset-0 flex flex-col justify-end p-3.5 ${t.media_url ? "bg-gradient-to-t from-[#0f2347]/90 via-[#0f2347]/50 to-transparent" : ""}`}>
                        <p className={`text-xs leading-relaxed line-clamp-3 mb-2.5 ${t.media_url ? "text-white drop-shadow-sm" : "text-[#1B3A6B]"}`}>
                          {t.quote}
                        </p>
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold font-heading shrink-0 ring-2 ${t.media_url ? "text-white ring-white/40" : "text-white ring-white/60"}`}
                            style={{ backgroundColor: t.avatar_bg || "#1B3A6B" }}
                          >
                            {t.avatar_text}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className={`text-[11px] font-semibold truncate ${t.media_url ? "text-white" : "text-[#1B3A6B]"}`}>{t.student_name}</p>
                            <p className={`text-[9px] truncate ${t.media_url ? "text-white/70" : "text-[#1B3A6B]/60"}`}>{t.role}</p>
                          </div>
                          <div className="flex items-center gap-0.5 text-accent shrink-0">
                            <IconStar className="w-3 h-3 fill-accent" />
                            <span className={`text-[10px] font-bold ${t.media_url ? "text-white" : "text-[#1B3A6B]"}`}>{t.rating ?? 5}</span>
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* DESKTOP (md:+): auto-scrolling marquee with compact overlay cards matching mobile UI style */}
          <div className="hidden md:block">
            {loading ? (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-[260px] bg-white border border-border-subtle rounded-2xl overflow-hidden animate-pulse p-4 flex flex-col justify-end space-y-3">
                    <div className="h-3 bg-slate-200 rounded w-full" />
                    <div className="h-3 bg-slate-200 rounded w-4/5" />
                    <div className="flex items-center gap-2.5 pt-2">
                      <div className="w-7 h-7 rounded-full bg-slate-200 shrink-0" />
                      <div className="space-y-1.5 flex-1">
                        <div className="h-3 bg-slate-200 rounded w-20" />
                        <div className="h-2.5 bg-slate-100 rounded w-14" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : testimonials.length === 0 ? (
              <div className="text-center py-10 bg-white rounded-2xl border border-dashed border-slate-200">
                <p className="text-sm text-text-muted">No testimonials to show.</p>
              </div>
            ) : (
              <div
                ref={marqueeViewportRef}
                className="overflow-hidden"
                style={{ visibility: testimonialCardWidth === null ? "hidden" : "visible" }}
                onMouseEnter={() => { testimonialHoveredRef.current = true; }}
                onMouseLeave={() => { testimonialHoveredRef.current = false; }}
              >
                <div
                  ref={testimonialTrackRef}
                  className="flex w-max gap-4"
                >
                  {[...testimonials, ...testimonials].map((t, idx: number) => (
                    <button
                      type="button"
                      key={`${t.id}-${idx}`}
                      onClick={() => setActiveReviewIndex(idx % testimonials.length)}
                      className={`relative h-[260px] shrink-0 border border-border-subtle rounded-2xl overflow-hidden text-left cursor-pointer active:scale-[0.98] transition-transform hover:shadow-lg ${!t.media_url ? "bg-gradient-to-br from-[#EAF2FF] to-[#F5F8FF]" : "bg-[#0f2347]"}`}
                      style={{ width: testimonialCardWidth ?? 230 }}
                    >
                      {/* Media fills the card; fallback is a light on-brand tint */}
                      {t.media_url ? (
                        t.media_type === "video" ? (
                          <video src={t.media_url} className="absolute inset-0 w-full h-full object-cover" muted preload="metadata" />
                        ) : (
                          <Image src={t.media_url} alt={t.student_name} fill className="object-cover" />
                        )
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="font-heading text-6xl font-extrabold leading-none text-[#1B3A6B]/10">
                            &ldquo;
                          </span>
                        </div>
                      )}

                      {t.media_type === "video" && t.media_url && (
                        <span className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/90 flex items-center justify-center shadow-md">
                          <IconPlayerPlayFilled className="w-3.5 h-3.5 text-primary ml-0.5" />
                        </span>
                      )}

                      {/* Text overlay on top of image/video */}
                      <div className={`absolute inset-0 flex flex-col justify-end p-4 ${t.media_url ? "bg-gradient-to-t from-[#0f2347]/95 via-[#0f2347]/50 to-transparent" : ""}`}>
                        <p className={`text-xs leading-relaxed line-clamp-3 mb-3 ${t.media_url ? "text-white drop-shadow-sm" : "text-[#1B3A6B]"}`}>
                          {t.quote}
                        </p>
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold font-heading shrink-0 ring-2 ${t.media_url ? "text-white ring-white/40" : "text-white ring-white/60"}`}
                            style={{ backgroundColor: t.avatar_bg || "#1B3A6B" }}
                          >
                            {t.avatar_text}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className={`text-[11px] font-semibold truncate ${t.media_url ? "text-white" : "text-[#1B3A6B]"}`}>{t.student_name}</p>
                            <p className={`text-[9px] truncate ${t.media_url ? "text-white/70" : "text-[#1B3A6B]/60"}`}>{t.role}</p>
                          </div>
                          <div className="flex items-center gap-0.5 text-accent shrink-0">
                            <IconStar className="w-3 h-3 fill-accent" />
                            <span className={`text-[10px] font-bold ${t.media_url ? "text-white" : "text-[#1B3A6B]"}`}>{t.rating ?? 5}</span>
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* REVIEW DETAIL MODAL */}
      {activeReviewIndex !== null && testimonials[activeReviewIndex] && (() => {
        const t = testimonials[activeReviewIndex];
        const total = testimonials.length;
        const goPrev = () => setActiveReviewIndex((i) => (i === null ? null : (i - 1 + total) % total));
        const goNext = () => setActiveReviewIndex((i) => (i === null ? null : (i + 1) % total));
        return (
          <div
            onClick={() => setActiveReviewIndex(null)}
            className="fixed inset-0 bg-primary/70 backdrop-blur-xs z-[999] flex items-center justify-center p-4"
          >
            <div className="relative max-w-lg w-full bg-white rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => setActiveReviewIndex(null)}
                className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-black/30 hover:bg-black/50 flex items-center justify-center text-white cursor-pointer"
              >
                <IconX className="w-4 h-4" />
              </button>

              {t.media_url ? (
                <div className="relative w-full aspect-[4/3] max-h-[60vh] bg-slate-900 flex items-center justify-center overflow-hidden">
                  {t.media_type === "video" ? (
                    <video src={t.media_url} className="max-h-[60vh] w-full h-full object-contain" controls autoPlay />
                  ) : (
                    <Image src={t.media_url} alt={t.student_name} fill className="object-contain" />
                  )}
                </div>
              ) : (
                <div
                  className="w-full h-24 flex items-center justify-center"
                  style={{ backgroundColor: `${t.avatar_bg || "#1B3A6B"}14` }}
                >
                  <span className="font-heading text-5xl font-extrabold leading-none" style={{ color: t.avatar_bg || "#1B3A6B" }}>
                    &ldquo;
                  </span>
                </div>
              )}

              <div className="p-6">
                <p className="text-sm text-text-muted leading-relaxed mb-5">
                  {t.quote}
                </p>
                <div className="flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white font-heading shrink-0"
                    style={{ backgroundColor: t.avatar_bg || "#1B3A6B" }}
                  >
                    {t.avatar_text}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-primary truncate">{t.student_name}</p>
                    <p className="text-xs text-text-muted truncate">{t.role}</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between px-6 pb-6">
                <button
                  onClick={goPrev}
                  className="text-xs font-semibold px-4 py-2 rounded-lg border border-primary text-primary hover:bg-primary/5 transition-colors cursor-pointer flex items-center gap-1"
                >
                  <span aria-hidden>‹</span> Previous
                </button>
                <span className="text-xs text-text-muted font-medium">
                  {activeReviewIndex + 1} / {total}
                </span>
                <button
                  onClick={goNext}
                  className="text-xs font-semibold px-4 py-2 rounded-lg bg-secondary text-white hover:bg-secondary/90 transition-colors cursor-pointer flex items-center gap-1"
                >
                  Next <span aria-hidden>›</span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* CONTACT FORM */}
      <section id="about" className="bg-primary text-white py-16">
        <div className="px-6 md:px-12 max-w-3xl mx-auto">
          <h2 className="font-heading text-2xl md:text-3xl font-extrabold mb-2 text-white">
            Get in touch
          </h2>
          <p className="text-xs md:text-sm text-white/65 mb-8">
            Have a question or want to book a trial session? We&apos;ll get back to you within 24 hours.
          </p>

          {userRole === "mentor" ? (
            <div className="bg-white/10 border border-white/20 rounded-2xl p-8 text-center animate-fade-in">
              <h3 className="font-heading text-lg font-bold text-white mb-2">
                Not available for mentor accounts
              </h3>
              <p className="text-sm text-white/70 max-w-sm mx-auto">
                This contact form is for prospective students and parents. Need help with your mentor account? Reach out from your{" "}
                <Link href="/mentor/messages" className="text-accent font-semibold hover:underline">
                  mentor dashboard
                </Link>{" "}
                instead.
              </p>
            </div>
          ) : formSubmitted ? (
            <div className="bg-white/10 border border-white/20 rounded-2xl p-8 text-center animate-fade-in">
              <h3 className="font-heading text-xl font-bold text-accent mb-2">
                Thank you!
              </h3>
              <p className="text-sm text-white/80">
                Your message has been sent successfully. Our support team will reach out to you shortly.
              </p>
              <button
                onClick={() => setFormSubmitted(false)}
                className="mt-6 text-xs font-semibold px-5 py-2.5 rounded-lg bg-accent text-primary hover:bg-accent/90 transition-colors cursor-pointer"
              >
                Send another message
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {formError && (
                <div className="bg-red-500/20 border border-red-500/40 rounded-lg p-3 text-xs text-red-200">
                  {formError}
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-white/75 uppercase tracking-wider">
                    Full name
                  </label>
                  <input
                    name="fullName"
                    value={formData.fullName}
                    onChange={handleInputChange}
                    required
                    className="font-sans text-sm p-3 rounded-lg border border-white/25 bg-white/10 text-white outline-none focus:border-accent/50 focus:bg-white/15 transition-all"
                    type="text"
                    placeholder="Your name"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-white/75 uppercase tracking-wider">
                    Email address (optional)
                  </label>
                  <input
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    className="font-sans text-sm p-3 rounded-lg border border-white/25 bg-white/10 text-white outline-none focus:border-accent/50 focus:bg-white/15 transition-all"
                    type="email"
                    placeholder="Your Email Address"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-white/75 uppercase tracking-wider">
                    Subject
                  </label>
                  <input
                    name="subject"
                    value={formData.subject}
                    onChange={handleInputChange}
                    required
                    className="font-sans text-sm p-3 rounded-lg border border-white/25 bg-white/10 text-white outline-none focus:border-accent/50 focus:bg-white/15 transition-all"
                    type="text"
                    placeholder="e.g. JEE Maths tutoring"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-white/75 uppercase tracking-wider">
                    Mobile number
                  </label>
                  <input
                    name="phone"
                    value={formData.phone}
                    onChange={handleInputChange}
                    required
                    className="font-sans text-sm p-3 rounded-lg border border-white/25 bg-white/10 text-white outline-none focus:border-accent/50 focus:bg-white/15 transition-all"
                    type="tel"
                    placeholder="Your Mobile Number"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-white/75 uppercase tracking-wider">
                  Message
                </label>
                <textarea
                  name="message"
                  value={formData.message}
                  onChange={handleInputChange}
                  required
                  rows={4}
                  className="font-sans text-sm p-3 rounded-lg border border-white/25 bg-white/10 text-white outline-none focus:border-accent/50 focus:bg-white/15 transition-all resize-none"
                  placeholder="Tell us what you need help with..."
                />
              </div>
              <button
                type="submit"
                disabled={isSubmittingForm}
                className="text-xs font-bold px-8 py-3.5 rounded-lg bg-accent text-primary hover:bg-accent/95 hover:shadow-lg transition-all cursor-pointer mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmittingForm ? "Sending..." : "Send message"}
              </button>
            </form>
          )}
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-[#0f2347] text-white py-12">
        <div className="px-6 md:px-12 max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8 mb-12">
            <div className="lg:col-span-2">
              <div className="flex items-center gap-2 mb-3">
                <Image src="/logo.png" alt="Gadha Online" width={40} height={40} className="w-10 h-10 object-contain" />
                <span className="font-heading text-xl font-extrabold text-white">Gadha Online</span>
              </div>
              <p className="text-xs text-white/50 leading-relaxed max-w-[280px]">
                India&apos;s most trusted online tutoring platform. Learn at your pace, with the best mentors.
              </p>
            </div>
            <div>
              <div className="text-[10px] font-bold text-accent uppercase tracking-wider mb-4">
                Company
              </div>
              <ul className="space-y-2.5 text-xs text-white/60">
                <li>
                  <a href="/about" className="hover:text-white transition-colors">
                    About us
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <div className="text-[10px] font-bold text-accent uppercase tracking-wider mb-4">
                Explore
              </div>
              <ul className="space-y-2.5 text-xs text-white/60">
                <li>
                  <Link href="/courses" className="hover:text-white transition-colors">
                    Courses
                  </Link>
                </li>
                <li>
                  <Link href="/sessions" className="hover:text-white transition-colors">
                    Sessions
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <div className="text-[10px] font-bold text-accent uppercase tracking-wider mb-4">
                Legal
              </div>
              <ul className="space-y-2.5 text-xs text-white/60">
                <li>
                  <a href="/privacy" className="hover:text-white transition-colors">
                    Privacy Policy
                  </a>
                </li>
                <li>
                  <a href="/terms" className="hover:text-white transition-colors">
                    Terms &amp; Conditions
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="border-t border-white/10 pt-8 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-white/40">
            <p>&copy; 2026 Gadha Online. All rights reserved.</p>
            <div className="flex gap-4">
              <a href="#" className="hover:text-white transition-colors">
                <IconBrandInstagram className="w-5 h-5" />
              </a>
              <a href="#" className="hover:text-white transition-colors">
                <IconBrandTwitter className="w-5 h-5" />
              </a>
              <a href="#" className="hover:text-white transition-colors">
                <IconBrandLinkedin className="w-5 h-5" />
              </a>
              <a href="#" className="hover:text-white transition-colors">
                <IconBrandYoutube className="w-5 h-5" />
              </a>
            </div>
          </div>
        </div>
      </footer>
      {activeBooking && (
        <BookingModal
          isOpen={!!activeBooking}
          onClose={() => setActiveBooking(null)}
          targetId={activeBooking.id}
          targetType={activeBooking.type}
          title={activeBooking.title}
          price={activeBooking.price}
          mentorName={activeBooking.mentorName}
          isLiveIndividual={!!activeBooking.isLiveIndividual}
        />
      )}
    </div>
  );
}
