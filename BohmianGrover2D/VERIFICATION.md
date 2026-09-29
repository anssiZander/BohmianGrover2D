# Verification — SPINMultiRegionFree

## Selectable initial state and green start outline — 2026-09-29

The sidebar now selects the initial joint position-spin state, while the
canvas independently selects the goal. Repeated clicks flip the spin of the
selected input or goal, respectively. The start cell has a green outline;
the goal keeps its red outline. Coincident positions show an inner green
outline, an outer red outline, and both spin labels. The shader draws these
outlines even with grid labels hidden, so they also appear in recordings.

Reset and Run full search retain both choices. Resizing clamps both positions
and retains their independent spins. Selection is locked during running or
paused gates. The selected input feeds wave initialization, each axis's Born
sampler, the reference projector and its conserved current, and the prepared
state used by the Bloch projection. Circuit inputs, reference labels and the
reference pulse's illuminated cell update together. Gate durations and
iteration counts are unchanged.

**46/46 numerical tests pass**: the existing 28 checks plus 18 in
`tests/initial-state.test.mjs`. The added tests cover all 3,912 input/goal
pairs over grid sizes 2, 3, 4 and 5, including equal inputs/goals and both
spins. They check every amplification checkpoint and total search duration.
Continuous states from every initial state are compared with independent
matrix propagation; maximum amplitude difference is 1.544e-13. Independent
finite-difference continuity residual is 1.353e-7. Every spatial input has a
reproducible 4,000-particle Born-sampling check, including equal distributions
for opposite input spins. Selection, reset, locking and resize checks pass.

Actual browser checks ran on NVIDIA GeForce RTX 4070 Ti SUPER, ANGLE / D3D11,
with the production 512x512 float spinor texture:

- **Wave/UI: 384/384**, including 184 GPU wave readbacks, displaced input
  packets of both spins, all gate interiors, independent selectors, circuit
  and Bloch references, and pixel readbacks of the green/red outlines.
  Maximum wave component error 4.450e-6; integrated norm error 5.959e-7;
  modal amplitude error 3.743e-13; Bloch/readout error 1.177e-12.
- **Flow: 449/449**, including 4,000 particles at every grid size from
  displaced input packets, every gate's current and density, region counts,
  and 8x8 histograms. A complete 16,000-particle 5x5 run uses the same
  spin-down state for input and goal. Maximum current component error
  5.537e-5; density error 5.335e-5; region sampling difference 2.257 percentage
  points; histogram total variation 5.354%. Failed steps and invalid or
  out-of-box particles: 0. Maximum sampled clock lag: 3.331e-16.
- **Trails: 11/11**. Decay, pause, reset, trajectory independence and recording
  exposure checks retain their previous results.
- All completed fixtures report WebGL error code 0. Static verification
  covers 74 DOM references and 18 shader/include files. JavaScript syntax
  and whitespace checks pass.

The fixture HTML now splits its closing-body tag inside JavaScript strings:
VS Code Live Server otherwise injects its reload script into those strings,
causing a syntax error before testing begins. The corrected fixtures were
run on the existing Live Server at port 5501. Visual review covered both
separate and coincident initial/goal cells with the new green selection.

## Selectable 2x2 through 5x5 grids — 2026-09-26

The grid-size slider selects 2, 3, 4, or 5 columns and rows. The runtime model,
packet basis, spinor shaders, phase-gate current expansion, particle sampling,
both selection grids, circuit, and Bloch projection use the chosen size.
There are 8, 18, 32, or 50 joint position-spin states, respectively. The
physical box revival remains 19.2; preparation takes T=19.2/(2N), and the
positive-time inverse takes (2N-1)T. Full searches use 2, 3, 4, or 5 iterations.

The individual gate buttons and phase-color button are removed. Apply next
operation and Run full search share one row. Changing size resets even an
active or paused search, preserves the goal spin, and clamps its position.
Coordinate labels and two N-level position wires also cover the odd grids.

Commands:

    node --test tests/multiregion.test.mjs tests/flow.test.mjs tests/grid-sizes.test.mjs
    node tests/static-check.mjs

