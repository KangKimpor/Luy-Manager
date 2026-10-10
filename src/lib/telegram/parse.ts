import { parseAmount, type CurrencyCode, type Money } from "@/lib/money";

/**
 * Message parsing for the Telegram bot, PRD Section 9.
 *
 * ## Why rules and not an LLM
 *
 * PRD Section 17 left decision 6 open: rules-based parsing versus LLM intent
 * extraction. This resolves it as rules, for four reasons that matter more than
 * flexibility:
 *
 *   1. **Cost per message.** The bot's whole point is that logging a coffee takes
 *      three seconds and no thought. A per-message API call turns the cheapest
 *      interaction in the product into the most expensive one.
 *   2. **Latency.** A rules pass is microseconds. A model round trip is hundreds of
 *      milliseconds on a good day, and Telegram will retry a webhook that takes too
 *      long, which risks double-posting a transaction.
 *   3. **Determinism.** "Spent $5 coffee" must produce the same transaction every
 *      time. A parser that occasionally reinterprets the same sentence is
 *      unusable in a ledger, and untestable.
 *   4. **It writes money.** An unreviewable component that can insert rows into a
 *      financial ledger is the wrong shape. Rules can be read, tested, and argued
 *      with, and every guess they make is visible in `confidence`.
 *
 * The grammar this needs to cover is small and stable: an amount, a direction, and
 * some words. That is a parser, not a reasoning problem.
 *
 * A model is still the right tool for the *fuzzy* half, mapping "brown" to the
 * Coffee category. That is why category resolution is deliberately not done here:
 * the parser returns a `descriptor` string and the caller resolves it against the
 * user's own categories and merchants, which can later be swapped for something
 * smarter without touching the money path.
 *
 * ## Everything is a guess with a number attached
 *
 * Section 9 requires confirming before saving when confidence is below 90%. That
 * only works if every inference lowers a score, so each guess below subtracts an
 * explicit penalty rather than being silently assumed.
 */

/** Below this, the bot asks before writing. PRD Section 9. */
export const CONFIRM_THRESHOLD = 0.9;

/**
 * Penalty for guessing the unit from magnitude alone.
 *
 * Large on purpose: getting this wrong is a 4000x error, not a rounding
 * difference, so a bare number always ends up needing confirmation.
 */
const PENALTY_UNIT_GUESS = 0.35;

/** Penalty for a direction that was assumed rather than stated. */
const PENALTY_ASSUMED_DIRECTION = 0.15;

/** Penalty when leftover words suggest the message said more than we understood. */
const PENALTY_LEFTOVER_WORDS = 0.05;

/**
 * A bare number at or above this is read as riel.
 *
 * Cambodian usage makes this unambiguous in practice. Nobody messages their own
 * finance bot to record a $1,200 lunch, and riel amounts below about 1,000 barely
 * exist because 100៛ is the smallest note in circulation. The threshold is
 * deliberately well clear of both: a plausible dollar figure for a chat-logged
 * purchase tops out in the low hundreds, and a plausible riel figure starts in the
 * thousands.
 *
 * It is still a guess, so it costs PENALTY_UNIT_GUESS and the bot asks.
 */
const RIEL_MAGNITUDE_THRESHOLD = 1000;

export type RecordType = "expense" | "income" | "refund";

export interface EntryMode {
  type: "expense" | "income";
  currency: CurrencyCode;
  accountId?: string;
  /** A displayed default may follow an explicit currency; a chosen wallet must stay fixed. */
  autoAccount?: boolean;
}

export interface RecordIntent {
  kind: "record";
  type: RecordType;
  amount: Money;
  /** The words left after removing the verb and the figure, e.g. "coffee". */
  descriptor: string;
  /** An explicit "from ABA" or "in Cash" must never fall back to another account. */
  accountHint?: string;
  /** Frozen only when offering a confirmation, never accepted from message text. */
  resolvedAccountId?: string;
  confidence: number;
}

export interface TransferIntent {
  kind: "transfer";
  amount: Money;
  fromHint: string;
  toHint: string;
  /** The actual amount received, for a bank conversion that differs from the quote. */
  receivedAmount?: Money;
  resolvedFromId?: string;
  resolvedToId?: string;
  confidence: number;
}

