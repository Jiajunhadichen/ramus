import { useEffect, useState } from "react";

/** Optional "Night" palette. Off by default, remembered on this device. */
export function NightToggle() {
  const [night, setNight] = useState(false);
  useEffect(() => { setNight(document.documentElement.classList.contains("dark")); }, []);
  function toggle() {
    const next = !night;
    setNight(next);
    document.documentElement.classList.toggle("dark", next);
    try { localStorage.setItem("ramus-night", next ? "1" : "0"); } catch { /* private mode */ }
  }
  return (
    <button type="button" aria-pressed={night} onClick={toggle} className="font-mono text-xs text-muted-foreground hover:text-foreground">
      Night {night ? "on" : "off"}
    </button>
  );
}
