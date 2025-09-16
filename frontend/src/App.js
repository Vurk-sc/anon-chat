return (
    <div className="app">
      {/* Header */}
      <div className="header">
        <div className="header-left">
          <div className="app-icon">
            <MessageSquare size={20} />
          </div>
          <div>
            <h1 className="app-title">AnonChat</h1>
            <p className="app-subtitle">No registration • End-to-end encrypted</p>
          </div>
        </div>
        
        <div className="header-right">
          <div className={`status-badge ${status.class}`}>
            <StatusIcon size={16} />
            <span>{status.text}</span>
          </div>
          <div className="user-count">
            <Users size={16} />
            <span>{userCount}</span>
          </div>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="icon-button"
            title="Settings"
          >
            <Settings size={20} />
          </button>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="settings-panel">
          <div className="setting-item">
            <div className="setting-left">
              <Shield className={isEncrypted ? "text-green" : "text-red"} size={20} />
              <span>End-to-End Encryption</span>
            </div>
            <button
              onClick={() => setIsEncrypted(!isEncrypted)}
              className={`toggle ${isEncrypted ? 'active' : ''}`}
              title={`Turn encryption ${isEncrypted ? 'off' : 'on'}`}
            >
              <div className="toggle-thumb" />
            </button>
          </div>
          
          {error && (
            <div className="error-message">
              <span>⚠️ {error}</span>
              {reconnectAttempts < maxReconnectAttempts && (
                <span className="reconnect-info">
                  Reconnecting... ({reconnectAttempts}/{maxReconnectAttempts})
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Chat Messages */}
      <Chat messages={messages} isEncrypted={isEncrypted} />

      {/* Message Input */}
      <MessageInput
        currentMessage={currentMessage}
        setCurrentMessage={setCurrentMessage}
        sendMessage={handleSendMessage}
        userColor={userColor}
        userId={userId}
        isConnected={isConnected}
        isEncrypted={isEncrypted}
      />
    </div>
  );
}

export default App;import React, { useState } from 'react';
import { Shield, Users, Settings, MessageSquare, Wifi, WifiOff } from 'lucide-react';
import Chat from './components/Chat';
import MessageInput from './components/MessageInput';
import useWebSocket from './hooks/useWebSocket';
import './App.css';

const WS_URL = process.env.REACT_APP_WS_URL || 'wss://your-vercel-backend.vercel.app/socket';

function App() {
  const [currentMessage, setCurrentMessage] = useState('');
  const [isEncrypted, setIsEncrypted] = useState(true);
  const [showSettings, setShowSettings] = useState(false);

  const {
    isConnected,
    isConnecting,
    error,
    messages,
    userCount,
    userId,
    userColor,
    sendMessage,
    reconnectAttempts,
    maxReconnectAttempts
  } = useWebSocket(WS_URL);

  const handleSendMessage = () => {
    if (currentMessage.trim()) {
      const success = sendMessage(currentMessage, isEncrypted);
      if (success) {
        setCurrentMessage('');
      }
    }
  };

  const getConnectionStatus = () => {
    if (isConnecting) return { icon: WifiOff, text: 'Connecting...', class: 'connecting' };
    if (isConnected) return { icon: Wifi, text: 'Connected', class: 'connected' };
    if (error) return { icon: WifiOff, text: 'Error', class: 'error' };
    return { icon: WifiOff, text: 'Disconnected', class: 'disconnected' };
  };

  const status = getConnectionStatus();
  const StatusIcon = status.icon;

  return (
    <div className="app">
      {/* Header */}
      <div className="header">
        <div className="header-left">
          <div className="app-icon">
            <MessageSquare size={20} />
          </div>
          <div>
            <h1 className="app-title">AnonChat</h1>
            <p className="app-subtitle">No registration • End-to-end encrypted</p>
          </div>
        </div>
        
        <div className="header-right">
          <div className="status-badge">
            {isConnected ? <Wifi size={16} /> : <WifiOff size={16} />}
            <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
          </div>
          <div className="user-count">
            <Users size={16} />
            <span>{userCount}</span>
          </div>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="icon-button"
          >
            <Settings size={20} />
          </button>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="settings-panel">
          <div className="setting-item">
            <div className="setting-left">
              <Shield className={isEncrypted ? "text-green" : "text-red"} size={20} />
              <span>End-to-End Encryption</span>
            </div>
            <button
              onClick={() => setIsEncrypted(!isEncrypted)}
              className={`toggle ${isEncrypted ? 'active' : ''}`}
            >
              <div className="toggle-thumb" />
            </button>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="messages-container">
        {messages.map((message) => (
          <div key={message.id} className="message-wrapper">
            <div 
              className="user-avatar"
              style={{ backgroundColor: message.color }}
            >
              {message.userId.slice(-3).toUpperCase()}
            </div>
            <div className="message-content">
              <div className="message-header">
                <span className="username" style={{ color: message.color }}>
                  {message.userId}
                </span>
                <span className="timestamp">{formatTime(message.timestamp)}</span>
                {message.encrypted && <Lock size={12} className="text-green" />}
              </div>
              <p className="message-text">{message.content}</p>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Message Input */}
      <div className="input-container">
        <div className="input-wrapper">
          <div 
            className="user-avatar small"
            style={{ backgroundColor: userColor }}
          >
            {userId.slice(-3).toUpperCase()}
          </div>
          <div className="input-area">
            <textarea
              value={currentMessage}
              onChange={(e) => setCurrentMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type your anonymous message..."
              className="message-input"
              rows={1}
            />
            <button
              onClick={sendMessage}
              disabled={!currentMessage.trim() || !isConnected}
              className="send-button"
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
          </div>
          {isEncrypted && (
            <div className="encryption-status">
              <Shield size={12} />
              <span>Messages encrypted</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
