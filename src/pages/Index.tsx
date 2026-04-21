import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { createRoom, joinRoom } from "@/lib/room";
import { toast } from "sonner";
import { Users, PlusCircle, LogIn, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";

const Index = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState<"create" | "join" | null>(null);

  const handleCreate = async () => {
    if (!user) return navigate("/auth");
    try {
      setLoading("create");
      const room = await createRoom(user.id);
      navigate(`/lobby/${room.code}`);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to create room");
    } finally {
      setLoading(null);
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return navigate("/auth");
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length < 4) {
      toast.error("Enter a valid room code");
      return;
    }
    try {
      setLoading("join");
      const room = await joinRoom(trimmed, user.id);
      navigate(`/lobby/${room.code}`);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to join room");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container max-w-5xl py-12">
        <section className="mb-12 text-center">
          <h1 className="font-serif text-4xl text-primary md:text-5xl">
            Take DDCET Mock Tests with Friends
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
            Create a private room, share the code, and race through a passage-based
            test together. Live leaderboard included.
          </p>
        </section>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Create */}
          <div className="paper p-8">
            <div className="mb-4 inline-flex rounded-full bg-primary/10 p-3">
              <PlusCircle className="h-6 w-6 text-primary" />
            </div>
            <h2 className="font-serif text-2xl text-primary">Create a Room</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              You'll be the host. A unique code will be generated for friends to join.
            </p>
            <Button
              onClick={handleCreate}
              disabled={loading !== null}
              size="lg"
              className="mt-6 w-full"
            >
              {loading === "create" ? "Creating…" : "Create Room"}
            </Button>
          </div>

          {/* Join */}
          <div className="paper p-8">
            <div className="mb-4 inline-flex rounded-full bg-accent/20 p-3">
              <LogIn className="h-6 w-6 text-foreground" />
            </div>
            <h2 className="font-serif text-2xl text-primary">Join a Room</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Enter the 6-character code your host shared with you.
            </p>
            <form onSubmit={handleJoin} className="mt-6 space-y-3">
              <Label htmlFor="code" className="sr-only">Room code</Label>
              <Input
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="ABC123"
                maxLength={6}
                className="room-code text-center text-lg uppercase"
              />
              <Button
                type="submit"
                disabled={loading !== null}
                size="lg"
                variant="secondary"
                className="w-full"
              >
                {loading === "join" ? "Joining…" : "Join Room"}
              </Button>
            </form>
          </div>
        </div>

        <section className="mt-12 paper p-6 text-center text-sm text-muted-foreground">
          <Users className="mx-auto mb-2 h-5 w-5" />
          Each test pulls a random passage with 5 timed questions.
        </section>
      </main>
    </div>
  );
};

export default Index;