**28/28 numerical tests pass.** The existing 4x4 tests and added 2x2, 3x3, and
5x5 checks cover all 108 joint goals across the four sizes. Comparisons use
independent dense complex-matrix exponentials, finite-difference continuity,
wall flux, spatial quadrature, and initial particle sampling. Additional-grid
maximum amplitude error is 1.459e-13; continuity residual is 1.277e-7.
Resizing during running/paused gates and independent differently sized
simulations also pass. Static checks cover 70 DOM references, unique IDs,
18 shader/include sources, local assets, and the recording bridge.

Actual browser checks ran on NVIDIA GeForce RTX 4070 Ti SUPER, ANGLE / D3D11,
using the production 512x512 RGBA32F wave texture:

- **Wave/UI: 355/355**, with 184 GPU spinor readbacks across all four sizes.
  Maximum wave component error 4.560e-6; integrated norm error 5.511e-7;
  modal amplitude error 3.652e-13; Bloch/readout error 6.906e-13.
  Every gate interior and both goal spins are covered, along with slider
  changes, repeated-click spin flipping, circuit labels, and shared clocks.
- **Flow: 449/449**, including 4,000-particle searches at every size, GPU
  total/spin-current readbacks, 8x8 histograms, and a complete 16,000-particle
  5x5 search. Maximum current component error 5.178e-5; sampled density error
  4.526e-5; region sampling difference 1.708 percentage points; histogram
  total variation 5.456%. Failed steps and invalid/out-of-box particles: 0.
  Maximum sampled particle-clock lag: 3.331e-16.
- The wider grid sweep exposed rare node passages that exhausted the former
  384-substep per-particle budget. Raising its maximum to 2,048 removes the
  observed lag without changing the adaptive tolerances or guidance law.
  Ordinary particles still exit as soon as they reach the requested time.
- **Trails: 11/11**. Length and visibility preserve wave/particle evolution;
  pause/reset, tiny-step decay, GPU rebaking, and recording exposure pass.
  Decay ratios 0.933033 and 0.466516; recording/live exposure ratio 0.984916.
- All three fixtures finish with WebGL error code 0 and no browser warnings
  or errors. The 5x5 control and wave layout was also visually inspected.

These retain the finite-precision, finite-ensemble, and nonlocal phase-gate
guidance qualifications described below and in README.md.

## Historical fixed-4x4 spin extension

The next section records the original spin implementation before selectable
grid sizes. Its 32-state counts and fixed timing describe the 4x4 setting.

## Spin extension — 2026-09-26

Created from MultiRegionFreeMixing at 669590b1ba7b6c1d5b57b2043bb7d43196a1f7a8.

The state has 32 complex amplitudes: 16 spatial packets in each spin channel.
Mixing combines exact free evolution with Ry(pi/2); the inverse combines the
positive 7T spatial wait with Ry(-pi/2). Oracle/reference pulses select one
joint coefficient. Four iterations end at 99.91823155% for every joint target.

Free intervals use the full reduced planar Pauli current. During ideal
nonlocal phase gates, a Neumann gradient correction supplies the missing
divergence while preserving the Pauli circulation. This is the explicitly
chosen generalized guidance law documented in README.md. It is not a local
Pauli realization of the mode-selective phase Hamiltonian.

### Numerical and static checks

Commands:

    node --test tests/multiregion.test.mjs tests/flow.test.mjs
    node tests/static-check.mjs

**17/17 numerical tests pass.** The independent reference builds a dense
complex 32x32 Hamiltonian and exponentiates it without production basis data
or propagators. All 32 goals and all 17 gates are checked at nine progress
values (4,896 continuous states).

- Maximum matrix-exponential amplitude difference: 1.577e-13.
- Maximum normalization error: 4.885e-15.
- Independent density time-derivative difference: 2.710e-8.
- Finite-difference continuity residual: 2.702e-8.
- Box-boundary current versus probability-gain difference: 1.411e-9.
- Spin-density curl equals the sum of density-gradient and nonuniform-spin
  terms. The test uses a nonzero spin texture; reversing a uniform spin
  reverses its magnetization current.
