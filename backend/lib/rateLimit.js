const redisManager = require('./redis');

class RateLimit {
  constructor() {
    this.inMemoryStore = new Map();
    this.cleanupInterval = null;
    this.startCleanupTimer();
  }

  // Main rate limiting function
  async checkLimit(identifier, options = {}) {
    const {
      maxRequests = 30,
      windowMs = 60000,
      skipSuccessfulRequests = false,
      skipFailedRequests = false
    } = options;

    const windowSeconds = Math.floor(windowMs / 1000);
    
    // Try Redis first, fallback to in-memory
    if (redisManager.isReady()) {
      return this.checkRedisLimit(identifier, maxRequests, windowSeconds);
    } else {
      return this.checkMemoryLimit(identifier, maxRequests, windowMs);
    }
  }

  // Redis-based rate limiting
  async checkRedisLimit(identifier, maxRequests, windowSeconds) {
    try {
      const key = `ratelimit:${identifier}`;
      const client = redisManager.getClient();
      
      if (!client) {
        return this.checkMemoryLimit(identifier, maxRequests, windowSeconds * 1000);
      }

      // Use Redis sliding window with sorted sets
      const now = Date.now();
      const windowStart = now - (windowSeconds * 1000);

      // Remove old entries
      await client.zRemRangeByScore(key, 0, windowStart);

      // Count current requests
      const currentRequests = await client.zCard(key);

      if (currentRequests >= maxRequests) {
        // Get TTL for reset time
        const ttl = await client.ttl(key);
        return {
          allowed: false,
          remaining: 0,
          resetTime: new Date(now + (ttl * 1000)),
          totalHits: currentRequests
        };
      }

      // Add current request
      await client.zAdd(key, {
        score: now,
        value: `${now}-${Math.random()}`
      });

      // Set expiration
      await client.expire(key, windowSeconds);

      return {
        allowed: true,
        remaining: maxRequests - currentRequests - 1,
        resetTime: new Date(now + (windowSeconds * 1000)),
        totalHits: currentRequests + 1
      };

    } catch (error) {
      console.error('Redis rate limit error:', error);
      return this.checkMemoryLimit(identifier, maxRequests, windowSeconds * 1000);
    }
  }

  // In-memory rate limiting (fallback)
  checkMemoryLimit(identifier, maxRequests, windowMs) {
    const now = Date.now();
    const windowStart = now - windowMs;

    if (!this.inMemoryStore.has(identifier)) {
      this.inMemoryStore.set(identifier, []);
    }

    const requests = this.inMemoryStore.get(identifier);
    
    // Remove old requests
    const validRequests = requests.filter(timestamp => timestamp > windowStart);
    this.inMemoryStore.set(identifier, validRequests);

    if (validRequests.length >= maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: new Date(validRequests[0] + windowMs),
        totalHits: validRequests.length
      };
    }

    // Add current request
    validRequests.push(now);
    this.inMemoryStore.set(identifier, validRequests);

