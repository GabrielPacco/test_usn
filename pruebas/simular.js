// Simula usuarios, publicaciones, chats y mensajes a través de la API (/api del nginx).
// Uso: URL=http://<AppURL> node simular.js   (USERS=10 MSGS=5 por defecto)
const crypto = require("crypto");
const API = (process.env.URL || "http://localhost") + "/api";
const N = +process.env.USERS || 10;
const MSGS = +process.env.MSGS || 5;

const nombres = [["Ana","Quispe"],["Luis","Mamani"],["Rosa","Condori"],["Jorge","Huaman"],["Carla","Flores"],
  ["Diego","Chavez"],["Maria","Ramos"],["Pedro","Torres"],["Lucia","Vargas"],["Miguel","Rojas"],
  ["Sofia","Apaza"],["Raul","Ccama"]];
const frases = ["hola, ¿cómo vas con el trabajo?", "ya subí el informe", "¿nos vemos en la biblioteca?",
  "el clúster sigue arriba", "revisa el último commit", "mañana es la presentación", "listo, gracias",
  "¿probaste el chat?", "Kubernetes recreó el pod solo", "nos vemos en clase"];

async function post(path, body) {
  const r = await fetch(API + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${path} -> ${r.status}`);
  return r.json();
}

(async () => {
  const tag = crypto.randomBytes(2).toString("hex");
  const users = [];
  for (let i = 0; i < N; i++) {
    const [fn, ln] = nombres[i % nombres.length];
    const u = await post("/auth/register", {
      username: `${fn.toLowerCase()}_${tag}${i}`, password: crypto.randomBytes(12).toString("base64url"),
      firstname: fn, lastname: ln, country: "Peru",
    });
    users.push(u);
  }
  console.log(`Usuarios creados: ${users.length} (${users.map((u) => u.username).join(", ")})`);

  let posts = 0;
  for (const u of users) {
    await post("/posts", { userId: u.id, desc: `Publicación de ${u.firstname} desde Kubernetes` });
    posts++;
  }
  console.log(`Publicaciones creadas: ${posts}`);

  let chats = 0, msgs = 0;
  for (let i = 0; i + 1 < users.length; i += 2) {
    const a = users[i], b = users[i + 1];
    const chat = await post("/chat", { members: [a.id, b.id] });
    chats++;
    for (let m = 0; m < MSGS; m++) {
      const sender = m % 2 ? b : a;
      await post("/message/", { chatId: chat.id, senderId: sender.id, text: frases[(i + m) % frases.length] });
      msgs++;
    }
  }
  console.log(`Chats creados: ${chats} | Mensajes enviados: ${msgs}`);
})().catch((e) => { console.error("Error:", e.message); process.exit(1); });
