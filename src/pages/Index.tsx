import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { joinRoom } from "@/lib/room";
import { createRoom } from "@/lib/room";

import { toast } from "sonner";
import { Users, PlusCircle, LogIn, Sparkles } from "lucide-react";

const Index = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [code, setCode] = useState("");
  const [subject, setSubject] = useState("english"); // ✅ subject state
  const [loading, setLoading] = useState<"create" | "join" | null>(null);

  // ✅ CREATE ROOM
  const handleCreate = async () => {
    if (!user) return navigate("/auth");

    try {
      setLoading("create");

      // ✅ pass subject here
      const room = await createRoom(user.id, subject, null);

      navigate(`/lobby/${room.code}`);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to create room");
    } finally {
      setLoading(null);
    }
  };

  // ✅ JOIN ROOM
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
        {/* Heading */}
        <section className="mb-12 text-center">
          <h1 className="font-serif text-4xl text-primary md:text-5xl">
            Take Tests with Friends
          </h1>

          <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
            Create a private room, share the code, and race through a
            passage-based test together. Live leaderboard included.
          </p>
        </section>

        <div className="grid gap-6 md:grid-cols-2">
          {/* ✅ CREATE ROOM */}
          <div className="paper p-8">
            <div className="mb-4 inline-flex rounded-full bg-primary/10 p-3">
              <PlusCircle className="h-6 w-6 text-primary" />
            </div>

            <h2 className="font-serif text-2xl text-primary">Create a Room</h2>

            <p className="mt-2 text-sm text-muted-foreground">
              You'll be the host. A unique code will be generated for friends to
              join.
            </p>

            {/* ✅ SUBJECT SELECT */}
            <div className="mt-4 space-y-2 text-left">
              <div className="mt-4 space-y-2 text-left">
                <Label>Select Subject</Label>

                <select
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full border rounded p-2"
                >
                  <option value="english">English</option>
                  <option value="mathematics">Mathematics</option>
                  <option value="physics">Physics</option>
                  <option value="chemistry">Chemistry</option>
                  <option value="computer">Computer</option>
                  <option value="environment">Environment</option>
                  <option value="mock">Mock Test</option>
                </select>
              </div>
            </div>

            <Button
              onClick={handleCreate}
              disabled={loading !== null}
              size="lg"
              className="mt-6 w-full"
            >
              {loading === "create" ? "Creating…" : "Create Room"}
            </Button>
          </div>

          {/* ✅ JOIN ROOM */}
          <div className="paper p-8">
            <div className="mb-4 inline-flex rounded-full bg-accent/20 p-3">
              <LogIn className="h-6 w-6 text-foreground" />
            </div>

            <h2 className="font-serif text-2xl text-primary">Join a Room</h2>

            <p className="mt-2 text-sm text-muted-foreground">
              Enter the 6-character code your host shared with you.
            </p>

            <form onSubmit={handleJoin} className="mt-6 space-y-3">
              <Label htmlFor="code" className="sr-only">
                Room code
              </Label>

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

        {/* Info Section */}
        <section className="mt-12 paper p-6 text-center text-sm text-muted-foreground">
          <Users className="mx-auto mb-2 h-5 w-5" />
          Each test pulls a random 20-paragraph passage with 10 timed questions.
        </section>

        {/* Admin Link */}
        <div className="mt-6 text-center">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/admin/generate">
              <Sparkles className="mr-2 h-4 w-4" />
              Generate a new passage with AI
            </Link>
          </Button>
        </div>
      </main>
    </div>
  );
};

export default Index;