- Positive-time inverse, hard walls, partial spin probabilities, entanglement,
  Bloch projection, checkpoints, target locking, and pause/reset all pass.
- Static checks cover 66 DOM references, unique IDs, 18 runtime shader/include
  sources, local assets, and the recording bridge.

### Actual browser and GPU checks

Run in the app browser on NVIDIA GeForce RTX 4070 Ti SUPER, ANGLE / D3D11,
using the production 512x512 RGBA32F spinor field.

**tests/browser-check.html: 157/157.**

- 89 spinor readbacks, including every gate's interior and complete searches
  for joint targets 0, 7, 24, and 31.
- Maximum GPU spinor component error: 3.665e-6; integrated norm error: 5.221e-7.
- Maximum modal amplitude error: 4.111e-13; Bloch/readout error: 4.568e-13.
- Four amplification checkpoints and final probability match the independent
  reference. Grid spin flipping, target locking, and clocks pass.
- WebGL error code 0.

**tests/flow-browser-check.html: 244/244.**

- GPU total current, spin current, and density checked at four progress values
  in all 17 gates for joint target 13.
- Full 4,000-particle spatial counts and 8x8 histograms across that run.
- Additional complete 4,000-particle searches for joint targets 0, 12, 30, 31,
  and a complete 16,000-particle search for target 31.
- Maximum sampled GPU current component difference: 2.452e-5.
- Maximum sampled GPU density difference: 9.350e-5.
- Largest region sampling difference: 2.430 percentage points.
- Largest 8x8 histogram total variation: 5.498%.
- Failed integration steps: 0; invalid/out-of-box particles: 0.
- Maximum particle clock lag: 5.552e-16; WebGL error code: 0.
- Layer visibility and spin-only arrow selection leave total guidance unchanged.
- The GPU probe uses separate attachments and explicitly binds its sampler
  inputs. This prevents the first readback from sampling its own output.

**tests/trail-browser-check.html: 11/11.**

- Length affects history without changing wave or particle buffers.
- Pause/reset and tiny-step fading pass.
- Retained intensity after 1.2 seconds with 12-second half-life: 0.933033;
  after another 12 seconds and GPU rebaking: 0.466516.
- Recording/live exposure ratio: 0.984916.
- WebGL error code 0.

Visual review covered a paused second-round inverse with position-spin
entanglement, total spin colors, the down-component phase view, and isolated
spin-current arrows. The brighter, denser spin circulation made the inherited
trail exposure obscure the density, so display exposure is reduced to 0.18
while retaining the same accumulated paths and decay law.

These are finite-precision and finite-sample checks on this GPU, not a claim
that the modal gates are a unique local physical implementation.

## Historical results from the parent branches

The remaining sections are retained as history. Their 16-state counts, scalar
currents, and three-iteration timing do not describe this spin branch.

## Free-box mixers and forward-wait inverse — 2026-09-24

Branch `MultiRegionFreeMixing` starts at `MultiRegion` commit `931c840`.
Preparation and forward mixing apply the exact continuum kinetic phases for
T = 2.4 gate-time seconds. The inverse applies the same positive Hamiltonian
for 7T = 16.8 seconds. Since U(8T) = I, that endpoint is exactly A-dagger.
The inverse path is checked at interior times as well; it is not negative-time
evolution. Both axes evolve simultaneously throughout each mixing interval.

The phase-aligned Bloch projection uses s = A|0000> including its complex
phases. The state lies in the correct Grover plane at preparation and each
completed iteration. Mixers use the ordinary free-box Bohmian current;
oracle/reference pulses retain the parent's conserved curl-free transport.
Colors, particle rendering, trail rendering/length control, and layout remain.

`node --test tests/multiregion.test.mjs tests/flow.test.mjs` passes **15/15**.
This includes all 16 targets, continuum energy-population conservation, the
8T revival, A followed by the forward 7T inverse, positive-time interior paths,
the Schrodinger equation, wall flux, and independently differentiated current.

- 1,872 gate states versus an independent dense kinetic matrix exponential:
  maximum amplitude error `1.115e-13`, norm error `4.441e-15`.
