import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from './config.js';

/**
 * Realtime gateway (Socket.IO).
 *
 * Channels:
 *  - `user:<id>`   — private notifications + personal ticket updates
 *  - `role:<ROLE>` — role-scoped broadcasts (e.g. the manager queue)
 *  - `board`       — anonymised live counters for dashboards
 *  - `ticket:<id>` — focused room a client joins while viewing one ticket
 */

let io = null;
/** userId -> Set<socketId> for presence indicators. */
const presence = new Map();

export function initRealtime(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: config.corsOrigins, credentials: true },
    path: '/socket.io',
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token ?? socket.handshake.query?.token;
    if (!token) return next(new Error('AUTH_REQUIRED'));
    try {
      const payload = jwt.verify(token, config.jwtSecret);
      socket.data.user = { id: Number(payload.sub), role: payload.role, name: payload.name };
      return next();
    } catch {
      return next(new Error('AUTH_INVALID'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user;
    socket.join(`user:${user.id}`);
    socket.join(`role:${user.role}`);
    socket.join('board');

    if (!presence.has(user.id)) presence.set(user.id, new Set());
    presence.get(user.id).add(socket.id);
    broadcastPresence();

    socket.on('ticket:subscribe', (ticketId) => {
      socket.join(`ticket:${Number(ticketId)}`);
    });
    socket.on('ticket:unsubscribe', (ticketId) => {
      socket.leave(`ticket:${Number(ticketId)}`);
    });

    socket.on('disconnect', () => {
      const sockets = presence.get(user.id);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) presence.delete(user.id);
      }
      broadcastPresence();
    });
  });

  return io;
}

export function getIo() {
  return io;
}

export function emitToUser(userId, event, payload) {
  io?.to(`user:${Number(userId)}`).emit(event, payload);
}

export function emitToRole(role, event, payload) {
  io?.to(`role:${role}`).emit(event, payload);
}

export function emitToTicket(ticketId, event, payload) {
  io?.to(`ticket:${Number(ticketId)}`).emit(event, payload);
}

export function emitToBoard(event, payload) {
  io?.to('board').emit(event, payload);
}

/** Fan a ticket event out to the private rooms of everyone involved. */
export function emitTicketUpdate(ticket, userIds, event = 'ticket:updated') {
  const payload = {
    id: ticket.id,
    code: ticket.code,
    status: ticket.status,
    priority: ticket.priority,
    assignee_id: ticket.assignee_id ?? null,
    updated_at: ticket.updated_at,
  };
  emitToBoard(event, payload);
  emitToTicket(ticket.id, event, payload);
  for (const userId of new Set(userIds.filter(Boolean))) emitToUser(userId, event, payload);
}

export function onlineUserIds() {
  return [...presence.keys()];
}

function broadcastPresence() {
  io?.to('board').emit('presence:update', { online: onlineUserIds(), count: presence.size });
}
