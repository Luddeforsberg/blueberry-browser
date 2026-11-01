import type { MascotDraft, MascotExample, MascotProfile, GalleryMascot, PublishChoices } from "./library";
import { parseMascotDraft } from "./mascots";

// What strangers can read and add. Runtime code shared by main, the chrome renderer and the public site, so preloads may
// only `import type` from here. Everything published is untrusted, in both directions: this checks what's sent, and
// checks again what's read, whoever wrote it. `supabase/migrations` has the same limits.

export const GALLERY_CATEGORIES = ["News and research", "Home and shopping", "Travel", "Work", "Other"];
export const MAX_AUTHOR = 40;
export const MAX_DESCRIPTION = 140;
export const MAX_EXAMPLE_PROMPT = 2000;
export const MAX_EXAMPLE_ANSWER = 6000;

// Text a person can't see but a model can read, and text that shows in a different order than it's stored. What's on
// the review screen has to be what the mascot is told. Newlines and tabs stay.
const INVISIBLE = /[\p{Cc}\p{Cf}\p{Co}\p{Default_Ignorable_Code_Point}]/gu;
export const withoutInvisible = (text: unknown): string =>
  typeof text === "string" ? text.replace(/\r\n?/g, "\n").replace(INVISIBLE, (found) => (found === "\n" || found === "\t" ? found : "")).trim() : "";
const cleanLine = (text: unknown): string => withoutInvisible(text).replace(/\s+/g, " ");

