const { createClient } = require('redis');

// Rate limiting
const rateLimitMap = new Map();

function rateLimit(ip, maxRequests = 30, windowMs = 60000) {
  const now = Date.now();
  const windowStart = now - windowMs;
  
  if (!rateLimitMap.has(ip)) {
    rateLimitMap.set(ip, []);
  }
  
  const requests = rateLimitMap.get(ip);
  const validRequests = requests.filter(time => time > windowStart);
  
  if (validRequests.length >= maxRequests) {
    return false;
  }
  
  validRequests.push(now);
  rateLimitMap.set(ip, validRequests);
  return true;
}

// Redis client setup
let redisClient;
try {
  redisClient = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379'
  });
  redisClient.connect().catch(console.error);
} catch (error) {
  console.log('Redis not available');
}

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Rate limiting
  const clientIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown';
  if (!rateLimit(clientIP)) {
    return res.status(429).json({ error: 'Rate limit exceeded' });
  }

  if (req.method === 'GET') {
    try {
      let messages = [];
      
      if (redisClient && redisClient.isReady) {
        const msgs = await redisClient.lRange('chat:messages', 0, 49); // Last 50 messages
        messages = msgs.map(msg => JSON.parse(msg)).reverse();
      }

      res.status(200).json({
        messages,
        count: messages.length
      });
    } catch (error) {
      console.error('Error fetching messages:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
};
