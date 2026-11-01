# Mosaik distributions

These archives contain unchanged Mosaik `0.1.183` distribution files, deterministically
repacked from original Yarn cache ZIPs into npm's `package/` archive layout. Names,
manifests, public exports, declarations, licenses and runtime content are preserved.

`provenance.json` records version, original cache artifact, digests and file counts.
`yarn verify:vendor` verifies the archives. Dependencies use public
`@pixel-brewery/*` names; root Yarn resolutions keep transitive references coherent.
No personal peer-checkout aliases are used.

This lets a fresh checkout install the prototype without a new private registry
login. Deliberate upgrades update related archives, lockfile and digests together.
