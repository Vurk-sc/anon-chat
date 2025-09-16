const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const { createClient } = require('redis');

// In-memory storage for demo (use Redis in production)
const messages = [];
const clients = new Map();
const rooms = new Map();

// Redis client setup (optional - fallback to in-memory)
let redisClient;
try {
  redisClient = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379'
  });
  redisClient.connect().catch(console.error);
} catch (error) {
  console.log('Redis not available, using in-memory storage');
}

class ChatServer {
  constructor() {
    this.wss = null;
    this.clients = new Map();
  }

  async saveMessage(message) {
    if (redisClient && redisClient.isReady) {
      try {
        await redisClient.lPush('chat:messages', JSON.stringify(message));
        await redisClient.lTrim('chat:messages', 0, 99); // Keep last 100 messages
      } catch (error) {
        console.error('Redis error:', error);
        messages.push(message);
        if (messages.length > 100) messages.shift();
      }
    } else {
      messages.push(message);
      if (messages.length > 100) messages.shift();
    }
  }

  async getMessages() {
    if (redisClient && redisClient.isReady) {
      try {
        const msgs = await redisClient.lRange('chat:messages', 0, -1);
        return msgs.map(msg => JSON.parse(msg)).reverse();
      } catch (error) {
        console.error('Redis error:', error);
        return messages;
      }
    }
    return messages;
  }

  broadcast(message, excludeClient = null) {
    const messageStr = JSON.stringify(message);
    this.clients.forEach((client, ws) => {
      if (ws !== excludeClient && ws.readyState === WebSocket.OPEN) {
        ws.send(messageStr);
      }
    });
  }

  generateAnonId() {
    const adjectives = ['Anonymous', 'Hidden', 'Secret', 'Mystery', 'Ghost', 'Shadow', 'Phantom'];
    const numbers = Math.floor(Math.random() * 9999).toString().padStart(4, '0');
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    return `${adj}${numbers}`;
  }

  generateUserColor() {
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F39C12', '#E74C3C', '#9B59B6'];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  async handleConnection(ws, request) {
    const userId = this.generateAnonId();
    const userColor = this.generateUserColor();
    
    const clientInfo = {
      id: userId,
      color: userColor,
      joinedAt: new Date(),
      lastActivity: new Date()
    };

    this.clients.set(ws, clientInfo);

    // Send welcome message and recent messages
    const recentMessages = await this.getMessages();
    ws.send(JSON.stringify({
      type: 'init',
      userId: userId,
      color: userColor,
      messages: recentMessages
    }));

    // Broadcast user count update
    this.broadcast({
      type: 'userCount',
      count: this.clients.size
    });

    ws.on('message', async (data) => {
      try {
        const parsed = JSON.parse(data.toString());
        await this.handleMessage(ws, parsed);
      } catch (error) {
        console.error('Message parsing error:', error);
      }
    });

    ws.on('close', () => {
      this.clients.delete(ws);
      this.broadcast({
        type: 'userCount',
        count: this.clients.size
      });
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      this.clients.delete(ws);
    });
  }

  async handleMessage(ws, message) {
    const client = this.clients.get(ws);
    if (!client) return;

    client.lastActivity = new Date();

    switch (message.type) {
      case 'message':
        if (message.content && message.content.trim().length > 0) {
          const chatMessage = {
            id: uuidv4(),
            content: message.content.trim().substring(0, 1000), // Limit message length
            timestamp: new Date().toISOString(),
            userId: client.id,
            color: client.color,
            encrypted: message.encrypted || false
          };

          await this.saveMessage(chatMessage);

          // Broadcast to all clients
          this.broadcast({
            type: 'newMessage',
            message: chatMessage
          });
        }
        break;

      case 'ping':
        ws.send(JSON.stringify({ type: 'pong' }));
        break;
    }
  }
}

const chatServer = new ChatServer();

module.exports = (req, res) => {
  if (req.method === 'GET') {
    // Handle WebSocket upgrade
    if (req.headers.upgrade === 'websocket') {
      if (!chatServer.wss) {
        chatServer.wss = new WebSocket.Server({ noServer: true });
      }

      chatServer.wss.handleUpgrade(req, req.socket, Buffer.alloc(0), (ws) => {
        chatServer.handleConnection(ws, req);
      });
    } else {
      // HTTP endpoint for health check
      res.status(200).json({
        status: 'ok',
        activeConnections: chatServer.clients.size,
        uptime: process.uptime()
      });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
};
