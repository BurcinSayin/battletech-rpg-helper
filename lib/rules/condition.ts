type Context = Readonly<Record<string, string | boolean>>;

/** Strict interpreter for the generated desktop condition vocabulary. No eval.
 * Parse both sides even when a boolean operator could short circuit. */
export function matchesCondition(source: string, context: Context): boolean {
  const tokens =
    source.match(/"[^"\\]*"|[A-Za-z][\w.]*(?:\(\))?|==|!=|&&|\|\||[!()]/g) ??
    [];
  if (tokens.join("") !== source.replace(/\s+(?=(?:[^"]*"[^"]*")*[^"]*$)/g, ""))
    throw new Error(`Unsupported rule condition: ${source}`);
  let position = 0;
  function atom(): boolean {
    const token = tokens[position++];
    if (token === "!") return !atom();
    if (token === "(") {
      const value = or();
      if (tokens[position++] !== ")")
        throw new Error(`Unbalanced condition: ${source}`);
      return value;
    }
    if (!token || !Object.hasOwn(context, token))
      throw new Error(`Unknown rule variable: ${token}`);
    const operator = tokens[position++];
    const literal = tokens[position++];
    if (
      (operator !== "==" && operator !== "!=") ||
      !literal ||
      !/^(true|false|"[^"]*")$/.test(literal)
    )
      throw new Error(`Unsupported comparison: ${source}`);
    const expected = literal.startsWith('"')
      ? literal.slice(1, -1)
      : literal === "true";
    return operator === "=="
      ? context[token] === expected
      : context[token] !== expected;
  }
  function and(): boolean {
    let value = atom();
    while (tokens[position] === "&&") {
      position++;
      const next = atom();
      value = value && next;
    }
    return value;
  }
  function or(): boolean {
    let value = and();
    while (tokens[position] === "||") {
      position++;
      const next = and();
      value = value || next;
    }
    return value;
  }
  const result = or();
  if (position !== tokens.length)
    throw new Error(`Trailing rule tokens: ${source}`);
  return result;
}