export type TelegramIntent =
  | RecordIntent
  | TransferIntent
  | { kind: "entry"; mode: EntryMode | null; confidence: number }
  | { kind: "start-entry"; type: EntryMode["type"]; confidence: number }
  | { kind: "more"; confidence: number }
  | { kind: "back"; confidence: number }
  | { kind: "choose-account"; confidence: number }
  | { kind: "select-account"; name: string; currency: CurrencyCode; confidence: number }
  | { kind: "undo"; confidence: number }
  /** Answers to a confirmation the bot asked for. See needsConfirmation. */
  | { kind: "confirm"; confidence: number }
  | { kind: "cancel"; confidence: number }
  | { kind: "discard"; confidence: number }
  | { kind: "budget"; confidence: number }
  | { kind: "accounts"; confidence: number }
  | { kind: "recent"; confidence: number }
  | { kind: "rate"; confidence: number }
  | { kind: "guide"; operation: RecordType | "transfer"; confidence: number }
  | { kind: "summary"; window: "today" | "month"; confidence: number }
  | { kind: "link"; token: string; confidence: number }
  | { kind: "help"; confidence: number }
  | { kind: "unknown"; text: string; confidence: number };

/** Whether this intent must be confirmed before it touches the ledger. */
export function needsConfirmation(intent: TelegramIntent): boolean {
  // Read-only intents have nothing to confirm; only writes can do damage.
  if (intent.kind !== "record" && intent.kind !== "transfer") return false;
  return intent.confidence < CONFIRM_THRESHOLD;
}

const EXPENSE_VERBS = /\b(spent|spend|paid|pay|bought|buy|expense|cost)\b/;
const INCOME_VERBS = /\b(salary|received|receive|got|earned|earn|income|deposit)\b/;
const REFUND_VERBS = /\b(refund|refunded|reimbursed|returned)\b/;
const TRANSFER_VERBS = /\b(transfer|transferred|move|moved)\b/;

/**
 * Currency markers.
 *
 * A trailing bare "r" counts as riel because it is how people actually type it,
 * but only directly after digits so a word like "rice" cannot match.
 */
const USD_MARKER = /(\$|\b(usd|dollars?|dollar)\b)/;
const KHR_MARKER = /(៛|\b(khr|riels?|riel)\b|(?<=\d)\s*r\b)/;

/**
 * Which currency a matched marker means.
 *
 * Tested against the marker text alone, so it cannot reuse KHR_MARKER: that
 * pattern's `(?<=\d)` lookbehind needs the digits that are no longer present in
 * the captured substring, and "12000r" would silently resolve to dollars.
 */
function unitFromMarker(marker: string): CurrencyCode {
  return /៛|khr|riel|^\s*r$/i.test(marker) ? "KHR" : "USD";
}

