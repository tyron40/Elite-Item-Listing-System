import { useEffect, useState, useCallback } from "react";
import {
  FileText, Image as ImageIcon, Video, Upload, Trash2,
  Loader2, Plus, X, Download, Maximize2, Calendar, HardDrive,
  ChevronLeft, ChevronRight, FolderPlus, Edit3, Folder, Check,
  BookOpen, Library, GraduationCap, Play, Award,
  Pencil, Trophy,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import type {
  TrainingMaterial, TrainingFolder,
  TrainingCourse, QuizQuestion, QuizAttempt,
} from "@/lib/training-types";
import QuizPlayer from "@/components/QuizPlayer";
import CourseBuilder from "@/components/CourseBuilder";

const BUCKET_MAP: Record<string, string> = {
  document: "training-documents",
  image: "training-images",
  video: "training-videos",
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

function uploadWithProgress(bucket: string, path: string, file: File, onProgress: (pct: number) => void, accessToken: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const url = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/${bucket}/${path}`;
    xhr.open("POST", url);
    xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.setRequestHeader("x-upsert", "false");

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        try {
          const err = JSON.parse(xhr.responseText);
          reject(new Error(err.message || `Upload failed (${xhr.status})`));
        } catch {
          reject(new Error(`Upload failed (${xhr.status})`));
        }
      }
    };

    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(file);
  });
}

const VIDEO_MAX_BYTES = 1024 * 1024 * 1024;

function encodeTusMetadata(value: string): string {
  return btoa(Array.from(new TextEncoder().encode(value), (byte) => String.fromCharCode(byte)).join(""));
}

async function uploadLargeVideo(
  file: File, path: string, token: string, onProgress: (pct: number) => void,
): Promise<void> {
  const storageUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!storageUrl || !token) throw new Error("Storage authentication is unavailable. Please sign in again.");
  const endpoint = `${storageUrl}/storage/v1/upload/resumable`;
  const headers = {
    authorization: `Bearer ${token}`,
    apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
    "tus-resumable": "1.0.0",
  };
  const metadata = [
    ["bucketName", "training-videos"],
    ["objectName", path],
    ["contentType", file.type || "video/mp4"],
    ["cacheControl", "3600"],
  ].map(([key, value]) => `${key} ${encodeTusMetadata(value)}`).join(",");
  const created = await fetch(endpoint, {
    method: "POST",
    headers: { ...headers, "upload-length": String(file.size), "upload-metadata": metadata, "x-upsert": "false" },
  });
  if (!created.ok) throw new Error(`Could not start video upload (${created.status}): ${await created.text()}`);
  const location = created.headers.get("location");
  if (!location) throw new Error("Storage did not return an upload URL.");
  const url = new URL(location, endpoint).toString();
  const chunkSize = 6 * 1024 * 1024;
  let offset = 0;
  while (offset < file.size) {
    let completed = false;
    for (let attempt = 0; attempt < 5 && !completed; attempt++) {
      try {
        const patch = await fetch(url, {
          method: "PATCH",
          headers: { ...headers, "content-type": "application/offset+octet-stream", "upload-offset": String(offset) },
          body: file.slice(offset, offset + chunkSize),
        });
        if (!patch.ok) throw new Error(`Video upload failed (${patch.status}): ${await patch.text()}`);
        offset = Number(patch.headers.get("upload-offset") ?? Math.min(offset + chunkSize, file.size));
        if (!Number.isFinite(offset) || offset > file.size) throw new Error("Invalid upload offset returned by storage.");
        onProgress(Math.round((offset / file.size) * 100));
        completed = true;
      } catch (error) {
        if (attempt === 4) throw error;
        await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
        const head = await fetch(url, { method: "HEAD", headers });
        if (head.ok) {
          const serverOffset = Number(head.headers.get("upload-offset"));
          if (Number.isFinite(serverOffset) && serverOffset >= 0 && serverOffset <= file.size) offset = serverOffset;
        }
      }
    }
  }
}

type SubView = "library" | "academy";

export default function TrainingMaterials({ isAdmin }: { isAdmin?: boolean }) {
  const [subView, setSubView] = useState<SubView>("library");

  return (
    <div className="space-y-5">
      {/* Professional header */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <div className="flex flex-col gap-4 bg-gradient-to-r from-gray-900 to-gray-800 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20">
              <GraduationCap className="h-6 w-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Training Center</h2>
              <p className="text-sm text-gray-400">Manage learning materials and course quizzes</p>
            </div>
          </div>
          {/* Sub-tab toggle */}
          <div className="flex gap-1 rounded-xl bg-white/10 p-1">
            <button
              onClick={() => setSubView("library")}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
                subView === "library" ? "bg-white text-gray-900" : "text-gray-300 hover:text-white"
              }`}
            >
              <Library className="h-4 w-4" /> Library
            </button>
            <button
              onClick={() => setSubView("academy")}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
                subView === "academy" ? "bg-white text-gray-900" : "text-gray-300 hover:text-white"
              }`}
            >
              <BookOpen className="h-4 w-4" /> Courses
            </button>
          </div>
        </div>
      </div>

      {subView === "library" ? <LibraryView isAdmin={isAdmin} /> : <CoursesView isAdmin={isAdmin} />}
    </div>
  );
}

/* =========================== LIBRARY =========================== */

function LibraryView({ isAdmin }: { isAdmin?: boolean }) {
  const [materials, setMaterials] = useState<TrainingMaterial[]>([]);
  const [folders, setFolders] = useState<TrainingFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadFolderId, setUploadFolderId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [viewerMaterial, setViewerMaterial] = useState<TrainingMaterial | null>(null);
  const [showFolderInput, setShowFolderInput] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState("");
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

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    const maxOrder = folders.length > 0 ? Math.max(...folders.map((f) => f.sort_order)) : 0;
    const { data } = await supabase.from("training_folders").insert({ name: newFolderName.trim(), sort_order: maxOrder + 1 }).select().maybeSingle();
    if (data) setFolders((prev) => [...prev, data as TrainingFolder]);
    setNewFolderName("");
    setShowFolderInput(false);
  };

  const handleRenameFolder = async (id: string) => {
    if (!editingFolderName.trim()) return;
    const { data, error: renameError } = await supabase.from("training_folders").update({ name: editingFolderName.trim() }).eq("id", id).select("id").maybeSingle();
    if (renameError) {
      if (renameError.message.includes("row-level security") || renameError.code === "42501") {
        setError("Permission denied. Only admin accounts can rename folders.");
      } else {
        setError(renameError.message);
      }
      return;
    }
    if (!data) { setError("Folder could not be updated. You may not have admin access."); return; }
    setError(null);
    setFolders((prev) => prev.map((f) => (f.id === id ? { ...f, name: editingFolderName.trim() } : f)));
    setEditingFolderId(null);
    setEditingFolderName("");
  };

  const handleDeleteFolder = async (folder: TrainingFolder) => {
    await supabase.from("training_folders").delete().eq("id", folder.id);
    setFolders((prev) => prev.filter((f) => f.id !== folder.id));
    setMaterials((prev) => prev.map((m) => (m.folder_id === folder.id ? { ...m, folder_id: null } : m)));
    if (activeFolderId === folder.id) setActiveFolderId(null);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setSelectedFile(file);
    if (!newTitle) setNewTitle(file.name.replace(/\.[^/.]+$/, ""));
  };

  const handleUpload = async () => {
    if (!selectedFile || !newTitle.trim()) return;
    setUploading(true);
    setUploadProgress(0);
    setError(null);
    try {
      const fileType = detectFileType(selectedFile);
      const bucket = BUCKET_MAP[fileType];
      const fileExt = selectedFile.name.split(".").pop() || "";
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${fileExt}`;

      if (fileType === "video" && selectedFile.size > VIDEO_MAX_BYTES) {
        throw new Error("This video exceeds the 1 GB per-file limit. Please compress it and try again.");
      }
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      if (!token) throw new Error("Your session expired. Please sign in again.");
      if (fileType === "video") {
        await uploadLargeVideo(selectedFile, fileName, token, setUploadProgress);
      } else {
        await uploadWithProgress(bucket, fileName, selectedFile, setUploadProgress, token);
      }
      const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(fileName);
      const { error: insertError } = await supabase.from("training_materials").insert({
        title: newTitle.trim(), description: newDescription.trim() || null,
        file_type: fileType, file_url: urlData.publicUrl, file_name: selectedFile.name,
        file_size: selectedFile.size, folder_id: uploadFolderId,
      });
      if (insertError) {
        if (insertError.message.includes("row-level security") || insertError.code === "42501") {
          throw new Error("Permission denied. Only admin accounts can upload materials. If you are admin, try signing out and back in.");
        }
        throw new Error(insertError.message);
      }
      setNewTitle(""); setNewDescription(""); setSelectedFile(null);
      setUploadFolderId(activeFolderId); setShowUploadForm(false);
      fetchAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      setUploadProgress(0);
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
    if (!editingMaterial || !editTitle.trim() || savingEdit) return;
    setSavingEdit(true);
    setError(null);
    try {
      const { data, error: saveError } = await supabase.from("training_materials").update({
        title: editTitle.trim(), description: editDescription.trim() || null, folder_id: editFolderId,
      }).eq("id", editingMaterial.id).select("id").maybeSingle();
      if (saveError) {
        if (saveError.message.includes("row-level security") || saveError.code === "42501") {
          throw new Error("Permission denied. Only admin accounts can edit materials. If you are admin, try signing out and back in.");
        }
        throw new Error(saveError.message);
      }
      if (!data) throw new Error("Changes were not saved. You may not have admin access.");
      setMaterials((prev) => prev.map((m) => m.id === editingMaterial.id
        ? { ...m, title: editTitle.trim(), description: editDescription.trim() || null, folder_id: editFolderId } : m));
      setEditingMaterial(null); setEditTitle(""); setEditDescription(""); setEditFolderId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save changes");
    } finally {
      setSavingEdit(false);
    }
  };

  const startEdit = (material: TrainingMaterial) => {
    setEditingMaterial(material);
    setEditTitle(material.title);
    setEditDescription(material.description || "");
    setEditFolderId(material.folder_id);
  };

  const visibleMaterials = activeFolderId ? materials.filter((m) => m.folder_id === activeFolderId) : materials;
  const folderName = activeFolderId ? folders.find((f) => f.id === activeFolderId)?.name || "Folder" : "All Materials";
  const folderCount = (fid: string | null) => fid ? materials.filter((m) => m.folder_id === fid).length : materials.length;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-5 py-4">
        <div>
          <h3 className="text-sm font-bold text-gray-900">Training Materials</h3>
          <p className="text-xs text-gray-400">{materials.length} items across {folders.length} folders</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => { setUploadFolderId(activeFolderId); setShowUploadForm(!showUploadForm); }}
            className="flex items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800"
          >
            <Upload className="h-4 w-4" /> Upload
          </button>
        )}
      </div>

      {error && !showUploadForm && !editingMaterial && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {/* Folder tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto rounded-xl border border-gray-200 bg-white px-4 py-3">
        <button
          onClick={() => setActiveFolderId(null)}
          className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
            activeFolderId === null ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          <Folder className="h-3.5 w-3.5" /> All
          <span className={`rounded-full px-1.5 py-0.5 text-xs ${activeFolderId === null ? "bg-white/20" : "bg-gray-200"}`}>{folderCount(null)}</span>
        </button>
        {folders.map((folder) => (
          <div key={folder.id} className="flex shrink-0 items-center">
            {editingFolderId === folder.id ? (
              <div className="flex items-center gap-1 rounded-lg bg-gray-100 px-2 py-1">
                <input autoFocus value={editingFolderName} onChange={(e) => setEditingFolderName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleRenameFolder(folder.id); if (e.key === "Escape") { setEditingFolderId(null); setEditingFolderName(""); } }}
                  className="w-24 rounded border border-gray-300 bg-white px-2 py-0.5 text-sm outline-none focus:border-gray-400" />
                <button onClick={() => handleRenameFolder(folder.id)} className="p-0.5 text-gray-600 hover:text-gray-900"><Check className="h-3.5 w-3.5" /></button>
                <button onClick={() => { setEditingFolderId(null); setEditingFolderName(""); }} className="p-0.5 text-gray-400 hover:text-gray-600"><X className="h-3.5 w-3.5" /></button>
              </div>
            ) : (
              <div className="group flex items-center">
                <button onClick={() => setActiveFolderId(folder.id)}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                    activeFolderId === folder.id ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}>
                  <Folder className="h-3.5 w-3.5" /> {folder.name}
                  <span className={`rounded-full px-1.5 py-0.5 text-xs ${activeFolderId === folder.id ? "bg-white/20" : "bg-gray-200"}`}>{folderCount(folder.id)}</span>
                </button>
                {isAdmin && (<>
                  <button onClick={() => { setEditingFolderId(folder.id); setEditingFolderName(folder.name); }}
                    className="ml-0.5 rounded p-0.5 text-gray-400 opacity-0 transition hover:text-gray-700 group-hover:opacity-100 focus:opacity-100 max-md:opacity-100"><Edit3 className="h-3 w-3" /></button>
                  <button onClick={() => handleDeleteFolder(folder)}
                    className="rounded p-0.5 text-gray-400 opacity-0 transition hover:text-red-500 group-hover:opacity-100 focus:opacity-100 max-md:opacity-100"><Trash2 className="h-3 w-3" /></button>
                </>)}
              </div>
            )}
          </div>
        ))}
        {showFolderInput ? (
          <div className="flex shrink-0 items-center gap-1 rounded-lg bg-gray-100 px-2 py-1">
            <input autoFocus value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleCreateFolder(); if (e.key === "Escape") { setShowFolderInput(false); setNewFolderName(""); } }}
              placeholder="Folder name..." className="w-28 rounded border border-gray-300 bg-white px-2 py-0.5 text-sm outline-none focus:border-gray-400" />
            <button onClick={handleCreateFolder} className="p-0.5 text-gray-600 hover:text-gray-900"><Check className="h-3.5 w-3.5" /></button>
            <button onClick={() => { setShowFolderInput(false); setNewFolderName(""); }} className="p-0.5 text-gray-400 hover:text-gray-600"><X className="h-3.5 w-3.5" /></button>
          </div>
        ) : (
          <>
            {isAdmin && (
              <button onClick={() => setShowFolderInput(true)}
                className="flex shrink-0 items-center gap-1 rounded-lg border border-dashed border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-500 transition hover:border-gray-400 hover:text-gray-700">
                <FolderPlus className="h-3.5 w-3.5" /> New Tab
              </button>
            )}
          </>
        )}
      </div>

      {/* Upload form */}
      {showUploadForm && (
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">Upload Material</h3>
            <button onClick={() => setShowUploadForm(false)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"><X className="h-4 w-4" /></button>
          </div>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">Title</label>
              <input type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Name this material..."
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none transition focus:border-gray-400 focus:bg-white" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">Description (optional)</label>
              <input type="text" value={newDescription} onChange={(e) => setNewDescription(e.target.value)} placeholder="Brief description..."
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none transition focus:border-gray-400 focus:bg-white" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">Folder</label>
              <select value={uploadFolderId || ""} onChange={(e) => setUploadFolderId(e.target.value || null)}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-gray-400">
                <option value="">All Materials (no folder)</option>
                {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">File</label>
              <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-3 text-sm text-gray-500 transition hover:border-gray-400 hover:bg-white">
                <Upload className="h-5 w-5" />
                {selectedFile ? (
                  <div className="min-w-0"><p className="truncate font-medium text-gray-700">{selectedFile.name}</p><p className="text-xs text-gray-400">{formatFileSize(selectedFile.size)}</p></div>
                ) : <span>Click to select a file from your device</span>}
                <input type="file" accept=".pdf,.doc,.docx,.txt,.rtf,.odt,.pages,image/*,video/*" onChange={handleFileSelect} className="hidden" />
              </label>
            </div>
            {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 ring-1 ring-red-200">{error}</div>}
            {uploading && uploadProgress > 0 && (
              <div className="space-y-1">
                <div className="h-2 overflow-hidden rounded-full bg-gray-200">
                  <div className="h-full rounded-full bg-emerald-500 transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                </div>
                <p className="text-center text-xs text-gray-400">{uploadProgress}% uploaded</p>
              </div>
            )}
            <button onClick={handleUpload} disabled={!selectedFile || !newTitle.trim() || uploading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-gray-900 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50">
              {uploading ? <><Loader2 className="h-4 w-4 animate-spin" /> {uploadProgress > 0 ? `${uploadProgress}%` : "Uploading..."}</> : <><Upload className="h-4 w-4" /> Upload</>}
            </button>
          </div>
        </div>
      )}

      {/* Edit form */}
      {editingMaterial && (
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">Edit Material</h3>
            <button onClick={() => setEditingMaterial(null)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"><X className="h-4 w-4" /></button>
          </div>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">Title</label>
              <input type="text" value={editTitle} onChange={(e) => setEditTitle(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-gray-400 focus:bg-white" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">Description</label>
              <input type="text" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} placeholder="Brief description..."
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-gray-400 focus:bg-white" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">Folder</label>
              <select value={editFolderId || ""} onChange={(e) => setEditFolderId(e.target.value || null)}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-gray-400">
                <option value="">All Materials (no folder)</option>
                {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
            <button onClick={handleSaveEdit} disabled={!editTitle.trim() || savingEdit}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-gray-900 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-50">
              <Check className="h-4 w-4" /> {savingEdit ? "Saving..." : "Save Changes"}
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

      {/* Materials grid */}
      {!loading && (
        <div>
          {visibleMaterials.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-12 text-center">
              <Folder className="mx-auto mb-2 h-10 w-10 text-gray-300" />
              <p className="text-sm font-medium text-gray-500">No materials in {folderName}</p>
              <p className="mt-1 text-xs text-gray-400">Click Upload to add content here</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {visibleMaterials.map((material) => {
                const Icon = TYPE_ICON[material.file_type];
                return (
                  <div key={material.id} className="group flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white transition hover:shadow-lg">
                    <button onClick={() => setViewerMaterial(material)}
                      className="relative block w-full overflow-hidden bg-gray-100"
                      style={{ aspectRatio: material.file_type === "video" ? "16/9" : material.file_type === "image" ? "1/1" : "5/2" }}>
                      {material.file_type === "image" ? (
                        <img src={material.file_url} alt={material.title} className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
                      ) : material.file_type === "video" ? (
                        <><video src={material.file_url} className="h-full w-full object-cover" preload="metadata" />
                          <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90"><Video className="h-5 w-5 text-gray-700" /></div>
                          </div></>
                      ) : (
                        <div className="flex h-full items-center justify-center gap-3 bg-gradient-to-br from-gray-50 to-gray-100">
                          <Icon className="h-8 w-8 text-gray-300" />
                          <span className="text-xs uppercase text-gray-400">{material.file_name.split(".").pop()}</span>
                        </div>
                      )}
                      <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/10 group-hover:opacity-100">
                        <Maximize2 className="h-5 w-5 text-white drop-shadow" />
                      </div>
                    </button>
                    <div className="flex flex-1 flex-col p-4">
                      <p className="truncate text-sm font-semibold text-gray-800">{material.title}</p>
                      {material.description && <p className="mt-0.5 truncate text-xs text-gray-500">{material.description}</p>}
                      <div className="mt-2 flex items-center gap-3 text-xs text-gray-400">
                        <span className="flex items-center gap-1"><HardDrive className="h-3 w-3" /> {formatFileSize(material.file_size)}</span>
                        <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {formatDate(material.created_at)}</span>
                      </div>
                      <div className="mt-3 flex items-center gap-1 border-t border-gray-100 pt-3">
                        <button onClick={() => setViewerMaterial(material)}
                          className="flex flex-1 items-center justify-center gap-1 rounded-md py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-100">
                          <Maximize2 className="h-3.5 w-3.5" /> Open
                        </button>
                        {isAdmin && (<>
                          <button onClick={() => startEdit(material)}
                            className="flex items-center justify-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-gray-500 transition hover:bg-gray-100">
                            <Edit3 className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => handleDeleteMaterial(material)}
                            className="flex items-center justify-center rounded-md px-2.5 py-1.5 text-gray-400 transition hover:bg-red-50 hover:text-red-500">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {viewerMaterial && (
        <ContentViewer material={viewerMaterial} items={visibleMaterials}
          onClose={() => setViewerMaterial(null)} onNavigate={setViewerMaterial}
          onDelete={() => { handleDeleteMaterial(viewerMaterial); setViewerMaterial(null); }} isAdmin={isAdmin} />
      )}
    </div>
  );
}

/* =========================== ACADEMY =========================== */

function CoursesView({ isAdmin }: { isAdmin?: boolean }) {
  const [courses, setCourses] = useState<TrainingCourse[]>([]);
  const [questions, setQuestions] = useState<Record<string, QuizQuestion[]>>({});
  const [attempts, setAttempts] = useState<Record<string, QuizAttempt[]>>({});
  const [folders, setFolders] = useState<TrainingFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [showCourseBuilder, setShowCourseBuilder] = useState(false);
  const [editingCourse, setEditingCourse] = useState<{ course: TrainingCourse; questions: QuizQuestion[] } | null>(null);
  const [playingCourse, setPlayingCourse] = useState<{ course: TrainingCourse; questions: QuizQuestion[] } | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [courseRes, folderRes] = await Promise.all([
      supabase.from("training_courses").select("*").order("created_at", { ascending: false }),
      supabase.from("training_folders").select("*").order("sort_order", { ascending: true }),
    ]);
    const courseList = (courseRes.data || []) as TrainingCourse[];
    setCourses(courseList);
    setFolders((folderRes.data || []) as TrainingFolder[]);

    const qMap: Record<string, QuizQuestion[]> = {};
    const aMap: Record<string, QuizAttempt[]> = {};
    for (const course of courseList) {
      const [qRes, aRes] = await Promise.all([
        supabase.from("quiz_questions").select("*").eq("course_id", course.id).order("sort_order", { ascending: true }),
        supabase.from("quiz_attempts").select("*").eq("course_id", course.id).order("created_at", { ascending: false }).limit(5),
      ]);
      if (qRes.data) qMap[course.id] = qRes.data as QuizQuestion[];
      if (aRes.data) aMap[course.id] = aRes.data as QuizAttempt[];
    }
    setQuestions(qMap);
    setAttempts(aMap);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const visibleCourses = activeFolderId ? courses.filter((c) => c.folder_id === activeFolderId) : courses;
  const lastAttempt = (courseId: string) => attempts[courseId]?.[0];

  const handleDeleteCourse = async (course: TrainingCourse) => {
    await supabase.from("training_courses").delete().eq("id", course.id);
    setCourses((prev) => prev.filter((c) => c.id !== course.id));
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-5 py-4">
        <div>
          <h3 className="text-sm font-bold text-gray-900">Training Courses</h3>
          <p className="text-xs text-gray-400">{courses.length} courses with quizzes</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => { setEditingCourse(null); setShowCourseBuilder(true); }}
            className="flex items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800"
          >
            <Plus className="h-4 w-4" /> Create Course
          </button>
        )}
      </div>

      {/* Folder filter */}
      {folders.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto rounded-xl border border-gray-200 bg-white px-4 py-3">
          <button onClick={() => setActiveFolderId(null)}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              activeFolderId === null ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}>
            <Folder className="h-3.5 w-3.5" /> All
          </button>
          {folders.map((f) => (
            <button key={f.id} onClick={() => setActiveFolderId(f.id)}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                activeFolderId === f.id ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}>
              <Folder className="h-3.5 w-3.5" /> {f.name}
            </button>
          ))}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          <p className="mt-2 text-sm text-gray-400">Loading courses...</p>
        </div>
      )}

      {/* Courses */}
      {!loading && (
        <div>
          {visibleCourses.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-12 text-center">
              <BookOpen className="mx-auto mb-2 h-10 w-10 text-gray-300" />
              <p className="text-sm font-medium text-gray-500">No courses yet</p>
              <p className="mt-1 text-xs text-gray-400">Click Create Course to build a quiz</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visibleCourses.map((course) => {
                const courseQuestions = questions[course.id] || [];
                const last = lastAttempt(course.id);
                const courseAttempts = attempts[course.id] || [];
                const bestScore = courseAttempts.length > 0 ? Math.max(...courseAttempts.map((a) => a.score)) : null;
                return (
                  <div key={course.id} className="group flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white transition hover:shadow-lg">
                    <div className="flex items-center justify-between bg-gradient-to-r from-gray-50 to-gray-100 px-5 py-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-900">
                        <GraduationCap className="h-5 w-5 text-white" />
                      </div>
                    </div>
                    <div className="flex flex-1 flex-col p-5">
                      <p className="text-sm font-bold text-gray-900">{course.title}</p>
                      {course.description && <p className="mt-1 line-clamp-2 text-xs text-gray-500">{course.description}</p>}

                      <div className="mt-4 flex items-center gap-4 text-xs text-gray-400">
                        <span className="flex items-center gap-1"><BookOpen className="h-3.5 w-3.5" /> {courseQuestions.length} Qs</span>
                        <span className="flex items-center gap-1"><Award className="h-3.5 w-3.5" /> {course.passing_score}% to pass</span>
                      </div>

                      {bestScore !== null && (
                        <div className="mt-3 flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2">
                          <Trophy className="h-4 w-4 text-amber-500" />
                          <span className="text-xs text-gray-500">Best: <span className={`font-bold ${last?.passed ? "text-emerald-600" : "text-gray-700"}`}>{bestScore}%</span></span>
                          {last && (
                            <span className={`ml-auto text-xs font-medium ${last.passed ? "text-emerald-600" : "text-red-500"}`}>
                              {last.passed ? "Passed" : "Failed"}
                            </span>
                          )}
                        </div>
                      )}

                      <div className="mt-4 flex items-center gap-2 border-t border-gray-100 pt-4">
                        <button
                          onClick={() => setPlayingCourse({ course, questions: courseQuestions })}
                          disabled={courseQuestions.length === 0}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-40"
                        >
                          <Play className="h-3.5 w-3.5" /> Start Quiz
                        </button>
                        {isAdmin && (<>
                          <button
                            onClick={() => { setEditingCourse({ course, questions: courseQuestions }); setShowCourseBuilder(true); }}
                            className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteCourse(course)}
                            className="rounded-lg p-2 text-gray-400 transition hover:bg-red-50 hover:text-red-500"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Course builder */}
      {showCourseBuilder && (
        <CourseBuilder
          courseId={editingCourse?.course.id || null}
          initialTitle={editingCourse?.course.title || ""}
          initialDescription={editingCourse?.course.description || ""}
          initialQuestions={editingCourse?.questions || []}
          passingScore={editingCourse?.course.passing_score || 70}
          onSave={() => { setShowCourseBuilder(false); setEditingCourse(null); fetchAll(); }}
          onCancel={() => { setShowCourseBuilder(false); setEditingCourse(null); }}
        />
      )}

      {/* Quiz player */}
      {playingCourse && (
        <QuizPlayer
          course={playingCourse.course}
          questions={playingCourse.questions}
          onClose={() => setPlayingCourse(null)}
          onCompleted={fetchAll}
        />
      )}
    </div>
  );
}

/* =========================== VIEWER =========================== */

function ContentViewer({
  material, items, onClose, onNavigate, onDelete, isAdmin,
}: {
  material: TrainingMaterial;
  items: TrainingMaterial[];
  onClose: () => void;
  onNavigate: (m: TrainingMaterial) => void;
  onDelete: () => void;
  isAdmin?: boolean;
}) {
  const [textContent, setTextContent] = useState<string | null>(null);
  const [textError, setTextError] = useState(false);

  const isPdf = material.file_name.toLowerCase().endsWith(".pdf") || material.file_url.toLowerCase().includes(".pdf");
  const isImage = material.file_type === "image";
  const isVideo = material.file_type === "video";
  const isText = [".txt", ".rtf", ".csv", ".log", ".md"].some((ext) => material.file_name.toLowerCase().endsWith(ext));
  const idx = items.findIndex((m) => m.id === material.id);
  const hasPrev = idx > 0;
  const hasNext = idx < items.length - 1;

  useEffect(() => {
    setTextContent(null);
    setTextError(false);
    if (!isText) return;
    let cancelled = false;
    fetch(material.file_url)
      .then((res) => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.text(); })
      .then((text) => { if (!cancelled) setTextContent(text); })
      .catch(() => { if (!cancelled) setTextError(true); });
    return () => { cancelled = true; };
  }, [material.file_url, isText]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90 backdrop-blur-sm" onClick={onClose}>
      <div className="flex items-center justify-between px-4 py-3" onClick={(e) => e.stopPropagation()}>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-white">{material.title}</p>
          <p className="truncate text-xs text-gray-400">{material.file_name} · {formatFileSize(material.file_size)}</p>
        </div>
        <div className="flex items-center gap-1">
          <a href={material.file_url} download={material.file_name} onClick={(e) => e.stopPropagation()}
            className="rounded-lg p-2 text-gray-400 transition hover:bg-white/10 hover:text-white"><Download className="h-5 w-5" /></a>
          {isAdmin && <button onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="rounded-lg p-2 text-gray-400 transition hover:bg-red-500/20 hover:text-red-400"><Trash2 className="h-5 w-5" /></button>}
          <button onClick={onClose} className="rounded-lg p-2 text-gray-400 transition hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button>
        </div>
      </div>
      <div className="relative flex flex-1 items-center justify-center overflow-hidden px-4 pb-4" onClick={(e) => e.stopPropagation()}>
        {hasPrev && <button onClick={() => onNavigate(items[idx - 1])}
          className="absolute left-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"><ChevronLeft className="h-6 w-6" /></button>}
        {hasNext && <button onClick={() => onNavigate(items[idx + 1])}
          className="absolute right-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"><ChevronRight className="h-6 w-6" /></button>}

        <div className="flex max-h-full max-w-full flex-col items-center">
          {isImage ? <img src={material.file_url} alt={material.title} className="max-h-[80vh] max-w-full rounded-xl object-contain shadow-2xl" />
          : isVideo ? <video src={material.file_url} controls autoPlay className="max-h-[80vh] max-w-full rounded-xl shadow-2xl" />
          : isText ? (
            <div className="flex h-[80vh] w-full max-w-4xl flex-col rounded-xl bg-white shadow-2xl">
              {textContent === null && !textError ? (
                <div className="flex flex-1 items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-gray-300" />
                </div>
              ) : textError ? (
                <div className="flex flex-1 flex-col items-center justify-center text-center">
                  <FileText className="mb-4 h-16 w-16 text-gray-300" />
                  <p className="text-sm text-gray-400">Couldn't load this document in the viewer.</p>
                  <a href={material.file_url} download={material.file_name} onClick={(e) => e.stopPropagation()}
                    className="mt-4 flex items-center gap-2 rounded-xl bg-gray-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-600"><Download className="h-4 w-4" /> Download File</a>
                </div>
              ) : (
                <div className="flex-1 overflow-auto p-6">
                  <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-gray-800">{textContent}</pre>
                </div>
              )}
            </div>
          )
          : isPdf ? <iframe src={material.file_url} title={material.title} className="h-[80vh] w-full max-w-4xl rounded-xl bg-white shadow-2xl" />
          : <div className="flex flex-col items-center text-center"><FileText className="mb-4 h-16 w-16 text-gray-500" />
              <p className="text-sm text-gray-400">This file type can't be previewed in the browser.</p>
              <a href={material.file_url} download={material.file_name} onClick={(e) => e.stopPropagation()}
                className="mt-4 flex items-center gap-2 rounded-xl bg-gray-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-600"><Download className="h-4 w-4" /> Download File</a></div>}

          {material.description && (
            <div className="mt-3 max-w-2xl rounded-xl bg-white/10 px-4 py-2.5 text-center backdrop-blur-sm">
              <p className="text-sm leading-relaxed text-gray-200">{material.description}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
