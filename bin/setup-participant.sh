#!/usr/bin/env bash
# Script: Participant Setup and Configuration
# Purpose: Configure AWS credentials and Terraform backend for workshop participant
# Usage: ./setup-participant.sh

set -e

# Usage helper
if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    echo "Usage: $0"
    echo "Configure AWS credentials and Terraform backend for workshop participant"
    echo ""
    echo "Description:"
    echo "  Loads participant configuration, retrieves temporary AWS"
    echo "  credentials from workshop API, and creates environment"
    echo "  configuration for deployment scripts"
    echo ""
    echo "Options:"
    echo "  -h, --help      Show this help message"
    echo ""
    echo "Requirements:"
    echo "  - aws cli installed"
    echo "  - curl and jq installed"
    echo ""
    echo "Output:"
    echo "  Creates ENVIRONMENT.config with AWS credentials"
    exit 0
fi

echo "==================================="
echo "Coding Workshop - Participant Setup"
echo "==================================="
echo ""

# Verify required dependencies
aws --version > /dev/null 2>&1 || { echo "ERROR: 'aws' is missing. Aborting..."; exit 1; }
curl --version > /dev/null 2>&1 || { echo "ERROR: 'curl' is missing. Aborting..."; exit 1; }
jq --version > /dev/null 2>&1 || { echo "ERROR: 'jq' is missing. Aborting..."; exit 1; }

# Resolve script directory and project root paths
SCRIPT_DIR="$(cd "$(dirname "$0")" > /dev/null 2>&1 || exit 1; pwd -P)"
PROJECT_ROOT="$(cd $SCRIPT_DIR/.. > /dev/null 2>&1 || exit 1; pwd -P)"
PROJECT_NAME="coding-workshop"
DOMAIN_NAME="codingworkshop.net"
if [ -z "$EVENT_ID" ]; then EVENT_ID="abcd1234"; fi

# Retrieve DNS TXT record
echo "INFO: Retrieve DNS TXT record..."
CURRENT_RECORD=$(dig +short TXT "$DOMAIN_NAME" | tr -d '"')
while IFS='=' read -r key value; do
    key=$(echo "$key" | xargs)
    if [ -n "$key" ] && [ "$key" = "$EVENT_ID" ]; then
        PARTICIPANT_URL=$(echo "$value" | xargs)
    fi
done < <(echo "$CURRENT_RECORD" | tr ' ' '\n' | grep '=')

# If Participant URL not found via DNS, check for local config
echo "INFO: PARTICIPANT_URL=$PARTICIPANT_URL"
if [ -z "$PARTICIPANT_URL" ] && [ -f "$PROJECT_ROOT/ENVIRONMENT.config" ]; then
    source $PROJECT_ROOT/ENVIRONMENT.config
fi

# Validate that Participant URL was retrieved successfully
if [ -z "$PARTICIPANT_URL" ]; then
    echo "ERROR: PARTICIPANT_URL not found for event ID '$EVENT_ID'. Aborting..."
    exit 1
fi

case "$PARTICIPANT_URL" in
    http*) ;;
    *) PARTICIPANT_URL="https://$PARTICIPANT_URL" ;;
esac

if [ -z "$PARTICIPANT_ID" ]; then
    echo "ERROR: PARTICIPANT_ID not found. Aborting..."
    exit 1
fi

if [ -z "$PARTICIPANT_CODE" ]; then
    echo "ERROR: PARTICIPANT_CODE not found. Aborting..."
    exit 1
fi

# Retrieve temporary AWS credentials from workshop API
echo "INFO: Retrieving temporary AWS credentials..."
RESPONSE_FILE=$(mktemp)
HTTP_CODE=$(curl -sS --retry 3 --retry-delay 2 -o "$RESPONSE_FILE" -w '%{http_code}' \
    -H "x-id: $PARTICIPANT_ID" -H "x-code: $PARTICIPANT_CODE" "$PARTICIPANT_URL") || {
    rm -f "$RESPONSE_FILE"
    echo "ERROR: Could not reach the workshop API at $PARTICIPANT_URL. Aborting..."
    exit 1
}

# curl exits 0 on 4xx/5xx, so the status has to be checked explicitly
if [ "$HTTP_CODE" != "200" ]; then
    echo "ERROR: Workshop API returned HTTP $HTTP_CODE: $(cat "$RESPONSE_FILE")"
    rm -f "$RESPONSE_FILE"
    echo "ERROR: Failed to retrieve temporary AWS credentials. Aborting..."
    exit 1
fi

JSON=$(cat "$RESPONSE_FILE")
rm -f "$RESPONSE_FILE"

