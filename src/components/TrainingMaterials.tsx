import { useEffect, useState } from "react";
import {
  BookOpen, FileText, Image as ImageIcon, Video, Upload, Trash2,
  Loader2, Plus, X, Download, Maximize2, Calendar, HardDrive,
  ChevronLeft, ChevronRight,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

interface TrainingMaterial {
  id: string;
  title: string;
  description: string | null;
  file_type: "document" | "image" | "video";
  file_url: string;
  file_name: string;
  file_size: number | null;
  created_at: string;
}

type UploadTab = "document" | "image" | "video";

const BUCKET_MAP: Record<UploadTab, string> = {
  document: "training-documents",
  image: "training-images",
  video: "training-videos",
};

const ACCEPT_MAP: Record<UploadTab, string> = {
  document: ".pdf,.doc,.docx,.txt,.rtf,.odt,.pages",
  image: "image/*",
  video: "video/*",
};

const TAB_CONFIG: Record<UploadTab, { icon: typeof FileText; label: string; color: string; bg: string; ring: string }> = {
  document: { icon: FileText, label: "Documents", color: "text-blue-600", bg: "bg-blue-50", ring: "ring-blue-200" },
  image: { icon: ImageIcon, label: "Images", color: "text-amber-600", bg: "bg-amber-50", ring: "ring-amber-200" },
  video: { icon: Video, label: "Videos", color: "text-rose-600", bg: "bg-rose-50", ring: "ring-rose-200" },
};

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function TrainingMaterials() {
  const [materials, setMaterials] = useState<TrainingMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadTab, setUploadTab] = useState<UploadTab>("document");
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<UploadTab>("document");
  const [viewerMaterial, setViewerMaterial] = useState<TrainingMaterial | null>(null);

  const fetchMaterials = async () => {
    setLoading(true);
    const { data, error: fetchError } = await supabase
      .from("training_materials")
      .select("*")
      .order("created_at", { ascending: false });
    if (!fetchError && data) {
      setMaterials(data as TrainingMaterial[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchMaterials();
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    if (!newTitle) setNewTitle(file.name.replace(/\.[^/.]+$/, ""));
  };

  const handleUpload = async () => {
    if (!selectedFile || !newTitle.trim()) return;
    setUploading(true);
    setError(null);

    try {
      const bucket = BUCKET_MAP[uploadTab];
      const fileExt = selectedFile.name.split(".").pop() || "";
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(filePath, selectedFile, { cacheControl: "3600", upsert: false });

      if (uploadError) throw new Error(uploadError.message);

      const { data: urlData } = supabase.storage
        .from(bucket)
        .getPublicUrl(filePath);

      const { error: insertError } = await supabase
        .from("training_materials")
        .insert({
          title: newTitle.trim(),
          description: newDescription.trim() || null,
          file_type: uploadTab,
          file_url: urlData.publicUrl,
          file_name: selectedFile.name,
          file_size: selectedFile.size,
        });

      if (insertError) throw new Error(insertError.message);

      setNewTitle("");
      setNewDescription("");
      setSelectedFile(null);
      setShowUploadForm(false);
      fetchMaterials();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (material: TrainingMaterial) => {
    const bucket = BUCKET_MAP[material.file_type];
    const filePath = material.file_url.split("/").slice(-1)[0];

    await supabase.storage.from(bucket).remove([filePath]);
    await supabase.from("training_materials").delete().eq("id", material.id);
    setMaterials((prev) => prev.filter((m) => m.id !== material.id));
  };

  const documents = materials.filter((m) => m.file_type === "document");
  const images = materials.filter((m) => m.file_type === "image");
  const videos = materials.filter((m) => m.file_type === "video");

  const tabCounts: Record<UploadTab, number> = {
    document: documents.length,
    image: images.length,
    video: videos.length,
  };

  const currentItems = activeTab === "document" ? documents : activeTab === "image" ? images : videos;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="rounded-2xl border border-gray-200/80 bg-white/90 p-5 shadow-lg shadow-gray-200/40">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/20">
              <BookOpen className="h-6 w-6 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Rules & Training</h2>
              <p className="text-xs text-gray-500">Upload and share documents, images, and videos for your team</p>
            </div>
          </div>
          <button
            onClick={() => setShowUploadForm(!showUploadForm)}
            className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-700"
          >
            <Plus className="h-4 w-4" /> Upload
          </button>
        </div>

        {/* Stats bar */}
        <div className="mt-4 grid grid-cols-3 gap-3">
          {(Object.keys(TAB_CONFIG) as UploadTab[]).map((tab) => {
            const cfg = TAB_CONFIG[tab];
            const Icon = cfg.icon;
            return (
              <div key={tab} className={`flex items-center gap-2.5 rounded-xl ${cfg.bg} px-4 py-3 ring-1 ${cfg.ring}`}>
                <Icon className={`h-5 w-5 ${cfg.color}`} />
                <div>
                  <p className="text-lg font-bold text-gray-900">{tabCounts[tab]}</p>
                  <p className="text-xs text-gray-500">{cfg.label}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Upload form */}
      {showUploadForm && (
        <div className="rounded-2xl border border-emerald-200 bg-white/90 p-5 shadow-lg shadow-emerald-100/40">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">Upload New Material</h3>
            <button
              onClick={() => setShowUploadForm(false)}
              className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Upload type tabs */}
          <div className="mb-4 grid grid-cols-3 gap-2">
            {(Object.keys(TAB_CONFIG) as UploadTab[]).map((tab) => {
              const cfg = TAB_CONFIG[tab];
              const Icon = cfg.icon;
              return (
                <button
                  key={tab}
                  onClick={() => { setUploadTab(tab); setSelectedFile(null); }}
                  className={`flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-medium capitalize transition ${
                    uploadTab === tab
                      ? `${cfg.bg} ${cfg.color} ring-1 ${cfg.ring}`
                      : "bg-gray-50 text-gray-500 hover:bg-gray-100"
                  }`}
                >
                  <Icon className="h-4 w-4" /> {tab}
                </button>
              );
            })}
          </div>

          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">Title</label>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Name this material..."
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">Description (optional)</label>
              <input
                type="text"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Brief description..."
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">File</label>
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 px-4 py-4 text-sm text-gray-500 transition hover:border-emerald-400 hover:bg-emerald-50/30">
                <Upload className="h-5 w-5" />
                {selectedFile ? (
                  <div className="min-w-0">
                    <p className="truncate font-medium text-gray-700">{selectedFile.name}</p>
                    <p className="text-xs text-gray-400">{formatFileSize(selectedFile.size)}</p>
                  </div>
                ) : (
                  <span>Click to select a {uploadTab} file from your device</span>
                )}
                <input
                  type="file"
                  accept={ACCEPT_MAP[uploadTab]}
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </label>
            </div>
            {error && (
              <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 ring-1 ring-red-200">
                {error}
              </div>
            )}
            <button
              onClick={handleUpload}
              disabled={!selectedFile || !newTitle.trim() || uploading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Uploading...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" /> Upload Material
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Content tabs */}
      {!loading && materials.length > 0 && (
        <div className="flex gap-2 border-b border-gray-200">
          {(Object.keys(TAB_CONFIG) as UploadTab[]).map((tab) => {
            const cfg = TAB_CONFIG[tab];
            const Icon = cfg.icon;
            const isActive = activeTab === tab;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition ${
                  isActive
                    ? `border-emerald-500 ${cfg.color}`
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                <Icon className="h-4 w-4" />
                {cfg.label}
                <span className={`rounded-full px-2 py-0.5 text-xs ${isActive ? cfg.bg : "bg-gray-100"} ${isActive ? cfg.color : "text-gray-400"}`}>
                  {tabCounts[tab]}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="h-10 w-10 animate-spin text-emerald-500" />
          <p className="mt-3 text-sm text-gray-400">Loading materials...</p>
        </div>
      )}

      {/* Materials grid */}
      {!loading && (
        <div className="space-y-4">
          {currentItems.length > 0 ? (
            activeTab === "image" ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {currentItems.map((material) => (
                  <div
                    key={material.id}
                    className="group overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition hover:shadow-lg"
                  >
                    <button
                      onClick={() => setViewerMaterial(material)}
                      className="relative block aspect-square w-full overflow-hidden bg-gray-100"
                    >
                      <img
                        src={material.file_url}
                        alt={material.title}
                        className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/30 group-hover:opacity-100">
                        <Maximize2 className="h-6 w-6 text-white" />
                      </div>
                    </button>
                    <div className="p-3">
                      <p className="truncate text-sm font-medium text-gray-800">{material.title}</p>
                      <p className="mt-0.5 text-xs text-gray-400">{formatDate(material.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : activeTab === "video" ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {currentItems.map((material) => (
                  <div
                    key={material.id}
                    className="group overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition hover:shadow-lg"
                  >
                    <button
                      onClick={() => setViewerMaterial(material)}
                      className="relative block aspect-video w-full overflow-hidden bg-gray-900"
                    >
                      <video
                        src={material.file_url}
                        className="h-full w-full object-cover"
                        preload="metadata"
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30 transition group-hover:bg-black/40">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 shadow-lg">
                          <Video className="h-6 w-6 text-rose-600" />
                        </div>
                      </div>
                    </button>
                    <div className="p-3">
                      <p className="truncate text-sm font-medium text-gray-800">{material.title}</p>
                      {material.description && (
                        <p className="mt-0.5 truncate text-xs text-gray-500">{material.description}</p>
                      )}
                      <p className="mt-0.5 text-xs text-gray-400">{formatDate(material.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {currentItems.map((material) => (
                  <div
                    key={material.id}
                    className="group flex items-start gap-3 rounded-2xl border border-gray-200 bg-white p-4 transition hover:border-emerald-300 hover:shadow-md"
                  >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50">
                      <FileText className="h-5 w-5 text-blue-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-gray-800">{material.title}</p>
                      {material.description && (
                        <p className="mt-0.5 truncate text-xs text-gray-500">{material.description}</p>
                      )}
                      <div className="mt-1.5 flex items-center gap-3 text-xs text-gray-400">
                        <span className="flex items-center gap-1">
                          <HardDrive className="h-3 w-3" /> {formatFileSize(material.file_size)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" /> {formatDate(material.created_at)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setViewerMaterial(material)}
                        className="flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200 transition hover:bg-emerald-100"
                      >
                        <Maximize2 className="h-3.5 w-3.5" /> Open
                      </button>
                      <button
                        onClick={() => handleDelete(material)}
                        className="rounded-lg p-1.5 text-gray-300 transition hover:bg-red-50 hover:text-red-500"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : materials.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-16 text-center">
              <BookOpen className="mx-auto mb-3 h-12 w-12 text-gray-300" />
              <p className="text-sm font-semibold text-gray-500">No training materials yet</p>
              <p className="mt-1 text-xs text-gray-400">Upload documents, images, and videos for your workers to reference</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-12 text-center">
              <p className="text-sm text-gray-400">No {TAB_CONFIG[activeTab].label.toLowerCase()} uploaded yet</p>
            </div>
          )}
        </div>
      )}

      {/* In-page viewer modal */}
      {viewerMaterial && (
        <ContentViewer
          material={viewerMaterial}
          onClose={() => setViewerMaterial(null)}
          onPrev={() => {
            const idx = currentItems.findIndex((m) => m.id === viewerMaterial.id);
            if (idx > 0) setViewerMaterial(currentItems[idx - 1]);
          }}
          onNext={() => {
            const idx = currentItems.findIndex((m) => m.id === viewerMaterial.id);
            if (idx < currentItems.length - 1) setViewerMaterial(currentItems[idx + 1]);
          }}
          onDelete={() => {
            handleDelete(viewerMaterial);
            setViewerMaterial(null);
          }}
          hasPrev={currentItems.findIndex((m) => m.id === viewerMaterial.id) > 0}
          hasNext={currentItems.findIndex((m) => m.id === viewerMaterial.id) < currentItems.length - 1}
        />
      )}
    </div>
  );
}

function ContentViewer({
  material,
  onClose,
  onPrev,
  onNext,
  onDelete,
  hasPrev,
  hasNext,
}: {
  material: TrainingMaterial;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onDelete: () => void;
  hasPrev: boolean;
  hasNext: boolean;
}) {
  const isPdf = material.file_name.toLowerCase().endsWith(".pdf") || material.file_url.toLowerCase().includes(".pdf");
  const isImage = material.file_type === "image";
  const isVideo = material.file_type === "video";
  const isText = [".txt", ".rtf"].some((ext) => material.file_name.toLowerCase().endsWith(ext));

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90 backdrop-blur-sm" onClick={onClose}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3" onClick={(e) => e.stopPropagation()}>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-white">{material.title}</p>
          <p className="truncate text-xs text-gray-400">{material.file_name} · {formatFileSize(material.file_size)}</p>
        </div>
        <div className="flex items-center gap-1">
          <a
            href={material.file_url}
            download={material.file_name}
            onClick={(e) => e.stopPropagation()}
            className="rounded-lg p-2 text-gray-400 transition hover:bg-white/10 hover:text-white"
            title="Download"
          >
            <Download className="h-5 w-5" />
          </a>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="rounded-lg p-2 text-gray-400 transition hover:bg-red-500/20 hover:text-red-400"
            title="Delete"
          >
            <Trash2 className="h-5 w-5" />
          </button>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-gray-400 transition hover:bg-white/10 hover:text-white"
            title="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Content area */}
      <div className="relative flex flex-1 items-center justify-center overflow-hidden px-4 pb-4" onClick={(e) => e.stopPropagation()}>
        {/* Prev / Next */}
        {hasPrev && (
          <button
            onClick={onPrev}
            className="absolute left-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}
        {hasNext && (
          <button
            onClick={onNext}
            className="absolute right-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        )}

        {/* Content */}
        {isImage ? (
          <img
            src={material.file_url}
            alt={material.title}
            className="max-h-full max-w-full rounded-xl object-contain shadow-2xl"
          />
        ) : isVideo ? (
          <video
            src={material.file_url}
            controls
            autoPlay
            className="max-h-full max-w-full rounded-xl shadow-2xl"
          />
        ) : isPdf ? (
          <iframe
            src={material.file_url}
            title={material.title}
            className="h-full w-full max-w-4xl rounded-xl bg-white shadow-2xl"
          />
        ) : isText ? (
          <iframe
            src={material.file_url}
            title={material.title}
            className="h-full w-full max-w-4xl rounded-xl bg-white shadow-2xl"
          />
        ) : (
          <div className="flex flex-col items-center text-center">
            <FileText className="mb-4 h-16 w-16 text-gray-500" />
            <p className="text-sm text-gray-400">This file type can't be previewed in the browser.</p>
            <a
              href={material.file_url}
              download={material.file_name}
              onClick={(e) => e.stopPropagation()}
              className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
            >
              <Download className="h-4 w-4" /> Download File
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
