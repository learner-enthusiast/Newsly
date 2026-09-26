const CATEGORY_TONES = [
  "from-sky-200/80 to-sky-100/40",
  "from-indigo-200/80 to-violet-100/40",
  "from-emerald-200/80 to-teal-100/40",
  "from-lime-200/80 to-green-100/40",
  "from-amber-200/80 to-orange-100/40",
  "from-rose-200/80 to-pink-100/40",
] as const;

export function categoryToneForTrending(category: string): string {
  const hash = [...category].reduce(
    (accumulator, character) => accumulator + character.charCodeAt(0),
    0,
  );
  return CATEGORY_TONES[hash % CATEGORY_TONES.length]!;
}
