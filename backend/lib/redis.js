const { createClient } = require('redis');

class RedisManager {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.retryAttempts = 0;
    this.maxRetries = 3;
  }

  async connect() {
    try {
      // Skip Redis if no URL provided (use in-memory fallback)
      if (!process.env.REDIS_URL) {
        console.log('No Redis URL provided, using in-memory storage');
        return null;
      }

      this.client = createClient({
        url: process.env.REDIS_URL,
        socket: {
          connectTimeout: 60000,
          lazyConnect: true,
          reconnectStrategy: (retries) => {
            if (retries > this.maxRetries) {
              console.log('Redis: Max retries exceeded');
              return false;
            }
            return Math.min(retries * 50, 500);
          }
        }
      });

      // Error handling
      this.client.on('error', (err) => {
        console.error('Redis Client Error:', err);
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        console.log('Redis: Attempting to connect...');
      });

      this.client.on('ready', () => {
        console.log('Redis: Connected and ready');
        this.isConnected = true;
        this.retryAttempts = 0;
      });

      this.client.on('end', () => {
        console.log('Redis: Connection ended');
        this.isConnected = false;
      });

      this.client.on('reconnecting', () => {
        console.log('Redis: Reconnecting...');
      });

      // Connect
      await this.client.connect();
      return this.client;

    } catch (error) {
      console.error('Redis connection failed:', error);
      this.isConnected = false;
      this.retryAttempts++;
      
      if (this.retryAttempts < this.maxRetries) {
        console.log(`Retrying Redis connection... (${this.retryAttempts}/${this.maxRetries})`);
        setTimeout(() => this.connect(), 2000 * this.retryAttempts);
      }
      
      return null;
    }
  }

  async disconnect() {
    if (this.client && this.isConnected) {
      try {
        await this.client.quit();
        this.isConnected = false;
        console.log('Redis: Disconnected gracefully');
      } catch (error) {
        console.error('Redis disconnect error:', error);
      }
    }
  }

  // Message operations
  async saveMessage(message, maxMessages = 100) {
    if (!this.isReady()) return false;

    try {
      const messageStr = JSON.stringify(message);
      
      // Add to list
      await this.client.lPush('chat:messages', messageStr);
      
      // Trim to keep only recent messages
      await this.client.lTrim('chat:messages', 0, maxMessages - 1);
      
      // Set expiration for the entire list (24 hours)
      await this.client.expire('chat:messages', 86400);
      
      return true;
    } catch (error) {
      console.error('Redis save message error:', error);
      return false;
    }
  }

  async getMessages(count = 50) {
    if (!this.isReady()) return [];

    try {
      const messages = await this.client.lRange('chat:messages', 0, count - 1);
      return messages.map(msg => JSON.parse(msg)).reverse();
    } catch (error) {
      console.error('Redis get messages error:', error);
      return [];
    }
  }

  // User session operations
  async saveUserSession(userId, sessionData) {
    if (!this.isReady()) return false;

    try {
      const key = `user:${userId}`;
      const sessionStr = JSON.stringify(sessionData);
      
      await this.client.setEx(key, 3600, sessionStr); // 1 hour expiration
      return true;
    } catch (error) {
      console.error('Redis save user session error:', error);
      return false;
    }
  }

  async getUserSession(userId) {
    if (!this.isReady()) return null;

    try {
      const sessionStr = await this.client.get(`user:${userId}`);
      return sessionStr ? JSON.parse(sessionStr) : null;
    } catch (error) {
      console.error('Redis get user session error:', error);
      return null;
    }
  }

  // Connection count tracking
  async incrementConnectionCount() {
    if (!this.isReady()) return 1;

    try {
      const count = await this.client.incr('connections:count');
      await this.client.expire('connections:count', 300); // 5 minutes
      return count;
    } catch (error) {
      console.error('Redis increment connection error:', error);
      return 1;
    }
  }

  async decrementConnectionCount() {
    if (!this.isReady()) return 0;

    try {
      const count = await this.client.decr('connections:count');
      return Math.max(0, count);
    } catch (error) {
      console.error('Redis decrement connection error:', error);
      return 0;
    }
  }

  async getConnectionCount() {
    if (!this.isReady()) return 0;

    try {
      const count = await this.client.get('connections:count');
      return parseInt(count) || 0;
    } catch (error) {
      console.error('Redis get connection count error:', error);
      return 0;
    }
  }

  // Rate limiting helpers
  async checkRateLimit(identifier, maxRequests = 30, windowSeconds = 60) {
    if (!this.isReady()) return true; // Allow if Redis unavailable

    try {
      const key = `ratelimit:${identifier}`;
      const current = await this.client.get(key);
      
      if (!current) {
        await this.client.setEx(key, windowSeconds, '1');
        return true;
      }

      const count = parseInt(current);
      if (count >= maxRequests) {
        return false;
      }

      await this.client.incr(key);
      return true;
    } catch (error) {
      console.error('Redis rate limit error:', error);
      return true; // Allow on error
    }
  }

  // Health check
  async ping() {
    if (!this.isReady()) return false;

    try {
      const response = await this.client.ping();
      return response === 'PONG';
    } catch (error) {
      console.error('Redis ping error:', error);
      return false;
    }
  }

  // Utility methods
  isReady() {
    return this.client && this.isConnected;
  }

  getClient() {
    return this.isReady() ? this.client : null;
  }

  // Clean up expired data
  async cleanup() {
    if (!this.isReady()) return;

    try {
      // Clean up old messages
      const messageCount = await this.client.lLen('chat:messages');
      if (messageCount > 200) {
        await this.client.lTrim('chat:messages', 0, 99);
      }

      // Clean up expired rate limit keys
      const keys = await this.client.keys('ratelimit:*');
      if (keys.length > 1000) {
        console.log('Cleaning up old rate limit keys...');
        // Let Redis handle TTL cleanup automatically
      }

    } catch (error) {
      console.error('Redis cleanup error:', error);
    }
  }
}

// Create singleton instance
const redisManager = new RedisManager();

// Auto-connect on import
redisManager.connect().catch(err => {
  console.log('Redis auto-connect failed, will use fallback storage');
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down Redis connection...');
  await redisManager.disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Shutting down Redis connection...');
  await redisManager.disconnect();
  process.exit(0);
});

module.exports = redisManager;
