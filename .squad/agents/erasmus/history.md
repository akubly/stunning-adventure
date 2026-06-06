  for deterministic-workflow rules that Crucible's L3 generators may
  eventually need to adopt.
- **Erlang/OTP `gen_server` callbacks** as evidence that a 5-primitive
  taxonomy can stay 5 for 30 years if you start it disciplined. Good
  precedent for §6's restraint.

**Most consequential single finding:** The L3 generator contract is the
abstraction being asked to do the most work, and prior art (Eclipse
plugins, vscode `contributes.*`, every long-lived extension API)
consistently shows that the contract that is easy in v1 is the contract
you can't change in v3. Recommended an explicit Scheduler tier (US-E-13)
between L3 and L4 to keep the generator contract small.

**Prior-art system Aaron should personally study urgently:** **Pernosco.**
It is the single best worked example of the UX layer over a replay
substrate that Aperture is implicitly trying to be. Two hours of using it
will reshape Aperture's verb surface more than any spec round.

**Output:** `D:\git\harness\.squad\decisions\inbox\erasmus-ctd-p2-architectural-review.md`

