import { useEffect, useState } from "react";
import { Plus, Trash2, Save, X, GripVertical, Upload, Video } from "lucide-react";
import type { QuizQuestion, TrainingMaterial } from "@/lib/training-types";
import { supabase } from "@/lib/supabase";

interface CourseBuilderProps {
  courseId?: string | null;
  initialTitle: string;
  initialDescription: string;
  initialQuestions: QuizQuestion[];
  passingScore: number;
  initialMaterialIds?: string[];
  onSave: () => void;
  onCancel: () => void;
}

interface EditableQuestion {
  id: string;
  question_text: string;
  options: Array<{ id: string; text: string }>;
  correct_option_id: string;
  explanation: string;
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


export default function CourseBuilder({
  courseId, initialTitle, initialDescription, initialQuestions, passingScore, initialMaterialIds = [], onSave, onCancel,
}: CourseBuilderProps) {
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [passScore, setPassScore] = useState(passingScore);
  const [questions, setQuestions] = useState<EditableQuestion[]>(
    initialQuestions.length > 0
      ? initialQuestions.map((q) => ({
          id: q.id,
          question_text: q.question_text,
          options: q.options,
          correct_option_id: q.correct_option_id,
          explanation: q.explanation || "",
        }))
      : [makeNewQuestion()]
  );
  const [materialIds, setMaterialIds] = useState<string[]>(initialMaterialIds);
  const [availableVideos, setAvailableVideos] = useState<TrainingMaterial[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<File | null>(null);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    supabase.from("training_materials").select("*").eq("file_type", "video").order("created_at", { ascending: false })
      .then(({ data }) => setAvailableVideos((data || []) as TrainingMaterial[]));
  }, []);

  async function handleVideoUpload() {
    if (!selectedVideo) return;
    setVideoError(null);
    setUploadingVideo(true);
    setVideoProgress(0);
    try {
      if (selectedVideo.size > VIDEO_MAX_BYTES) throw new Error("Video exceeds the 1 GB limit.");
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Please sign in again to upload videos.");
      const path = `${crypto.randomUUID()}-${selectedVideo.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      await uploadLargeVideo(selectedVideo, path, token, setVideoProgress);
      const { data: urlData } = supabase.storage.from("training-videos").getPublicUrl(path);
      const { data, error } = await supabase.from("training_materials").insert({
        title: selectedVideo.name.replace(/\\.[^.]+$/, ""), description: null,
        file_type: "video", file_name: path, file_url: urlData.publicUrl, file_size: selectedVideo.size,
      }).select("*").single();
      if (error) throw error;
      const material = data as TrainingMaterial;
      setAvailableVideos((prev) => [material, ...prev]);
      setMaterialIds((prev) => [...prev, material.id]);
      setSelectedVideo(null);
    } catch (e) {
      setVideoError(e instanceof Error ? e.message : "Video upload failed");
    } finally {
      setUploadingVideo(false);
    }
  }

  function makeNewQuestion(): EditableQuestion {
    return {
      id: `new-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      question_text: "",
      options: [
        { id: "A", text: "" },
        { id: "B", text: "" },
        { id: "C", text: "" },
        { id: "D", text: "" },
      ],
      correct_option_id: "A",
      explanation: "",
    };
  }

  function addQuestion() {
    setQuestions((prev) => [...prev, makeNewQuestion()]);
  }

