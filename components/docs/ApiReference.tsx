"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

/** Pinned Scalar build; bump deliberately. */
const SCALAR_SRC = "https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.72.0";

type ScalarApp = { destroy?: () => void };
type ScalarGlobal = {
  createApiReference: (target: HTMLElement, config: Record<string, unknown>) => ScalarApp;
};

declare global {
  interface Window {
    Scalar?: ScalarGlobal;
  }
}

/** Scalar API reference for the public OpenAPI document. */
export function ApiReference({ specUrl }: { specUrl: string }) {
  const target = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(
    () => typeof window !== "undefined" && window.Scalar !== undefined,
  );

  useEffect(() => {
    if (!loaded || !target.current || !window.Scalar) return;
    const app = window.Scalar.createApiReference(target.current, {
      url: specUrl,
      hideClientButton: false,
      defaultHttpClient: { targetKey: "shell", clientKey: "curl" },
      authentication: { preferredSecurityScheme: "bearerAuth" },
      withDefaultFonts: false,
      showDeveloperTools: "never",
    });
    return () => app?.destroy?.();
  }, [loaded, specUrl]);

  return (
    <>
      <Script src={SCALAR_SRC} strategy="afterInteractive" onReady={() => setLoaded(true)} />
      <div ref={target} className="api-reference" />
      {!loaded ? (
        <p className="px-6 py-10 text-sm text-muted-foreground">
          Loading the API reference… The raw spec is at{" "}
          <a className="underline" href={specUrl}>
            {specUrl}
          </a>
          .
        </p>
      ) : null}
    </>
  );
}
