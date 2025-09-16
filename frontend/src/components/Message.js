import React, { useState } from 'react';
import { Lock, Copy, Reply, MoreVertical } from 'lucide-react';

const Message = ({ message, isEncrypted }) => {
  const [showActions, setShowActions] = useState(false);
  const [copied, setCopied] = useState(false);

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInHours = (now - date) / (1000 * 60 * 60);

    if (diffInHours < 24) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  const copyMessage = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy message:', err);
    }
  };

  const getMessageId = () => {
    return message.userId.slice(-4).toUpperCase();
  };

  const isSystemMessage = message.userId === 'System';
  const isLongMessage = message.content.length > 200;

  return (
    <div 
      className={`message-wrapper ${isSystemMessage ? 'system-message' : ''}`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <div 
        className="user-avatar"
        style={{ backgroundColor: message.color }}
        title={message.userId}
      >
        {isSystemMessage ? '🤖' : getMessageId()}
      </div>
      
      <div className="message-content">
        <div className="message-header">
          <span className="username" style={{ color: message.color }}>
            {message.userId}
          </span>
          <span className="timestamp" title={new Date(message.timestamp).toLocaleString()}>
            {formatTime(message.timestamp)}
          </span>
          {(message.encrypted || isEncrypted) && (
            <Lock size={12} className="text-green" title="Encrypted message" />
          )}
          {showActions && !isSystemMessage && (
            <div className="message-actions">
              <button 
                onClick={copyMessage} 
                className="action-button"
                title={copied ? "Copied!" : "Copy message"}
              >
                <Copy size={14} />
              </button>
            </div>
          )}
        </div>
        
        <div className={`message-text ${isLongMessage ? 'long-message' : ''}`}>
          {message.content.split('\n').map((line, index) => (
            <React.Fragment key={index}>
              {line}
              {index < message.content.split('\n').length - 1 && <br />}
            </React.Fragment>
          ))}
        </div>
        
        {copied && (
          <div className="copy-notification">
            Message copied to clipboard!
          </div>
        )}
      </div>
    </div>
  );
};

export default Message;
