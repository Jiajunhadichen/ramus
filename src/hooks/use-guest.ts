import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

/**
 * Is the person a guest (trying Ramus without an account)? Guests can grow one tree; keeping it beyond this
 * browser (signing up), downloading and exporting need an account. Why: the user decided people try first and
 * sign up when they want to keep or take the tree with them.
 */
export function useGuest(): boolean {
  const [guest, setGuest] = useState(false);
  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setGuest(data.user?.is_anonymous === true));
    const { data } = supabase.auth.onAuthStateChange((_e, session) => setGuest(session?.user?.is_anonymous === true));
    return () => data.subscription.unsubscribe();
  }, []);
  return guest;
}

/** Ask a guest to sign up before something only an account can do; the tree they grew comes with them. */
export function askToSignUp(what: string) {
  toast(`Sign up to ${what}. Your tree comes with you.`, { action: { label: "Sign up", onClick: () => window.location.assign("/auth?mode=up") } });
}
