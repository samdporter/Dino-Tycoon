// ===== 47-world-patterns.js =====
window.Z = window.Z || {}; var Z = window.Z;
/* Overlay patterns: tile overlays (moat wet/dry/inadequate, safari and monorail routes and zones) used colour alone to tell states apart.
   Z.OvPat.mark(gb, tileIndex, kind, y) adds a dark glyph (quads) on top of an overlay tile to the same geometry builder `gb` (anything with .quad(a,b,c,d,col)).
   kinds: 'x' (bad / not working), 'dots' (dry / not powered), 's1' 's2' 's3' (one, two, three stripes: water level or strength), 'diag' (unconnected / waiting), 'dot' (single post / pylon), 'ring' (marker).
   Legends for the same states: 78-ui-legend.js. */
(function () {
  'use strict';
  var T = Z.TILE, N = Z.N, INK = 0x14222c, OV = Z.OvPat = {};
  function rect(gb, x0, z0, x1, z1, y) { gb.quad([x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0], INK); }
  function bar(gb, ax, az, bx, bz, w, y) {       // thick line a-b
    var dx = bx - ax, dz = bz - az, l = Math.sqrt(dx * dx + dz * dz) || 1, nx = -dz / l * w / 2, nz = dx / l * w / 2;
    gb.quad([ax + nx, y, az + nz], [ax - nx, y, az - nz], [bx - nx, y, bz - nz], [bx + nx, y, bz + nz], INK);
  }
  OV.mark = function (gb, t, kind, y) {
    var i = t % N, j = (t - i) / N, x = i * T, z = j * T, c = T / 2, u = T * 0.14, a = T * 0.22, b = T * 0.78; y += 0.03;
    switch (kind) {
      case 'x': bar(gb, x + a, z + a, x + b, z + b, u, y); bar(gb, x + a, z + b, x + b, z + a, u, y); break;
      case 'dots': for (var k = 0; k < 3; k++) rect(gb, x + T * (0.2 + k * 0.27), z + c - u * 0.6, x + T * (0.2 + k * 0.27) + u * 1.2, z + c + u * 0.6, y); break;
      case 's1': rect(gb, x + a, z + c - u * 0.5, x + b, z + c + u * 0.5, y); break;
      case 's2': rect(gb, x + a, z + T * 0.34 - u * 0.5, x + b, z + T * 0.34 + u * 0.5, y); rect(gb, x + a, z + T * 0.66 - u * 0.5, x + b, z + T * 0.66 + u * 0.5, y); break;
      case 's3': for (var q = 0; q < 3; q++) rect(gb, x + a, z + T * (0.25 + q * 0.25) - u * 0.45, x + b, z + T * (0.25 + q * 0.25) + u * 0.45, y); break;
      case 'diag': bar(gb, x + a, z + b, x + b, z + a, u, y); break;
      case 'dot': rect(gb, x + c - u, z + c - u, x + c + u, z + c + u, y); break;
      case 'ring': rect(gb, x + a, z + a, x + b, z + a + u * 0.8, y); rect(gb, x + a, z + b - u * 0.8, x + b, z + b, y); rect(gb, x + a, z + a, x + a + u * 0.8, z + b, y); rect(gb, x + b - u * 0.8, z + a, x + b, z + b, y); break;
    }
  };
})();
