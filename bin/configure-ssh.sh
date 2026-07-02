#!/usr/bin/env bash
#
# Script: configure-ssh.sh
# Purpose: Enable SSH password authentication for workshop backups
#

set -euo pipefail

echo "==================================="
echo "Configuring SSH"
echo "==================================="

SSHD_CONFIG="/etc/ssh/sshd_config"

# Verify sudo access
if ! sudo -n true 2>/dev/null; then
    echo "INFO: enter the SAME password you used to log in to this WorkSpace..."
fi

# Backup sshd_config once
if [ ! -f "${SSHD_CONFIG}.bak" ]; then
    sudo cp "$SSHD_CONFIG" "${SSHD_CONFIG}.bak"
fi

# Enable PasswordAuthentication
if grep -q "^PasswordAuthentication" "$SSHD_CONFIG"; then
    sudo sed -i 's/^PasswordAuthentication.*/PasswordAuthentication yes/' "$SSHD_CONFIG"
else
    echo "PasswordAuthentication yes" | sudo tee -a "$SSHD_CONFIG" >/dev/null
fi

# Enable PAM
if grep -q "^UsePAM" "$SSHD_CONFIG"; then
    sudo sed -i 's/^UsePAM.*/UsePAM yes/' "$SSHD_CONFIG"
else
    echo "UsePAM yes" | sudo tee -a "$SSHD_CONFIG" >/dev/null
fi

# Restart SSH service
if systemctl list-unit-files | grep -q "^ssh.service"; then
    sudo systemctl restart ssh
else
    sudo systemctl restart sshd
fi
