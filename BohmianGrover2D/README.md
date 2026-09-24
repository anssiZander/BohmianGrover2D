# Grover Search 2D — MultiRegionFreeMixing

A single continuous 2D wave encodes 16 logical outcomes in a 4×4 arrangement.
This branch uses exact free-box mixers and ideal mode-projector phase gates, with the original
rainbow phase palette, dark blue panels, cyan grid, and crimson target outline.
Conserved-current arrows and guided yellow particles with trails show the
spatial probability transport. The display remains a single search view.

## Run

Serve this folder with VS Code Live Server, or:

```powershell
python -m http.server 8835 --bind 127.0.0.1
```

Open `http://127.0.0.1:8835/`. A desktop browser with WebGL2 and floating-point
render targets is required. No dependencies or build step are needed.

## Controls and readouts

- Choose a goal with the 4×4 selection grid or click a box on the wave. Changing
  the goal resets the search; target selection is locked during a running gate.
- Use individual gate buttons or **Apply next operation** to hold at each
  checkpoint. **Run full search** prepares once and executes three iterations.
- **Pause**, **Reset**, and gate speed control the same gate clock. Space toggles
  pause when a form control is not focused; R resets. Brightness and phase/grid
  toggles affect only the display.
- The circuit highlights the active gate. Its three iteration badges retain the
  marked probabilities at the completed diffuser checkpoints.
- The effective Bloch sphere follows the actual complex amplitudes. Drag it or
  use its arrow keys to orbit; Home or Reset view restores the camera. Its gold
  vector describes the normalized marked/unmarked projection with the prepared
  state's phases. The weight
  bar accounts for probability outside that subspace during individual gates.
- **Start Recording** captures the wave canvas as WebM; panels are excluded.
- **Current arrows**, **Particles**, and **Trails**, beneath the wave, toggle
  independently. Hidden particles continue evolving. The arrows display current
  strength on a compressed scale; particles move at current divided by density.
- **Flow settings** adjusts arrow density/gain, dot size, trail length, and particle count.
  Changing the count resets the search and is locked during a running gate.
- **Trail length** sets the fading half-life (0.1–12 gate-time seconds, default
  1.5). It can change during a gate without resetting the wave, particles, or
  existing history. Faster playback advances trail fading on the same clock.
  Trails use DoubleSlit2.0's soft stamps, additive floating-point accumulation,
  exponential exposure, and screen blending, in the existing golden yellow.
  Stamps sweep between integrated particle positions to keep paths connected.
- **Particles inside goal box** is a finite-sample estimate of the spatial
  probability. Compare it with **Inside goal box**, not the logical percentage.

The labels use `|x₁x₀y₁y₀⟩`. Columns increase left to right and rows bottom to top.
The upper-left box is `|0011⟩`, upper-right `|1111⟩`, lower-left `|0000⟩`, and
lower-right `|1100⟩`. The selection grid has exactly the same spatial ordering.

The percentages on the grid are **logical-mode probabilities**. The diagnostic
**Inside goal box** integrates the continuous spatial density over the selected
quarter-by-quarter region. These differ because orthogonal packets have
overlapping spatial tails. Neither the display grid nor the target tint changes
the Hamiltonian or clips the wave into disconnected boxes.

## Spatial encoding

On the unit interval use normalized sine modes
`u_n(x) = sqrt(2) sin(n pi x)`, `n = 1,2,3,4`.
An orthogonal discrete sine transform constructs four localized packets:

```text
f_j(x) = sum_n T[j,n] u_n(x),                 j = 0,1,2,3
T[j,n] = sqrt(2/4) sin((j+1/2)n pi/4),        n = 1,2,3
T[j,4] = (1/sqrt(4)) sin((j+1/2)pi).
phi_jk(x,y) = f_j(x) f_k(y).
```

The packets are orthonormal, smooth, and zero at the outer walls. Each has its
dominant peak in its labeled region. With two packets the same transform reduces
to the original `(u_1 +/- u_2)/sqrt(2)` construction.

The full wave is `psi(x,y,t) = sum_jk c_jk(t) phi_jk(x,y)`. It always lies in the
specified 16-dimensional subspace. The initial state is `phi_00`, and preparation
gives `|c_jk| = 1/4`, hence logical probability `1/16` in every mode. Equal logical
probabilities do not imply perfectly flat spatial density.

## Exact free-box mixing and forward waiting

During every mixing interval, the Hamiltonian is the ordinary hard-wall box:

```text
H_free = -hbar^2/(2m) (d_x^2 + d_y^2)
E_nm = E_1 (n^2+m^2),    E_1 = pi^2 hbar^2/(2mL^2)
b_nm(t) = b_nm(0) exp[-i E_1 (n^2+m^2)t/hbar].
```

The implementation transforms the logical coefficients to the sine basis,
applies these exact energy phases, and transforms back. Both axes evolve
simultaneously. It includes the common phase as well as relative phases, and
uses the continuum spectrum, not finite-difference eigenvalues or RK4 wave
stepping. No image blending or probability interpolation is used.

Set `T = pi*hbar/(4*E_1)`. The first four one-axis eigenmodes then have phases
`(z,-1,z,1)`, where `z = exp(-i*pi/4)`. In our packet basis:

```text
U_1D(T) = 1/2 [ z  -1   1   z ]
               [ -1  z   z   1 ]
               [  1  z   z  -1 ]
               [  z  1  -1   z ]
A = U_1D(T) tensor U_1D(T).
```

