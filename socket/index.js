const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { createAdapter } = require("@socket.io/redis-adapter");
const { createClient } = require("redis");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// Con varias réplicas, el adaptador de Redis reparte los eventos entre todos los pods.
// Sin REDIS_URL (una sola réplica, docker-compose) se usa el adaptador en memoria.
const REDIS_URL = process.env.REDIS_URL;
let redisReady = !REDIS_URL;
if (REDIS_URL) {
  const pubClient = createClient({ url: REDIS_URL });
  const subClient = pubClient.duplicate();
  pubClient.on("error", (err) => console.error("[Redis]", err.message));
  subClient.on("error", (err) => console.error("[Redis]", err.message));
  Promise.all([pubClient.connect(), subClient.connect()]).then(() => {
    io.adapter(createAdapter(pubClient, subClient));
    redisReady = true;
    console.log(`[Socket] Redis adapter connected: ${REDIS_URL}`);
  });
}

// Cada usuario entra a la sala "user:<id>"; así se le encuentra aunque esté en otro pod
const userRoom = (userId) => `user:${userId}`;

// Lista de usuarios conectados en TODOS los pods (mismo formato que antes)
async function getActiveUsers() {
  const sockets = await io.fetchSockets();
  const seen = new Map();
  for (const s of sockets) {
    if (s.data.userId) seen.set(s.data.userId, { userId: s.data.userId, socketId: s.id });
  }
  return [...seen.values()];
}

async function broadcastUsers() {
  try {
    io.emit("get-users", await getActiveUsers());
  } catch (err) {
    console.error("[Socket] get-users failed:", err.message);
  }
}

// Health check endpoint for Kubernetes Liveness and Readiness Probes
app.get("/health", (req, res) => {
  res.status(redisReady ? 200 : 503).json({
    status: redisReady ? "UP" : "STARTING",
    service: "socket-server",
    pod: process.env.HOSTNAME,
    redis: REDIS_URL ? redisReady : "disabled",
    localConnections: io.engine.clientsCount,
    timestamp: new Date().toISOString(),
  });
});

app.get("/", (req, res) => {
  res.send("Universe Social Network - Socket Service is UP and running");
});

io.on("connection", (socket) => {
  console.log(`[Socket] Client connected: ${socket.id}`);

  // Register user and broadcast online list
  socket.on("new-user-add", (newUserId) => {
    if (!newUserId) return;
    socket.data.userId = newUserId;
    socket.join(userRoom(newUserId));
    console.log(`[Socket] User registered: ${newUserId}`);
    broadcastUsers();
  });

  // Handle real-time chat messages
  socket.on("send-message", (data) => {
    const { receiverId } = data;
    console.log(`[Socket] Routing message to receiver: ${receiverId}`);
    io.to(userRoom(receiverId)).emit("recieve-message", data);
  });

  // Handle real-time notifications
  socket.on("send-notification", (data) => {
    const { receiverId } = data;
    console.log(`[Socket] Routing notification to receiver: ${receiverId}`);
    io.to(userRoom(receiverId)).emit("recieve-notification", data);
  });

  // Disconnection cleanup
  socket.on("disconnect", () => {
    console.log(`[Socket] Disconnected: ${socket.id}`);
    broadcastUsers();
  });
});

const PORT = process.env.PORT || 8800;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Socket Service running on port ${PORT}`);
});
