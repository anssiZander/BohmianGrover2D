# Bohmian Grover Search — Phase-gradient arrows

Top-down WebGL2 demonstration of a two-qubit Grover search encoded in one particle's two-dimensional wavefunction.

## Running

Serve this folder with VS Code Live Server and open `index.html`.

## Phase-gradient overlay

The white vector field is computed directly from the numerical complex wave texture:

`grad S = Im(conj(psi) grad psi) / |psi|^2`

For this spinless model, `v = (hbar/m) grad S`. Arrow direction therefore gives the Bohmian guiding direction. Arrow length and thickness both increase monotonically with `|grad S|`; the displayed scaling is compressed to keep large near-node values readable. Arrows fade at low density because phase is undefined at exact nodes.

With the HSV palette used by the renderer, increasing phase runs red → yellow → green → cyan → blue → violet → red. Thus the arrows locally point along that cyclic colour order, except where the colour field is too dim or the phase is singular.

The simulation remains checkpointed: time advances only during an operation.

## Phase-gradient arrow rendering

The phase-gradient overlay uses a single signed-distance-field rendering pass. Each arrow has a rounded capsule shaft and one filled triangular head. Shader derivatives anti-alias the contour, so there is no doubled black outline or hard polygon stair-stepping. The arrow hue is complementary to the local wave phase, while length and thickness still encode the phase-gradient magnitude.
