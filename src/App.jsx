import React, { useState, useRef, useEffect, useCallback } from 'react';
import { db } from './firebase';
import { collection, onSnapshot, doc, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { Users, Grid, Settings, Palette, Share2, MousePointer2, AlignCenter, Download, Scissors, Trash2, Maximize } from 'lucide-react';
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
  const [targetCount, setTargetCount] = useState(40);
  const [people, setPeople] = useState([]);
  const [roles, setRoles] = useState(defaultRoles);
  const [selectedIds, setSelectedIds] = useState([]);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [selectionRect, setSelectionRect] = useState(null);
  
  const pixelsPerMeter = 120;
  const canvasRef = useRef(null);

  // Firestore Sync
  useEffect(() => {
    const q = collection(db, 'placements');
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const remotePeople = [];
      snapshot.forEach((doc) => {
        remotePeople.push({ id: doc.id, ...doc.data() });
      });
      if (remotePeople.length > 0) {
        setPeople(remotePeople);
      }
    });
    return () => unsubscribe();
  }, []);

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

  // Layout Generation
  const redistribute = useCallback(async () => {
    let newPeople = [];
    const safeCols = Math.max(1, gridCols);
    const safeRows = Math.max(1, gridRows);
    
    if (layoutPreset === 'grid' || layoutPreset === 'staggered') {
      const totalCells = safeCols * safeRows;
      const count = isFixedCount ? targetCount : totalCells;
      
      for (let i = 0; i < count; i++) {
        const r = Math.floor(i / safeCols);
        const c = i % safeCols;
        if (r >= safeRows) break;

        let offsetX = 0;
        if (layoutPreset === 'staggered' && r % 2 === 1) {
          offsetX = (width / (safeCols + 1)) / 2;
        }

        newPeople.push({
          id: `p-${i}`,
          roleId: (Math.random() > 0.8 ? '2' : '1'),
          x: (width / (safeCols + 1)) * (c + 1) + offsetX,
          y: (height / (safeRows + 1)) * (r + 1),
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
    } else if (layoutPreset === 'staircase') {
      const count = isFixedCount ? targetCount : 15;
      const rows = 3;
      const perRow = Math.ceil(count / rows);
      
      for (let i = 0; i < count; i++) {
        const r = Math.floor(i / perRow);
        const c = i % perRow;
        newPeople.push({
          id: `p-${i}`,
          roleId: '1',
          x: (width / (perRow + 1)) * (c + 1),
          y: (height / (rows + 1)) * (r + 1),
          // Custom scale could be added here for tiered effect
        });
      }
    }

    setPeople(newPeople);
    await saveToFirestore(newPeople);
  }, [width, height, gridCols, gridRows, layoutPreset, isFixedCount, targetCount]);

  const density = (people.length > 0) ? (width * height) / people.length : 0;

  const handleMove = (id, x, y) => {
    const person = people.find(p => p.id === id);
    if (!person) return;

    let dx = x - person.x;
    let dy = y - person.y;

    const updateMap = (p) => {
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
    };

    const newPeople = people.map(updateMap);
    setPeople(newPeople);
    
    // Throttle firestore updates or wait for mouseUp? For now, update on end.
  };

  const handleCanvasMouseDown = (e) => {
    if (e.target.tagName === 'svg' || e.target.tagName === 'rect') {
      const svg = canvasRef.current;
      if (!svg) return;
      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const ctm = svg.getScreenCTM();
      if (!ctm) return;
      const startPt = pt.matrixTransform(ctm.inverse());
      setSelectionRect({ x1: startPt.x, y1: startPt.y, x2: startPt.x, y2: startPt.y });
      if (!e.shiftKey) setSelectedIds([]);
    }
  };

  useEffect(() => {
    const handleSave = () => {
      saveToFirestore(people);
    };
    window.addEventListener('save-placements', handleSave);
    return () => window.removeEventListener('save-placements', handleSave);
  }, [people]);

  useEffect(() => {
    if (!selectionRect) return;

    const onMouseMove = (e) => {
      const svg = canvasRef.current;
      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const ctm = svg.getScreenCTM();
      if (!ctm) return;
      const curPt = pt.matrixTransform(ctm.inverse());
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
      <div className="sidebar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ background: 'var(--primary)', padding: '8px', borderRadius: '10px' }}>
            <Users size={20} color="white" />
          </div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: '800', letterSpacing: '-0.02em' }}>Placer Pro</h1>
        </div>

        <div className="input-group">
          <label>空間サイズ (m)</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input type="number" value={width} onChange={(e) => setWidth(Number(e.target.value))} placeholder="幅" />
            <input type="number" value={height} onChange={(e) => setHeight(Number(e.target.value))} placeholder="奥行" />
          </div>
        </div>

        <div className="input-group">
          <label>配置設定</label>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <select value={layoutPreset} onChange={(e) => setLayoutPreset(e.target.value)} style={{ flex: 1 }}>
              <option value="grid">通常グリッド</option>
              <option value="staggered">千鳥配置</option>
              <option value="circle">円形配置</option>
              <option value="staircase">階段型 (ひな壇)</option>
            </select>
            <button onClick={redistribute} className="btn-secondary" style={{ padding: '8px' }}>
              <Grid size={14} /> 再配置
            </button>
          </div>
          
          <div style={{ padding: '12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', cursor: 'pointer', fontSize: '0.8rem', textTransform: 'none' }}>
              <input type="checkbox" checked={isFixedCount} onChange={() => setIsFixedCount(!isFixedCount)} />
              人数を固定 ({people.length}人)
            </label>
            
            {isFixedCount ? (
              <div className="input-group">
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>ターゲット人数</span>
                <input type="number" value={targetCount} onChange={(e) => setTargetCount(Number(e.target.value))} />
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '8px' }}>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>列 (横)</span>
                  <input type="number" style={{ width: '100%' }} value={gridCols} onChange={(e) => setGridCols(Number(e.target.value))} />
                </div>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>行 (縦)</span>
                  <input type="number" style={{ width: '100%' }} value={gridRows} onChange={(e) => setGridRows(Number(e.target.value))} />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="input-group">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
            <label>役割とカラー</label>
            {selectedIds.length > 0 && (
              <span style={{ fontSize: '0.7rem', color: 'var(--primary)', fontWeight: '600' }}>
                {selectedIds.length}人選択中
              </span>
            )}
          </div>
          {roles.map(role => (
            <div 
              key={role.id} 
              className={`role-badge ${selectedIds.length > 0 ? 'interactive' : ''}`}
              title={selectedIds.length > 0 ? `選択中の人に「${role.name}」を適用` : ''}
              onClick={() => {
                if (selectedIds.length > 0) {
                  const newPeople = people.map(p => 
                    selectedIds.includes(p.id) ? { ...p, roleId: role.id } : p
                  );
                  setPeople(newPeople);
                  saveToFirestore(newPeople);
                }
              }}
              style={{ 
                cursor: selectedIds.length > 0 ? 'pointer' : 'default',
                transform: selectedIds.length > 0 ? 'scale(1)' : 'none',
                transition: 'all 0.2s',
                border: selectedIds.length > 0 ? '1px solid var(--primary)' : '1px solid var(--border)',
                background: selectedIds.length > 0 ? 'rgba(79, 70, 229, 0.05)' : 'white'
              }}
            >
              <input 
                type="color" 
                value={role.color} 
                onChange={(e) => {
                  setRoles(roles.map(r => r.id === role.id ? { ...r, color: e.target.value } : r));
                  e.stopPropagation();
                }}
                style={{ width: '20px', height: '20px', padding: '0', border: 'none', cursor: 'pointer', background: 'none' }}
              />
              <input
                type="text"
                value={role.name}
                onChange={(e) => {
                  setRoles(roles.map(r => r.id === role.id ? { ...r, name: e.target.value } : r));
                  e.stopPropagation();
                }}
                onClick={(e) => e.stopPropagation()}
                style={{ background: 'transparent', border: 'none', fontWeight: '500', width: '100%', fontSize: '0.85rem' }}
              />
            </div>
          ))}
        </div>

        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div className="stats-card" style={{ background: '#f8fafc' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ color: 'var(--text-muted)' }}>人数合計:</span>
              <span style={{ fontWeight: '700' }}>{people.length} 人</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>1人あたり:</span>
              <span style={{ fontWeight: '700' }}>{density.toFixed(2)} m²</span>
            </div>
          </div>
          <button style={{ width: '100%' }}>
            <Download size={16} /> 保存・書き出し
          </button>
        </div>
      </div>

      <div className="main-content">
        <div className="header">
          <div className="title">配置シミュレーター</div>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', textTransform: 'none' }}>
              <input type="checkbox" checked={snapToGrid} onChange={() => setSnapToGrid(!snapToGrid)} />
              グリッドに吸着
            </label>
            <div className="stats-card">
              <Maximize size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
              面積: {(width * height).toFixed(1)} m²
            </div>
          </div>
        </div>

        <div className="canvas-wrapper">
          <div 
            className="canvas-container" 
            style={{ 
              width: `${width * pixelsPerMeter}px`, 
              height: `${height * pixelsPerMeter}px` 
            }}
            onMouseDown={handleCanvasMouseDown}
          >
            <svg 
              ref={canvasRef}
              width="100%" 
              height="100%" 
              viewBox={`0 0 ${width} ${height}`}
              style={{ overflow: 'visible' }}
            >
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
                const isSelected = selectedIds.includes(person.id);
                return (
                  <PersonNode 
                    key={person.id} 
                    person={person} 
                    color={role?.color || '#333'}
                    isSelected={isSelected}
                    onMove={handleMove}
                    onSelect={(id, shift) => {
                      if (shift) {
                        setSelectedIds(prev => prev.includes(id) ? prev.filter(v => v !== id) : [...prev, id]);
                      } else {
                        setSelectedIds([id]);
                      }
                    }}
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
        </div>
        
        <div className="controls-overlay">
          <button className="btn-secondary" onClick={() => setSelectedIds(people.map(p => p.id))}><MousePointer2 size={16}/> 全選択</button>
          <button className="btn-secondary" onClick={() => setPeople(people.filter(p => !selectedIds.includes(p.id)))} style={{ color: '#ef4444' }}><Trash2 size={16}/> 選択削除</button>
        </div>
      </div>
    </div>
  );
}

function PersonNode({ person, color, isSelected, onMove, onSelect }) {
  const [isDragging, setIsDragging] = useState(false);
  const nodeRef = useRef(null);

  const handleMouseDown = (e) => {
    setIsDragging(true);
    onSelect(person.id, e.shiftKey);
    e.stopPropagation();
    e.preventDefault();
  };

  useEffect(() => {
    if (!isDragging) return;

    const onMouseMove = (e) => {
      const svg = nodeRef.current.ownerSVGElement;
      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const cursorPoint = pt.matrixTransform(svg.getScreenCTM().inverse());
      onMove(person.id, cursorPoint.x, cursorPoint.y);
    };

    const onMouseUp = async () => {
      setIsDragging(false);
      // We need to save the current positions to Firestore here.
      // Since handleMove already updated the local 'people' state, 
      // we can trigger a save of the affected people.
      window.dispatchEvent(new CustomEvent('save-placements'));
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [isDragging, person.id, onMove]);

  return (
    <motion.g
      ref={nodeRef}
      initial={false}
      animate={{ x: person.x, y: person.y }}
      onMouseDown={handleMouseDown}
      className="person-node"
      style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
    >
      {isSelected && (
        <circle r="0.2" fill="rgba(79, 70, 229, 0.2)" stroke="var(--primary)" strokeWidth="0.02" strokeDasharray="0.05, 0.05" />
      )}
      <circle r="0.12" fill={color} style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))' }} />
      <text 
        y="0.25" 
        fontSize="0.08" 
        fill="#1e293b" 
        textAnchor="middle" 
        style={{ pointerEvents: 'none', fontWeight: '600' }}
      >
        {person.id.split('-').slice(1).join('-')}
      </text>
    </motion.g>
  );
}
