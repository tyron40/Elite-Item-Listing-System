import { useCallback, useEffect, useState } from "react";
import { LayoutTemplate, Plus, Trash2, X, Loader2, Check, ExternalLink, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface CustomLoginPage {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  logo_text: string | null;
  accent_color: string;
  is_active: boolean;
  created_at: string;
}

const COLOR_OPTIONS = [
  { value: "emerald", label: "Emerald", class: "from-emerald-500 to-teal-600" },
  { value: "blue", label: "Blue", class: "from-blue-500 to-cyan-600" },
  { value: "amber", label: "Amber", class: "from-amber-500 to-orange-600" },
  { value: "rose", label: "Rose", class: "from-rose-500 to-pink-600" },
  { value: "slate", label: "Slate", class: "from-slate-600 to-slate-800" },
];

export default function CustomLoginPages({ onClose }: { onClose: () => void }) {
  const [pages, setPages] = useState<CustomLoginPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [logoText, setLogoText] = useState("");
  const [accentColor, setAccentColor] = useState("emerald");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const fetchPages = useCallback(async () => {
    setLoading(true);
    const { data, error: fetchErr } = await supabase
      .from("custom_login_pages")
      .select("*")
      .order("created_at", { ascending: false });
    if (fetchErr) setError(fetchErr.message);
    if (data) setPages(data as CustomLoginPage[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchPages(); }, [fetchPages]);

  const resetForm = () => {
    setSlug(""); setTitle(""); setSubtitle(""); setLogoText(""); setAccentColor("emerald");
    setEditId(null); setShowForm(false);
  };

  const handleSave = async () => {
    if (!slug.trim() || !title.trim()) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      if (editId) {
        const { error: updErr } = await supabase
          .from("custom_login_pages")
          .update({ title: title.trim(), subtitle: subtitle.trim(), logo_text: logoText.trim() || null, accent_color: accentColor })
          .eq("id", editId);
        if (updErr) throw new Error(updErr.message);
        setSaveMsg("Login page updated");
      } else {
        const { error: insErr } = await supabase
          .from("custom_login_pages")
          .insert({ slug: slug.trim().toLowerCase(), title: title.trim(), subtitle: subtitle.trim(), logo_text: logoText.trim() || null, accent_color: accentColor });
        if (insErr) throw new Error(insErr.message);
        setSaveMsg("Login page created");
      }
      resetForm();
      fetchPages();
    } catch (e) {
      setSaveMsg(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this login page variant?")) return;
    await supabase.from("custom_login_pages").delete().eq("id", id);
    fetchPages();
  };

  const handleToggle = async (page: CustomLoginPage) => {
    await supabase.from("custom_login_pages").update({ is_active: !page.is_active }).eq("id", page.id);
    fetchPages();
  };

  const startEdit = (page: CustomLoginPage) => {
    setEditId(page.id);
    setSlug(page.slug);
    setTitle(page.title);
    setSubtitle(page.subtitle);
    setLogoText(page.logo_text || "");
    setAccentColor(page.accent_color);
    setShowForm(true);
    setSaveMsg(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-900">
            <LayoutTemplate className="h-5 w-5 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-900">Custom Login Pages</h3>
            <p className="text-xs text-gray-400">{pages.length} login page variants</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { resetForm(); setShowForm(!showForm); }}
            className="flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-gray-800"
          >
            <Plus className="h-4 w-4" /> <span className="hidden sm:inline">New Page</span>
          </button>
          <button onClick={onClose} className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700">
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{error}</div>}
      {saveMsg && <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700 ring-1 ring-emerald-200">{saveMsg}</div>}

      {showForm && (
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-sm font-semibold text-gray-700">{editId ? "Edit Login Page" : "Create Login Page"}</h4>
            <button onClick={() => resetForm()} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"><X className="h-4 w-4" /></button>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">URL Slug</label>
              <input type="text" value={slug} onChange={(e) => setSlug(e.target.value)} disabled={!!editId}
                placeholder="e.g. staff, warehouse, vip"
                className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 px-3 text-sm outline-none focus:border-gray-400 focus:bg-white disabled:opacity-50" />
              <p className="mt-1 text-xs text-gray-400">Access at /login/{slug || "slug"}</p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">Title</label>
              <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
                placeholder="Login page title"
                className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 px-3 text-sm outline-none focus:border-gray-400 focus:bg-white" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">Subtitle</label>
              <input type="text" value={subtitle} onChange={(e) => setSubtitle(e.target.value)}
                placeholder="Tagline or description"
                className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 px-3 text-sm outline-none focus:border-gray-400 focus:bg-white" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">Logo Text (optional)</label>
              <input type="text" value={logoText} onChange={(e) => setLogoText(e.target.value)}
                placeholder="Override app name"
                className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 px-3 text-sm outline-none focus:border-gray-400 focus:bg-white" />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-2 block text-xs font-medium text-gray-400">Accent Color</label>
              <div className="flex flex-wrap gap-2">
                {COLOR_OPTIONS.map((c) => (
                  <button key={c.value} type="button"
                    onClick={() => setAccentColor(c.value)}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                      accentColor === c.value ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 text-gray-600 hover:bg-gray-50"
                    }`}>
                    <span className={`h-4 w-4 rounded bg-gradient-to-br ${c.class}`} />
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <button onClick={handleSave} disabled={saving || (!editId && (!slug.trim() || !title.trim()))}
            className="mt-4 flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} {editId ? "Update" : "Create"}
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          <p className="mt-2 text-sm text-gray-400">Loading...</p>
        </div>
      ) : pages.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-12 text-center">
          <LayoutTemplate className="mx-auto mb-2 h-10 w-10 text-gray-300" />
          <p className="text-sm font-medium text-gray-500">No custom login pages yet</p>
          <p className="mt-1 text-xs text-gray-400">Create themed login pages for different teams or locations</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {pages.map((page) => {
            const color = COLOR_OPTIONS.find((c) => c.value === page.accent_color) || COLOR_OPTIONS[0];
            return (
              <div key={page.id} className="group rounded-xl border border-gray-200 bg-white p-4 transition hover:shadow-lg">
                {/* Preview */}
                <div className={`mb-3 flex items-center gap-2 rounded-lg bg-gradient-to-br ${color.class} px-3 py-3`}>
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/20">
                    <span className="text-sm font-bold text-white">{(page.logo_text || page.title).charAt(0)}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-white">{page.logo_text || page.title}</p>
                    <p className="truncate text-xs text-white/70">{page.subtitle}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-800">{page.title}</p>
                    <p className="text-xs text-gray-400">/login/{page.slug}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => handleToggle(page)} title={page.is_active ? "Active" : "Inactive"}
                      className={`rounded-lg p-1.5 transition ${page.is_active ? "text-emerald-600 hover:bg-emerald-50" : "text-gray-300 hover:bg-gray-100"}`}>
                      {page.is_active ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    </button>
                    <button onClick={() => startEdit(page)}
                      className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-100">
                      Edit
                    </button>
                    <button onClick={() => handleDelete(page.id)}
                      className="rounded-lg p-1.5 text-gray-400 transition hover:bg-red-50 hover:text-red-500">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
