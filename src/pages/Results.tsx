import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Trophy, Check, X, Loader2 } from "lucide-react";

interface Row {
  user_id: string;
  display_name: string;
  score: number;
  total: number;
  submitted_at: string;
}
interface AnswerReview {
  question: string;
  options: string[];
  correct_index: number;
  selected_index: number;
  is_correct: boolean;
}

export default function Results() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [roomId, setRoomId] = useState<string | null>(null);
  const [leaderboard, setLeaderboard] = useState<Row[]>([]);
  const [review, setReview] = useState<AnswerReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [myScore, setMyScore] = useState<{ score: number; total: number } | null>(null);

  useEffect(() => {
    if (!code || !user) return;

    const load = async () => {
      setLoading(true);
      const { data: room } = await supabase
        .from("rooms")
        .select("id, passage_id")
        .eq("code", code.toUpperCase())
        .maybeSingle();
      if (!room) {
        navigate("/");
        return;
      }
      setRoomId(room.id);

      // Leaderboard
      const { data: attempts } = await supabase
        .from("attempts")
        .select("user_id, score, total, submitted_at, profiles!attempts_user_id_profiles_fkey(display_name)")
        .eq("room_id", room.id)
        .order("score", { ascending: false })
        .order("submitted_at", { ascending: true });

      const rows: Row[] = (attempts ?? []).map((a: any) => ({
        user_id: a.user_id,
        display_name: a.profiles?.display_name ?? "Player",
        score: a.score,
        total: a.total,
        submitted_at: a.submitted_at,
      }));
      setLeaderboard(rows);

      const mine = rows.find((r) => r.user_id === user.id);
      if (mine) setMyScore({ score: mine.score, total: mine.total });

      // My review
      const { data: myAttempt } = await supabase
        .from("attempts")
        .select("id")
        .eq("room_id", room.id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (myAttempt) {
        const { data: ans } = await supabase
          .from("answers")
          .select("selected_index, is_correct, questions(question, options, correct_index, order_index)")
          .eq("attempt_id", myAttempt.id);
        const reviewRows: AnswerReview[] = (ans ?? [])
          .map((a: any) => ({
            question: a.questions.question,
            options: a.questions.options,
            correct_index: a.questions.correct_index,
            selected_index: a.selected_index,
            is_correct: a.is_correct,
            order_index: a.questions.order_index,
          }))
          .sort((a: any, b: any) => a.order_index - b.order_index);
        setReview(reviewRows);
      }

      setLoading(false);
    };
    load();
  }, [code, user, navigate]);

  // Realtime leaderboard
  useEffect(() => {
    if (!roomId) return;
    const channel = supabase
      .channel(`results-${roomId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "attempts", filter: `room_id=eq.${roomId}` },
        async () => {
          const { data: attempts } = await supabase
            .from("attempts")
            .select("user_id, score, total, submitted_at, profiles!attempts_user_id_profiles_fkey(display_name)")
            .eq("room_id", roomId)
            .order("score", { ascending: false })
            .order("submitted_at", { ascending: true });
          if (attempts) {
            setLeaderboard(
              attempts.map((a: any) => ({
                user_id: a.user_id,
                display_name: a.profiles?.display_name ?? "Player",
                score: a.score,
                total: a.total,
                submitted_at: a.submitted_at,
              }))
            );
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading results…
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container max-w-4xl py-10">
        {myScore && (
          <div className="paper-elevated p-8 text-center">
            <Trophy className="mx-auto h-10 w-10 text-accent" />
            <h1 className="mt-3 font-serif text-3xl text-primary">
              You scored {myScore.score} / {myScore.total}
            </h1>
            <p className="mt-2 text-muted-foreground">
              {myScore.score === myScore.total
                ? "Perfect score! Outstanding."
                : myScore.score >= myScore.total * 0.6
                ? "Well done — solid result."
                : "Keep practicing — review your answers below."}
            </p>
          </div>
        )}

        {/* Leaderboard */}
        <section className="mt-8 paper p-6">
          <h2 className="mb-4 font-serif text-xl text-primary">Leaderboard</h2>
          <ul className="divide-y">
            {leaderboard.map((r, i) => (
              <li
                key={r.user_id}
                className={`flex items-center justify-between py-3 ${
                  r.user_id === user?.id ? "font-semibold" : ""
                }`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                      i === 0
                        ? "bg-accent text-accent-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span>{r.display_name}</span>
                  {r.user_id === user?.id && (
                    <span className="text-xs text-muted-foreground">(you)</span>
                  )}
                </div>
                <span className="text-primary">
                  {r.score} / {r.total}
                </span>
              </li>
            ))}
            {leaderboard.length === 0 && (
              <li className="py-3 text-sm text-muted-foreground">
                Waiting for submissions…
              </li>
            )}
          </ul>
        </section>

        {/* Review */}
        {review.length > 0 && (
          <section className="mt-8 space-y-4">
            <h2 className="font-serif text-xl text-primary">Your Answers</h2>
            {review.map((r, i) => (
              <div key={i} className="paper p-5">
                <div className="flex items-start gap-3">
                  {r.is_correct ? (
                    <Check className="mt-0.5 h-5 w-5 text-success" />
                  ) : (
                    <X className="mt-0.5 h-5 w-5 text-destructive" />
                  )}
                  <div className="flex-1">
                    <p className="font-medium text-primary">
                      Q{i + 1}. {r.question}
                    </p>
                    <div className="mt-3 space-y-1 text-sm">
                      {r.options.map((opt, idx) => {
                        const isCorrect = idx === r.correct_index;
                        const isPicked = idx === r.selected_index;
                        return (
                          <div
                            key={idx}
                            className={`rounded px-3 py-1.5 ${
                              isCorrect
                                ? "bg-success/10 text-success"
                                : isPicked
                                ? "bg-destructive/10 text-destructive"
                                : "text-muted-foreground"
                            }`}
                          >
                            {String.fromCharCode(65 + idx)}. {opt}
                            {isCorrect && " ✓"}
                            {isPicked && !isCorrect && " (your answer)"}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </section>
        )}

        <div className="mt-10 text-center">
          <Button asChild size="lg">
            <Link to="/">Back to Home</Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
