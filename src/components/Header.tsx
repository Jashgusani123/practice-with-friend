import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Link, useNavigate } from "react-router-dom";
import { GraduationCap } from "lucide-react";

export default function Header() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="border-b bg-card">
      <div className="container flex h-16 items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <GraduationCap className="h-6 w-6 text-primary" />
          <span className="font-serif text-xl font-bold text-primary">
            DDCET MockTest
          </span>
        </Link>
        <nav className="flex items-center gap-3">
          {user ? (
            <>
              <span className="hidden text-sm text-muted-foreground sm:inline">
                {user.email}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  await signOut();
                  navigate("/auth");
                }}
              >
                Sign out
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={() => navigate("/auth")}>
              Sign in
            </Button>
          )}
        </nav>
      </div>
    </header>
  );
}