  function removeQuestion(idx: number) {
    setQuestions((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateQuestion(idx: number, updates: Partial<EditableQuestion>) {
    setQuestions((prev) => prev.map((q, i) => (i === idx ? { ...q, ...updates } : q)));
  }

  function updateOption(qIdx: number, oIdx: number, text: string) {
    setQuestions((prev) => prev.map((q, i) => {
      if (i !== qIdx) return q;
      return { ...q, options: q.options.map((o, j) => (j === oIdx ? { ...o, text } : o)) };
    }));
  }

  async function handleSave() {
    if (!title.trim()) return;
    const validQuestions = questions.filter((q) => q.question_text.trim() && q.options.every((o) => o.text.trim()));
    if (validQuestions.length === 0 && materialIds.length === 0) { setSaveError("Add a video or at least one complete quiz question."); return; }

    setSaving(true);
    setSaveError(null);
    try {
      let cId = courseId;
      if (cId) {
        const { error: courseError } = await supabase.from("training_courses").update({
          title: title.trim(),
          description: description.trim() || null,
          passing_score: passScore,
          source_material_ids: materialIds,
        }).eq("id", cId);
        if (courseError) {
          if (courseError.message.includes("row-level security") || courseError.code === "42501") {
            throw new Error("Permission denied. Only admin accounts can edit courses. If you are admin, try signing out and back in.");
          }
          throw courseError;
        }
        // Delete old questions
        const { error: deleteError } = await supabase.from("quiz_questions").delete().eq("course_id", cId);
        if (deleteError) {
          if (deleteError.message.includes("row-level security") || deleteError.code === "42501") {
            throw new Error("Permission denied editing quiz questions.");
          }
          throw deleteError;
        }
      } else {
        const { data: newCourse, error: createError } = await supabase.from("training_courses").insert({
          title: title.trim(),
          description: description.trim() || null,
          passing_score: passScore,
          source_material_ids: materialIds,
        }).select().maybeSingle();
        if (createError) {
          if (createError.message.includes("row-level security") || createError.code === "42501") {
            throw new Error("Permission denied. Only admin accounts can create courses.");
          }
          throw createError;
        }
        if (!newCourse) throw new Error("Course creation failed.");
        cId = (newCourse as { id: string }).id;
      }

      if (cId && validQuestions.length > 0) {
        const insertData = validQuestions.map((q, i) => ({
          course_id: cId,
          question_text: q.question_text.trim(),
          options: q.options,
          correct_option_id: q.correct_option_id,
          explanation: q.explanation.trim() || null,
          sort_order: i,
        }));
        const { error: questionError } = await supabase.from("quiz_questions").insert(insertData);
        if (questionError) {
          if (questionError.message.includes("row-level security") || questionError.code === "42501") {
            throw new Error("Permission denied saving quiz questions.");
          }
          throw questionError;
        }
      }

      onSave();
    } catch (e) {
      console.error("Save course error:", e);
      setSaveError(e instanceof Error ? e.message : "Unable to save course.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-50" onClick={onCancel}>
      <div className="flex-1 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto max-w-2xl px-5 py-6">
          {/* Header */}
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900">{courseId ? "Edit Course" : "Create Course"}</h2>
            <button onClick={onCancel} className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Course info */}
          <div className="mb-6 space-y-3 rounded-xl border border-gray-200 bg-white p-5">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">Course Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Product Identification Basics"
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-gray-400 focus:bg-white"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">Description (optional)</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of what this course covers..."
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-gray-400 focus:bg-white"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">Passing Score: {passScore}%</label>
              <input
                type="range"
                min="50" max="100" step="5"
                value={passScore}
                onChange={(e) => setPassScore(Number(e.target.value))}
                className="w-full"
              />
            </div>
          </div>

          {/* Course videos */}
          <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Video className="h-4 w-4" /> Course Videos</h3>
            <p className="mb-3 text-xs text-gray-500">Attach existing videos or upload a new video directly to this course (up to 1 GB).</p>
            <div className="space-y-2">
              {availableVideos.map((video) => (
                <label key={video.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={materialIds.includes(video.id)} onChange={(e) => setMaterialIds((prev) => e.target.checked ? [...prev, video.id] : prev.filter((id) => id !== video.id))} />
                  <span className="truncate">{video.title}</span>
                </label>
              ))}
            </div>
            <input type="file" accept="video/*,.mp4,.mov,.webm" className="mt-4 block w-full text-sm" disabled={uploadingVideo} onChange={(e) => setSelectedVideo(e.target.files?.[0] || null)} />
            <button type="button" onClick={handleVideoUpload} disabled={!selectedVideo || uploadingVideo} className="mt-2 flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-40">
              <Upload className="h-4 w-4" /> {uploadingVideo ? `Uploading ${videoProgress}%` : "Upload & Attach Video"}
            </button>
            {uploadingVideo && <progress className="mt-2 w-full" value={videoProgress} max={100} />}
            {videoError && <p role="alert" className="mt-2 text-sm text-red-600">{videoError}</p>}
          </div>

          {/* Questions */}
          <div className="space-y-4">
            {questions.map((q, qIdx) => (
              <div key={q.id} className="rounded-xl border border-gray-200 bg-white p-5">
                <div className="mb-3 flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                    <GripVertical className="h-4 w-4 text-gray-300" />
                    Question {qIdx + 1}
                  </span>
                  {questions.length > 1 && (
                    <button
                      onClick={() => removeQuestion(qIdx)}
                      className="rounded-lg p-1.5 text-gray-400 transition hover:bg-red-50 hover:text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>

                <textarea
                  value={q.question_text}
                  onChange={(e) => updateQuestion(qIdx, { question_text: e.target.value })}
                  placeholder="Enter your question..."
                  rows={2}
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-gray-400 focus:bg-white"
                />

                <div className="mt-3 space-y-2">
                  {q.options.map((opt, oIdx) => (
                    <div key={opt.id} className="flex items-center gap-2">
                      <button
                        onClick={() => updateQuestion(qIdx, { correct_option_id: opt.id })}
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition ${
                          q.correct_option_id === opt.id
                            ? "bg-emerald-500 text-white"
                            : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                        }`}
                        title="Mark as correct answer"
                      >
                        {opt.id}
                      </button>
                      <input
                        type="text"
                        value={opt.text}
                        onChange={(e) => updateOption(qIdx, oIdx, e.target.value)}
                        placeholder={`Option ${opt.id}...`}
                        className={`flex-1 rounded-lg border px-3 py-2 text-sm outline-none transition ${
                          q.correct_option_id === opt.id
                            ? "border-emerald-300 bg-emerald-50/50 focus:border-emerald-400"
                            : "border-gray-200 bg-gray-50 focus:border-gray-400 focus:bg-white"
                        }`}
                      />
                      {q.correct_option_id === opt.id && (
                        <span className="text-xs font-medium text-emerald-600">Correct</span>
                      )}
                    </div>
                  ))}
                </div>

                <div className="mt-3">
                  <label className="mb-1 block text-xs font-medium text-gray-400">Explanation (optional, shown after answering)</label>
                  <input
                    type="text"
                    value={q.explanation}
                    onChange={(e) => updateQuestion(qIdx, { explanation: e.target.value })}
                    placeholder="Why is the correct answer right?"
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-gray-400 focus:bg-white"
                  />
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={addQuestion}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 py-3 text-sm font-medium text-gray-500 transition hover:border-gray-400 hover:bg-white"
          >
            <Plus className="h-4 w-4" /> Add Question
          </button>

          {saveError && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{saveError}</p>}

          {/* Save bar */}
          <div className="sticky bottom-0 mt-6 -mx-5 flex gap-2 border-t border-gray-200 bg-white/90 px-5 py-4 backdrop-blur">
            <button
              onClick={onCancel}
              className="flex-1 rounded-xl bg-gray-100 py-3 text-sm font-medium text-gray-600 transition hover:bg-gray-200"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!title.trim() || saving || uploadingVideo}
              className="flex flex-[2] items-center justify-center gap-2 rounded-xl bg-gray-900 py-3 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-40"
            >
              <Save className="h-4 w-4" /> {saving ? "Saving..." : "Save Course"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
