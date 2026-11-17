import { useEffect, useId, useRef, useState } from "react";

export function RailMenu({
  label,
  value,
  options,
  onChange,
  className = "",
  buttonClassName = "",
  menuClassName = "",
  ariaLabel,
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const root = useRef(null);
  const listId = useId();
  const selected = options.find((option) => String(option.value) === String(value)) ?? options[0];

  useEffect(() => {
    if (!open) return undefined;
    const index = Math.max(0, options.findIndex((option) => String(option.value) === String(value)));
    setActive(index);

    function onPointer(event) {
      if (!root.current?.contains(event.target)) setOpen(false);
    }
    function onKey(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, options, value]);

  function choose(option) {
    onChange(option.value);
    setOpen(false);
  }

  function onButtonKey(event) {
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setOpen(true);
    }
  }

  function onListKey(event) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => (index + 1) % options.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => (index - 1 + options.length) % options.length);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const option = options[active];
      if (option) choose(option);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      setActive(0);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      setActive(options.length - 1);
    }
  }

  return (
    <div className={`rail-menu ${open ? "is-open" : ""} ${className}`.trim()} ref={root}>
      {label ? <span className="rail-field__label">{label}</span> : null}
      <button
        type="button"
        className={`rail-menu__button ${buttonClassName}`.trim()}
        aria-label={ariaLabel || label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((next) => !next)}
        onKeyDown={onButtonKey}
      >
        <span className="rail-menu__value">{selected?.label ?? "—"}</span>
        <span className="rail-menu__chevron" aria-hidden="true" />
      </button>
      {open && (
        <ul
          id={listId}
          className={`rail-menu__list ${menuClassName}`.trim()}
          role="listbox"
          tabIndex={-1}
          aria-label={ariaLabel || label}
          onKeyDown={onListKey}
          ref={(node) => node?.focus()}
        >
          {options.map((option, index) => {
            const isSelected = String(option.value) === String(value);
            const isActive = index === active;
            return (
              <li key={String(option.value)} role="none">
                <button
                  type="button"
                  role="option"
                  className={`rail-menu__option${isSelected ? " is-selected" : ""}${isActive ? " is-active" : ""}`}
                  aria-selected={isSelected}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(option)}
                >
                  <span className="rail-menu__option-label">{option.label}</span>
                  {option.hint ? <span className="rail-menu__option-hint">{option.hint}</span> : null}
                  {isSelected ? <span className="rail-menu__check" aria-hidden="true" /> : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
