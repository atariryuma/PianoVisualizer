#!/usr/bin/env bash
# gen_cert.sh — Dev certificate generator (mkcert-backed). Mac / Linux twin
# of gen_cert.ps1 — keep both in sync. See gen_cert.ps1 for the long-form
# rationale (mkcert > self-signed-leaf-with-CA:TRUE for Chrome's SW SSL
# validator, root-CA persistence across LAN-IP changes, etc.).
#
# Output (both gitignored):
#   cert.pfx     — server leaf + key, password $PIANO_CERT_PASS (default
#                  "piano123" — matches https_server.{mjs,ps1}).
#   rootCA.cer   — mkcert root CA in DER (public, fetchable from the dev
#                  server for iPad / Android install — see CLAUDE.md).
#
# Usage:
#   ./gen_cert.sh                        # auto-detect LAN IPs
#   ./gen_cert.sh 192.168.1.50           # override a single LAN IP
#   ./gen_cert.sh 192.168.1.50 10.0.0.5  # multiple IPs

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$script_dir"

# ── 1) mkcert presence check ────────────────────────────────────────────────
if ! command -v mkcert >/dev/null 2>&1; then
  echo
  echo "ERROR: mkcert is not on PATH." >&2
  echo "Install one of:" >&2
  echo "  brew install mkcert nss          # macOS — nss covers Firefox" >&2
  echo "  sudo apt install libnss3-tools && brew install mkcert  # Linuxbrew" >&2
  echo "  https://github.com/FiloSottile/mkcert/releases" >&2
  echo >&2
  echo "Then re-run: ./gen_cert.sh" >&2
  exit 1
fi

# ── 2) Resolve cert password (env > default) ───────────────────────────────
password="${PIANO_CERT_PASS:-piano123}"

# ── 3) LAN IP discovery ────────────────────────────────────────────────────
if [[ $# -gt 0 ]]; then
  ips=("$@")
else
  ips=()
  if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS: ifconfig prints "inet 192.168.x.x ..." on each active interface
    while IFS= read -r ip; do
      [[ -n "$ip" ]] && ips+=("$ip")
    done < <(ifconfig 2>/dev/null \
      | awk '/inet /{print $2}' \
      | grep -Ev '^127\.|^169\.254\.')
  else
    # Linux / WSL: prefer `ip -4 addr`, fall back to hostname -I
    if command -v ip >/dev/null 2>&1; then
      while IFS= read -r ip; do
        [[ -n "$ip" ]] && ips+=("$ip")
      done < <(ip -4 -o addr show scope global \
        | awk '{print $4}' | cut -d/ -f1)
    elif command -v hostname >/dev/null 2>&1; then
      for ip in $(hostname -I 2>/dev/null || true); do
        [[ -n "$ip" ]] && ips+=("$ip")
      done
    fi
  fi
fi

if [[ ${#ips[@]} -gt 0 ]]; then
  echo "Detected LAN IPs: ${ips[*]}"
else
  echo "WARNING: no LAN IPv4 detected — cert will only cover localhost." >&2
fi

san_list=("localhost" "${ips[@]}")
echo "Subject Alt Names: ${san_list[*]}"

# ── 4) Ensure mkcert root CA exists & is trusted by the OS ─────────────────
# Scope to system + nss only — skip JDK cacerts (matches the PowerShell
# script's policy, avoids needing sudo just for the Java trust store).
export TRUST_STORES="system,nss"

echo "Verifying mkcert root CA is installed (TRUST_STORES=$TRUST_STORES)..."
mkcert -install

# ── 5) Generate the server leaf cert (PKCS#12) ─────────────────────────────
# mkcert -pkcs12 hardcodes the password to "changeit"; we re-export below
# so https_server.{mjs,ps1} can keep reading "piano123" / $PIANO_CERT_PASS.
pfx_path="$script_dir/cert.pfx"
echo "Generating server leaf certificate..."
mkcert -pkcs12 -p12-file "$pfx_path" "${san_list[@]}"

# ── 6) Re-export the PFX with the project's password ───────────────────────
# OpenSSL pipeline: extract the cert + key from the changeit-locked PFX,
# then re-pack with $password.
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

openssl pkcs12 -in "$pfx_path" -nokeys -passin "pass:changeit" \
  -out "$tmp_dir/cert.pem"
openssl pkcs12 -in "$pfx_path" -nocerts -nodes -passin "pass:changeit" \
  -out "$tmp_dir/key.pem"
openssl pkcs12 -export \
  -inkey "$tmp_dir/key.pem" \
  -in "$tmp_dir/cert.pem" \
  -out "$pfx_path" \
  -passout "pass:$password"

# ── 7) Copy the mkcert root CA into the repo as rootCA.cer (DER) ───────────
ca_root="$(mkcert -CAROOT)"
if [[ -z "$ca_root" || ! -d "$ca_root" ]]; then
  echo "ERROR: could not resolve 'mkcert -CAROOT' directory: '$ca_root'" >&2
  exit 1
fi
root_pem="$ca_root/rootCA.pem"
if [[ ! -f "$root_pem" ]]; then
  echo "ERROR: mkcert root cert not found at: $root_pem" >&2
  exit 1
fi
openssl x509 -in "$root_pem" -outform DER -out "$script_dir/rootCA.cer"

# ── 8) Clean up the legacy self-signed cert.cer if it's left over ──────────
[[ -f "$script_dir/cert.cer" ]] && rm -f "$script_dir/cert.cer"

# ── 9) Friendly summary ────────────────────────────────────────────────────
echo
echo "Created:"
echo "  $pfx_path        (server, password: $password)"
echo "  $script_dir/rootCA.cer  (iPad / Android trust install — public, safe to share)"
echo
echo "Next steps:"
echo "  1. node https_server.mjs                # restart server with new cert"
echo "  2. Same Mac, any browser: open https://localhost:8443/"
for ip in "${ips[@]}"; do
  echo "  3. iPad Safari -> https://${ip}:8443/rootCA.cer    (one-time per iPad)"
done
echo "  4. iPad Settings -> General -> VPN & Device Management -> install profile"
echo "  5. iPad Settings -> General -> About -> Certificate Trust Settings -> enable 'mkcert development CA'"
