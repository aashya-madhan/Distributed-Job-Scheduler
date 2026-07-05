import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import jwt from 'jsonwebtoken';
import logger from '../utils/logger';

interface WSClient {
  ws: WebSocket;
  userId: string;
  subscriptions: Set<string>;
}

class WebSocketService {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, WSClient> = new Map();

  initialize(server: Server) {
    this.wss = new WebSocketServer({ server, path: '/ws' });

    this.wss.on('connection', (ws, req) => {
      const url = new URL(req.url!, `http://${req.headers.host}`);
      const token = url.searchParams.get('token');

      if (!token) {
        ws.close(1008, 'Unauthorized');
        return;
      }

      try {
        const payload = jwt.verify(token, process.env.JWT_SECRET!) as { id: string };
        const clientId = `${payload.id}-${Date.now()}`;
        const client: WSClient = { ws, userId: payload.id, subscriptions: new Set() };
        this.clients.set(clientId, client);

        ws.on('message', (data) => {
          try {
            const msg = JSON.parse(data.toString());
            if (msg.type === 'subscribe') client.subscriptions.add(msg.channel);
            if (msg.type === 'unsubscribe') client.subscriptions.delete(msg.channel);
          } catch {}
        });

        ws.on('close', () => this.clients.delete(clientId));
        ws.send(JSON.stringify({ type: 'connected', clientId }));
        logger.debug(`WS client connected: ${clientId}`);
      } catch {
        ws.close(1008, 'Invalid token');
      }
    });
  }

  broadcast(channel: string, data: unknown) {
    const msg = JSON.stringify({ type: 'update', channel, data });
    this.clients.forEach((client) => {
      if (client.subscriptions.has(channel) && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(msg);
      }
    });
  }

  broadcastToUser(userId: string, data: unknown) {
    const msg = JSON.stringify({ type: 'notification', data });
    this.clients.forEach((client) => {
      if (client.userId === userId && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(msg);
      }
    });
  }
}

export const wsService = new WebSocketService();
