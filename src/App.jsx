import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import WebRTCManager from './lib/WebRTCManager.js';
import Lobby from './components/Lobby.jsx';
import Whiteboard from './components/Whiteboard.jsx';

const SIGNAL_SERVER = 'http://localhost:3001';

export default function App() {
  const [view, setView] = useState('lobby'); // 'lobby' | 'whiteboard'
  const [roomId, setRoomId] = useState('');
  const [connectionState, setConnectionState] = useState('waiting');
  const [error, setError] = useState('');

  const socketRef = useRef(null);
  const rtcRef = useRef(null);

  // ── Initialize Socket.io ────────────────────────────────────────
  useEffect(() => {
    const socket = io(SIGNAL_SERVER, { autoConnect: false });
    socketRef.current = socket;

    socket.on('connect', () => console.log('[Socket] Connected:', socket.id));
    socket.on('disconnect', () => console.log('[Socket] Disconnected'));
    socket.on('error-msg', ({ message }) => {
      setError(message);
      setTimeout(() => setError(''), 4000);
    });

    return () => {
      socket.disconnect();
      rtcRef.current?.destroy();
    };
  }, []);

  // ── Create WebRTC manager ──────────────────────────────────────
  const createRTCManager = useCallback(() => {
    const mgr = new WebRTCManager({
      onMessage: null, // Whiteboard will set this
      onIceCandidate: (candidate) => {
        socketRef.current?.emit('signal', {
          roomId: roomId || rtcRef.current?._roomId,
          data: { type: 'ice-candidate', candidate },
        });
      },
      onStateChange: (state) => {
        console.log('[RTC] State:', state);
        setConnectionState(state);
      },
    });
    rtcRef.current = mgr;
    return mgr;
  }, [roomId]);

  // ── Room creator flow ─────────────────────────────────────────
  const handleCreateRoom = useCallback(
    (id) => {
      setRoomId(id);
      const socket = socketRef.current;
      socket.connect();

      socket.once('connect', () => {
        socket.emit('create-room', id);
      });

      socket.on('room-created', () => {
        console.log('[Room] Created:', id);
      });

      // When peer joins, I (creator) create the offer
      socket.on('peer-joined', async () => {
        console.log('[Room] Peer joined — creating offer');
        setConnectionState('connecting');

        const mgr = createRTCManager();
        mgr._roomId = id;

        // Send ICE over socket
        mgr._onIceCandidate = (candidate) => {
          socket.emit('signal', {
            roomId: id,
            data: { type: 'ice-candidate', candidate },
          });
        };

        const offer = await mgr.createOffer();
        socket.emit('signal', { roomId: id, data: { type: 'offer', offer } });

        setView('whiteboard');
      });

      // Handle incoming signals (answer + ICE from joiner)
      socket.on('signal', async ({ data }) => {
        const mgr = rtcRef.current;
        if (!mgr) return;

        if (data.type === 'answer') {
          await mgr.handleAnswer(data.answer);
        } else if (data.type === 'ice-candidate') {
          await mgr.addIceCandidate(data.candidate);
        }
      });
    },
    [createRTCManager],
  );

  // ── Room joiner flow ──────────────────────────────────────────
  const handleJoinRoom = useCallback(
    (id) => {
      setRoomId(id);
      const socket = socketRef.current;
      socket.connect();

      socket.once('connect', () => {
        socket.emit('join-room', id);
      });

      socket.on('room-joined', () => {
        console.log('[Room] Joined:', id);
        setConnectionState('connecting');
      });

      // Handle incoming signals (offer + ICE from creator)
      socket.on('signal', async ({ data }) => {
        if (data.type === 'offer') {
          const mgr = createRTCManager();
          mgr._roomId = id;

          mgr._onIceCandidate = (candidate) => {
            socket.emit('signal', {
              roomId: id,
              data: { type: 'ice-candidate', candidate },
            });
          };

          const answer = await mgr.handleOffer(data.offer);
          socket.emit('signal', { roomId: id, data: { type: 'answer', answer } });

          setView('whiteboard');
        } else if (data.type === 'ice-candidate') {
          await rtcRef.current?.addIceCandidate(data.candidate);
        }
      });
    },
    [createRTCManager],
  );

  // ── Handle peer leaving ───────────────────────────────────────
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    const handlePeerLeft = () => {
      console.log('[Room] Peer left');
      setConnectionState('disconnected');
      rtcRef.current?.destroy();
      rtcRef.current = null;
    };

    socket.on('peer-left', handlePeerLeft);
    return () => socket.off('peer-left', handlePeerLeft);
  }, []);

  // ── Leave room ────────────────────────────────────────────────
  const handleLeaveRoom = useCallback(() => {
    rtcRef.current?.destroy();
    rtcRef.current = null;

    const socket = socketRef.current;
    if (socket) {
      socket.removeAllListeners('room-created');
      socket.removeAllListeners('room-joined');
      socket.removeAllListeners('peer-joined');
      socket.removeAllListeners('peer-left');
      socket.removeAllListeners('signal');
      socket.disconnect();
    }

    setView('lobby');
    setRoomId('');
    setConnectionState('waiting');
  }, []);

  return (
    <>
      {error && (
        <div className="error-toast" id="error-toast">
          {error}
        </div>
      )}

      {view === 'lobby' && (
        <Lobby onCreateRoom={handleCreateRoom} onJoinRoom={handleJoinRoom} />
      )}

      {view === 'whiteboard' && (
        <Whiteboard
          webrtcManager={rtcRef.current}
          connectionState={connectionState}
          roomId={roomId}
          onLeaveRoom={handleLeaveRoom}
        />
      )}
    </>
  );
}