/** A number with optional thousands separators and up to two decimal places. */
const NUMBER = /((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?)(?![\d.,])/;

interface AmountMatch {
  amount: Money;
  /** The exact substring consumed, so it can be removed from the descriptor. */
  consumed: string;
  inferredUnit: boolean;
}

/**
 * Pull the figure and its currency out of a message.
 *
 * Order matters. An explicit marker always wins over the magnitude heuristic, and
 * a marker is looked for on both sides of the number because "$5" and "5 dollars"
 * are equally common.
 */
export function extractAmount(text: string, selectedCurrency?: CurrencyCode): AmountMatch | null {
  const lower = text.toLowerCase();

  // A partial match in "-5", "$5.999" or "5,00" would silently change the
  // amount. Refuse the entire message rather than extract its valid-looking tail.
  if (/(?:-\s*\$?\s*\d|\$\s*-\s*\d)/.test(lower)) return null;
  if (/\d\.\d{3,}|\d,\d{1,2}(?!\d)|\d\.(?!\d)/.test(lower)) return null;

  // "$5", "$ 5.25"
  const dollarPrefixed = lower.match(new RegExp(`\\$\\s*${NUMBER.source}`));
  if (dollarPrefixed) {
    return build(dollarPrefixed[1], "USD", dollarPrefixed[0], false);
  }

  // "5 usd", "12000 riel", "12000៛", "12000r"
  const suffixed = lower.match(
    new RegExp(`${NUMBER.source}\\s*(${USD_MARKER.source}|${KHR_MARKER.source})`),
  );
  if (suffixed) {
    return build(suffixed[1], unitFromMarker(suffixed[2]), suffixed[0], false);
  }

  // A bare number. Unit comes from magnitude, and that costs confidence.
  const bare = lower.match(new RegExp(NUMBER.source));
  if (bare) {
    const digits = Number(bare[1].replace(/,/g, ""));
    const unit: CurrencyCode = selectedCurrency ?? (digits >= RIEL_MAGNITUDE_THRESHOLD ? "KHR" : "USD");
    return build(bare[1], unit, bare[0], !selectedCurrency);
  }

  return null;

  function build(
    raw: string,
    unit: CurrencyCode,
    consumed: string,
    inferredUnit: boolean,
  ): AmountMatch | null {
    // Riel has no fractional minor unit. Rounding a decimal here would save an
    // amount the user did not type, so ask them to use a whole riel figure.
    if (unit === "KHR" && /\.\d*[1-9]/.test(raw)) return null;
    try {
      const amount = parseAmount(raw, unit);
      if (amount.minor <= 0) return null;
      return { amount, consumed, inferredUnit };
    } catch {
      return null;
    }
  }
}

/** Strip the consumed figure, the verb, and tidy leftover punctuation. */
function describeRemainder(text: string, consumed: string, verb: RegExp): string {
  const withoutAmount = text.toLowerCase().replace(consumed, " ");
  const withoutVerb = withoutAmount.replace(verb, " ");
  return withoutVerb
    .replace(/\b(for|on|at|of|in|to)\b/g, " ")
    .replace(/[^\p{L}\p{N}\s'&-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Turn one Telegram message into an intent.
 *
 * Pure and synchronous: no database, no network, no clock. Everything that needs
 * the user's own data (which account, which category) is resolved by the caller,
 * which is what makes this exhaustively testable.
 */
export function parseMessage(input: string, mode?: EntryMode | null): TelegramIntent {
  const text = input.trim().replace(/\s+/g, " ").replace(
    /^\/(e|i)(?:@\w+)?\b/i,
    (_, command: string) => command.toLowerCase() === "e" ? "expense" : "income",
  ).replace(
    /^([+-])\s*(?=\$?\s*\d)/,
    (_, sign: string) => sign === "+" ? "income " : "expense ",
  ).replace(
    /^\/(expense|income|refund|transfer|summary|report|budgets?|accounts?|balance|recent|transactions|rate|undo|cancel|confirm)(?:@\w+)?\b/i,
    "$1",
  );
  if (text === "") return { kind: "unknown", text: "", confidence: 1 };

  const lower = text.toLowerCase();

  const entry = lower.match(/^(expense|income) (usd|khr)$/);
  if (/^(expense|income)$/.test(lower)) return { kind: "start-entry", type: lower as EntryMode["type"], confidence: 1 };
  if (lower === "more") return { kind: "more", confidence: 1 };
  if (/^\/?(back|menu|start|home)(@\w+)?$/.test(lower)) return { kind: "back", confidence: 1 };
  if (/^(choose|change) account$/.test(lower)) return { kind: "choose-account", confidence: 1 };
  const selection = text.match(/^Use (.+) \((USD|KHR)\)$/i);
  if (selection) return { kind: "select-account", name: selection[1], currency: selection[2].toUpperCase() as CurrencyCode, confidence: 1 };
  if (entry) return { kind: "entry", mode: { type: entry[1] as EntryMode["type"], currency: entry[2].toUpperCase() as CurrencyCode }, confidence: 1 };

  // Deep-link payload from tapping "Connect Telegram". Checked first because the
  // token is opaque and could contain anything.
  const start = text.match(/^\/start(?:@\w+)?\s+(\S+)$/i);
  if (start) return { kind: "link", token: start[1], confidence: 1 };

  if (/^\/?help(@\w+)?$/i.test(lower) || /^\/?what can you do\??$/i.test(lower)) {
    return { kind: "help", confidence: 1 };
  }

  // Before the bare "cancel" below, so "cancel last" undoes a transaction rather
  // than dismissing a pending confirmation.
  if (/\b(undo|delete last|remove last|cancel last)\b/.test(lower)) {
    return { kind: "undo", confidence: 1 };
  }

  if (/^(y|yes|yep|yeah|confirm|ok|okay|save|correct)[.!]?$/i.test(lower)) {
    return { kind: "confirm", confidence: 1 };
  }

  if (/^discard[.!]?$/i.test(lower)) return { kind: "discard", confidence: 1 };
  if (/^(n|no|nope|cancel|stop|wrong)[.!]?$/i.test(lower)) {
    return { kind: "cancel", confidence: 1 };
  }

  if (/^\/?(show )?budgets?\b/.test(lower)) {
    return { kind: "budget", confidence: 1 };
  }

  if (/^(?:show )?(accounts?|balances?)$/.test(lower)) {
    return { kind: "accounts", confidence: 1 };
  }
  if (/^(?:show )?(recent|transactions|history|last transactions)$/.test(lower)) {
    return { kind: "recent", confidence: 1 };
  }
  if (/^(?:exchange )?rate$/.test(lower)) return { kind: "rate", confidence: 1 };
  if (/^(refund|transfer)$/.test(lower)) {
    return { kind: "guide", operation: lower as RecordType | "transfer", confidence: 1 };
  }

  const summary = lower.match(/^\/?(summary|report)\b\s*(today|month|monthly|this month)?/);
  if (summary) {
    const window = summary[2] && /month/.test(summary[2]) ? "month" : "today";
    return { kind: "summary", window, confidence: 1 };
  }

  /*
   * "Transfer $100 ABA to Wing"
   *
   * Gated on the verb alone, not on the verb *and* a destination. An earlier
   * version required both and fell through to the expense branch when the
   * destination was missing, so "Transfer $100" recorded a $100 expense: the money
   * left an account and arrived nowhere. A message that says "transfer" is never
   * spending, so an incomplete one is refused rather than reinterpreted.
   */
  if (TRANSFER_VERBS.test(lower)) {
    if (!/\bto\b/.test(lower)) return { kind: "unknown", text, confidence: 1 };

    const fragments = text.split(/\s+(?:received|receiving|receive)\s+/i);
    if (fragments.length > 2) return { kind: "unknown", text, confidence: 1 };
    const [sentText, receivedText] = fragments;
    const received = receivedText ? extractAmount(receivedText) : null;
    if (receivedText !== undefined && (!received || received.inferredUnit || receivedText.toLowerCase().trim() !== received.consumed)) {
      return { kind: "unknown", text, confidence: 1 };
    }
    const found = extractAmount(sentText);
    if (!found) return { kind: "unknown", text, confidence: 1 };

    const remainder = sentText
      .toLowerCase()
      .replace(found.consumed, " ")
      .replace(TRANSFER_VERBS, " ")
      .replace(/\s+/g, " ")
      .trim();

    const hints = remainder.split(/\bto\b/).map((part) => part.trim());
    const [rawFrom = "", toHint = ""] = hints;
    const fromHint = rawFrom.replace(/^from\s+/, "");
    if (hints.length !== 2) return { kind: "unknown", text, confidence: 1 };
    if (fromHint === "" || toHint === "") {
      return { kind: "unknown", text, confidence: 1 };
    }

    let confidence = 1;
    if (found.inferredUnit) confidence -= PENALTY_UNIT_GUESS;

    return { kind: "transfer", amount: found.amount, fromHint, toHint, ...(received ? { receivedAmount: received.amount } : {}), confidence };
  }

  const accountMatch = text.match(/\s+(?:from|using|in)\s+(.+)$/i);
  const recordText = accountMatch ? text.slice(0, accountMatch.index) : text;
  const recordLower = recordText.toLowerCase();
  // Only an amount-first entry uses the explicitly selected mode. Commands and
  // natural-language operations keep their own meaning, including transfers.
  const selectedMode = /^[\d$]/.test(recordText) ? mode : null;
  const found = extractAmount(recordText, selectedMode?.currency);
  if (!found) return { kind: "unknown", text, confidence: 1 };

  // A message with two figures is not one transaction. Do not quietly save the
  // first half, while allowing numbers embedded in merchant names such as Nham24.
  const remainingText = recordLower.replace(found.consumed, " ");
  if (/(?:^|\s)(?:\$\s*)?\d/.test(remainingText)) return { kind: "unknown", text, confidence: 1 };

  // Direction. Refund is checked before income because a refund *is* an inflow but
  // the app models it as its own type, and the more specific reading should win.
  let type: RecordType;
  let verb: RegExp;
  let stated = true;
  const explicitType = recordLower.match(/^(expense|income|refund)\b/)?.[1] as RecordType | undefined;

  if (selectedMode || explicitType) {
    type = selectedMode?.type ?? explicitType!;
    verb = selectedMode ? /$^/ : new RegExp(`^${type}\\b`);
  } else if (REFUND_VERBS.test(recordLower)) {
    type = "refund";
    verb = REFUND_VERBS;
  } else if (INCOME_VERBS.test(recordLower)) {
    type = "income";
    verb = INCOME_VERBS;
  } else if (EXPENSE_VERBS.test(recordLower)) {
    type = "expense";
    verb = EXPENSE_VERBS;
  } else {
    // "Fuel $20" is the PRD's own example of a message with no verb at all. An
    // expense is overwhelmingly the common case, but it was not said, so it costs.
    type = "expense";
    verb = EXPENSE_VERBS;
    stated = false;
  }

  const descriptor = describeRemainder(recordText, found.consumed, verb);

  let confidence = 1;
  if (found.inferredUnit) confidence -= PENALTY_UNIT_GUESS;
  if (!stated) confidence -= PENALTY_ASSUMED_DIRECTION;
  // More than three leftover words usually means a sentence we only half read.
  if (descriptor.split(" ").filter(Boolean).length > 3) confidence -= PENALTY_LEFTOVER_WORDS;

  return {
    kind: "record",
    type,
    amount: found.amount,
    descriptor,
    ...(accountMatch ? { accountHint: accountMatch[1].trim().toLowerCase() } : {}),
    // Clamp so a pile of penalties cannot go negative and read as certainty.
    confidence: Math.max(0, confidence),
  };
}
