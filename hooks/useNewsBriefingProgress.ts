"use client";

import {
  catchUpBriefingPercent,
  NEWS_BRIEFING_CATCH_UP_MS,
  parseNewsRequestCreatedAtMs,
  pendingBriefingPercent,
} from "@/services/news/newsBriefingProgress";
import type { NewsRequestStatus } from "@/services/news/newsRequestTypes";
import { useEffect, useState } from "react";

type CatchUpState = {
  from: number;
  startedAt: number;
};

type ProgressSession = {
  requestId: string;
  watchedPending: boolean;
  catchUp: CatchUpState | null;
};

function startCatchUp(createdAtMs: number): CatchUpState {
  const reduceMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion) {
    return {
      from: 100,
      startedAt: Date.now() - NEWS_BRIEFING_CATCH_UP_MS,
    };
  }
  return {
    from: pendingBriefingPercent(createdAtMs, Date.now()).percent,
    startedAt: Date.now(),
  };
}

export function useNewsBriefingProgress(
  requestId: string,
  createdAt: string,
  status: NewsRequestStatus,
) {
  const [now, setNow] = useState(() => Date.now());
  const createdMs = parseNewsRequestCreatedAtMs(createdAt, now);
  const [session, setSession] = useState<ProgressSession>(() => ({
    requestId,
    watchedPending: status === "pending",
    catchUp: null,
  }));

  if (session.requestId !== requestId) {
    setSession({
      requestId,
      watchedPending: status === "pending",
      catchUp: null,
    });
  } else if (status === "success" && session.watchedPending && !session.catchUp) {
    setSession({
      ...session,
      catchUp: startCatchUp(createdMs),
    });
  }

  const catchUp = session.requestId === requestId ? session.catchUp : null;
  const watchedPending =
    session.requestId === requestId ? session.watchedPending : status === "pending";
  const catchUpElapsed = catchUp ? now - catchUp.startedAt : 0;
  const catchingUp =
    watchedPending && status === "success" && catchUpElapsed < NEWS_BRIEFING_CATCH_UP_MS;
  const showWait = status === "pending" || catchingUp;
  const showResults = status === "success" && !showWait;

  useEffect(() => {
    if (!showWait) {
      return;
    }
    const intervalMs = catchingUp ? 50 : 250;
    const id = window.setInterval(() => {
      setNow(Date.now());
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [showWait, catchingUp, status]);

  const pending = pendingBriefingPercent(createdMs, now);
  let percent = pending.percent;
  if (showResults) {
    percent = 100;
  } else if (status === "success" && catchUp) {
    percent = catchUpBriefingPercent(catchUp.from, catchUp.startedAt, now);
  }

  return {
    percent,
    overdue: status === "pending" && pending.overdue,
    catchingUp,
    showWait,
    showResults,
    busy: showWait,
  };
}
