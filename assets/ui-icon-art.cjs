// Integer coordinates on a 32 x 32 canvas. Each ramp goes from shadow to highlight.
const ink = '#161c2b';
const white = '#fff2db';
const silver = ['#44516b', '#8599b2', '#dcecfa'];
const blue = ['#265796', '#4aa9eb', '#b2f1ff'];
const mint = ['#216960', '#4ccba8', '#b3f8cc'];
const leaf = ['#3e7141', '#7dba58', '#d0ee82'];
const gold = ['#9e5732', '#e9a94d', '#ffdf80'];
const coral = ['#963852', '#ee6673', '#ffb9a6'];
const violet = ['#58438a', '#9c77e5', '#e5c9ff'];
const rose = ['#933f77', '#df70b1', '#ffc4dc'];
const hide = ['#764637', '#bb8057', '#e9b584'];
const cream = ['#a7795f', '#e0b18c', '#ffe2b9'];
const night = ['#232d50', '#455d8b', '#849ed1'];
const bob = [0, -1, -2, -2, -1, 0];
const lift = [0, 0, 1, 2, 2, 1];
const pulse = [0, 1, 3, 5, 4, 2];

function tile(a, x, y, w, h, colors) {
  a.poly([[x+2,y],[x+w-2,y],[x+w,y+2],[x+w,y+h-2],[x+w-2,y+h],[x+2,y+h],[x,y+h-2],[x,y+2]], ink);
  a.rect(x+1,y+2,w-2,h-4,colors[0]);
  a.rect(x+2,y+1,w-4,h-3,colors[1]);
  a.rect(x+3,y+1,w-6,1,colors[2]);
}

function glint(a, x, y, color, radius = 3) {
  a.poly([[x,y-radius],[x+1,y-1],[x+radius,y],[x+1,y+1],[x,y+radius],[x-1,y+1],[x-radius,y],[x-1,y-1]], color);
  a.dot(x, y, white);
}

function framed(a, x, y, w, h, colors, screen = night[0]) {
  tile(a, x, y, w, h, colors);
  a.rect(x+3,y+4,w-6,h-7,screen);
  a.rect(x+4,y+2,2,1,colors[2]);
  a.rect(x+7,y+2,1,1,colors[2]);
}

function cube(a, x, y, s, h, colors) {
  a.poly([[x,y],[x+s,y-5],[x+s*2,y],[x+s*2,y+h],[x+s,y+h+5],[x,y+h]], ink);
  a.poly([[x+1,y+1],[x+s,y-4],[x+s*2-1,y+1],[x+s,y+5]], colors[2]);
  a.poly([[x+1,y+2],[x+s-1,y+6],[x+s-1,y+h+4],[x+1,y+h-1]], colors[1]);
  a.poly([[x+s,y+6],[x+s*2-1,y+2],[x+s*2-1,y+h-1],[x+s,y+h+4]], colors[0]);
  a.line([[x+3,y+2],[x+s,y-2],[x+s+3,y-1]], white);
}

function arrow(a, points, colors, width = 3) {
  a.line(points, ink, width+2);
  a.line(points, colors[1], width);
  const [x,y] = points.at(-1);
  const [fromX,fromY] = points.at(-2);
  const dx = Math.sign(x-fromX), dy = Math.sign(y-fromY);
  a.line([[x-4*dx+3*dy,y-4*dy-3*dx],[x,y],[x-4*dx-3*dy,y-4*dy+3*dx]], ink, width+2);
  a.line([[x-4*dx+3*dy,y-4*dy-3*dx],[x,y],[x-4*dx-3*dy,y-4*dy+3*dx]], colors[1], width);
}

function outlineLine(a, points, color, width = 3) {
  a.line(points, ink, width+2);
  a.line(points, color, width);
}

function heart(a, x, y, colors) {
  a.poly([[x,y+3],[x+3,y],[x+7,y],[x+9,y+2],[x+11,y],[x+15,y],[x+18,y+3],[x+18,y+7],[x+14,y+12],[x+9,y+16],[x+4,y+12],[x,y+7]], ink);
  a.poly([[x+1,y+3],[x+4,y+1],[x+7,y+1],[x+9,y+4],[x+11,y+1],[x+14,y+1],[x+17,y+3],[x+17,y+7],[x+9,y+14],[x+1,y+7]], colors[0]);
  a.poly([[x+2,y+4],[x+5,y+2],[x+7,y+2],[x+9,y+4],[x+12,y+2],[x+14,y+2],[x+16,y+4],[x+15,y+7],[x+9,y+12],[x+3,y+7]], colors[1]);
  a.line([[x+3,y+5],[x+5,y+3],[x+6,y+3]], colors[2]);
}

function bubble(a, x, y, w, h, colors) {
  a.poly([[x+4,y+h-5],[x+4,y+h+4],[x+13,y+h-2]], ink);
  a.poly([[x+5,y+h-4],[x+5,y+h+2],[x+11,y+h-2]], colors[0]);
  tile(a, x, y, w, h, colors);
}

function camera(a, x, y, colors, size = 0) {
  tile(a,x+4,y-3,8,7,colors);
  tile(a,x,y,23,15,colors);
  a.disc(x+12,y+7,6,ink);
  a.disc(x+12,y+7,4+size,colors[2]);
  a.disc(x+12,y+7,3,blue[0]);
  a.rect(x+10,y+4,2,2,white);
  a.rect(x+18,y+4,2,2,coral[1]);
}

function person(a, x, y, colors, stride = 0, swing = 0) {
  tile(a,x+6,y,10,9,cream);
  a.rect(x+8,y+2,6,2,hide[0]);
  a.rect(x+12,y+5,2,1,ink);
  outlineLine(a,[[x+9,y+16],[x+8-stride,y+22],[x+6-stride,y+25]],silver[1],3);
  outlineLine(a,[[x+12,y+16],[x+13+stride,y+21],[x+15+stride,y+24]],silver[2],3);
  outlineLine(a,[[x+10,y+11],[x+5,y+13+swing],[x+3,y+15+swing]],cream[1],3);
  outlineLine(a,[[x+13,y+10],[x+17,y+13-swing],[x+19,y+15-swing]],cream[2],3);
  tile(a,x+6,y+8,10,10,colors);
}

function cloud(a, x, y, colors) {
  a.disc(x+8,y+6,6,ink);
  a.disc(x+15,y+5,5,ink);
  tile(a,x,y+5,22,10,colors);
  a.disc(x+8,y+6,5,colors[1]);
  a.disc(x+15,y+5,4,colors[1]);
  a.line([[x+5,y+5],[x+7,y+3],[x+10,y+3]],colors[2]);
  a.rect(x+5,y+12,13,1,colors[0]);
}

