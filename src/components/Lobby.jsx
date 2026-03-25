import { useState } from 'react';

const generateRoomId = () =>
  Math.random().toString(36).substring(2, 8).toUpperCase();

export default function Lobby({ onCreateRoom, onJoinRoom }) {
  const [roomId, setRoomId] = useState('');
  const [mode, setMode] = useState(null);
  const [generatedId, setGeneratedId] = useState('');
  const [copied, setCopied] = useState(false);

  const handleCreate = () => {
    const id = generateRoomId();
    setGeneratedId(id);
    setMode('create');
    onCreateRoom(id);
  };

  const handleJoin = () => {
    if (!roomId.trim()) return;
    onJoinRoom(roomId.trim().toUpperCase());
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(generatedId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: select the text
    }
  };

  return (
    <div className="lobby-container">
      <div className="bg-orb bg-orb-1"></div>
      <div className="bg-orb bg-orb-2"></div>
      <div className="bg-orb bg-orb-3"></div>

      <div className="lobby-card">
        <div className="lobby-header">
          <h1>Strokelink</h1>
          <p className="subtitle">Real-time P2P Collaborative Whiteboard</p>
        </div>

        {!mode && (
          <div className="lobby-actions">
            <button className="btn btn-primary" onClick={handleCreate} id="create-room-btn">
              <span className="btn-icon">+</span>
              Create New Room
            </button>

            <div className="divider">
              <span>or join existing</span>
            </div>

            <div className="join-group">
              <input
                id="room-id-input"
                type="text"
                placeholder="Enter Room ID"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                maxLength={6}
                autoComplete="off"
                spellCheck={false}
              />
              <button
                className="btn btn-secondary"
                onClick={handleJoin}
                disabled={!roomId.trim()}
                id="join-room-btn"
              >
                Join
              </button>
            </div>
          </div>
        )}

        {mode === 'create' && (
          <div className="lobby-waiting">
            <p className="waiting-label">Room ID</p>
            <div className="room-id-display" id="room-id-display">
              {generatedId}
            </div>
            <button
              className={`copy-btn ${copied ? 'copied' : ''}`}
              onClick={handleCopy}
              id="copy-room-id"
            >
              {copied ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Copied
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  Copy to Clipboard
                </>
              )}
            </button>
            <p className="waiting-hint">
              Share this ID with your partner to start collaborating
            </p>
            <div className="pulse-loader">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        )}
      </div>

      <p className="footer-text">
        Powered by WebRTC · Zero server latency
      </p>
    </div>
  );
}