const SAFE_NAME = /^[\p{L}\p{N}][\p{L}\p{N} '’.&-]*$/u;
const HOST_IS_LOCAL = /^(localhost|[\d.]+|\[.*\]|.*\.(local|internal|localhost|invalid|test))$/i;

// A stranger's mascot can't be limited to this computer or the user's own network, however the limit is worded.
const isPublicSite = (site: string) => !HOST_IS_LOCAL.test(site);

// The same checks as a hand-made mascot, then the stricter ones for what comes from or goes to strangers.
export const parsePublicDraft = (input: unknown): { draft: MascotDraft } | { error: string } => {
  const { name, instructions, ...rest } = (input ?? {}) as Record<string, unknown>;
  const parsed = parseMascotDraft({ ...rest, name: cleanLine(name), instructions: withoutInvisible(instructions) });
  if ("error" in parsed) return parsed;
  const { draft } = parsed;
  if (!SAFE_NAME.test(draft.name)) return { error: "To publish it, its name can only have letters, numbers, spaces and ' . & -." };
  if (["berry", "blueberry"].includes(draft.name.toLowerCase())) return { error: "That name is taken by Blueberry itself. Give it its own." };
  const local = draft.sites.find((site) => !isPublicSite(site));
  if (local) return { error: `${local} is only reachable from your own computer or network, so it can’t be published.` };
  return { draft };
};

const parseExample = (input: unknown): { example: MascotExample | null } | { error: string } => {
  if (input === null || input === undefined) return { example: null };
  const { prompt, answer } = input as Record<string, unknown>;
  const clean = { prompt: withoutInvisible(prompt), answer: withoutInvisible(answer) };
  if (!clean.prompt || !clean.answer) return { error: "An example needs both what was asked and what it gave. Or choose no example." };
  if (clean.prompt.length > MAX_EXAMPLE_PROMPT) return { error: `Keep what was asked under ${MAX_EXAMPLE_PROMPT} characters.` };
  if (clean.answer.length > MAX_EXAMPLE_ANSWER) return { error: `Keep the answer under ${MAX_EXAMPLE_ANSWER} characters. Cut it down to what shows the mascot best.` };
  return { example: clean };
};

const authorProblem = (author: string): string | null => {
  if (!author) return "Choose the name to publish under.";
  if (author.length > MAX_AUTHOR) return `Keep your name under ${MAX_AUTHOR} characters.`;
  if (author.includes("@")) return "Your name here can’t have an email address in it.";
  if (/[<>]/.test(author)) return "Your name here can’t have < or > in it.";
  if (/blueberry/i.test(author)) return "That reads as if Blueberry made it. Choose your own name.";
  return null;
};

export const parsePublishChoices = (input: unknown): { choices: PublishChoices } | { error: string } => {
  const { author, description, category, example } = (input ?? {}) as Record<string, unknown>;
  const cleanAuthor = cleanLine(author);
  const problem = authorProblem(cleanAuthor);
  if (problem) return { error: problem };
  const cleanDescription = cleanLine(description);
  if (!cleanDescription) return { error: "Say in one line what it does." };
  if (cleanDescription.length > MAX_DESCRIPTION) return { error: `Keep the line on what it does under ${MAX_DESCRIPTION} characters.` };
  if (typeof category !== "string" || !GALLERY_CATEGORIES.includes(category)) return { error: "Choose a category." };
  const parsed = parseExample(example);
  if ("error" in parsed) return parsed;
  return { choices: { author: cleanAuthor, description: cleanDescription, category, example: parsed.example } };
};

// The exact row that goes to the server. Nothing else leaves the computer when publishing, and the preview reads this.
export const publicRow = ({ name, look, instructions, sites, tools }: MascotDraft, { author, description, category, example }: PublishChoices) => ({
  name,
  palette: look.palette,
  accessory: look.accessory,
  description,
  category,
  instructions,
  sites,
  tools,
  author_name: author,
  example_prompt: example?.prompt ?? null,
  example_answer: example?.answer ?? null,
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: unknown): value is string => typeof value === "string" && UUID.test(value);

// A row from the server, whoever wrote it. Anything wrong with it and it shows nothing, rather than something the app
// would read differently. A category we don't know is Other, and a bad example just isn't shown.
export const parsePublishedRow = (input: unknown): GalleryMascot | null => {
  const row = (input ?? {}) as Record<string, unknown>;
  if (!isUuid(row.id)) return null;
  const parsed = parsePublicDraft({ name: row.name, look: { palette: row.palette, accessory: row.accessory }, instructions: row.instructions, sites: row.sites, tools: row.tools });
  if ("error" in parsed) return null;
  const author = cleanLine(row.author_name);
  const description = cleanLine(row.description);
  if (authorProblem(author) || !description || description.length > MAX_DESCRIPTION) return null;
  const example = parseExample(row.example_prompt === null && row.example_answer === null ? null : { prompt: row.example_prompt, answer: row.example_answer });
  const publishedAt = Date.parse(String(row.created_at));
  return {
    id: row.id,
    author,
    category: typeof row.category === "string" && GALLERY_CATEGORIES.includes(row.category) ? row.category : "Other",
    description,
    draft: parsed.draft,
    example: "error" in example ? null : example.example,
    addCount: Number.isSafeInteger(row.add_count) && Number(row.add_count) >= 0 ? Number(row.add_count) : 0,
    publishedAt: Number.isNaN(publishedAt) ? 0 : publishedAt,
  };
};

const SECRET_SHAPES: { name: string; shape: RegExp }[] = [
  { name: "an email address", shape: /[^\s@<>()]+@[^\s@<>()]+\.[a-z]{2,}/i },
  { name: "an API key or token", shape: /\b(?:sk|pk|rk|sb)[-_][a-z0-9_-]{16,}|\bgh[pousr]_[a-z0-9]{20,}|\bgithub_pat_\w{20,}|\bAKIA[0-9A-Z]{16}\b|\bxox[a-z]-[a-z0-9-]{10,}|\bBearer\s+[\w.-]{16,}|\beyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{5,}/i },
  { name: "a password", shape: /\b(?:password|passwd|lösenord|pwd|secret|api[ _-]?key)\b\s*(?:is|är|[:=])\s*\S+/i },
  { name: "a long string that could be a key", shape: /\b(?=[a-z0-9_-]*\d)(?=[a-z0-9_-]*[a-z])[a-z0-9_-]{32,}\b/i },
  { name: "a card number", shape: /\b\d(?:[ -]?\d){12,18}\b/ },
];

// Warns and doesn't block, because the user decides. Each line says what it looks like and where.
export const publishWarnings = (draft: Pick<MascotProfile, "instructions">, { author, description, example }: PublishChoices): string[] => {
  const fields: [string, string][] = [
    ["its instructions", draft.instructions],
    ["the line on what it does", description],
    ["your name", author],
    ["the example’s question", example?.prompt ?? ""],
    ["the example’s answer", example?.answer ?? ""],
  ];
  return fields.flatMap(([where, text]) => SECRET_SHAPES.filter(({ shape }) => shape.test(text)).map(({ name }) => `There may be ${name} in ${where}.`));
};

