"use client";

import { useEffect, useState } from "react";
import {
  IconFiles, IconFileTypePdf, IconPhoto, IconLink,
  IconDownload, IconPlus, IconTrash, IconLoader, IconX, IconExternalLink
} from "@tabler/icons-react";
import {
  getMentorResources,
  getMentorStudents,
  getMentorCourseOptions,
  createResource,
  deleteResource,
  uploadResourceFile
} from "@/app/actions";

type Resource = Awaited<ReturnType<typeof getMentorResources>>[number];
type StudentInfo = Awaited<ReturnType<typeof getMentorStudents>>[number];
type CourseOption = Awaited<ReturnType<typeof getMentorCourseOptions>>[number];

const ICON_MAP = {
  pdf:   { icon: IconFileTypePdf, bg: "#fee2e2", color: "#E24B4A" },
  document:   { icon: IconFiles,       bg: "#dbeafe", color: "#2F7FE8" },
  image: { icon: IconPhoto,       bg: "#dcfce7", color: "#0F6E56" },
  link:  { icon: IconLink,        bg: "#ede9fe", color: "#534AB7" },
};

function ResourcesSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="bg-white rounded-2xl border border-[#D0DCF5] p-4 flex items-center gap-3 animate-pulse">
          <div className="h-10 w-10 rounded-xl bg-slate-100 shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-40 bg-slate-100 rounded" />
            <div className="h-2.5 w-24 bg-slate-100 rounded" />
          </div>
          <div className="h-8 w-20 bg-slate-100 rounded-lg" />
        </div>
      ))}
    </div>
  );
}

