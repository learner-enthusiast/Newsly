"use client";

import {
  catchUpChatJobPercent,
  CHAT_ASYNC_JOB_CATCH_UP_MS,
  parseChatJobCreatedAtMs,
  pendingChatJobPercent,
} from "@/services/chat/chatAsyncJobProgress";
import { useEffect, useState } from "react";

type CatchUpState = {
  from: number;
  startedAt: number;
};

type ProgressSession = {
  jobKey: string;
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
      startedAt: Date.now() - CHAT_ASYNC_JOB_CATCH_UP_MS,
    };
  }
  return {
    from: pendingChatJobPercent(createdAtMs, Date.now()).percent,
    startedAt: Date.now(),
  };
}

export function useChatAsyncJobProgress(
  jobKey: string,
  createdAt: string,
  isPending: boolean,
) {
  const [now, setNow] = useState(() => Date.now());
  const createdMs = parseChatJobCreatedAtMs(createdAt, now);
  const [session, setSession] = useState<ProgressSession>(() => ({
    jobKey,
    watchedPending: isPending,
    catchUp: null,
  }));

  if (session.jobKey !== jobKey) {
    setSession({
      jobKey,
      watchedPending: isPending,
      catchUp: null,
    });
  } else if (!isPending && session.watchedPending && !session.catchUp) {
    setSession({
      ...session,
      catchUp: startCatchUp(createdMs),
    });
  }

  const catchUp = session.jobKey === jobKey ? session.catchUp : null;
  const watchedPending =
    session.jobKey === jobKey ? session.watchedPending : isPending;
  const catchUpElapsed = catchUp ? now - catchUp.startedAt : 0;
  const catchingUp =
    watchedPending &&
    !isPending &&
    catchUpElapsed < CHAT_ASYNC_JOB_CATCH_UP_MS;
  const showWait = isPending || catchingUp;

  useEffect(() => {
    if (!showWait) {
      return;
    }
    const intervalMs = catchingUp ? 50 : 250;
    const id = window.setInterval(() => {
      setNow(Date.now());
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [showWait, catchingUp]);

  const pending = pendingChatJobPercent(createdMs, now);
  let percent = pending.percent;
  if (!showWait) {
    percent = 100;
  } else if (!isPending && catchUp) {
    percent = catchUpChatJobPercent(catchUp.from, catchUp.startedAt, now);
  }

  return {
    percent,
    overdue: isPending && pending.overdue,
    catchingUp,
    showWait,
    busy: showWait,
  };
}
