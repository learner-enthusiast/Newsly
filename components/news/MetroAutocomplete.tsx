"use client";

import { useNewsMetroSuggestions } from "@/hooks/useNewsMetroSuggestions";
import type { SerializedNewsMetro } from "@/services/news/metroLocation";
import { cn } from "@/lib/utils";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

type MetroAutocompleteProps = {
  value: string;
  onChange: (locationLabel: string) => void;
  onSelectMetro?: (metro: SerializedNewsMetro) => void;
  required?: boolean;
  placeholder?: string;
  disabled?: boolean;
  inputClassName?: string;
};

export function MetroAutocomplete({
  value,
  onChange,
  onSelectMetro,
  required,
  placeholder,
  disabled,
  inputClassName = "rounded-md border px-3 py-2",
}: Readonly<MetroAutocompleteProps>) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [panelLockedAfterSelect, setPanelLockedAfterSelect] = useState(false);

  const { metros, loading, error: fetchError, minQueryLength } =
    useNewsMetroSuggestions(value);

  const close = useCallback(() => {
    setOpen(false);
    setHighlightIndex(0);
  }, []);

  const selectMetro = useCallback(
    (metro: SerializedNewsMetro) => {
      setPanelLockedAfterSelect(true);
      close();
      onChange(metro.label);
      onSelectMetro?.(metro);
    },
    [close, onChange, onSelectMetro],
  );

  useEffect(() => {
    if (!open) {
      return;
    }
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        close();
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [close, open]);

  const activeIndex =
    metros.length === 0 ? 0 : Math.min(highlightIndex, metros.length - 1);

  function onInputChange(next: string) {
    setPanelLockedAfterSelect(false);
    onChange(next);
    if (next.trim().length >= minQueryLength) {
      setOpen(true);
      setHighlightIndex(0);
    } else {
      close();
    }
  }

  function onInputFocus() {
    if (panelLockedAfterSelect) {
      return;
    }
    if (value.trim().length >= minQueryLength && metros.length > 0) {
      setOpen(true);
    }
  }

  function onInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      close();
      return;
    }

    if (!open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      if (metros.length > 0) {
        setOpen(true);
      }
      return;
    }

    if (!open || metros.length === 0) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightIndex((index) => Math.min(index + 1, metros.length - 1));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightIndex((index) => Math.max(index - 1, 0));
      return;
    }

    if (event.key === "Enter") {
      const metro = metros[activeIndex];
      if (metro) {
        event.preventDefault();
        selectMetro(metro);
      }
    }
  }

  const showList = open && !panelLockedAfterSelect && metros.length > 0;

  return (
    <div ref={rootRef} className="relative min-w-0 flex-1">
      <input
        type="text"
        required={required}
        disabled={disabled}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={showList}
        aria-controls={showList ? listId : undefined}
        aria-autocomplete="list"
        aria-busy={loading}
        aria-activedescendant={
          showList ? `${listId}-option-${activeIndex}` : undefined
        }
        className={cn("w-full min-w-0", inputClassName)}
        onChange={(event) => onInputChange(event.target.value)}
        onFocus={onInputFocus}
        onKeyDown={onInputKeyDown}
      />
      {fetchError ? (
        <p className="mt-1 text-xs text-destructive">{fetchError}</p>
      ) : null}
      {showList ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-background py-1 text-sm shadow-md"
        >
          {metros.map((metro, index) => (
            <li
              key={metro.id}
              id={`${listId}-option-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              className={
                index === activeIndex
                  ? "cursor-pointer bg-muted px-3 py-2"
                  : "cursor-pointer px-3 py-2 hover:bg-muted"
              }
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                selectMetro(metro);
              }}
              onMouseEnter={() => setHighlightIndex(index)}
            >
              <span className="block font-medium">{metro.label}</span>
              <span className="block text-xs text-muted-foreground">
                {metro.region}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
