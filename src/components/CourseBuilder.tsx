import { useState } from "react";
import { Plus, Trash2, Save, X, GripVertical } from "lucide-react";
import type { QuizQuestion } from "@/lib/training-types";
import { supabase } from "@/lib/supabase";

interface CourseBuilderProps {
  courseId?: string | null;
  initialTitle: string;
  initialDescription: string;
  initialQuestions: QuizQuestion[];
  passingScore: number;
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

export default function CourseBuilder({
  courseId, initialTitle, initialDescription, initialQuestions, passingScore, onSave, onCancel,
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
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

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
    if (validQuestions.length === 0) return;

    setSaving(true);
    setSaveError(null);
    try {
      let cId = courseId;
      if (cId) {
        const { error: courseError } = await supabase.from("training_courses").update({
          title: title.trim(),
          description: description.trim() || null,
          passing_score: passScore,
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
          source_material_ids: [],
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

      if (cId) {
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
              disabled={!title.trim() || saving}
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
