import { supabase } from "@/integrations/supabase/client";

export function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export async function createRoom(
  hostId: string,
  subject: string,
  chapter: string | null,
  durationSeconds = 3600
) {
  const code = generateRoomCode();

  let passageId: string | null = null;

  // =========================
  // PASSAGE (ONLY ONCE)
  // =========================
  if (subject.toLowerCase() === "english") {
    const { data: passages } = await supabase
      .from("passages")
      .select("id");

    if (passages && passages.length > 0) {
      const random =
        passages[Math.floor(Math.random() * passages.length)];
      passageId = random.id;
    }
  }

  // =========================
  // QUESTIONS QUERY
  // =========================
  let query = supabase
    .from("questions")
    .select("*")
    .eq("subject", subject.toLowerCase());

  if (chapter && chapter !== "ALL") {
    query = query.eq("chapter", chapter.toLowerCase());
  }

  if (passageId) {
    query = query.eq("passage_id", passageId);
  }

  const { data: allQuestions, error: qErr } = await query;

  if (qErr) throw qErr;

  if (!allQuestions || allQuestions.length === 0) {
    throw new Error("No questions available");
  }

  const shuffled = [...allQuestions].sort(() => Math.random() - 0.5);
  const selectedQuestions = shuffled.slice(0, 10);

  // =========================
  // CREATE ROOM
  // =========================
  const { data: newRoom, error: roomErr } = await supabase
    .from("rooms")
    .insert({
      code,
      host_id: hostId,
      subject: subject.toLowerCase(),
      chapter: chapter === "ALL" ? null : chapter?.toLowerCase(),
      passage_id: passageId,
      duration_seconds: durationSeconds,
      status: "waiting",
    })
    .select()
    .single();

  if (roomErr) throw roomErr;

  // optional (if you still use it)
  const roomQuestions = selectedQuestions.map((q, i) => ({
    room_id: newRoom.id,
    question_id: q.id,
    order_index: i,
  }));

  await supabase.from("room_questions").insert(roomQuestions);

  await supabase.from("room_participants").insert({
    room_id: newRoom.id,
    user_id: hostId,
    status: "joined",
  });

  return newRoom;
}