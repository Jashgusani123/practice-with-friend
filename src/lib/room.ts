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
  durationSeconds = 1800
) {
  const code = generateRoomCode();

  // =========================
  // 1. FETCH ALL QUESTIONS
  // =========================
  let query = supabase
    .from("questions")
    .select("id, passage_id")
    .eq("subject", subject.toLowerCase());

  if (chapter && chapter !== "ALL") {
    query = query.eq("chapter", chapter.toLowerCase());
  }

  const { data: allQuestions, error: qErr } = await query;

  if (qErr) throw qErr;
  if (!allQuestions || allQuestions.length === 0) {
    throw new Error("No questions available for this selection");
  }

  // =========================
  // 2. REMOVE ALREADY ATTEMPTED (🔥 HISTORY)
  // =========================
  const { data: history } = await supabase
    .from("user_question_history")
    .select("question_id")
    .eq("user_id", hostId);

  const usedIds = history?.map((h) => h.question_id) || [];

  const availableQuestions = allQuestions.filter(
    (q) => !usedIds.includes(q.id)
  );

  if (availableQuestions.length === 0) {
    throw new Error("No new questions available (all attempted)");
  }

  // =========================
  // 3. RANDOMIZE & PICK 15
  // =========================
  const shuffled = [...availableQuestions].sort(() => Math.random() - 0.5);

  const selectedQuestions = shuffled.slice(0, 10);

  // =========================
  // 4. DETECT PASSAGE (ENGLISH ONLY)
  // =========================
  let passageId: string | null = null;

  if (subject.toLowerCase() === "english") {
    const withPassage = selectedQuestions.find((q) => q.passage_id);
    if (withPassage) {
      passageId = withPassage.passage_id;
    }
  }

  // =========================
  // 5. CREATE ROOM
  // =========================
  const { data: newRoom, error: roomErr } = await supabase
    .from("rooms")
    .insert({
      code,
      host_id: hostId,
      subject: subject.toLowerCase(),
      chapter: chapter === "ALL" ? null : chapter?.toLowerCase() || null,
      passage_id: passageId,
      duration_seconds: durationSeconds,
      status: "waiting",
    })
    .select()
    .single();

  if (roomErr) throw roomErr;

  // =========================
  // 6. SAVE ROOM QUESTIONS
  // =========================
  const roomQuestions = selectedQuestions.map((q, index) => ({
    room_id: newRoom.id,
    question_id: q.id,
    order_index: index,
  }));

  const { error: rqErr } = await supabase
    .from("room_questions")
    .insert(roomQuestions);

  if (rqErr) throw rqErr;

  // =========================
  // 7. ADD HOST AS PARTICIPANT
  // =========================
  await supabase.from("room_participants").insert({
    room_id: newRoom.id,
    user_id: hostId,
    status: "joined",
  });

  return newRoom;
}

export async function joinRoom(code: string, userId: string) {
  const { data: room, error } = await supabase
    .from("rooms")
    .select("*")
    .eq("code", code.toUpperCase())
    .maybeSingle();

  if (error) throw error;
  if (!room) throw new Error("Room not found");
  if (room.status === "finished") throw new Error("Room ended");

  const { error: mErr } = await supabase
    .from("room_participants")
    .insert({
      room_id: room.id,
      user_id: userId,
      status: "joined",
    });

  if (mErr && !mErr.message.includes("duplicate")) throw mErr;

  return room;
}

export async function startRoom(roomId: string) {
  const { error } = await supabase
    .from("rooms")
    .update({
      status: "started",
      started_at: new Date().toISOString(),
    })
    .eq("id", roomId);

  if (error) throw error;
}