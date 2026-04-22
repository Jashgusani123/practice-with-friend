import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Clock, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Room {
  id: string;
  code: string;
  subject: string;
  chapter: string | null;
  passage_id: string | null;
  duration_seconds: number;
  started_at: string;
}

interface Passage {
  id: string;
  title: string;
  content: string;
}

interface Question {
  id: string;
  question: string;
  options: string[];
  correct_index: number;
}

export default function Test() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [room, setRoom] = useState<Room | null>(null);
  const [passage, setPassage] = useState<Passage | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [now, setNow] = useState(Date.now());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const submittedRef = useRef(false);

// 🔥 LOAD DATA
useEffect(() => {
  if (!code || !user) return;

  const load = async () => {
    setLoading(true);

    const { data: r } = await supabase
      .from("rooms")
      .select("*")
      .eq("code", code.toUpperCase())
      .single();

    if (!r) {
      toast.error("Room not found");
      navigate("/");
      return;
    }

    setRoom(r);

    // ✅ GET ROOM QUESTIONS (IMPORTANT CHANGE)
    const { data: roomQs } = await supabase
      .from("room_questions")
      .select("question_id")
      .eq("room_id", r.id);

    const questionIds = roomQs?.map((q) => q.question_id) || [];

    // ✅ GET USER HISTORY
    const { data: history } = await supabase
      .from("user_question_history")
      .select("question_id")
      .eq("user_id", user.id);

    const usedIds = history?.map((h) => h.question_id) || [];

    // ✅ FILTER UNUSED QUESTIONS
    const finalIds = questionIds.filter((id) => !usedIds.includes(id));

    if (finalIds.length === 0) {
      toast.error("No new questions left (all attempted)");
      return;
    }

    // ✅ FETCH QUESTIONS
    const { data: qs, error } = await supabase
      .from("questions")
      .select("*")
      .in("id", finalIds);

    if (error || !qs || qs.length === 0) {
      toast.error("No questions found");
      return;
    }

    setQuestions(qs);

    // PASSAGE (unchanged)
    if (r.subject.toLowerCase() === "english" && r.passage_id) {
      const { data: p } = await supabase
        .from("passages")
        .select("id,title,content")
        .eq("id", r.passage_id)
        .single();

      setPassage(p);
    }

    setLoading(false);
  };

  load();
}, [code, user, navigate]);

  // ⏱ TIMER
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const remaining = useMemo(() => {
    if (!room) return 0;
    const start = new Date(room.started_at).getTime();
    const end = start + room.duration_seconds * 1000;
    return Math.max(0, Math.floor((end - now) / 1000));
  }, [room, now]);

  // 📤 SUBMIT
  const handleSubmit = useCallback(async () => {
    if (!room || !user || submittedRef.current) return;

    submittedRef.current = true;
    setSubmitting(true);

    try {
      let score = 0;

      questions.forEach((q) => {
        if (answers[q.id] === q.correct_index) score++;
      });

      await supabase.from("attempts").insert({
        room_id: room.id,
        user_id: user.id,
        score,
        total: questions.length,
        submitted_at: new Date().toISOString(),
      });

      navigate(`/results/${room.code}`);
    } catch (err) {
      submittedRef.current = false;
      toast.error("Submit failed");
    } finally {
      setSubmitting(false);
    }
  }, [room, user, questions, answers, navigate]);

  // ⏰ AUTO SUBMIT
  useEffect(() => {
    if (remaining === 0 && questions.length > 0) {
      handleSubmit();
    }
  }, [remaining, questions, handleSubmit]);

  // 🔄 LOADING FIX
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* TIMER BAR */}
      <div className="sticky top-0 z-10 bg-card border-b flex justify-between p-3">
        <span className="font-medium">Room: {room?.code}</span>
        <span className="flex items-center gap-2 font-bold text-primary">
          <Clock size={16} />
          {mins}:{secs.toString().padStart(2, "0")}
        </span>
      </div>

      <main className="container py-6 grid lg:grid-cols-2 gap-6">

        {/* 📖 PASSAGE */}
        {passage && (
          <div className="paper p-5 max-h-[80vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-3">{passage.title}</h2>
            <p className="whitespace-pre-line leading-relaxed">
              {passage.content}
            </p>
          </div>
        )}

        {/* ❓ QUESTIONS */}
        <div className="space-y-4">
          {questions.map((q, idx) => (
            <div key={q.id} className="paper p-4">
              <p className="font-semibold mb-3">
                Q{idx + 1}. {q.question}
              </p>

              {/* GRID OPTIONS (FAST UX) */}
              <div className="grid grid-cols-2 gap-2">
                {q.options.map((opt, i) => {
                  const selected = answers[q.id] === i;

                  return (
                    <button
                      key={i}
                      onClick={() =>
                        setAnswers({ ...answers, [q.id]: i })
                      }
                      className={cn(
                        "p-3 border rounded text-left text-sm",
                        selected
                          ? "bg-primary text-white border-primary"
                          : "hover:bg-muted"
                      )}
                    >
                      <span className="font-semibold mr-2">
                        {String.fromCharCode(65 + i)}.
                      </span>
                      {opt}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          <Button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full text-lg"
          >
            {submitting ? "Submitting..." : "Submit Test"}
          </Button>
        </div>
      </main>
    </div>
  );
}