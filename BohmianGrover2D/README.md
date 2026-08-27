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

## Phase-gradient overlay

The white vector field is computed directly from the numerical complex wave texture:

`grad S = Im(conj(psi) grad psi) / |psi|^2`

For this spinless model, `v = (hbar/m) grad S`. Arrow direction therefore gives the Bohmian guiding direction. Arrow length and thickness both increase monotonically with `|grad S|`; the displayed scaling is compressed to keep large near-node values readable. Arrows fade at low density because phase is undefined at exact nodes.

With the HSV palette used by the renderer, increasing phase runs red → yellow → green → cyan → blue → violet → red. Thus the arrows locally point along that cyclic colour order, except where the colour field is too dim or the phase is singular.

The simulation remains checkpointed: time advances only during an operation. Parallel mode groups ten unchanged RK4 time steps into each rendered frame to keep four-wave animation responsive; the numerical time step itself remains `0.00003`.

## Phase-gradient arrow rendering

The phase-gradient overlay uses a single signed-distance-field rendering pass. Each arrow has a rounded capsule shaft and one filled triangular head. Shader derivatives anti-alias the contour, so there is no doubled black outline or hard polygon stair-stepping. The arrow hue is complementary to the local wave phase, while length and thickness still encode the phase-gradient magnitude.

## Verification

Run the dependency-free static check with Node.js if desired:

```powershell
node tests\static-check.mjs
```

Node is only used for verification; it is not needed to run the simulation. Browser and numerical observations are recorded in `VERIFICATION.md`.
