import { Link } from "@tanstack/react-router";

export function SiteFooter() {
  return (
    <footer className="mx-auto flex max-w-[1400px] items-center gap-4 px-5 py-8 font-mono text-xs text-muted-foreground">
      <span>Ramus · an idea garden</span>
      <Link to="/principles" className="ml-auto hover:text-foreground hover:underline">Principles</Link>
    </footer>
  );
}
