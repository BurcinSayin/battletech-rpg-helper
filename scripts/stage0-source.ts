import type { Stage0Source } from "../lib/rules/stage0-contract";

export class Stage0SourceError extends Error {
  constructor(readonly source: Stage0Source, readonly statement: string) {
    super(`${source.file}:${source.line}: Unsupported Stage 0 source: ${statement}`);
    this.name = "Stage0SourceError";
  }
}

export type Statement = { readonly code: string; readonly source: Stage0Source };
export type SourceNode =
  | { readonly kind: "statement"; readonly statement: Statement }
  | { readonly kind: "switch"; readonly parameter: string;
      readonly cases: ReadonlyMap<number | "default", SourceBlock> }
  | { readonly kind: "if"; readonly parameter: string; readonly value: string | boolean;
      readonly yes: SourceBlock; readonly no: SourceBlock };
export type SourceBlock = { readonly nodes: readonly SourceNode[]; readonly source: Stage0Source };

function tokenize(text: string, firstLine: number): Statement[] {
  const tokens: Statement[] = [];
  let line = firstLine;
  let start = firstLine;
  let code = "";
  let quoted = false;
  let escaped = false;
  let comment: "line" | "block" | null = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (ch === "\n") line++;
    if (comment === "line") { if (ch === "\n") comment = null; continue; }
    if (comment === "block") {
      if (ch === "*" && next === "/") { comment = null; i++; }
      continue;
    }
    if (!quoted && ch === "/" && (next === "/" || next === "*")) {
      comment = next === "/" ? "line" : "block"; i++; continue;
    }
    if (!code.trim() && ch.trim()) start = line;
    code += ch;
    if (quoted) {
      if (ch === '"' && !escaped) quoted = false;
      escaped = ch === "\\" && !escaped;
      continue;
    }
    if (ch === '"') { quoted = true; escaped = false; continue; }
    if (";{}".includes(ch) || (ch === ":" && /^\s*(case\s+\d+|default):$/.test(code))) {
      tokens.push({ code: code.trim(), source: { file: "text_resurce.cpp", line: start } });
      code = "";
    }
  }
  if (quoted || comment === "block" || code.trim()) {
    throw new Stage0SourceError({ file: "text_resurce.cpp", line }, code);
  }
  return tokens;
}

export function sourceFunction(text: string, name: string): SourceBlock {
  const structure = text.replace(/"(?:\\.|[^"\\])*"|\/\/[^\n]*|\/\*[\s\S]*?\*\//g,
    (token) => token.replace(/[^\n]/g, " "));
  const signature = new RegExp(`void Text_Resurce::${name}\\([^)]*\\)\\s*\\{`).exec(structure);
  if (!signature) throw new Stage0SourceError({ file: "text_resurce.cpp", line: 1 }, name);
  const opening = signature.index + signature[0].length - 1;
  let depth = 1;
  let end = opening + 1;
  for (; end < text.length && depth > 0; end++) {
    if (structure[end] === "{") depth++;
    if (structure[end] === "}") depth--;
  }
  if (depth !== 0) throw new Stage0SourceError({ file: "text_resurce.cpp", line: text.slice(0, opening).split("\n").length }, "Unclosed function");
  const line = text.slice(0, opening + 1).split("\n").length;
  const tokens = tokenize(text.slice(opening + 1, end), line);
  let index = 0;
  function block(source: Stage0Source, caseBody = false): SourceBlock {
    const nodes: SourceNode[] = [];
    while (index < tokens.length) {
      const token = tokens[index];
      if (token.code === "}") { if (!caseBody) index++; break; }
      if (caseBody && /^(case \d+|default):$/.test(token.code)) break;
      index++;
      const sw = /^switch\s*\(\s*(affStrNum|primPos|secPos)\s*\)\s*\{$/.exec(token.code);
      if (sw) {
        const cases = new Map<number | "default", SourceBlock>();
        while (tokens[index]?.code !== "}") {
          const arm = tokens[index++];
          if (!arm) throw new Stage0SourceError(source, "Unclosed switch");
          const match = /^(?:case\s+(\d+)|default):$/.exec(arm.code);
          if (!match) throw new Stage0SourceError(arm.source, arm.code);
          const key = match[1] === undefined ? "default" : Number(match[1]);
          if (cases.has(key)) throw new Stage0SourceError(arm.source, "Duplicate case");
          cases.set(key, block(arm.source, true));
        }
        index++;
        nodes.push({ kind: "switch", parameter: sw[1], cases });
        continue;
      }
      const cond = /^if\s*\(\s*(nameCaste|chk)\s*==\s*("[^"]+"|true)\s*\)\s*\{$/.exec(token.code);
      if (cond) {
        const yes = block(token.source);
        const next = tokens[index];
        let no: SourceBlock = { source: token.source, nodes: [] };
        if (next?.code === "else {") { index++; no = block(next.source); }
        nodes.push({ kind: "if", parameter: cond[1],
          value: cond[2] === "true" ? true : cond[2].slice(1, -1), yes, no });
        continue;
      }
      if (token.code === "break;" || token.code === ";") continue;
      if (!token.code.endsWith(";")) throw new Stage0SourceError(token.source, token.code);
      nodes.push({ kind: "statement", statement: token });
    }
    return { source, nodes };
  }
  return block({ file: "text_resurce.cpp", line: text.slice(0, signature.index).split("\n").length });
}

export function selectedStatements(block: SourceBlock, selection: Readonly<Record<string, string | number | boolean>>): Statement[] {
  return block.nodes.flatMap((node): Statement[] => {
    switch (node.kind) {
      case "statement": return [node.statement];
      case "if": return selectedStatements(selection[node.parameter] === node.value ? node.yes : node.no, selection);
      case "switch": {
        const key = selection[node.parameter];
        const arm = typeof key === "number" ? node.cases.get(key) ?? node.cases.get("default") : undefined;
        return arm ? selectedStatements(arm, selection) : [];
      }
      default: return assertNever(node);
    }
  });
}

function assertNever(value: never): never { throw new Stage0SourceError({ file: "text_resurce.cpp", line: 1 }, String(value)); }
