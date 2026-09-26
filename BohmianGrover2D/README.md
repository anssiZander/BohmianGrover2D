# Grover with spin — SPINMultiRegionFree

A position-spin search with a selectable 2x2, 3x3, 4x4, or 5x5 grid, based on
MultiRegionFreeMixing. Each overlapping spatial packet has spin up and spin
down, giving 8, 18, 32, or 50 joint states. Exact free-box evolution and
a uniform spin rotation perform mixing. Golden particles follow the full
position current, including the nonuniform-spin contribution.

## Run and explore

Serve this folder with VS Code Live Server, or run:

    python -m http.server 8835 --bind 127.0.0.1

Open http://127.0.0.1:8835/ in a desktop WebGL2 browser. No dependencies or build.

- **Grid size** selects the number of columns and rows, from 2 through 5.
  Changing it resets the wave, particles, trails, and search checkpoints,
  including during playback. It keeps the goal spin and clamps the goal
  position into the new grid. The default remains 4x4.
- Click a cell in either grid to select its position. **Click the selected cell
  again to flip its goal spin.** Moving to another cell keeps the chosen spin.
  Selection resets the search and is locked during a running or paused gate.
- **Apply next operation** prepares the state and then steps through the gates.
  **Run full search**, beside it, runs the complete size-dependent search.
  Manual checkpoints and Pause freeze the simulation clock and trail history.
- **Total · spin colors** shows total density, with cyan for positive z spin,
  magenta for negative z spin, and violet for balanced z populations. Individual
  up/down views use the original phase palette. A spinor has no single scalar
  phase; the total view therefore does not assign one.
- **Spin directions** draws local polarization: an oriented line for its
  in-plane projection, circles for spin pointing out of the screen and crosses
  for spin pointing into it.
- **Arrows** selects total current, transport current (convective plus any
  phase-gate correction), or spin current. This only changes the arrows.
  The particles always follow total current divided by total density, including
  while their display is hidden. They have no permanent binary spin label.
- Gold trails retain the parent's adjustable half-life, with lower display
  exposure to keep the spin density visible beneath the added circulation.
  Speed, Pause, recording, particle motion, and trail fading share one clock.
- The two percentages per cell and marked probability refer to joint logical modes.
  **Inside goal box** includes both spins and overlapping packet tails.
  Compare the particle fraction against this spatial probability.
- Spin purity is the reduced spin density matrix's Tr(rho_spin^2). Values below
  one indicate spin-position entanglement for this pure total state. The
  existing effective Grover Bloch sphere describes the marked/unmarked search
  subspace; it is not the local spin Bloch sphere.

Labels are |x,y,spin>, using zero-based coordinates. Columns increase left to
right and rows bottom to top. The lower-left cell is |0,0>. The circuit shows
two N-level position registers and the two-level spin register.

## State and gates

For an N-by-N grid, retain the first N sine modes on each axis:

    u_n(x) = sqrt(2) sin(n pi x), n = 1,...,N
    f_j(x) = sum_n T[j,n] u_n(x), j = 0,...,N-1
    T[j,n] = sqrt(2/N) sin((j+1/2)n pi/N), n < N
    T[j,N] = (1/sqrt(N)) sin((j+1/2)pi)
    phi_jk(x,y) = f_j(x) f_k(y)

The two-component wave is a sum of these N^2 orthonormal, hard-wall packets in
each spin channel. The complex array stores [up.re, up.im, down.re, down.im]
per spatial packet. Joint index q = 2*(N*x+y)+spin, with spin 0=up and 1=down.

    input = |0,0,up>
    A = U_box(T) tensor Ry(pi/2)
    A_dagger = U_box((2N-1)T) tensor Ry(-pi/2)
    U_box(t): b_nm -> exp[-i omega (n^2+m^2)t] b_nm
    omega = 2*pi/T_rev, T_rev = 19.2, T = T_rev/(2N)
    Ry(theta) = exp(-i theta sigma_y/2)

The spatial inverse uses positive-time free motion through (2N-1)T, because
U_box(T_rev)=I. The independent spin drive reverses and is spread over the full
inverse interval. In Hamiltonian form H_spin = hbar*(theta_gate/T_gate)*sigma_y/2.
This is an imposed spin-only drive; no orbital electromagnetic vector potential
or spin-orbit coupling is included. The spatial spectrum and revival time are
unchanged as N changes; only the retained modes and mixing interval change.
Every intermediate state is evaluated from the exact propagator.

Each oracle/reference gate is the ideal joint-mode projector pulse:

    U_q(p) = I + (exp(-i*pi*p)-1)|q><q|, 0 <= p <= 1

