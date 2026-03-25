import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// Track rooms: roomId -> Set of socket IDs
const rooms = new Map();

io.on('connection', (socket) => {
  console.log(`[+] Connected: ${socket.id}`);

  // ── Create a new room ──────────────────────────────────────────────
  socket.on('create-room', (roomId) => {
    if (rooms.has(roomId)) {
      socket.emit('error-msg', { message: 'Room already exists' });
      return;
    }

    rooms.set(roomId, new Set([socket.id]));
    socket.join(roomId);
    socket.roomId = roomId;
    socket.emit('room-created', { roomId });
    console.log(`[Room] Created: ${roomId} by ${socket.id}`);
  });

  // ── Join an existing room ──────────────────────────────────────────
  socket.on('join-room', (roomId) => {
    const room = rooms.get(roomId);

    if (!room) {
      socket.emit('error-msg', { message: 'Room not found' });
      return;
    }
    if (room.size >= 2) {
      socket.emit('error-msg', { message: 'Room is full' });
      return;
    }

    room.add(socket.id);
    socket.join(roomId);
    socket.roomId = roomId;
    socket.emit('room-joined', { roomId });

    // Notify the existing peer that someone joined
    socket.to(roomId).emit('peer-joined', { peerId: socket.id });
    console.log(`[Room] ${socket.id} joined: ${roomId}`);
  });

  // ── Relay WebRTC signaling messages ────────────────────────────────
  socket.on('signal', ({ roomId, data }) => {
    socket.to(roomId).emit('signal', { peerId: socket.id, data });
  });

  // ── Cleanup on disconnect ──────────────────────────────────────────
  socket.on('disconnect', () => {
    console.log(`[-] Disconnected: ${socket.id}`);
    const roomId = socket.roomId;
    if (roomId && rooms.has(roomId)) {
      const room = rooms.get(roomId);
      room.delete(socket.id);

      if (room.size === 0) {
        rooms.delete(roomId);
        console.log(`[Room] Deleted empty room: ${roomId}`);
      } else {
        // Notify remaining peer
        socket.to(roomId).emit('peer-left', { peerId: socket.id });
      }
    }
  });
});

// ── Health check endpoint ────────────────────────────────────────────
app.get('/', (_req, res) => {
  res.json({ status: 'ok', rooms: rooms.size });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`\n⚡ Signaling server running on http://localhost:${PORT}\n`);
});
