"use client";

import {
  formatLocationLabelFromSuggestion,
  formatLocationStorageValueFromSuggestion,
} from "@/services/location/mapsAutocomplete";
import type {
  LocationAutocompleteSuggestion,
  LocationGeoAnchor,
} from "@/services/location/userLocationTypes";
import { useLocationAutocompleteSuggestions } from "@/hooks/useLocationAutocompleteSuggestions";
import { MIN_AUTOCOMPLETE_QUERY_LENGTH } from "@/services/location/autocompleteQuery";
import { cn } from "@/lib/utils";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

type LocationAutocompleteProps = {
  value: string;
  onChange: (locationLabel: string) => void;
  onSelectSuggestion?: (suggestion: LocationAutocompleteSuggestion) => void;
  geoAnchor?: LocationGeoAnchor | null;
  required?: boolean;
  placeholder?: string;
  disabled?: boolean;
  inputClassName?: string;
};

export type { LocationGeoAnchor };

export function LocationAutocomplete({
  value,
  onChange,
  onSelectSuggestion,
  geoAnchor = null,
  required,
  placeholder,
  disabled,
  inputClassName = "rounded-md border px-3 py-2",
}: Readonly<LocationAutocompleteProps>) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  /** After picking a suggestion, keep the list closed until the user edits the field. */
  const [panelLockedAfterSelect, setPanelLockedAfterSelect] = useState(false);

  const { suggestions, loading, error: fetchError } =
    useLocationAutocompleteSuggestions(value, geoAnchor);

  const close = useCallback(() => {
    setOpen(false);
    setHighlightIndex(0);
  }, []);

  const selectSuggestion = useCallback(
    (suggestion: LocationAutocompleteSuggestion) => {
      const storageValue = formatLocationStorageValueFromSuggestion(suggestion);
      setPanelLockedAfterSelect(true);
      close();
      onChange(storageValue);
      onSelectSuggestion?.(suggestion);
    },
    [close, onChange, onSelectSuggestion],
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
    suggestions.length === 0
      ? 0
      : Math.min(highlightIndex, suggestions.length - 1);

  function onInputChange(next: string) {
    setPanelLockedAfterSelect(false);
    onChange(next);
    if (next.trim().length >= MIN_AUTOCOMPLETE_QUERY_LENGTH) {
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
    if (value.trim().length >= MIN_AUTOCOMPLETE_QUERY_LENGTH && suggestions.length > 0) {
      setOpen(true);
    }
  }

  function onInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      close();
      return;
    }

    if (!open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      if (suggestions.length > 0) {
        setOpen(true);
      }
      return;
    }

    if (!open || suggestions.length === 0) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightIndex((index) => Math.min(index + 1, suggestions.length - 1));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightIndex((index) => Math.max(index - 1, 0));
      return;
    }

    if (event.key === "Enter") {
      const suggestion = suggestions[activeIndex];
      if (suggestion) {
        event.preventDefault();
        selectSuggestion(suggestion);
      }
    }
  }

  const showList =
    open && !panelLockedAfterSelect && suggestions.length > 0;

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
          {suggestions.map((suggestion, index) => {
            const label = formatLocationLabelFromSuggestion(suggestion);
            return (
              <li
                key={`${suggestion.value}-${suggestion.data_id ?? index}`}
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
                  selectSuggestion(suggestion);
                }}
                onMouseEnter={() => setHighlightIndex(index)}
              >
                <span className="block font-medium">{label}</span>
                {suggestion.subtext && suggestion.subtext !== label ? (
                  <span className="block text-xs text-muted-foreground">
                    {suggestion.subtext}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