function blade(a, x, y, bend, colors) {
  a.poly([[x,y],[x-2,y-9],[x+bend,y-17],[x+bend+2,y-10],[x+2,y]], colors[0]);
  a.line([[x,y-1],[x+bend,y-14]],colors[1]);
}

function sprig(a, x, y, lean, colors) {
  a.line([[x,y],[x+lean,y-10],[x+lean+1,y-17]],leaf[0],2);
  a.poly([[x+lean,y-8],[x+lean-7,y-12],[x+lean-7,y-7],[x+lean-2,y-5]],leaf[1]);
  a.poly([[x+lean,y-11],[x+lean+6,y-14],[x+lean+5,y-8],[x+lean,y-6]],leaf[1]);
  a.disc(x+lean+1,y-18,5,ink);
  a.disc(x+lean+1,y-18,4,colors[1]);
  a.disc(x+lean+1,y-18,2,colors[2]);
}

function prism(a, x, y, colors) {
  a.poly([[x+7,y],[x+14,y+5],[x+13,y+15],[x+7,y+20],[x+1,y+15],[x,y+5]],ink);
  a.poly([[x+7,y+1],[x+13,y+6],[x+7,y+10],[x+1,y+6]], colors[2]);
  a.poly([[x+1,y+7],[x+7,y+11],[x+7,y+19],[x+2,y+14]],colors[1]);
  a.poly([[x+8,y+11],[x+13,y+7],[x+12,y+14],[x+8,y+18]],colors[0]);
  a.line([[x+4,y+5],[x+7,y+3],[x+10,y+5]],white);
}

function signal(a, x, y, level, colors) {
  for (const [index, h] of [5,9,13,17].entries()) {
    const barX = x+index*5;
    const active = index < level;
    a.rect(barX,y-h,4,h,ink);
    a.rect(barX+1,y-h+1,2,h-2,active ? colors[1] : night[1]);
    a.rect(barX+1,y-h+1,2,1,active ? colors[2] : night[2]);
  }
}

function blink(a, x, y, f, color) {
  glint(a, x+[0,1,0,-1,-1,1][f], y+[0,-1,-2,-1,0,1][f], color, [2,3,4,3,2,3][f]);
}

function lens(a, x, y, colors) {
  a.disc(x,y,10,ink);
  a.disc(x,y,9,colors[0]);
  a.disc(x,y,7,colors[2]);
  a.disc(x,y,6,blue[0]);
  a.disc(x+1,y+1,4,blue[1]);
  a.line([[x-4,y],[x-4,y-2],[x-2,y-4],[x,y-4]],blue[2]);
  a.rect(x-3,y-2,2,2,white);
}

function drop(a, x, y, size, colors) {
  a.poly([[x,y-size],[x+size-1,y+1],[x+size,y+4],[x+size-2,y+7],[x-size+2,y+7],[x-size,y+4],[x-size+1,y+1]],ink);
  a.poly([[x,y-size+2],[x+size-2,y+3],[x+size-2,y+5],[x+size-4,y+6],[x-size+3,y+6],[x-size+1,y+3]],colors[1]);
  a.line([[x-2,y],[x-3,y+3],[x-2,y+4]],colors[2]);
}

function flame(a,x,y,f) {
  const t = pulse[f];
  a.poly([[x-8,y],[x-9,y-7],[x-5,y-13],[x-4,y-8],[x,y-20+t],[x+3,y-12],[x+6,y-15],[x+9,y-5],[x+6,y+1]],ink);
  a.poly([[x-7,y-1],[x-8,y-7],[x-5,y-11],[x-4,y-6],[x,y-18+t],[x+3,y-10],[x+6,y-12],[x+8,y-5],[x+5,y]],coral[1]);
  a.poly([[x-4,y-1],[x-5,y-6],[x-2,y-10],[x,y-7],[x+2,y-12+t],[x+5,y-5],[x+4,y-1]],gold[1]);
  a.poly([[x-2,y],[x-2,y-4],[x+1,y-7],[x+3,y-3],[x+2,y]],gold[2]);
}

function note(a,x,y,colors) {
  outlineLine(a,[[x+5,y+13],[x+5,y],[x+12,y+3],[x+13,y+6]],colors[1],3);
  a.disc(x+3,y+14,5,ink);
  a.disc(x+3,y+14,4,colors[1]);
  a.rect(x+1,y+12,3,2,colors[2]);
}

