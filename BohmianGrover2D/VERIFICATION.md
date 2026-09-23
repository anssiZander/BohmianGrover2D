# Verification — inverse mixing

## Numerical sign reversal — 2026-09-24

Branch `Inverse-Mixing` replaces the forward `3*MIX_TIME` inverse with a
negative-Hamiltonian evolution lasting `MIX_TIME`. The existing RK4 wave step
and particle step receive the same signed time step; elapsed time and trail
decay remain positive. The guidance arrows use the matching sign. No appearance
parameters, phase gates, preparation, or final forward mixer were changed.

An external browser test fixture exercised the production WebGL2 shaders on
the NVIDIA GeForce RTX 4070 Ti SUPER (ANGLE / D3D11), at the normal 128² wave
resolution and time step 0.00003. All **40/40 checks passed**:

- Every checkpoint and complete complex spatial field for all four targets
  matched an independent evolution of the finite-difference sine spectrum.
- The inverse took 0.1061303526 simulation units, equal to one mixer interval.
- Both individual gate buttons and the queued full search used that interval.
- The inverse particle step matched negative-time integration exactly; its
  arrows had sign -1 and its trail fading factor remained between zero and one.
- A forward/backward round trip recovered the full initial spatial wave.
- No WebGL errors were reported.

Maximum complex modal-amplitude error: `2.644e-7`; maximum spatial component
error: `4.689e-6`; maximum norm error: `2.146e-7`. Minimum final target logical
probability across all four targets: `0.9999999401`. These logical probabilities
remain distinct from geometric quadrant or particle percentages.

The automated fixture used 1,000 particles to keep repeated wave checks quick.
The normal page was also inspected during inverse mixing and at its checkpoint
with the unchanged 30,000-dot configuration, colors, trails, and arrow styling.
JavaScript syntax checks and `git diff --check` also passed.

## Earlier arrow-rendering verification

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
