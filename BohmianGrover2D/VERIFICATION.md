# Verification — improved phase-gradient arrows

## Changes checked

- Removed the previous two-pass black-outline plus gray-fill arrow rendering.
- Each arrow is now drawn once as a six-vertex bounding quad.
- The fragment shader constructs the glyph using signed-distance functions:
  - rounded capsule shaft;
  - one filled triangular arrowhead;
  - derivative-based edge coverage using `fwidth`.
- Arrow hue is complementary to the local wave phase, making the field colorful and readable over the rainbow wave display.
- Arrow length and thickness continue to encode the magnitude of the phase gradient.
- Arrows still fade near wave nodes and very weak gradients.

## Static checks performed

- `main.js` syntax passed `node --check`.
- `recording.js` syntax passed `node --check`.
- All shader files referenced by `main.js` are present.
- All DOM IDs referenced by `main.js` are present in `index.html`.
- GLSL files have balanced braces and use GLSL ES 3.00.
- No stale `uColor` or `uOpacity` arrow uniforms remain.
- The instanced arrow draw call uses the new six-vertex quad geometry.

## Visual-design check

A high-resolution mock-up of the same rounded-shaft, single-head, complementary-hue design was inspected to confirm that the intended appearance is smooth, colorful, and free of the old doubled edge. The actual project performs contour anti-aliasing in the fragment shader.
