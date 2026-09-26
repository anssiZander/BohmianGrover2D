# Grover with spin — SPINMultiRegionFree

A 32-state position-spin search, based on MultiRegionFreeMixing: 16 overlapping
spatial packets, each with spin up and spin down. Exact free-box evolution and
a uniform spin rotation perform mixing. Golden particles follow the full
position current, including the nonuniform-spin contribution.

## Run and explore

Serve this folder with VS Code Live Server, or run:

    python -m http.server 8835 --bind 127.0.0.1

Open http://127.0.0.1:8835/ in a desktop WebGL2 browser. No dependencies or build.

- Click a cell in either grid to select its position. **Click the selected cell
  again to flip its goal spin.** Moving to another cell keeps the chosen spin.
  Selection resets the search and is locked during a running or paused gate.
- Prepare, apply individual operations, or run the full four-iteration search.
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
- The 32 grid percentages and marked probability refer to joint logical modes.
  **Inside goal box** includes both spins and overlapping packet tails.
  Compare the particle fraction against this spatial probability.
- Spin purity is the reduced spin density matrix's Tr(rho_spin^2). Values below
  one indicate spin-position entanglement for this pure total state. The
  existing effective Grover Bloch sphere describes the marked/unmarked search
  subspace; it is not the local spin Bloch sphere.

Labels are |x1 x0 y1 y0, spin>. Columns increase left to right, rows bottom to
top. The upper-right cell is |1111>, lower-left |0000>.

## State and gates

The spatial basis is unchanged:

    u_n(x) = sqrt(2) sin(n pi x), n = 1,...,4
    f_j(x) = sum_n T[j,n] u_n(x), j = 0,...,3
    T[j,n] = sqrt(1/2) sin((j+1/2)n pi/4), n < 4
    T[j,4] = (1/2) sin((j+1/2)pi)
    phi_jk(x,y) = f_j(x) f_k(y)

The two-component wave is a sum of these 16 orthonormal, hard-wall packets in
each spin channel. The complex array stores [up.re, up.im, down.re, down.im]
per spatial packet. Joint index q = 2*(4*x+y)+spin, with spin 0=up and 1=down.

    input = |0000,up>
    A = U_box(T) tensor Ry(pi/2)
    A_dagger = U_box(7T) tensor Ry(-pi/2)
    U_box(t): b_nm -> exp[-i omega (n^2+m^2)t] b_nm
    omega = pi/(4T), T = 2.4
    Ry(theta) = exp(-i theta sigma_y/2)

The spatial inverse uses positive-time free motion through 7T, because
U_box(8T)=I. The independent spin drive reverses and is spread over the full
inverse interval. In Hamiltonian form H_spin = hbar*(theta_gate/T_gate)*sigma_y/2.
This is an imposed spin-only drive; no orbital electromagnetic vector potential
or spin-orbit coupling is included. The spatial spectrum and revival time are
unchanged. Every intermediate state is evaluated from the exact propagator.

Each oracle/reference gate is the ideal joint-mode projector pulse:

    U_q(p) = I + (exp(-i*pi*p)-1)|q><q|, 0 <= p <= 1

Only one complex spin coefficient rotates. The reference is |0000,up>.
As in the parent, the kinetic Hamiltonian is not added during these nonlocal
ideal pulses. Each lasts 1.6 gate-time seconds.

Prepare once, then repeat oracle -> A_dagger -> reference -> A four times.
The full sequence takes 92 gate-time seconds at speed 1.

| Completed iterations | Joint target probability |
| --- | ---: |
| 0, prepared | 3.125% |
| 1 | 25.830078% |
| 2 | 60.242462% |
| 3 | 89.693654% |
| 4 | 99.918232% |

## Full planar spin current

During free-plus-spin-drive intervals:

    rho = Psi_dagger Psi
    s = (hbar/2) Psi_dagger sigma Psi / rho
    j_P = (hbar/m) Im(Psi_dagger grad Psi) + (1/m) curl(rho*s)
    v = j_P/rho

The actual implementation uses the planar components of this current:

    M_z = |psi_up|^2 - |psi_down|^2
    j_spin = (hbar/2m) (partial_y M_z, -partial_x M_z)
    hbar/m = 1/(2*pi*T)  [unit box]

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
sin(pi*p) time terms and cosine spatial frequencies 0 through 8. Their exact
coefficients are computed once per pulse. The GPU reconstructs correction
fields on a 512x512 float grid and samples them bilinearly. The wave and all
spinor gradients are evaluated analytically from 16 sine products per channel.

The adaptive GPU integrator follows dx/ds=T_gate*j_total, dp/ds=rho with
cubic dense output. It has no velocity cap, goal attraction, or density
resampling during gates. Wave evolution is exact within the finite modal
subspace; trajectory integration and sampled correction fields have numerical
error. The CPU current and wall-flux tests check continuity independently.

## Verification and files

Run:

    node tests/static-check.mjs
    node --test tests/multiregion.test.mjs tests/flow.test.mjs

Browser fixtures load the production app:

- tests/browser-check.html: actual RGBA spinor readbacks, independent 32x32
  complex-matrix propagation, circuit/sphere state, spin selection, and clocks.
- tests/flow-browser-check.html: GPU total/spin current, 4,000-particle spatial
  distributions, 8x8 histograms, both goal spins, a 16,000-particle run, and
  display/clock independence.
- tests/trail-browser-check.html: inherited GPU trail decay and recording.

See VERIFICATION.md for measured results. Core dynamics and spin diagnostics
live in multiregion-core.js; probability-flow.js defines the current and phase
correction. flow-renderer.js and shaders/flow_sample.glsl share the current
between particles, arrows, and GPU probes. The spinor texture packs its four
real components in RGBA. main.js coordinates both grids, display views, and
the existing recording bridge.
