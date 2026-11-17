import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { NightToggle } from "@/components/NightToggle";

export function SiteHeader() {
  const [email, setEmail] = useState<string | null>(null);
  const qc = useQueryClient();
  const navigate = useNavigate();
  useEffect(() => { supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null)); }, []);
  async function signOut() {
    await qc.cancelQueries(); qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }
  return (
    <header className="border-b border-rule bg-sheet">
      <div className="mx-auto flex max-w-[1400px] items-center gap-6 px-5 py-3">
        <Link to="/" className="font-display text-xl font-bold">Ramus</Link>
        {email && <Link to="/gardens" className="text-sm hover:underline" activeProps={{ className: "underline" }}>My gardens</Link>}
        <div className="ml-auto flex items-center gap-3 text-sm">
          <NightToggle />
          {email ? (<><span className="font-mono text-xs text-muted-foreground">{email}</span><Button variant="outline" size="sm" onClick={signOut}>Sign out</Button></>)
            : <Button asChild variant="outline" size="sm"><Link to="/auth">Sign in</Link></Button>}
        </div>
      </div>
    </header>
  );
}
