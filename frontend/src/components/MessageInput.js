import React, { useState, useRef, useEffect } from 'react';
import { Send, Smile, Paperclip, Hash, Shield } from 'lucide-react';

const MessageInput = ({ 
  currentMessage, 
  setCurrentMessage, 
  sendMessage, 
  userColor, 
  userId, 
  isConnected, 
  isEncrypted 
}) => {
  const [isTyping, setIsTyping] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const textareaRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [currentMessage]);

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleInputChange = (e) => {
    setCurrentMessage(e.target.value);
    
    // Typing indicator logic
    if (!isTyping && e.target.value.length > 0) {
      setIsTyping(true);
    }
    
    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    // Set new timeout
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
    }, 1000);
  };

  const handleSendMessage = () => {
    if (currentMessage.trim() && isConnected) {
      sendMessage();
      setIsTyping(false);
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    }
  };

  const insertEmoji = (emoji) => {
    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    
    const newMessage = currentMessage.slice(0, start) + emoji + currentMessage.slice(end);
    setCurrentMessage(newMessage);
    
    // Reset cursor position
    setTimeout(() => {
      textarea.selectionStart = textarea.selectionEnd = start + emoji.length;
      textarea.focus();
    }, 0);
    
    setShowEmojiPicker(false);
  };

  const commonEmojis = ['😀', '😂', '🤔', '👍', '❤️', '🔥', '💯', '👀', '🎉', '😎'];

  const getCharacterCount = () => {
    return currentMessage.length;
  };

  const isNearLimit = getCharacterCount() > 900;
  const isAtLimit = getCharacterCount() >= 1000;

  return (
    <div className="input-container">
      <div className="input-wrapper">
        <div 
          className="user-avatar small"
          style={{ backgroundColor: userColor }}
          title={userId}
        >
          {userId.slice(-3).toUpperCase()}
        </div>
        
        <div className="input-area">
          <div className="input-tools">
            <button 
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className="tool-button"
              title="Add emoji"
            >
              <Smile size={16} />
            </button>
            
            {showEmojiPicker && (
              <div className="emoji-picker">
                {commonEmojis.map((emoji, index) => (
                  <button
                    key={index}
                    onClick={() => insertEmoji(emoji)}
                    className="emoji-button"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>
          
          <textarea
            ref={textareaRef}
            value={currentMessage}
            onChange={handleInputChange}
            onKeyPress={handleKeyPress}
            placeholder={
              isConnected 
                ? "Type your anonymous message..." 
                : "Connecting..."
            }
            className={`message-input ${isAtLimit ? 'at-limit' : isNearLimit ? 'near-limit' : ''}`}
            rows={1}
            maxLength={1000}
            disabled={!isConnected}
          />
          
          <button
            onClick={handleSendMessage}
            disabled={!currentMessage.trim() || !isConnected || isAtLimit}
            className="send-button"
            title="Send message (Enter)"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
      
      {/* Status Bar */}
      <div className="status-bar">
        <div className="status-left">
          <span className="channel">
            <Hash size={12} />
            general
          </span>
          
          {isTyping && (
            <span className="typing-indicator">
              <span className="typing-dots">
                <span></span>
                <span></span>
                <span></span>
              </span>
              typing...
            </span>
          )}
        </div>
        
        <div className="status-right">
          {(isNearLimit || isAtLimit) && (
            <span className={`char-count ${isAtLimit ? 'at-limit' : 'near-limit'}`}>
              {getCharacterCount()}/1000
            </span>
          )}
          
          {isEncrypted && (
            <div className="encryption-status">
              <Shield size={12} />
              <span>Encrypted</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MessageInput;
