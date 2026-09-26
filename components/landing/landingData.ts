/** Marketing/demo copy — not live news or verified testimonials. */

export const DEMO_FLOATING_CARDS = [
  {
    id: "demo-1",
    location: "Hyderabad",
    headline: "Metro Expansion Gets Green Light",
  },
  {
    id: "demo-2",
    location: "Global",
    headline: "Tech Giants Invest in Clean Energy",
  },
] as const;

export const DEMO_TRENDING_STORIES = [
  {
    id: "trend-1",
    category: "Infrastructure",
    categoryTone: "from-sky-200/80 to-sky-100/40",
    title: "Hyderabad Metro to Get Major Expansion in 2026",
    timeLabel: "3 hours ago",
    location: "Hyderabad",
  },
  {
    id: "trend-2",
    category: "Technology",
    categoryTone: "from-indigo-200/80 to-violet-100/40",
    title: "New IT Policy to Boost Startups in Telangana",
    timeLabel: "5 hours ago",
    location: "Telangana",
  },
  {
    id: "trend-3",
    category: "Markets",
    categoryTone: "from-emerald-200/80 to-teal-100/40",
    title: "Indian Markets End Higher Amid Global Optimism",
    timeLabel: "Yesterday",
    location: "India",
  },
  {
    id: "trend-4",
    category: "Environment",
    categoryTone: "from-lime-200/80 to-green-100/40",
    title: "Heavy Rains Expected in Telangana This Week",
    timeLabel: "6 hours ago",
    location: "Telangana",
  },
] as const;

/** Placeholder testimonials — replace with real quotes when available. */
export const DEMO_TESTIMONIALS = [
  {
    id: "testimonial-1",
    quote:
      "Newsly helps me stay updated on Hyderabad's tech scene without the noise.",
    name: "Rohan K.",
    role: "Product Manager",
    location: "Hyderabad",
    initials: "RK",
  },
  {
    id: "testimonial-2",
    quote:
      "I love how I can get both local and global news in one place.",
    name: "Priya S.",
    role: "Entrepreneur",
    location: "Bengaluru",
    initials: "PS",
  },
  {
    id: "testimonial-3",
    quote:
      "The summaries save me time while still letting me explore original sources.",
    name: "Arjun M.",
    role: "Investor",
    location: "Mumbai",
    initials: "AM",
  },
] as const;

export const FEATURE_STRIP = [
  {
    title: "Personalized News",
    description: "Choose your topics, location and interests",
    icon: "target" as const,
  },
  {
    title: "Local & Global",
    description: "Get news from your city to the world",
    icon: "globe" as const,
  },
  {
    title: "AI-Powered",
    description: "We search, analyze and summarize for you",
    icon: "zap" as const,
  },
  {
    title: "Trusted Sources",
    description: "Stories from reliable publications",
    icon: "shield" as const,
  },
  {
    title: "Save & Organize",
    description: "Keep track of important stories",
    icon: "bookmark" as const,
  },
  {
    title: "Stay Ahead",
    description: "Make better decisions with quality news",
    icon: "chart" as const,
  },
] as const;

export const HOW_IT_WORKS_STEPS = [
  {
    step: "01",
    title: "Set Your Preferences",
    description:
      "Choose your location, topics, number of stories and more.",
  },
  {
    step: "02",
    title: "We Find the News",
    description:
      "Our AI searches trusted sources across the web and YouTube.",
  },
  {
    step: "03",
    title: "We Analyze & Summarize",
    description: "Relevant stories are cleaned, clustered and summarized.",
  },
  {
    step: "04",
    title: "Get Your News Briefing",
    description: "Read, save and explore the stories that matter.",
  },
] as const;

export const PRODUCT_JOURNEY_STEPS = [
  "Your Preferences",
  "Search",
  "Sources",
  "Clean",
  "Analyze",
  "News Briefing",
] as const;
