import type { ReplyPart } from "./agent";

// Splits what the model writes into the answer and what it says on the way there. A message's words can only be told
// apart once it calls a tool, and the answer has to stream as it's written, so they go out as the answer until then, and
// are taken back as a status line when it does. A provider names the call before its arguments, so that's soon after.
export class ReplySorter {
  private said = "";
  private calling = false;

  // More of the model's message, and whether this part of it calls a tool.
  chunk(text: string, calls: boolean): ReplyPart[] {
    this.said += text;
    if (!this.calling && !calls) return text ? [text] : [];
    const changed = text !== "" || !this.calling;
    this.calling = true;
    return changed && this.said.trim() ? [{ statusLine: this.said.trim() }] : [];
  }

  // The message is whole, so the next words start another. One that was cut down to words after calling a tool, as the
  // last call of a long job can be, is the answer after all.
  ended(calls: boolean): ReplyPart[] {
    const parts = calls ? this.chunk("", true) : this.calling && this.said ? [this.said] : [];
    this.said = "";
    this.calling = false;
    return parts;
  }
}
