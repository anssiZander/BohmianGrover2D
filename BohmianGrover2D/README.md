# Ordinary Grover

The `Ordinary-Grover` branch presents the logical algorithm as a **3D histogram
on a selectable 2×2–5×5 grid**. There are no displayed waves, particles, currents,
or spatial-density calculations. Column height is the computational-basis
probability `|a|²`, with a fixed linear 0–100% scale. Optional column colors show
amplitude phase, so phase-only gates remain visible.

This branch starts from `MultiRegion` and reuses its `multiregion-core.js`
**without modifications**. It preserves the exact operations, continuous gate
interpolations, initial/marked-state choices, and stopping points. The other
branches, including `main`, are independent.

## Run

Serve this directory with a static server, for example:

```powershell
python -m http.server 8835 --bind 127.0.0.1
```

Open `http://127.0.0.1:8835/`. A browser with WebGL is required. There are no
external libraries, CDN requests, package installations, or build steps.
All active page assets and module imports use `?v=20261014-ordinary1`.

## Sequence

1. Begin with one column at 100% in the chosen initial state `|i⟩`.
2. Prepare with `H`: every state has probability `1/N²` on an N×N grid.
3. Apply the oracle `Oω`, flipping only the marked amplitude's phase.
4. Apply `H†`, the inverse preparation.
5. Apply `Sᵢ`, flipping the initial-state amplitude's phase.
6. Apply `H`, completing one amplification round. Repeat steps 3–6.

The diffuser `H Sᵢ H†` differs from the conventional Grover reflection only by
an overall minus sign. It has the same probabilities. Preparation runs once;
the remaining four operations repeat 1, 2, 3, or 3 times for 2×2, 3×3, 4×4,
or 5×5 respectively. For the default 4×4 grid, the marked probability is 6.25%
after preparation and 47.265625%, 90.844727%, and 96.131897% after each round.

On 2×2 and 4×4, `H` is the usual tensor-product qubit Hadamard. The 3×3 and
5×5 options preserve the original Hermitian complex balanced mixer,
`B[(x,y),(u,v)] = exp(2πi(xv−yu)/N)/N`, labelled **B** to distinguish these
non-qubit grids. `B† = B` and `B² = I`. Every basis input prepares equal
probabilities; nonzero initial coordinates can produce different phases.

Labels are binary for 2×2/4×4 and `|x,y⟩` for odd grids. The state index is
`q = N*x + y`, matching the original implementation. The animation between
gate endpoints uses the original smooth unitary evolution, not a linear
interpolation of displayed column heights.

## Controls

- **Apply next operation** animates one gate and stops at its checkpoint.
  **Run full search** starts again from the selected input and runs all gates.
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
  **Reset view** restores the default angle. With the canvas focused, arrow
  keys orbit, +/− zoom, and Home resets. Camera changes never affect amplitudes.
- **Color by amplitude phase** and **Show state probabilities** affect only
  presentation. Colors wrap continuously at ±π. A common phase shift of all
  columns is physically irrelevant. Undefined phase at zero is reported as such.
- The gold grid outline marks the target; the pale cyan outline marks the input.
  Both remain visible if the selections coincide. Hover/click inspects a state.
  Labels that would overlap are omitted; the inspector still reports every state.
- **Start Recording** captures the histogram, its axes and labels as WebM, using
  the existing deterministic frame clock. Files use
  `ordinary-grover-NxN-TIMESTAMP.webm`.

## Rendering and checks

`histogram-renderer.js` renders solid cuboids with perspective and WebGL depth
testing. Ray/AABB intersections pick the nearest column or cell. The visible
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
grid sizes, gate checkpoints, phase-only height invariance, arbitrary/coincident
initial and marked states, autoplay, picking around a full orbit, drag/pinch,
keyboard/zoom/reset controls, and the recording clock. The report appears below
the page, and the histogram is left at the prepared 4×4 checkpoint.

The inherited physics modules and their numerical tests remain available as
reference, but the histogram page does not load their renderers or shaders.
Older wave/flow/geometry browser fixtures belong to the `MultiRegion` UI;
use `histogram-browser-check.html` on this branch.
