// Simula N parejas de usuarios chateando por http://localhost (nginx -> socket-service).
// Cuenta cuántos mensajes llegan al receptor.
const { io } = require("socket.io-client");
const URL = process.env.URL || "http://localhost";
const PAIRS = +process.env.PAIRS || 20;
const opts = { transports: ["websocket"], forceNew: true };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  let ok = 0;
  const sockets = [];
  const pairs = [];
  for (let i = 0; i < PAIRS; i++) {
    const a = 900000 + i * 2, b = a + 1;
    const sa = io(URL, opts), sb = io(URL, opts);
    sockets.push(sa, sb);
    sb.on("recieve-message", () => ok++);
    pairs.push({ a, b, sa, sb });
  }
  await sleep(1500);
  for (const p of pairs) { p.sa.emit("new-user-add", p.a); p.sb.emit("new-user-add", p.b); }
  await sleep(1500);
  for (const p of pairs) p.sa.emit("send-message", { senderId: p.a, receiverId: p.b, text: "hola" });
  await sleep(2000);
  console.log(`Mensajes entregados: ${ok}/${PAIRS} (${Math.round(ok * 100 / PAIRS)}%)`);
  sockets.forEach((s) => s.close());
  process.exit(0);
})();
