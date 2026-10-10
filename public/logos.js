"use strict";

const PROVIDER_COLORS = {
  openai: "#000000",
  anthropic: "#D4A27F",
  gemini: "#4285F4",
  openrouter: "#6467F2",
  groq: "#F55036"
};

// Hexagone regulier centre sur (12,12), circumradius r.
function hexPoints(cx, cy, r) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    pts.push((cx + r * Math.cos(a)).toFixed(2) + "," + (cy + r * Math.sin(a)).toFixed(2));
  }
  return pts.join(" ");
}

const PROVIDER_LOGOS = {
  // OpenAI : double anneau hexagonal concentrique.
  openai: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">'
    + '<polygon fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" points="'
    + hexPoints(12, 12, 9.4) + '"/>'
    + '<polygon fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" points="'
    + hexPoints(12, 12, 4.2) + '"/>'
    + '<circle cx="12" cy="12" r="1.5" fill="currentColor"/>'
    + '</svg>',
  anthropic: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">'
    + '<path fill="none" stroke="currentColor" stroke-width="2.2" '
    + 'stroke-linejoin="miter" stroke-linecap="butt" '
    + 'd="M6.4 19.4 L12 4.6 L17.6 19.4"/>'
    + '<path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="butt" '
    + 'd="M9.3 14.2 L14.7 14.2"/>'
    + '</svg>',

  // Gemini : l'etoile a quatre branches.
  gemini: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">'
    + '<path fill="currentColor" d="M12 1.8c.6 4.1 1.9 5.4 6 6-4.1.6-5.4 1.9-6 6-.6-4.1-1.9-5.4-6-6 4.1-.6 5.4-1.9 6-6z"/>'
    + '<path fill="currentColor" d="M19 12.4c.4 2.6 1.2 3.4 3.8 3.8-2.6.4-3.4 1.2-3.8 3.8-.4-2.6-1.2-3.4-3.8-3.8 2.6-.4 3.4-1.2 3.8-3.8z" opacity=".65"/>'
    + '</svg>',

  // OpenRouter : anneau ouvert en haut, plus un carre plein au centre.
  // L'ouverture vient d'un stroke-dasharray plutot que d'un mask ou d'un rect
  // blanc : un masque exigerait un id, qui dupliquerait des le premier logo
  // affiche en double, et un rect blanc disparait sur fond blanc.
  openrouter: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">'
    + '<circle cx="12" cy="12" r="8.6" fill="none" stroke="currentColor" stroke-width="2"'
    + ' stroke-linecap="butt"'
    + ' stroke-dasharray="43 11"'
    + ' transform="rotate(-95 12 12)"/>'
    + '<rect x="10.2" y="10.2" width="3.6" height="3.6" fill="currentColor"/>'
    + '</svg>',

  // Groq : grille de pastilles, evoquant les puces.
  groq: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">'
    + '<rect x="3" y="3" width="7.2" height="7.2" rx="1" fill="currentColor"/>'
    + '<rect x="13.8" y="3" width="7.2" height="7.2" rx="1" fill="currentColor"/>'
    + '<rect x="3" y="13.8" width="7.2" height="7.2" rx="1" fill="currentColor"/>'
    + '<rect x="13.8" y="13.8" width="7.2" height="7.2" rx="1" fill="currentColor"/>'
    + '</svg>'
};

if (typeof window !== "undefined") {
  window.PROVIDER_LOGOS = PROVIDER_LOGOS;
  window.PROVIDER_COLORS = PROVIDER_COLORS;
}
