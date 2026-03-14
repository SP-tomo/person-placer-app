import React, { useState, useRef, useEffect } from 'react';
import { db } from './firebase';
import { collection, onSnapshot, doc, setDoc, updateDoc } from 'firebase/firestore';
import { Users, Move, Maximize, Palette, Share2, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const defaultRoles = [
  { id: '1', name: 'Role A', color: '#6366f1' },
  { id: '2', name: 'Role B', color: '#10b981' },
  { id: '3', name: 'Role C', color: '#f59e0b' },
];

export default function App() {
  const [width, setWidth] = useState(4); // m
  const [height, setHeight] = useState(3); // m
  const [peopleCount, setPeopleCount] = useState(40);
  const [people, setPeople] = useState([]);
  const [roles, setRoles] = useState(defaultRoles);
  const [isSyncing, setIsSyncing] = useState(false);

  const pixelsPerMeter = 100;

  // Initialize people
  useEffect(() => {
    const initialPeople = Array.from({ length: peopleCount }).map((_, i) => ({
      id: `p-${i}`,
      roleId: (i % roles.length + 1).toString(),
      x: (i % 8) * 0.5 + 0.25,
      y: Math.floor(i / 8) * 0.5 + 0.25,
    }));
    setPeople(initialPeople);
  }, [peopleCount]);

  const density = (width * height) / peopleCount;

  const handleDrag = (id, x, y) => {
    setPeople(prev => prev.map(p => p.id === id ? { ...p, x, y } : p));
  };

  return (
    <div className="app-container">
      <div className="sidebar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Users size={24} color="#6366f1" />
          <h1 style={{ fontSize: '1.5rem', fontWeight: '700' }}>Placer AI</h1>
        </div>

        <div className="input-group">
          <label>Space Size (Meters)</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input 
              type="number" 
              value={width} 
              onChange={(e) => setWidth(Number(e.target.value))} 
              placeholder="Width"
            />
            <input 
              type="number" 
              value={height} 
              onChange={(e) => setHeight(Number(e.target.value))} 
              placeholder="Height"
            />
          </div>
        </div>

        <div className="input-group">
          <label>Number of People</label>
          <input 
            type="number" 
            value={peopleCount} 
            onChange={(e) => setPeopleCount(Number(e.target.value))}
          />
        </div>

        <div className="input-group">
          <label>Roles & Colors</label>
          {roles.map(role => (
            <div key={role.id} className="role-badge">
              <input 
                type="color" 
                value={role.color} 
                onChange={(e) => {
                  const newRoles = roles.map(r => r.id === role.id ? { ...r, color: e.target.value } : r);
                  setRoles(newRoles);
                }}
                style={{ width: '24px', height: '24px', padding: '0', border: 'none', cursor: 'pointer' }}
              />
              <input
                type="text"
                value={role.name}
                onChange={(e) => {
                  const newRoles = roles.map(r => r.id === role.id ? { ...r, name: e.target.value } : r);
                  setRoles(newRoles);
                }}
                style={{ background: 'transparent', border: 'none', color: 'white', fontSize: '0.875rem', width: '100%', padding: '4px' }}
              />
            </div>
          ))}
        </div>

        <div style={{ marginTop: 'auto' }}>
          <button style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            <Share2 size={18} />
            Share Real-time
          </button>
        </div>
      </div>

      <div className="main-content">
        <div className="header">
          <div className="title">Workshop Area</div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <div className="stats-card">
              <span style={{ color: 'var(--text-muted)' }}>Density: </span>
              <span style={{ fontWeight: '600' }}>{density.toFixed(2)} m²/person</span>
            </div>
            <div className="stats-card">
              <span style={{ color: 'var(--text-muted)' }}>Total Area: </span>
              <span style={{ fontWeight: '600' }}>{(width * height).toFixed(1)} m²</span>
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
          >
            <svg 
              width="100%" 
              height="100%" 
              viewBox={`0 0 ${width} ${height}`}
              style={{ overflow: 'visible' }}
            >
              {/* Grid lines */}
              <defs>
                <pattern id="grid" width="1" height="1" patternUnits="userSpaceOnUse">
                  <path d="M 1 0 L 0 0 0 1" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="0.05"/>
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid)" />

              {people.map(person => {
                const role = roles.find(r => r.id === person.roleId);
                return (
                  <PersonNode 
                    key={person.id} 
                    person={person} 
                    color={role?.color || '#fff'}
                    onMove={handleDrag}
                  />
                );
              })}
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}

function PersonNode({ person, color, onMove }) {
  const [isDragging, setIsDragging] = useState(false);
  const nodeRef = useRef(null);

  const handleMouseDown = (e) => {
    setIsDragging(true);
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

    const onMouseUp = () => setIsDragging(false);

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
      <circle r="0.12" fill={color} filter="drop-shadow(0 0 4px rgba(0,0,0,0.5))" />
      <circle r="0.14" fill="none" stroke={color} strokeWidth="0.02" opacity="0.5" />
      <text 
        y="0.25" 
        fontSize="0.1" 
        fill="white" 
        textAnchor="middle" 
        style={{ pointerEvents: 'none', fontWeight: 'bold' }}
      >
        {person.id.split('-')[1]}
      </text>
    </motion.g>
  );
}
