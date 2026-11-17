import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { NightToggle } from "@/components/NightToggle";

export function SiteHeader({ bare = false }: { bare?: boolean }) {
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
    <header className={bare ? "border-b border-transparent" : "border-b border-rule bg-sheet"}>
      <div className="page flex flex-wrap items-center gap-3 py-3 sm:gap-6">
        <Link to="/" className="font-display text-xl">Ramus</Link>
        {email && <Link to="/gardens" className="smallcaps text-[15px] hover:underline" activeProps={{ className: "underline" }}>My gardens</Link>}
        <div className="ml-auto flex items-center gap-3 text-sm">
          <NightToggle />
          {email ? (<><span className="smallcaps hidden max-w-[240px] truncate text-[13px] text-muted-foreground md:inline">{email}</span><Button variant="outline" size="sm" onClick={signOut}>Sign out</Button></>)
            : <Button asChild variant="outline" size="sm"><Link to="/auth">Sign in</Link></Button>}
        </div>
      </div>
    </header>
  );
}