const drawings = {
  home(a) {
    tile(a,6,13,21,16,cream);
    a.poly([[1,16],[15,2],[31,16],[29,19],[15,8],[3,19]],ink);
    a.poly([[3,16],[15,4],[29,16],[27,17],[15,7],[5,17]],coral[1]);
    a.line([[9,12],[15,6],[20,10]],coral[2]);
    a.rect(14,19,6,10,hide[0]); a.rect(15,20,4,8,hide[1]);
    a.rect(8,17,4,5,blue[0]); a.rect(9,18,2,2,blue[2]); a.dot(18,24,gold[2]);
  },
  grid(a) {
    for (const [x,y,colors] of [[3,3,blue],[17,3,mint],[3,17,gold],[17,17,violet]]) {
      tile(a,x,y,12,12,colors); a.rect(x+3,y+4,5,4,colors[0]); a.rect(x+3,y+4,3,1,colors[2]);
    }
  },
  close(a) {
    outlineLine(a,[[7,7],[24,24]],coral[1],5);
    outlineLine(a,[[24,7],[7,24]],coral[1],5);
    a.line([[6,6],[17,17]],coral[2]); a.line([[23,6],[15,14]],coral[2]);
  },
  search(a) {
    outlineLine(a,[[18,19],[27,28]],gold[1],5); a.line([[22,22],[27,27]],gold[2],2);
    lens(a,12,12,silver);
  },
  heart(a) { heart(a,7,8,rose); },
  settings(a) {
    for (const [x,y] of [[12,2],[22,6],[25,13],[22,21],[12,24],[5,21],[2,13],[5,6]]) tile(a,x,y,6,6,silver);
    a.disc(16,16,12,ink); a.disc(16,16,10,silver[1]); a.disc(16,17,7,silver[0]);
    a.disc(16,16,5,ink); a.disc(16,16,3,null);
    a.line([[9,13],[11,9],[16,7],[20,9]],silver[2],2); a.rect(18,24,3,1,silver[2]);
  },
  hud(a) {
    framed(a,2,4,28,23,blue);
    a.rect(7,12,7,2,coral[1]); a.rect(7,15,5,2,mint[1]);
    a.rect(20,12,5,5,blue[0]); a.rect(21,13,3,2,blue[2]);
    a.rect(7,20,18,2,leaf[1]); a.rect(7,20,9,1,leaf[2]);
  },
  classicTitle(a) {
    framed(a,2,4,28,25,gold,night[0]);
    a.line([[7,21],[12,13],[17,16],[22,11],[26,20]],violet[1],2);
    a.rect(7,22,18,2,gold[0]); glint(a,21,10,gold[2]);
    a.rect(12,27,8,2,white);
  },
  menuHub(a) {
    framed(a,2,4,28,25,silver);
    tile(a,7,11,8,12,blue); tile(a,17,11,8,5,gold); tile(a,17,18,8,5,mint);
    a.rect(9,14,4,2,blue[2]); a.rect(9,18,4,2,blue[0]);
  },
  render(a) {
    cube(a,5,13,10,9,violet);
    glint(a,24,7,gold[2],5); a.rect(3,5,2,2,blue[2]);
    a.rect(24,24,2,2,rose[2]);
  },
  cosmetics(a) {
    a.poly([[11,4],[21,4],[28,9],[30,16],[24,19],[22,16],[22,28],[9,28],[9,16],[6,19],[1,16],[3,9]],ink);
    a.poly([[11,5],[21,5],[27,10],[28,15],[24,17],[21,13],[21,27],[10,27],[10,13],[6,17],[3,15],[4,10]],rose[1]);
    a.poly([[12,5],[20,5],[18,10],[15,11],[12,9]],rose[0]);
    a.rect(11,24,10,3,rose[0]); glint(a,16,17,rose[2],4); a.rect(5,10,4,2,rose[2]);
  },
  chat(a) {
    bubble(a,3,5,26,19,blue);
    for (const x of [9,15,21]) a.rect(x,13,3,3,white);
  },
  waypoints(a) {
    a.poly([[1,23],[11,18],[21,21],[30,16],[30,26],[21,30],[11,27],[1,30]],ink);
    a.poly([[2,24],[11,20],[21,23],[29,19],[29,25],[21,29],[11,26],[2,29]],leaf[1]);
    a.poly([[11,20],[21,23],[21,29],[11,26]],leaf[0]);
    a.poly([[8,7],[13,3],[20,3],[24,7],[24,13],[17,24],[8,13]],ink);
    a.poly([[9,7],[14,4],[19,4],[23,8],[23,13],[17,22],[10,13]],coral[1]);
    a.disc(16,10,4,coral[0]); a.disc(16,10,2,white);
  },
  movement(a) {
    a.poly([[13,5],[24,5],[25,14],[29,18],[30,24],[26,27],[8,27],[4,23],[5,18],[12,15]],ink);
    a.poly([[14,6],[23,6],[24,14],[28,19],[29,23],[25,26],[9,26],[5,23],[6,19],[12,16]],mint[1]);
    a.poly([[5,22],[12,22],[20,24],[29,22],[28,25],[25,26],[9,26]],white);
    for (const [x,y] of [[13,11],[12,14],[10,17]]) a.rect(x,y,5,2,mint[2]);
    a.rect(2,8,8,2,mint[0]); a.rect(4,12,5,2,mint[2]);
  },
  world(a) {
    a.disc(16,16,14,ink); a.disc(16,16,13,blue[0]); a.disc(15,14,11,blue[1]);
    a.poly([[5,12],[10,7],[16,7],[19,10],[16,14],[11,15],[11,20],[7,18]],leaf[1]);
    a.poly([[18,15],[24,12],[27,15],[25,21],[21,22],[19,26],[16,23]],leaf[1]);
    a.poly([[19,23],[22,21],[25,21],[22,26],[18,27]],leaf[0]);
    a.line([[6,10],[9,7],[13,5],[17,5]],blue[2]);
  },
  about(a) {
    a.poly([[4,29],[8,17],[11,11],[20,4],[28,2],[29,8],[24,17],[18,22],[10,24]],ink);
    a.poly([[7,26],[11,14],[20,6],[27,3],[27,9],[23,16],[17,21],[10,23]],blue[1]);
    a.poly([[11,20],[15,12],[23,7],[25,8],[21,15],[16,19]],blue[2]);
    a.line([[5,28],[11,22],[20,12],[25,7]],white,2);
  },
  youtubeMusic(a) {
    a.disc(15,16,13,ink); a.disc(15,16,12,coral[0]); a.disc(15,15,10,coral[1]);
    a.line([[7,14],[9,9],[14,7]],coral[2]);
    note(a,12,7,cream);
  },
  accounts(a) {
    tile(a,3,8,26,20,blue); tile(a,12,4,8,7,silver);
    a.rect(7,13,9,10,night[0]); a.disc(11,16,3,cream[1]);
    a.poly([[7,23],[8,20],[11,19],[15,21],[16,23]],mint[1]);
    a.rect(19,13,6,2,white); a.rect(19,17,7,1,blue[2]); a.rect(19,20,5,1,blue[0]);
  },
  shaders(a,f) {
    prism(a,9,5+bob[f],violet);
    a.line([[3,15],[10,15]],white,2);
    for (const [i,color] of [coral[1],gold[2],mint[1],blue[2]].entries()) {
      a.line([[20,14+bob[f]],[28,14+i*3+lift[f]]],color,2);
    }
    blink(a,24,7,f,violet[2]);
  },
  kotoSky(a) {
    framed(a,2,3,28,26,violet,'#27375d');
    a.disc(20,13,6,gold[2]); a.disc(22,11,5,'#27375d');
    a.poly([[5,24],[12,18],[17,22],[22,17],[27,23],[27,26],[5,26]],night[1]);
    glint(a,10,11,blue[2],3); a.dot(23,16,white); a.dot(14,15,violet[2]);
  },
  waterStyle(a) {
    a.poly([[2,17],[10,15],[17,18],[24,14],[30,16],[30,28],[2,28]],ink);
    a.poly([[3,18],[10,16],[17,19],[24,15],[29,17],[29,27],[3,27]],blue[0]);
    a.line([[3,18],[10,16],[17,19],[24,15],[29,17]],blue[2],2);
    a.line([[5,22],[11,21],[18,23],[24,21],[27,21]],mint[1],2);
    drop(a,15,10,5,blue);
  },
  experimental(a) {
    tile(a,11,3,10,4,silver);
    a.poly([[12,6],[20,6],[20,13],[28,25],[26,29],[6,29],[4,25],[12,13]],ink);
    a.poly([[13,7],[19,7],[19,14],[26,25],[25,28],[7,28],[6,25],[13,14]],mint[2]);
    a.poly([[10,18],[15,19],[19,17],[24,24],[24,26],[8,26]],mint[1]);
    a.rect(13,9,2,7,white); a.disc(18,23,2,mint[0]); a.rect(11,22,2,2,white);
    glint(a,24,10,gold[2],3);
  },

  // HUD, render and world modules
  keystrokes(a,f) {
    const keys = [[12,3],[3,15],[12,15],[21,15]];
    const pressed = [0,1,2,3,0,2][f];
    for (const [i,[x,y]] of keys.entries()) {
      const colors = i === pressed ? gold : blue;
      tile(a,x,y,8,10,colors);
      a.line([[x+2,y+5],[x+3,y+3],[x+5,y+5]],colors[2]);
      a.rect(x+3,y+5,2,2,colors[2]);
    }
    a.rect(4+f*3,27,8,2,mint[2]);
  },
  fpsCounter(a,f) {
    framed(a,2,3,28,21,mint);
    const bars = [4,7,5,9,12,9];
    bars.forEach((h,i) => {
      const level = h + (i === f ? 3 : 0);
      a.rect(6+i*3,21-level,2,level,i === f ? mint[2] : mint[1]);
    });
    tile(a,11,24,10,5,silver); a.rect(8,28,16,2,silver[1]);
  },
  cpsCounter(a,f) {
    tile(a,7,6,18,24,silver);
    tile(a,9,7,7,10,f % 2 ? gold : blue);
    tile(a,16,7,7,10,f % 2 ? blue : gold);
    a.rect(15,8,2,6,ink); a.rect(15,10+(f%3),2,3,white);
    blink(a,f < 3 ? 5 : 26,7,f,gold[2]);
  },
  pingCounter(a,f) {
    const level = [2,3,4,3,1,4][f];
    signal(a,6,25,level,mint);
    blink(a,6+5*(level-1),5,f,mint[2]);
    a.rect(5,28,22,1,blue[0]);
  },
  guiPatch(a,f) {
    framed(a,1,4,30,25,silver);
    heart(a,4,11,coral);
    a.rect(23,12,5,3,gold[2]); a.rect(23,17,5,3,gold[1]); a.rect(23,22,5,2,gold[0]);
    a.rect(4,25,5+4*f,3,leaf[2]);
  },
  armorHud(a,f) {
    a.poly([[9,3],[13,3],[16,7],[19,3],[23,3],[29,9],[26,17],[23,15],[23,29],[9,29],[9,15],[6,17],[3,9]],ink);
    a.poly([[9,4],[12,4],[15,9],[18,9],[20,4],[23,4],[28,10],[26,15],[22,13],[22,28],[10,28],[10,13],[6,15],[4,10]],silver[1]);
    a.poly([[11,11],[15,12],[21,11],[21,24],[18,27],[11,26]],blue[0]);
    a.poly([[12,12],[15,13],[19,12],[19,21],[12,22]],blue[1]);
    blink(a,9+f*2,14,f,blue[2]);
  },
  coordinates(a,f) {
    cube(a,8,15,8,7,night);
    arrow(a,[[16,19],[16,5]],mint,2);
    arrow(a,[[15,22],[6,27]],coral,2);
    arrow(a,[[17,22],[25,26]],blue,2);
    const x = 20+lift[f], y = 12+bob[f];
    a.disc(x,y,3,gold[1]); a.rect(x-1,y-1,2,2,white);
  },
  dynamicCrosshair(a,f) {
    const reach = [9,7,5,3,5,8][f];
    for (const [x,y] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      outlineLine(a,[[15+x*reach,15+y*reach],[15+x*(reach+5),15+y*(reach+5)]],mint[1],2);
    }
    a.rect(14,14,3,3,coral[1]); a.dot(15,15,white);
    a.rect(4,4,2,2,mint[0]); a.rect(26,26,2,2,mint[0]);
  },
  rebrand(a,f) {
    tile(a,3,17,24,12,silver);
    a.rect(7,21,16,3,violet[1]); a.rect(9,22,7,1,violet[2]);
    outlineLine(a,[[16,17+bob[f]],[16,12+bob[f]]],hide[1],5);
    tile(a,8,3+bob[f],16,11,violet);
    a.rect(11,6+bob[f],10,2,violet[2]);
    blink(a,26,9,f,rose[2]);
  },
  titanTiny(a,f) {
    tile(a,3,5+bob[f],13,13,blue);
    a.rect(7,10+bob[f],2,3,ink); a.rect(12,10+bob[f],2,3,ink);
    tile(a,18,16-lift[f],9,9,gold);
    a.rect(20,19-lift[f],2,2,ink); a.rect(24,19-lift[f],1,2,ink);
    a.rect(2,24,13,4,blue[0]); a.rect(18,27,11,1,gold[2]);
    a.rect(4,25,3+f,1,blue[2]);
  },
  betterPlayerLayers(a,f) {
    cube(a,8,17,8,8,blue);
    cube(a,6,12+bob[f],8,7,rose);
    a.rect(10,13+bob[f],3,3,ink); a.rect(17,15+bob[f],3,3,ink);
    blink(a,26,8,f,rose[2]);
  },
  healthNameTags(a,f) {
    tile(a,2,4,28,9,silver);
    a.rect(7,8,10,2,white); a.rect(19,8,5,2,blue[2]);
    heart(a,4,13+bob[f]+(f===5 ? 1 : 0),coral);
    a.rect(23,18,6,3,leaf[0]); a.rect(23,18,Math.min(6,1+f),2,leaf[2]);
  },
  distanceNameTags(a,f) {
    tile(a,3,4,24,8,blue);
    a.rect(7,7,8,2,white); a.rect(17,7,6,2,blue[2]);
    a.rect(3,19,26,7,gold[0]); a.rect(4,19,24,5,gold[1]);
    for (let i=0;i<6;i++) a.rect(5+i*4,19,1,i%2 ? 2 : 4,ink);
    arrow(a,[[6+2*f,28],[20+f,28]],blue,2);
  },
  damageParticles(a,f) {
    const y=3+bob[f];
    a.poly([[15,5],[17,10],[23,7],[22,13],[29,15],[23,18],[26,24],[19,23],[16,29],[13,24],[6,26],[8,20],[2,17],[8,14],[5,8],[12,11]],ink);
    a.poly([[15,7],[17,12],[21,10],[21,14],[26,15],[21,18],[24,22],[18,21],[16,26],[13,22],[8,24],[10,19],[5,17],[10,14],[8,11],[13,13]],coral[1]);
    glint(a,16+[0,1,2,1,-1,-2][f],17,gold[2],5+lift[f]);
    a.rect(5+f,y,2,2,coral[2]); a.rect(24,26-bob[f],2,2,gold[1]);
  },
  waterSplash(a,f) {
    a.line([[4,25],[10,23],[13,25],[19,25],[22,23],[28,25]],blue[1],3);
    drop(a,16,14+bob[f],7,blue);
    a.rect(6+f%3,13+bob[f],3,3,blue[2]); a.rect(23+lift[f],10+pulse[f],2,3,mint[2]);
    a.rect(8,28,16,2,blue[0]);
  },
  shineAmbience(a,f) {
    a.disc(16,16,11,violet[0]); a.disc(16,16,8,violet[1]);
    glint(a,15,15,gold[2],9+lift[f]); blink(a,24,7,f,rose[2]);
    glint(a,7,24,blue[2],3);
  },
  leafWind(a,f) {
    const x=5+lift[f], y=5+bob[f];
    a.poly([[x,y+13],[x+3,y+5],[x+19,y],[x+21,y+2],[x+17,y+13],[x+12,y+18],[x+5,y+18]],ink);
    a.poly([[x+1,y+13],[x+4,y+6],[x+19,y+1],[x+20,y+2],[x+16,y+13],[x+11,y+17],[x+5,y+17]],leaf[1]);
    a.line([[x+4,y+16],[x+10,y+10],[x+17,y+4]],leaf[0],2);
    a.line([[x+8,y+9],[x+12,y+7]],leaf[2]);
    a.line([[2+pulse[f],26],[12+pulse[f],26],[17+pulse[f],24]],mint[2]);
    a.rect(24,23+f%3,5,2,mint[0]);
  },
  duckMobs(a,f) {
    const y=bob[f]+(f===5 ? 1 : 0);
    a.line([[3,25],[9,27],[23,27],[29,25]],blue[1],2);
    a.disc(12,19+y,9,ink); a.disc(12,19+y,8,gold[1]);
    a.disc(19,12+y,8,ink); a.disc(19,12+y,7,gold[2]);
    tile(a,20,13+y,10,6,coral);
    a.rect(19,9+y,2,f===3?1:3,ink); a.dot(19,9+y,white);
    a.line([[6,19+y],[9,17+y],[14,18+y],[12,22+y],[8,22+y]],gold[0],2);
  },
  crittersMobs(a,f) {
    const y=bob[f]+(f===5 ? 1 : 0);
    a.poly([[4,5+y],[11,11+y],[21,11+y],[27,5+y],[29,20+y],[25,27+y],[7,27+y],[3,21+y]],ink);
    a.poly([[5,7+y],[12,12+y],[21,12+y],[26,7+y],[28,20+y],[24,26+y],[8,26+y],[4,21+y]],hide[1]);
    a.poly([[6,8+y],[11,12+y],[6,15+y]],rose[2]); a.poly([[26,8+y],[25,15+y],[21,12+y]],rose[2]);
    a.rect(8,17+y,4,f===3?1:3,ink); a.rect(20,17+y,4,f===3?1:3,ink);
    a.rect(12,21+y,9,4,cream[2]); a.rect(15,21+y,3,2,rose[0]);
    a.rect(14,13+y,3,5,hide[0]); a.rect(6,21+y,2,1,hide[0]); a.rect(25,21+y,2,1,hide[0]);
  },
  critterSkins(a) {
    tile(a,2,7,22,20,violet);
    a.poly([[6,12],[10,16],[15,16],[19,12],[19,22],[17,24],[8,24],[6,22]],silver[2]);
    a.rect(9,18,2,2,ink); a.rect(15,18,2,2,ink); a.rect(11,21,5,2,cream[1]);
    outlineLine(a,[[21,23],[27,9]],hide[1],4); tile(a,23,4,7,9,rose);
    a.rect(24,5,5,3,rose[2]);
  },
  experimentalGrassFlowers(a) {
    blade(a,7,29,-3,leaf); blade(a,24,29,4,leaf); blade(a,17,28,-3,leaf);
    sprig(a,12,28,-3,gold); sprig(a,21,28,2,rose);
    a.rect(4,29,24,2,leaf[0]);
  },
  experimentalBetterAnimationCape(a) {
    a.poly([[7,3],[25,3],[23,14],[25,22],[19,29],[6,27],[9,21],[8,14]],ink);
    a.poly([[8,4],[24,4],[22,14],[24,22],[19,28],[8,26],[10,21],[9,14]],coral[1]);
    a.poly([[17,5],[22,5],[20,14],[21,22],[18,27],[13,26],[16,19]],coral[0]);
    a.line([[9,6],[22,6]],gold[2],2); glint(a,15,15,gold[2],5);
    a.line([[11,25],[17,27],[21,24]],gold[1]);
  },
  deferredPipeline(a) {
    cube(a,5,19,10,2,violet); cube(a,5,14,10,2,blue); cube(a,5,9,10,2,gold);
    glint(a,17,6,white,3); a.rect(4,26,4,1,violet[2]); a.rect(25,24,4,1,blue[2]);
  },
  antiTear(a) {
    framed(a,2,3,28,26,silver);
    a.line([[6,18],[12,13],[18,18],[25,13]],blue[1],3);
    a.rect(5,16,22,2,mint[1]);
    a.line([[12,17],[15,20],[20,13]],mint[2],2);
    a.rect(6,23,16,2,blue[0]);
  },
  allayPets(a,f) {
    const y=bob[f];
    a.poly([[13,11+y],[3,7+y-lift[f]],[3,17+y],[12,23+y]],blue[0]);
    a.poly([[19,11+y],[29,7+y-lift[f]],[29,17+y],[20,23+y]],blue[1]);
    tile(a,8,7+y,16,14,blue);
    a.rect(11,12+y,3,3,white); a.rect(18,12+y,3,3,white);
    a.rect(13,17+y,6,2,blue[0]);
    tile(a,12,21+y,8,6,mint); blink(a,25,23,f,blue[2]);
  },
  itemPhysics(a,f) {
    const y=[0,-2,-4,-2,0,1][f];
    a.rect(5+lift[f],27,22-2*lift[f],2,night[1]);
    cube(a,7+lift[f],10+y,8,9,gold);
    a.line([[3,11+y],[3,16+y]],gold[2]); a.line([[27,16-y],[27,19-y]],gold[1]);
  },
  noWeather(a,f) {
    cloud(a,4,5,blue);
    for (const [i,x] of [8,14,20].entries()) {
      const y=19+((2*f+i)%5);
      const drift=[0,1,3,2,2,1][f];
      a.line([[x+drift,y],[x+drift-2,y+3]],blue[2],2);
    }
    outlineLine(a,[[5,26],[26,5]],coral[1],4);
    a.line([[6,24],[25,5]],coral[2]);
  },
  fullBright(a,f) {
    const radius=8+lift[f];
    a.disc(16,16,radius+1,ink); a.disc(16,16,radius,gold[1]);
    a.disc(15,15,radius-3,gold[2]); a.rect(10,10,4,2,white);
    a.line([[15,3],[15,6]],white,2); a.line([[3,15],[6,15]],gold[2],2);
    a.line([[25,15],[28,15]],gold[2],2); blink(a,23,24,f,gold[2]);
  },

  // Movement and chat modules
  vanillaAnimations(a,f) {
    person(a,4,3,coral,[0,1,2,1,-1,-2][f],[0,1,2,1,-1,-2][f]);
    a.rect(4,29,24,1,hide[1]);
  },
  handSway(a,f) {
    const x=5+lift[f], y=4+bob[f];
    a.poly([[x,y+12],[x+4,y+10],[x+6,y+13],[x+6,y+4],[x+8,y+2],[x+10,y+4],[x+10,y+1],[x+12,y],[x+14,y+1],[x+14,y+4],[x+16,y+2],[x+18,y+3],[x+18,y+7],[x+20,y+5],[x+22,y+7],[x+22,y+13],[x+19,y+22],[x+7,y+22]],ink);
    a.poly([[x+1,y+12],[x+4,y+11],[x+7,y+15],[x+7,y+4],[x+9,y+3],[x+9,y+12],[x+11,y+11],[x+11,y+1],[x+13,y+1],[x+13,y+10],[x+15,y+10],[x+15,y+4],[x+17,y+3],[x+17,y+11],[x+19,y+11],[x+19,y+7],[x+21,y+7],[x+21,y+13],[x+18,y+21],[x+8,y+21]],cream[1]);
    a.rect(x+8,y+6,1,5,cream[2]); a.rect(x+12,y+3,1,7,cream[2]);
    a.line([[x+8,y+17],[x+12,y+15],[x+16,y+16]],cream[2]);
    tile(a,x+8,y+21,11,6,blue);
    a.line([[3,5+f],[3,10+f],[5,12+f]],blue[2]);
  },
  playerAnims(a,f) {
    person(a,5,3+bob[f],blue,[2,3,1,-1,-2,0][f],[-2,-3,-1,2,3,0][f]);
    a.rect(2,18+bob[f],4,2,mint[2]); a.rect(25,12+f%3,4,2,blue[2]);
  },
  firstPerson(a) {
    framed(a,2,3,28,25,violet,'#3d5682');
    a.poly([[5,21],[12,16],[18,20],[24,17],[27,23],[27,25],[5,25]],leaf[1]);
    a.poly([[18,25],[21,17],[25,19],[25,25]],cream[1]);
    a.rect(13,12,6,1,white); a.rect(15,10,1,5,white);
    a.rect(6,11,4,1,blue[2]);
  },
  headLag(a) {
    tile(a,13,5,15,17,cream);
    a.rect(16,7,9,3,hide[0]); a.rect(16,12,2,2,ink); a.rect(23,12,2,2,ink);
    a.rect(19,16,6,1,hide[1]); tile(a,17,22,9,7,blue);
    a.line([[4,9],[9,9],[11,11]],blue[2],2); a.rect(2,14,8,2,blue[1]); a.rect(6,19,7,2,blue[0]);
  },
  freshAnims(a) {
    person(a,5,3,leaf,2,-3);
    glint(a,5,6,mint[2],4); glint(a,26,22,gold[2],4);
  },
  zoom(a,f) {
    const x=13+lift[f], y=13+bob[f];
    outlineLine(a,[[x+6,y+6],[26,27]],blue[1],5);
    lens(a,x,y,blue);
    a.line([[x-3,y],[x+3,y]],white); a.line([[x,y-3],[x,y+3]],white);
    a.rect(3,25,f+4,2,blue[2]);
  },
  cameraOverhaul(a,f) {
    camera(a,4,10+bob[f],silver);
    a.line([[2,10],[2,21],[5,25],[12+pulse[f],27]],blue[2],2);
    a.rect(25,7+f%3,4,2,coral[2]);
  },
  elytraFlight(a,f) {
    const y=[0,2,3,4,3,1][f];
    a.poly([[15,12],[9,7-y],[2,5+y],[3,16],[7,22],[13,17],[16,15],[19,17],[25,22],[29,16],[30,5+y],[23,7-y],[17,12]],ink);
    a.poly([[14,13],[9,8-y],[3,6+y],[4,15],[7,20],[13,16],[16,14]],violet[1]);
    a.poly([[17,13],[23,8-y],[29,6+y],[28,15],[25,20],[19,16],[16,14]],blue[1]);
    a.line([[4,8+y],[10,10-y],[13,13]],violet[2]);
    a.line([[28,8+y],[23,10-y],[19,13]],blue[2]);
    tile(a,13,11,6,13,silver);
    a.rect(7+f,26-y,5,2,blue[2]); a.rect(22-f,28-y,3,1,violet[2]);
  },
  freecam(a,f) {
    a.line([[2,5],[7,5],[7,2]],violet[2],2); a.line([[24,26],[29,26],[29,21]],violet[2],2);
    camera(a,4+lift[f],9+bob[f],violet);
    arrow(a,[[5,28],[15+pulse[f],28]],mint,2);
  },
  freelook(a,f) {
    a.poly([[2,15],[8,9],[15,7],[22,9],[30,15],[25,21],[17,24],[9,22]],ink);
    a.poly([[4,15],[9,10],[16,8],[22,10],[28,15],[23,20],[16,23],[9,21]],blue[2]);
    const x=[13,15,17,19,17,12][f];
    a.disc(x,16,6,blue[0]); a.disc(x,16,4,mint[1]); a.disc(x,16,2,ink);
    a.rect(x-2,13,2,2,white);
    a.line([[4,25],[11,27],[20,27],[27,24]],silver[1]);
  },
  blockHighlight(a,f) {
    cube(a,6,13,10,9,night);
    const y=lift[f];
    a.line([[3,12-y],[16,5-y],[29,12-y],[29,23-y],[16,30-y],[3,23-y],[3,12-y]],mint[2]);
    a.line([[3,12-y],[16,18-y],[29,12-y]],mint[1]);
    a.line([[16,18-y],[16,30-y]],mint[1]);
    blink(a,24,6,f,gold[2]);
  },
  autoSprint(a,f) {
    const x=[0,1,2,3,2,1][f];
    a.poly([[13+x,4],[22+x,4],[23+x,13],[28,17],[30,22],[27,26],[10,26],[6,23],[8,18],[13+x,14]],ink);
    a.poly([[14+x,5],[21+x,5],[22+x,14],[27,17],[29,22],[26,25],[10,25],[7,22],[9,19],[14+x,15]],coral[1]);
    a.poly([[7,22],[16,21],[22,23],[29,22],[26,25],[10,25]],cream[2]);
    a.rect(13+x,10,5,2,coral[2]); a.rect(13+x,14,4,2,coral[2]);
    a.rect(2+f%3,9,7,2,gold[2]); a.rect(1,15-pulse[f],4+pulse[f],3,gold[1]);
    a.rect(4,29,15+pulse[f],1,gold[0]);
  },
  safeSneak(a,f) {
    cube(a,2,21,7,5,leaf);
    const x=5+lift[f];
    tile(a,x,12,13,9,mint); a.rect(x+8,9+bob[f],7,6,cream[1]); a.rect(x+12,11+bob[f],2,2,ink);
    a.line([[x+2,18],[x+5,20],[x+10,20]],mint[2],2);
    a.line([[21,16],[25,16],[28,19],[28,25]],coral[1],2);
    a.rect(24+f%3,27,3,2,gold[2]);
  },
  antiAfk(a,f) {
    a.disc(14,16,12,ink); a.disc(14,16,11,gold[0]); a.disc(14,16,9,gold[2]);
    a.rect(13,7,2,2,hide[0]); a.rect(6,15,2,2,hide[0]); a.rect(13,23,2,2,hide[0]);
    a.line([[14,10],[14,16],[10+f,19]],hide[0],2);
    a.dot(14,16,white); blink(a,25,9,f,mint[2]);
  },
  autoRespawn(a,f) {
    heart(a,7,10+bob[f],coral);
    arrow(a,[[5,15],[5,10],[9,5],[20+pulse[f],5],[24+pulse[f],8]],mint,2);
    blink(a,23,25,f,gold[2]);
  },
  autoReconnect(a,f) {
    arrow(a,[[5,14],[5,9],[9,5],[20+lift[f],5],[25+lift[f],10]],mint,3);
    arrow(a,[[26,17],[26,23],[21,27],[11-lift[f],27],[6-lift[f],22]],blue,3);
    const dx = [0,1,2,1,0,-1][f];
    tile(a,8+dx,13,8,6,silver); tile(a,17-dx,13,7,6,silver);
    a.rect(5+dx,15,4,2,silver[1]); a.rect(23-dx,15,4,2,silver[1]);
    a.rect(14+dx,14,4,1,gold[2]); a.rect(14+dx,17,4,1,gold[1]);
  },
  idlePlayerBot(a,f) {
    const y=bob[f];
    tile(a,4,8+y,24,18,blue); tile(a,7,11+y,18,11,night);
    a.rect(10,14+y,4,f===3?1:4,mint[2]); a.rect(19,14+y,3,f===3?1:4,mint[2]);
    a.rect(13,20+y,6,1,blue[1]); a.rect(15,5+y,2,4,silver[1]);
    blink(a,16,4,f,gold[2]); a.rect(11,27+y,10,2,blue[0]);
  },
  rhythmParkour(a,f) {
    for (const [x,y] of [[2,24],[11,19],[20,15]]) {
      tile(a,x,y,9,5,leaf); a.rect(x+2,y+1,5,1,leaf[2]);
    }
    note(a,10+lift[f],4+bob[f],gold);
    a.line([[5,21],[6,16],[10+pulse[f],13]],blue[2]);
    blink(a,25,7,f,rose[2]);
  },
  cloudsPackNoise(a) {
    cloud(a,4,8,blue);
    for (const [x,y] of [[9,15],[13,13],[17,18],[24,15],[21,13],[7,19],[13,19],[25,20]]) a.rect(x,y,2,2,blue[2]);
    a.rect(9,24,4,2,blue[0]); a.rect(17,25,3,2,blue[1]); a.rect(22,23,4,2,mint[2]);
  },
  chatVideos(a,f) {
    framed(a,2,5,28,23,silver);
    a.poly([[12,12],[12,22],[21,17]],coral[1]); a.poly([[13,13],[13,20],[18,17]],white);
    a.rect(6,23,19,2,blue[0]); a.rect(6,22,4+f*4,3,coral[2]);
  },
  chatLinks(a,f) {
    const gap = [0,1,2,3,2,1][f];
    const left = [[12,19],[8,22],[4,21],[3,17],[7,12],[12,11]];
    const right = [[18,13],[23,8],[27,8],[29,12],[25,18],[20,19]];
    outlineLine(a,left.map(([x,y])=>[x+gap,y]),mint[1],4);
    outlineLine(a,right.map(([x,y])=>[x-gap,y]),blue[1],4);
    outlineLine(a,[[10,20],[21,11]],silver[2],3);
    blink(a,16,9,f,mint[2]);
  },
  chatMemes(a,f) {
    a.disc(15,16,13,ink); a.disc(15,16,12,gold[0]); a.disc(15,15,10,gold[1]);
    a.line([[7,13],[9,10],[12,12]],ink,2); a.line([[17,12],[20,10],[23,12]],ink,2);
    a.poly([[8,16],[23,16],[21,23],[15,25],[10,22]],hide[0]);
    a.rect(10,17,11,2+lift[f],white); a.rect(12,21+lift[f],7,2,coral[2]);
    blink(a,24,7,f,gold[2]);
  },
  gifChat(a,f) {
    framed(a,2,6,28,22,rose);
    for (const x of [5,10,15,20,25]) { a.rect(x,9,2,2,rose[2]); a.rect(x,23,2,2,rose[2]); }
    const x=9+pulse[f];
    a.poly([[x,14],[x,22],[x+7,18]],white);
    a.rect(22,15,2,6,rose[2]); a.rect(25,15,2,6,rose[2]);
  },
  clientChat(a,f) {
    bubble(a,9,11,21,14,violet);
    bubble(a,2,4+bob[f],22,17,blue);
    for (let i=0;i<3;i++) a.rect(7+i*5,11+bob[f]-(i === f%3 ? 2 : 0),2,2,white);
    a.rect(20,22,3+lift[f],2,violet[2]);
  },
  clientChatMentions(a,f) {
    bubble(a,3,4,25,21,night);
    const y=6+bob[f];
    a.line([[21,19+y-6],[12,19+y-6],[8,16+y-6],[8,11+y-6],[12,8+y-6],[19,8+y-6],[23,12+y-6],[23,17+y-6],[19,17+y-6],[18,13+y-6],[14,12+y-6],[12,15+y-6],[15,17+y-6],[18,15+y-6]],mint[2],2);
    blink(a,25,22,f,gold[2]);
  },
  discord(a,f) {
    const y=bob[f];
    a.poly([[5,9+y],[11,6+y],[21,6+y],[27,9+y],[30,22+y],[24,26+y],[22,23+y],[9,23+y],[7,26+y],[2,22+y]],ink);
    a.poly([[6,10+y],[12,7+y],[20,7+y],[26,10+y],[28,21+y],[24,24+y],[22,22+y],[10,22+y],[7,24+y],[4,21+y]],'#5865f2');
    if (f === 3) {
      a.rect(9,16+y,5,1,white); a.rect(19,16+y,5,1,white);
    } else {
      a.disc(11,16+y,3,white); a.disc(21,16+y,3,white);
    }
    a.line([[10,10+y],[16,9+y],[22,10+y]],'#adb5ff');
    a.rect(12,20+y,8,1,violet[0]); a.rect(24,6+f%3,4,2,'#adb5ff');
  },
  startupAnimation(a) {
    cube(a,9,15,7,9,coral);
    flame(a,16,19,0); glint(a,25,6,gold[2],4);
    a.rect(3,15,4,2,coral[2]); a.rect(7,24,3,2,gold[2]);
  },
  supportAds(a) {
    framed(a,2,4,28,24,gold);
    a.poly([[9,11],[9,21],[18,16]],white);
    a.disc(23,22,6,ink); a.disc(23,22,5,gold[1]); a.disc(23,22,3,gold[2]);
    a.rect(22,19,2,5,gold[0]); a.rect(21,21,4,1,gold[0]);
  },
  horror(a) {
    cloud(a,4,4,violet);
    a.poly([[5,15],[26,15],[26,27],[21,24],[16,28],[11,24],[5,27]],ink);
    a.poly([[6,13],[25,13],[25,25],[21,23],[16,26],[11,23],[6,25]],violet[1]);
    a.rect(10,13,4,5,ink); a.rect(19,13,4,5,ink);
    a.rect(11,15,2,2,coral[1]); a.rect(20,15,2,2,coral[1]);
    a.rect(14,20,5,4,ink); glint(a,25,5,rose[2],3);
  },

  // Experimental cards and presets
  experimentalAnimatedItems(a) {
    prism(a,9,7,blue);
    glint(a,24,6,gold[2],5); glint(a,6,10,violet[2],3);
    a.line([[3,23],[8,25],[16,25],[24,21],[28,20]],mint[2]);
    a.rect(5,26,7,2,blue[0]);
  },
  experimentalAurora(a) {
    framed(a,2,3,28,27,violet,night[0]);
    a.poly([[5,15],[11,12],[15,8],[20,11],[26,7],[26,13],[20,17],[15,13],[10,17],[5,20]],mint[1]);
    a.line([[5,15],[11,12],[15,8],[20,11],[26,7]],mint[2],2);
    a.line([[5,20],[10,17],[15,13],[20,17],[26,13]],violet[1],2);
    a.poly([[5,25],[11,20],[15,23],[21,19],[27,23],[27,27],[5,27]],night[1]);
    a.dot(8,9,white); a.dot(24,18,mint[2]);
  },
  experimentalConstellations(a) {
    framed(a,2,3,28,26,night,night[0]);
    a.line([[7,19],[12,10],[18,16],[24,10],[23,23]],violet[1]);
    for (const [x,y] of [[7,19],[12,10],[18,16],[24,10],[23,23]]) glint(a,x,y,gold[2],3);
  },
  experimentalFallenLeaves(a) {
    a.poly([[5,17],[6,6],[11,8],[15,2],[21,9],[26,6],[25,14],[29,16],[23,21],[17,20],[13,26],[9,22]],ink);
    a.poly([[6,17],[7,8],[11,10],[15,4],[20,11],[25,8],[24,14],[27,16],[22,20],[16,19],[13,24],[10,21]],gold[1]);
    a.poly([[7,15],[12,12],[15,6],[17,10],[15,16],[10,20]],coral[1]);
    a.line([[10,28],[14,21],[19,13]],hide[0],2);
    a.line([[18,23],[23,25],[27,24]],gold[2]);
  },
  experimentalInteractiveVegetation(a) {
    for (const [x,bend] of [[6,-3],[10,3],[16,5],[21,6],[26,2]]) blade(a,x,28,bend,leaf);
    a.rect(3,28,26,2,leaf[0]);
    arrow(a,[[5,11],[16,11],[22,14]],mint,2);
    a.rect(4,5,7,1,mint[2]);
  },
  experimentalPbr(a) {
    a.disc(16,16,13,ink); a.disc(16,16,12,silver[0]); a.disc(15,14,10,silver[1]);
    a.poly([[6,19],[11,21],[19,21],[25,16],[25,21],[22,25],[12,27],[7,24]],blue[0]);
    a.poly([[9,10],[14,7],[20,9],[20,12],[14,11],[10,14]],silver[2]);
    glint(a,20,10,white,5);
    a.rect(12,23,8,2,blue[1]); a.rect(22,25,2,1,blue[2]);
  },
  experimentalRealistic(a) {
    framed(a,2,3,28,26,blue,'#466ba0');
    a.disc(22,12,4,gold[2]);
    a.poly([[5,22],[11,13],[17,21],[22,17],[27,22],[27,26],[5,26]],night[0]);
    a.poly([[7,20],[11,15],[14,20],[11,19],[9,21]],silver[2]);
    a.line([[6,23],[13,23],[18,25],[26,23]],leaf[1],2);
    a.rect(7,9,6,1,blue[2]);
  },
  experimentalTinyTakeover(a) {
    tile(a,3,10,18,17,night); tile(a,3,6,6,9,night); tile(a,15,6,6,9,night);
    a.rect(6,8,2,4,rose[1]); a.rect(16,8,2,4,rose[1]);
    a.rect(7,16,3,3,white); a.rect(14,16,3,3,white);
    a.rect(9,21,7,4,silver[2]); a.rect(11,21,3,2,ink);
    tile(a,22,18,8,9,gold); a.rect(24,21,1,2,ink); a.rect(27,21,1,2,ink);
    glint(a,25,10,gold[2],4);
  },
  potato(a) {
    a.poly([[4,13],[9,7],[19,5],[26,9],[30,17],[26,24],[19,28],[9,26],[4,21]],ink);
    a.poly([[5,13],[10,8],[19,6],[25,10],[29,17],[25,23],[19,27],[10,25],[5,21]],hide[1]);
    a.poly([[7,13],[11,9],[19,8],[24,12],[23,16],[13,22],[7,19]],gold[1]);
    a.line([[8,13],[12,10],[17,9]],cream[2],2);
    for (const [x,y] of [[13,14],[22,13],[11,21],[20,22],[25,17]]) {
      a.rect(x,y,2,2,hide[0]); a.dot(x+1,y+1,cream[1]);
    }
  }
};

module.exports = { drawings };
