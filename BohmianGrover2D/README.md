# Bohmian Grover Search — parallel marked states

Top-down WebGL2 demonstration of a two-qubit Grover search encoded in one particle's two-dimensional wavefunction.

## Running

Serve this folder with VS Code Live Server and open `index.html`. The workspace Live Server port is `5501`; no package installation or build step is required.

## Parallel and single-grid views

The app opens in a **2×2 grid of 2×2 logical grids**. Each mini-grid is an independent Grover experiment with its own 128×128 complex wave, RK4 evolution buffers, Bohmian particle ensemble, and trails:

| Mini-grid | Marked state |
| --- | --- |
| upper-left | `|01⟩` |
| upper-right | `|11⟩` |
| lower-left | `|00⟩` |
| lower-right | `|10⟩` |

The shared operation buttons advance all four searches through preparation, their respective oracle phase marks, inverse mixing, the `|00⟩` reference reflection, and forward mixing. Each red header names the state marked in that mini-grid and shows its progress, then its final target fidelity. Clicking a header selects that experiment for the detailed diagnostics panel without changing or resetting the other searches.

This view compares four counterfactual experiments. It is not one larger quantum state, a superposition over oracle choices, or one oracle query that marks four answers.

Use **Switch to single-grid view** to restore the original large simulation. All four target buttons remain on the upper edge. Selecting a target in single view resets the search, and changing view modes resets all four contexts so their shared checkpoint remains consistent.

## Marked-quadrant indicator

The marked region now uses a persistent crimson tint, a broad red edge glow, and a bright narrow outline. This makes the intended target clear against every rainbow phase while preserving the density and phase structure underneath.

At the ideal endpoint each selected logical-mode probability is 100%. The visible geometrical quadrant particle fraction is lower (typically about 84–86%) because the smooth sine-mode logical packets have spatial tails across the midlines; those tails are part of the encoding, not failed Grover amplification.

## Live quantum-gate circuit

The floating panel on the right shows the implemented two-qubit circuit as

`|00⟩ → A → O_w → A† → S₀₀ → A → answer`.

The first `A` prepares the balanced state. `O_w` phase-marks the selected state, and the final three gates are the displayed decomposition of the diffuser, `D = A S₀₀ A†` (read from right to left as an operator product).

The currently running gate pulses in blue, completed gates remain green with checkmarks, and upcoming gates stay dim. The status line reports the operation number and progress; pausing also freezes and recolors the active circuit gate. In parallel view the target reads “all four targets,” while single view shows the chosen `w = |q⟩`. Use the minus/plus button to minimize or restore the panel. Minimizing it moves the diagnostics panel upward.

## Effective Grover Bloch sphere

In single-grid view, the diagnostics panel shows an interactive sphere
synchronized with preparation, oracle, inverse mixing, reference phase, and
forward mixing. It follows individual operations, queued runs, pause, reset,
and target selection. It is hidden and skips drawing in parallel view.

The north pole is the marked state `|ω⟩`; the south pole is the normalized equal
sum `|s′⟩` of the other three states, in the fixed phase convention below. If
their amplitudes are `m` and `u`, the sphere represents the normalized projection
`(m|ω⟩ + u|s′⟩)/√p`, where `p = |m|² + |u|²`. This is an effective two-state
representation, not a reduced state of either physical qubit.

The gold vector has unit length in three dimensions, with coordinates
`r = (2 Re(m* u), 2 Im(m* u), |m|² − |u|²) / p`, where `m*` is the complex
conjugate. Its tip stays on the sphere; the screen projection can look shorter.
Drag to orbit, or focus the sphere and use the arrow keys. **Reset view** or
**Home** restores the initial viewpoint. Dashed, dimmer segments lie on the
rear hemisphere. A gold curve traces the current gate's path, a pale ring marks
its input, and a cyan ring marks the prepared `|s⟩`.

The **In Grover subspace** bar reports `p`; **Outside** reports `1 − p`. Those
values matter because preparation and the separate diffuser subgates can leave
this two-dimensional complex subspace. **Marked within subspace** is
`(1 + r_z)/2`, while **Marked · full state** is `p(1 + r_z)/2`. The oracle rotates
the relative phase around the vertical axis with marked probability fixed at
25%. The complete search ends at the north pole with subspace weight 100%.
A zero-weight projection, if encountered, hides the vector and reports its
direction as undefined instead of inventing a unit vector.

`grover-geometry.js` evaluates the exact four-mode evolution at the numerical
gate's current fraction; it does not interpolate between endpoints or use an
independent animation clock. In terms of the numerical wave's logical amplitudes
`a_q`, the effective basis uses `b_q = i^(-popcount(q)) a_q`, so the prepared
state has equal amplitudes up to a common phase. The internal amplitude model
also removes the common box-energy phase and chooses the conventional diffuser
sign. These global phases cancel from the Bloch vector and all weight readouts.
The sphere has a lightweight SVG renderer with an orthographic 3D projection;
the spatial wave, particles, trails, and WebGL2 solvers retain their original
phases, appearance, and evolution.

The supplied PNG remains in `assets/grover-reflections.png` as a reference;
the visible sphere is drawn and animated entirely with SVG.

## Guidance overlay

The vector field is computed directly from the numerical complex wave texture:

`grad S = Im(conj(psi) grad psi) / |psi|^2`

For forward mixing, `v = (hbar/m) grad S`; for inverse mixing with `-H_box`, `v = -(hbar/m) grad S`. Arrow direction shows the guiding direction for the most recent mixing Hamiltonian. Arrow length and thickness both increase monotonically with `|grad S|`; the displayed scaling is compressed to keep large near-node values readable. Arrows fade at low density because phase is undefined at exact nodes.

With the HSV palette used by the renderer, increasing phase runs red → yellow → green → cyan → blue → violet → red. During forward mixing the arrows locally point along that cyclic colour order; during inverse mixing they point against it. Low density or phase singularities can make this comparison ambiguous.

The simulation remains checkpointed: time advances only during an operation. Parallel mode groups ten unchanged RK4 time steps into each rendered frame to keep four-wave animation responsive; the numerical time step itself remains `0.00003`.

## Inverse-Mixing branch

The inverse stage now applies `exp(+i H_box tau / hbar)` by passing a negative
step to the existing wave and particle solvers. It lasts `MIX_TIME`, replacing
the original `3*MIX_TIME` forward wait. Preparation and final forward mixing,
oracle/reference pulses, rendering parameters, and particle integration are
otherwise unchanged. Playback time, progress, and trail fading stay positive.
This is a numerical sign reversal, not a newly modeled physical control device.
The endpoint agrees with the former inverse up to a global phase; since the
renderer shows absolute phase, its hues can be shifted while probabilities agree.
The branch includes `main`'s four-grid and single-grid views, circuit highlighting,
target selection, and rendering defaults. All four searches use the same signed
inverse segment and retain their own waves, particles, and trails.

## Phase-gradient arrow rendering

The phase-gradient overlay uses a single signed-distance-field rendering pass. Each arrow has a rounded capsule shaft and one filled triangular head. Shader derivatives anti-alias the contour, so there is no doubled black outline or hard polygon stair-stepping. The arrow hue is complementary to the local wave phase, while length and thickness still encode the phase-gradient magnitude.

## Verification

Run the dependency-free static check with Node.js if desired:

```powershell
node tests\static-check.mjs
node tests\geometry-check.mjs
```

Node is only used for verification; it is not needed to run the simulation. Browser and numerical observations are recorded in `VERIFICATION.md`.
