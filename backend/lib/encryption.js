const crypto = require('crypto');

class ServerEncryption {
  constructor() {
    // Use environment variable or generate a server key
    this.serverKey = process.env.SERVER_ENCRYPTION_KEY || this.generateKey();
    this.algorithm = 'aes-256-gcm';
  }

  generateKey() {
    return crypto.randomBytes(32).toString('hex');
  }

  // Encrypt sensitive server data (not user messages - those are client-side encrypted)
  encryptServerData(data) {
    try {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipher(this.algorithm, this.serverKey);
      cipher.setAAD(Buffer.from('server-data'));
      
      let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const authTag = cipher.getAuthTag();
      
      return {
        success: true,
        data: {
          encrypted,
          iv: iv.toString('hex'),
          authTag: authTag.toString('hex')
        }
      };
    } catch (error) {
      console.error('Server encryption failed:', error);
      return {
        success: false,
        error: 'Encryption failed'
      };
    }
  }

  decryptServerData(encryptedData) {
    try {
      const { encrypted, iv, authTag } = encryptedData;
      
      const decipher = crypto.createDecipher(this.algorithm, this.serverKey);
      decipher.setAAD(Buffer.from('server-data'));
      decipher.setAuthTag(Buffer.from(authTag, 'hex'));
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return {
        success: true,
        data: JSON.parse(decrypted)
      };
    } catch (error) {
      console.error('Server decryption failed:', error);
      return {
        success: false,
        error: 'Decryption failed'
      };
    }
  }

  // Hash functions for data integrity
  hashData(data) {
    return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
  }

  verifyHash(data, hash) {
    const computedHash = this.hashData(data);
    return computedHash === hash;
  }

  // Generate secure tokens for sessions
  generateToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  generateUserId() {
    const adjectives = [
      'Anonymous', 'Hidden', 'Secret', 'Mystery', 'Ghost', 'Shadow', 'Phantom',
      'Cipher', 'Stealth', 'Covert', 'Masked', 'Veiled', 'Obscured', 'Unknown'
    ];
    
    const randomBytes = crypto.randomBytes(2);
    const numbers = randomBytes.readUInt16BE(0).toString().padStart(5, '0');
    const adjective = adjectives[randomBytes[0] % adjectives.length];
    
    return `${adjective}${numbers}`;
  }

  // Generate secure color for users
  generateUserColor() {
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', 
      '#DDA0DD', '#98D8C8', '#F39C12', '#E74C3C', '#9B59B6',
      '#3498DB', '#1ABC9C', '#2ECC71', '#F1C40F', '#E67E22',
      '#8E44AD', '#2C3E50', '#16A085', '#27AE60', '#D35400'
    ];
    
    const randomIndex = crypto.randomBytes(1)[0] % colors.length;
    return colors[randomIndex];
  }

  // Sanitize user input
  sanitizeInput(input) {
    if (typeof input !== 'string') return '';
    
    return input
      .trim()
      .substring(0, 1000) // Limit length
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove scripts
      .replace(/<[^>]*>?/gm, '') // Remove HTML tags
      .replace(/javascript:/gi, '') // Remove javascript: urls
      .replace(/on\w+\s*=\s*["\'][^"\']*["\']|on\w+\s*=\s*\w+/gi, ''); // Remove event handlers
  }

  // Rate limiting token bucket
  createRateLimitBucket(maxTokens = 30, refillRate = 1) {
    return {
      tokens: maxTokens,
      maxTokens,
      refillRate,
      lastRefill: Date.now(),
      
      consume: function(tokens = 1) {
        const now = Date.now();
        const timePassed = (now - this.lastRefill) / 1000;
        
        // Refill tokens
        this.tokens = Math.min(
          this.maxTokens,
          this.tokens + (timePassed * this.refillRate)
        );
        this.lastRefill = now;
        
        if (this.tokens >= tokens) {
          this.tokens -= tokens;
          return true;
        }
        
        return false;
      }
    };
  }

  // Message validation
  validateMessage(message) {
    if (!message || typeof message !== 'object') {
      return { valid: false, error: 'Invalid message format' };
    }

    const { content, type } = message;

    if (!content || typeof content !== 'string') {
      return { valid: false, error: 'Message content is required' };
    }

    if (content.length === 0 || content.length > 1000) {
      return { valid: false, error: 'Message content length invalid' };
    }

    if (!type || typeof type !== 'string') {
      return { valid: false, error: 'Message type is required' };
    }

    // Sanitize content
    const sanitizedContent = this.sanitizeInput(content);
    if (sanitizedContent.length === 0) {
      return { valid: false, error: 'Message content is empty after sanitization' };
    }

    return {
      valid: true,
      sanitized: {
        ...message,
        content: sanitizedContent
      }
    };
  }

  // IP address hashing for privacy
  hashIP(ip) {
    // Hash IP for privacy while maintaining some uniqueness for rate limiting
    const hash = crypto.createHash('sha256');
    hash.update(ip + (process.env.IP_SALT || 'default-salt'));
    return hash.digest('hex').substring(0, 16);
  }

  // Generate message ID
  generateMessageId() {
    const timestamp = Date.now().toString();
    const random = crypto.randomBytes(8).toString('hex');
    return `${timestamp}-${random}`;
  }

  // Verify message integrity
  verifyMessageIntegrity(message) {
    if (!message.hash) return true; // No hash to verify

    const { hash, ...messageWithoutHash } = message;
    const computedHash = this.hashData(messageWithoutHash);
    
    return computedHash === hash;
  }

  // Sign message (server signature for authenticity)
  signMessage(message) {
    try {
      const messageStr = JSON.stringify(message);
      const signature = crypto
        .createHmac('sha256', this.serverKey)
        .update(messageStr)
        .digest('hex');
      
      return {
        ...message,
        serverSignature: signature
      };
    } catch (error) {
      console.error('Message signing failed:', error);
      return message;
    }
  }

  verifyMessageSignature(message) {
    if (!message.serverSignature) return true; // No signature to verify

    try {
      const { serverSignature, ...messageWithoutSig } = message;
      const messageStr = JSON.stringify(messageWithoutSig);
      const expectedSignature = crypto
        .createHmac('sha256', this.serverKey)
        .update(messageStr)
        .digest('hex');
      
      return expectedSignature === serverSignature;
    } catch (error) {
      console.error('Message signature verification failed:', error);
      return false;
    }
  }
}

// Export singleton instance
module.exports = new ServerEncryption();
