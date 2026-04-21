import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Clock, Loader2, Bookmark, Highlighter, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

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
  paragraphs: string[] | null;
  difficulty: string;
}
interface Question {
  id: string;
  question: string;
  options: string[];
  order_index: number;
}
interface Highlight {
  id: string;
  paragraph_index: number;
  start_offset: number;
  end_offset: number;
  text: string;
}

// Render a paragraph with any saved highlights overlaid
function ParagraphView({
  text,
  index,
  highlights,
  onSelectHighlight,
  onRemoveHighlight,
}: {
  text: string;
  index: number;
  highlights: Highlight[];
  onSelectHighlight: (paragraphIndex: number, start: number, end: number, text: string) => void;
  onRemoveHighlight: (id: string) => void;
}) {
  const ref = useRef<HTMLParagraphElement>(null);

  const handleMouseUp = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !ref.current) return;
    const range = sel.getRangeAt(0);
    if (!ref.current.contains(range.commonAncestorContainer)) return;

    // Compute offset relative to paragraph plain text
    const preRange = range.cloneRange();
    preRange.selectNodeContents(ref.current);
    preRange.setEnd(range.startContainer, range.startOffset);
    const start = preRange.toString().length;
    const end = start + range.toString().length;
    const selected = range.toString();
    if (selected.trim().length === 0) return;
    sel.removeAllRanges();
    onSelectHighlight(index, start, end, selected);
  };

  // Build segments: plain + highlighted, sorted, non-overlapping (last write wins for overlap)
  const segments = useMemo(() => {
    const sorted = [...highlights].sort((a, b) => a.start_offset - b.start_offset);
    const segs: Array<{ text: string; highlightId?: string }> = [];
    let cursor = 0;
    for (const h of sorted) {
      if (h.start_offset < cursor) continue; // skip overlap
      if (h.start_offset > cursor) {
        segs.push({ text: text.slice(cursor, h.start_offset) });
      }
      segs.push({
        text: text.slice(h.start_offset, h.end_offset),
        highlightId: h.id,
      });
      cursor = h.end_offset;
    }
    if (cursor < text.length) segs.push({ text: text.slice(cursor) });
    return segs;
  }, [text, highlights]);

  return (
    <p
      ref={ref}
      onMouseUp={handleMouseUp}
      className="mb-4 select-text leading-relaxed text-foreground/90"
    >
      {segments.map((s, i) =>
        s.highlightId ? (
          <mark
            key={i}
            className="cursor-pointer rounded bg-accent/60 px-0.5 text-foreground hover:bg-accent/80"
            title="Click to remove highlight"
            onClick={(e) => {
              e.stopPropagation();
              onRemoveHighlight(s.highlightId!);
            }}
          >
            {s.text}
          </mark>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </p>
  );
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
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [marked, setMarked] = useState<Set<string>>(new Set());
  const submittedRef = useRef(false);

  // Load room + passage + questions, ensure attempt row exists
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

      // Look for existing attempt
      const { data: existing } = await supabase
        .from("attempts")
        .select("id, submitted_at, score")
        .eq("room_id", r.id)
        .eq("user_id", user.id)
        .maybeSingle();

      // If submission was final (we mark it by setting score>0 OR score==0 via separate flag — use a different signal:
      // we'll re-check: if any answers exist for this attempt, treat as submitted)
      let currentAttemptId: string | null = existing?.id ?? null;
      if (existing) {
        const { count } = await supabase
          .from("answers")
          .select("*", { count: "exact", head: true })
          .eq("attempt_id", existing.id);
        if ((count ?? 0) > 0) {
          navigate(`/results/${r.code}`);
          return;
        }
      } else {
        // Create a placeholder attempt so highlights/marks can FK to it
        const { data: created, error: aErr } = await supabase
          .from("attempts")
          .insert({ room_id: r.id, user_id: user.id, score: 0, total: 0 })
          .select("id")
          .single();
        if (aErr) {
          toast.error("Could not start attempt");
          return;
        }
        currentAttemptId = created.id;
      }
      setAttemptId(currentAttemptId);

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

      // Load saved highlights + marks
      if (currentAttemptId) {
        const [{ data: hs }, { data: ms }] = await Promise.all([
          supabase
            .from("highlights")
            .select("id, paragraph_index, start_offset, end_offset, text")
            .eq("attempt_id", currentAttemptId),
          supabase
            .from("question_marks")
            .select("question_id")
            .eq("attempt_id", currentAttemptId),
        ]);
        setHighlights((hs ?? []) as Highlight[]);
        setMarked(new Set((ms ?? []).map((m: any) => m.question_id)));
      }
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

  // Group paragraphs (use array if available, else split content)
  const paragraphs = useMemo(() => {
    if (!passage) return [];
    if (passage.paragraphs?.length) return passage.paragraphs;
    return passage.content.split(/\n\n+/);
  }, [passage]);

  // Highlight handlers
  const addHighlight = useCallback(
    async (paragraphIndex: number, start: number, end: number, text: string) => {
      if (!attemptId || !user) return;
      const { data, error } = await supabase
        .from("highlights")
        .insert({
          attempt_id: attemptId,
          user_id: user.id,
          paragraph_index: paragraphIndex,
          start_offset: start,
          end_offset: end,
          text,
        })
        .select("id, paragraph_index, start_offset, end_offset, text")
        .single();
      if (error) {
        toast.error("Could not save highlight");
        return;
      }
      setHighlights((h) => [...h, data as Highlight]);
    },
    [attemptId, user],
  );

  const removeHighlight = useCallback(
    async (id: string) => {
      const { error } = await supabase.from("highlights").delete().eq("id", id);
      if (error) {
        toast.error("Could not remove highlight");
        return;
      }
      setHighlights((h) => h.filter((x) => x.id !== id));
    },
    [],
  );

  const toggleMark = useCallback(
    async (questionId: string) => {
      if (!attemptId || !user) return;
      const isMarked = marked.has(questionId);
      if (isMarked) {
        await supabase
          .from("question_marks")
          .delete()
          .eq("attempt_id", attemptId)
          .eq("question_id", questionId);
        setMarked((m) => {
          const next = new Set(m);
          next.delete(questionId);
          return next;
        });
      } else {
        await supabase.from("question_marks").insert({
          attempt_id: attemptId,
          user_id: user.id,
          question_id: questionId,
        });
        setMarked((m) => new Set(m).add(questionId));
      }
    },
    [attemptId, user, marked],
  );

  const handleSubmit = useCallback(
    async (auto = false) => {
      if (!room || !user || !attemptId || submittedRef.current) return;
      submittedRef.current = true;
      setSubmitting(true);
      try {
        const { data: qWithCorrect } = await supabase
          .from("questions")
          .select("id, correct_index")
          .eq("passage_id", room.passage_id);
        const correctMap = new Map(
          (qWithCorrect ?? []).map((q: any) => [q.id, q.correct_index]),
        );
        let score = 0;
        const total = questions.length;
        const rows = questions.map((q) => {
          const sel = answers[q.id] ?? -1;
          const correct = correctMap.get(q.id);
          const isCorrect = sel === correct;
          if (isCorrect) score++;
          return {
            attempt_id: attemptId,
            question_id: q.id,
            selected_index: sel,
            is_correct: isCorrect,
          };
        });

        const { error: uErr } = await supabase
          .from("attempts")
          .update({ score, total, submitted_at: new Date().toISOString() })
          .eq("id", attemptId);
        if (uErr) throw uErr;

        if (rows.length) {
          const { error: ansErr } = await supabase.from("answers").insert(rows);
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
    [room, user, attemptId, questions, answers, navigate],
  );

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
  const answeredCount = Object.keys(answers).length;
  const markedCount = marked.size;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      {/* Sticky timer bar */}
      <div className="sticky top-0 z-20 border-b bg-card/95 backdrop-blur">
        <div className="container flex h-12 items-center justify-between gap-4">
          <span className="text-sm text-muted-foreground">
            Room <span className="room-code text-primary">{room.code}</span>
          </span>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>
              Answered <span className="font-semibold text-foreground">{answeredCount}/{questions.length}</span>
            </span>
            {markedCount > 0 && (
              <span className="flex items-center gap-1 text-accent-foreground">
                <Bookmark className="h-3 w-3" /> {markedCount} marked
              </span>
            )}
          </div>
          <div
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-1 text-sm font-semibold",
              lowTime
                ? "bg-destructive/10 text-destructive"
                : "bg-primary/10 text-primary",
            )}
          >
            <Clock className="h-4 w-4" />
            {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
          </div>
        </div>
      </div>

      <main className="container max-w-7xl py-6">
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Passage column — scrollable */}
          <article className="paper p-6 lg:sticky lg:top-16 lg:max-h-[calc(100vh-5rem)] lg:overflow-y-auto">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h1 className="font-serif text-2xl text-primary">{passage.title}</h1>
                <p className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">
                  {paragraphs.length} paragraphs · {passage.difficulty ?? "moderate"}
                </p>
              </div>
              <div className="flex items-center gap-1 rounded-md bg-accent/30 px-2 py-1 text-xs text-foreground/80">
                <Highlighter className="h-3 w-3" /> Select text to highlight
              </div>
            </div>
            <div className="font-serif text-base leading-relaxed">
              {paragraphs.map((para, i) => (
                <ParagraphView
                  key={i}
                  text={para}
                  index={i}
                  highlights={highlights.filter((h) => h.paragraph_index === i)}
                  onSelectHighlight={addHighlight}
                  onRemoveHighlight={removeHighlight}
                />
              ))}
            </div>
          </article>

          {/* Questions column */}
          <section className="space-y-4">
            {questions.map((q, idx) => {
              const isMarked = marked.has(q.id);
              return (
                <div
                  key={q.id}
                  className={cn(
                    "paper p-5 transition-colors",
                    isMarked && "ring-2 ring-accent",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="flex-1 font-semibold text-primary">
                      Q{idx + 1}. {q.question}
                    </p>
                    <Button
                      type="button"
                      variant={isMarked ? "default" : "outline"}
                      size="sm"
                      onClick={() => toggleMark(q.id)}
                      className="shrink-0"
                    >
                      <Bookmark className={cn("h-4 w-4", isMarked && "fill-current")} />
                      <span className="ml-1 hidden sm:inline">
                        {isMarked ? "Marked" : "Mark"}
                      </span>
                    </Button>
                  </div>
                  <div className="mt-3 grid gap-2">
                    {q.options.map((opt, i) => {
                      const selected = answers[q.id] === i;
                      return (
                        <label
                          key={i}
                          className={cn(
                            "flex cursor-pointer items-center gap-3 rounded-md border p-3 transition-colors",
                            selected
                              ? "border-primary bg-primary/5"
                              : "border-border hover:bg-muted",
                          )}
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
                          <span className="text-sm">{opt}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            <div className="flex items-center justify-between gap-3 pt-2">
              <p className="text-xs text-muted-foreground">
                {highlights.length > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <Highlighter className="h-3 w-3" />
                    {highlights.length} highlights
                  </span>
                )}
              </p>
              <Button
                size="lg"
                onClick={() => handleSubmit(false)}
                disabled={submitting}
              >
                {submitting ? "Submitting…" : "Submit Test"}
              </Button>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
