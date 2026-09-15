
(() => {
  'use strict';

  const MODELS = {
    
    wolf: {
      texW: 32, texH: 32, texName: 'wolf_baby', texDir: 'wolf',
      texVariants: { tame: 'wolf_tame_baby', angry: 'wolf_angry_baby' },
      root: {
        name: 'root', pivot: [0, 0, 0],
        children: [
          {
            name: 'head', pivot: [0, 18.25, -4],
            boxes: [
              { u: 0, v: 12, coords: [-2.99, -3.25, -3, 6, 5, 5], grow: 0.025 },
              { u: 17, v: 12, coords: [-1.5, -0.24, -5, 3, 2, 2] }
            ],
            children: [
              { name: 'right_ear', pivot: [-2, -4.25, -0.5], boxes: [{ u: 0, v: 5, coords: [-1, -1, -0.5, 2, 2, 1] }] },
              { name: 'left_ear', pivot: [2, -4.25, -0.5], boxes: [{ u: 20, v: 5, coords: [-1, -1, -0.5, 2, 2, 1] }] }
            ]
          },
          { name: 'body', pivot: [0, 19, 0], boxes: [{ u: 0, v: 0, coords: [-3, -2, -4, 6, 4, 8] }] },
          { name: 'right_hind_leg', pivot: [-1.5, 21, 3], boxes: [{ u: 0, v: 22, coords: [-1, 0, -1, 2, 3, 2] }] },
          { name: 'left_hind_leg', pivot: [1.5, 21, 3], boxes: [{ u: 8, v: 22, coords: [-1, 0, -1, 2, 3, 2] }] },
          { name: 'right_front_leg', pivot: [-1.5, 21, -3], boxes: [{ u: 0, v: 0, coords: [-1, 0, -1, 2, 3, 2] }] },
          { name: 'left_front_leg', pivot: [1.5, 21, -3], boxes: [{ u: 20, v: 0, coords: [-1, 0, -1, 2, 3, 2] }] },
          {
            name: 'tail', pivot: [0, 19, 3], rot: [-0.5236, 0, 0],
            children: [
              { name: 'tail_r1', pivot: [0, -0.6, 0.2], rot: [-3.1, 0, 0], boxes: [{ u: 22, v: 16, coords: [-1, -5.7, -1, 2, 6, 2] }] }
            ]
          }
        ]
      }
    },

    cow: {
      texW: 64, texH: 64, texName: 'cow_temperate_baby', texDir: 'cow',
      root: {
        name: 'root', pivot: [0, 0, 0],
        children: [
          {
            name: 'head', pivot: [0, 13.569, -5.1667],
            boxes: [
              { u: 0, v: 18, coords: [-3, -4.569, -4.8333, 6, 6, 5] },
              { u: 8, v: 29, coords: [3, -5.569, -3.8333, 1, 2, 1] },
              { u: 4, v: 29, coords: [-4, -5.569, -3.8333, 1, 2, 1], mirror: true },
              { u: 12, v: 29, coords: [-2, -1.569, -5.8333, 4, 3, 1] }
            ]
          },
          { name: 'body', pivot: [3, 19, -5], boxes: [{ u: 0, v: 0, coords: [-7, -7, -1, 8, 6, 12] }] },
          { name: 'right_front_leg', pivot: [-2.5, 18, -3.5], boxes: [{ u: 22, v: 18, coords: [-1.5, 0, -1.5, 3, 6, 3] }] },
          { name: 'left_front_leg', pivot: [2.5, 18, -3.5], boxes: [{ u: 34, v: 18, coords: [-1.5, 0, -1.5, 3, 6, 3] }] },
          { name: 'right_hind_leg', pivot: [-2.5, 18, 3.5], boxes: [{ u: 22, v: 27, coords: [-1.5, 0, -1.5, 3, 6, 3] }] },
          { name: 'left_hind_leg', pivot: [2.5, 18, 3.5], boxes: [{ u: 34, v: 27, coords: [-1.5, 0, -1.5, 3, 6, 3] }] }
        ]
      }
    },

    pig: {
      texW: 32, texH: 32, texName: 'pig_temperate_baby', texDir: 'pig',
      root: {
        name: 'root', pivot: [0, 0, 0],
        children: [
          { name: 'body', pivot: [0, 19, 0.5], boxes: [{ u: 0, v: 0, coords: [-3.5, -3, -4.5, 7, 6, 9] }] },
          {
            name: 'head', pivot: [0, 19, -2],
            boxes: [
              { u: 0, v: 15, coords: [-3.5, -5, -5, 7, 6, 6], grow: 0.025 },
              { u: 6, v: 27, coords: [-1.5, -1.975, -6, 3, 2, 1], grow: 0.015 }
            ]
          },
          { name: 'left_front_leg', pivot: [2.5, 22, -3], boxes: [{ u: 0, v: 0, coords: [-1, 0, -1, 2, 2, 2] }] },
          { name: 'right_front_leg', pivot: [-2.5, 22, -3], boxes: [{ u: 23, v: 0, coords: [-1, 0, -1, 2, 2, 2] }] },
          { name: 'left_hind_leg', pivot: [2.5, 22, 4], boxes: [{ u: 0, v: 4, coords: [-1, 0, -1, 2, 2, 2] }] },
          { name: 'right_hind_leg', pivot: [-2.5, 22, 4], boxes: [{ u: 23, v: 4, coords: [-1, 0, -1, 2, 2, 2] }] }
        ]
      }
    },

    sheep: {
      texW: 64, texH: 32, texName: 'sheep_baby', texDir: 'sheep',
      root: {
        name: 'root', pivot: [0, 0, 0],
        children: [
          { name: 'body', pivot: [0, 17, 0.5], boxes: [{ u: 0, v: 10, coords: [-3, -2, -4.5, 6, 4, 9] }] },
          { name: 'head', pivot: [0, 15.5, -2.5], boxes: [{ u: 0, v: 0, coords: [-2.5, -4.5, -3.5, 5, 5, 5] }] },
          { name: 'right_hind_leg', pivot: [-2, 19, 3], boxes: [{ u: 0, v: 23, coords: [-1, 0, -1, 2, 5, 2] }] },
          { name: 'left_hind_leg', pivot: [2, 19, 3], boxes: [{ u: 24, v: 12, coords: [-1, 0, -1, 2, 5, 2] }] },
          { name: 'right_front_leg', pivot: [-2, 19, -2], boxes: [{ u: 8, v: 23, coords: [-1, 0, -1, 2, 5, 2] }] },
          { name: 'left_front_leg', pivot: [2, 19, -2], boxes: [{ u: 24, v: 5, coords: [-1, 0, -1, 2, 5, 2] }] }
        ]
      }
    },

    chicken: {
      texW: 16, texH: 16, texName: 'chicken_temperate_baby', texDir: 'chicken',
      root: {
        name: 'root', pivot: [0, 0, 0],
        children: [
          {
            name: 'body', pivot: [0, 20.25, -1.25],
            boxes: [
              { u: 0, v: 0, coords: [-2, -2.25, -0.75, 4, 4, 4] },
              { u: 10, v: 8, coords: [-1, -0.25, -1.75, 2, 1, 1] }
            ]
          },
          { name: 'left_leg', pivot: [1, 22, 0.5], boxes: [{ u: 2, v: 2, coords: [-0.5, 0, 0, 1, 2, 0] }] },
          { name: 'right_leg', pivot: [-1, 22, 0.5], boxes: [{ u: 0, v: 2, coords: [-0.5, 0, 0, 1, 2, 0] }] },
          { name: 'right_wing', pivot: [2, 20, 0], boxes: [{ u: 6, v: 8, coords: [0, 0, -1, 1, 0, 2] }] },
          { name: 'left_wing', pivot: [-2, 20, 0], boxes: [{ u: 4, v: 8, coords: [-1, 0, -1, 1, 0, 2] }] }
        ]
      }
    }
  };

  globalThis.MF_TINY_MODELS = MODELS;
})();
