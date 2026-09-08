# Public test evidence manifest

These fixtures are deterministic public test resources. Live runners must use
raw GitHub URLs pinned to the full commit containing these exact bytes.

| Fixture | Purpose | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| `clause-bundle.json` | exact agreement-clause commitment | 278 | `7213d0b657b15aca1addeb81ee75434cef1174134fa8df5dd7ad7870d79187cc` |
| `uptime-satisfied.json` | positive operational evidence | 170 | `1e9abdcdd273427db39f7edb5780eba5681716e842b1d341649808b971148117` |
| `uptime-breached.json` | positive contradictory outage evidence | 229 | `bd8100e0e5af654ec87740841ab2146d85b70a425c31e0c4b9fce77009e5b9c7` |
| `prompt-injection.txt` | untrusted instruction attack | 146 | `da884304546948a79dd35635721d384fcbcbf7e112984bd3626b987e0b390521` |

The contract records a validator-local snapshot digest for mutable evidence. It
does not claim that one file authenticates a complete Git repository snapshot.
