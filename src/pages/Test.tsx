import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Clock, Loader2 } from "lucide-react";

interface Room {
  id: string;
  code: string;
  status: "waiting" | "started" | "finished";
  passage_id: string;
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
  order_index: number;
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
  const [submitting, setSubmitting] = useState(false);
  const submittedRef = useRef(false);

  useEffect(() => {
    if (!code || !user) return;
    const load = async () => {
      const { data: r } = await supabase
        .from("rooms")
        .select("*")
        .eq("code", code.toUpperCase())
        .maybeSingle();
      if (!r) {
        toast.error("Room not found");
        navigate("/");
        return;
      }
      setRoom(r as Room);

      // If already submitted, jump to results
      const { data: existing } = await supabase
        .from("attempts")
        .select("id")
        .eq("room_id", r.id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (existing) {
        navigate(`/results/${r.code}`);
        return;
      }

      const [{ data: p }, { data: qs }] = await Promise.all([
        supabase.from("passages").select("*").eq("id", r.passage_id).single(),
        supabase
          .from("questions")
          .select("id, question, options, order_index")
          .eq("passage_id", r.passage_id)
          .order("order_index"),
      ]);
      setPassage(p as Passage);
      setQuestions((qs ?? []) as Question[]);
    };
    load();
  }, [code, user, navigate]);

  // Timer tick
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  const remaining = useMemo(() => {
    if (!room) return 0;
    const start = new Date(room.started_at).getTime();
    const end = start + room.duration_seconds * 1000;
    return Math.max(0, Math.floor((end - now) / 1000));
  }, [room, now]);

  const handleSubmit = useCallback(
    async (auto = false) => {
      if (!room || !user || submittedRef.current) return;
      submittedRef.current = true;
      setSubmitting(true);
      try {
        // Fetch correct answers server-side via RLS-allowed select
        const { data: qWithCorrect } = await supabase
          .from("questions")
          .select("id, correct_index")
          .eq("passage_id", room.passage_id);
        const correctMap = new Map(
          (qWithCorrect ?? []).map((q: any) => [q.id, q.correct_index])
        );
        let score = 0;
        const total = questions.length;
        const rows = questions.map((q) => {
          const sel = answers[q.id] ?? -1;
          const correct = correctMap.get(q.id);
          const isCorrect = sel === correct;
          if (isCorrect) score++;
          return {
            question_id: q.id,
            selected_index: sel,
            is_correct: isCorrect,
          };
        });

        const { data: attempt, error: aErr } = await supabase
          .from("attempts")
          .insert({
            room_id: room.id,
            user_id: user.id,
            score,
            total,
          })
          .select()
          .single();
        if (aErr) throw aErr;

        if (rows.length) {
          const { error: ansErr } = await supabase.from("answers").insert(
            rows.map((r) => ({ ...r, attempt_id: attempt.id }))
          );
          if (ansErr) throw ansErr;
        }

        if (auto) toast.info("Time's up — auto-submitted");
        navigate(`/results/${room.code}`);
      } catch (e: any) {
        submittedRef.current = false;
        toast.error(e.message ?? "Submit failed");
      } finally {
        setSubmitting(false);
      }
    },
    [room, user, questions, answers, navigate]
  );

  // Auto-submit when timer ends
  useEffect(() => {
    if (room && remaining === 0 && questions.length > 0 && !submittedRef.current) {
      handleSubmit(true);
    }
  }, [remaining, room, questions, handleSubmit]);

  if (!room || !passage) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading test…
        </div>
      </div>
    );
  }

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const lowTime = remaining <= 60;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      {/* Sticky timer bar */}
      <div className="sticky top-0 z-10 border-b bg-card/95 backdrop-blur">
        <div className="container flex h-12 items-center justify-between">
          <span className="text-sm text-muted-foreground">
            Room <span className="room-code text-primary">{room.code}</span>
          </span>
          <div
            className={`flex items-center gap-2 rounded-md px-3 py-1 text-sm font-semibold ${
              lowTime
                ? "bg-destructive/10 text-destructive"
                : "bg-primary/10 text-primary"
            }`}
          >
            <Clock className="h-4 w-4" />
            {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
          </div>
        </div>
      </div>

      <main className="container max-w-4xl py-8">
        <article className="paper p-6 md:p-8">
          <h1 className="font-serif text-2xl text-primary">{passage.title}</h1>
          <p className="mt-4 whitespace-pre-line leading-relaxed text-foreground/90">
            {passage.content}
          </p>
        </article>

        <section className="mt-8 space-y-6">
          {questions.map((q, idx) => (
            <div key={q.id} className="paper p-6">
              <p className="font-semibold text-primary">
                Q{idx + 1}. {q.question}
              </p>
              <div className="mt-4 grid gap-2">
                {q.options.map((opt, i) => {
                  const selected = answers[q.id] === i;
                  return (
                    <label
                      key={i}
                      className={`flex cursor-pointer items-center gap-3 rounded-md border p-3 transition-colors ${
                        selected
                          ? "border-primary bg-primary/5"
                          : "border-border hover:bg-muted"
                      }`}
                    >
                      <input
                        type="radio"
                        name={q.id}
                        checked={selected}
                        onChange={() => setAnswers({ ...answers, [q.id]: i })}
                        className="h-4 w-4 accent-primary"
                      />
                      <span className="font-medium text-muted-foreground">
                        {String.fromCharCode(65 + i)}.
                      </span>
                      <span>{opt}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </section>

        <div className="mt-8 flex justify-end">
          <Button
            size="lg"
            onClick={() => handleSubmit(false)}
            disabled={submitting}
          >
            {submitting ? "Submitting…" : "Submit Test"}
          </Button>
        </div>
      </main>
    </div>
  );
}
