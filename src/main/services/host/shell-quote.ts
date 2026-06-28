// Shell quoting for constructing remote command strings.
//
// ssh2's Client.exec() takes a single command string that the remote shell
// parses. We must therefore quote every argument ourselves so a model path like
// `/home/user/my models/Qwen 7B.gguf` (spaces) or an adversarial value cannot
// break out of its argument slot. We use POSIX single-quote escaping, which is
// safe on the remote POSIX shells (Linux/macOS) that SSH targets always use.

/** Quote a single argument for a POSIX shell using single quotes. */
export function shellQuote(arg: string): string {
  if (arg === '') return "''"
  // Fast path: nothing remotely shell-special → leave as-is for readability.
  if (/^[A-Za-z0-9@%+=:,./_-]+$/.test(arg)) return arg
  // Wrap in single quotes and escape any embedded single quote by closing the
  // quote, emitting an escaped quote, and reopening: '...''...' .
  return `'${arg.replace(/'/g, `'\\''`)}'`
}

/** Quote and join an argv array into one command string. */
export function shellQuoteAll(args: readonly string[]): string {
  return args.map(shellQuote).join(' ')
}
