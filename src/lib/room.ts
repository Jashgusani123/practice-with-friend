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
  chapter: string | null = null,
  durationSeconds = 1800
) {
  const code = generateRoomCode();
  const normalizedSubject = subject.toLowerCase();

  // =========================
  // 1. GET USER HISTORY
  // =========================
  const { data: history } = await supabase
    .from("user_question_history")
    .select("question_id")
    .eq("user_id", hostId);

  const usedIds = history?.map((h) => h.question_id) || [];

  // =========================
  // CONFIG: QUESTION LIMIT
  // =========================
  const QUESTION_LIMIT =
    normalizedSubject === "mock"
      ? 100
      : 10;

  let selectedQuestions: any[] = [];
  let passageId: string | null = null;

  // =========================
  // 2. ENGLISH LOGIC
  // =========================
  if (normalizedSubject === "english") {
    const { data: passages } = await supabase
      .from("passages")
      .select("id");

    if (!passages || passages.length === 0) {
      throw new Error("No passages available");
    }

    const shuffledPassages = [...passages].sort(
      () => Math.random() - 0.5
    );

    for (const p of shuffledPassages) {
      const { data: qs } = await supabase
        .from("questions")
        .select("id, passage_id")
        .eq("passage_id", p.id);

      const filtered = (qs || []).filter(
        (q) => !usedIds.includes(q.id)
      );

      if (filtered.length >= QUESTION_LIMIT) {
        selectedQuestions = filtered
          .sort(() => Math.random() - 0.5)
          .slice(0, QUESTION_LIMIT);

        passageId = p.id;
        break;
      }
    }

    if (selectedQuestions.length === 0) {
      throw new Error("No new English questions available");
    }
  }

  // =========================
  // 3. OTHER SUBJECTS (INCLUDING MOCK)
  // =========================
  else {
    let query = supabase
      .from("questions")
      .select("id, passage_id")
      .eq("subject", normalizedSubject);

    if (chapter && chapter !== "ALL") {
      query = query.eq("chapter", chapter.toLowerCase());
    }

    const { data: allQuestions, error } = await query;

    if (error) throw error;

    const available = (allQuestions || []).filter(
      (q) => !usedIds.includes(q.id)
    );

    if (available.length === 0) {
      throw new Error("No new questions available");
    }

    selectedQuestions = available
      .sort(() => Math.random() - 0.5)
      .slice(0, QUESTION_LIMIT);
  }

  // =========================
  // 4. CREATE ROOM
  // =========================
  const { data: newRoom, error: roomErr } = await supabase
    .from("rooms")
    .insert({
      code,
      host_id: hostId,
      subject: normalizedSubject,
      chapter: chapter === "ALL" ? null : chapter,
      passage_id: passageId,
      duration_seconds: durationSeconds,
      status: "waiting",
    })
    .select()
    .single();

  if (roomErr) throw roomErr;

  // =========================
  // 5. SAVE ROOM QUESTIONS
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
  // 6. ADD HOST
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