Every entry of A has magnitude 1/4, so preparation gives equal logical
probabilities of 1/16, with definite relative phases. The prepared state is
`s = A|0000>`, not the equal-real-amplitude state used by the Hadamard branch.

The entire box spectrum revives at `T_rev = 2*pi*hbar/E_1 = 8T`. Therefore:

```text
A = U(T)
A^dagger = U(7T), because U(7T) U(T) = U(8T) = I.
```

The inverse animation advances forward through all 7T under the same positive
kinetic Hamiltonian. It is not a negative-time shortcut and is not sped up to
fit one preparation interval. In playback units T = 2.4 seconds, the inverse
lasts 16.8 seconds, and a complete search takes 69.6 seconds at speed 1.
Changing the speed scales the common clock for all gates, particles, and trails.
The 1.6-second oracle/reference pulses keep their existing duration.

Oracle and reference operations remain the exact ideal pulses

```text
U_q(p) = I + (exp(-i*pi*p)-1) |q><q|.
```

Here `q = target` for the oracle and `q = 0` for the reference. The free
Hamiltonian is not added during these ideal pulses. Preparation runs once,
then each iteration is `oracle -> wait 7T -> reference -> wait T`.
`A (I-2|0><0|) A^dagger` reflects about the actual prepared state, up to the
usual global minus sign. Three iterations give these marked-mode probabilities:

| Iterations | Target probability |
| --- | ---: |
| 0 (prepared) | 6.25% |
| 1 | 47.265625% |
| 2 | 90.844727% |
| 3 | 96.131897% |

The effective Bloch sphere uses a phase-aligned marked vector and the
normalized unmarked part of this same s. This keeps preparation and completed
Grover iterations in the correct two-dimensional subspace. Intermediate
individual gates can leave that subspace; the weight bar still shows this.
The seven-times-longer inverse path is sampled more densely for its sphere
trace, while the state arrow always uses the actual instantaneous amplitudes.

## Probability current and particles

During free mixing, including the forward-wait inverse, the arrows show the
ordinary current and particles follow the Bohmian guidance law:

```text
j = (hbar/m) Im(conj(psi) grad psi)
v = j / |psi|^2.
```

With a unit-length box and our clock, `E_1/hbar = pi/(4T)` and
`hbar/m = 1/(2*pi*T)`. The GPU evaluates the exact 16-term sine sum, its spatial
derivatives, and energy phases at every particle integration stage. This is
ordinary free-box current, not an inverse-Laplacian substitute. It has zero
normal wall flux and may have circulation. Wave coefficients evolve exactly;
particle trajectories still have numerical integration error.

The ideal nonlocal oracle and reference pulses retain the previous chosen
curl-free transport:

```text
rho = |psi|^2
laplacian chi = -partial_t rho,  normal derivative of chi = 0 at the walls
j = gradient chi,               v = j/rho.
```

This preserves the phase-pulse density by the continuity equation. The
Neumann solution fixes the current after choosing the curl-free rule; the
nonlocal phase Hamiltonian does not uniquely specify these continuous paths.
For these pulses only, `psi = F + exp(-i*pi*p)G`; their density derivative has
cosine frequencies 0..8 in each axis. The finite Poisson sum is reconstructed
once per pulse in 512x512 float textures. This is the same convention as the
parent branch, based on
[Struyve and Valentini, equations 5–12](https://arxiv.org/pdf/0808.0290), with
reflecting walls.

The same adaptive GPU integrator handles both currents, integrating
`dx/ds = T_gate*j`, `dp/ds = rho`, with cubic dense output to hit the requested
gate progress. It does not cap velocity, attract particles to the goal, or
resample them during gates. Initial particles sample the input packet's Born
density. There is no sign reversal of time or current in the inverse mixer.

Pause and manual checkpoints freeze the wave, instantaneous arrows, positions,
and trail history. This is an inspection hold, not continued physical free
evolution between operations. The recording clock advances all layers together.

## Implementation and verification

- `multiregion-core.js`: pure complex-amplitude dynamics, spatial basis,
  probability integrals, Bloch projection, and checkpointed clock.
- `main.js`: controls, circuit synchronization, WebGL2 resources, and recording.
- `shaders/mode_wave.frag`: reconstructs the complex wave on a 512×512 RGBA32F
  GPU texture from its sine coefficients. Only 16 complex amplitudes evolve on
  the CPU. `shaders/multiregion_render.frag` renders phase and density.
- `grover-geometry.js`: the interactive sphere, driven by those same amplitudes.
- `probability-flow.js`: exact density-source/Poisson coefficients and Born
  sampling. `flow-renderer.js` and the `flow_*` shaders: GPU field reconstruction,
  adaptive particle integration, free/phase currents, and fading trails. The free
  field probe reads back the same analytic GPU current used by the particles.

Legacy wave solvers remain unloaded. The original particle fragment shader and
arrow fragment shader are reused to preserve their color and edge treatment.

```powershell
node tests/static-check.mjs
node --test tests/multiregion.test.mjs
node --test tests/flow.test.mjs
```

For reproducible browser/GPU checks, open `/tests/browser-check.html` on the same
local server. It loads the production page and compares GPU texture readbacks
against an independent dense matrix-exponential reference. See `VERIFICATION.md`
for measured results and visual checks.
`/tests/flow-browser-check.html` additionally checks the GPU current, particle
region counts and 8×8 spatial histograms, every target, pause, visibility, and
the recording clock.
`/tests/trail-browser-check.html` checks GPU trail accumulation/fading, length
changes without disturbing the state, pause/reset, and recording exposure.
