/** Static prompt suggestions — sent through the normal chat API. */
export const CHAT_QUICK_PROMPTS = [
  "Summarize today's top news",
  "What's happening in Hyderabad?",
  "Explain this news",
  "Compare two topics",
] as const;

export const CHAT_QUICK_ACTIONS = [
  {
    id: "summarize",
    label: "Summarize article",
    prompt: "Summarize the most relevant article from your research in bullet points.",
  },
  {
    id: "compare",
    label: "Compare topics",
    prompt: "Compare the two most important angles you found and highlight differences.",
  },
  {
    id: "simple",
    label: "Explain in simple terms",
    prompt: "Explain your findings in simple terms for someone new to this topic.",
  },
  {
    id: "latest",
    label: "Find latest updates",
    prompt: "What are the latest updates on this topic from the last few days?",
  },
] as const;

export const CHAT_SUGGESTED_QUESTIONS = [
  "What are the top 5 news stories today?",
  "What's happening in Hyderabad this week?",
  "Explain the latest RBI policy in simple terms.",
  "Compare real estate trends: Hyderabad vs Bengaluru",
  "What are the key takeaways from the latest climate summit?",
  "Summarize this article: [paste link]",
] as const;

/** Demo-only trending labels until a public trending API exists. */
export const CHAT_DEMO_TRENDING_TOPICS = [
  "Hyderabad Metro Expansion",
  "India's EV Policy",
  "Tech Layoffs in India",
  "Real Estate Trends",
  "Global AI Developments",
] as const;