- Density-source derivative error `2.710e-8`.
- Continuity residual from finite-difference divergence `2.665e-8`.
- Region-boundary flux versus probability derivative error `1.119e-9`.

`tests/browser-check.html` passes **157/157** checks on the NVIDIA GeForce
RTX 4070 Ti SUPER (ANGLE / D3D11), including 81 actual GPU wave readbacks,
all 16 complete searches, all gate interiors, pause, circuit and sphere state:

- Maximum GPU wave component error `3.045e-6`, norm error `5.150e-7`.
- Maximum logical amplitude error `4.548e-13`.
- Maximum Bloch/readout error `4.802e-13`.
- Exactly three amplification checkpoints, ending at 96.13189697% for every goal.

`tests/flow-browser-check.html` passes **224/224**, using 4,000 particles at
interior/end samples of all 13 gates, complete searches for all 16 targets,
and a complete 16,000-particle search. The free-current probe executes the same
analytic GPU sine/gradient routine as the particle integrator and arrows.

- Maximum GPU current component error `1.977e-5`.
- Maximum sampled GPU flow density error `8.911e-5`.
- Maximum particle-region sampling difference **2.454 percentage points**.
- Maximum 8x8 histogram total-variation difference **6.041%**.
- Failed integration steps **0**; invalid/out-of-box particles **0**.
- Maximum particle clock lag `5.552e-16`; WebGL error code `0`.
- No warnings or errors on the fresh flow test page.

`tests/trail-browser-check.html` passes **11/11** with the new trajectories.
Changing trail length leaves particle/wave buffers identical; pause/reset,
tiny-step fading, GPU decay rebaking, and recording exposure checks pass.
Fresh wave and trail test pages report no browser warnings/errors or WebGL errors.

Static verification passes for 58 DOM references and 16 runtime shader/include
sources. Visual inspection covered phase transport and a paused second-round
forward-wait inverse, with the matching Bohmian-current readout, colored arrows,
golden trails, circuit highlight, and curved Bloch trajectory.

## Historical results from the parent MultiRegion branch

The sections below describe the previous Hadamard-mixer implementation at
`931c840`; their physics and timing are not the free-mixing branch's results.

## DoubleSlit-style trails and length control — 2026-09-24

Replaced alpha-painted RGBA8 trails with soft swept stamps accumulated in
RGBA16F, exponential exposure, and screen blending, following DoubleSlit2.0.
The yellow palette and particle/current equations are unchanged. The new
**Trail length** slider controls a 0.1–12-second half-life on the gate clock.
Fading uses a full-precision scale, periodically baked into the GPU texture,
so tiny time steps cannot round the half-float fade factor to one.

`tests/trail-browser-check.html` passed **11/11 checks** on the NVIDIA GeForce
RTX 4070 Ti SUPER (ANGLE / D3D11), including actual GPU density readbacks:

- Identical wave and particle buffers at the same time with shortest and
  longest trails; longer trails retain more history.
- Length changes preserve paused history; reset clears it.
- After 1,200 steps of 0.001 seconds with a 12-second half-life and no new
  stamps, the retained intensity is `0.933033`, as expected.
- After another 12 seconds and a GPU rebake, it is `0.466516`, as expected.
- Live versus recording exposure differs by less than 1% at the checked time.
- No WebGL errors. Browser console has no warnings or errors.

Visual inspection confirmed connected, softly glowing golden paths and the
working slider. The existing **15/15** numerical tests and static checks
(58 DOM references, 15 shader/include sources) also pass. The earlier full
wave/ensemble GPU results below were not rerun for this rendering-only change.

## Conserved current, particles, and trails — 2026-09-24

Added the curl-free Neumann current `j = grad chi`, `laplacian chi = -d rho/dt`
without changing the wave's 16-mode Hamiltonian or amplitudes. The source and
potential use the exact finite cosine expansion of products of the sine modes.
Arrows display current; the yellow particles follow `v = j/rho`. Their initial
positions sample the actual spatial input density. There are no respawns,
velocity caps, target attraction, or repeated Born resampling.

