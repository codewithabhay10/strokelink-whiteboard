import { useRef, useEffect, useState, useCallback } from 'react';

const LOCAL_COLOR = '#6d28d9';   // deep violet
const REMOTE_COLOR = '#14b8a6';  // teal

export default function Whiteboard({ webrtcManager, connectionState, roomId, onLeaveRoom }) {
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const isDrawing = useRef(false);
  const lastPoint = useRef(null);
  const remoteQueue = useRef([]);
  const animFrameRef = useRef(null);
  const [brushSize, setBrushSize] = useState(3);
  const [localColor, setLocalColor] = useState(LOCAL_COLOR);
  const remoteCursor = useRef(null);

  // ── Resize canvas to fill container ───────────────────────────────
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Save existing pixels
    const temp = document.createElement('canvas');
    temp.width = canvas.width;
    temp.height = canvas.height;
    temp.getContext('2d').drawImage(canvas, 0, 0);

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Restore
    ctx.drawImage(temp, 0, 0, rect.width, rect.height);
    ctxRef.current = ctx;
  }, []);

  useEffect(() => {
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, [resizeCanvas]);

  // ── Coordinate helpers ────────────────────────────────────────────
  const normalize = (x, y) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: x / rect.width, y: y / rect.height };
  };

  const denormalize = (nx, ny) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: nx * rect.width, y: ny * rect.height };
  };

  const drawLine = (ctx, from, to, color, size) => {
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = size;
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  };

  // ── Process remote drawing queue via rAF ──────────────────────────
  const processRemoteQueue = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx) {
      animFrameRef.current = requestAnimationFrame(processRemoteQueue);
      return;
    }

    while (remoteQueue.current.length > 0) {
      const pkt = remoteQueue.current.shift();

      if (pkt.type === 'clear') {
        const rect = canvasRef.current.getBoundingClientRect();
        ctx.clearRect(0, 0, rect.width, rect.height);
        continue;
      }

      const { x, y } = denormalize(pkt.x, pkt.y);

      if (pkt.type === 'start') {
        remoteCursor.current = { x, y };
      } else if (pkt.type === 'draw' && remoteCursor.current) {
        drawLine(ctx, remoteCursor.current, { x, y }, pkt.color || REMOTE_COLOR, pkt.size || 3);
        remoteCursor.current = { x, y };
      } else if (pkt.type === 'end') {
        remoteCursor.current = null;
      }
    }

    animFrameRef.current = requestAnimationFrame(processRemoteQueue);
  }, []);

  useEffect(() => {
    animFrameRef.current = requestAnimationFrame(processRemoteQueue);
    return () => { if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current); };
  }, [processRemoteQueue]);

  // ── Wire WebRTC messages ──────────────────────────────────────────
  useEffect(() => {
    if (!webrtcManager) return;
    webrtcManager._onMessage = (data) => remoteQueue.current.push(data);
  }, [webrtcManager]);

  // ── Mouse handlers ────────────────────────────────────────────────
  const getMousePos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handleMouseDown = (e) => {
    isDrawing.current = true;
    const pos = getMousePos(e);
    lastPoint.current = pos;
    const norm = normalize(pos.x, pos.y);
    webrtcManager?.send({ type: 'start', x: norm.x, y: norm.y, color: localColor, size: brushSize });
  };

  const handleMouseMove = (e) => {
    if (!isDrawing.current || !ctxRef.current) return;
    const pos = getMousePos(e);
    drawLine(ctxRef.current, lastPoint.current, pos, localColor, brushSize);
    const norm = normalize(pos.x, pos.y);
    webrtcManager?.send({ type: 'draw', x: norm.x, y: norm.y, color: localColor, size: brushSize });
    lastPoint.current = pos;
  };

  const handleMouseUp = () => {
    if (!isDrawing.current) return;
    isDrawing.current = false;
    lastPoint.current = null;
    webrtcManager?.send({ type: 'end' });
  };

  const handleMouseLeave = () => {
    if (isDrawing.current) {
      isDrawing.current = false;
      lastPoint.current = null;
      webrtcManager?.send({ type: 'end' });
    }
  };

  // ── Touch handlers ────────────────────────────────────────────────
  const getTouchPos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const t = e.touches[0];
    return { x: t.clientX - rect.left, y: t.clientY - rect.top };
  };

  const handleTouchStart = (e) => {
    e.preventDefault();
    isDrawing.current = true;
    const pos = getTouchPos(e);
    lastPoint.current = pos;
    const norm = normalize(pos.x, pos.y);
    webrtcManager?.send({ type: 'start', x: norm.x, y: norm.y, color: localColor, size: brushSize });
  };

  const handleTouchMove = (e) => {
    e.preventDefault();
    if (!isDrawing.current || !ctxRef.current) return;
    const pos = getTouchPos(e);
    drawLine(ctxRef.current, lastPoint.current, pos, localColor, brushSize);
    const norm = normalize(pos.x, pos.y);
    webrtcManager?.send({ type: 'draw', x: norm.x, y: norm.y, color: localColor, size: brushSize });
    lastPoint.current = pos;
  };

  const handleTouchEnd = (e) => {
    e.preventDefault();
    isDrawing.current = false;
    lastPoint.current = null;
    webrtcManager?.send({ type: 'end' });
  };

  // ── Clear canvas ──────────────────────────────────────────────────
  const handleClear = () => {
    const ctx = ctxRef.current;
    const canvas = canvasRef.current;
    if (!ctx || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    webrtcManager?.send({ type: 'clear' });
  };

  // ── Status ────────────────────────────────────────────────────────
  const statusLabel =
    connectionState === 'connected' ? 'Connected'
    : connectionState === 'connecting' ? 'Connecting…'
    : 'Waiting for peer';

  const statusClass =
    connectionState === 'connected' ? 'status-connected'
    : connectionState === 'connecting' ? 'status-connecting'
    : 'status-waiting';

  return (
    <div className="whiteboard-container">
      {/* ── Toolbar ──────────────────────────────────────────────── */}
      <div className="toolbar">
        <div className="toolbar-left">
          <div className="toolbar-brand">
            <span className="toolbar-title">Strokelink</span>
          </div>
          <div className="toolbar-divider" />
          <span className="room-badge" id="room-badge">{roomId}</span>
        </div>

        <div className="toolbar-center">
          <label className="tool-group" title="Brush Color">
            <span className="tool-label">Color</span>
            <input
              type="color"
              id="color-picker"
              value={localColor}
              onChange={(e) => setLocalColor(e.target.value)}
              className="color-input"
            />
          </label>

          <div className="tool-group" title="Brush Size">
            <span className="tool-label">Size</span>
            <input
              type="range"
              id="brush-size"
              min="1" max="20"
              value={brushSize}
              onChange={(e) => setBrushSize(Number(e.target.value))}
              className="range-input"
            />
            <span className="size-value">{brushSize}px</span>
          </div>

          <button className="btn-tool" id="clear-canvas" onClick={handleClear} title="Clear Canvas">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18" /><path d="M8 6V4h8v2" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
              <line x1="10" y1="11" x2="10" y2="17" />
              <line x1="14" y1="11" x2="14" y2="17" />
            </svg>
          </button>
        </div>

        <div className="toolbar-right">
          <div className={`status-badge ${statusClass}`} id="connection-status">
            <span className="status-dot" />
            {statusLabel}
          </div>
          <button className="btn-leave" id="leave-room" onClick={onLeaveRoom} title="Leave Room">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Leave
          </button>
        </div>
      </div>

      {/* ── Canvas area ──────────────────────────────────────────── */}
      <div className="canvas-area">
        <div className="canvas-wrapper">
          <canvas
            ref={canvasRef}
            id="drawing-canvas"
            className="drawing-canvas"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          />
        </div>

        <div className="color-legend">
          <span className="legend-item">
            <span className="legend-swatch" style={{ background: localColor }} />
            You
          </span>
          <span className="legend-item">
            <span className="legend-swatch" style={{ background: REMOTE_COLOR }} />
            Peer
          </span>
        </div>
      </div>
    </div>
  );
}
