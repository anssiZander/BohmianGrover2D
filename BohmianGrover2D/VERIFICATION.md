# Verification — parallel Bohmian Grover search

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
