"use client";

import {
  filterCountryOptions,
  type CountryOption,
} from "@/lib/countries";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

type CountryAutocompleteProps = {
  value: string;
  onChange: (countryName: string) => void;
  required?: boolean;
  placeholder?: string;
  disabled?: boolean;
  inputClassName?: string;
};

export function CountryAutocomplete({
  value,
  onChange,
  required,
  placeholder,
  disabled,
  inputClassName = "rounded-md border px-3 py-2",
}: CountryAutocompleteProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);

  const suggestions = useMemo(
    () => (open ? filterCountryOptions(value) : []),
    [open, value],
  );

  const close = useCallback(() => {
    setOpen(false);
    setHighlightIndex(0);
  }, []);

  const selectOption = useCallback(
    (option: CountryOption) => {
      onChange(option.name);
      close();
    },
    [close, onChange],
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
    onChange(next);
    if (next.trim().length > 0) {
      setOpen(true);
      setHighlightIndex(0);
    } else {
      close();
    }
  }

  function onInputFocus() {
    if (value.trim().length > 0 && filterCountryOptions(value).length > 0) {
      setOpen(true);
    }
  }

  function onInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      close();
      return;
    }

    if (!open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      if (value.trim().length > 0 && filterCountryOptions(value).length > 0) {
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
      const option = suggestions[activeIndex];
      if (option) {
        event.preventDefault();
        selectOption(option);
      }
    }
  }

  const showList = open && suggestions.length > 0;

  return (
    <div ref={rootRef} className="relative">
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
        aria-activedescendant={
          showList ? `${listId}-option-${activeIndex}` : undefined
        }
        className={inputClassName}
        onChange={(event) => onInputChange(event.target.value)}
        onFocus={onInputFocus}
        onKeyDown={onInputKeyDown}
      />
      {showList ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-background py-1 text-sm shadow-md"
        >
          {suggestions.map((option, index) => (
            <li
              key={option.code}
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
                selectOption(option);
              }}
              onMouseEnter={() => setHighlightIndex(index)}
            >
              {option.name}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
