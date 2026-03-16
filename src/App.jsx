import React, { useState, useRef, useEffect, useCallback } from 'react';
import { db } from './firebase';
import { collection, onSnapshot, doc, setDoc, writeBatch } from 'firebase/firestore';
import { 
  Users, Grid, Settings, Palette, MousePointer2, 
  Maximize, Undo2, Redo2, Paintbrush, BoxSelect,
  Download, Trash2, Plus, LayoutGrid
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const defaultRoles = [
  { id: '1', name: 'スタッフ', color: '#4f46e5' },
  { id: '2', name: '出演者', color: '#10b981' },
  { id: '3', name: 'ゲスト', color: '#f59e0b' },
];

export default function App() {
  const [width, setWidth] = useState(4); 
  const [height, setHeight] = useState(3);
  const [gridCols, setGridCols] = useState(8);
  const [gridRows, setGridRows] = useState(5);
  const [layoutPreset, setLayoutPreset] = useState('grid');
  const [isFixedCount, setIsFixedCount] = useState(false);
  const [targetCount, setTargetCount] = useState(20);
  const [people, setPeople] = useState([]);
  const [roles, setRoles] = useState(defaultRoles);
  const [selectedIds, setSelectedIds] = useState([]);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [tool, setTool] = useState('select'); // 'select', 'range', 'paint'
  const [paintRoleId, setPaintRoleId] = useState('1');
  const [selectionRect, setSelectionRect] = useState(null);
  
  // Undo/Redo
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const pixelsPerMeter = 120;
  const canvasRef = useRef(null);

  const pushHistory = useCallback((newState) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(JSON.stringify(newState));
    if (newHistory.length > 50) newHistory.shift();
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  }, [history, historyIndex]);

  const undo = () => {
    if (historyIndex > 0) {
      const prev = JSON.parse(history[historyIndex - 1]);
      setPeople(prev);
      setHistoryIndex(historyIndex - 1);
      saveToFirestore(prev);
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      const next = JSON.parse(history[historyIndex + 1]);
      setPeople(next);
      setHistoryIndex(historyIndex + 1);
      saveToFirestore(next);
    }
  };

  // Firestore Sync
  useEffect(() => {
    const q = collection(db, 'placements');
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const remotePeople = [];
      snapshot.forEach((doc) => {
        remotePeople.push({ id: doc.id, ...doc.data() });
      });
      if (remotePeople.length > 0 && historyIndex === -1) {
        setPeople(remotePeople);
        setHistory([JSON.stringify(remotePeople)]);
        setHistoryIndex(0);
      }
    });
    return () => unsubscribe();
  }, [historyIndex]);

  const saveToFirestore = async (newPeople) => {
    try {
      const batch = writeBatch(db);
      newPeople.forEach(p => {
        const ref = doc(db, 'placements', p.id);
        batch.set(ref, p);
      });
      await batch.commit();
    } catch (e) {
      console.error("Firestore Save Error: ", e);
    }
  };

  const redistribute = useCallback(async () => {
    let newPeople = [];
    if (layoutPreset === 'grid' || layoutPreset === 'staggered') {
      let cols, rows;
      if (isFixedCount) {
        const aspectRatio = width / height;
        cols = Math.round(Math.sqrt(targetCount * aspectRatio));
        rows = Math.ceil(targetCount / cols);
      } else {
        cols = Math.max(1, gridCols);
        rows = Math.max(1, gridRows);
      }
      const count = isFixedCount ? targetCount : cols * rows;
      const spacingX = width / (cols + 1);
      const spacingY = height / (rows + 1);
      for (let i = 0; i < count; i++) {
        const r = Math.floor(i / cols);
        const c = i % cols;
        let offsetX = (layoutPreset === 'staggered' && r % 2 === 1) ? spacingX / 2 : 0;
        newPeople.push({
          id: `p-${i}`,
          roleId: '1',
          gridPos: { r, c },
          x: spacingX * (c + 1) + offsetX,
          y: spacingY * (r + 1),
        });
      }
    } else if (layoutPreset === 'circle') {
      const count = isFixedCount ? targetCount : 12;
      const centerX = width / 2;
      const centerY = height / 2;
      const radius = Math.min(width, height) * 0.35;
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2;
        newPeople.push({
          id: `p-${i}`,
          roleId: '1',
          x: centerX + Math.cos(angle) * radius,
          y: centerY + Math.sin(angle) * radius,
        });
      }
    }
    setPeople(newPeople);
    pushHistory(newPeople);
    await saveToFirestore(newPeople);
  }, [width, height, gridCols, gridRows, layoutPreset, isFixedCount, targetCount, pushHistory]);

  const [lastSelectedId, setLastSelectedId] = useState(null);

  const handleSelect = (id, shift) => {
    if (tool === 'paint') {
      const newPeople = people.map(p => p.id === id ? { ...p, roleId: paintRoleId } : p);
      setPeople(newPeople);
      pushHistory(newPeople);
      saveToFirestore(newPeople);
      return;
    }
    
    if (shift && lastSelectedId && tool === 'range') {
      const p1 = people.find(p => p.id === lastSelectedId);
      const p2 = people.find(p => p.id === id);
      if (p1?.gridPos && p2?.gridPos) {
        const rMin = Math.min(p1.gridPos.r, p2.gridPos.r);
        const rMax = Math.max(p1.gridPos.r, p2.gridPos.r);
        const cMin = Math.min(p1.gridPos.c, p2.gridPos.c);
        const cMax = Math.max(p1.gridPos.c, p2.gridPos.c);
        const inRange = people.filter(p => 
          p.gridPos && p.gridPos.r >= rMin && p.gridPos.r <= rMax && 
          p.gridPos.c >= cMin && p.gridPos.c <= cMax
        ).map(p => p.id);
        setSelectedIds(prev => Array.from(new Set([...prev, ...inRange])));
      }
    } else if (shift) {
      setSelectedIds(prev => prev.includes(id) ? prev.filter(v => v !== id) : [...prev, id]);
    } else {
      setSelectedIds([id]);
    }
    setLastSelectedId(id);
  };

  const handleMove = (id, x, y) => {
    if (tool !== 'select') return;
    const person = people.find(p => p.id === id);
    if (!person) return;
    let dx = x - person.x;
    let dy = y - person.y;
    const newPeople = people.map(p => {
      if (id === p.id || selectedIds.includes(p.id)) {
        const isTarget = id === p.id;
        let nx = isTarget ? x : p.x + dx;
        let ny = isTarget ? y : p.y + dy;
        if (snapToGrid) {
          nx = Math.round(nx * 10) / 10;
          ny = Math.round(ny * 10) / 10;
        }
        return { ...p, x: nx, y: ny };
      }
      return p;
    });
    setPeople(newPeople);
  };

  const handleMoveEnd = () => {
    pushHistory(people);
    saveToFirestore(people);
  };

  const handleCanvasMouseDown = (e) => {
    if (tool === 'select' && (e.target.tagName === 'svg' || e.target.tagName === 'rect')) {
      const svg = canvasRef.current;
      const pt = svg.createSVGPoint();
      pt.x = e.clientX; pt.y = e.clientY;
      const curPt = pt.matrixTransform(svg.getScreenCTM().inverse());
      setSelectionRect({ x1: curPt.x, y1: curPt.y, x2: curPt.x, y2: curPt.y });
      if (!e.shiftKey) setSelectedIds([]);
    }
  };

  useEffect(() => {
    if (!selectionRect) return;
    const onMouseMove = (e) => {
      const svg = canvasRef.current;
      const pt = svg.createSVGPoint();
      pt.x = e.clientX; pt.y = e.clientY;
      const curPt = pt.matrixTransform(svg.getScreenCTM().inverse());
      setSelectionRect(prev => ({ ...prev, x2: curPt.x, y2: curPt.y }));
      const xMin = Math.min(selectionRect.x1, curPt.x);
      const xMax = Math.max(selectionRect.x1, curPt.x);
      const yMin = Math.min(selectionRect.y1, curPt.y);
      const yMax = Math.max(selectionRect.y1, curPt.y);
      const newlySelected = people.filter(p => p.x >= xMin && p.x <= xMax && p.y >= yMin && p.y <= yMax).map(p => p.id);
      setSelectedIds(newlySelected);
    };
    const onMouseUp = () => setSelectionRect(null);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [selectionRect, people]);

  return (
    <div className="app-container">
      <aside className="sidebar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
          <div style={{ background: 'var(--primary)', padding: '10px', borderRadius: '14px', boxShadow: '0 4px 12px var(--primary-glow)' }}>
            <Users size={24} color="white" />
          </div>
          <h1 className="title">Placer Pro</h1>
        </div>

        <div className="sidebar-section">
          <div className="section-header">
            <Maximize size={14} color="var(--text-muted)" />
            <span>キャンバス設定</span>
          </div>
          <div className="input-group">
            <div style={{ display: 'flex', gap: '8px' }}>
              <div style={{ flex: 1 }}>
                <label>幅 (m)</label>
                <input type="number" value={width} onChange={(e) => setWidth(Number(e.target.value))} />
              </div>
              <div style={{ flex: 1 }}>
                <label>奥行 (m)</label>
                <input type="number" value={height} onChange={(e) => setHeight(Number(e.target.value))} />
              </div>
            </div>
          </div>
        </div>

        <div className="sidebar-section">
          <div className="section-header">
            <LayoutGrid size={14} color="var(--text-muted)" />
            <span>自動配置オプション</span>
          </div>
          <select value={layoutPreset} onChange={(e) => setLayoutPreset(e.target.value)} style={{ width: '100%' }}>
            <option value="grid">グリッド配置</option>
            <option value="staggered">千鳥配置</option>
            <option value="circle">円形配置</option>
          </select>
          <div className="stats-card">
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', textTransform: 'none' }}>
              <input type="checkbox" checked={isFixedCount} onChange={() => setIsFixedCount(!isFixedCount)} />
              人数を固定する
            </label>
            {isFixedCount ? (
              <div className="input-group">
                <label>人数合計</label>
                <input type="number" value={targetCount} onChange={(e) => setTargetCount(Number(e.target.value))} />
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '8px' }}>
                <div style={{ flex: 1 }}>
                  <label>列</label>
                  <input type="number" value={gridCols} onChange={(e) => setGridCols(Number(e.target.value))} />
                </div>
                <div style={{ flex: 1 }}>
                  <label>行</label>
                  <input type="number" value={gridRows} onChange={(e) => setGridRows(Number(e.target.value))} />
                </div>
              </div>
            )}
            <button onClick={redistribute} className="primary" style={{ marginTop: '8px' }}>
              <Plus size={16} /> 新規配置を適用
            </button>
          </div>
        </div>

        <div className="sidebar-section">
          <div className="section-header">
            <Palette size={14} color="var(--text-muted)" />
            <span>役割と適用</span>
          </div>
          {roles.map(role => (
            <div 
              key={role.id} 
              className={`role-badge ${paintRoleId === role.id && tool === 'paint' ? 'active' : ''}`}
              onClick={() => {
                setPaintRoleId(role.id);
                setTool('paint');
                if (selectedIds.length > 0) {
                   const newPeople = people.map(p => selectedIds.includes(p.id) ? { ...p, roleId: role.id } : p);
                   setPeople(newPeople);
                   pushHistory(newPeople);
                   saveToFirestore(newPeople);
                }
              }}
            >
              <div style={{ width: '20px', height: '20px', borderRadius: '6px', background: role.color, border: '2px solid white', boxShadow: '0 0 0 1px #ddd' }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.85rem', fontWeight: '700' }}>{role.name}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{people.filter(p => p.roleId === role.id).length}人</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 'auto' }}>
          <button style={{ width: '100%', background: '#f8fafc', color: 'var(--text-main)', border: '1px solid var(--border)' }}>
            <Download size={16} /> データをエクスポート
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="header">
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <div className="stats-card" style={{ padding: '6px 12px', background: 'transparent' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: '700' }}>{people.length} 人</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', textTransform: 'none', fontWeight: '600' }}>
              <input type="checkbox" checked={snapToGrid} onChange={() => setSnapToGrid(!snapToGrid)} />
              整列補助を有効
            </label>
            <div className="stats-card" style={{ background: 'white' }}>
              面積: {(width * height).toFixed(1)} m²
            </div>
          </div>
        </header>

        <div className="canvas-wrapper">
          <div className="toolbar">
            <button className={`tool-btn ${tool === 'select' ? 'active' : ''}`} onClick={() => setTool('select')} title="選択・移動工具">
              <MousePointer2 size={20} />
            </button>
            <button className={`tool-btn ${tool === 'range' ? 'active' : ''}`} onClick={() => setTool('range')} title="範囲選択工具 (Shift+クリック対応)">
              <BoxSelect size={20} />
            </button>
            <button className={`tool-btn ${tool === 'paint' ? 'active' : ''}`} onClick={() => setTool('paint')} title="ペイント工具 (役割を塗る)">
              <Paintbrush size={20} />
            </button>
            <div style={{ width: '1px', background: 'var(--border)', margin: '4px 8px' }} />
            <button className="tool-btn" onClick={() => { setPeople(people.filter(p => !selectedIds.includes(p.id))); setSelectedIds([]); }} title="選択削除" style={{ color: '#ef4444' }}>
              <Trash2 size={20} />
            </button>
          </div>

          <div 
            className="canvas-container" 
            style={{ width: `${width * pixelsPerMeter}px`, height: `${height * pixelsPerMeter}px` }}
            onMouseDown={handleCanvasMouseDown}
          >
            <svg ref={canvasRef} width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }}>
              <defs>
                <pattern id="smallGrid" width="0.1" height="0.1" patternUnits="userSpaceOnUse">
                  <path d="M 0.1 0 L 0 0 0 0.1" fill="none" stroke="#f1f5f9" strokeWidth="0.01"/>
                </pattern>
                <pattern id="grid" width="0.5" height="0.5" patternUnits="userSpaceOnUse">
                  <rect width="0.5" height="0.5" fill="url(#smallGrid)"/>
                  <path d="M 0.5 0 L 0 0 0 0.5" fill="none" stroke="#e2e8f0" strokeWidth="0.02"/>
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid)" />
              {people.map(person => {
                const role = roles.find(r => r.id === person.roleId);
                return (
                  <PersonNode 
                    key={person.id} 
                    person={person} 
                    color={role?.color || '#333'}
                    isSelected={selectedIds.includes(person.id)}
                    onMove={handleMove}
                    onMoveEnd={handleMoveEnd}
                    onSelect={handleSelect}
                    tool={tool}
                  />
                );
              })}
              {selectionRect && (
                <rect 
                  className="selection-rect"
                  x={Math.min(selectionRect.x1, selectionRect.x2)}
                  y={Math.min(selectionRect.y1, selectionRect.y2)}
                  width={Math.abs(selectionRect.x1 - selectionRect.x2)}
                  height={Math.abs(selectionRect.y1 - selectionRect.y2)}
                />
              )}
            </svg>
          </div>

          <div className="history-controls">
            <button className="tool-btn" onClick={undo} disabled={historyIndex <= 0} style={{ opacity: historyIndex <= 0 ? 0.3 : 1 }}>
              <Undo2 size={18} />
            </button>
            <button className="tool-btn" onClick={redo} disabled={historyIndex >= history.length - 1} style={{ opacity: historyIndex >= history.length - 1 ? 0.3 : 1 }}>
              <Redo2 size={18} />
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

function PersonNode({ person, color, isSelected, onMove, onMoveEnd, onSelect, tool }) {
  const [isDragging, setIsDragging] = useState(false);
  const nodeRef = useRef(null);

  const handleMouseDown = (e) => {
    onSelect(person.id, e.shiftKey);
    if (tool === 'select') setIsDragging(true);
    e.stopPropagation(); e.preventDefault();
  };

  useEffect(() => {
    if (!isDragging) return;
    const onMouseMove = (e) => {
      const svg = nodeRef.current.ownerSVGElement;
      const pt = svg.createSVGPoint();
      pt.x = e.clientX; pt.y = e.clientY;
      const cursorPoint = pt.matrixTransform(svg.getScreenCTM().inverse());
      onMove(person.id, cursorPoint.x, cursorPoint.y);
    };
    const onMouseUp = () => {
      setIsDragging(false);
      onMoveEnd();
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [isDragging, person.id, onMove, onMoveEnd]);

  return (
    <motion.g
      ref={nodeRef}
      initial={false}
      animate={{ x: person.x, y: person.y }}
      onMouseDown={handleMouseDown}
      className="person-node"
      style={{ cursor: tool === 'select' ? (isDragging ? 'grabbing' : 'grab') : (tool === 'paint' ? 'crosshair' : 'pointer') }}
    >
      {isSelected && (
        <circle r="0.2" fill="rgba(79, 70, 229, 0.15)" stroke="var(--primary)" strokeWidth="0.02" strokeDasharray="0.05, 0.05" />
      )}
      <circle r="0.12" fill={color} style={{ filter: isSelected ? 'drop-shadow(0 0 10px var(--primary-glow))' : 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))' }} />
      <text y="0.25" fontSize="0.08" fill="#1e293b" textAnchor="middle" style={{ pointerEvents: 'none', fontWeight: '800' }}>
        {person.id.split('-').slice(1).join('-')}
      </text>
    </motion.g>
  );
}
