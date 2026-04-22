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
  selected_index: number;
  is_correct: boolean;
  order_index: number;
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

  // ✅ LOAD DATA
  useEffect(() => {
    if (!code || !user) return;

    const load = async () => {
      setLoading(true);

      // Room
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

      // ✅ Leaderboard (FIXED)
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
        .order("score", { ascending: false })
        .order("submitted_at", { ascending: true });

      const rows: Row[] = (attempts ?? []).map((a: any) => ({
        user_id: a.user_id,
        display_name: a.profiles?.display_name ?? "Player",
        score: a.score ?? 0,
        total: a.total ?? 0,
        submitted_at: a.submitted_at ?? null,
      }));

      setLeaderboard(rows);

      const mine = rows.find((r) => r.user_id === user.id);
      if (mine) setMyScore({ score: mine.score, total: mine.total });

      // ✅ My Answers Review
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
          .map((a: any) => ({
            question: a.questions?.question ?? "",
            options: a.questions?.options ?? [],
            correct_index: a.questions?.correct_index ?? 0,
            selected_index: a.selected_index,
            is_correct: a.is_correct,
            order_index: a.questions?.order_index ?? 0,
          }))
          .sort((a, b) => a.order_index - b.order_index);

        setReview(reviewRows);
      }

      setLoading(false);
    };

    load();
  }, [code, user, navigate]);

  // ✅ REALTIME UPDATE
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
            .order("score", { ascending: false })
            .order("submitted_at", { ascending: true });

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

  // ✅ LOADING UI
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
        {/* Score */}
        {myScore && (
          <div className="paper-elevated p-8 text-center">
            <Trophy className="mx-auto h-10 w-10 text-accent" />
            <h1 className="mt-3 font-serif text-3xl text-primary">
              You scored {myScore.score} / {myScore.total}
            </h1>
          </div>
        )}

        {/* Leaderboard */}
        <section className="mt-8 paper p-6">
          <h2 className="mb-4 font-serif text-xl text-primary">Leaderboard</h2>

          {leaderboard.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No one has submitted yet...
            </p>
          ) : (
            <ul className="divide-y">
              {leaderboard.map((r, i) => (
                <li
                  key={r.user_id}
                  className={`flex items-center justify-between py-3 ${
                    r.user_id === user?.id ? "font-semibold" : ""
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-bold">
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
            </ul>
          )}
        </section>

        {/* Review */}
        {review.length > 0 && (
          <section className="mt-8 space-y-4">
            <h2 className="font-serif text-xl text-primary">Your Answers</h2>

            {review.map((r, i) => (
              <div key={i} className="paper p-5">
                <div className="flex gap-3">
                  {r.is_correct ? (
                    <Check className="text-green-500" />
                  ) : (
                    <X className="text-red-500" />
                  )}

                  <div>
                    <p className="font-medium">
                      Q{i + 1}. {r.question}
                    </p>

                    {r.options.map((opt, idx) => (
                      <div
                        key={idx}
                        className={`text-sm ${
                          idx === r.correct_index
                            ? "text-green-600"
                            : idx === r.selected_index
                            ? "text-red-500"
                            : ""
                        }`}
                      >
                        {String.fromCharCode(65 + idx)}. {opt}
                      </div>
                    ))}
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