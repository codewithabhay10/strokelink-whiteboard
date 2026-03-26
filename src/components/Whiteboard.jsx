import { useRef, useEffect, useState, useCallback } from 'react';

const LOCAL_COLOR = '#6d28d9';
const REMOTE_COLOR = '#14b8a6';
const SHAPE_TOOLS = ['line', 'rectangle', 'circle'];
const FREEHAND_TOOLS = ['pen', 'eraser'];

export default function Whiteboard({ webrtcManager, connectionState, roomId, onLeaveRoom }) {
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const isDrawing = useRef(false);
  const lastPoint = useRef(null);
  const remoteQueue = useRef([]);
  const animFrameRef = useRef(null);
  const remoteCursor = useRef(null);
  const remoteStrokeStyle = useRef(null);
  const shapeStartPoint = useRef(null);
  const shapeSnapshot = useRef(null);

  const [brushSize, setBrushSize] = useState(3);
  const [localColor, setLocalColor] = useState(LOCAL_COLOR);
  const [tool, setTool] = useState('pen');
  const [isCompactToolbar, setIsCompactToolbar] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);

  useEffect(() => {
    const updateToolbarMode = () => {
      const compact = window.innerWidth <= 1200;
      setIsCompactToolbar(compact);
      if (!compact) {
        setToolsOpen(false);
      }
    };

    updateToolbarMode();
    window.addEventListener('resize', updateToolbarMode);
    return () => window.removeEventListener('resize', updateToolbarMode);
  }, []);

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

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

    ctx.drawImage(temp, 0, 0, rect.width, rect.height);
    ctxRef.current = ctx;
  }, []);

  useEffect(() => {
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, [resizeCanvas]);

  const normalize = (x, y) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: x / rect.width, y: y / rect.height };
  };

  const denormalize = (nx, ny) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: nx * rect.width, y: ny * rect.height };
  };

  const withComposite = (ctx, toolName, drawFn) => {
    ctx.save();
    ctx.globalCompositeOperation = toolName === 'eraser' ? 'destination-out' : 'source-over';
    drawFn();
    ctx.restore();
  };

  const drawLine = (ctx, from, to, color, size, toolName = 'pen') => {
    withComposite(ctx, toolName, () => {
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = size;
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    });
  };

  const drawShape = (ctx, shape, from, to, color, size, toolName = 'pen') => {
    withComposite(ctx, toolName, () => {
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = size;

      if (shape === 'line') {
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
        return;
      }

      if (shape === 'rectangle') {
        const left = Math.min(from.x, to.x);
        const top = Math.min(from.y, to.y);
        const width = Math.abs(to.x - from.x);
        const height = Math.abs(to.y - from.y);
        ctx.strokeRect(left, top, width, height);
        return;
      }

      if (shape === 'circle') {
        const radius = Math.hypot(to.x - from.x, to.y - from.y);
        ctx.arc(from.x, from.y, radius, 0, Math.PI * 2);
        ctx.stroke();
      }
    });
  };

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

      if (pkt.type === 'shape') {
        const from = denormalize(pkt.x1, pkt.y1);
        const to = denormalize(pkt.x2, pkt.y2);
        drawShape(
          ctx,
          pkt.shape || 'line',
          from,
          to,
          pkt.color || REMOTE_COLOR,
          pkt.size || 3,
          pkt.tool || 'pen',
        );
        continue;
      }

      const { x, y } = denormalize(pkt.x, pkt.y);

      if (pkt.type === 'start') {
        remoteCursor.current = { x, y };
        remoteStrokeStyle.current = {
          tool: pkt.tool || 'pen',
          color: pkt.color || REMOTE_COLOR,
          size: pkt.size || 3,
        };
      } else if (pkt.type === 'draw' && remoteCursor.current) {
        drawLine(
          ctx,
          remoteCursor.current,
          { x, y },
          remoteStrokeStyle.current?.color || pkt.color || REMOTE_COLOR,
          remoteStrokeStyle.current?.size || pkt.size || 3,
          remoteStrokeStyle.current?.tool || pkt.tool || 'pen',
        );
        remoteCursor.current = { x, y };
      } else if (pkt.type === 'end') {
        remoteCursor.current = null;
        remoteStrokeStyle.current = null;
      }
    }

    animFrameRef.current = requestAnimationFrame(processRemoteQueue);
  }, []);

  useEffect(() => {
    animFrameRef.current = requestAnimationFrame(processRemoteQueue);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [processRemoteQueue]);

  useEffect(() => {
    if (!webrtcManager) return;
    webrtcManager._onMessage = (data) => remoteQueue.current.push(data);
  }, [webrtcManager]);

  const getMousePos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const getTouchPos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const t = e.touches[0];
    return { x: t.clientX - rect.left, y: t.clientY - rect.top };
  };

  const resetStrokeState = () => {
    isDrawing.current = false;
    lastPoint.current = null;
    shapeStartPoint.current = null;
    shapeSnapshot.current = null;
  };

  const commitShape = (endPos) => {
    if (!shapeStartPoint.current || !ctxRef.current) return;

    const from = shapeStartPoint.current;
    const to = endPos;
    drawShape(ctxRef.current, tool, from, to, localColor, brushSize, 'pen');

    const normFrom = normalize(from.x, from.y);
    const normTo = normalize(to.x, to.y);

    webrtcManager?.send({
      type: 'shape',
      shape: tool,
      x1: normFrom.x,
      y1: normFrom.y,
      x2: normTo.x,
      y2: normTo.y,
      color: localColor,
      size: brushSize,
      tool: 'pen',
    });
  };

  const handlePointerDown = (pos) => {
    const ctx = ctxRef.current;
    if (!ctx) return;

    isDrawing.current = true;

    if (FREEHAND_TOOLS.includes(tool)) {
      lastPoint.current = pos;
      const norm = normalize(pos.x, pos.y);
      webrtcManager?.send({
        type: 'start',
        x: norm.x,
        y: norm.y,
        color: localColor,
        size: brushSize,
        tool,
      });
      return;
    }

    shapeStartPoint.current = pos;
    const rect = canvasRef.current.getBoundingClientRect();
    shapeSnapshot.current = ctx.getImageData(0, 0, rect.width, rect.height);
  };

  const handlePointerMove = (pos) => {
    if (!isDrawing.current || !ctxRef.current) return;

    if (FREEHAND_TOOLS.includes(tool)) {
      drawLine(ctxRef.current, lastPoint.current, pos, localColor, brushSize, tool);
      const norm = normalize(pos.x, pos.y);
      webrtcManager?.send({
        type: 'draw',
        x: norm.x,
        y: norm.y,
        color: localColor,
        size: brushSize,
        tool,
      });
      lastPoint.current = pos;
      return;
    }

    if (shapeStartPoint.current && shapeSnapshot.current) {
      ctxRef.current.putImageData(shapeSnapshot.current, 0, 0);
      drawShape(ctxRef.current, tool, shapeStartPoint.current, pos, localColor, brushSize, 'pen');
    }
  };

  const handlePointerEnd = (pos, { cancel = false } = {}) => {
    if (!isDrawing.current) return;

    if (FREEHAND_TOOLS.includes(tool)) {
      webrtcManager?.send({ type: 'end', tool });
      resetStrokeState();
      return;
    }

    if (shapeSnapshot.current && ctxRef.current) {
      ctxRef.current.putImageData(shapeSnapshot.current, 0, 0);
    }

    if (!cancel && pos) {
      commitShape(pos);
    }

    resetStrokeState();
  };

  const handleMouseDown = (e) => handlePointerDown(getMousePos(e));
  const handleMouseMove = (e) => handlePointerMove(getMousePos(e));
  const handleMouseUp = (e) => handlePointerEnd(getMousePos(e));
  const handleMouseLeave = () => handlePointerEnd(null, { cancel: true });

  const handleTouchStart = (e) => {
    e.preventDefault();
    handlePointerDown(getTouchPos(e));
  };

  const handleTouchMove = (e) => {
    e.preventDefault();
    handlePointerMove(getTouchPos(e));
  };

  const handleTouchEnd = (e) => {
    e.preventDefault();
    const touch = e.changedTouches?.[0];
    if (!touch || !canvasRef.current) {
      handlePointerEnd(null, { cancel: true });
      return;
    }

    const rect = canvasRef.current.getBoundingClientRect();
    const pos = { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
    handlePointerEnd(pos);
  };

  const handleClear = () => {
    const ctx = ctxRef.current;
    const canvas = canvasRef.current;
    if (!ctx || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    webrtcManager?.send({ type: 'clear' });
  };

  const toolButtons = [
    { id: 'pen', label: 'Pen', short: 'P' },
    { id: 'eraser', label: 'Eraser', short: 'E' },
    { id: 'line', label: 'Line', short: 'L' },
    { id: 'rectangle', label: 'Rect', short: 'R' },
    { id: 'circle', label: 'Circle', short: 'C' },
  ];

  const isShapeTool = SHAPE_TOOLS.includes(tool);

  const statusLabel =
    connectionState === 'connected' ? 'Connected'
    : connectionState === 'connecting' ? 'Connecting...'
    : 'Waiting for peer';

  const statusClass =
    connectionState === 'connected' ? 'status-connected'
    : connectionState === 'connecting' ? 'status-connecting'
    : 'status-waiting';

  return (
    <div className="whiteboard-container">
      <div className="toolbar">
        <div className="toolbar-left">
          <div className="toolbar-brand">
            <span className="toolbar-title">Strokelink</span>
          </div>
          <div className="toolbar-divider" />
          <span className="room-badge" id="room-badge">{roomId}</span>
        </div>

        <div
          className={`toolbar-center toolbar-controls ${isCompactToolbar ? 'compact-controls' : ''} ${
            !isCompactToolbar || toolsOpen ? 'open' : ''
          }`}
        >
          <div className="tool-switcher" title="Tool">
            {toolButtons.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`btn-tool-mode ${tool === item.id ? 'active' : ''}`}
                onClick={() => setTool(item.id)}
                title={item.label}
              >
                <span className="tool-mode-icon" aria-hidden>{item.short}</span>
                <span className="tool-mode-label">{item.label}</span>
              </button>
            ))}
          </div>

          <label className="tool-group" title="Brush Color">
            <span className="tool-label">Color</span>
            <input
              type="color"
              id="color-picker"
              value={localColor}
              onChange={(e) => setLocalColor(e.target.value)}
              className="color-input"
              disabled={tool === 'eraser'}
            />
          </label>

          <div className="tool-group" title="Brush Size">
            <span className="tool-label">Size</span>
            <input
              type="range"
              id="brush-size"
              min="1"
              max="20"
              value={brushSize}
              onChange={(e) => setBrushSize(Number(e.target.value))}
              className="range-input"
            />
            <span className="size-value">{brushSize}px</span>
          </div>

          {isShapeTool && (
            <div className="tool-group" title="Shape mode">
              <span className="tool-label">Shape</span>
              <span className="shape-hint">Drag to place</span>
            </div>
          )}

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
          {isCompactToolbar && (
            <button
              className={`btn-tools-toggle ${toolsOpen ? 'active' : ''}`}
              type="button"
              onClick={() => setToolsOpen((prev) => !prev)}
              aria-expanded={toolsOpen}
              title="Show drawing tools"
            >
              Tools
            </button>
          )}
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

      <div className="canvas-area">
        <div className="canvas-wrapper">
          <canvas
            ref={canvasRef}
            id="drawing-canvas"
            className={`drawing-canvas tool-${tool}`}
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
            You ({tool})
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
