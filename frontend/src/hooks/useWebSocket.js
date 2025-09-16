import { useState, useEffect, useRef, useCallback } from 'react';

const useWebSocket = (url) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);
  const [messages, setMessages] = useState([]);
  const [userCount, setUserCount] = useState(0);
  const [userId, setUserId] = useState('');
  const [userColor, setUserColor] = useState('#FF6B6B');

  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  const pingIntervalRef = useRef(null);

  // Message handlers
  const handleWebSocketMessage = useCallback((data) => {
    switch (data.type) {
      case 'init':
        setUserId(data.userId);
        setUserColor(data.color);
        if (data.messages && Array.isArray(data.messages)) {
          setMessages(data.messages);
        }
        break;

      case 'newMessage':
        if (data.message) {
          setMessages(prev => [...prev, data.message]);
        }
        break;

      case 'userCount':
        setUserCount(data.count || 0);
        break;

      case 'pong':
        // Handle ping response - connection is alive
        break;

      case 'error':
        setError(data.message || 'Unknown error occurred');
        break;

      default:
        console.log('Unknown message type:', data.type);
    }
  }, []);

  // Connection management
  const connect = useCallback(() => {
    if (isConnecting || (wsRef.current && wsRef.current.readyState === WebSocket.OPEN)) {
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      // For development/demo, use mock connection
      if (process.env.NODE_ENV === 'development' && !url.startsWith('ws')) {
        initializeMockConnection();
        return;
      }

      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true);
        setIsConnecting(false);
        setError(null);
        reconnectAttempts.current = 0;

        // Start ping interval
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 30000); // Ping every 30 seconds
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleWebSocketMessage(data);
        } catch (err) {
          console.error('Error parsing WebSocket message:', err);
          setError('Failed to parse server message');
        }
      };

      ws.onclose = (event) => {
        console.log('WebSocket disconnected:', event.code, event.reason);
        setIsConnected(false);
        setIsConnecting(false);
        wsRef.current = null;

        // Clear ping interval
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = null;
        }

        // Attempt reconnection if not a manual close
        if (event.code !== 1000 && reconnectAttempts.current < maxReconnectAttempts) {
          scheduleReconnect();
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setError('Connection error occurred');
        setIsConnected(false);
      };

    } catch (err) {
      console.error('WebSocket connection failed:', err);
      setIsConnecting(false);
      setError('Failed to establish connection');
      scheduleReconnect();
    }
  }, [url, handleWebSocketMessage, isConnecting]);

  // Mock connection for development
  const initializeMockConnection = useCallback(() => {
    const mockUserId = 'Demo' + Math.floor(Math.random() * 1000);
    const mockColor = '#' + Math.floor(Math.random()*16777215).toString(16);
    
    setUserId(mockUserId);
    setUserColor(mockColor);
    setIsConnected(true);
    setIsConnecting(false);
    setUserCount(Math.floor(Math.random() * 20) + 5);

    // Add demo messages
    const demoMessages = [
      {
        id: 1,
        content: "🎉 Welcome to AnonChat! This is a demo version.",
        timestamp: new Date(Date.now() - 300000).toISOString(),
        userId: "System",
        color: "#10B981",
        encrypted: true
      },
      {
        id: 2,
        content: "Messages are end-to-end encrypted by default 🔒",
        timestamp: new Date(Date.now() - 200000).toISOString(),
        userId: "Anonymous1337",
        color: "#3B82F6",
        encrypted: true
      },
      {
        id: 3,
        content: "No registration required - just start chatting! 💬",
        timestamp: new Date(Date.now() - 100000).toISOString(),
        userId: "GhostUser",
        color: "#8B5CF6",
        encrypted: true
      }
    ];
    
    setMessages(demoMessages);

    // Create mock WebSocket object
    wsRef.current = {
      readyState: WebSocket.OPEN,
      send: (data) => {
        const parsed = JSON.parse(data);
        if (parsed.type === 'message') {
          const newMessage = {
            id: Date.now(),
            content: parsed.content,
            timestamp: new Date().toISOString(),
            userId: mockUserId,
            color: mockColor,
            encrypted: parsed.encrypted || false
          };
          setMessages(prev => [...prev, newMessage]);
        }
      },
      close: () => {},
    };
  }, []);

  // Reconnection logic
  const scheduleReconnect = useCallback(() => {
    if (reconnectAttempts.current >= maxReconnectAttempts) {
      setError('Max reconnection attempts reached');
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
    reconnectAttempts.current++;

    console.log(`Scheduling reconnection attempt ${reconnectAttempts.current} in ${delay}ms`);

    reconnectTimeoutRef.current = setTimeout(() => {
      connect();
    }, delay);
  }, [connect]);

  // Send message function
  const sendMessage = useCallback((content, encrypted = false) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && content.trim()) {
      const message = {
        type: 'message',
        content: content.trim(),
        encrypted
      };

      wsRef.current.send(JSON.stringify(message));
      return true;
    }
    return false;
  }, []);

  // Manual disconnect
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
    }

    if (wsRef.current) {
      wsRef.current.close(1000, 'Manual disconnect');
    }

    setIsConnected(false);
    setIsConnecting(false);
  }, []);

  // Initialize connection
  useEffect(() => {
    connect();

    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  return {
    isConnected,
    isConnecting,
    error,
    messages,
    userCount,
    userId,
    userColor,
    sendMessage,
    connect,
    disconnect,
    reconnectAttempts: reconnectAttempts.current,
    maxReconnectAttempts
  };
};

export default useWebSocket;
