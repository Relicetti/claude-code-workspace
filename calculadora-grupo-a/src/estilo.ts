import type React from 'react';

// ── PALETA (mesma da calculadora-parceria) ───────────────────────────────────
export const C = {
  azul: '#2a78d6', azulC: '#e6f1fb',
  verde: '#1baf7a', verdeC: '#eaf3de',
  amber: '#eda100', amberC: '#faeeda',
  verm: '#e34948', vermC: '#fcebeb',
  esc: '#2c2c2a', med: '#5f5e5a',
  clar: '#f4f3ed', bord: '#d3d1c7',
};

export const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', borderRadius: 6, border: `1px solid ${C.bord}`,
  fontSize: 13, background: '#fff', color: C.esc,
};

export const thStyle: React.CSSProperties = { textAlign: 'right', padding: '6px 8px', fontSize: 11, color: C.med, fontWeight: 600, borderBottom: `1px solid ${C.bord}` };
export const tdStyle: React.CSSProperties = { textAlign: 'right', padding: '6px 8px', fontSize: 12, borderBottom: `1px solid ${C.clar}` };
export const thL: React.CSSProperties = { ...thStyle, textAlign: 'left' };
export const tdL: React.CSSProperties = { ...tdStyle, textAlign: 'left' };

export const botao = (cor?: string): React.CSSProperties => ({
  padding: '8px 14px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
  ...(cor ? { border: 'none', background: cor, color: '#fff', fontWeight: 600 } : { border: `1px solid ${C.bord}`, background: '#fff' }),
});

export const cartao: React.CSSProperties = { background: '#fff', borderRadius: 10, padding: 18 };
