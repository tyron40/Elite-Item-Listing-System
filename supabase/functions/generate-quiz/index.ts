import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface QuizQuestion {
  question_text: string;
  options: Array<{ id: string; text: string }>;
  correct_option_id: string;
  explanation: string;
}

interface Material {
  id: string;
  title: string;
  file_type: string;
  file_url: string;
  file_name: string;
}

const QUIZ_SYSTEM_PROMPT = "You are an expert training course creator. Given content from training documents and images, you create multiple-choice quiz questions that test understanding of the material. Return ONLY valid JSON, no markdown or code blocks.";

function buildQuizPrompt(materials: Material[], numQuestions: number): string {
  const materialDescriptions = materials.map((m, i) => {
    if (m.file_type === "image") {
      return `Material ${i + 1}: "${m.title}" (IMAGE — the image URL is provided separately for visual analysis)`;
    }
    return `Material ${i + 1}: "${m.title}" (DOCUMENT — URL: ${m.file_url})`;
  }).join("\n");

  return `Create ${numQuestions} multiple-choice quiz questions based on the following training materials:

${materialDescriptions}

For image materials, carefully examine the provided image and create questions about what is shown — labels, text, diagrams, procedures, safety information, or any visible content.

For document materials, create questions about the key concepts, procedures, facts, and important details contained in the documents.

Requirements:
1. Each question must have exactly 4 options labeled A, B, C, D.
2. Only one option is correct.
3. Include a brief explanation for why the correct answer is right.
4. Questions should test real understanding, not trivial memorization.
5. Mix of difficulty levels — some straightforward, some requiring reasoning.

Return ONLY valid JSON in this exact shape (no markdown, no code blocks):
{
  "questions": [
    {
      "question_text": "The question",
      "options": [
        {"id": "A", "text": "First option"},
        {"id": "B", "text": "Second option"},
        {"id": "C", "text": "Third option"},
        {"id": "D", "text": "Fourth option"}
      ],
      "correct_option_id": "A",
      "explanation": "Brief explanation of why A is correct"
    }
  ]
}`;
}

function extractJson(content: string): string {
  let cleaned = content
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  cleaned = cleaned.replace(/【\d+†[^】]*】/g, "");
  if (!cleaned.startsWith("{")) {
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) cleaned = jsonMatch[0];
  }
  return cleaned.trim();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { materials, numQuestions } = body as {
      materials: Material[];
      numQuestions?: number;
    };

    if (!materials || !Array.isArray(materials) || materials.length === 0) {
      return new Response(
        JSON.stringify({ error: "At least one training material is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const questionCount = numQuestions && numQuestions > 0 ? Math.min(numQuestions, 20) : 5;
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      return new Response(
        JSON.stringify({ error: "OpenAI API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const imageMaterials = materials.filter((m) => m.file_type === "image");
    const docMaterials = materials.filter((m) => m.file_type !== "image");

    // Build content parts — include images for vision analysis
    const contentParts: Array<{ type: string; text?: string; image_url?: { url: string; detail?: string } }> = [
      { type: "text", text: buildQuizPrompt(materials, questionCount) },
    ];

    // Add up to 5 images for vision analysis
    for (const img of imageMaterials.slice(0, 5)) {
      contentParts.push({
        type: "image_url",
        image_url: { url: img.file_url, detail: "high" },
      });
    }

    // If we have documents, fetch their text content (for PDFs/text)
    // We'll include document URLs in the prompt text already
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: QUIZ_SYSTEM_PROMPT },
          { role: "user", content: contentParts },
        ],
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`OpenAI API error (${response.status}):`, errText);
      return new Response(
        JSON.stringify({ error: "Quiz generation failed. Please try again." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      return new Response(
        JSON.stringify({ error: "No response from AI" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let quizData: { questions: QuizQuestion[] };
    try {
      quizData = JSON.parse(extractJson(content));
    } catch {
      return new Response(
        JSON.stringify({ error: "Quiz generation returned an unreadable result. Please try again." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!quizData.questions || !Array.isArray(quizData.questions) || quizData.questions.length === 0) {
      return new Response(
        JSON.stringify({ error: "No quiz questions were generated. Please try with different materials." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Validate and clean questions
    const cleanQuestions = quizData.questions.map((q, i) => ({
      question_text: String(q.question_text || ""),
      options: Array.isArray(q.options) ? q.options.map((o) => ({
        id: String(o.id || ""),
        text: String(o.text || ""),
      })) : [],
      correct_option_id: String(q.correct_option_id || ""),
      explanation: String(q.explanation || ""),
      sort_order: i,
    })).filter((q) => q.question_text && q.options.length >= 2 && q.correct_option_id);

    if (cleanQuestions.length === 0) {
      return new Response(
        JSON.stringify({ error: "Generated questions were invalid. Please try again." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ questions: cleanQuestions }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Quiz generation failed";
    console.error("generate-quiz error:", err);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
