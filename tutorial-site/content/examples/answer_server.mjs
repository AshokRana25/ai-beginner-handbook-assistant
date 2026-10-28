// Node.js server sketch. Start with MODEL_API_KEY set in the server environment.
import http from "node:http";

const apiKey = process.env.MODEL_API_KEY;
if (!apiKey) throw new Error("MODEL_API_KEY is not set");

const send = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};

http.createServer(async (req, res) => {
  if (req.method !== "POST" || req.url !== "/api/answer") return send(res, 404, { error: "not found" });
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 10_000) return send(res, 413, { error: "request too large" });
  }
  let question;
  try {
    ({ question } = JSON.parse(body));
  } catch {
    return send(res, 400, { error: "invalid JSON" });
  }
  if (typeof question !== "string" || !question.trim()) return send(res, 400, { error: "question is required" });
  // Authenticate the user, then call your provider's official SDK with apiKey.
  // Never include apiKey in a response or log line.
  return send(res, 501, { error: "provider call not implemented in this sketch" });
}).listen(3000, () => console.log("listening on http://localhost:3000"));
