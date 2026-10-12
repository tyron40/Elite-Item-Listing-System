export interface TrainingMaterial {
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

export interface TrainingFolder {
  id: string;
  name: string;
  sort_order: number;
  created_at: string;
}

export interface QuizOption {
  id: string;
  text: string;
}

export interface QuizQuestion {
  id: string;
  course_id: string;
  question_text: string;
  options: QuizOption[];
  correct_option_id: string;
  explanation: string | null;
  sort_order: number;
  created_at: string;
}

export interface TrainingCourse {
  id: string;
  title: string;
  description: string | null;
  folder_id: string | null;
  source_material_ids: string[];
  passing_score: number;
  created_at: string;
}

export interface QuizAttempt {
  id: string;
  course_id: string;
  score: number;
  passed: boolean;
  answers: Array<{ question_id: string; selected_option_id: string; correct: boolean }> | null;
  created_at: string;
}
