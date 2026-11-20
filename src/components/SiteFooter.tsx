import { Link } from "@tanstack/react-router";

export function SiteFooter() {
  return (
    <footer className="page flex items-center gap-4 py-8 text-ui text-muted-foreground">
      <span className="smallcaps text-note">Ramus · an idea garden</span>
      <Link to="/principles" className="ml-auto hover:text-foreground hover:underline">Principles</Link>
      <Link to="/privacy" className="hover:text-foreground hover:underline">Privacy</Link>
    </footer>
  );
}
