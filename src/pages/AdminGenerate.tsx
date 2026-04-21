import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Sparkles, ArrowLeft } from "lucide-react";

export default function AdminGenerate() {
  const [topic, setTopic] = useState("Renewable energy and the future of electricity grids");
  const [difficulty, setDifficulty] = useState<"easy" | "moderate" | "hard">("moderate");
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState<{ title: string } | null>(null);

  const handleGenerate = async () => {
    if (!topic.trim()) {
      toast.error("Enter a topic");
      return;
    }
    setLoading(true);
    setCreated(null);
    try {
      const { data, error } = await supabase.functions.invoke("generate-passage", {
        body: { topic, difficulty },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setCreated({ title: data.passage.title });
      toast.success("Passage generated and added");
    } catch (e: any) {
      toast.error(e.message ?? "Generation failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container max-w-2xl py-10">
        <Button variant="ghost" size="sm" asChild className="mb-4">
          <Link to="/">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Link>
        </Button>

        <div className="paper-elevated p-8">
          <div className="mb-2 flex items-center gap-2 text-primary">
            <Sparkles className="h-5 w-5" />
            <h1 className="font-serif text-2xl">Generate New Passage</h1>
          </div>
          <p className="mb-6 text-sm text-muted-foreground">
            Use AI to create a 20-paragraph DDCET-level comprehension passage with 10 MCQs.
            Generation takes ~30–60 seconds.
          </p>

          <div className="space-y-4">
            <div>
              <Label htmlFor="topic">Topic</Label>
              <Input
                id="topic"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g., Quantum computing fundamentals"
                disabled={loading}
              />
            </div>

            <div>
              <Label htmlFor="difficulty">Difficulty</Label>
              <Select
                value={difficulty}
                onValueChange={(v) => setDifficulty(v as typeof difficulty)}
                disabled={loading}
              >
                <SelectTrigger id="difficulty">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="easy">Easy</SelectItem>
                  <SelectItem value="moderate">Moderate</SelectItem>
                  <SelectItem value="hard">Hard</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={handleGenerate}
              disabled={loading}
              size="lg"
              className="w-full"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating passage…
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Generate Passage
                </>
              )}
            </Button>

            {created && (
              <div className="rounded-md border border-success/30 bg-success/10 p-4 text-sm">
                <p className="font-medium text-success">✓ Added: {created.title}</p>
                <p className="mt-1 text-muted-foreground">
                  It will appear in random rotation when a host creates a new room.
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
