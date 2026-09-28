/** Globe and source cards from `public/heroImage.png`. */
export function HeroVisual() {
  return (
    <div className="relative mx-auto w-full max-w-xl lg:max-w-none">
      {/* eslint-disable-next-line @next/next/no-img-element -- static marketing asset */}
      <img
        src="/heroImage.png"
        alt="Stories from cities, markets, policy, and trade, connected around the world"
        className="h-auto w-full object-contain"
        width={1058}
        height={906}
        decoding="async"
        fetchPriority="high"
      />
    </div>
  );
}
