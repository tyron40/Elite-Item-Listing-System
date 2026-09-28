import { useEffect, useState } from "react";
import {
  BookOpen, FileText, Image as ImageIcon, Video, Upload, Trash2,
  Loader2, Plus, X, Download, File,
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

const ICON_MAP: Record<UploadTab, typeof FileText> = {
  document: FileText,
  image: ImageIcon,
  video: Video,
};

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
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

  const renderMaterialCard = (material: TrainingMaterial) => {
    const Icon = ICON_MAP[material.file_type];
    return (
      <div key={material.id} className="group flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 transition hover:border-emerald-300 hover:shadow-sm">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50">
          <Icon className="h-5 w-5 text-emerald-600" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-gray-800">{material.title}</p>
          <p className="truncate text-xs text-gray-400">
            {material.file_name} · {formatFileSize(material.file_size)} ·{" "}
            {new Date(material.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </p>
          {material.description && (
            <p className="mt-0.5 truncate text-xs text-gray-500">{material.description}</p>
          )}
        </div>
        <div className="flex items-center gap-1">
          <a
            href={material.file_url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg p-1.5 text-gray-400 transition hover:bg-emerald-50 hover:text-emerald-600"
            title="Open"
          >
            {material.file_type === "video" ? (
              <Video className="h-4 w-4" />
            ) : material.file_type === "image" ? (
              <ImageIcon className="h-4 w-4" />
            ) : (
              <Download className="h-4 w-4" />
            )}
          </a>
          <button
            onClick={() => handleDelete(material)}
            className="rounded-lg p-1.5 text-gray-300 transition hover:bg-red-50 hover:text-red-500"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  };

  const renderSection = (title: string, icon: typeof FileText, items: TrainingMaterial[]) => {
    const Icon = icon;
    return (
      <div>
        <div className="mb-2 flex items-center gap-2">
          <Icon className="h-4 w-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
          <span className="text-xs text-gray-400">({items.length})</span>
        </div>
        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-6 text-center">
            <p className="text-sm text-gray-400">No {title.toLowerCase()} uploaded yet</p>
          </div>
        ) : (
          <div className="space-y-2">{items.map(renderMaterialCard)}</div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600">
            <BookOpen className="h-4 w-4 text-white" />
          </div>
          <h2 className="text-base font-bold text-gray-900">Rules & Training</h2>
        </div>
        <button
          onClick={() => setShowUploadForm(!showUploadForm)}
          className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-700"
        >
          <Plus className="h-4 w-4" /> Upload
        </button>
      </div>

      {/* Upload form */}
      {showUploadForm && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/30 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-600">Upload New Material</h3>
            <button
              onClick={() => setShowUploadForm(false)}
              className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Upload type tabs */}
          <div className="mb-3 grid grid-cols-3 gap-2">
            {(Object.keys(BUCKET_MAP) as UploadTab[]).map((tab) => {
              const Icon = ICON_MAP[tab];
              return (
                <button
                  key={tab}
                  onClick={() => { setUploadTab(tab); setSelectedFile(null); }}
                  className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium capitalize transition ${
                    uploadTab === tab
                      ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
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
              <label className="mb-1 block text-xs text-gray-400">Title</label>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Name this material..."
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-400"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-400">Description (optional)</label>
              <input
                type="text"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Brief description..."
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-400"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-400">File</label>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-3 text-sm text-gray-500 transition hover:border-emerald-400 hover:bg-emerald-50/30">
                <Upload className="h-4 w-4" />
                {selectedFile ? (
                  <span className="truncate text-gray-700">{selectedFile.name}</span>
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
            {error && <p className="text-sm text-red-500">{error}</p>}
            <button
              onClick={handleUpload}
              disabled={!selectedFile || !newTitle.trim() || uploading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
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

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
        </div>
      )}

      {/* Materials */}
      {!loading && (
        <div className="space-y-5">
          {renderSection("Documents", FileText, documents)}
          {renderSection("Images", ImageIcon, images)}
          {renderSection("Videos", Video, videos)}
          {materials.length === 0 && (
            <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-12 text-center">
              <BookOpen className="mx-auto mb-2 h-10 w-10 text-gray-300" />
              <p className="text-sm font-medium text-gray-500">No training materials yet</p>
              <p className="mt-1 text-xs text-gray-400">Upload documents, images, and videos for your workers to reference</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
