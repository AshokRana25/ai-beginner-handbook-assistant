// Local framing exercise, not a provider-specific streaming client.
const bytes = new TextEncoder().encode(
  '{"text":"Hello "}\n{"text":"café"}\n{"done":true}\n'
);
const decoder = new TextDecoder();
let buffer = '';
let text = '';
let done = false;

function consume(decoded) {
  buffer += decoded;
  let newline;
  while ((newline = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, newline);
    buffer = buffer.slice(newline + 1);
    if (!line.trim()) continue;
    if (done) throw new Error('Record after completion');
    const event = JSON.parse(line);
    if (event.done === true) done = true;
    else if (typeof event.text === 'string') text += event.text;
    else throw new Error('Unexpected event');
  }
}

// One-byte chunks deliberately split both records and the accented character.
for (const byte of bytes) consume(decoder.decode(new Uint8Array([byte]), { stream: true }));
consume(decoder.decode());
if (buffer.trim() || !done) throw new Error('Incomplete stream');
console.log(text);
