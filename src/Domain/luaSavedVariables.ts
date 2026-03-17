export type LuaRootTableExtractStatus = "ok" | "missing" | "incomplete" | "parse_error";

export type LuaRootTableExtractResult =
    | {
          status: "ok";
          table: string;
          assignmentIndex: number;
          tableStart: number;
          tableEnd: number;
      }
    | {
          status: "missing" | "incomplete" | "parse_error";
          assignmentIndex?: number;
      };

const isIdentifierBoundary = (value: string | undefined) =>
    value === undefined || !/[A-Za-z0-9_]/.test(value);

const readBalancedLuaTable = (content: string, tableStart: number) => {
    if (content[tableStart] !== "{") {
        return null;
    }

    let depth = 0;
    let inString = false;
    let stringChar = "";
    let escaped = false;
    let inLineComment = false;

    for (let index = tableStart; index < content.length; index += 1) {
        const ch = content[index];
        const next = content[index + 1];

        if (inLineComment) {
            if (ch === "\n") {
                inLineComment = false;
            }
            continue;
        }

        if (inString) {
            if (escaped) {
                escaped = false;
                continue;
            }
            if (ch === "\\") {
                escaped = true;
                continue;
            }
            if (ch === stringChar) {
                inString = false;
                stringChar = "";
            }
            continue;
        }

        if (ch === "\"" || ch === "'") {
            inString = true;
            stringChar = ch;
            continue;
        }

        if (ch === "-" && next === "-") {
            inLineComment = true;
            index += 1;
            continue;
        }

        if (ch === "{") {
            depth += 1;
            continue;
        }

        if (ch === "}") {
            depth -= 1;
            if (depth === 0) {
                return {
                    table: content.slice(tableStart, index + 1),
                    tableEnd: index + 1,
                };
            }
        }
    }

    return null;
};

export const extractLuaRootTable = (
    content: string,
    key: string
): LuaRootTableExtractResult => {
    let inString = false;
    let stringChar = "";
    let escaped = false;
    let inLineComment = false;
    let atLineStart = true;
    let braceDepth = 0;

    for (let index = 0; index < content.length; index += 1) {
        const ch = content[index];
        const next = content[index + 1];

        if (inLineComment) {
            if (ch === "\n") {
                inLineComment = false;
                atLineStart = true;
            }
            continue;
        }

        if (inString) {
            if (escaped) {
                escaped = false;
                continue;
            }
            if (ch === "\\") {
                escaped = true;
                continue;
            }
            if (ch === stringChar) {
                inString = false;
                stringChar = "";
            }
            continue;
        }

        if (ch === "\"" || ch === "'") {
            inString = true;
            stringChar = ch;
            atLineStart = false;
            continue;
        }

        if (ch === "-" && next === "-" && atLineStart) {
            inLineComment = true;
            index += 1;
            continue;
        }

        if (ch === "\n") {
            atLineStart = true;
            continue;
        }

        if (ch === "{") {
            braceDepth += 1;
            atLineStart = false;
            continue;
        }

        if (ch === "}") {
            braceDepth = Math.max(0, braceDepth - 1);
            atLineStart = false;
            continue;
        }

        if (atLineStart && (ch === " " || ch === "\t" || ch === "\r")) {
            continue;
        }

        if (
            braceDepth === 0 &&
            atLineStart &&
            content.startsWith(key, index) &&
            isIdentifierBoundary(content[index - 1]) &&
            isIdentifierBoundary(content[index + key.length])
        ) {
            let cursor = index + key.length;
            while (cursor < content.length && /\s/.test(content[cursor])) {
                cursor += 1;
            }

            if (cursor >= content.length) {
                return {
                    status: "incomplete",
                    assignmentIndex: index,
                };
            }

            if (content[cursor] !== "=") {
                return {
                    status: "parse_error",
                    assignmentIndex: index,
                };
            }

            cursor += 1;
            while (cursor < content.length && /\s/.test(content[cursor])) {
                cursor += 1;
            }

            if (cursor >= content.length) {
                return {
                    status: "incomplete",
                    assignmentIndex: index,
                };
            }

            if (content[cursor] !== "{") {
                return {
                    status: "parse_error",
                    assignmentIndex: index,
                };
            }

            const balanced = readBalancedLuaTable(content, cursor);
            if (!balanced) {
                return {
                    status: "incomplete",
                    assignmentIndex: index,
                };
            }

            return {
                status: "ok",
                table: balanced.table,
                assignmentIndex: index,
                tableStart: cursor,
                tableEnd: balanced.tableEnd,
            };
        }

        atLineStart = false;
    }

    return {
        status: "missing",
    };
};
