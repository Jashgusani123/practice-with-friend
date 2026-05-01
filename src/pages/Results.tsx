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
   correct?: number;
  wrong?: number;
  not_attempted?: number;
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

useEffect(() => {
  if (!code || !user) return;

  const load = async () => {
    setLoading(true);

    // =========================
    // ROOM
    // =========================
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
        id,
        user_id,
        score,
        total,
        submitted_at,
        profiles!attempts_user_id_profiles_fkey(display_name)
      `)
      .eq("room_id", room.id)
      .order("score", { ascending: false });

    // =========================
    // GET ALL ANSWERS (IMPORTANT FIX)
    // =========================
    const { data: allAnswers } = await supabase
      .from("answers")
      .select(`
        attempt_id,
        selected_index,
        question:questions (
          correct_index
        )
      `);

    const rows: Row[] = (attempts ?? []).map((a: any) => {
      const answers = (allAnswers ?? []).filter(
        (x: any) => x.attempt_id === a.id
      );

      let correct = 0;
      let wrong = 0;
      let not_attempted = 0;

      answers.forEach((ans: any) => {
        const selected = ans.selected_index;
        const correctIndex = ans.question?.correct_index;

        if (selected === null || selected === -1) {
          not_attempted++;
        } else if (selected === correctIndex) {
          correct++;
        } else {
          wrong++;
        }
      });

      return {
        user_id: a.user_id,
        display_name: a.profiles?.display_name ?? "Player",
        score: a.score ?? 0,
        total: a.total ?? 0,
        submitted_at: a.submitted_at ?? null,

        correct,
        wrong,
        not_attempted,
      };
    });

    setLeaderboard(rows);

    const mine = rows.find((r) => r.user_id === user.id);
    if (mine) setMyScore(mine.score);

    // =========================
    // MY ATTEMPT
    // =========================
    const { data: myAttempt, error: attemptErr } = await supabase
      .from("attempts")
      .select("id")
      .eq("room_id", room.id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (attemptErr) {
      console.log("Attempt error:", attemptErr);
    }

    if (myAttempt) {
      // =========================
      // ANSWERS (REVIEW SECTION - unchanged)
      // =========================
      const { data: ans, error } = await supabase
        .from("answers")
        .select(`
          selected_index,
          question:questions (
            question,
            options,
            correct_index,
            order_index
          )
        `)
        .eq("attempt_id", myAttempt.id);

      if (error) {
        console.log("Answers error:", error);
      }

      const reviewRows: AnswerReview[] = (ans ?? [])
        .map((a: any) => {
          const q = a.question;

          const selected = a.selected_index;
          const correct = q?.correct_index;

          const isNotAttempted =
            selected === null || selected === -1;

          const isCorrect =
            selected !== null &&
            selected !== -1 &&
            selected === correct;

          return {
            question: q?.question ?? "",
            options: q?.options ?? [],
            correct_index: correct ?? 0,
            selected_index: selected,
            is_correct: isCorrect,
            order_index: q?.order_index ?? 0,
            marks: isNotAttempted
              ? NOT_ATTEMPTED_MARK
              : isCorrect
              ? POSITIVE_MARK
              : NEGATIVE_MARK,
          };
        })
        .sort((a, b) => a.order_index - b.order_index);

      setReview(reviewRows);

      // =========================
      // FINAL SCORE (UNCHANGED LOGIC)
      // =========================
      const totalScore = reviewRows.reduce((acc, r) => {
        if (r.selected_index === null || r.selected_index === -1) {
          return acc + NOT_ATTEMPTED_MARK;
        }
        return acc + (r.is_correct ? POSITIVE_MARK : NEGATIVE_MARK);
      }, 0);

      setMyScore(totalScore);
    }

    setLoading(false);
  };

  load();
}, [code, user, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin mr-2" />
          Loading results...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container max-w-4xl py-10">
        {/* SCORE */}
        <div className="paper-elevated p-8 text-center">
          <Trophy className="mx-auto h-10 w-10 text-accent" />
          <h1 className="text-3xl font-bold">Your Score</h1>
          <div className="text-4xl font-bold text-primary mt-2">{myScore}</div>
        </div>

        {/* LEADERBOARD */}
        <section className="mt-8 paper p-6">
          <h2 className="text-xl font-bold mb-4">Leaderboard</h2>

          <ul className="divide-y border rounded-md">
            {leaderboard.map((r, i) => (
              <li
                key={r.user_id}
                className={`flex justify-between p-3 ${
                  r.user_id === user?.id ? "bg-muted font-semibold" : ""
                }`}
              >
                <div className="flex flex-col">
                  <span>
                    {i + 1}. {r.display_name}
                  </span>

                  {/* NEW STATS LINE */}
                  <span className="text-xs text-muted-foreground mt-1">
  ✅ {r.correct ?? 0} | ❌ {r.wrong ?? 0} | ⚪ {r.not_attempted ?? 0}
</span>
                </div>

                <span className="font-bold text-primary">{r.score}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* REVIEW */}
        {review.length > 0 && (
          <section className="mt-8 space-y-4">
            <h2 className="text-xl font-bold">Answer Review</h2>

            {review.map((r, i) => (
              <div key={i} className="paper p-5">
                <div className="flex gap-3">
                  {r.selected_index === null || r.selected_index === -1 ? (
                    <span className="text-yellow-600 font-bold">
                      Not Attempted
                    </span>
                  ) : r.is_correct ? (
                    <Check className="text-green-500" />
                  ) : (
                    <X className="text-red-500" />
                  )}

                  <div>
                    <p className="font-semibold">
                      Q{i + 1}. {r.question}
                    </p>

                    <div className="text-sm mt-2 space-y-1">
                      {r.options.map((opt, idx) => {
                        const isCorrect = idx === r.correct_index;
                        const isPicked = idx === r.selected_index;

                        return (
                          <div
                            key={idx}
                            className={`p-2 border rounded ${
                              isCorrect
                                ? "bg-green-100"
                                : isPicked
                                  ? "bg-red-100"
                                  : ""
                            }`}
                          >
                            {opt}
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
          <Button asChild>
            <Link to="/">Back to Home</Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