`node --test tests/multiregion.test.mjs tests/flow.test.mjs` passes **15/15 tests**.
The six new flow tests cover every gate and target, genuinely complex inputs,
inverse sign, curl, wall flux, current through region boundaries, and initial
particle sampling. Measured comparisons with independent wave evolution:

- Density-source derivative error: `2.370e-9`.
- Continuity residual using an independent finite-difference divergence:
  `4.597e-8`.
- Net current into a region versus its probability derivative: `8.679e-11`.

The reproducible `tests/flow-browser-check.html` fixture passed **224/224
browser/GPU checks** on the NVIDIA GeForce RTX 4070 Ti SUPER (ANGLE / D3D11).
It checks actual float-texture readbacks at four interior/end times of all 13
gates for target 6, 4,000-particle region counts and 8×8 spatial histograms,
pause during every gate, all 16 complete target searches, and a complete search
with the maximum 16,000 particles. It also checks hidden-particle evolution and
the recording clock.

- Maximum GPU current component error: `3.853e-7`.
- Maximum GPU flow-basis density error: `1.363e-5`.
- Maximum 4×4 region sampling difference: **1.496 percentage points**.
- Maximum 8×8 histogram total-variation difference: **5.422%** (finite ensemble).
- Failed integration steps: **0**; invalid/out-of-box particles: **0**.
- Maximum particle clock lag at checkpoints: `5.552e-16`.
- WebGL error code: `0`; no browser warnings or errors.

The initial direct `j/rho` integrator had difficulty near nodes. The final GPU
integrator instead uses `dx/ds = T*j`, `dp/ds = rho`, with adaptive embedded
Runge–Kutta and cubic dense output to hit the requested gate time. Its auxiliary
time step is limited by actual spatial motion, temporal accuracy, and local
error, not an arbitrary cap on the auxiliary parameter. This preserves the
same trajectories while avoiding division by small density.

The inherited `tests/browser-check.html` fixture also passed **157/157 checks**
after adding the overlays (81 GPU wave readbacks), with exactly the same maximum
wave and norm errors recorded below. Static checks cover 56 DOM references and
14 runtime shader/include sources. The existing particle and arrow fragment
shaders are reused for their visual styling. Visual inspection covered live
preparation and a paused reference gate with synchronized current, dots, and
trails; the particle-box readout tracked the spatial probability.

## Exact continuous wave — 2026-09-24

The `MultiRegion` branch starts from `Inverse-Mixing` at `1571b5b` and replaces
the four-state solver with 16 orthonormal spatial packets. Preparation and mixing
use the explicitly specified ideal mode Hamiltonian
`H_A = pi*hbar*(I-A)/(2T)`, where `A = H_Had^(tensor 4)`. The inverse reverses its
sign. Oracle and reference pulses use mode-projector exponentials. The full
complex amplitudes are evaluated at the current gate time; no endpoint images
or probabilities are interpolated. See `README.md` for the model and its physical
limitations.

`node --test tests/multiregion.test.mjs` passes **9/9 tests**. They cover packet
orthogonality, spatial localization and hard walls, preparation and inverse,
all continuous gates, the Schrodinger derivative including its sign, phase-pulse
probability conservation, analytic spatial integrals, the checkpoint clock,
target locking, pause/reset, and Bloch projection. **1,872 intermediate states**
across all 16 targets agree with an independent dense matrix exponential:

- Maximum complex-amplitude component error: `2.776e-15`.
- Maximum logical norm error: `1.332e-15`.
- Marked probabilities after three iterations: `47.265625%`, `90.8447265625%`,
  and `96.13189697265625%`, for every target.

`node tests/static-check.mjs` passes, covering 43 DOM references, the sphere's
required nodes, unique HTML IDs, three runtime shader files, local assets, and
the existing recording bridge.

## Actual browser and GPU

The reproducible fixture at `tests/browser-check.html` passes **157/157 checks**
in Chromium with WebGL2 on an NVIDIA GeForce RTX 4070 Ti SUPER (ANGLE / D3D11).
It loads the production app and performs **81 GPU wave readbacks** from the
512×512 RGBA32F texture. Every gate is checked at 0%, 25%, 50%, 75%, and 100% for
an interior target; all 16 targets also run through the complete queued search.
Each readback compares sampled real and imaginary field values to an independent
spatial reconstruction and integrates the entire GPU wave's norm.

