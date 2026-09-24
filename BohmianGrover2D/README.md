# Grover Search 2D — MultiRegion

A single continuous 2D wave encodes 16 logical outcomes in a 4×4 arrangement.
This branch uses exact continuous unitary mode gates, displayed with the original
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
  vector describes the normalized marked/equal-unmarked projection. The weight
  bar accounts for probability outside that subspace during individual gates.
- **Start Recording** captures the wave canvas as WebM; panels are excluded.
- **Current arrows**, **Particles**, and **Trails**, beneath the wave, toggle
  independently. Hidden particles continue evolving. The arrows display current
  strength on a compressed scale; particles move at current divided by density.
- **Flow settings** adjusts arrow density/gain, dot size, and particle count.
  Changing the count resets the search and is locked during a running gate.
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
gives `c_jk = 1/4`, hence logical probability `1/16` in every mode. Equal logical
probabilities do not imply perfectly flat spatial density.

## Exact gate dynamics

Let `A = H_Had^(tensor 4)` in the logical packet basis. This is Hermitian and
unitary: `A^dagger = A` and `A^2 = I`. Preparation and forward mixing use

```text
H_A = pi hbar (I - A) / (2T)
U(p) = exp(-i H_A pT / hbar)
     = (I+A)/2 + exp(-i pi p) (I-A)/2.
```

Here `p` is elapsed gate time divided by its duration. The two terms are the
orthogonal positive/negative eigenspace projections of `A`. The implementation
evaluates this exact exponential from the gate's initial complex amplitudes on
every frame. It does not blend endpoint images, interpolate probabilities, or
renormalize an interpolated vector. Inverse mixing uses `U(-p)`: the same endpoint
operator, but the opposite continuous Hamiltonian evolution.

Oracle and reference pulses are also exact at every intermediate time:

```text
U_q(p) = I + (exp(-i pi p) - 1) |q><q|.
```

The oracle uses `q = target`; the reference uses `q = 0`. Preparation runs once,
then each iteration runs `oracle -> A^dagger -> reference -> A`. The implemented
diffuser `A (I-2|0><0|) A^dagger` differs from the conventional `2|s><s|-I` only
by a global minus sign. The full spatial phase is displayed, including this sign.

For one marked state among 16, the logical target probability after `k` iterations
is `sin^2((2k+1) asin(1/4))`:

| Iterations | Target probability |
| --- | ---: |
| 0 (prepared) | 6.25% |
| 1 | 47.265625% |
| 2 | 90.844727% |
| 3 | 96.131897% |

The automatic run stops after three iterations. Standard pi-phase gates do not
give exactly 100% for this state count.

This is an **ideal mode-coupling Hamiltonian**, not the free-box Hamiltonian from
the four-state branch. The sine functions supply a spatial encoding; their
kinetic-energy phases are not added during these gates. Gate durations (2.4 for
mixers, 1.6 for phase pulses at speed 1) set the pedagogical playback time and
corresponding effective coupling strength. No ordinary phase-gradient particle
guidance is claimed for these spatially nonlocal operations.

## Conserved probability flow

The added flow leaves all gate amplitudes and the wave evolution unchanged.
We explicitly choose the curl-free current

```text
rho = |psi|^2
laplacian chi = -partial_t rho,   normal derivative of chi = 0 at the walls
j = gradient chi,                v = j/rho.
```

Thus `partial_t rho + divergence j = 0`, with zero flux through the outer
walls. In this simply connected box, the Neumann problem fixes the current
uniquely once the curl-free rule has been selected. It is also the current
minimizing the integral of `|j|^2` among currents with the same divergence and
normal boundary flux. Other choices can add divergence-free circulation.
These are generalized probability-transport trajectories, not a claim that the
nonlocal Hamiltonian singles out ordinary phase-gradient Bohmian paths.

For each gate, write `psi(p) = F + exp(-i*theta) G`, with orthogonal projector
components `F,G`, `theta = direction*pi*p`, and `p = t/T`. Then

```text
rho = |F|^2 + |G|^2 + Dc*cos(theta) + Ds*sin(theta)
Dc = 2 Re(conj(F)*G), Ds = 2 Im(conj(F)*G)
partial_t rho = (direction*pi/T) [-Dc*sin(theta) + Ds*cos(theta)].
```

Products of sine modes 1..4 contain only cosine frequencies 0..8 on each axis.
The Poisson problem therefore has a finite analytic spectral solution: divide
each nonconstant cosine coefficient of `partial_t rho` by
`pi^2*(n^2+m^2)` to get the corresponding coefficient of `chi`. The constant
source coefficient is zero by unitarity. We differentiate this sum analytically
to obtain `j`; there is no screen-image differencing or iterative Poisson solve.
This construction follows the inverse-Laplacian current described by
[Struyve and Valentini, equations 5–12](https://arxiv.org/pdf/0808.0290), adapted
to the reflecting boundary of our square.

The two current fields and complex `F,G` fields are reconstructed in 512×512
float textures once per gate. Both arrows and particles sample these fields.
Particles use adaptive embedded Runge–Kutta integration on the GPU. To avoid
division by tiny density near nodes, we integrate the equivalent equations
`dx/ds = T*j`, `dp/ds = rho`, and intersect the resulting path with the requested
gate time using cubic dense output. No velocity cap, attraction toward the
goal, particle respawning, or resampling during gates is used. Initial positions
sample the actual input packet's density through its inverse CDF.

Particle trajectories, GPU texture interpolation, and their finite ensemble
have numerical/sampling error; they are tested against the continuous wave.
Pause freezes the instantaneous arrows, positions, and trail history. Manual
gate checkpoints hold everything still. The existing recording clock advances
the wave and particles together, with all visible overlays in the capture.

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
  adaptive particle integration, current arrows, and fading trails.

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
