# Ordinary Grover

The `Ordinary-Grover` branch presents the logical algorithm as **3D signed
amplitude columns on a selectable 2×2–5×5 grid**. The layout matches the physics
branches: controls on the left, the main view in the center, and the gate circuit
at the top of the right column with diagnostics underneath. There are no displayed
waves, particles, currents, or spatial-density calculations.

Column height defaults to **Re(a)** on a fixed −1 to +1 scale, so the oracle
visibly flips the marked column through the grid's zero plane. For the default
4×4 input, preparation gives +0.25 in every cell, then the oracle takes the marked
amplitude to −0.25. Its probability remains 6.25%. The open grid has no opaque
floor to hide negative columns. The **Columns** selector can also show Im(a)
or the original nonnegative probability `|a|²` (0–100%).

During a continuous phase pulse, the amplitude rotates through the imaginary
direction: a zero real column is not necessarily a zero probability. Both complex
components and the probability remain available in the inspector. Phase colors
show the full complex amplitude's phase in every view.

The algorithm runs in an independent **`ordinary-core.js` state-vector model**.
It has no dependencies on spatial waves, particles, box evolution, or any of the
physics branches. Gate endpoints come directly from finite-dimensional matrices.
The other branches, including `main`, are independent.

## Run

Serve this directory with a static server, for example:

```powershell
python -m http.server 8835 --bind 127.0.0.1
```

Open `http://127.0.0.1:8835/`. A browser with WebGL is required. There are no
external libraries, CDN requests, package installations, or build steps.
All active page assets and module imports use `?v=20261014-continue-rounds`.

## Sequence

1. Begin with one column at amplitude +1 in the chosen initial state `|i⟩`.
2. Prepare with `H`: every amplitude has magnitude `1/N` on an N×N grid.
3. Apply the oracle `Oω`, flipping only the marked amplitude's phase.
4. Apply `H`, the same Hadamard, since `H† = H`.
5. Apply `Sᵢ = I − 2|i⟩⟨i|`, flipping only the initial-state amplitude.
6. Apply `H` again, completing one amplification round. Repeat steps 3–6.

