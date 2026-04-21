import { supabase } from "@/integrations/supabase/client";

// Room logic kept modular so realtime/Socket.IO style upgrades stay localized.

export function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export async function createRoom(hostId: string, durationSeconds = 1800) {
  // Pick a random long-form passage (only those with the new paragraph format)
  const { data: passages, error: pErr } = await supabase
    .from("passages")
    .select("id")
    .not("paragraphs", "is", null);
  if (pErr) throw pErr;
  if (!passages?.length) throw new Error("No passages available");
  const passage = passages[Math.floor(Math.random() * passages.length)];

  // Try a few codes in case of unique collision
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateRoomCode();
    const { data, error } = await supabase
      .from("rooms")
      .insert({
        code,
        host_id: hostId,
        passage_id: passage.id,
        duration_seconds: durationSeconds,
      })
      .select()
      .single();

    if (!error && data) {
      // Auto-join host as member
      await supabase.from("room_members").insert({
        room_id: data.id,
        user_id: hostId,
      });
      return data;
    }
    if (error && !error.message.includes("duplicate")) throw error;
  }
  throw new Error("Could not generate unique room code");
}

export async function joinRoom(code: string, userId: string) {
  const { data: room, error } = await supabase
    .from("rooms")
    .select("*")
    .eq("code", code.toUpperCase())
    .maybeSingle();
  if (error) throw error;
  if (!room) throw new Error("Room not found");
  if (room.status === "finished") throw new Error("This room has ended");

  // Insert membership (idempotent via unique constraint)
  const { error: mErr } = await supabase
    .from("room_members")
    .insert({ room_id: room.id, user_id: userId });
  if (mErr && !mErr.message.includes("duplicate")) throw mErr;

  return room;
}

export async function startRoom(roomId: string) {
  const { error } = await supabase
    .from("rooms")
    .update({ status: "started", started_at: new Date().toISOString() })
    .eq("id", roomId);
  if (error) throw error;
}
