import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Clock, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Test() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [room, setRoom] = useState<any>(null);
  const [passage, setPassage] = useState<any>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [now, setNow] = useState(Date.now());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const submittedRef = useRef(false);

  useEffect(() => {
    if (!code || !user) return;

    const load = async () => {
      setLoading(true);

      // =====================
      // ROOM
      // =====================
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

      // =====================
      // PASSAGE (FIXED)
      // =====================
      if (r.passage_id) {
        const { data: p } = await supabase
          .from("passages")
          .select("*")
          .eq("id", r.passage_id)
          .single();

        setPassage(p);
      }

      // =====================
      // QUESTIONS (SIMPLE)
      // =====================
      const { data: qs } = await supabase
        .from("questions")
        .select("*")
        .eq("subject", r.subject.toLowerCase());

      if (!qs || qs.length === 0) {
        toast.error("No questions found");
        return;
      }

      const shuffled = [...qs].sort(() => Math.random() - 0.5);
      setQuestions(shuffled.slice(0, 10));

      setLoading(false);
    };

    load();
  }, [code, user, navigate]);

  // TIMER
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
    } catch {
      submittedRef.current = false;
      toast.error("Submit failed");
    } finally {
      setSubmitting(false);
    }
  }, [room, user, questions, answers, navigate]);

  useEffect(() => {
    if (remaining === 0 && questions.length > 0) {
      handleSubmit();
    }
  }, [remaining, questions, handleSubmit]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <div className="sticky top-0 z-10 bg-card border-b flex justify-between p-3">
        <span>Room: {room?.code}</span>
        <span className="font-bold text-primary flex gap-2">
          <Clock size={16} />
          {Math.floor(remaining / 60)}:{(remaining % 60).toString().padStart(2, "0")}
        </span>
      </div>

      <main className="container py-6 grid lg:grid-cols-2 gap-6">

        {passage && (
          <div className="paper p-5">
            <h2 className="font-bold mb-3">{passage.title}</h2>
            <p className="whitespace-pre-line">{passage.content}</p>
          </div>
        )}

        <div className="space-y-4">
          {questions.map((q, idx) => (
            <div key={q.id} className="paper p-4">
              <p className="font-semibold mb-3">
                Q{idx + 1}. {q.question}
              </p>

              <div className="grid grid-cols-2 gap-2">
                {q.options.map((opt: string, i: number) => (
                  <button
                    key={i}
                    onClick={() =>
                      setAnswers({ ...answers, [q.id]: i })
                    }
                    className={cn(
                      "p-3 border rounded",
                      answers[q.id] === i && "bg-primary text-white"
                    )}
                  >
                    {String.fromCharCode(65 + i)}. {opt}
                  </button>
                ))}
              </div>
            </div>
          ))}

          <Button onClick={handleSubmit} disabled={submitting}>
            Submit
          </Button>
        </div>
      </main>
    </div>
  );
}