The diffuser is `H Sᵢ H = I − 2|sᵢ⟩⟨sᵢ| = −D`, where `|sᵢ⟩ = H|i⟩`.
It equals the usual Grover diffuser with an overall minus sign. This convention
lets the middle operation visibly flip only the initial column: every other
amplitude stays fixed throughout that operation. For the all-zero input, the
full diffuser acts as `a → a − 2 × mean`. The overall sign changes no probability
and is displayed explicitly, with no hidden phase correction. See the
[Grover operator definition in IBM's documentation](https://quantum.cloud.ibm.com/docs/en/api/qiskit/qiskit.circuit.library.grover_operator).

The display shows every actual sign, including negative unmarked amplitudes
inside the diffuser. For 4×4 with initial `0000` and marked `1111`, the first
post-oracle H gives +0.875 in `0000` and ±0.125 in the other states. These are
ordinary Hadamard interference, independent of any wave model. The next Sᵢ
flips the initial amplitude from +0.875 to −0.875 and keeps all others fixed.
After the full first diffuser, the marked amplitude is −0.6875 and every
unmarked amplitude is −0.1875. After round 3 they are −0.98046875 and +0.05078125
respectively. The displayed amplitudes differ from the positive-D convention
by the common factor `(-1)^round` at complete rounds.

Preparation runs once. The recommended first peak is after 1, 2, 3, or 3 rounds
for 2×2, 3×3, 4×4, or 5×5 respectively; manual rounds can continue indefinitely.
For the default 4×4 grid, the marked probability is 6.25%
after preparation and 47.265625%, 90.844727%, and 96.131897% after each round.

On 2×2 and 4×4, `H` is the usual tensor-product qubit Hadamard. The 3×3 and
5×5 options use a Hermitian complex balanced mixer,
`B[(x,y),(u,v)] = exp(2πi(xv−yu)/N)/N`, labelled **B** to distinguish these
non-qubit grids as generalized amplitude amplification. `B† = B` and `B² = I`.
Every basis input prepares equal
probabilities; nonzero initial coordinates can produce different phases.

Labels are binary for 2×2/4×4 and `|x,y⟩` for odd grids. The state index is
`q = N*x + y`, matching the original implementation. The animation between
gate endpoints is a display choice, not a physical simulation or additional
Grover steps. For any reflection gate G, it uses
`U(p) = (I+G)/2 + exp(−iπp)(I−G)/2` for progress p from 0 to 1. This preserves
normalization and uses the exact gate matrix at the endpoint. All H operations
use the same animation, including the first step of the diffuser. With Combine
enabled, G is the complete `H Sᵢ H` reflection, so the animation goes directly
from the post-oracle state to the full mixer result. For real endpoints, every
column follows `(1 − t) × start + t × end`, where `t = (1 − cos(πp))/2`.
The imaginary component preserves normalization throughout this transition.
Complex values during the animation are not required intermediate states of the discrete algorithm.

## Controls

- **Mean plane / mixer reference** is on by default in the real and imaginary
  amplitude views. For the all-zero input, a translucent gold plane shows the
  current mean of the displayed amplitude component. During the combined mixer,
  this plane moves by exactly the same displacement as the columns, from the
  input mean `μ₀` to `−μ₀`, passing through zero halfway through a real transition.
  A dashed level marks the final mean `−μ₀` until the moving plane arrives there;
  the arrow retains the full displacement `−2μ₀`. In separate mode, the gold plane
  tracks the actual mean of each intermediate gate state. Pause freezes it and
  Previous step restores it with the columns.
  The first 4×4 input mean is `+0.21875`, giving a shift of `−0.43750`.
  The diagnostics show these values precisely. With a nonzero initial state,
  preparation has varying phases, so per-column reference tiles instead show
  the current `p_j = s_j⟨s|a⟩`, with exact full-mixer displacement `−2p_j₀` computed
  from the mixer input. These tiles also move with the combined transition. The hover inspector
  selects the reference reported in diagnostics. Probability view hides the guide:
  the mixer acts on amplitudes, not their squared magnitudes.
- **Combine**, directly above the mixer gates in the circuit, shows `H Sᵢ H`
  (or `B Sᵢ B`) as one operation. The columns interpolate directly from the
  post-oracle state to the complete mixer result in one 2.4-second animation
  at 1× speed. No intermediate H or initial-state flip stages are displayed.
  The exact endpoint retains all signs, including the overall minus. The 4×4
  search has 7 displayed operations in this mode instead of 13.
  Toggle between modes at an operation boundary outside the mixer; switching keeps
  the current state and iteration history. Finish an active or partially stepped
  mixer (or reset) before switching. The setting persists through reset and grid changes.
- **Apply next operation** animates one operation and stops at its checkpoint.
  It remains available beyond the recommended Grover peak, so additional
  oracle–mixer rounds can show overshoot and later oscillations. The measurement
  icon lights at the recommended round and remains lit during further rounds;
  rewinding before that point turns it off. The iteration history extends and
  scrolls horizontally as needed. Both mixer modes and Previous step work in
  these extra rounds, with the same exact amplitude signs and moving mean plane.
  **Run full search** starts again from the selected input and stops at the
  recommended measurement point. Continue manually with the next-operation button.
- **Previous step**, beside the next-operation button, restores the preceding
  checkpoint with its exact signed amplitudes and updates the circuit and iteration
  history. In combined mode, the whole mixer counts as one step. During a running
  or paused operation, it cancels that operation and returns to its starting
  checkpoint. It stops autoplay and keeps the selected states, mixer mode and camera.
- **Pause/Resume**, **Reset**, and animation speed control the same clock.
  Space pauses/resumes; R resets when an input or button does not have focus.
  Reset keeps the chosen input, marked state, and camera orientation.
- Choose initial/marked states using the selectors or **Pick initial/marked**
  followed by a click on a column or grid square. Selection is locked during
  a running or paused gate. Orbit gestures never select a state.
- **Grid size** resets the search even during a gate, clears history and pause,
  and preserves selected coordinates where possible, clamping at the boundary.
- **Drag** with a mouse or one finger to orbit; **scroll** or **pinch** to zoom.
  Camera buttons orbit and zoom, **Top view** shows the full grid, and
  **Reset view** restores the default angle. **0° view** places both the camera
  and its target exactly on the zero plane. The elevation slider spans −85° to
  +85°, including zero; dragging can also move below the grid. With the canvas focused, arrow
  keys orbit, +/− zoom, and Home resets. Camera changes never affect amplitudes.
- **Phase colors**, **Value labels**, and the **Columns** selector affect only
  presentation. Labels show the selected amplitude component, or probability
  in probability view. Colors wrap continuously at ±π. A common phase shift of all
  columns is physically irrelevant. Undefined phase at zero is reported as such.
- The red grid outline marks the target; the green outline marks the input,
  matching the other branches.
  Both remain visible if the selections coincide. Hover/click inspects a state.
  Labels that would overlap are omitted; the inspector still reports every state.
- **Start Recording** captures the histogram, its axes and labels as WebM, using
  the existing deterministic frame clock. Files use
  `ordinary-grover-NxN-TIMESTAMP.webm`.

## Rendering and checks

`histogram-renderer.js` renders signed solid cuboids with perspective and WebGL
depth testing. Ray/AABB intersections first pick the nearest solid column, then
fall back to a grid cell. The transparent zero plane does not intercept selection
of a negative column. The visible
canvas composites the WebGL scene and text labels, so recordings include both.
The vertical scale never automatically renormalizes as probabilities change.

From the repository root, run:

```powershell
$taskTests = @(rg --files BohmianGrover2D/tests -g '*.test.mjs')
node --experimental-default-type=module --test @taskTests
node --experimental-default-type=module BohmianGrover2D/tests/static-check.mjs
```

Serve the app and open `tests/histogram-browser-check.html` for the browser
checks. They use the actual production UI and renderer, including all four
grid sizes, gate checkpoints, the oracle's marked-only flip and Sᵢ's initial-only
flip with stationary other amplitudes and invariant
probabilities, arbitrary/coincident initial and marked states, autoplay,
complex-component views, the circuit layout, picking around a full orbit,
drag/pinch, zero-height and below-plane cameras, keyboard/zoom/reset controls,
and the recording clock. The page is left at the 4×4 oracle checkpoint. The
`#histogram-test-report` element contains the result, including a
`data-status="passed"` attribute on success.

`tests/ordinary-core.test.mjs` checks the qubit mixer against an independent dense
Walsh matrix, all intermediate 4×4 signs, the exact diffuser against minus
inversion about the mean, complex reflection identities, and Grover probabilities for
every initial/marked pair on all four grids.

The inherited physics modules and their numerical tests remain available as
reference, but the histogram page does not load their core, renderers, or shaders.
Older wave/flow/geometry browser fixtures belong to the `MultiRegion` UI;
use `histogram-browser-check.html` on this branch.
