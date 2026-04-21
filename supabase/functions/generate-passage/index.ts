// Generate a DDCET-style long comprehension passage with MCQs, then insert it.
// Auth required — only authenticated users can trigger generation.
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PASSAGE_TOOL = {
  type: "function",
  function: {
    name: "create_passage",
    description: "Generate a DDCET-level comprehension passage with MCQs",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        difficulty: { type: "string", enum: ["easy", "moderate", "hard"] },
        paragraphs: {
          type: "array",
          minItems: 20,
          maxItems: 20,
          items: { type: "string" },
        },
        questions: {
          type: "array",
          minItems: 10,
          maxItems: 10,
          items: {
            type: "object",
            properties: {
              question: { type: "string" },
              options: { type: "array", minItems: 4, maxItems: 4, items: { type: "string" } },
              correct_index: { type: "integer", minimum: 0, maximum: 3 },
            },
            required: ["question", "options", "correct_index"],
          },
        },
      },
      required: ["title", "difficulty", "paragraphs", "questions"],
    },
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnon = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
    const supa = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await supa.auth.getUser();
    if (!userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { topic = "general knowledge", difficulty = "moderate" } = await req.json().catch(() => ({}));

    const prompt = `Write a DDCET (diploma entrance test) level English comprehension passage on this topic: ${topic}.

Requirements:
- Exactly 20 paragraphs.
- Each paragraph: 4-5 sentences, approximately 70-110 words.
- Difficulty: ${difficulty}. Clear vocabulary, logical and analytical content for diploma students.
- Should flow as a coherent essay.
- Include some terms readers can infer from context (for vocabulary questions).
- Then write exactly 10 MCQs based ONLY on the passage.
- Mix: 2 main_idea, 3 inference, 2 vocabulary, 2 logical, 1 factual.
- Each question has exactly 4 options. Mark the correct option (0-indexed).
- Test understanding, not verbatim location.
- Provide a short engaging title.`;

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [{ role: "user", content: prompt }],
        tools: [PASSAGE_TOOL],
        tool_choice: { type: "function", function: { name: "create_passage" } },
      }),
    });

    if (aiResp.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limited, try again shortly" }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (aiResp.status === 402) {
      return new Response(JSON.stringify({ error: "AI credits exhausted" }), {
        status: 402,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!aiResp.ok) {
      const t = await aiResp.text();
      throw new Error(`AI gateway error: ${t}`);
    }

    const aiJson = await aiResp.json();
    const toolCall = aiJson.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("AI returned no structured passage");
    const parsed = JSON.parse(toolCall.function.arguments);

    // Insert with service role to bypass passage RLS (passages are admin-managed)
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminSupa = createClient(supabaseUrl, serviceKey);

    const { data: passage, error: pErr } = await adminSupa
      .from("passages")
      .insert({
        title: parsed.title,
        content: parsed.paragraphs.join("\n\n"),
        paragraphs: parsed.paragraphs,
        difficulty: parsed.difficulty,
      })
      .select()
      .single();
    if (pErr) throw pErr;

    const qRows = parsed.questions.map((q: any, idx: number) => ({
      passage_id: passage.id,
      question: q.question,
      options: q.options,
      correct_index: q.correct_index,
      order_index: idx,
    }));
    const { error: qErr } = await adminSupa.from("questions").insert(qRows);
    if (qErr) throw qErr;

    return new Response(JSON.stringify({ ok: true, passage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-passage error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
