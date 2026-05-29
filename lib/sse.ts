// Parse a Server-Sent Events response body line-by-line.
// EventSource only supports GET, so for POST-SSE (where the body carries the
// directive / companyId) we open a fetch and feed the bytes through this.

export async function* readSSE<T>(
  res: Response,
  signal?: AbortSignal,
): AsyncGenerator<T> {
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const cancel = () => {
    reader.cancel().catch(() => {});
  };
  signal?.addEventListener("abort", cancel, { once: true });

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE events are separated by a blank line. Each event can carry many
      // data: lines, but our server emits one per event — just split on \n\n.
      let idx: number;
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const data = frame
          .split("\n")
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).trimStart())
          .join("\n");
        if (!data) continue;
        try {
          yield JSON.parse(data) as T;
        } catch {
          // Bad frame — skip.
        }
      }
    }
  } finally {
    signal?.removeEventListener("abort", cancel);
  }
}
