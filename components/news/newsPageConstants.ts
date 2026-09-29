import type { LucideIcon } from "lucide-react";
import {
  Briefcase,
  Building2,
  Car,
  Cpu,
  FlaskConical,
  Globe2,
  Landmark,
  Leaf,
  LineChart,
  MapPin,
  Rocket,
  Scale,
  TrendingUp,
  Vote,
} from "lucide-react";

export type NewsScopeValue = "local" | "world" | "both";

export type NewsPreset = {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  scope: NewsScopeValue;
  location: string | null;
  categories: string[];
  storyCount?: number;
};

export const QUICK_LOCATIONS = [
  "Bengaluru, Karnataka, India",
  "Delhi, India",
  "Delhi NCR, India",
  "Mumbai, Maharashtra, India",
  "Hyderabad, Telangana, India",
  "Pune, Maharashtra, India",
  "Chennai, Tamil Nadu, India",
  "Kolkata, West Bengal, India",
  "India",
] as const;

export const TOPIC_OPTIONS: Array<{
  id: string;
  label: string;
  icon: LucideIcon;
}> = [
  { id: "Business", label: "Business", icon: Briefcase },
  { id: "Economy", label: "Economy", icon: TrendingUp },
  { id: "Technology", label: "Technology", icon: Cpu },
  { id: "Policy", label: "Policy", icon: Scale },
  { id: "Markets", label: "Markets", icon: LineChart },
  { id: "Real Estate", label: "Real estate", icon: Building2 },
  { id: "Infrastructure", label: "Infrastructure", icon: Landmark },
  { id: "Startups", label: "Startups", icon: Rocket },
  { id: "Environment", label: "Environment", icon: Leaf },
  { id: "Politics", label: "Politics", icon: Vote },
  { id: "Science", label: "Science", icon: FlaskConical },
];

export const NEWS_QUICK_PRESETS: NewsPreset[] = [
  {
    id: "hyderabad-business",
    title: "Hyderabad · Business",
    description: "Local business and corporate news",
    icon: MapPin,
    scope: "local",
    location: "Hyderabad, Telangana, India",
    categories: ["Business"],
    storyCount: 5,
  },
  {
    id: "india-markets",
    title: "India · Markets",
    description: "Indian equities and market moves",
    icon: LineChart,
    scope: "local",
    location: "India",
    categories: ["Markets"],
    storyCount: 5,
  },
  {
    id: "world-top",
    title: "World · Top news",
    description: "Global markets and macro headlines",
    icon: Globe2,
    scope: "world",
    location: null,
    categories: [],
    storyCount: 5,
  },
];

export const DEFAULT_STORY_COUNT = 5;

export const STORY_COUNT_OPTIONS = [3, 5, 8, 10, 12] as const;
