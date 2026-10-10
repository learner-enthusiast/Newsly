"use client";

import {
  CHAT_QUICK_ACTIONS,
  CHAT_SUGGESTED_QUESTIONS,
} from "@/components/chat/chatConstants";
import { useEffect, useRef, useState } from "react";

const FALLBACK_ACTIONS = CHAT_QUICK_ACTIONS.map((item) => item.prompt);
const FALLBACK_QUESTIONS = [...CHAT_SUGGESTED_QUESTIONS];

type UseChatUiSuggestionsResult = {
  actions: string[];
  questions: string[];
  isRefreshing: boolean;
  /** Increments after each successful fetch (for GSAP refresh). */
  generation: number;
};

export function useChatUiSuggestions(
  chatSessionId: string,
  refreshKey: string,
): UseChatUiSuggestionsResult {
  const [actions, setActions] = useState<string[]>(FALLBACK_ACTIONS);
  const [questions, setQuestions] = useState<string[]>(FALLBACK_QUESTIONS);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [generation, setGeneration] = useState(0);
  const mountedSessionRef = useRef<string | null>(null);

  useEffect(() => {
    if (mountedSessionRef.current !== chatSessionId) {
      mountedSessionRef.current = chatSessionId;
      setActions(FALLBACK_ACTIONS);
      setQuestions(FALLBACK_QUESTIONS);
    }
  }, [chatSessionId]);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setIsRefreshing(true);
      try {
        const [actionsRes, questionsRes] = await Promise.all([
          fetch(`/api/chat/quickactions/${chatSessionId}`, {
            signal: controller.signal,
            cache: "no-store",
          }),
          fetch(`/api/chat/trythesequestion/${chatSessionId}`, {
            signal: controller.signal,
            cache: "no-store",
          }),
        ]);

        let nextActions: string[] | null = null;
        let nextQuestions: string[] | null = null;

        if (actionsRes.ok) {
          const payload = (await actionsRes.json()) as { actions?: string[] };
          if (Array.isArray(payload.actions) && payload.actions.length > 0) {
            nextActions = payload.actions;
          }
        }

        if (questionsRes.ok) {
          const payload = (await questionsRes.json()) as { questions?: string[] };
          if (Array.isArray(payload.questions) && payload.questions.length > 0) {
            nextQuestions = payload.questions;
          }
        }

        if (controller.signal.aborted) {
          return;
        }

        if (nextActions) {
          setActions(nextActions);
        }
        if (nextQuestions) {
          setQuestions(nextQuestions);
        }
        if (nextActions || nextQuestions) {
          setGeneration((value) => value + 1);
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsRefreshing(false);
        }
      }
    }

    void load();

    return () => {
      controller.abort();
    };
  }, [chatSessionId, refreshKey]);

  return { actions, questions, isRefreshing, generation };
}