# Configure AWS CLI profile with temporary credentials
echo "INFO: Setting up the AWS CLI..."
AWS_ACCESS_KEY_ID="$(echo "$JSON" | jq -r '.AccessKeyId // empty')"
AWS_SECRET_ACCESS_KEY="$(echo "$JSON" | jq -r '.SecretAccessKey // empty')"
AWS_SESSION_TOKEN="$(echo "$JSON" | jq -r '.SessionToken // empty')"

# Writing empty values here would shadow any ambient role for every later AWS call
if [ -z "$AWS_ACCESS_KEY_ID" ] || [ -z "$AWS_SECRET_ACCESS_KEY" ] || [ -z "$AWS_SESSION_TOKEN" ]; then
    echo "ERROR: Workshop API response did not contain credentials. Aborting..."
    exit 1
fi

aws configure set aws_access_key_id "$AWS_ACCESS_KEY_ID"
aws configure set aws_secret_access_key "$AWS_SECRET_ACCESS_KEY"
aws configure set aws_session_token "$AWS_SESSION_TOKEN"

# Auto-detect AWS Account ID from credentials
echo "INFO: Auto-detecting AWS Account ID..."
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text) || {
    echo "ERROR: Failed to retrieve AWS Account ID. Aborting..."
    exit 1
}

# Verify AWS Account ID was retrieved successfully
if [ -z "$AWS_ACCOUNT_ID" ]; then
    echo "ERROR: Could not detect AWS Account ID."
    echo ""
    echo "Please ensure your AWS credentials are configured:"
    echo "  export AWS_ACCESS_KEY_ID=your-key"
    echo "  export AWS_SECRET_ACCESS_KEY=your-secret"
    echo "  export AWS_SESSION_TOKEN=your-session-token"
    echo ""
    echo "Then run this script again."
    exit 1
fi

echo "  ✓ AWS profile configured"
echo ""

echo "INFO: Retrieving AWS Directory Service IP..."
AWS_DS_IP="$(echo $JSON | jq -r '.Metadata.ips.S' | cut -d ',' -f1 || echo '')"
if [ -n "$AWS_DS_IP" ] && [ "$AWS_DS_IP" != "null" ]; then
    echo "INFO: AWS Directory Service IP - $AWS_DS_IP"
else
    echo "WARN: AWS Directory Service IP not found"
fi

# Create environment configuration file for deployment scripts
ENVIRONMENT_CONFIG="$PROJECT_ROOT/ENVIRONMENT.config"
cat > "$ENVIRONMENT_CONFIG" <<EOF
# Auto-generated by setup-participant.sh
# Participant ID: $PARTICIPANT_ID

export AWS_ACCESS_KEY_ID="$AWS_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$AWS_SECRET_ACCESS_KEY"
export AWS_SESSION_TOKEN="$AWS_SESSION_TOKEN"
export AWS_ACCOUNT_ID="$AWS_ACCOUNT_ID"
export AWS_S3_BUCKET="$PROJECT_NAME-tfstate-$PARTICIPANT_ID"
export PARTICIPANT_ID="$PARTICIPANT_ID"
export PARTICIPANT_URL="$PARTICIPANT_URL"
export PROJECT_NAME="$PROJECT_NAME"
export TF_VAR_aws_app_code="$PARTICIPANT_ID"
export TF_VAR_aws_project="$PROJECT_NAME"
export TF_VAR_aws_ds_ip="$AWS_DS_IP"
EOF

echo "INFO: Created environment file - ENVIRONMENT.config"
echo "  ✓ Environment configured"
echo ""

# The workshop's backup signs in to this WorkSpace over SSH with the participant's own password, so the SSH server has to
# be installed, running, and accepting passwords. Safe to run again: it changes nothing that is already right, and only
# asks for sudo when something needs changing. It is skipped where there is no WorkSpace to sign in to: not Ubuntu/Debian,
# or inside a build (CODEBUILD_BUILD_ID), or WORKSHOP_SKIP_SSH=1.
ssh_problem() {
    echo "WARN: $1"
    SSH_PROBLEM=true
}

ssh_already_configured() {
    # Readable without sudo: the drop-in, the main file's settings, and whether the service is running and enabled.
    grep -qx "PasswordAuthentication yes" /etc/ssh/sshd_config.d/00-coding-workshop.conf 2> /dev/null \
        && grep -q "^PasswordAuthentication yes$" /etc/ssh/sshd_config 2> /dev/null \
        && grep -q "^UsePAM yes$" /etc/ssh/sshd_config 2> /dev/null \
        && grep -q "^PubkeyAuthentication yes$" /etc/ssh/sshd_config 2> /dev/null \
        && systemctl is-active --quiet ssh 2> /dev/null && systemctl is-enabled --quiet ssh 2> /dev/null
}

