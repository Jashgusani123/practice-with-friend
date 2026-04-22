import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function Generate() {
  const [json, setJson] = useState("");

  const handleSubmit = async () => {
    try {
      const data = JSON.parse(json);

      let passageId: string | null = null;

      // ✅ INSERT PASSAGE (ONLY IF EXISTS)
      if (data.paragraphs && data.paragraphs.length > 0) {
        const { data: passage, error: pErr } = await supabase
          .from("passages")
          .insert({
            title: data.title || "Untitled Passage",
            content: data.paragraphs.join("\n\n"),
          })
          .select()
          .single();

        if (pErr) throw pErr;

        passageId = passage.id;
      }

      // ✅ VALIDATION
      if (!data.subject || !data.chapter || !data.questions) {
        throw new Error("Missing subject / chapter / questions");
      }

      // ✅ INSERT QUESTIONS
      const questions = data.questions.map((q: any, index: number) => ({
  subject: data.subject.toLowerCase(),
  chapter: data.chapter.toLowerCase(),
  difficulty: data.difficulty || "medium",
  passage_id: passageId,
  question: q.question,
  options: q.options,
  correct_index: q.correct_index,
  explanation: q.explanation || "",
  order_index: index,
}));

      const { error: qErr } = await supabase
        .from("questions")
        .insert(questions);

      if (qErr) throw qErr;

      toast.success("✅ Data inserted successfully!");
      setJson("");
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Invalid JSON");
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold mb-4">Admin: Upload JSON</h1>

      <textarea
        value={json}
        onChange={(e) => setJson(e.target.value)}
        placeholder="Paste JSON here..."
        className="w-full h-64 border p-2 rounded"
      />

      <button
        onClick={handleSubmit}
        className="mt-4 bg-blue-500 text-white px-4 py-2 rounded"
      >
        Upload Questions
      </button>
    </div>
  );
}