- Maximum GPU complex-field component error: `3.33423e-6`.
- Maximum integrated GPU norm error: `4.69074e-7`.
- Maximum logical-amplitude error: `2.221e-15`.
- Maximum displayed Bloch-coordinate/subspace-weight error: `4.885e-15`.
- WebGL error code: `0`; no browser warnings or errors in the completed fixture.

The fixture also checks single-view mode, spatial ordering of the target grid,
the circuit's active gate, target locks, every manual checkpoint, pause during
every gate, the recording clock, reset, and the three iteration probabilities.

Visual inspection of the normal page confirmed the phase palette, cyan 4×4
grid, crimson goal outline, complex intermediate preparation state, and the
synchronized circuit and sphere. Pause and Reset remain accessible below the
scrolling controls. Keyboard orbit changed only the sphere camera; the paused
state vector stayed identical. Phase/grid toggles and target selection work.
The normal animation completed all three iterations with badges at 47.3%,
90.8%, and 96.1%, the sphere in the Grover subspace, and total probability
`1.000000`. The normal page also had no console warnings or errors. Both panel
collapse controls worked, and the full target grid and wave remained readable
at the default 1280×720 viewport.

---

# Historical verification — four-state inverse-mixing branch

The records below describe the earlier four-state implementation, not the
16-state model above.

## Effective Bloch sphere — 2026-09-24

Replaced the real/imaginary projected arrows with a rotatable effective Bloch
sphere in single-grid view. The vector represents the normalized marked/equal-
unmarked projection; a separate bar reports its probability weight. Actual and
conditional marked probabilities are shown separately. The sphere follows the
existing gate clock; the wave/particle shaders and numerical evolution did not
change.

`node tests/geometry-check.mjs` still passes all **660 intermediate states**
against an independent box-spectrum calculation (maximum amplitude difference
`7.268e-16`). Added checks cover all six Pauli-axis states, global-phase
invariance, partial and zero-weight projections, subspace probability accounting,
the oracle's complex midpoint, and all four marked north-pole endpoints.
Maximum unit-vector norm error was `3.331e-16`.

An external fixture passed **144/144 browser/GPU checks** on the NVIDIA GeForce
RTX 4070 Ti SUPER (ANGLE / D3D11). It compared the displayed vector, subspace
weight, conditional probability, actual marked probability, and outside weight
with the production GPU wave for every target at the start, approximately 25%,
50%, 75%, and end of every gate. Maximum Bloch-coordinate error was `7.674e-7`;
maximum weight/probability error was `3.662e-7`. All checkpoints held, pause froze
every gate exactly, target/reset and view changes stayed synchronized, and queued
playback visited all five gates and reached the marked north pole. The fixture
used 1,000 particles, the production 128² wave grid, and `dt = 0.00003`. WebGL
reported error code `0`, and the fixture had no browser warnings or errors.

On the normal page with 12,000 particles, pointer dragging and arrow keys rotated
the view without changing the represented state. Home and Reset view restored
the camera. Visual inspection covered preparation and a paused oracle at 70%:
the tip and its trace lie on the sphere, the circuit and sphere show the same
gate/progress, and marked probability remains 25% with 100% subspace weight.
A complete default-particle run finished with the numerical marked probability
at 100.0%, the vector at the north pole, and subspace weight 100.0%. The normal
page also reported WebGL error code `0` with no browser warnings or errors.
JavaScript syntax, the inherited static checks, and `git diff --check` passed.

## Diagram limited to single-grid view — 2026-09-24

The projected-arrow diagram now starts hidden and is shown only in single-grid
view. Parallel mode skips its SVG updates. The caption explicitly states that
the full state has unit length and that the two squared arrow lengths plus the
outside probability sum to one.

Browser checks confirmed hidden/display-none in the default parallel view,
visibility after switching to single view, the correct target label after
selection, and correct visibility after switching back and forth. The inherited
static checks, JavaScript syntax check, and whitespace checks passed. The
geometry calculations and physical evolution were not modified.

