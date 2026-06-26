import { deflateRaw } from 'pako';

function encode6bit(b) {
  if (b < 10) return String.fromCharCode(48 + b);
  b -= 10;
  if (b < 26) return String.fromCharCode(65 + b);
  b -= 26;
  if (b < 26) return String.fromCharCode(97 + b);
  b -= 26;
  return b === 0 ? '-' : '_';
}

function encode3bytes(b1, b2, b3) {
  const c1 = b1 >> 2;
  const c2 = ((b1 & 0x3) << 4) | (b2 >> 4);
  const c3 = ((b2 & 0xf) << 2) | (b3 >> 6);
  const c4 = b3 & 0x3f;
  return encode6bit(c1) + encode6bit(c2) + encode6bit(c3) + encode6bit(c4);
}

function encodePlantuml(bytes) {
  let r = '';
  for (let i = 0; i < bytes.length; i += 3) {
    if (i + 2 === bytes.length) {
      r += encode3bytes(bytes[i], bytes[i + 1], 0);
    } else if (i + 1 === bytes.length) {
      r += encode3bytes(bytes[i], 0, 0);
    } else {
      r += encode3bytes(bytes[i], bytes[i + 1], bytes[i + 2]);
    }
  }
  return r;
}

export function getUrl(source) {
  const bytes = new TextEncoder().encode(source);
  const compressed = deflateRaw(bytes, { level: 9 });
  return `https://www.plantuml.com/plantuml/svg/${encodePlantuml(compressed)}`;
}
