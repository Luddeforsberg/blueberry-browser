// A run's record gets committed, and an address's query can carry what a site knows about the machine, such as the
// public IP inside a Google captcha's token. So addresses lose their query and fragment before it's saved.
// It never ends on punctuation, so a comma or full stop after an address stays in the sentence.
const ADDRESS = /https?:\/\/[^\s"'<>()[\]\\]*[^\s"'<>()[\]\\.,;:!?]/g;
const CAPTCHA = /^https?:\/\/(www\.)?google\.[a-z.]+\/sorry\//;

const bare = (address: string) => address.replace(/[?#].*$/, "");

export const withoutQueries = (text: string, only: (address: string) => boolean = () => true): string =>
  text.replace(ADDRESS, (address) => (only(address) ? bare(address) : address));

// The answer stays word for word, because starter examples are copied from it, except for a captcha's address.
export const recordWithoutQueries = <T extends { answer: string }>({ answer, ...rest }: T): T =>
  ({ ...JSON.parse(withoutQueries(JSON.stringify(rest))), answer: withoutQueries(answer, (address) => CAPTCHA.test(address)) }) as T;