    return {
      allowed: true,
      remaining: maxRequests - validRequests.length,
      resetTime: new Date(now + windowMs),
      totalHits: validRequests.length
    };
  }

  // Message-specific rate limiting
  async checkMessageLimit(identifier, options = {}) {
    return this.checkLimit(`msg:${identifier}`, {
      maxRequests: 20, // 20 messages per minute
      windowMs: 60000,
      ...options
    });
  }

  // Connection rate limiting
  async checkConnectionLimit(identifier, options = {}) {
    return this.checkLimit(`conn:${identifier}`, {
      maxRequests: 5, // 5 connection attempts per minute
      windowMs: 60000,
      ...options
    });
  }

  // API endpoint rate limiting
  async checkAPILimit(identifier, endpoint, options = {}) {
    return this.checkLimit(`api:${endpoint}:${identifier}`, {
      maxRequests: 100, // 100 API calls per minute
      windowMs: 60000,
      ...options
    });
  }

  // Burst protection (short-term high rate limiting)
  async checkBurstLimit(identifier, options = {}) {
    return this.checkLimit(`burst:${identifier}`, {
      maxRequests: 5, // 5 requests per 10 seconds
      windowMs: 10000,
      ...options
    });
  }

  // WebSocket connection rate limiting
  async checkWebSocketLimit(identifier, options = {}) {
    return this.checkLimit(`ws:${identifier}`, {
      maxRequests: 10, // 10 WebSocket messages per 30 seconds
      windowMs: 30000,
      ...options
    });
  }

  // Advanced: Adaptive rate limiting based on server load
  async checkAdaptiveLimit(identifier, serverLoad = 0.5, options = {}) {
    const baseMaxRequests = options.maxRequests || 30;
    
    // Reduce allowed requests when server load is high
    let adaptiveMax = baseMaxRequests;
    if (serverLoad > 0.8) {
      adaptiveMax = Math.floor(baseMaxRequests * 0.3); // Severe throttling
    } else if (serverLoad > 0.6) {
      adaptiveMax = Math.floor(baseMaxRequests * 0.6); // Moderate throttling
    } else if (serverLoad > 0.4) {
      adaptiveMax = Math.floor(baseMaxRequests * 0.8); // Light throttling
    }

    return this.checkLimit(`adaptive:${identifier}`, {
      ...options,
      maxRequests: adaptiveMax
    });
  }

  // Clean up old in-memory data
  startCleanupTimer() {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      const fiveMinutesAgo = now - (5 * 60 * 1000);

      for (const [key, requests] of this.inMemoryStore.entries()) {
        const validRequests = requests.filter(timestamp => timestamp > fiveMinutesAgo);
        
        if (validRequests.length === 0) {
          this.inMemoryStore.delete(key);
        } else {
          this.inMemoryStore.set(key, validRequests);
        }
      }

      // Log cleanup stats
      if (this.inMemoryStore.size > 100) {
        console.log(`Rate limit cleanup: ${this.inMemoryStore.size} active limiters`);
      }
    }, 5 * 60 * 1000); // Run every 5 minutes
  }

  // Express.js middleware factory
  createMiddleware(options = {}) {
    return async (req, res, next) => {
      try {
        // Get identifier (IP address, user ID, etc.)
        const identifier = options.keyGenerator
          ? options.keyGenerator(req)
          : this.getDefaultIdentifier(req);

        const result = await this.checkLimit(identifier, options);

        // Add rate limit headers
        res.set({
          'X-RateLimit-Limit': options.maxRequests || 30,
          'X-RateLimit-Remaining': result.remaining,
          'X-RateLimit-Reset': result.resetTime.toISOString()
        });

        if (!result.allowed) {
          const retryAfter = Math.ceil((result.resetTime - Date.now()) / 1000);
          res.set('Retry-After', retryAfter);
          
          return res.status(429).json({
            error: 'Too many requests',
            message: 'Rate limit exceeded',
            retryAfter
          });
        }

        next();
      } catch (error) {
        console.error('Rate limit middleware error:', error);
        // Allow request on error to prevent blocking users
        next();
      }
    };
  }

  // Get default identifier for requests
  getDefaultIdentifier(req) {
    // Priority: user ID, forwarded IP, remote IP
    return req.user?.id ||
           req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
           req.connection?.remoteAddress ||
           req.socket?.remoteAddress ||
           'unknown';
  }

  // Reset rate limit for identifier
  async reset(identifier) {
    if (redisManager.isReady()) {
      try {
        const client = redisManager.getClient();
        const keys = await client.keys(`ratelimit:*${identifier}*`);
        if (keys.length > 0) {
          await client.del(keys);
        }
      } catch (error) {
        console.error('Redis reset error:', error);
      }
    }

    // Clean in-memory store
    for (const key of this.inMemoryStore.keys()) {
      if (key.includes(identifier)) {
        this.inMemoryStore.delete(key);
      }
    }
  }

  // Get current status for identifier
  async getStatus(identifier) {
    if (redisManager.isReady()) {
      try {
        const client = redisManager.getClient();
        const key = `ratelimit:${identifier}`;
        const count = await client.zCard(key);
        const ttl = await client.ttl(key);
        
        return {
          currentRequests: count,
          resetTime: ttl > 0 ? new Date(Date.now() + (ttl * 1000)) : null
        };
      } catch (error) {
        console.error('Redis status error:', error);
      }
    }

    // Check in-memory store
    const requests = this.inMemoryStore.get(identifier) || [];
    return {
      currentRequests: requests.length,
      resetTime: requests.length > 0 ? new Date(requests[0] + 60000) : null
    };
  }

  // Cleanup and shutdown
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.inMemoryStore.clear();
  }
}

// Export singleton instance
const rateLimiter = new RateLimit();

// Graceful shutdown
process.on('SIGINT', () => {
  rateLimiter.destroy();
});

process.on('SIGTERM', () => {
  rateLimiter.destroy();
});

module.exports = rateLimiter;
