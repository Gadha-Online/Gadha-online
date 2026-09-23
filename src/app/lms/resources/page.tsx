"use client";

import { useState, useEffect } from "react";
import {
  IconFiles, IconFileTypePdf, IconPhoto, IconLink,
  IconDownload, IconSearch, IconFilter,
} from "@tabler/icons-react";
import { getStudentResources } from "../../actions";

interface ResourceItem {
  id: string;
  name: string;
  type: "pdf" | "doc" | "image" | "link";
  subject: string;
  mentor: string;
  courseName?: string | null;
  date: string;
  size?: string;
  url?: string;
}

const ICON_MAP = {
  pdf:   { icon: IconFileTypePdf, bg: "#fee2e2", color: "#E24B4A" },
  doc:   { icon: IconFiles,       bg: "#dbeafe", color: "#2F7FE8" },
  image: { icon: IconPhoto,       bg: "#dcfce7", color: "#0F6E56" },
  link:  { icon: IconLink,        bg: "#ede9fe", color: "#534AB7" },
};

// ─── Skeleton ──────────────────────────────────────────────────────
function ResourcesSkeleton() {
  return (
    <div className="space-y-5">
      <div className="flex gap-3">
        <div className="flex-1 h-10 rounded-xl animate-shimmer" />
        <div className="h-10 w-32 rounded-xl animate-shimmer" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-[#D0DCF5] p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl animate-shimmer shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-40 animate-shimmer rounded" />
              <div className="h-2.5 w-24 animate-shimmer rounded" />
            </div>
            <div className="h-8 w-20 animate-shimmer rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Resource card ──────────────────────────────────────────────────
function ResourceCard({ r }: { r: ResourceItem }) {
  const { icon: Icon, bg, color } = ICON_MAP[r.type] ?? ICON_MAP.doc;
  return (
    <div className="flex items-center gap-4 p-4 bg-white rounded-2xl border border-[#D0DCF5] hover:shadow-sm transition-shadow">
      <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: bg }}>
        <Icon className="w-5 h-5" style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-bold text-[#1B3A6B] truncate">{r.name}</p>
        <p className="text-[11px] text-[#4A5A7A] mt-0.5">{r.subject} · {r.courseName ? r.courseName : r.mentor} · {r.date}</p>
        {r.size && <p className="text-[10px] text-[#4A5A7A]">{r.size}</p>}
      </div>
      {r.url ? (
        <a
          href={r.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-3 py-2 rounded-lg bg-[#F5F8FF] border border-[#D0DCF5] text-[#4A5A7A] hover:border-[#2F7FE8] hover:text-[#2F7FE8] transition-colors shrink-0"
        >
          <IconDownload className="w-3.5 h-3.5" /> Download
        </a>
      ) : (
        <button
          disabled
          title="No file attached to this resource yet"
          className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-3 py-2 rounded-lg bg-[#F5F8FF] border border-[#D0DCF5] text-[#4A5A7A]/50 shrink-0 cursor-not-allowed"
        >
          <IconDownload className="w-3.5 h-3.5" /> Unavailable
        </button>
      )}
    </div>
  );
}

// ─── Main page ──────────────────────────────────────────────────────
export default function StudentResourcesPage() {
  const [resources, setResources] = useState<ResourceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("all");

  useEffect(() => {
    async function loadData() {
      try {
        const data = await getStudentResources();
        setResources(data as ResourceItem[]);
      } catch (e) {
        console.error("Failed to load student resources:", e);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const subjects = [...new Set(resources.map((r) => r.subject))];

  const filtered = resources.filter((r) => {
    const matchSearch = r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.subject.toLowerCase().includes(search.toLowerCase()) ||
      r.mentor.toLowerCase().includes(search.toLowerCase());
    const matchSubject = subjectFilter === "all" || r.subject === subjectFilter;
    return matchSearch && matchSubject;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-extrabold font-heading text-[#1B3A6B]">Resources</h1>
        <p className="text-[13px] text-[#4A5A7A] mt-0.5">Notes, worksheets and files shared by your mentors.</p>
      </div>

      {loading ? (
        <ResourcesSkeleton />
      ) : (
        <>
          {/* Toolbar */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4A5A7A]" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search files, subjects, mentors…"
                className="w-full pl-9 pr-4 py-2.5 text-[13px] text-[#1B3A6B] bg-white border border-[#D0DCF5] rounded-xl outline-none focus:border-[#2F7FE8] transition-colors placeholder:text-[#4A5A7A]"
              />
            </div>
            {subjects.length > 0 && (
              <div className="relative">
                <IconFilter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4A5A7A]" />
                <select
                  value={subjectFilter}
                  onChange={(e) => setSubjectFilter(e.target.value)}
                  className="pl-9 pr-10 py-2.5 text-[13px] text-[#1B3A6B] bg-white border border-[#D0DCF5] rounded-xl outline-none focus:border-[#2F7FE8] appearance-none cursor-pointer text-ellipsis overflow-hidden whitespace-nowrap"
                >
                  <option value="all">All subjects</option>
                  {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            )}
          </div>

          {/* Content */}
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-28 gap-4 text-center bg-white rounded-2xl border border-dashed border-[#D0DCF5]">
              <IconFiles className="w-14 h-14 text-[#D0DCF5]" />
              <h2 className="text-[16px] font-extrabold font-heading text-[#1B3A6B]">
                {search || subjectFilter !== "all" ? "No matching resources" : "No resources yet"}
              </h2>
              <p className="text-[13px] text-[#4A5A7A] max-w-xs">
                {search || subjectFilter !== "all"
                  ? "Try adjusting your search or filter."
                  : "Your mentors will share notes, worksheets and files here during your sessions."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filtered.map((r) => <ResourceCard key={r.id} r={r} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}