Only one complex spin coefficient rotates. The reference is |0,0,up>.
As in the parent, the kinetic Hamiltonian is not added during these nonlocal
ideal pulses. Each lasts 1.6 gate-time seconds.

Prepare once, then repeat oracle -> A_dagger -> reference -> A. The iteration
count is the integer nearest pi/(4 asin(1/sqrt(2N^2)))-1/2.

| Grid | Joint states | T | Forward inverse wait | Iterations | Final target probability |
| --- | ---: | ---: | ---: | ---: | ---: |
| 2x2 | 8 | 4.8 | 3T = 14.4 | 2 | 94.531250% |
| 3x3 | 18 | 3.2 | 5T = 16.0 | 3 | 99.104144% |
| 4x4 | 32 | 2.4 | 7T = 16.8 | 4 | 99.918232% |
| 5x5 | 50 | 1.92 | 9T = 17.28 | 5 | 99.990142% |

Times are in gate-time seconds. Full searches at speed 1 take 49.6, 70.4, 92,
and 113.92 seconds, respectively. After k iterations the joint target
probability is sin^2((2k+1) asin(1/sqrt(2N^2))).

## Full planar spin current

During free-plus-spin-drive intervals:

    rho = Psi_dagger Psi
    s = (hbar/2) Psi_dagger sigma Psi / rho
    j_P = (hbar/m) Im(Psi_dagger grad Psi) + (1/m) curl(rho*s)
    v = j_P/rho

The actual implementation uses the planar components of this current:

    M_z = |psi_up|^2 - |psi_down|^2
    j_spin = (hbar/2m) (partial_y M_z, -partial_x M_z)
    hbar/m = 4/(pi*T_rev)  [unit box, fixed across grid sizes]

Differentiating M_z includes both grad(rho) cross s and rho curl(s). The
convective term uses full complex spinor gradients, so the spin-texture phase
connection is already included; no additional Berry term should be added to it.
Uniform spin rotation changes the spin current without changing rho pointwise.
Spin circulation is divergence-free and can change trajectories even when the
density is unchanged.

This is a reduced planar guidance model. Three-component spin directions are
shown, but no transverse position or transverse-confinement wavefunction is
simulated. It does not claim every 3D Pauli trajectory stays in the plane.

## Current during the nonlocal phase gates

A local Pauli current alone does not conserve the density generated by an ideal
mode-projector Hamiltonian. The chosen extension is:

    j_total = j_P + grad(u)
    laplacian(u) = -partial_t(rho) - div(j_P)
    partial_normal(u) = 0 at the hard walls

This preserves the Pauli current's divergence-free circulation and adds the
gradient correction required by continuity. It is a specified generalized
guidance law, not a unique local physical implementation of the oracle.
It intentionally differs from the parent's purely gradient phase-gate current.

For Psi=F+exp(-i*pi*p)G, the correction contains constant, cos(pi*p), and
sin(pi*p) time terms and cosine spatial frequencies 0 through 2N. Their exact
coefficients are computed once per pulse. The GPU reconstructs correction
fields on a 512x512 float grid and samples them bilinearly. The wave and all
spinor gradients are evaluated analytically from N^2 sine products per channel.
GPU arrays accommodate the maximum N=5, and active-size uniforms select the
current grid without recompiling shaders.

The adaptive GPU integrator follows dx/ds=T_gate*j_total, dp/ds=rho with
cubic dense output. It has no velocity cap, goal attraction, or density
resampling during gates. Wave evolution is exact within the finite modal
subspace; trajectory integration and sampled correction fields have numerical
error. The CPU current and wall-flux tests check continuity independently.

## Verification and files

Run:

    node tests/static-check.mjs
    node --test tests/multiregion.test.mjs tests/flow.test.mjs tests/grid-sizes.test.mjs

Browser fixtures load the production app:

- tests/browser-check.html: actual RGBA spinor readbacks, independent dense
  complex-matrix propagation at every grid size, circuit/sphere state,
  spin selection, resizing during playback, and clocks.
- tests/flow-browser-check.html: GPU total/spin current, 4,000-particle spatial
  distributions at every grid size, 8x8 histograms, a 16,000-particle 5x5 run, and
  display/clock independence.
- tests/trail-browser-check.html: inherited GPU trail decay and recording.

See VERIFICATION.md for measured results. Core dynamics and spin diagnostics
live in multiregion-core.js; probability-flow.js defines the current and phase
correction. flow-renderer.js and shaders/flow_sample.glsl share the current
between particles, arrows, and GPU probes. The spinor texture packs its four
real components in RGBA. main.js coordinates both grids, display views, and
the existing recording bridge.