export default function MentorResourcesPage() {
  const [loading, setLoading] = useState(true);
  const [resources, setResources] = useState<Resource[]>([]);
  const [students, setStudents] = useState<StudentInfo[]>([]);
  const [courses, setCourses] = useState<CourseOption[]>([]);

  // Modal State
  const [isOpen, setIsOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [form, setForm] = useState({
    name: "",
    type: "document" as "pdf" | "video" | "link" | "document",
    subject: "",
    url: "",
    size: "",
    studentId: "",
    courseId: "",
  });

  const loadData = async () => {
    try {
      const [r, s, c] = await Promise.all([
        getMentorResources(),
        getMentorStudents(),
        getMentorCourseOptions(),
      ]);
      setResources(r || []);
      setStudents(s || []);
      setCourses(c || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- deliberate fetch-on-mount; setState fires after the awaited request resolves, not synchronously
    loadData();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      let url = form.url;
      let size = form.size;

      if (form.type !== "link") {
        if (!selectedFile) {
          alert("Please choose a file to upload");
          setSubmitting(false);
          return;
        }
        const fd = new FormData();
        fd.set("file", selectedFile);
        const { publicUrl } = await uploadResourceFile(fd);
        url = publicUrl;
        size = `${(selectedFile.size / (1024 * 1024)).toFixed(1)} MB`;
      }

      await createResource({
        name: form.name,
        type: form.type,
        subject: form.subject,
        url,
        size: size || undefined,
        studentId: form.studentId || undefined,
        courseId: form.courseId || undefined,
      });
      setIsOpen(false);
      loadData();
    } catch (e) {
      console.error(e);
      alert("Failed to publish resource");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteResource = async (resourceId: string) => {
    if (!confirm("Are you sure you want to delete this resource?")) return;
    try {
      await deleteResource(resourceId);
      loadData();
    } catch (e) {
      console.error(e);
      alert("Failed to delete resource");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-extrabold font-heading text-[#1B3A6B]">Study Resources</h1>
          <p className="text-[13px] text-[#4A5A7A] mt-0.5">Publish worksheets, textbook PDFs, links, or documents for your students.</p>
        </div>
        <button
          onClick={() => {
            setForm({
              name: "",
              type: "document",
              subject: "",
              url: "",
              size: "",
              studentId: "",
              courseId: "",
            });
            setSelectedFile(null);
            setIsOpen(true);
          }}
          className="inline-flex items-center gap-1.5 text-xs font-bold px-4 py-2.5 rounded-xl bg-[#2F7FE8] text-white hover:bg-[#1B3A6B] hover:shadow-md transition-all cursor-pointer focus:outline-none"
        >
          <IconPlus className="w-4 h-4" /> Add Resource
        </button>
      </div>

      {/* List */}
      {loading ? (
        <ResourcesSkeleton />
      ) : resources.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center bg-white rounded-2xl border border-dashed border-[#D0DCF5]">
          <IconFiles className="w-10 h-10 text-[#D0DCF5]" />
          <h2 className="text-[15px] font-extrabold font-heading text-[#1B3A6B]">No Resources Published</h2>
          <p className="text-[13px] text-[#4A5A7A] max-w-xs">
            Start sharing worksheets, note links, or PDFs with your students.
          </p>
          <button
            onClick={() => setIsOpen(true)}
            className="mt-2 text-[11px] font-bold text-[#2F7FE8] hover:underline"
          >
            Add one now
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {resources.map((r) => {
            // Find appropriate icon configuration
            // Match schema types: pdf, video, link, document
            const typeKey = r.type === "pdf" ? "pdf" : r.type === "link" ? "link" : "document";
            const { icon: Icon, bg, color } = ICON_MAP[typeKey] ?? ICON_MAP.document;
            const dateStr = new Date(r.created_at).toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
              year: "numeric",
            });

            return (
              <div key={r.id} className="flex items-center justify-between p-4 bg-white rounded-2xl border border-[#D0DCF5] hover:shadow-sm transition-shadow gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: bg }}>
                    <Icon className="w-5 h-5" style={{ color }} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13px] font-bold text-[#1B3A6B] truncate">{r.name}</p>
                    <p className="text-[11px] text-[#4A5A7A] mt-0.5">
                      {r.subject} · {r.courseName || r.studentName} · {dateStr}
                    </p>
                    {r.size && <p className="text-[10px] text-[#9BA8C0] mt-0.5">{r.size}</p>}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-3 py-2 rounded-lg bg-[#F5F8FF] border border-[#D0DCF5] text-[#4A5A7A] hover:border-[#2F7FE8] hover:text-[#2F7FE8] transition-colors"
                  >
                    {r.type === "link" ? (
                      <>Open <IconExternalLink className="w-3.5 h-3.5" /></>
                    ) : (
                      <>Download <IconDownload className="w-3.5 h-3.5" /></>
                    )}
                  </a>

                  <button
                    onClick={() => handleDeleteResource(r.id)}
                    title="Delete Resource"
                    className="w-8 h-8 rounded-lg border border-red-100 flex items-center justify-center text-red-500 hover:bg-red-50 cursor-pointer"
                  >
                    <IconTrash className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CREATE MODAL */}
      {isOpen && (
        <div className="fixed inset-0 bg-[#0f2347]/30 backdrop-blur-xs flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-white rounded-3xl border border-[#D0DCF5] shadow-2xl p-6 w-full max-w-md mx-4 animate-scale-up">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[15px] font-extrabold font-heading text-[#1B3A6B]">Add Resource</h3>
              <button
                onClick={() => setIsOpen(false)}
                className="w-8 h-8 rounded-full border border-slate-100 flex items-center justify-center hover:bg-slate-50 cursor-pointer"
              >
                <IconX className="w-4 h-4 text-[#9BA8C0]" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Target Student */}
              <div>
                <label className="block text-[11px] font-bold text-[#1B3A6B] uppercase tracking-wider mb-1.5">
                  Available To
                </label>
                <select
                  value={form.studentId}
                  onChange={(e) => setForm({ ...form, studentId: e.target.value })}
                  className="w-full text-[13px] px-3.5 py-2.5 rounded-xl border border-[#D0DCF5] bg-white text-[#1B3A6B] focus:outline-none focus:border-[#2F7FE8] font-semibold"
                >
                  <option value="">All Students (default)</option>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.subject})
                    </option>
                  ))}
                </select>
              </div>

              {/* Target Course */}
              <div>
                <label className="block text-[11px] font-bold text-[#1B3A6B] uppercase tracking-wider mb-1.5">
                  Course (Optional)
                </label>
                <select
                  value={form.courseId}
                  onChange={(e) => setForm({ ...form, courseId: e.target.value })}
                  className="w-full text-[13px] px-3.5 py-2.5 rounded-xl border border-[#D0DCF5] bg-white text-[#1B3A6B] focus:outline-none focus:border-[#2F7FE8] font-semibold"
                >
                  <option value="">Not tied to a specific course</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-[#9BA8C0] mt-1">
                  Scope this material to only the students enrolled in this course.
                </p>
              </div>

              {/* Resource Name */}
              <div>
                <label className="block text-[11px] font-bold text-[#1B3A6B] uppercase tracking-wider mb-1.5">
                  Resource Name / Title
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Chapter 4 - Integration Notes"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full text-[13px] px-3.5 py-2.5 rounded-xl border border-[#D0DCF5] text-[#1B3A6B] focus:outline-none focus:border-[#2F7FE8] font-semibold"
                />
              </div>

              {/* Type */}
              <div>
                <label className="block text-[11px] font-bold text-[#1B3A6B] uppercase tracking-wider mb-1.5">
                  Resource Type
                </label>
                <select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value as "pdf" | "video" | "link" | "document" })}
                  className="w-full text-[13px] px-3.5 py-2.5 rounded-xl border border-[#D0DCF5] bg-white text-[#1B3A6B] focus:outline-none focus:border-[#2F7FE8] font-semibold"
                >
                  <option value="document">Document / File</option>
                  <option value="pdf">PDF File</option>
                  <option value="link">Web Link / Video URL</option>
                </select>
              </div>

              {/* Subject */}
              <div>
                <label className="block text-[11px] font-bold text-[#1B3A6B] uppercase tracking-wider mb-1.5">
                  Subject
                </label>
                <select
                  required
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  className="w-full text-[13px] px-3.5 py-2.5 rounded-xl border border-[#D0DCF5] bg-white text-[#1B3A6B] focus:outline-none focus:border-[#2F7FE8] font-semibold"
                >
                  <option value="" disabled>Select subject...</option>
                  <option value="Mathematics">Mathematics</option>
                  <option value="Physics">Physics</option>
                  <option value="Chemistry">Chemistry</option>
                  <option value="Biology">Biology</option>
                  <option value="Computer Science">Computer Science</option>
                  <option value="English">English</option>
                </select>
              </div>

              {/* File upload or link, depending on type */}
              {form.type === "link" ? (
                <div>
                  <label className="block text-[11px] font-bold text-[#1B3A6B] uppercase tracking-wider mb-1.5">
                    Resource Link / URL
                  </label>
                  <input
                    type="url"
                    required
                    placeholder="https://drive.google.com/..."
                    value={form.url}
                    onChange={(e) => setForm({ ...form, url: e.target.value })}
                    className="w-full text-[13px] px-3.5 py-2.5 rounded-xl border border-[#D0DCF5] text-[#1B3A6B] focus:outline-none focus:border-[#2F7FE8] font-semibold"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-[11px] font-bold text-[#1B3A6B] uppercase tracking-wider mb-1.5">
                    Upload File {form.type === "pdf" ? "(PDF)" : ""}
                  </label>
                  <input
                    type="file"
                    required
                    accept={form.type === "pdf" ? "application/pdf" : undefined}
                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                    className="w-full text-[12px] px-3 py-2 rounded-xl border border-[#D0DCF5] text-[#1B3A6B] focus:outline-none focus:border-[#2F7FE8] font-semibold file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-[11px] file:font-bold file:bg-[#F5F8FF] file:text-[#2F7FE8]"
                  />
                  {selectedFile && (
                    <p className="text-[10px] text-[#4A5A7A] mt-1.5">
                      {selectedFile.name} · {(selectedFile.size / (1024 * 1024)).toFixed(1)} MB
                    </p>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div className="border-t border-[#F0F3FB] pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="flex-1 text-xs font-bold py-2.5 rounded-xl border border-[#D0DCF5] text-[#4A5A7A] hover:bg-slate-50 cursor-pointer focus:outline-none"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 text-xs font-bold py-2.5 rounded-xl bg-[#2F7FE8] text-white hover:bg-[#1B3A6B] hover:shadow-md transition-all cursor-pointer focus:outline-none flex items-center justify-center gap-1.5"
                >
                  {submitting && <IconLoader className="w-3.5 h-3.5 animate-spin" />}
                  Publish Material
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
