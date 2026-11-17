import { useEffect, useRef } from "react";
import { isDiscussionText, pageIsFree } from "@/lib/intake/handover";

/**
 * Anywhere on a page: pasting a discussion (two or more lines, with no field focused) or dropping files
 * hands them to `onReceive`. One behaviour for every page that can bring words in.
 */
export function useBringIn(onReceive: (r: { text?: string; files?: File[] }) => void) {
  const cb = useRef(onReceive);
  cb.current = onReceive;
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (!pageIsFree()) return;
      const files = [...(e.clipboardData?.files ?? [])];
      if (files.length) { e.preventDefault(); cb.current({ files }); return; }
      const t = e.clipboardData?.getData("text/plain") ?? "";
      if (!isDiscussionText(t)) return;
      e.preventDefault(); cb.current({ text: t });
    };
    const onOver = (e: DragEvent) => { if (e.dataTransfer?.types.includes("Files")) e.preventDefault(); };
    const onDrop = (e: DragEvent) => {
      const files = [...(e.dataTransfer?.files ?? [])];
      if (!files.length || e.defaultPrevented) return;
      e.preventDefault(); cb.current({ files });
    };
    window.addEventListener("paste", onPaste);
    window.addEventListener("dragover", onOver);
    window.addEventListener("drop", onDrop);
    return () => { window.removeEventListener("paste", onPaste); window.removeEventListener("dragover", onOver); window.removeEventListener("drop", onDrop); };
  }, []);
}
