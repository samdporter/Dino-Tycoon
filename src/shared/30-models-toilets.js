// Shared detailed toilet exterior used by both park variants.
var Z = window.Z = window.Z || {};
(function () {
Z.SharedModels = Z.SharedModels || {};
Z.SharedModels.toilets = function (grp0, k) {
  var g = k.B();
  g.bevelBox(3.7, 0.12, 1.82, 0.04, 0, 0.06, 0, 0x8d8a84);
  g.bevelBox(3.45, 0.55, 1.56, 0.04, 0, 0.38, 0, 0xb4b8bc);
  g.bevelBox(3.4, 1.52, 1.52, 0.05, 0, 1.38, 0, 0xe0e4e8);
  for (var sP = -1; sP <= 1; sP += 2) g.cyl(0.08, 0.09, 2.02, sP * 1.66, 1.12, 0.74, 0x6a8aa8, { seg: 8 });
  k.gable(g, 3.45, 1.65, 2.08, 0.58, 0x526576, 0.22);
  g.bevelBox(1.2, 0.26, 0.52, 0.04, 0, 2.55, 0, 0x6c7c8a); // roof clerestory vent
  g.bevelBox(3.54, 0.22, 0.08, 0.03, 0, 1.94, 0.77, 0x5d82a4);
  var door = function (x, col, fem) {
    g.bevelBox(0.92, 1.62, 0.08, 0.025, x, 0.92, 0.74, 0xf4f4f4);
    g.bevelBox(0.8, 1.5, 0.07, 0.02, x, 0.9, 0.77, col);
    g.sph(0.04, 0.04, 0.04, x + 0.3, 0.85, 0.83, 0xe8c040, { s: [5, 4] });
    g.sph(0.07, 0.07, 0.03, x, 1.5, 0.82, 0xffffff, { s: [6, 4] }); g.box(fem ? 0.1 : 0.14, 0.22, 0.03, x, 1.32, 0.82, 0xffffff);
    if (fem) g.cone(0.14, 0.22, x, 1.26, 0.82, 0xffffff, { seg: 3 });
    else { g.box(0.04, 0.16, 0.03, x - 0.1, 1.3, 0.82, 0xffffff); g.box(0.04, 0.16, 0.03, x + 0.1, 1.3, 0.82, 0xffffff); }
  };
  door(-0.9, 0x3b82f6, false); door(0.9, 0xf472b6, true);
  k.windowAt(g, 0, 1.48, 0.77, 0.45, 0.35, 0xffffff, 0xaed8f0);
  g.bevelBox(0.55, 0.3, 0.06, 0.02, 0, 1.0, 0.77, 0x5d82a4);
  g.lathe([[0.18, 0], [0.22, 0.22], [0.16, 0.24]], 0x9a6a4a, { seg: 8, x: 1.52, y: 0.1, z: 0.92, cap0: true });
  g.sph(0.22, 0.2, 0.22, 1.52, 0.4, 0.92, 0x3f8a4a, { s: [6, 5] });
  g.lathe([[0.18, 0], [0.22, 0.22], [0.16, 0.24]], 0x9a6a4a, { seg: 8, x: -1.52, y: 0.1, z: 0.92, cap0: true });
  g.sph(0.22, 0.2, 0.22, -1.52, 0.4, 0.92, 0x3f8a4a, { s: [6, 5] });
  grp0.add(k.mesh(g.build()));
  grp0.add(k.labelMesh('WC', 0x5d82a4, 0xffffff, 0.45, 0.25, 0, 1.0, 0.81, 0));
};
})();
