import { useState } from "react";

/**
 * Where are your words? Short, plain steps for getting a discussion out of the apps people use.
 * The hard part of bringing words in is rarely the format; it is knowing where the export button is.
 */
type Source = { key: string; name: string; computer?: string[]; phone?: string[]; then: string };

export const SOURCES: Source[] = [
  {
    key: "whatsapp", name: "WhatsApp",
    phone: [
      "iPhone: open the chat, tap its name, then Export Chat → Without Media. Save it to Files or send it to yourself.",
      "Android: open the chat, tap ⋮ → More → Export chat → Without media.",
    ],
    computer: ["In WhatsApp on your computer or WhatsApp Web, select the messages, copy them and paste them here."],
    then: "Drop the .zip or .txt here as it is. Photos and voice notes are left out; only the words are kept.",
  },
  {
    key: "wechat", name: "WeChat 微信",
    computer: ["Open the chat in WeChat on your computer, select the messages, copy them and paste them here. Names and times come along."],
    then: "Placeholders such as [图片] and recalled messages are set aside, not deleted.",
  },
  {
    key: "teams", name: "Microsoft Teams",
    computer: [
      "A meeting: open the meeting chat or calendar event → Recap → Transcript → Download → .docx (or .vtt).",
      "A chat: select the messages, copy them and paste them here.",
    ],
    then: "Drop the .docx or .vtt here. The start time printed at the top of a .docx transcript is used for every line.",
  },
  {
    key: "zoom", name: "Zoom",
    computer: [
      "A recorded meeting: Recordings → open the meeting → download the audio transcript (.vtt).",
      "The meeting chat: in the meeting, open Chat → … → Save chat, then find the .txt in your Zoom folder.",
    ],
    then: "Drop the .vtt or .txt here.",
  },
  {
    key: "meet", name: "Google Meet",
    computer: ["The transcript is a Google Doc in the organiser's Drive (Meet Recordings). Open it → File → Download → Microsoft Word (.docx) or Plain text (.txt)."],
    then: "Drop the file here, or copy all the text and paste it.",
  },
  {
    key: "slack", name: "Slack",
    computer: [
      "A thread or a few messages: select them, copy and paste here.",
      "Whole channels: a workspace owner exports data (Workspace settings → Import/Export Data → Export) and shares the .zip.",
    ],
    then: "Drop the .zip here and pick the channels to bring in.",
  },
  {
    key: "ai", name: "ChatGPT · Claude",
    computer: [
      "ChatGPT: Settings → Data controls → Export data. Claude: Settings → Privacy → Export data.",
      "Download the .zip from the email you receive.",
    ],
    then: "Drop the .zip here and pick the conversations. Only the ones you pick are kept; the rest of the export stays on your device.",
  },
  {
    key: "notes", name: "Notes & documents",
    computer: ["Paste your notes, minutes or a voice-memo transcript, or drop a .docx, .txt or .md file."],
    then: "Lines like “Ana: …” become Ana's words. Plain paragraphs become notes from the person you choose.",
  },
];

export const LATER = "Screenshots and recordings: Ramus will read these in a later version. For now, copy the text, or bring in the transcript your meeting tool made.";

export function WordsGuide({ open: initial = null }: { open?: string | null }) {
  const [open, setOpen] = useState<string | null>(initial);
  const s = SOURCES.find((x) => x.key === open);
  return (
    <div className="grid gap-2" aria-label="Where are your words?">
      <p className="smallcaps text-[13px] text-muted-foreground">Where are your words?</p>
      <div className="flex flex-wrap gap-1.5" role="tablist">
        {SOURCES.map((x) => (
          <button key={x.key} type="button" role="tab" aria-selected={open === x.key} aria-controls="words-guide-panel"
            onClick={() => setOpen(open === x.key ? null : x.key)}
            className={"chip text-[14px] " + (open === x.key ? "border-ink" : "hover:border-ink")}>
            {x.name}
          </button>
        ))}
      </div>
      {s && (
        <div id="words-guide-panel" role="tabpanel" className="grid gap-2 rounded-md border border-rule bg-sheet p-3 text-[15px]">
          {s.phone && (
            <div><p className="smallcaps text-[13px] text-muted-foreground">On a phone</p><ul className="ml-4 list-disc">{s.phone.map((t) => <li key={t}>{t}</li>)}</ul></div>
          )}
          {s.computer && (
            <div><p className="smallcaps text-[13px] text-muted-foreground">On a computer</p><ul className="ml-4 list-disc">{s.computer.map((t) => <li key={t}>{t}</li>)}</ul></div>
          )}
          <p className="hand">{s.then}</p>
        </div>
      )}
      <p className="text-sm text-muted-foreground">{LATER}</p>
    </div>
  );
}
