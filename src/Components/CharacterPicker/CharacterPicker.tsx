import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { LuChevronDown } from "react-icons/lu";
import type { CharacterOption } from "../DataActivity/utils";
import styles from "./CharacterPicker.module.css";

interface CharacterPickerProps {
    id?: string;
    value: string;
    options: CharacterOption[];
    onChange: (value: string) => void;
    ariaLabelledBy?: string;
    size?: "compact" | "default";
}

export default function CharacterPicker({
    id,
    value,
    options,
    onChange,
    ariaLabelledBy,
    size = "default",
}: CharacterPickerProps) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement | null>(null);
    const triggerRef = useRef<HTMLButtonElement | null>(null);
    const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
    const generatedId = useId();
    const menuId = id ? `${id}-menu` : `${generatedId}-menu`;

    const selectedOption = useMemo(
        () => options.find((option) => option.value === value) ?? options[0] ?? null,
        [options, value]
    );

    useEffect(() => {
        if (!open) return;

        const handlePointerDown = (event: MouseEvent) => {
            const target = event.target;
            if (!(target instanceof Node)) return;
            if (rootRef.current?.contains(target)) return;
            setOpen(false);
        };

        window.addEventListener("mousedown", handlePointerDown);
        return () => window.removeEventListener("mousedown", handlePointerDown);
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const selectedIndex = options.findIndex((option) => option.value === value);
        const nextIndex = selectedIndex >= 0 ? selectedIndex : 0;
        window.setTimeout(() => optionRefs.current[nextIndex]?.focus(), 0);
    }, [open, options, value]);

    const closeAndFocusTrigger = () => {
        setOpen(false);
        triggerRef.current?.focus();
    };

    const commitSelection = (nextValue: string) => {
        onChange(nextValue);
        closeAndFocusTrigger();
    };

    const moveFocus = (currentIndex: number, delta: number) => {
        const nextIndex = (currentIndex + delta + options.length) % options.length;
        optionRefs.current[nextIndex]?.focus();
    };

    const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
        }
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setOpen((prev) => !prev);
        }
    };

    const triggerClassName = [
        styles.trigger,
        size === "compact" ? styles.triggerCompact : styles.triggerDefault,
    ].join(" ");

    return (
        <div ref={rootRef} className={styles.picker}>
            <button
                ref={triggerRef}
                id={id}
                type="button"
                className={triggerClassName}
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-labelledby={ariaLabelledBy}
                aria-controls={open ? menuId : undefined}
                data-open={open ? "true" : "false"}
                onClick={() => setOpen((prev) => !prev)}
                onKeyDown={handleTriggerKeyDown}
            >
                <span className={styles.triggerValue}>
                    {selectedOption?.avatarUrl ? (
                        <img
                            className={styles.avatar}
                            src={selectedOption.avatarUrl}
                            alt=""
                            aria-hidden="true"
                        />
                    ) : null}
                    <span className={styles.labelStack}>
                        <span className={styles.label}>{selectedOption?.label ?? ""}</span>
                    </span>
                </span>
                <LuChevronDown className={styles.caret} aria-hidden="true" />
            </button>

            {open ? (
                <div id={menuId} className={styles.menu} role="listbox" aria-labelledby={ariaLabelledBy}>
                    {options.map((option, index) => {
                        const isSelected = option.value === value;
                        return (
                            <button
                                key={option.value}
                                ref={(node) => {
                                    optionRefs.current[index] = node;
                                }}
                                type="button"
                                role="option"
                                aria-selected={isSelected}
                                className={[
                                    styles.option,
                                    isSelected ? styles.optionSelected : "",
                                ]
                                    .filter(Boolean)
                                    .join(" ")}
                                onClick={() => commitSelection(option.value)}
                                onKeyDown={(event) => {
                                    if (event.key === "Escape") {
                                        event.preventDefault();
                                        closeAndFocusTrigger();
                                        return;
                                    }
                                    if (event.key === "ArrowDown") {
                                        event.preventDefault();
                                        moveFocus(index, 1);
                                        return;
                                    }
                                    if (event.key === "ArrowUp") {
                                        event.preventDefault();
                                        moveFocus(index, -1);
                                        return;
                                    }
                                    if (event.key === "Home") {
                                        event.preventDefault();
                                        optionRefs.current[0]?.focus();
                                        return;
                                    }
                                    if (event.key === "End") {
                                        event.preventDefault();
                                        optionRefs.current[options.length - 1]?.focus();
                                    }
                                }}
                            >
                                {option.avatarUrl ? (
                                    <img className={styles.avatar} src={option.avatarUrl} alt="" aria-hidden="true" />
                                ) : null}
                                <span className={styles.labelStack}>
                                    <span className={styles.label}>{option.label}</span>
                                </span>
                            </button>
                        );
                    })}
                </div>
            ) : null}
        </div>
    );
}
