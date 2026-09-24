# Verification — parallel inverse mixing

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
