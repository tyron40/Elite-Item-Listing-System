import { useEffect, useState, useCallback } from "react";
import {
  FileText, Image as ImageIcon, Video, Upload, Trash2,
  Loader2, Plus, X, Download, Maximize2, Calendar, HardDrive,
  ChevronLeft, ChevronRight, FolderPlus, Edit3, Folder, Check,
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
  folder_id: string | null;
}

interface TrainingFolder {
  id: string;
  name: string;
  sort_order: number;
  created_at: string;
}

const BUCKET_MAP: Record<string, string> = {
  document: "training-documents",
  image: "training-images",
  video: "training-videos",
};

const ACCEPT_MAP: Record<string, string> = {
  document: ".pdf,.doc,.docx,.txt,.rtf,.odt,.pages",
  image: "image/*",
  video: "video/*",
};

const TYPE_ICON: Record<string, typeof FileText> = {
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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function detectFileType(file: File): "document" | "image" | "video" {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  return "document";
}

export default function TrainingMaterials() {
  const [materials, setMaterials] = useState<TrainingMaterial[]>([]);
  const [folders, setFolders] = useState<TrainingFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadFolderId, setUploadFolderId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [activeFolderId, setActiveFolderId] = useState<string | null>(null); // null = "All"
  const [viewerMaterial, setViewerMaterial] = useState<TrainingMaterial | null>(null);

  // Folder management
  const [showFolderInput, setShowFolderInput] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState("");

  // Material edit
  const [editingMaterial, setEditingMaterial] = useState<TrainingMaterial | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editFolderId, setEditFolderId] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [matRes, folderRes] = await Promise.all([
      supabase.from("training_materials").select("*").order("created_at", { ascending: false }),
      supabase.from("training_folders").select("*").order("sort_order", { ascending: true }),
    ]);
    if (matRes.data) setMaterials(matRes.data as TrainingMaterial[]);
    if (folderRes.data) setFolders(folderRes.data as TrainingFolder[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Folder CRUD
  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    const maxOrder = folders.length > 0 ? Math.max(...folders.map((f) => f.sort_order)) : 0;
    const { data } = await supabase
      .from("training_folders")
      .insert({ name: newFolderName.trim(), sort_order: maxOrder + 1 })
      .select()
      .single();
    if (data) {
      setFolders((prev) => [...prev, data as TrainingFolder]);
    }
    setNewFolderName("");
    setShowFolderInput(false);
  };

  const handleRenameFolder = async (id: string) => {
    if (!editingFolderName.trim()) return;
    await supabase.from("training_folders").update({ name: editingFolderName.trim() }).eq("id", id);
    setFolders((prev) => prev.map((f) => (f.id === id ? { ...f, name: editingFolderName.trim() } : f)));
    setEditingFolderId(null);
    setEditingFolderName("");
  };

  const handleDeleteFolder = async (folder: TrainingFolder) => {
    // Materials in this folder get folder_id set to null by the FK constraint
    await supabase.from("training_folders").delete().eq("id", folder.id);
    setFolders((prev) => prev.filter((f) => f.id !== folder.id));
    setMaterials((prev) => prev.map((m) => (m.folder_id === folder.id ? { ...m, folder_id: null } : m)));
    if (activeFolderId === folder.id) setActiveFolderId(null);
  };

  // Material CRUD
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
      const fileType = detectFileType(selectedFile);
      const bucket = BUCKET_MAP[fileType];
      const fileExt = selectedFile.name.split(".").pop() || "";
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(fileName, selectedFile, { cacheControl: "3600", upsert: false });

      if (uploadError) throw new Error(uploadError.message);

      const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(fileName);

      const { error: insertError } = await supabase.from("training_materials").insert({
        title: newTitle.trim(),
        description: newDescription.trim() || null,
        file_type: fileType,
        file_url: urlData.publicUrl,
        file_name: selectedFile.name,
        file_size: selectedFile.size,
        folder_id: uploadFolderId,
      });

      if (insertError) throw new Error(insertError.message);

      setNewTitle("");
      setNewDescription("");
      setSelectedFile(null);
      setUploadFolderId(activeFolderId);
      setShowUploadForm(false);
      fetchAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteMaterial = async (material: TrainingMaterial) => {
    const bucket = BUCKET_MAP[material.file_type];
    const filePath = material.file_url.split("/").slice(-1)[0];
    await supabase.storage.from(bucket).remove([filePath]);
    await supabase.from("training_materials").delete().eq("id", material.id);
    setMaterials((prev) => prev.filter((m) => m.id !== material.id));
  };

  const handleSaveEdit = async () => {
    if (!editingMaterial || !editTitle.trim()) return;
    await supabase
      .from("training_materials")
      .update({
        title: editTitle.trim(),
        description: editDescription.trim() || null,
        folder_id: editFolderId,
      })
      .eq("id", editingMaterial.id);
    setMaterials((prev) =>
      prev.map((m) =>
        m.id === editingMaterial.id
          ? { ...m, title: editTitle.trim(), description: editDescription.trim() || null, folder_id: editFolderId }
          : m
      )
    );
    setEditingMaterial(null);
    setEditTitle("");
    setEditDescription("");
    setEditFolderId(null);
  };

  const startEdit = (material: TrainingMaterial) => {
    setEditingMaterial(material);
    setEditTitle(material.title);
    setEditDescription(material.description || "");
    setEditFolderId(material.folder_id);
  };

  // Filtered materials
  const visibleMaterials = activeFolderId
    ? materials.filter((m) => m.folder_id === activeFolderId)
    : materials;

  const folderName = activeFolderId
    ? folders.find((f) => f.id === activeFolderId)?.name || "Folder"
    : "All Materials";

  const folderCount = (folderId: string | null) =>
    folderId ? materials.filter((m) => m.folder_id === folderId).length : materials.length;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-gray-900">Training</h2>
        <button
          onClick={() => {
            setUploadFolderId(activeFolderId);
            setShowUploadForm(!showUploadForm);
          }}
          className="flex items-center gap-1.5 rounded-lg bg-gray-900 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-gray-800"
        >
          <Plus className="h-4 w-4" /> Upload
        </button>
      </div>

      {/* Folder tabs row */}
      <div className="flex items-center gap-1.5 overflow-x-auto border-b border-gray-200 pb-2">
        {/* All tab */}
        <button
          onClick={() => setActiveFolderId(null)}
          className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
            activeFolderId === null
              ? "bg-gray-900 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          <Folder className="h-3.5 w-3.5" />
          All
          <span className={`rounded-full px-1.5 py-0.5 text-xs ${activeFolderId === null ? "bg-white/20" : "bg-gray-200"}`}>
            {folderCount(null)}
          </span>
        </button>

        {folders.map((folder) => (
          <div key={folder.id} className="flex shrink-0 items-center">
            {editingFolderId === folder.id ? (
              <div className="flex items-center gap-1 rounded-lg bg-gray-100 px-2 py-1">
                <input
                  autoFocus
                  value={editingFolderName}
                  onChange={(e) => setEditingFolderName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRenameFolder(folder.id);
                    if (e.key === "Escape") { setEditingFolderId(null); setEditingFolderName(""); }
                  }}
                  className="w-24 rounded border border-gray-300 bg-white px-2 py-0.5 text-sm outline-none focus:border-gray-400"
                />
                <button onClick={() => handleRenameFolder(folder.id)} className="p-0.5 text-gray-600 hover:text-gray-900">
                  <Check className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => { setEditingFolderId(null); setEditingFolderName(""); }} className="p-0.5 text-gray-400 hover:text-gray-600">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <div className="group flex items-center">
                <button
                  onClick={() => setActiveFolderId(folder.id)}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                    activeFolderId === folder.id
                      ? "bg-gray-900 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  <Folder className="h-3.5 w-3.5" />
                  {folder.name}
                  <span className={`rounded-full px-1.5 py-0.5 text-xs ${activeFolderId === folder.id ? "bg-white/20" : "bg-gray-200"}`}>
                    {folderCount(folder.id)}
                  </span>
                </button>
                <button
                  onClick={() => { setEditingFolderId(folder.id); setEditingFolderName(folder.name); }}
                  className="ml-0.5 rounded p-0.5 text-gray-400 opacity-0 transition hover:text-gray-700 group-hover:opacity-100"
                >
                  <Edit3 className="h-3 w-3" />
                </button>
                <button
                  onClick={() => handleDeleteFolder(folder)}
                  className="rounded p-0.5 text-gray-400 opacity-0 transition hover:text-red-500 group-hover:opacity-100"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>
        ))}

        {/* New folder input */}
        {showFolderInput ? (
          <div className="flex shrink-0 items-center gap-1 rounded-lg bg-gray-100 px-2 py-1">
            <input
              autoFocus
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateFolder();
                if (e.key === "Escape") { setShowFolderInput(false); setNewFolderName(""); }
              }}
              placeholder="Folder name..."
              className="w-28 rounded border border-gray-300 bg-white px-2 py-0.5 text-sm outline-none focus:border-gray-400"
            />
            <button onClick={handleCreateFolder} className="p-0.5 text-gray-600 hover:text-gray-900">
              <Check className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => { setShowFolderInput(false); setNewFolderName(""); }} className="p-0.5 text-gray-400 hover:text-gray-600">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowFolderInput(true)}
            className="flex shrink-0 items-center gap-1 rounded-lg border border-dashed border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-500 transition hover:border-gray-400 hover:text-gray-700"
          >
            <FolderPlus className="h-3.5 w-3.5" /> New Tab
          </button>
        )}
      </div>

      {/* Upload form */}
      {showUploadForm && (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">Upload Material</h3>
            <button onClick={() => setShowUploadForm(false)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">Title</label>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Name this material..."
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none transition focus:border-gray-400 focus:bg-white"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">Description (optional)</label>
              <input
                type="text"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Brief description..."
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none transition focus:border-gray-400 focus:bg-white"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">Folder</label>
              <select
                value={uploadFolderId || ""}
                onChange={(e) => setUploadFolderId(e.target.value || null)}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-gray-400"
              >
                <option value="">All Materials (no folder)</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">File</label>
              <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-3 text-sm text-gray-500 transition hover:border-gray-400 hover:bg-white">
                <Upload className="h-5 w-5" />
                {selectedFile ? (
                  <div className="min-w-0">
                    <p className="truncate font-medium text-gray-700">{selectedFile.name}</p>
                    <p className="text-xs text-gray-400">{formatFileSize(selectedFile.size)}</p>
                  </div>
                ) : (
                  <span>Click to select a file from your device</span>
                )}
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,.txt,.rtf,.odt,.pages,image/*,video/*"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </label>
            </div>
            {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 ring-1 ring-red-200">{error}</div>}
            <button
              onClick={handleUpload}
              disabled={!selectedFile || !newTitle.trim() || uploading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-gray-900 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {uploading ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Uploading...</>
              ) : (
                <><Upload className="h-4 w-4" /> Upload</>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Edit form */}
      {editingMaterial && (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">Edit Material</h3>
            <button onClick={() => setEditingMaterial(null)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">Title</label>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-gray-400 focus:bg-white"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">Description</label>
              <input
                type="text"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Brief description..."
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-gray-400 focus:bg-white"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">Folder</label>
              <select
                value={editFolderId || ""}
                onChange={(e) => setEditFolderId(e.target.value || null)}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-gray-400"
              >
                <option value="">All Materials (no folder)</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
            <button
              onClick={handleSaveEdit}
              disabled={!editTitle.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-gray-900 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-50"
            >
              <Check className="h-4 w-4" /> Save Changes
            </button>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          <p className="mt-2 text-sm text-gray-400">Loading...</p>
        </div>
      )}

      {/* Materials */}
      {!loading && (
        <div>
          {visibleMaterials.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-12 text-center">
              <Folder className="mx-auto mb-2 h-10 w-10 text-gray-300" />
              <p className="text-sm font-medium text-gray-500">No materials in {folderName}</p>
              <p className="mt-1 text-xs text-gray-400">Click Upload to add content here</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {visibleMaterials.map((material) => {
                const Icon = TYPE_ICON[material.file_type];
                return (
                  <div
                    key={material.id}
                    className="group flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white transition hover:shadow-md"
                  >
                    {/* Thumbnail / preview area */}
                    <button
                      onClick={() => setViewerMaterial(material)}
                      className="relative block w-full overflow-hidden bg-gray-100"
                      style={{ aspectRatio: material.file_type === "video" ? "16/9" : material.file_type === "image" ? "1/1" : "4/1" }}
                    >
                      {material.file_type === "image" ? (
                        <img src={material.file_url} alt={material.title} className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
                      ) : material.file_type === "video" ? (
                        <>
                          <video src={material.file_url} className="h-full w-full object-cover" preload="metadata" />
                          <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90">
                              <Video className="h-5 w-5 text-gray-700" />
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="flex h-full items-center justify-center gap-3 bg-gray-50">
                          <Icon className="h-8 w-8 text-gray-300" />
                          <span className="text-xs uppercase text-gray-400">{material.file_name.split(".").pop()}</span>
                        </div>
                      )}
                      <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/10 group-hover:opacity-100">
                        <Maximize2 className="h-5 w-5 text-white drop-shadow" />
                      </div>
                    </button>

                    {/* Info */}
                    <div className="flex flex-1 flex-col p-3">
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
                      {/* Actions */}
                      <div className="mt-2 flex items-center gap-1 border-t border-gray-100 pt-2">
                        <button
                          onClick={() => setViewerMaterial(material)}
                          className="flex flex-1 items-center justify-center gap-1 rounded-md py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-100"
                        >
                          <Maximize2 className="h-3.5 w-3.5" /> Open
                        </button>
                        <button
                          onClick={() => startEdit(material)}
                          className="flex items-center justify-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-gray-500 transition hover:bg-gray-100"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteMaterial(material)}
                          className="flex items-center justify-center rounded-md px-2.5 py-1.5 text-gray-400 transition hover:bg-red-50 hover:text-red-500"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Viewer */}
      {viewerMaterial && (
        <ContentViewer
          material={viewerMaterial}
          items={visibleMaterials}
          onClose={() => setViewerMaterial(null)}
          onNavigate={setViewerMaterial}
          onDelete={() => {
            handleDeleteMaterial(viewerMaterial);
            setViewerMaterial(null);
          }}
        />
      )}
    </div>
  );
}

function ContentViewer({
  material,
  items,
  onClose,
  onNavigate,
  onDelete,
}: {
  material: TrainingMaterial;
  items: TrainingMaterial[];
  onClose: () => void;
  onNavigate: (m: TrainingMaterial) => void;
  onDelete: () => void;
}) {
  const isPdf = material.file_name.toLowerCase().endsWith(".pdf") || material.file_url.toLowerCase().includes(".pdf");
  const isImage = material.file_type === "image";
  const isVideo = material.file_type === "video";
  const isText = [".txt", ".rtf"].some((ext) => material.file_name.toLowerCase().endsWith(ext));

  const idx = items.findIndex((m) => m.id === material.id);
  const hasPrev = idx > 0;
  const hasNext = idx < items.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90 backdrop-blur-sm" onClick={onClose}>
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
          >
            <Download className="h-5 w-5" />
          </a>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="rounded-lg p-2 text-gray-400 transition hover:bg-red-500/20 hover:text-red-400"
          >
            <Trash2 className="h-5 w-5" />
          </button>
          <button onClick={onClose} className="rounded-lg p-2 text-gray-400 transition hover:bg-white/10 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="relative flex flex-1 items-center justify-center overflow-hidden px-4 pb-4" onClick={(e) => e.stopPropagation()}>
        {hasPrev && (
          <button
            onClick={() => onNavigate(items[idx - 1])}
            className="absolute left-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}
        {hasNext && (
          <button
            onClick={() => onNavigate(items[idx + 1])}
            className="absolute right-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        )}

        {isImage ? (
          <img src={material.file_url} alt={material.title} className="max-h-full max-w-full rounded-xl object-contain shadow-2xl" />
        ) : isVideo ? (
          <video src={material.file_url} controls autoPlay className="max-h-full max-w-full rounded-xl shadow-2xl" />
        ) : isPdf || isText ? (
          <iframe src={material.file_url} title={material.title} className="h-full w-full max-w-4xl rounded-xl bg-white shadow-2xl" />
        ) : (
          <div className="flex flex-col items-center text-center">
            <FileText className="mb-4 h-16 w-16 text-gray-500" />
            <p className="text-sm text-gray-400">This file type can't be previewed in the browser.</p>
            <a
              href={material.file_url}
              download={material.file_name}
              onClick={(e) => e.stopPropagation()}
              className="mt-4 flex items-center gap-2 rounded-xl bg-gray-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-600"
            >
              <Download className="h-4 w-4" /> Download File
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
