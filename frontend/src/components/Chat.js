import React, { useRef, useEffect } from 'react';
import Message from './Message';

const Chat = ({ messages, isEncrypted }) => {
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  return (
    <div className="messages-container">
      {messages.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">💬</div>
          <h3>No messages yet</h3>
          <p>Be the first to start the conversation!</p>
        </div>
      ) : (
        messages.map((message) => (
          <Message 
            key={message.id} 
            message={message} 
            isEncrypted={isEncrypted}
          />
        ))
      )}
      <div ref={messagesEndRef} />
    </div>
  );
};

export default Chat;