## Live gate-arrow geometry — 2026-09-24

Replaced the static picture with live SVG arrows derived from the four-mode
unitary evolution at the active gate's actual progress. The spatial solvers,
gate durations, and rendered wave/particle/trail styling are unchanged.

`node tests/geometry-check.mjs` checked **660 intermediate states** across all
four targets and all five gates against an independent discrete-sine-spectrum
propagator. Maximum complex-amplitude difference was `7.268e-16`. Additional
checks covered continuous gate boundaries, the exact 30-degree prepared state,
the oracle's complex midpoint at constant 25% marked probability, probability
outside the plane, and a vertical unit arrow at every marked endpoint.

An external fixture ran **115/115 browser/GPU checks** using the production
WebGL2 shaders on the NVIDIA GeForce RTX 4070 Ti SUPER (ANGLE / D3D11). It
compared the displayed real/imaginary projections, marked probability, and
outside probability with the actual numerical wave at the start, approximately
25%, 50%, 75%, and end of each gate, for all four targets. Maximum discrepancy
was `3.837e-7`. Pause held the arrows and progress exactly during every gate;
checkpoints, reset, single-view target changes, and queued five-gate playback
also passed. The numerical tests used 1,000 particles per grid and the usual
128² wave grid with `dt = 0.00003`.

The normal 12,000-particle-per-grid page was inspected during the oracle pulse:
the real arrow, imaginary arrow, gate-input reference, traces, and fixed 25%
marked probability were visible together. The diagram and circuit showed the
same paused gate and percentage. A subsequent full run with the default 48,000
total particles finished with all four target headers at `100.0%`, the live arrow
at `(0, 1)`, and `0.0%` outside the plane. WebGL error code remained `0`, and both
the normal page and test fixture had no console warnings or errors.

## Main-branch integration — 2026-09-24

Merged `main` at `41a5fc0` into `Inverse-Mixing`, preserving its four independent
simulation contexts, single-grid view, crimson target headers, circuit panel,
12,000 particles per grid, and ten RK4 steps per displayed frame. The inverse
segment still uses `-H_box` for `MIX_TIME` in both individual and queued runs.

An external test fixture ran the production WebGL2 shaders in Chromium on the
NVIDIA GeForce RTX 4070 Ti SUPER (ANGLE / D3D11). All **80/80 checks passed**:

- The full complex spatial wave matched an independent finite-difference sine
  spectrum at every gate checkpoint, for every target in both single and
  parallel views.
- The inverse lasted `0.1061303526` simulation units, with reversed particle
  integration and guidance arrows, positive elapsed time, and decaying trails.
- Individual gates and queued full searches retained the shorter inverse in
  both views. Total free-evolution time was `0.3183910579` (three intervals).
- Each parallel operation highlighted the matching circuit gate and locked
  view/target changes; each checkpoint retained the correct completed gates.
- All four parallel headers reported `100.0%`, and the circuit answer lit up.
- A forward/backward wave round trip returned to the initial state.
- The WebGL error code remained `0`, including the per-frame error tracker.

Maximum complex modal-amplitude error: `2.644e-7`; maximum spatial component
error: `4.689e-6`; maximum norm error: `2.146e-7`. Minimum final logical target
probability: `0.9999999401`. The repeated numerical tests used 1,000 particles
per grid, the production wave resolution of 128², and `dt = 0.00003`.

The normal browser page was visually inspected with the default 12,000 particles
per grid. A complete queued run with all 48,000 particles finished with four
`100.0%` logical target headers, five completed circuit gates, and elapsed time
`0.3184`. Both the normal page and test fixture had no console errors or warnings.
The four-grid/single-grid switch, single-view target selection, circuit
minimize/restore, and geometry expand/collapse controls were exercised. The
supplied illustration rendered from the local asset with its diagram framed
inside the diagnostics panel; the original PNG is preserved byte for byte.
JavaScript syntax checks, the inherited static check, and `git diff --check`
passed.

## Initial single-view sign reversal — 2026-09-24

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

## Earlier main-branch verification (forward-wait inverse)

