import { useState } from "react";
import { Check, X, ChevronRight, ChevronLeft, RotateCcw, Trophy, AlertCircle } from "lucide-react";
import type { QuizQuestion, TrainingCourse } from "@/lib/training-types";
import { supabase } from "@/lib/supabase";

interface QuizPlayerProps {
  course: TrainingCourse;
  questions: QuizQuestion[];
  onClose: () => void;
  onCompleted: () => void;
}

export default function QuizPlayer({ course, questions, onClose, onCompleted }: QuizPlayerProps) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState(0);
  const [passed, setPassed] = useState(false);
  const [saving, setSaving] = useState(false);

  const total = questions.length;
  const current = questions[currentIdx];
  const allAnswered = questions.every((q) => answers[q.id]);

  function handleSelect(questionId: string, optionId: string) {
    if (submitted) return;
    setAnswers((prev) => ({ ...prev, [questionId]: optionId }));
  }

  async function handleSubmit() {
    let correct = 0;
    const answerDetails = questions.map((q) => {
      const selected = answers[q.id] || "";
      const isCorrect = selected === q.correct_option_id;
      if (isCorrect) correct++;
      return { question_id: q.id, selected_option_id: selected, correct: isCorrect };
    });

    const pct = Math.round((correct / total) * 100);
    const didPass = pct >= course.passing_score;
    setScore(pct);
    setPassed(didPass);
    setSubmitted(true);
    setSaving(true);

    await supabase.from("quiz_attempts").insert({
      course_id: course.id,
      score: pct,
      passed: didPass,
      answers: answerDetails,
    });
    setSaving(false);
    onCompleted();
  }

  function handleRetry() {
    setAnswers({});
    setSubmitted(false);
    setScore(0);
    setCurrentIdx(0);
  }

  if (submitted) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-2xl" onClick={(e) => e.stopPropagation()}>
          <div className={`mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full ${passed ? "bg-emerald-100" : "bg-red-100"}`}>
            {passed ? <Trophy className="h-10 w-10 text-emerald-600" /> : <AlertCircle className="h-10 w-10 text-red-500" />}
          </div>
          <h2 className={`text-2xl font-bold ${passed ? "text-emerald-700" : "text-red-600"}`}>
            {passed ? "PASSED!" : "FAILED"}
          </h2>
          <p className="mt-2 text-sm text-gray-500">{course.title}</p>
          <div className="my-6 rounded-xl bg-gray-50 p-4">
            <p className="text-4xl font-bold text-gray-800">{score}%</p>
            <p className="mt-1 text-sm text-gray-400">
              {Math.round((score / 100) * total)} of {total} correct
            </p>
            <p className="mt-2 text-xs text-gray-400">Passing score: {course.passing_score}%</p>
          </div>

          {/* Review answers */}
          <div className="mb-4 max-h-48 space-y-2 overflow-y-auto text-left">
            {questions.map((q, i) => {
              const selected = answers[q.id];
              const isCorrect = selected === q.correct_option_id;
              return (
                <div key={q.id} className={`rounded-lg p-3 text-xs ${isCorrect ? "bg-emerald-50" : "bg-red-50"}`}>
                  <div className="flex items-start gap-2">
                    {isCorrect ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <X className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />}
                    <div>
                      <p className="font-medium text-gray-700">Q{i + 1}: {q.question_text}</p>
                      {!isCorrect && (
                        <p className="mt-1 text-gray-500">Correct answer: <span className="font-medium text-emerald-600">{q.correct_option_id}</span></p>
                      )}
                      {q.explanation && <p className="mt-1 italic text-gray-400">{q.explanation}</p>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleRetry}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gray-100 py-3 text-sm font-medium text-gray-600 transition hover:bg-gray-200"
            >
              <RotateCcw className="h-4 w-4" /> Retry
            </button>
            <button
              onClick={onClose}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gray-900 py-3 text-sm font-semibold text-white transition hover:bg-gray-800"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-50" onClick={onClose}>
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-5 py-4" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-gray-900">{course.title}</p>
            <p className="text-xs text-gray-400">Question {currentIdx + 1} of {total}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        {/* Progress bar */}
        <div className="mx-auto mt-3 max-w-2xl">
          <div className="h-1.5 overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-300"
              style={{ width: `${((currentIdx + 1) / total) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Question */}
      <div className="flex-1 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto max-w-2xl px-5 py-8">
          <h3 className="text-lg font-semibold leading-relaxed text-gray-900">{current.question_text}</h3>

          <div className="mt-6 space-y-3">
            {current.options.map((option) => {
              const isSelected = answers[current.id] === option.id;
              return (
                <button
                  key={option.id}
                  onClick={() => handleSelect(current.id, option.id)}
                  className={`flex w-full items-center gap-3 rounded-xl border-2 px-4 py-3.5 text-left text-sm transition ${
                    isSelected
                      ? "border-emerald-500 bg-emerald-50 text-gray-900"
                      : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    isSelected ? "bg-emerald-500 text-white" : "bg-gray-100 text-gray-500"
                  }`}>
                    {option.id}
                  </span>
                  <span className="flex-1">{option.text}</span>
                  {isSelected && <Check className="h-4 w-4 text-emerald-600" />}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Footer navigation */}
      <div className="border-t border-gray-200 bg-white px-5 py-4" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <button
            onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
            disabled={currentIdx === 0}
            className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-100 disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" /> Prev
          </button>
          <span className="text-xs text-gray-400">
            {Object.keys(answers).length} of {total} answered
          </span>
          {currentIdx < total - 1 ? (
            <button
              onClick={() => setCurrentIdx((i) => Math.min(total - 1, i + 1))}
              className="flex items-center gap-1 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800"
            >
              Next <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!allAnswered || saving}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-40"
            >
              {saving ? "Submitting..." : "Submit Quiz"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
