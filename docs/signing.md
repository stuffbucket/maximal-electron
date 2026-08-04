# Signing

## macOS: handled by a private builder

**No Apple credential belongs in this repository.** If you find one here, that
is a defect.

`stuffbucket` is a personal GitHub user account, not an organisation. Shared
self-hosted runners are therefore unavailable. Client repositories are public.
A self-hosted runner or an Apple secret on a public repository is a serious
risk. A fork can open a pull request that runs code.

`stuffbucket/macos-builder` is the answer. One private repository concentrates
the runner and the secrets. Public repositories only trigger it.

### What each side holds

| Side | Holds |
| --- | --- |
| Builder (private) | The runner, and every Apple secret |
| This repository | One secret: `MACOS_BUILDER_PAT` |

`MACOS_BUILDER_PAT` is a fine-grained token with Actions: write on
`stuffbucket/macos-builder` and nothing else. Its only power is to start a
build. It cannot read an Apple secret or reach another repository.

The builder reaches back in the other direction with a short-lived, per-client
installation token from the `app-repoman` GitHub App. There is no long-lived
builder token.

### One-time setup

Two manual steps. Neither can be scripted.

1. Install the `app-repoman` GitHub App on this repository, with Contents:
   read and write. That lets the builder check out and upload here.
2. Add the `MACOS_BUILDER_PAT` secret, scoped as above.

### Entitlements

`.macos-builder/config` selects one of the builder's enumerated sets.

| Name | Grants |
| --- | --- |
| `default` | Hardened runtime, no added capability |
| `network` | Network client and server |
| `virtualization` | Network plus virtualization |
| `bun-runtime` | JIT, unsigned executable memory, library validation off, network |

This application uses `default`. An Electron app with no sidecar needs nothing
more. `maximal` uses `bun-runtime` only because a Bun sidecar needs JIT.

Do not widen this. Each added capability weakens the hardened runtime, and the
builder validates the value against an allow-list anyway.

## Windows: unsigned, deliberately

Windows ships unsigned. `maximal`'s release workflow states the same position:
"Windows Authenticode signing — DEFERRED. v1 ships unsigned."

The consequence is real. SmartScreen warns on first run until the certificate
builds reputation.

### What signing would need

1. A code-signing certificate. An Extended Validation certificate gets
   SmartScreen reputation immediately; a standard one accumulates it over
   downloads. Azure Trusted Signing avoids handling a private key.
2. Two secrets on the repository, or a `signCommand` pointing at a key vault.
3. A signing step in `windows-msi`, after `wix build` and before the checksum.
   Sign the `.exe` inside the package as well as the MSI.

Because `windows-msi` generates the checksum after signing, the order of its
steps matters.

## Verifying a signed build

macOS, on a Mac:

```bash
spctl -a -t open --context context:primary-signature -v <path to dmg>
codesign --verify --deep --strict --verbose=2 /Applications/Stuffbucket.app
xcrun stapler validate <path to dmg>
```

Windows, once signing exists:

```powershell
Get-AuthenticodeSignature .\stuffbucket-v0.1.0-windows-x64.msi | Format-List
```