configure_sshd() {
    echo "INFO: Configuring the SSH server for the workshop backup..."

    local sshd_config="/etc/ssh/sshd_config"
    # Ubuntu 22.04's sshd_config starts with "Include /etc/ssh/sshd_config.d/*.conf", and sshd keeps the first value it
    # reads, so a drop-in there that says "PasswordAuthentication no" (cloud images ship one) beats this file's "yes".
    # This drop-in sorts first, so its "yes" is the one that counts.
    local sshd_dropin="/etc/ssh/sshd_config.d/00-coding-workshop.conf"
    local config_changed=false

    # Ensure openssh-server is installed
    if ! command -v sshd > /dev/null 2>&1 && [ ! -x /usr/sbin/sshd ]; then
        echo "INFO: Installing openssh-server..."
        if sudo apt-get install -y -qq openssh-server > /dev/null; then
            echo "  ✓ openssh-server installed"
            config_changed=true
        else
            ssh_problem "Failed to install openssh-server"
            return
        fi
    else
        echo "INFO: openssh-server already installed"
    fi

    # Backup original configuration only once
    if [ -f "$sshd_config" ] && [ ! -f "${sshd_config}.backup-original" ]; then
        sudo cp "$sshd_config" "${sshd_config}.backup-original"
        echo "  ✓ Backed up original SSH configuration"
    fi

    if [ -d "$(dirname "$sshd_dropin")" ] && ! sudo grep -qx "PasswordAuthentication yes" "$sshd_dropin" 2>/dev/null; then
        printf '%s\n' "# Written by setup-participant.sh: the workshop's backup signs in with this WorkSpace's password." \
            "PasswordAuthentication yes" | sudo tee "$sshd_dropin" > /dev/null
        echo "  ✓ Password sign-in set ahead of the other sshd_config.d settings"
        config_changed=true
    fi

    # Check if configuration already has the required settings
    local pw_auth_correct=$(sudo grep -q "^PasswordAuthentication yes$" "$sshd_config" && echo "true" || echo "false")
    local pam_correct=$(sudo grep -q "^UsePAM yes$" "$sshd_config" && echo "true" || echo "false")
    local pubkey_correct=$(sudo grep -q "^PubkeyAuthentication yes$" "$sshd_config" && echo "true" || echo "false")

    # If all settings are already correct, no changes needed
    if [ "$config_changed" = "false" ] && [ "$pw_auth_correct" = "true" ] && [ "$pam_correct" = "true" ] && [ "$pubkey_correct" = "true" ]; then
        echo "INFO: SSH configuration already properly configured"

        # Verify service is running and enabled
        if ! sudo systemctl is-active --quiet sshd 2>/dev/null && ! sudo systemctl is-active --quiet ssh 2>/dev/null; then
            echo "INFO: Starting SSH service..."
            if sudo systemctl start sshd 2>/dev/null || sudo systemctl start ssh 2>/dev/null; then
                echo "  ✓ SSH service started"
            else
                ssh_problem "Failed to start SSH service"
                return
            fi
        fi

        # Verify service is enabled
        if ! sudo systemctl is-enabled sshd 2>/dev/null && ! sudo systemctl is-enabled ssh 2>/dev/null; then
            if sudo systemctl enable sshd 2>/dev/null || sudo systemctl enable ssh 2>/dev/null; then
                echo "  ✓ SSH service enabled to start on boot"
            fi
        fi

        echo "  ✓ SSH server is properly configured for password-based connections"
        return
    fi

    echo "INFO: Configuring SSH for password authentication..."

    # Create temporary backup for this change
    local temp_backup=$(mktemp)
    sudo cp "$sshd_config" "$temp_backup"

    # Enable password authentication
    if ! sudo grep -q "^PasswordAuthentication yes$" "$sshd_config"; then
        if sudo grep -q "^PasswordAuthentication" "$sshd_config"; then
            # Replace existing line
            sudo sed -i 's/^PasswordAuthentication.*/PasswordAuthentication yes/' "$sshd_config"
        elif sudo grep -q "^#PasswordAuthentication" "$sshd_config"; then
            # Uncomment existing commented line
            sudo sed -i 's/^#PasswordAuthentication.*/PasswordAuthentication yes/' "$sshd_config"
        else
            # Add new line
            echo "PasswordAuthentication yes" | sudo tee -a "$sshd_config" > /dev/null
        fi
        config_changed=true
    fi

    # Enable PAM authentication (required for password auth)
    if ! sudo grep -q "^UsePAM yes$" "$sshd_config"; then
        if sudo grep -q "^UsePAM" "$sshd_config"; then
            sudo sed -i 's/^UsePAM.*/UsePAM yes/' "$sshd_config"
        elif sudo grep -q "^#UsePAM" "$sshd_config"; then
            sudo sed -i 's/^#UsePAM.*/UsePAM yes/' "$sshd_config"
        else
            echo "UsePAM yes" | sudo tee -a "$sshd_config" > /dev/null
        fi
        config_changed=true
    fi

    # Ensure PubkeyAuthentication is also enabled (best practice)
    if ! sudo grep -q "^PubkeyAuthentication yes$" "$sshd_config"; then
        if sudo grep -q "^PubkeyAuthentication" "$sshd_config"; then
            sudo sed -i 's/^PubkeyAuthentication.*/PubkeyAuthentication yes/' "$sshd_config"
        elif sudo grep -q "^#PubkeyAuthentication" "$sshd_config"; then
            sudo sed -i 's/^#PubkeyAuthentication.*/PubkeyAuthentication yes/' "$sshd_config"
        else
            echo "PubkeyAuthentication yes" | sudo tee -a "$sshd_config" > /dev/null
        fi
        config_changed=true
    fi

    if [ "$config_changed" = "true" ]; then
        echo "  ✓ SSH configuration updated"
    else
        echo "INFO: SSH configuration already correct"
    fi

    # Test SSH configuration
    if ! sudo sshd -t 2>/dev/null; then
        echo "ERROR: SSH configuration syntax check failed"
        echo "INFO: Restoring from backup..."
        sudo cp "$temp_backup" "$sshd_config"
        sudo rm -f "$sshd_dropin"
        rm -f "$temp_backup"
        ssh_problem "Failed to configure SSH - configuration restored"
        return
    fi

    rm -f "$temp_backup"

    # Restart SSH service only if configuration was changed
    if [ "$config_changed" = "true" ]; then
        echo "INFO: Restarting SSH service..."
        if sudo systemctl restart sshd 2>/dev/null || sudo systemctl restart ssh 2>/dev/null; then
            echo "  ✓ SSH service restarted with new configuration"
        else
            ssh_problem "Failed to restart SSH service"
            return
        fi
    else
        # Ensure service is running
        if ! sudo systemctl is-active --quiet sshd 2>/dev/null && ! sudo systemctl is-active --quiet ssh 2>/dev/null; then
            echo "INFO: Starting SSH service..."
            if sudo systemctl start sshd 2>/dev/null || sudo systemctl start ssh 2>/dev/null; then
                echo "  ✓ SSH service started"
            else
                ssh_problem "Failed to start SSH service"
                return
            fi
        fi
    fi

    # Enable SSH service on boot
    if ! sudo systemctl is-enabled sshd 2>/dev/null && ! sudo systemctl is-enabled ssh 2>/dev/null; then
        if sudo systemctl enable sshd 2>/dev/null || sudo systemctl enable ssh 2>/dev/null; then
            echo "  ✓ SSH service enabled to start on boot"
        fi
    fi

    # What sshd actually uses, not what this file says: anything else that still turns password sign-in off shows here.
    if ! sudo sshd -T 2>/dev/null | grep -qi "^passwordauthentication yes$"; then
        ssh_problem "SSH password sign-in is still off (see: sudo sshd -T | grep -i passwordauthentication); the workshop backup cannot sign in"
        return
    fi

    # Display connection information
    echo "INFO: SSH Configuration Summary:"
    echo "INFO:   - Password authentication: ENABLED"
    echo "INFO:   - Public key authentication: ENABLED"
    echo "INFO:   - Service status: $(sudo systemctl is-active sshd ssh 2>/dev/null | head -n1)"
    echo "INFO:   - SSH port: 22 (default)"

    # Get IP addresses
    local ip_addresses=$(hostname -I 2>/dev/null | tr ' ' '\n' | grep -E '^[0-9]+\.' | head -3 | tr '\n' ' ')
    if [ -n "$ip_addresses" ]; then
        echo "INFO:   - Connect with: ssh $(whoami)@<IP_ADDRESS>"
        echo "INFO:   - Available IPs: $ip_addresses"
    fi

    echo "  ✓ SSH server is ready for password-based connections"
}

SSH_PROBLEM=false
if [ -n "$CODEBUILD_BUILD_ID" ] || [ "$WORKSHOP_SKIP_SSH" = "1" ] || [ "$(uname -s)" != "Linux" ] || ! command -v apt-get > /dev/null 2>&1; then
    :
elif ssh_already_configured; then
    echo "INFO: The SSH server is already configured for the workshop backup"
else
    configure_sshd || ssh_problem "The SSH server could not be configured"
fi
if [ "$SSH_PROBLEM" = true ]; then
    echo "WARN: The workshop backup may not be able to sign in to this WorkSpace; run this script again after fixing the above."
fi
echo ""
