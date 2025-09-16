import CryptoJS from 'crypto-js';

// Simple client-side encryption for demo purposes
// In production, you'd want to use proper end-to-end encryption like Signal Protocol

class SimpleEncryption {
  constructor() {
    // Generate or retrieve session key
    this.sessionKey = this.getOrCreateSessionKey();
  }

  getOrCreateSessionKey() {
    let key = sessionStorage.getItem('anon_chat_session_key');
    if (!key) {
      // Generate a random session key
      key = CryptoJS.lib.WordArray.random(256/8).toString();
      sessionStorage.setItem('anon_chat_session_key', key);
    }
    return key;
  }

  encrypt(message) {
    try {
      const encrypted = CryptoJS.AES.encrypt(message, this.sessionKey).toString();
      return {
        success: true,
        data: encrypted
      };
    } catch (error) {
      console.error('Encryption failed:', error);
      return {
        success: false,
        error: 'Encryption failed'
      };
    }
  }

  decrypt(encryptedMessage) {
    try {
      const decrypted = CryptoJS.AES.decrypt(encryptedMessage, this.sessionKey);
      const decryptedText = decrypted.toString(CryptoJS.enc.Utf8);
      
      if (!decryptedText) {
        throw new Error('Decryption resulted in empty string');
      }

      return {
        success: true,
        data: decryptedText
      };
    } catch (error) {
      console.error('Decryption failed:', error);
      return {
        success: false,
        error: 'Decryption failed'
      };
    }
  }

  // Generate a hash of the message for integrity checking
  generateHash(message) {
    return CryptoJS.SHA256(message).toString();
  }

  // Verify message integrity
  verifyHash(message, hash) {
    const computedHash = this.generateHash(message);
    return computedHash === hash;
  }

  // Clear session key (logout)
  clearSession() {
    sessionStorage.removeItem('anon_chat_session_key');
    this.sessionKey = this.getOrCreateSessionKey();
  }

  // Get encryption status
  isReady() {
    return !!this.sessionKey;
  }
}

// Utility functions for message processing
export const encryptionUtils = {
  // Process message before sending
  processOutgoingMessage: (message, shouldEncrypt = false) => {
    if (!shouldEncrypt) {
      return {
        content: message,
        encrypted: false
      };
    }

    const encryption = new SimpleEncryption();
    const result = encryption.encrypt(message);
    
    if (result.success) {
      return {
        content: result.data,
        encrypted: true,
        hash: encryption.generateHash(message)
      };
    } else {
      // Fallback to unencrypted if encryption fails
      console.warn('Encryption failed, sending unencrypted message');
      return {
        content: message,
        encrypted: false
      };
    }
  },

  // Process received message
  processIncomingMessage: (messageData) => {
    if (!messageData.encrypted) {
      return {
        ...messageData,
        content: messageData.content
      };
    }

    const encryption = new SimpleEncryption();
    const result = encryption.decrypt(messageData.content);
    
    if (result.success) {
      // Verify hash if present
      if (messageData.hash) {
        const isValid = encryption.verifyHash(result.data, messageData.hash);
        if (!isValid) {
          console.warn('Message hash verification failed');
        }
      }

      return {
        ...messageData,
        content: result.data,
        decrypted: true
      };
    } else {
      // Return encrypted message with error indicator
      return {
        ...messageData,
        content: '🔒 [Encrypted message - unable to decrypt]',
        decryptionError: true
      };
    }
  },

  // Generate random encryption key for sharing
  generateShareableKey: () => {
    return CryptoJS.lib.WordArray.random(256/8).toString();
  },

  // Set shared encryption key
  setSharedKey: (key) => {
    if (key && key.length >= 32) {
      sessionStorage.setItem('anon_chat_session_key', key);
      return true;
    }
    return false;
  },

  // Get current session key (for sharing)
  getCurrentKey: () => {
    return sessionStorage.getItem('anon_chat_session_key');
  },

  // Clear all encryption data
  clearAll: () => {
    const encryption = new SimpleEncryption();
    encryption.clearSession();
  }
};

// Export encryption class for direct usage
export { SimpleEncryption };

// Default export
export default encryptionUtils;