Parallel search verified on 2026-08-26; the synchronized quantum-circuit panel was verified on 2026-08-27 from `http://127.0.0.1:5501/index.html` in the Codex in-app Chromium browser at 1280×720.

## Parallel numerical result

One click on **Run full Grover search** advanced four independent numerical waves and 12,000-member Bohmian ensembles through the same checkpoint sequence. The endpoint simulation time was `0.5307`; every numerical wave retained norm `1` and 100.0% logical-subspace weight.

| Marked state | Final logical target fidelity | Corpuscles in geometrical target quadrant |
| --- | ---: | ---: |
| `|00⟩` | 100.0% | 85.8% |
| `|01⟩` | 100.0% | 84.2% |
| `|10⟩` | 100.0% | 84.5% |
| `|11⟩` | 100.0% | 85.1% |

The corpuscle percentages are one stochastic sample. They are not expected to equal the logical fidelity: each logical basis packet is made from smooth sine modes and has tails outside its named geometrical quadrant. The final Born ensemble follows that same rendered wave.

## Browser and WebGL2 checks

- The default view was the spatially ordered 2×2 array of four mini-grids.
- Each mini-grid showed its own red `MARKED |q⟩` header, progress, and final `✓ 100.0%` result.
- Clicking each mini-grid header changed only the detailed diagnostics target.
- `4 × 128² independent RK4 GPU waves` and 48,000 total corpuscles were reported.
- The stronger marked-state treatment remained clearly visible over dim and bright phase regions: crimson wash, broad glow, and bright red edge.
- WebGL2 initialized, all runtime shaders compiled and linked, and the final WebGL error code remained `0`.
- The browser log contained no JavaScript errors, shader errors, warnings, missing files, or 404s.
- WebM recording initialized and remained connected to the Grover-specific recording driver.
- The right-side circuit displayed the five numerical operations `A`, `O_w`, `A†`, `S₀₀`, and `A`, with the final three grouped as the diffuser.
- During preparation, only gate 1 carried the active class and the status reported its live percentage. Pause retained that active gate, changed the status to `Paused`, and froze its pulse.
- At the preparation checkpoint, gate 1 remained completed with a checkmark and the oracle button became available.
- During a complete queued run, the inverse mixer correctly appeared as active gate 3 while gates 1 and 2 remained completed.
- At completion all five gates were marked complete, the answer readout illuminated, and all four target headers still reported `✓ 100.0%`.
- The circuit minimized to a compact 278-pixel header, moved diagnostics from `top: 224px` to `top: 60px`, and expanded back to its original 430-pixel panel.
- Circuit testing completed with WebGL error code `0` and no browser console errors or warnings.

## Interaction checks

- The view button switched between the default four-grid view and the original single-grid view and reset all contexts.
- Single view displayed all four target controls along the simulation's upper edge.
- Selecting `MARK |00⟩` in single view updated the target, reset the wave and ensemble, and moved the red highlight to the lower-left.
- The view button and target buttons were disabled during an active operation.
- Pause changed to **Resume** and held identical stage/progress text over a wait interval.
- Reset restored `|00⟩`, zero simulation time, fresh Born samples, and the checkpointed state.
- Shared **Apply next operation** and individual Grover operation buttons retained their stage gating.
- Switching to single-grid mode changed the circuit target from “all four targets” to `w = |11⟩`; selecting `MARK |01⟩` immediately updated it to `w = |01⟩` and restored the ready-state circuit.

## Static checks

`node tests\static-check.mjs` verifies:

- all JavaScript DOM references exist;
- every referenced shader exists, declares GLSL ES 3.00, and has balanced braces;
- the default mode is `multi` with four distinct target mini-grids;
- each simulation context owns separate wave, particle, trail, and diagnostic state;
- the oracle resolves its marked quadrant from each simulation's target;
- target controls live above the simulations rather than in the left panel;
- the new crimson target glow is present;
- particle and arrow shaders retain matching phase-gradient numerators;
- recording remains connected to `window.BohmianGrover2D` with a Grover-specific filename.
- the minimizable circuit contains five distinct gates and every operation segment carries its matching circuit-stage identifier.
