// Procedural item icons drawn with canvas primitives, cached per size.
'use strict';

const Icons = (() => {
  const cache = new Map();
  const urlCache = new Map();

  function shade(hex, amt) {
    let c = hex.replace('#', '');
    if (c.length === 3) c = c.split('').map(x => x + x).join('');
    const num = parseInt(c, 16);
    let r = (num >> 16) & 255, g = (num >> 8) & 255, b = num & 255;
    if (amt >= 0) { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
    else { r *= 1 + amt; g *= 1 + amt; b *= 1 + amt; }
    return `rgb(${r | 0},${g | 0},${b | 0})`;
  }

  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // Draw icon into a unit box [0,1]x[0,1] (ctx already scaled)
  function drawShape(ctx, it) {
    const c = it.color, c2 = it.c2 || shade(c, -0.35);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.lineWidth = 0.06;
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    switch (it.shape) {
      case 'ore': {
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.moveTo(0.18, 0.62); ctx.lineTo(0.28, 0.3); ctx.lineTo(0.55, 0.18); ctx.lineTo(0.8, 0.35);
        ctx.lineTo(0.85, 0.66); ctx.lineTo(0.6, 0.84); ctx.lineTo(0.3, 0.8); ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = shade(c, 0.3);
        ctx.beginPath(); ctx.moveTo(0.3, 0.33); ctx.lineTo(0.55, 0.22); ctx.lineTo(0.6, 0.45); ctx.lineTo(0.38, 0.5); ctx.closePath(); ctx.fill();
        ctx.fillStyle = c2;
        [[0.62, 0.6], [0.35, 0.65], [0.7, 0.42]].forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x, y, 0.05, 0, 7); ctx.fill(); });
        break;
      }
      case 'ingot': {
        ctx.fillStyle = shade(c, -0.25);
        ctx.beginPath(); ctx.moveTo(0.12, 0.7); ctx.lineTo(0.88, 0.7); ctx.lineTo(0.76, 0.38); ctx.lineTo(0.24, 0.38); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = shade(c, 0.25);
        ctx.beginPath(); ctx.moveTo(0.24, 0.38); ctx.lineTo(0.76, 0.38); ctx.lineTo(0.68, 0.46); ctx.lineTo(0.32, 0.46); ctx.closePath(); ctx.fill();
        ctx.fillStyle = c; ctx.fillRect(0.3, 0.47, 0.4, 0.2);
        break;
      }
      case 'plate': {
        ctx.fillStyle = c; rr(ctx, 0.16, 0.16, 0.68, 0.68, 0.06); ctx.fill(); ctx.stroke();
        ctx.fillStyle = shade(c, 0.3); ctx.fillRect(0.22, 0.22, 0.56, 0.08);
        ctx.fillStyle = shade(c, -0.2); ctx.fillRect(0.22, 0.7, 0.56, 0.06);
        break;
      }
      case 'rod': {
        ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 0.2;
        ctx.beginPath(); ctx.moveTo(0.22, 0.78); ctx.lineTo(0.78, 0.22); ctx.stroke();
        ctx.strokeStyle = c; ctx.lineWidth = 0.13; ctx.stroke();
        ctx.strokeStyle = shade(c, 0.4); ctx.lineWidth = 0.04;
        ctx.beginPath(); ctx.moveTo(0.26, 0.7); ctx.lineTo(0.7, 0.26); ctx.stroke();
        break;
      }
      case 'screw': {
        ctx.fillStyle = c;
        ctx.beginPath(); ctx.arc(0.5, 0.26, 0.16, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillRect(0.42, 0.26, 0.16, 0.5); ctx.strokeRect(0.42, 0.26, 0.16, 0.5);
        ctx.strokeStyle = shade(c, -0.4); ctx.lineWidth = 0.035;
        for (let i = 0; i < 5; i++) { const y = 0.33 + i * 0.09; ctx.beginPath(); ctx.moveTo(0.38, y + 0.03); ctx.lineTo(0.62, y); ctx.stroke(); }
        ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(0.42, 0.76); ctx.lineTo(0.58, 0.76); ctx.lineTo(0.5, 0.86); ctx.fill();
        break;
      }
      case 'wire': {
        ctx.strokeStyle = shade(c, -0.4); ctx.lineWidth = 0.1;
        for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(0.5, 0.5, 0.32 - i * 0.08, 0.24 - i * 0.06, 0, 0, 7); ctx.stroke(); }
        ctx.strokeStyle = c; ctx.lineWidth = 0.06;
        for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(0.5, 0.5, 0.32 - i * 0.08, 0.24 - i * 0.06, 0, 0, 7); ctx.stroke(); }
        break;
      }
      case 'cable': {
        ctx.strokeStyle = '#111'; ctx.lineWidth = 0.18;
        ctx.beginPath(); ctx.ellipse(0.5, 0.5, 0.28, 0.22, 0, 0, 7); ctx.stroke();
        ctx.strokeStyle = c2; ctx.lineWidth = 0.13; ctx.stroke();
        ctx.fillStyle = c; ctx.beginPath(); ctx.arc(0.78, 0.5, 0.07, 0, 7); ctx.fill();
        break;
      }
      case 'block': {
        ctx.fillStyle = shade(c, 0.25);
        ctx.beginPath(); ctx.moveTo(0.5, 0.14); ctx.lineTo(0.86, 0.32); ctx.lineTo(0.5, 0.5); ctx.lineTo(0.14, 0.32); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = c;
        ctx.beginPath(); ctx.moveTo(0.14, 0.32); ctx.lineTo(0.5, 0.5); ctx.lineTo(0.5, 0.88); ctx.lineTo(0.14, 0.7); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = shade(c, -0.25);
        ctx.beginPath(); ctx.moveTo(0.86, 0.32); ctx.lineTo(0.5, 0.5); ctx.lineTo(0.5, 0.88); ctx.lineTo(0.86, 0.7); ctx.closePath(); ctx.fill(); ctx.stroke();
        break;
      }
      case 'sheet': {
        ctx.fillStyle = c;
        ctx.beginPath(); ctx.moveTo(0.14, 0.62); ctx.lineTo(0.56, 0.84); ctx.lineTo(0.86, 0.38); ctx.lineTo(0.44, 0.16); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = shade(c, 0.4); ctx.lineWidth = 0.04;
        ctx.beginPath(); ctx.moveTo(0.46, 0.24); ctx.lineTo(0.78, 0.4); ctx.stroke();
        break;
      }
      case 'rip': {
        ctx.fillStyle = shade(c, -0.15); rr(ctx, 0.12, 0.12, 0.76, 0.76, 0.08); ctx.fill(); ctx.stroke();
        ctx.fillStyle = shade(c, 0.15); rr(ctx, 0.22, 0.22, 0.56, 0.56, 0.05); ctx.fill();
        ctx.fillStyle = '#ff9a3c';
        [[0.2, 0.2], [0.8, 0.2], [0.2, 0.8], [0.8, 0.8]].forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x, y, 0.06, 0, 7); ctx.fill(); });
        break;
      }
      case 'rotor': {
        ctx.fillStyle = c;
        for (let i = 0; i < 4; i++) {
          ctx.save(); ctx.translate(0.5, 0.5); ctx.rotate(i * Math.PI / 2 + 0.4);
          ctx.beginPath(); ctx.ellipse(0.2, 0, 0.2, 0.08, 0, 0, 7); ctx.fill(); ctx.stroke(); ctx.restore();
        }
        ctx.fillStyle = c2; ctx.beginPath(); ctx.arc(0.5, 0.5, 0.11, 0, 7); ctx.fill(); ctx.stroke();
        break;
      }
      case 'frame': {
        ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 0.16;
        ctx.strokeRect(0.2, 0.2, 0.6, 0.6);
        ctx.beginPath(); ctx.moveTo(0.2, 0.2); ctx.lineTo(0.8, 0.8); ctx.stroke();
        ctx.strokeStyle = c; ctx.lineWidth = 0.1;
        ctx.strokeRect(0.2, 0.2, 0.6, 0.6);
        ctx.beginPath(); ctx.moveTo(0.2, 0.2); ctx.lineTo(0.8, 0.8); ctx.stroke();
        ctx.fillStyle = '#ff9a3c'; [[0.2, 0.2], [0.8, 0.8], [0.8, 0.2], [0.2, 0.8]].forEach(([x, y]) => ctx.fillRect(x - 0.05, y - 0.05, 0.1, 0.1));
        break;
      }
      case 'smart': {
        ctx.fillStyle = c; rr(ctx, 0.12, 0.2, 0.76, 0.6, 0.08); ctx.fill(); ctx.stroke();
        ctx.fillStyle = c2; rr(ctx, 0.36, 0.34, 0.28, 0.32, 0.04); ctx.fill();
        ctx.strokeStyle = shade(c2, 0.5); ctx.lineWidth = 0.03;
        ctx.beginPath(); ctx.moveTo(0.18, 0.5); ctx.lineTo(0.36, 0.5); ctx.moveTo(0.64, 0.5); ctx.lineTo(0.82, 0.5); ctx.stroke();
        break;
      }
      case 'beam': {
        ctx.fillStyle = c;
        ctx.fillRect(0.14, 0.28, 0.72, 0.1); ctx.fillRect(0.14, 0.62, 0.72, 0.1); ctx.fillRect(0.14, 0.36, 0.72, 0.28);
        ctx.fillStyle = shade(c, 0.25); ctx.fillRect(0.14, 0.28, 0.72, 0.05);
        ctx.fillStyle = shade(c, -0.3); ctx.fillRect(0.14, 0.4, 0.72, 0.2);
        ctx.strokeRect(0.14, 0.28, 0.72, 0.44);
        break;
      }
      case 'pipe': {
        ctx.fillStyle = c; ctx.fillRect(0.2, 0.34, 0.6, 0.32); ctx.strokeRect(0.2, 0.34, 0.6, 0.32);
        ctx.fillStyle = shade(c, 0.35); ctx.fillRect(0.2, 0.37, 0.6, 0.07);
        ctx.fillStyle = shade(c, -0.1); ctx.beginPath(); ctx.ellipse(0.8, 0.5, 0.07, 0.16, 0, 0, 7); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#222'; ctx.beginPath(); ctx.ellipse(0.8, 0.5, 0.035, 0.09, 0, 0, 7); ctx.fill();
        break;
      }
      case 'eib': {
        ctx.fillStyle = c; rr(ctx, 0.12, 0.26, 0.76, 0.48, 0.05); ctx.fill(); ctx.stroke();
        ctx.fillStyle = c2; ctx.fillRect(0.12, 0.4, 0.76, 0.2);
        ctx.fillStyle = shade(c2, -0.3); ctx.fillRect(0.12, 0.46, 0.76, 0.08);
        break;
      }
      case 'stator': {
        ctx.fillStyle = c; rr(ctx, 0.18, 0.24, 0.64, 0.52, 0.1); ctx.fill(); ctx.stroke();
        ctx.fillStyle = c2; for (let i = 0; i < 5; i++) ctx.fillRect(0.24 + i * 0.11, 0.28, 0.07, 0.44);
        break;
      }
      case 'motor': {
        ctx.fillStyle = c2; ctx.fillRect(0.72, 0.44, 0.16, 0.12);
        ctx.fillStyle = c; rr(ctx, 0.14, 0.24, 0.6, 0.52, 0.12); ctx.fill(); ctx.stroke();
        ctx.fillStyle = shade(c, -0.3); for (let i = 0; i < 4; i++) ctx.fillRect(0.22 + i * 0.12, 0.3, 0.05, 0.4);
        break;
      }
      case 'vf': {
        ctx.strokeStyle = c; ctx.lineWidth = 0.12;
        ctx.beginPath(); ctx.moveTo(0.15, 0.8); ctx.lineTo(0.5, 0.2); ctx.lineTo(0.85, 0.8); ctx.closePath(); ctx.stroke();
        ctx.strokeStyle = c2; ctx.lineWidth = 0.07;
        ctx.beginPath(); ctx.moveTo(0.32, 0.5); ctx.lineTo(0.68, 0.5); ctx.moveTo(0.5, 0.2); ctx.lineTo(0.5, 0.8); ctx.stroke();
        break;
      }
      case 'aw': {
        ctx.fillStyle = '#6c7a88'; rr(ctx, 0.3, 0.3, 0.4, 0.4, 0.06); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = c; ctx.lineWidth = 0.07;
        ctx.beginPath(); ctx.ellipse(0.5, 0.5, 0.34, 0.34, 0, 0, 7); ctx.stroke();
        ctx.strokeStyle = c2; ctx.lineWidth = 0.05;
        ctx.beginPath(); ctx.ellipse(0.5, 0.5, 0.26, 0.26, 0, 0, 7); ctx.stroke();
        break;
      }
      case 'leaf': {
        ctx.fillStyle = c;
        ctx.beginPath(); ctx.moveTo(0.2, 0.8); ctx.quadraticCurveTo(0.2, 0.2, 0.82, 0.18); ctx.quadraticCurveTo(0.8, 0.8, 0.2, 0.8); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = shade(c, -0.4); ctx.lineWidth = 0.04;
        ctx.beginPath(); ctx.moveTo(0.22, 0.78); ctx.lineTo(0.7, 0.3); ctx.stroke();
        break;
      }
      case 'wood': {
        ctx.fillStyle = c; ctx.fillRect(0.16, 0.34, 0.6, 0.32); ctx.strokeRect(0.16, 0.34, 0.6, 0.32);
        ctx.fillStyle = '#d9a86a'; ctx.beginPath(); ctx.ellipse(0.76, 0.5, 0.09, 0.16, 0, 0, 7); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = '#8b5a2b'; ctx.lineWidth = 0.025; ctx.beginPath(); ctx.ellipse(0.76, 0.5, 0.04, 0.08, 0, 0, 7); ctx.stroke();
        break;
      }
      case 'barrel': {
        ctx.fillStyle = c; rr(ctx, 0.24, 0.14, 0.52, 0.72, 0.1); ctx.fill(); ctx.stroke();
        ctx.fillStyle = c2; ctx.fillRect(0.24, 0.3, 0.52, 0.06); ctx.fillRect(0.24, 0.64, 0.52, 0.06);
        ctx.fillStyle = shade(c2, 0.3); ctx.fillRect(0.32, 0.4, 0.08, 0.2);
        break;
      }
      case 'rubber': {
        ctx.fillStyle = c; rr(ctx, 0.16, 0.26, 0.68, 0.48, 0.2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = shade(c, 0.25); rr(ctx, 0.24, 0.32, 0.4, 0.1, 0.05); ctx.fill();
        break;
      }
      case 'circuit': {
        ctx.fillStyle = c; rr(ctx, 0.14, 0.2, 0.72, 0.6, 0.05); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = c2; ctx.lineWidth = 0.03;
        ctx.beginPath(); ctx.moveTo(0.2, 0.34); ctx.lineTo(0.45, 0.34); ctx.lineTo(0.55, 0.46); ctx.lineTo(0.8, 0.46);
        ctx.moveTo(0.2, 0.62); ctx.lineTo(0.4, 0.62); ctx.lineTo(0.5, 0.7); ctx.lineTo(0.8, 0.7); ctx.stroke();
        ctx.fillStyle = '#222'; ctx.fillRect(0.56, 0.52, 0.18, 0.12);
        break;
      }
      case 'computer': {
        ctx.fillStyle = c; rr(ctx, 0.14, 0.16, 0.72, 0.56, 0.06); ctx.fill(); ctx.stroke();
        ctx.fillStyle = c2; ctx.fillRect(0.2, 0.22, 0.6, 0.4);
        ctx.fillStyle = shade(c2, 0.5); ctx.fillRect(0.24, 0.28, 0.3, 0.05); ctx.fillRect(0.24, 0.38, 0.4, 0.05);
        ctx.fillStyle = c; ctx.fillRect(0.4, 0.72, 0.2, 0.08); ctx.fillRect(0.28, 0.8, 0.44, 0.06);
        break;
      }
      case 'hmf': {
        ctx.fillStyle = c; rr(ctx, 0.12, 0.12, 0.76, 0.76, 0.06); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#20252c'; ctx.fillRect(0.26, 0.26, 0.48, 0.48);
        ctx.strokeStyle = c2; ctx.lineWidth = 0.08; ctx.beginPath(); ctx.moveTo(0.26, 0.26); ctx.lineTo(0.74, 0.74); ctx.moveTo(0.74, 0.26); ctx.lineTo(0.26, 0.74); ctx.stroke();
        break;
      }
      case 'engine': {
        ctx.fillStyle = shade(c, -0.3); rr(ctx, 0.12, 0.3, 0.76, 0.46, 0.08); ctx.fill(); ctx.stroke();
        ctx.fillStyle = c; rr(ctx, 0.2, 0.18, 0.6, 0.3, 0.06); ctx.fill(); ctx.stroke();
        ctx.fillStyle = c2; ctx.beginPath(); ctx.arc(0.5, 0.56, 0.1, 0, 7); ctx.fill();
        break;
      }
      case 'acu': {
        ctx.fillStyle = c;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; ctx.lineTo(0.5 + Math.cos(a) * 0.38, 0.5 + Math.sin(a) * 0.38); }
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = c2; ctx.beginPath(); ctx.arc(0.5, 0.5, 0.14, 0, 7); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0.46, 0.46, 0.04, 0, 7); ctx.fill();
        break;
      }
      case 'chip': {
        ctx.fillStyle = '#2e333b'; rr(ctx, 0.24, 0.24, 0.52, 0.52, 0.05); ctx.fill(); ctx.stroke();
        ctx.fillStyle = c2; for (let i = 0; i < 4; i++) { ctx.fillRect(0.28 + i * 0.12, 0.14, 0.05, 0.1); ctx.fillRect(0.28 + i * 0.12, 0.76, 0.05, 0.1); }
        ctx.fillStyle = c; ctx.fillRect(0.36, 0.36, 0.28, 0.28);
        break;
      }
      case 'hsc': {
        ctx.fillStyle = c2; rr(ctx, 0.14, 0.34, 0.5, 0.32, 0.05); ctx.fill(); ctx.stroke();
        ctx.fillStyle = c; for (let i = 0; i < 3; i++) ctx.fillRect(0.64, 0.37 + i * 0.1, 0.22, 0.05);
        ctx.fillStyle = '#4fb3ff'; ctx.fillRect(0.2, 0.42, 0.3, 0.06);
        break;
      }
      case 'super': {
        ctx.fillStyle = c; rr(ctx, 0.18, 0.1, 0.64, 0.8, 0.06); ctx.fill(); ctx.stroke();
        for (let i = 0; i < 4; i++) {
          ctx.fillStyle = i % 2 ? c2 : '#4fb3ff'; ctx.fillRect(0.26, 0.18 + i * 0.17, 0.48, 0.1);
        }
        break;
      }
      case 'glass': {
        ctx.fillStyle = 'rgba(159,227,255,0.55)';
        rr(ctx, 0.18, 0.14, 0.64, 0.72, 0.05); ctx.fill();
        ctx.strokeStyle = shade(c, -0.3); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 0.05;
        ctx.beginPath(); ctx.moveTo(0.3, 0.45); ctx.lineTo(0.5, 0.25); ctx.moveTo(0.38, 0.58); ctx.lineTo(0.66, 0.3); ctx.stroke();
        break;
      }
      case 'battery': {
        ctx.fillStyle = c2; rr(ctx, 0.26, 0.2, 0.48, 0.66, 0.06); ctx.fill(); ctx.stroke();
        ctx.fillStyle = c2; ctx.fillRect(0.42, 0.12, 0.16, 0.08);
        ctx.fillStyle = c; ctx.fillRect(0.31, 0.5, 0.38, 0.31);
        ctx.fillStyle = '#fff'; ctx.fillRect(0.46, 0.3, 0.08, 0.14); ctx.fillRect(0.43, 0.33, 0.14, 0.08);
        break;
      }
      case 'speaker': {
        ctx.fillStyle = c; rr(ctx, 0.2, 0.12, 0.6, 0.76, 0.08); ctx.fill(); ctx.stroke();
        ctx.fillStyle = c2; ctx.beginPath(); ctx.arc(0.5, 0.6, 0.17, 0, 7); ctx.fill();
        ctx.fillStyle = '#1b1f25'; ctx.beginPath(); ctx.arc(0.5, 0.6, 0.07, 0, 7); ctx.fill();
        ctx.fillStyle = c2; ctx.beginPath(); ctx.arc(0.5, 0.28, 0.07, 0, 7); ctx.fill();
        break;
      }
      case 'display': {
        ctx.fillStyle = c; rr(ctx, 0.1, 0.24, 0.8, 0.52, 0.04); ctx.fill(); ctx.stroke();
        const g = ctx.createLinearGradient(0.14, 0.28, 0.86, 0.72);
        g.addColorStop(0, c2); g.addColorStop(1, '#c77dff');
        ctx.fillStyle = g; ctx.fillRect(0.15, 0.29, 0.7, 0.42);
        ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.moveTo(0.15, 0.29); ctx.lineTo(0.4, 0.29); ctx.lineTo(0.15, 0.55); ctx.fill();
        break;
      }
      case 'camera': {
        ctx.fillStyle = c; rr(ctx, 0.14, 0.26, 0.72, 0.5, 0.08); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#9aa3ad'; ctx.beginPath(); ctx.arc(0.5, 0.51, 0.19, 0, 7); ctx.fill();
        ctx.fillStyle = c2; ctx.beginPath(); ctx.arc(0.5, 0.51, 0.12, 0, 7); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0.46, 0.47, 0.035, 0, 7); ctx.fill();
        ctx.fillStyle = '#ff5a5a'; ctx.beginPath(); ctx.arc(0.76, 0.34, 0.035, 0, 7); ctx.fill();
        break;
      }
      case 'tv': {
        ctx.fillStyle = '#6c7a88'; ctx.fillRect(0.44, 0.7, 0.12, 0.1); ctx.fillRect(0.3, 0.8, 0.4, 0.05);
        ctx.fillStyle = c; rr(ctx, 0.06, 0.16, 0.88, 0.56, 0.05); ctx.fill(); ctx.stroke();
        const g = ctx.createLinearGradient(0, 0.2, 0, 0.68);
        g.addColorStop(0, c2); g.addColorStop(1, '#2fd4b4');
        ctx.fillStyle = g; ctx.fillRect(0.11, 0.21, 0.78, 0.46);
        ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.moveTo(0.44, 0.34); ctx.lineTo(0.6, 0.44); ctx.lineTo(0.44, 0.54); ctx.fill();
        break;
      }
      case 'phone': {
        ctx.fillStyle = c; rr(ctx, 0.28, 0.08, 0.44, 0.84, 0.08); ctx.fill(); ctx.stroke();
        const g = ctx.createLinearGradient(0.3, 0.14, 0.7, 0.84);
        g.addColorStop(0, c2); g.addColorStop(1, '#c77dff');
        ctx.fillStyle = g; rr(ctx, 0.32, 0.14, 0.36, 0.7, 0.04); ctx.fill();
        ctx.fillStyle = c; rr(ctx, 0.44, 0.15, 0.12, 0.04, 0.02); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.8)'; [[0.4, 0.3], [0.5, 0.3], [0.6, 0.3], [0.4, 0.42], [0.5, 0.42]].forEach(([x, y]) => ctx.fillRect(x - 0.03, y - 0.03, 0.06, 0.06));
        break;
      }
      case 'laptop': {
        ctx.fillStyle = shade(c, -0.3); rr(ctx, 0.18, 0.14, 0.64, 0.46, 0.04); ctx.fill(); ctx.stroke();
        ctx.fillStyle = c2; ctx.fillRect(0.22, 0.18, 0.56, 0.38);
        ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(0.26, 0.24, 0.3, 0.05); ctx.fillRect(0.26, 0.33, 0.4, 0.05);
        ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(0.12, 0.62); ctx.lineTo(0.88, 0.62); ctx.lineTo(0.96, 0.78); ctx.lineTo(0.04, 0.78); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = shade(c, -0.25); ctx.fillRect(0.4, 0.66, 0.2, 0.04);
        break;
      }
      case 'console': {
        ctx.fillStyle = c;
        ctx.beginPath(); ctx.moveTo(0.2, 0.34); ctx.lineTo(0.8, 0.34); ctx.quadraticCurveTo(0.96, 0.36, 0.92, 0.66); ctx.quadraticCurveTo(0.88, 0.82, 0.74, 0.72);
        ctx.lineTo(0.26, 0.72); ctx.quadraticCurveTo(0.12, 0.82, 0.08, 0.66); ctx.quadraticCurveTo(0.04, 0.36, 0.2, 0.34); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#2e333b'; ctx.fillRect(0.2, 0.47, 0.14, 0.05); ctx.fillRect(0.245, 0.425, 0.05, 0.14);
        ctx.fillStyle = c2; ctx.beginPath(); ctx.arc(0.7, 0.45, 0.04, 0, 7); ctx.fill();
        ctx.fillStyle = '#4fb3ff'; ctx.beginPath(); ctx.arc(0.78, 0.53, 0.04, 0, 7); ctx.fill();
        ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(0.62, 0.53, 0.04, 0, 7); ctx.fill();
        break;
      }
      case 'powder': {
        ctx.fillStyle = shade(c, -0.15);
        ctx.beginPath(); ctx.moveTo(0.12, 0.78); ctx.quadraticCurveTo(0.5, 0.12, 0.88, 0.78); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = c2;
        [[0.4, 0.5], [0.55, 0.62], [0.5, 0.4], [0.64, 0.7], [0.32, 0.68]].forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x, y, 0.035, 0, 7); ctx.fill(); });
        break;
      }
      case 'ammo': {
        for (let k = 0; k < 3; k++) {
          const x = 0.24 + k * 0.2;
          ctx.fillStyle = c; ctx.fillRect(x, 0.42, 0.14, 0.42); ctx.strokeRect(x, 0.42, 0.14, 0.42);
          ctx.fillStyle = c2; ctx.beginPath(); ctx.moveTo(x, 0.42); ctx.quadraticCurveTo(x + 0.07, 0.1, x + 0.14, 0.42); ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.fillStyle = shade(c, 0.4); ctx.fillRect(x + 0.02, 0.48, 0.03, 0.3);
        }
        break;
      }
      case 'rifle': {
        ctx.save(); ctx.translate(0.5, 0.5); ctx.rotate(-0.5); ctx.translate(-0.5, -0.5);
        ctx.fillStyle = c2; ctx.beginPath(); ctx.moveTo(0.06, 0.5); ctx.lineTo(0.3, 0.46); ctx.lineTo(0.3, 0.6); ctx.lineTo(0.1, 0.66); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = c; ctx.fillRect(0.28, 0.44, 0.4, 0.1); ctx.strokeRect(0.28, 0.44, 0.4, 0.1);
        ctx.fillRect(0.66, 0.46, 0.28, 0.05);
        ctx.fillRect(0.42, 0.54, 0.07, 0.14);
        ctx.fillStyle = '#ff4a4a'; ctx.fillRect(0.45, 0.39, 0.12, 0.05);
        ctx.restore();
        break;
      }
      case 'drone': {
        ctx.strokeStyle = c; ctx.lineWidth = 0.07;
        ctx.beginPath(); ctx.moveTo(0.22, 0.22); ctx.lineTo(0.78, 0.78); ctx.moveTo(0.78, 0.22); ctx.lineTo(0.22, 0.78); ctx.stroke();
        ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 0.04;
        [[0.22, 0.22], [0.78, 0.22], [0.22, 0.78], [0.78, 0.78]].forEach(([x, y]) => { ctx.fillStyle = '#d9dde2'; ctx.beginPath(); ctx.ellipse(x, y, 0.13, 0.05, 0.6, 0, 7); ctx.fill(); ctx.stroke(); });
        ctx.fillStyle = c; ctx.beginPath(); ctx.arc(0.5, 0.5, 0.15, 0, 7); ctx.fill(); ctx.stroke();
        ctx.fillStyle = c2; ctx.beginPath(); ctx.arc(0.5, 0.5, 0.06, 0, 7); ctx.fill();
        break;
      }
      case 'tank': {
        ctx.fillStyle = '#2a2f37'; rr(ctx, 0.1, 0.58, 0.8, 0.2, 0.08); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#6c7a88'; [0.22, 0.38, 0.54, 0.7].forEach(x => { ctx.beginPath(); ctx.arc(x + 0.04, 0.68, 0.05, 0, 7); ctx.fill(); });
        ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(0.12, 0.58); ctx.lineTo(0.2, 0.44); ctx.lineTo(0.8, 0.44); ctx.lineTo(0.88, 0.58); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = c2; rr(ctx, 0.34, 0.3, 0.3, 0.15, 0.05); ctx.fill(); ctx.stroke();
        ctx.fillStyle = c2; ctx.fillRect(0.62, 0.34, 0.3, 0.05);
        break;
      }
      default: {
        ctx.fillStyle = c; ctx.beginPath(); ctx.arc(0.5, 0.5, 0.3, 0, 7); ctx.fill(); ctx.stroke();
      }
    }
  }

  function get(id, size) {
    const key = id + '@' + size;
    let cv = cache.get(key);
    if (cv) return cv;
    cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const ctx = cv.getContext('2d');
    ctx.scale(size, size);
    const it = ITEMS[id];
    if (it) drawShape(ctx, it);
    cache.set(key, cv);
    return cv;
  }

  function url(id) {
    let u = urlCache.get(id);
    if (!u) { u = get(id, 48).toDataURL(); urlCache.set(id, u); }
    return u;
  }

  function img(id, cls) {
    return `<img class="${cls || 'ico'}" src="${url(id)}" alt="">`;
  }

  return { get, url, img, shade, rr };
})();
