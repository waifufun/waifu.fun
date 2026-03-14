/**
 * Client-side builder assistant logic.
 * Parses user intent from conversation messages and builds character JSON.
 * No backend chat endpoint needed — works entirely in-browser.
 */

export interface AgentCharacter {
  name: string;
  ticker: string;
  description: string;
  personality: string;
  avatarPrompt: string;
  bio: string[];
  adjectives: string[];
  topics: string[];
  style: {
    all: string[];
    chat: string[];
    post: string[];
  };
}

export interface BuilderMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  /** When the assistant updates character fields, attach the delta */
  characterDelta?: Partial<AgentCharacter> | undefined;
  /** Signal to trigger image generation */
  generateImage?: boolean | undefined;
  /** Signal that character is ready for launch */
  readyToLaunch?: boolean | undefined;
}

export type ConversationPhase =
  | "greeting"
  | "concept"
  | "personality"
  | "appearance"
  | "refine"
  | "ready";

/** Reserved name fragments we reject */
const RESERVED = ["waifu.fun", "waifufun", "admin", "official", "test"];

const NAME_REGEX = /^[a-zA-Z0-9 ]{3,20}$/;
const TICKER_REGEX = /^[A-Z0-9]{3,5}$/;

// ---------------------------------------------------------------------------
// Utility: deterministic random pick
// ---------------------------------------------------------------------------
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function uid(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ---------------------------------------------------------------------------
// Prompt suggestions for quick-start
// ---------------------------------------------------------------------------
export const QUICK_PROMPTS = [
  "a degen meme trader who only speaks in market metaphors",
  "a stoic philosopher who gives life advice through tweets",
  "a chaotic cat girl who reviews food and argues about anime",
  "a retired wall street quant turned shitposter",
  "a mysterious oracle who speaks in riddles about the market",
  "an unhinged scientist documenting bizarre experiments",
] as const;

// ---------------------------------------------------------------------------
// Name generation (inspired by eliza-cloud character-names)
// ---------------------------------------------------------------------------
const PREFIXES = [
  "Luna", "Aria", "Kira", "Nova", "Zara", "Echo", "Mira", "Sage",
  "Nyx", "Vex", "Oni", "Rue", "Sol", "Kai", "Ren", "Yuki",
  "Zero", "Hex", "Dex", "Flux", "Byte", "Pixel", "Glitch", "Vapor",
];

const SUFFIXES = [
  "", "Bot", "AI", "Agent", "Chan", "San", "Kun", "Sama",
  "X", "V2", "Max", "Pro", "Neo", "Prime", "Core", "Node",
];

export function generateRandomName(): string {
  return `${pick(PREFIXES)}${pick(SUFFIXES)}`.trim();
}

function deriveTicker(name: string): string {
  // Try to create a meaningful ticker from the name
  const cleaned = name.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  if (cleaned.length <= 5 && cleaned.length >= 3) return cleaned;
  // Take first letters of words
  const words = name.trim().split(/\s+/);
  if (words.length >= 3) {
    return words.slice(0, 5).map(w => w[0]).join("").toUpperCase();
  }
  // Take first 4 chars
  return cleaned.slice(0, 4);
}

// ---------------------------------------------------------------------------
// Intent detection
// ---------------------------------------------------------------------------
type Intent =
  | { type: "describe_concept"; text: string }
  | { type: "set_name"; name: string }
  | { type: "set_ticker"; ticker: string }
  | { type: "describe_appearance"; text: string }
  | { type: "modify_field"; field: string; value: string }
  | { type: "accept" }
  | { type: "reject" }
  | { type: "request_image" }
  | { type: "ready_to_launch" }
  | { type: "general"; text: string };

function detectIntent(text: string, phase: ConversationPhase): Intent {
  const lower = text.toLowerCase().trim();

  // Acceptance signals
  if (/^(yes|yep|yeah|looks good|perfect|love it|ship it|let'?s go|ok|okay|sure|accepted?|lgtm|nice|great|good)\s*[.!]?\s*$/i.test(lower)) {
    return { type: "accept" };
  }

  // Rejection / redo signals
  if (/^(no|nah|nope|try again|redo|different|change|another|not? good)\s*[.!]?\s*$/i.test(lower)) {
    return { type: "reject" };
  }

  // Explicit name setting: "name it X" / "call it X" / "name: X"
  const nameMatch = lower.match(/(?:name\s*(?:it|her|him|them)?\s*[:=]?\s*|call\s*(?:it|her|him|them)\s+)["']?([a-z0-9 ]+)["']?/i);
  if (nameMatch) {
    return { type: "set_name", name: nameMatch[1]!.trim() };
  }

  // Explicit ticker: "ticker X" / "$XXXX"
  const tickerMatch = lower.match(/(?:ticker\s*[:=]?\s*|symbol\s*[:=]?\s*|\$)([a-z0-9]{2,5})/i);
  if (tickerMatch) {
    return { type: "set_ticker", ticker: tickerMatch[1]!.toUpperCase() };
  }

  // Image requests
  if (/(?:generat|make|create|draw|design|show)\s*(?:an?\s*)?(?:image|avatar|picture|pfp|photo|art)/i.test(lower)) {
    return { type: "request_image" };
  }
  if (/(?:look|looks?)\s*like/i.test(lower) || /appearance|visual|avatar/i.test(lower)) {
    return { type: "describe_appearance", text };
  }

  // Launch signals
  if (/(?:launch|deploy|ship|mint|create token|go live|send it)/i.test(lower)) {
    return { type: "ready_to_launch" };
  }

  // Phase-contextual defaults
  if (phase === "greeting" || phase === "concept") {
    return { type: "describe_concept", text };
  }

  if (phase === "appearance") {
    return { type: "describe_appearance", text };
  }

  return { type: "general", text };
}

// ---------------------------------------------------------------------------
// Response generation (no LLM needed — pattern matching + templates)
// ---------------------------------------------------------------------------

interface BuilderState {
  phase: ConversationPhase;
  character: AgentCharacter;
  messageCount: number;
  imageGenerated: boolean;
  lastSuggestions: string[];
}

function createInitialState(): BuilderState {
  return {
    phase: "greeting",
    character: {
      name: "",
      ticker: "",
      description: "",
      personality: "",
      avatarPrompt: "",
      bio: [],
      adjectives: [],
      topics: [],
      style: { all: [], chat: [], post: [] },
    },
    messageCount: 0,
    imageGenerated: false,
    lastSuggestions: [],
  };
}

function generateConceptResponse(text: string, state: BuilderState): {
  content: string;
  delta: Partial<AgentCharacter>;
  nextPhase: ConversationPhase;
  generateImage?: boolean | undefined;
} {
  // Extract personality traits from concept description
  const adjectives: string[] = [];
  const topics: string[] = [];
  const styleAll: string[] = [];
  const stylePosts: string[] = [];

  // Common personality markers
  const personalityMarkers: [RegExp, string][] = [
    [/degen|ape|yolo/i, "reckless"],
    [/meme|shitpost|funny|humor/i, "irreverent"],
    [/stoic|wise|philos/i, "contemplative"],
    [/chaotic|unhinged|crazy/i, "chaotic"],
    [/cute|kawaii|uwu/i, "adorable"],
    [/dark|goth|edge/i, "sardonic"],
    [/smart|intel|quant/i, "analytical"],
    [/mysteri|oracle|crypt/i, "enigmatic"],
    [/chef|food|cook/i, "culinary"],
    [/art|creative|design/i, "creative"],
    [/trade|market|crypto|defi/i, "market-savvy"],
    [/cat|neko|feline/i, "playful"],
    [/dog|doge|shib/i, "loyal"],
    [/robot|ai|cyber/i, "synthetic"],
    [/retire|old|boomer/i, "world-weary"],
    [/scientist|lab|experiment/i, "methodical"],
  ];

  for (const [pattern, adj] of personalityMarkers) {
    if (pattern.test(text)) {
      adjectives.push(adj);
    }
  }

  // Topic extraction
  const topicMarkers: [RegExp, string][] = [
    [/crypto|defi|web3|blockchain/i, "cryptocurrency"],
    [/market|trade|stock/i, "markets"],
    [/meme|shitpost/i, "meme culture"],
    [/anime|manga|weeb/i, "anime"],
    [/food|cook|recipe/i, "food"],
    [/philos|life|wisdom/i, "philosophy"],
    [/tech|code|program/i, "technology"],
    [/art|paint|draw/i, "art"],
    [/music|song|beat/i, "music"],
    [/game|gaming/i, "gaming"],
    [/science|physics|chem/i, "science"],
  ];

  for (const [pattern, topic] of topicMarkers) {
    if (pattern.test(text)) {
      topics.push(topic);
    }
  }

  // Style derivation
  if (adjectives.includes("irreverent") || adjectives.includes("chaotic")) {
    styleAll.push("uses lowercase", "drops punctuation for effect", "occasionally all-caps for emphasis");
    stylePosts.push("short punchy tweets", "uses abbreviations", "ratio-bait energy");
  } else if (adjectives.includes("contemplative") || adjectives.includes("enigmatic")) {
    styleAll.push("measured tone", "thoughtful pauses", "occasional metaphors");
    stylePosts.push("thread-worthy insights", "one-liner wisdom", "rhetorical questions");
  } else {
    styleAll.push("natural conversational tone", "authentic voice");
    stylePosts.push("engaging and concise", "personality-forward");
  }

  // Generate a name suggestion
  const suggestedName = state.character.name || generateRandomName();
  const suggestedTicker = deriveTicker(suggestedName);

  // Build description from the concept
  const description = text.length > 200 ? text.slice(0, 197) + "..." : text;

  // Build bio lines
  const bio = [description];
  if (adjectives.length > 0) {
    bio.push(`${adjectives.slice(0, 3).join(", ")} by nature`);
  }

  const delta: Partial<AgentCharacter> = {
    description,
    personality: text,
    bio,
    adjectives: adjectives.length > 0 ? adjectives : ["unique", "authentic"],
    topics: topics.length > 0 ? topics : ["general culture"],
    style: {
      all: styleAll.length > 0 ? styleAll : ["natural conversational tone"],
      chat: ["responsive", "stays in character"],
      post: stylePosts.length > 0 ? stylePosts : ["engaging and concise"],
    },
  };

  // Only suggest name if not already set
  if (!state.character.name) {
    delta.name = suggestedName;
    delta.ticker = suggestedTicker;
  }

  const adjectiveStr = adjectives.length > 0
    ? adjectives.slice(0, 3).join(", ")
    : "interesting";

  const nameSection = !state.character.name
    ? `\n\nfor the name, i'm thinking **${suggestedName}** ($${suggestedTicker}). you can say "name it [something]" to change it, or just say the name you want.`
    : "";

  const content = `got it. a ${adjectiveStr} agent ${topics.length > 0 ? `focused on ${topics.slice(0, 2).join(" and ")}` : "with a distinct personality"}.${nameSection}\n\nwant to describe how they should look? or i can generate an image based on what you've told me so far.`;

  return {
    content,
    delta,
    nextPhase: "personality",
    generateImage: false,
  };
}

export class ConversationBuilder {
  private state: BuilderState;

  constructor() {
    this.state = createInitialState();
  }

  getCharacter(): AgentCharacter {
    return { ...this.state.character };
  }

  getPhase(): ConversationPhase {
    return this.state.phase;
  }

  isReadyToLaunch(): boolean {
    const c = this.state.character;
    return !!(c.name && c.ticker && c.description);
  }

  /** Set character fields directly (e.g. from preview panel edits) */
  updateCharacter(delta: Partial<AgentCharacter>): void {
    this.state.character = { ...this.state.character, ...delta };
  }

  /** Get the welcome message */
  getWelcomeMessage(): BuilderMessage {
    return {
      id: uid(),
      role: "assistant",
      content: "what kind of agent do you want to create?\n\ndescribe the personality, vibe, or purpose — or pick one of the suggestions below.",
      timestamp: Date.now(),
    };
  }

  /** Process a user message and return the assistant response */
  processMessage(userText: string): BuilderMessage {
    this.state.messageCount++;
    const intent = detectIntent(userText, this.state.phase);

    switch (intent.type) {
      case "describe_concept": {
        const result = generateConceptResponse(intent.text, this.state);
        this.state.character = { ...this.state.character, ...result.delta };
        this.state.phase = result.nextPhase;
        return {
          id: uid(),
          role: "assistant",
          content: result.content,
          timestamp: Date.now(),
          characterDelta: result.delta,
          generateImage: result.generateImage,
        };
      }

      case "set_name": {
        const name = intent.name.slice(0, 20);
        if (!NAME_REGEX.test(name)) {
          return {
            id: uid(),
            role: "assistant",
            content: "names need to be 3-20 characters, letters, numbers, and spaces only. try another.",
            timestamp: Date.now(),
          };
        }
        if (RESERVED.some(r => name.toLowerCase().includes(r))) {
          return {
            id: uid(),
            role: "assistant",
            content: "that name is reserved. pick something else.",
            timestamp: Date.now(),
          };
        }
        const ticker = deriveTicker(name);
        const delta: Partial<AgentCharacter> = { name, ticker };
        this.state.character = { ...this.state.character, ...delta };
        return {
          id: uid(),
          role: "assistant",
          content: `**${name}** ($${ticker}). ${this.state.character.description ? "looking good. want to adjust the appearance or launch?" : "tell me more about their personality."}`,
          timestamp: Date.now(),
          characterDelta: delta,
        };
      }

      case "set_ticker": {
        const ticker = intent.ticker;
        if (!TICKER_REGEX.test(ticker)) {
          return {
            id: uid(),
            role: "assistant",
            content: "ticker needs to be 3-5 uppercase alphanumeric characters.",
            timestamp: Date.now(),
          };
        }
        const delta: Partial<AgentCharacter> = { ticker };
        this.state.character = { ...this.state.character, ...delta };
        return {
          id: uid(),
          role: "assistant",
          content: `ticker set to $${ticker}.`,
          timestamp: Date.now(),
          characterDelta: delta,
        };
      }

      case "describe_appearance": {
        const delta: Partial<AgentCharacter> = { avatarPrompt: intent.text };
        this.state.character = { ...this.state.character, ...delta };
        this.state.phase = "refine";
        return {
          id: uid(),
          role: "assistant",
          content: `generating an image based on that description...`,
          timestamp: Date.now(),
          characterDelta: delta,
          generateImage: true,
        };
      }

      case "request_image": {
        const prompt = this.state.character.avatarPrompt || this.state.character.personality || this.state.character.description;
        if (!prompt) {
          return {
            id: uid(),
            role: "assistant",
            content: "describe what your agent should look like first, then i'll generate it.",
            timestamp: Date.now(),
          };
        }
        this.state.phase = "refine";
        return {
          id: uid(),
          role: "assistant",
          content: "generating your agent's avatar...",
          timestamp: Date.now(),
          generateImage: true,
        };
      }

      case "accept": {
        if (this.state.phase === "personality" || this.state.phase === "concept") {
          // Accept the concept, move to appearance
          this.state.phase = "appearance";
          return {
            id: uid(),
            role: "assistant",
            content: this.state.imageGenerated
              ? `${this.state.character.name || "your agent"} is looking ready. you can adjust anything in the preview panel, or hit launch when you're good.`
              : `nice. want to describe how ${this.state.character.name || "your agent"} should look? or i can generate something based on the personality.`,
            timestamp: Date.now(),
          };
        }
        if (this.state.phase === "refine" || this.state.phase === "appearance") {
          this.state.phase = "ready";
          return {
            id: uid(),
            role: "assistant",
            content: `${this.state.character.name || "your agent"} is ready. configure pre-buy amount in the panel, then launch.`,
            timestamp: Date.now(),
            readyToLaunch: true,
          };
        }
        return {
          id: uid(),
          role: "assistant",
          content: "looking good. anything else to adjust, or ready to launch?",
          timestamp: Date.now(),
        };
      }

      case "reject": {
        if (this.state.phase === "personality" || this.state.phase === "concept") {
          const newName = generateRandomName();
          const newTicker = deriveTicker(newName);
          const delta: Partial<AgentCharacter> = { name: newName, ticker: newTicker };
          this.state.character = { ...this.state.character, ...delta };
          return {
            id: uid(),
            role: "assistant",
            content: `how about **${newName}** ($${newTicker})? or tell me what you'd prefer.`,
            timestamp: Date.now(),
            characterDelta: delta,
          };
        }
        return {
          id: uid(),
          role: "assistant",
          content: "tell me what to change and i'll update it.",
          timestamp: Date.now(),
        };
      }

      case "ready_to_launch": {
        const c = this.state.character;
        if (!c.name || !c.description) {
          return {
            id: uid(),
            role: "assistant",
            content: `need at least a name and description before launching. ${!c.name ? "what should we call this agent?" : "describe the agent's purpose or personality."}`,
            timestamp: Date.now(),
          };
        }
        if (!c.ticker) {
          this.state.character.ticker = deriveTicker(c.name);
        }
        this.state.phase = "ready";
        return {
          id: uid(),
          role: "assistant",
          content: `**${c.name}** ($${c.ticker || deriveTicker(c.name)}) is ready to go. set your pre-buy amount and hit launch in the panel.`,
          timestamp: Date.now(),
          readyToLaunch: true,
          characterDelta: { ticker: c.ticker || deriveTicker(c.name) },
        };
      }

      case "modify_field": {
        // Generic field modification — shouldn't trigger often with current intent detection
        return {
          id: uid(),
          role: "assistant",
          content: "updated. anything else?",
          timestamp: Date.now(),
        };
      }

      case "general":
      default: {
        // Try to extract useful info from general messages
        if (this.state.phase === "greeting") {
          // Treat as concept description
          return this.processMessage(userText); // re-process as concept after phase update
        }
        
        // If we have a concept but user is chatting more, refine
        if (this.state.character.description) {
          // Check if it could be an appearance description
          if (/look|appear|wear|hair|eye|dress|style|outfit/i.test(userText)) {
            const delta: Partial<AgentCharacter> = { avatarPrompt: userText };
            this.state.character = { ...this.state.character, ...delta };
            return {
              id: uid(),
              role: "assistant",
              content: "generating based on that description...",
              timestamp: Date.now(),
              characterDelta: delta,
              generateImage: true,
            };
          }

          // Treat as personality refinement
          const currentDesc = this.state.character.description;
          const refined = currentDesc.length + userText.length < 200
            ? `${currentDesc}. ${userText}`
            : userText;
          const delta: Partial<AgentCharacter> = {
            personality: userText,
            description: refined.slice(0, 200),
          };
          this.state.character = { ...this.state.character, ...delta };
          return {
            id: uid(),
            role: "assistant",
            content: `noted. ${this.state.character.name || "your agent"}'s personality is getting more defined. anything else, or ready to move on?`,
            timestamp: Date.now(),
            characterDelta: delta,
          };
        }

        // Fallback: treat as initial concept
        this.state.phase = "concept";
        const result = generateConceptResponse(userText, this.state);
        this.state.character = { ...this.state.character, ...result.delta };
        this.state.phase = result.nextPhase;
        return {
          id: uid(),
          role: "assistant",
          content: result.content,
          timestamp: Date.now(),
          characterDelta: result.delta,
        };
      }
    }
  }

  /** Mark that an image has been generated */
  markImageGenerated(): void {
    this.state.imageGenerated = true;
    if (this.state.phase === "appearance") {
      this.state.phase = "refine";
    }
  }
}
