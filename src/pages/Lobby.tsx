import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { startRoom } from "@/lib/room";
import { Copy, Crown, Users, Loader2 } from "lucide-react";

interface Room {
  id: string;
  code: string;
  host_id: string;
  status: "waiting" | "started" | "finished";
  passage_id: string | null;
  duration_seconds: number;
}
interface Member {
  user_id: string;
  joined_at: string;
  display_name: string;
  completed: boolean;
}

export default function Lobby() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [room, setRoom] = useState<Room | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [starting, setStarting] = useState(false);

  // Fetch room
  useEffect(() => {
    if (!code) return;
    const fetchRoom = async () => {
      const { data, error } = await supabase
        .from("rooms")
        .select("*")
        .eq("code", code.toUpperCase())
        .maybeSingle();
      if (error || !data) {
        toast.error("Room not found");
        navigate("/");
        return;
      }
      setRoom(data as Room);
      if (data.status === "started") navigate(`/test/${data.code}`);
    };
    fetchRoom();
  }, [code, navigate]);

  // Members + realtime
  useEffect(() => {
    if (!room) return;

    const loadMembers = async () => {
      const [{ data: rows }, { data: doneAttempts }] = await Promise.all([
        supabase
          .from("room_members")
          .select("user_id, joined_at, profiles!room_members_user_id_profiles_fkey(display_name)")
          .eq("room_id", room.id)
          .order("joined_at", { ascending: true }),
        supabase.from("attempts").select("user_id").eq("room_id", room.id),
      ]);
      const completedSet = new Set((doneAttempts ?? []).map((a: any) => a.user_id));
      if (rows) {
        setMembers(
          rows.map((m: any) => ({
            user_id: m.user_id,
            joined_at: m.joined_at,
            display_name: m.profiles?.display_name ?? "Player",
            completed: completedSet.has(m.user_id),
          }))
        );
      }
    };
    loadMembers();

    const channel = supabase
      .channel(`room-${room.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "room_members", filter: `room_id=eq.${room.id}` },
        () => loadMembers()
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "attempts", filter: `room_id=eq.${room.id}` },
        () => loadMembers()
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "rooms", filter: `id=eq.${room.id}` },
        (payload) => {
          const updated = payload.new as Room;
          setRoom(updated);
          if (updated.status === "started") navigate(`/test/${updated.code}`);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [room, navigate]);

  const isHost = user && room && user.id === room.host_id;

  const copyCode = () => {
    if (!room) return;
    navigator.clipboard.writeText(room.code);
    toast.success("Code copied");
  };

  const handleStart = async () => {
    if (!room) return;
    try {
      setStarting(true);
      await startRoom(room.id);
      // Navigation triggers via realtime UPDATE
    } catch (e: any) {
      toast.error(e.message ?? "Failed to start");
    } finally {
      setStarting(false);
    }
  };

  if (!room) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading room…
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container max-w-3xl py-10">
        <div className="paper-elevated p-8 text-center">
          <p className="text-sm uppercase tracking-wider text-muted-foreground">
            Room Code
          </p>
          <div className="mt-2 flex items-center justify-center gap-3">
            <h1 className="room-code text-4xl text-primary md:text-5xl">{room.code}</h1>
            <Button size="icon" variant="outline" onClick={copyCode}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Share this code with friends. Test starts when host clicks "Start".
          </p>
        </div>

        <div className="mt-6 paper p-6">
          <div className="mb-4 flex items-center gap-2 text-primary">
            <Users className="h-5 w-5" />
            <h2 className="font-serif text-xl">Players ({members.length})</h2>
          </div>
          <ul className="divide-y">
            {members.map((m) => (
              <li
                key={m.user_id}
                className="flex items-center justify-between py-3"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                    {m.display_name.charAt(0).toUpperCase()}
                  </div>
                  <span className="font-medium">{m.display_name}</span>
                  {m.user_id === room.host_id && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-accent/30 px-2 py-0.5 text-xs">
                      <Crown className="h-3 w-3" /> Host
                    </span>
                  )}
                  {m.user_id === user?.id && (
                    <span className="text-xs text-muted-foreground">(you)</span>
                  )}
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    m.completed
                      ? "bg-success/15 text-success"
                      : room.status === "started"
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {m.completed ? "Completed" : room.status === "started" ? "In test" : "Joined"}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-6 text-center">
          {isHost ? (
            <Button size="lg" onClick={handleStart} disabled={starting}>
              {starting ? "Starting…" : "Start Test"}
            </Button>
          ) : (
            <p className="flex items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Waiting for host to start…
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
