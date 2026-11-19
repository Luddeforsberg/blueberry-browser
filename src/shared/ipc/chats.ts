// Part of the IPC contract (ipc.ts): what chats, routines and mascots send and get back.
// Types only, like ipc.ts: the sandboxed preload can't load shared runtime code, so nothing here may survive compilation.

export interface ChatChunk {
  chatId: string;
  content: string;
}

export type RoutineSaveResult = { ok: true; id: string } | { ok: false; error: string };

export type MascotSaveResult = { ok: true; id: string } | { ok: false; error: string };

// `mascotId` picks who a new chat runs as. An existing chat keeps the one it started with.
export interface ChatSendOptions {
  seePage: boolean;
  mascotId?: string | null;
  // Work in a browser in the cloud rather than in this window's tabs. Ignored while the cloud is off.
  cloud?: boolean;
  // Send it to the cloud runner, which keeps going with this computer off. Needs the user signed in.
  runner?: boolean;
  // What the + added: files by the ids main gave them, and the user's tabs by id. Main judges each again.
  files?: string[];
  tabs?: string[];
}
