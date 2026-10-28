// Browser code: calls your own server, never the model provider directly.
async function ask(question) {
  const response = await fetch("/api/answer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json();
}
