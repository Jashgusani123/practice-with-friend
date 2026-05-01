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
  submitted_at: string | null;
}

interface AnswerReview {
  question: string;
  options: string[];
  correct_index: number;
  selected_index: number | null;
  is_correct: boolean;
  order_index: number;
  marks: number;
}

const POSITIVE_MARK = 2;
const NEGATIVE_MARK = -0.5;
const NOT_ATTEMPTED_MARK = -2;

export default function Results() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [roomId, setRoomId] = useState<string | null>(null);
  const [leaderboard, setLeaderboard] = useState<Row[]>([]);
  const [review, setReview] = useState<AnswerReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [myScore, setMyScore] = useState<number>(0);

  // =========================
  // LOAD DATA
  // =========================
  useEffect(() => {
    if (!code || !user) return;

    const load = async () => {
      setLoading(true);

      const { data: room } = await supabase
        .from("rooms")
        .select("id")
        .eq("code", code.toUpperCase())
        .maybeSingle();

      if (!room) {
        navigate("/");
        return;
      }

      setRoomId(room.id);

      // =========================
      // LEADERBOARD
      // =========================
      const { data: attempts } = await supabase
        .from("attempts")
        .select(`
          user_id,
          score,
          total,
          submitted_at,
          profiles!attempts_user_id_profiles_fkey(display_name)
        `)
        .eq("room_id", room.id)
        .order("score", { ascending: false });

      const rows: Row[] = (attempts ?? []).map((a: any) => ({
        user_id: a.user_id,
        display_name: a.profiles?.display_name ?? "Player",
        score: a.score ?? 0,
        total: a.total ?? 0,
        submitted_at: a.submitted_at ?? null,
      }));

      setLeaderboard(rows);

      const mine = rows.find((r) => r.user_id === user.id);
      if (mine) setMyScore(mine.score);

      // =========================
      // MY ATTEMPT
      // =========================
      const { data: myAttempt } = await supabase
        .from("attempts")
        .select("id")
        .eq("room_id", room.id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (myAttempt) {
        const { data: ans } = await supabase
          .from("answers")
          .select(`
            selected_index,
            is_correct,
            questions(question, options, correct_index, order_index)
          `)
          .eq("attempt_id", myAttempt.id);

        const reviewRows: AnswerReview[] = (ans ?? [])
          .map((a: any) => {
            const selected = a.selected_index;

            const isNotAttempted =
              selected === null || selected === -1;

            return {
              question: a.questions?.question ?? "",
              options: a.questions?.options ?? [],
              correct_index: a.questions?.correct_index ?? 0,
              selected_index: selected,
              is_correct: a.is_correct,
              order_index: a.questions?.order_index ?? 0,
              marks: isNotAttempted
                ? NOT_ATTEMPTED_MARK
                : a.is_correct
                ? POSITIVE_MARK
                : NEGATIVE_MARK,
            };
          })
          .sort((a, b) => a.order_index - b.order_index);

        setReview(reviewRows);

        // =========================
        // FINAL SCORE
        // =========================
        const totalScore = reviewRows.reduce((acc, r) => {
          if (r.selected_index === null || r.selected_index === -1) {
            return acc + NOT_ATTEMPTED_MARK;
          }
          return acc + r.marks;
        }, 0);

        setMyScore(totalScore);
      }

      setLoading(false);
    };

    load();
  }, [code, user, navigate]);

  // =========================
  // REALTIME LEADERBOARD
  // =========================
  useEffect(() => {
    if (!roomId) return;

    const channel = supabase
      .channel(`results-${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "attempts",
          filter: `room_id=eq.${roomId}`,
        },
        async () => {
          const { data: attempts } = await supabase
            .from("attempts")
            .select(`
              user_id,
              score,
              total,
              submitted_at,
              profiles!attempts_user_id_profiles_fkey(display_name)
            `)
            .eq("room_id", roomId)
            .order("score", { ascending: false });

          if (attempts) {
            setLeaderboard(
              attempts.map((a: any) => ({
                user_id: a.user_id,
                display_name: a.profiles?.display_name ?? "Player",
                score: a.score ?? 0,
                total: a.total ?? 0,
                submitted_at: a.submitted_at ?? null,
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

  // =========================
  // LOADING
  // =========================
  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Loading results…
        </div>
      </div>
    );
  }

  // =========================
  // UI
  // =========================
  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container max-w-4xl py-10">

        {/* SCORE */}
        <div className="paper-elevated p-8 text-center space-y-2">
          <Trophy className="mx-auto h-10 w-10 text-accent" />

          <h1 className="font-serif text-3xl text-primary">
            Your Score
          </h1>

          <div className="text-4xl font-bold text-primary">
            {myScore}
          </div>

          <p className="text-sm text-muted-foreground">
            +{POSITIVE_MARK} correct • {NEGATIVE_MARK} wrong • {NOT_ATTEMPTED_MARK} not attempted
          </p>
        </div>

        {/* LEADERBOARD */}
        <section className="mt-8 paper p-6">
          <h2 className="mb-4 font-serif text-xl text-primary">
            Leaderboard
          </h2>

          <ul className="divide-y rounded-md border">
            {leaderboard.map((r, i) => (
              <li
                key={r.user_id}
                className={`flex justify-between p-3 ${
                  r.user_id === user?.id ? "bg-muted font-semibold" : ""
                }`}
              >
                <div className="flex gap-3 items-center">
                  <span className="h-6 w-6 flex items-center justify-center rounded-full bg-primary text-white text-xs">
                    {i + 1}
                  </span>
                  <span>{r.display_name}</span>
                </div>

                <span className="text-primary font-semibold">
                  {r.score}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* REVIEW */}
        {review.length > 0 && (
          <section className="mt-8 space-y-4">
            <h2 className="font-serif text-xl text-primary">
              Answer Review
            </h2>

            {review.map((r, i) => (
              <div key={i} className="paper p-5">

                <div className="flex items-start gap-3">

                  {r.selected_index === null || r.selected_index === -1 ? (
                    <span className="text-yellow-600 font-semibold">
                      −2 Not Attempted
                    </span>
                  ) : r.is_correct ? (
                    <Check className="mt-0.5 h-5 w-5 text-green-500" />
                  ) : (
                    <X className="mt-0.5 h-5 w-5 text-red-500" />
                  )}

                  <div className="flex-1">

                    <div className="mb-2 font-semibold">
                      Marks:{" "}
                      <span className={
                        r.marks > 0
                          ? "text-green-600"
                          : "text-red-600"
                      }>
                        {r.marks}
                      </span>
                    </div>

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
                            className={`px-3 py-1.5 rounded border ${
                              isCorrect
                                ? "bg-green-100 border-green-400 text-green-700"
                                : isPicked
                                ? "bg-red-100 border-red-400 text-red-700"
                                : "text-muted-foreground"
                            }`}
                          >
                            <span className="font-semibold">
                              {String.fromCharCode(65 + idx)}.
                            </span>{" "}
                            {opt}

                            {isCorrect && " (✓ Correct)"}
                            {isPicked && !isCorrect && " (✗ Your Answer)"}
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

        {/* BACK */}
        <div className="mt-10 text-center">
          <Button asChild size="lg">
            <Link to="/">Back to Home</Link>
          </Button>
        </div>

      </main>
    </div>
  );
}