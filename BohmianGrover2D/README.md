# Bohmian Grover Search — Phase-gradient arrows

Top-down WebGL2 demonstration of a two-qubit Grover search encoded in one particle's two-dimensional wavefunction.

## Running

Serve this folder with VS Code Live Server and open `index.html`.

## Phase-gradient overlay

The vector field is computed directly from the numerical complex wave texture:

`grad S = Im(conj(psi) grad psi) / |psi|^2`

For forward mixing, `v = (hbar/m) grad S`; for inverse mixing with `-H_box`, `v = -(hbar/m) grad S`. Arrow direction shows the guiding direction for the most recent mixing Hamiltonian. Arrow length and thickness both increase monotonically with `|grad S|`; the displayed scaling is compressed to keep large near-node values readable. Arrows fade at low density because phase is undefined at exact nodes.

With the HSV palette used by the renderer, increasing phase runs red → yellow → green → cyan → blue → violet → red. During forward mixing the arrows locally point along that cyclic colour order; during inverse mixing they point against it. Low density or phase singularities can make this comparison ambiguous.

The simulation remains checkpointed: time advances only during an operation.

## Inverse-Mixing branch

The inverse stage now applies `exp(+i H_box tau / hbar)` by passing a negative
step to the existing wave and particle solvers. It lasts `MIX_TIME`, replacing
the original `3*MIX_TIME` forward wait. Preparation and final forward mixing,
oracle/reference pulses, rendering parameters, and particle integration are
otherwise unchanged. Playback time, progress, and trail fading stay positive.
This is a numerical sign reversal, not a newly modeled physical control device.
The endpoint agrees with the former inverse up to a global phase; since the
renderer shows absolute phase, its hues can be shifted while probabilities agree.

## Phase-gradient arrow rendering

The phase-gradient overlay uses a single signed-distance-field rendering pass. Each arrow has a rounded capsule shaft and one filled triangular head. Shader derivatives anti-alias the contour, so there is no doubled black outline or hard polygon stair-stepping. The arrow hue is complementary to the local wave phase, while length and thickness still encode the phase-gradient magnitude.
