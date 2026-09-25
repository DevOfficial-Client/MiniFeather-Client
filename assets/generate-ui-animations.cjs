const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { icons, makeArt, encodeArt } = require('./generate-ui-pixel-icons.cjs');

const root = path.resolve(__dirname, 'ui');
const source = fs.readFileSync(path.join(__dirname, '../src/UI/ClientPanel.js'), 'utf8');
const match = source.match(/const MF_ANIMATED_PIXEL_ICONS = Object\.freeze\((\[[\s\S]*?\])\);/);
if (!match) throw new Error('MF_ANIMATED_PIXEL_ICONS was not found');
const names = vm.runInNewContext(match[1]);

function poseIcon(name, original, frame) {
  const art = original.map(row => row.slice());
  const swing = [0, 1, 2, 1, -1, -2][frame];
  const lift = [0, -1, -2, -1, 0, 1][frame];
  const dot = (x, y, color) => {
    if (x >= 0 && x < 16 && y >= 0 && y < 16) art[y][x] = color;
  };
  const rect = (x, y, w, h, color) => {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) dot(xx, yy, color);
  };
  const line = (x0, y0, x1, y1, color) => {
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    while (true) {
      dot(x0, y0, color);
      if (x0 === x1 && y0 === y1) break;
      const twice = err * 2;
      if (twice > -dy) { err -= dy; x0 += sx; }
      if (twice < dx) { err += dx; y0 += sy; }
    }
  };
  const move = (x, y, w, h, dx, dy, background = '.') => {
    const pixels = [];
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
      pixels.push([xx + dx, yy + dy, original[yy]?.[xx] || '.']);
    }
    rect(x, y, w, h, background);
    for (const [xx, yy, color] of pixels) if (color !== '.') dot(xx, yy, color);
  };
  const clear = () => rect(0, 0, 16, 16, '.');
  const faceBlink = (eyes, skin) => {
    if (frame === 2 || frame === 3) for (const [x, y] of eyes) {
      rect(x, y, 2, 2, skin);
      rect(x, y + 1, 2, 1, 'k');
    }
  };

  switch (name) {
    case 'keystrokes': {
      const keys = [[7, 3], [2, 10], [7, 10], [12, 10]];
      const active = keys[(frame - 1) % keys.length];
      rect(active[0] - 1, active[1] - 1, 4, 4, 'B');
      rect(active[0], active[1], 2, 2, 'y');
      if (frame === 5) rect(7, 10, 2, 2, 'g');
      break;
    }
    case 'fpsCounter': {
      rect(3, 3, 10, 8, 'B');
      const heights = [[2, 4, 3, 6, 8], [3, 5, 4, 7, 6], [5, 3, 7, 4, 8], [4, 7, 5, 8, 6], [6, 4, 8, 5, 7]][frame - 1];
      heights.forEach((height, i) => rect(3 + i * 2, 11 - height, 1, height, i === 4 ? 't' : 'g'));
      break;
    }
    case 'cpsCounter': {
      rect(4, 5, 8, 6, 'b');
      rect(7, 3 + Math.max(0, swing), 2, 4, 'k');
      rect(7, 5 + Math.max(0, swing), 2, 1, '#');
      if (frame % 2) { dot(2, 1, 'y'); dot(13, 2, 'y'); dot(14, 5, 'y'); }
      else { dot(1, 3, 'y'); dot(12, 1, 'y'); dot(14, 4, 'y'); }
      break;
    }
    case 'pingCounter': {
      rect(1, 3, 14, 9, '.');
      const arcs = frame % 5 + 1;
      if (arcs >= 1) { rect(6, 9, 4, 1, '#'); rect(5, 10, 2, 2, '#'); rect(9, 10, 2, 2, '#'); }
      if (arcs >= 2) { rect(4, 6, 8, 1, 'b'); rect(3, 7, 2, 2, 'b'); rect(11, 7, 2, 2, 'b'); }
      if (arcs >= 3) { rect(2, 3, 12, 1, frame === 2 ? 'b' : 'B'); rect(1, 4, 2, 2, 'B'); rect(13, 4, 2, 2, 'B'); }
      if (arcs >= 4) rect(7, 12, 2, 1, 'y');
      break;
    }
    case 'guiPatch': {
      rect(4, 7, 8, 4, '#');
      rect(5, 8, 6, 2, 'B');
      if (frame < 3) { rect(frame === 1 ? 6 : 8, 7, 2, 4, 'k'); rect(5, 8, 6, 2, 'k'); }
      else { line(6, 9, 7, 10, 'g'); line(7, 10, 11, 6, 'g'); }
      dot(3 + frame * 2, 4, frame % 2 ? 'y' : 'b');
      break;
    }
    case 'armorHud': {
      rect(6, 8, 4, 5, frame % 2 ? 'B' : '#');
      line(6, 8, 8, 10, '#'); line(8, 10, 10, 7 + Math.abs(swing), '#');
      if (frame >= 3) { dot(3, 5, 'y'); dot(12, 6, 'y'); }
      break;
    }
    case 'coordinates': {
      rect(4, 5, 8, 6, 'b');
      rect(7, 5, 2, 6, '#'); rect(4, 7, 8, 2, '#');
      const ends = [[8, 5], [10, 6], [11, 8], [10, 10], [8, 10]][frame - 1];
      line(8, 8, ends[0], ends[1], 'O'); dot(8, 8, 'o');
      break;
    }
    case 'dynamicCrosshair': {
      clear();
      const reach = [0, 4, 3, 5, 2, 6][frame];
      rect(7, 8 - reach, 2, reach - 2, 'g'); rect(7, 10, 2, reach - 2, 'G');
      rect(8 - reach, 7, reach - 2, 2, 'g'); rect(10, 7, reach - 2, 2, 'G');
      rect(6, 6, 4, 4, 'R'); rect(7, 7, 2, 2, frame % 2 ? 'r' : '#');
      dot(4, 4, '#'); dot(11, 11, '#');
      break;
    }
    case 'rebrand': {
      rect(9, 4, 6, 9, '.');
      rect(9, 5 + lift, 5, 3, 'Y'); rect(10, 8 + lift, 4, 4, 'y');
      rect(11, 4 + lift, 2, 2, '#'); rect(11, 10 + lift, 2, 2, 'O');
      if (frame >= 3) line(10, 7 + lift, 14, 5 + lift, '#');
      break;
    }
    case 'titanTiny': {
      rect(10, 8, 6, 8, '.');
      const y = 8 + lift;
      rect(11, y, 3, 2, 'O'); rect(10, y + 2, 5, 4, 'o');
      rect(11, y + 6, 1, 2, 'O'); rect(13, y + 6, 1, 2, 'O');
      dot(11, y + 1, '#');
      if (frame === 4) rect(10, y + 2, 2, 2, '#');
      faceBlink([[2, 5], [5, 5]], 'b');
      break;
    }
    case 'betterPlayerLayers': {
      rect(1, 6, 3, 5, '.'); rect(12, 6, 3, 5, '.');
      rect(1, 6 + Math.max(-1, lift), 3, 5, 'P');
      rect(12, 6 - Math.min(1, lift), 3, 5, 'P');
      rect(2, 7 + Math.max(-1, lift), 2, 3, '#');
      rect(12, 7 - Math.min(1, lift), 2, 3, '#');
      rect(7, 8, 2, 3, frame % 2 ? 't' : 'b');
      break;
    }
    case 'healthNameTags': {
      const width = [0, 4, 6, 8, 10, 12][frame];
      rect(1, 4, 14, 6, 'R'); rect(3, 4, 10, 4, 'r');
      rect(5, 14, 6, 1, 'k'); rect(5, 14, Math.round(width / 2), 1, 'g');
      if (frame === 2 || frame === 5) rect(6, 11, 4, 3, 'r');
      break;
    }
    case 'distanceNameTags': {
      rect(3, 3, 10, 6, 'b');
      const marker = 3 + frame * 2;
      rect(marker, 5, 2, 2, '#');
      rect(1, 12, 14, 2, 'Y');
      for (let x = 3; x <= 12; x += 3) rect(x, 12, 1, x % 2 ? 2 : 1, '#');
      dot(Math.min(13, marker), 11, 'o');
      break;
    }
    case 'damageParticles': {
      clear();
      const radius = [0, 3, 5, 7, 6, 4][frame];
      rect(6, 6, 4, 4, 'R'); rect(7, 7, 2, 2, '#');
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0], [1, 1], [-1, 1], [-1, -1], [1, -1]]) {
        const x = 8 + dx * radius, y = 8 + dy * radius;
        rect(x, y, 2, 2, (dx + dy + frame) % 2 ? 'r' : 'R');
      }
      break;
    }
    case 'waterSplash': {
      clear();
      const ripple = [0, 1, 2, 4, 5, 3][frame];
      rect(7 - ripple, 12, 2 + ripple * 2, 2, 'B');
      rect(7 - ripple, 12, 2 + ripple * 2, 1, 'b');
      if (frame === 1) {
        rect(7, 3, 2, 4, 'b'); dot(7, 3, '#');
        rect(6, 9, 4, 2, 'b'); dot(7, 9, '#');
      } else if (frame === 2) {
        rect(6, 9, 4, 3, 'b'); rect(7, 9, 2, 1, '#');
        line(5, 11, 3, 7, 'b'); line(10, 11, 12, 7, 'b');
        dot(3, 6, '#'); dot(12, 6, '#');
      } else if (frame === 3) {
        line(5, 11, 2, 5, 'B'); line(6, 10, 3, 5, 'b');
        line(10, 11, 13, 5, 'B'); line(9, 10, 12, 5, 'b');
        rect(2, 4, 2, 2, '#'); rect(12, 4, 2, 2, '#');
        rect(7, 7, 2, 2, 'b'); dot(7, 7, '#');
      } else if (frame === 4) {
        rect(1, 7, 2, 2, 'b'); rect(13, 7, 2, 2, 'b');
        dot(2, 6, '#'); dot(13, 6, '#');
        rect(5, 6, 1, 2, 'b'); rect(10, 6, 1, 2, 'b');
        rect(7, 9, 2, 2, 'b'); dot(7, 9, '#');
      } else {
        rect(4, 10, 2, 1, 'b'); rect(10, 10, 2, 1, 'b');
        dot(5, 9, '#'); dot(10, 9, '#');
      }
      break;
    }
    case 'shineAmbience':
    case 'fullBright': {
      clear();
      const radius = name === 'fullBright' ? 5 : 4;
      rect(8 - radius, 8 - radius, radius * 2, radius * 2, name === 'fullBright' ? 'Y' : 'y');
      rect(5, 5, 6, 6, '#');
      const reach = [0, 5, 7, 6, 4, 7][frame];
      rect(7, 8 - reach, 2, reach - 3, 'y');
      rect(7, 11, 2, reach - 3, 'Y');
      rect(8 - reach, 7, reach - 3, 2, 'y');
      rect(11, 7, reach - 3, 2, 'Y');
      if (frame >= 3) for (const [x, y] of [[2, 2], [12, 2], [2, 12], [12, 12]]) dot(x, y, 'y');
      break;
    }
    case 'leafWind': {
      move(5, 2, 9, 10, swing, lift);
      rect(0, 11, 6, 4, '.');
      line(1, 10 + frame % 3, 6 + frame % 2, 10 + frame % 3, 't');
      line(0, 13, 4 + frame, 13, 'T');
      break;
    }
    case 'duckMobs': {
      faceBlink([[5, 5], [10, 5]], 'y');
      rect(6, 8, 8, 2, 'o');
      rect(8, 10, 5, frame % 2 ? 2 : 1, 'O');
      rect(2, 9 + lift, 3, 2, 'Y');
      if (frame >= 3) dot(14, 9, '#');
      break;
    }
    case 'crittersMobs': {
      rect(3, 0, 3, 5, '.'); rect(10, 0, 3, 5, '.');
      rect(3, Math.max(0, lift), 3, 6, 'N'); rect(10, Math.max(0, -lift), 3, 6, 'N');
      dot(4, Math.max(1, lift + 1), 'p'); dot(11, Math.max(1, -lift + 1), 'p');
      faceBlink([[5, 8], [10, 8]], 'n');
      break;
    }
    case 'allayPets': {
      clear();
      const tipY = [0, 2, 5, 9, 6, 3][frame];
      for (const side of [-1, 1]) {
        const rootX = side < 0 ? 4 : 11;
        const tipX = side < 0 ? 0 : 15;
        line(rootX, 7, tipX, tipY, 'B');
        line(rootX, 8, tipX, tipY + 1, 'B');
        line(rootX, 7, tipX + (side < 0 ? 1 : -1), tipY, 'b');
        dot(tipX, tipY, '#');
        if (frame >= 3) line(rootX, 9, tipX + (side < 0 ? 2 : -2), tipY + 2, 'b');
      }
      rect(4, 3 + Math.min(1, lift), 8, 9, 'B');
      rect(5, 4 + Math.min(1, lift), 6, 7, 'b');
      rect(6, 1 + Math.min(1, lift), 4, 2, '#');
      rect(7, Math.max(0, lift), 2, 1, 'y');
      rect(5, 6 + Math.min(1, lift), 2, 2, 'k');
      rect(9, 6 + Math.min(1, lift), 2, 2, 'k');
      rect(6, 9 + Math.min(1, lift), 4, 1, '#');
      rect(7, 11, 2, 3, 'B');
      rect(3 + Math.max(0, swing), 13, 3, 1, 'b');
      rect(10 + Math.min(0, swing), 13, 3, 1, 'b');
      faceBlink([[5, 6], [9, 6]], 'b');
      break;
    }
    case 'itemPhysics': {
      clear();
      const y = 4 + lift;
      const lean = [0, 0, 1, 2, 1, -1][frame];
      rect(3, 15, 10, 1, '-');
      rect(6 + lift, 13, Math.max(2, 4 - lift * 2), 1, 'O');
      line(4 + lean, y + 2, 8 + lean, y, '#');
      line(8 + lean, y, 12 + lean, y + 2, 'Y');
      line(4 + lean, y + 2, 8 + lean, y + 4, 'y');
      line(12 + lean, y + 2, 8 + lean, y + 4, 'Y');
      rect(4 + lean, y + 3, 4, 5, 'y');
      rect(8 + lean, y + 4, 4, 4, 'O');
      rect(5 + lean, y + 4, 1, 3, '#');
      rect(10 + lean, y + 5, 1, 2, 'Y');
      line(4 + lean, y + 8, 8 + lean, y + 9, 'Y');
      line(8 + lean, y + 9, 12 + lean, y + 8, 'O');
      break;
    }
    case 'noWeather': {
      rect(3, 11, 12, 4, '.');
      for (let i = 0; i < Math.max(0, 4 - frame); i++) rect(4 + i * 4 + frame % 2, 11 + i % 2, 2, 3, 'b');
      line(1, 14, 14, 1, 'r');
      if (frame > 2) rect(8 + frame, 3, 2, 2, '#');
      break;
    }
    case 'vanillaAnimations':
    case 'playerAnims': {
      clear();
      const bob = [0, 0, -1, 0, -1, 0][frame];
      const stride = [0, 1, 2, 0, -2, -1][frame];
      const shirt = name === 'playerAnims' ? 'b' : 'r';
      const darkShirt = name === 'playerAnims' ? 'B' : 'R';
      // Draw far limbs first so the torso really passes in front of them.
      line(9, 11 + bob, 9 - stride, 14 + bob, 'N');
      line(9 - stride, 14 + bob, 10 - stride, 15 + bob, 'k');
      line(11, 6 + bob, 12 - stride, 9 + bob, 'N');
      line(12 - stride, 9 + bob, 11 - stride, 11 + bob, 'n');
      rect(5, 5 + bob, 6, 7, darkShirt);
      rect(6, 6 + bob, 4, 5, shirt);
      rect(6, 1 + bob, 5, 4, 'N');
      rect(7, 2 + bob, 3, 3, 'n');
      rect(7, 3 + bob, 1, 1, 'k'); dot(9, 3 + bob, 'k');
      rect(6, 11 + bob, 4, 2, 'B');
      line(6, 12 + bob, 6 + stride, 14 + bob, 'N');
      line(6 + stride, 14 + bob, 5 + stride, 15 + bob, 'k');
      line(4, 6 + bob, 4 + stride, 9 + bob, 'N');
      line(4 + stride, 9 + bob, 5 + stride, 11 + bob, 'n');
      dot(5, 6 + bob, '#'); dot(10, 6 + bob, '#');
      faceBlink([[7, 3], [9, 3]], 'n');
      break;
    }
    case 'handSway': {
      clear();
      const dx = swing > 0 ? 1 : swing < 0 ? -1 : 0;
      rect(4 + dx, 2 + Math.max(0, lift), 2, 7, 'N');
      rect(7 + dx, 1, 2, 8 + Math.max(0, -lift), 'N');
      rect(10 + dx, 3 + Math.min(0, lift), 2, 6, 'N');
      rect(2 + dx, 8, 2, 5, 'N');
      rect(4 + dx, 7, 9, 6, 'n'); rect(5 + dx, 12, 7, 2, 'N');
      rect(7 + dx, 14, 4, 2, 'B'); dot(5 + dx, 8, '#');
      break;
    }
    case 'zoom': {
      rect(4, 5, 8, 5, 'b');
      const size = [0, 2, 4, 5, 3, 2][frame];
      rect(8 - Math.floor(size / 2), 8 - Math.floor(size / 2), size, size, 'k');
      dot(5 + frame % 3, 5, '#');
      break;
    }
    case 'cameraOverhaul': {
      rect(5, 6, 6, 6, 'B');
      const aperture = [0, 4, 3, 2, 3, 4][frame];
      rect(8 - Math.floor(aperture / 2), 9 - Math.floor(aperture / 2), aperture, aperture, 'k');
      line(6, 7, 9 + swing, 10, 'b');
      dot(11, 6, frame % 2 ? 'r' : '#');
      break;
    }
    case 'elytraFlight': {
      clear();
      const tipY = [0, 2, 0, 4, 8, 5][frame];
      for (const side of [-1, 1]) {
        const rootX = side < 0 ? 7 : 8;
        const tipX = side < 0 ? 0 : 15;
        for (let band = 0; band < 4; band++) {
          const y = tipY + band;
          line(rootX, 7 + band, tipX, y, band < 2 ? 'B' : 'b');
        }
        line(rootX, 9, tipX, tipY + 1, '#');
        line(rootX, 10, tipX + (side < 0 ? 2 : -2), tipY + 5, 'B');
      }
      rect(6, 6, 4, 6, '#');
      rect(7, 7, 2, 4, 'N');
      rect(7, 12, 2, 3, 'B');
      dot(7, 5, 'b'); dot(8, 5, 'b');
      break;
    }
    case 'freecam': {
      rect(5, 6, 6, 5, 'B'); rect(6, 7, 4, 3, 'b');
      rect(7 + Math.max(-1, Math.min(1, swing)), 8 + Math.min(0, lift), 2, 1, '#');
      dot(1 + frame % 3, 8, 't'); dot(14 - frame % 3, 8, 't');
      break;
    }
    case 'freelook': {
      rect(6, 5, 4, 6, 'b');
      const [x, y] = [[8, 5], [9, 6], [8, 7], [6, 6], [7, 5]][frame - 1];
      rect(x, y, 2, 4, 'k');
      dot(x, y, '#');
      break;
    }
    case 'blockHighlight': {
      clear();
      const skew = swing > 0 ? 1 : swing < 0 ? -1 : 0;
      line(4, 2, 12, 2 + skew, 't'); line(4, 2, 2, 5, 't');
      line(12, 2 + skew, 14, 5, 't');
      line(2, 5, 2, 12, 't'); line(14, 5, 14, 12, 'T');
      line(2, 12, 8, 15, 'T'); line(14, 12, 8, 15, 'T');
      line(2, 5, 8, 8 + skew, 't'); line(14, 5, 8, 8 + skew, 'T');
      line(8, 8 + skew, 8, 15, frame % 2 ? 't' : 'T');
      break;
    }
    case 'autoSprint':
    case 'safeSneak': {
      clear();
      const low = name === 'safeSneak';
      const x = 3 + swing;
      rect(x + 4, low ? 8 : 3, 3, low ? 3 : 5, 'G');
      rect(x + 2, low ? 10 : 7, 7, 4, 'g');
      rect(x, 12, 12, 2, 'G'); rect(x + 1, 14, 10, 1, 'k');
      rect(1, 4 + frame % 3, 3 + frame % 2, 1, 't');
      rect(0, 7 + frame % 2, 4, 1, 'T');
      dot(x + 4, low ? 8 : 4, '#');
      break;
    }
    case 'antiAfk': {
      rect(4, 5, 8, 6, 'y');
      const hands = [[8, 4], [11, 5], [12, 8], [11, 10], [8, 11]][frame - 1];
      line(8, 8, hands[0], hands[1], '#'); dot(8, 8, 'k');
      rect(13, 3, 2, 2, frame % 2 ? 'g' : 'G');
      break;
    }
    case 'autoRespawn': {
      rect(4, 5, 8, 6, 'g');
      const radius = [0, 1, 2, 3, 2, 1][frame];
      rect(8 - radius, 8 - radius, radius * 2, radius * 2, 'r');
      rect(7, 5, 2, 6, 'R'); rect(5, 7, 6, 2, 'R');
      if (frame >= 3) rect(12, 10, 3, 2, 'g');
      rect(3 + frame * 2, 3 + frame % 2, 2, 2, '#');
      break;
    }
    case 'idlePlayerBot': {
      faceBlink([[5, 6], [9, 6]], 'b');
      rect(1, 6, 2, 4, '.'); rect(13, 6, 2, 4, '.');
      rect(1, 6 + Math.max(-1, lift), 2, 4, 'B');
      rect(13, 6 - Math.min(1, lift), 2, 4, 'B');
      rect(7, 0, 2, 3, frame % 2 ? 'b' : 'B');
      break;
    }
    case 'rhythmParkour': {
      const steps = [[2, 9], [6, 6], [10, 3], [12, 1], [10, 3]][frame - 1];
      rect(10, 0, 5, 4, '.');
      rect(steps[0], steps[1] - 2, 2, 2, 'y');
      rect(steps[0] - 1, steps[1], 4, 2, 'Y');
      dot(steps[0] + 1, steps[1] - 1, '#');
      break;
    }
    case 'chatVideos': {
      rect(3, 4, 10, 7, 'b');
      if (frame % 3 === 0) { rect(6, 5, 2, 5, '#'); rect(9, 5, 2, 5, '#'); }
      else { line(6, 5, 10, 7, '#'); line(10, 7, 6, 10, '#'); }
      rect(4, 10, frame + 3, 1, 'y');
      break;
    }
    case 'chatLinks': {
      const gap = frame < 3 ? frame : 5 - frame;
      const drop = frame >= 3 ? 1 : 0;
      rect(1, 3, 13, 10, '.');
      rect(2 - gap, 4, 7, 2, 'T'); rect(1 - gap, 6, 2, 4, 'T');
      rect(3 - gap, 10, 6, 2, 'T');
      rect(7 + gap, 4 + drop, 6, 2, 't'); rect(12 + gap, 6 + drop, 2, 5, 't');
      rect(7 + gap, 11 + drop, 6, 2, 't');
      if (gap < 2) rect(5, 7, 6, 2, '#');
      break;
    }
    case 'chatMemes': {
      faceBlink([[5, 6], [10, 6]], 'y');
      rect(5, 9, 7, 3, 'y');
      if (frame % 2) { line(5, 10, 8, 12, 'O'); line(8, 12, 11, 10, 'O'); }
      else { rect(6, 10, 4, 2, 'O'); rect(7, 11, 2, 1, 'k'); }
      break;
    }
    case 'gifChat': {
      rect(5, 6, 6, 5, 'b');
      if (frame % 2) { rect(6, 7, 4, 3, '#'); rect(8, 8, 2, 2, 'B'); dot(10, 7, 'y'); }
      else { rect(6, 7, 4, 3, 'B'); rect(7, 8, 2, 1, '#'); }
      dot(3, 4 + frame, 'k'); dot(12, 12 - frame, 'k');
      break;
    }
    case 'clientChat': {
      rect(4, 5, 8, 4, 'b');
      for (let i = 0; i < Math.min(3, frame); i++) rect(5 + i * 3, 7, 2, 2, '#');
      if (frame > 3) { rect(6, 6, 4, 2, '#'); dot(10, 8, 'y'); }
      break;
    }
    case 'clientChatMentions': {
      rect(5, 5, 7, 6, 'b');
      rect(7, 7, 2, 2, 'Y');
      line(6, 6, 10, 6, 'y'); line(6, 6, 5, 10, 'y');
      line(5, 10, 10, 10, 'y'); line(10, 6, 10, 10, 'y');
      rect(11, 2, 2, 2, frame % 2 ? 'r' : 'y');
      if (frame >= 3) rect(12, 4, 2, 2, 'r');
      break;
    }
    case 'discord': {
      faceBlink([[5, 7], [9, 7]], 'v');
      rect(6, 11, 4, 1, frame % 2 ? '#' : 'V');
      rect(2, 3 + Math.min(1, lift), 3, 2, 'v');
      rect(11, 3 - Math.min(1, lift), 3, 2, 'v');
      if (frame === 4) rect(7, 11, 2, 2, 'k');
      break;
    }
    case 'shaders': {
      clear();
      const offset = [0, -1, 1, 2, 1, -2][frame];
      rect(2, 2 + offset, 10, 10, 'V'); rect(3, 3 + offset, 8, 8, 'v');
      rect(5, 5 - offset, 8, 8, 'B'); rect(6, 6 - offset, 6, 6, 'b');
      rect(8, 8, 6, 6, 'T'); rect(9, 9, 4, 4, 't');
      rect(4, 4 + offset, 3, 1, '#'); rect(7, 7 - offset, 3, 1, '#');
      break;
    }
    default:
      throw new Error(`No motion design for ${name}`);
  }
  return art;
}

for (const name of names) {
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(name) || name === 'patPat' || !icons[name]) {
    throw new Error(`Unsafe or unknown icon: ${name}`);
  }
  const original = makeArt(name, icons[name]);
  const folder = path.join(root, name);
  fs.mkdirSync(folder, { recursive: true });
  fs.copyFileSync(path.join(root, `${name}.png`), path.join(folder, '00.png'));
  for (let frame = 1; frame < 6; frame++) {
    const art = poseIcon(name, original, frame);
    fs.writeFileSync(path.join(folder, `${String(frame).padStart(2, '0')}.png`), encodeArt(name, art));
  }
}
