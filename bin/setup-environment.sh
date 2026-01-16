#!/usr/bin/env bash

# ============================================================================
# Ubuntu 22.04 Developer Workstation Setup Script
# ============================================================================
#
# Purpose: Prepare a fresh Ubuntu 22.04 machine for development with all
#          essential tools, IDEs, and services configured and ready to use.
#
# Installs:
#   - IDEs: Visual Studio Code, IntelliJ IDEA, PyCharm
#   - Browser: Google Chrome
#   - Containers: Docker (with sudo-less access)
#   - Cloud Tools: Terraform CLI, AWS CLI v2
#   - LocalStack: LocalStack CLI, tflocal, awslocal
#   - Database: MongoDB, MongoDB Compass
#   - Runtimes: Node.js 22, Python 3.14
#   - Utilities: jq (JSON processor)
#   - Optional: dnsmasq (for LocalStack DNS, use -d flag)
#
# Services configured to start on boot:
#   - Docker
#   - LocalStack
#   - MongoDB
#
# Usage:
#   ./workspace-setup.sh [OPTIONS]
#
# Options:
#   -n                     Dry run - show what would be done without making changes
#   -d                     Install and configure dnsmasq for LocalStack DNS
#   -h, --help             Show this help message
#   --intellij-ultimate    Install IntelliJ IDEA Ultimate (default: Community)
#   --pycharm-professional Install PyCharm Professional (default: Community)
#
# Examples:
#   ./workspace-setup.sh -n              # Preview installation
#   ./workspace-setup.sh                 # Run installation with defaults
#   ./workspace-setup.sh -d              # Include dnsmasq for LocalStack DNS
#   ./workspace-setup.sh --intellij-ultimate --pycharm-professional
#
# ============================================================================

# Fail-safe mode - continue on errors and report at the end
set +e

# ============================================================================
# SECTION 2: CONFIGURATION CONSTANTS
# ============================================================================

LOCALSTACK_VERSION="4.12.0"
MONGODB_VERSION="7.0"
COMPASS_VERSION="1.43.0"

# ============================================================================
# SECTION 3: COMMAND-LINE ARGUMENT PARSING
# ============================================================================

DRY_RUN=false
INSTALL_DNSMASQ=false
INTELLIJ_EDITION="community"
PYCHARM_EDITION="community"

# Track if script has been restarted for docker group activation
DOCKER_GROUP_ACTIVATED=${DOCKER_GROUP_ACTIVATED:-false}

show_help() {
    cat << 'HELP'
Ubuntu 22.04 Developer Workstation Setup

Usage: ./workspace-setup.sh [OPTIONS]

Options:
  -n                     Dry run - show what would be done without making changes
  -d                     Install and configure dnsmasq for LocalStack DNS
  -h, --help             Show this help message
  --intellij-ultimate    Install IntelliJ IDEA Ultimate (default: Community)
  --pycharm-professional Install PyCharm Professional (default: Community)

Installed tools:
  - Visual Studio Code (latest)
  - IntelliJ IDEA (Community or Ultimate)
  - PyCharm (Community or Professional)
  - Google Chrome
  - Docker (with sudo-less access for current user)
  - Terraform CLI
  - AWS CLI v2
  - LocalStack CLI
  - tflocal, awslocal
  - MongoDB + MongoDB Compass
  - Node.js 22
  - Python 3.14
  - jq (JSON processor)

Services configured to start on boot:
  - Docker
  - LocalStack
  - MongoDB

Examples:
  ./workspace-setup.sh -n           # Preview installation
  ./workspace-setup.sh              # Interactive installation
  ./workspace-setup.sh -d           # Include dnsmasq for LocalStack DNS
  ./workspace-setup.sh --intellij-ultimate --pycharm-professional
HELP
}

# Save original arguments for potential script restart (docker group activation)
ORIGINAL_ARGS="$*"

# Parse command-line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -n)
            DRY_RUN=true
            shift
            ;;
        -d)
            INSTALL_DNSMASQ=true
            shift
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        --intellij-ultimate)
            INTELLIJ_EDITION="ultimate"
            shift
            ;;
        --pycharm-professional)
            PYCHARM_EDITION="professional"
            shift
            ;;
        *)
            echo "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# ============================================================================
# SECTION 4: UTILITY FUNCTIONS
# ============================================================================

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Array to track failures
declare -a FAILURES=()

# Get actual username (not FQDN from $USER, handles sudo correctly)
ACTUAL_USER="${SUDO_USER:-$(whoami)}"
ACTUAL_HOME=$(eval echo ~$ACTUAL_USER)

# Logging setup
LOG_DIR="$ACTUAL_HOME/.local/share/workspace-setup"
LOG_FILE="$LOG_DIR/setup-$(date +%Y%m%d-%H%M%S).log"

setup_logging() {
    mkdir -p "$LOG_DIR"
    # Tee to both stdout and log file
    exec > >(tee -a "$LOG_FILE") 2>&1
    print_info "Logging to: $LOG_FILE"
}

# Rotate old logs (keep last 5)
rotate_logs() {
    if [ -d "$LOG_DIR" ]; then
        ls -t "$LOG_DIR"/setup-*.log 2>/dev/null | tail -n +6 | xargs -r rm
    fi
}

# Print functions
print_status() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

print_info() {
    echo -e "${YELLOW}[i]${NC} $1"
}

print_section() {
    echo ""
    echo -e "${BLUE}============================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}============================================${NC}"
}

# Add failure to tracking array
add_failure() {
    FAILURES+=("$1")
    print_error "$1"
}

# Dry run helpers
is_dry_run() {
    [ "$DRY_RUN" = true ]
}

print_dry_run_header() {
    echo -e "${YELLOW}[$1]${NC} $2"
}

print_dry_run_status() {
    echo -e "  ${GREEN}✓${NC} $1"
}

print_dry_run_action() {
    echo -e "  ${YELLOW}→${NC} $1"
}

print_dry_run_skip() {
    echo -e "  ${YELLOW}○${NC} $1"
}

print_dry_run_missing() {
    echo -e "  ${RED}✗${NC} $1"
}

# ============================================================================
# SECTION 5: PRE-FLIGHT CHECKS
# ============================================================================

# Check if running as root directly (not via sudo)
check_not_root() {
    if [ "$EUID" -eq 0 ] && [ -z "$SUDO_USER" ]; then
        print_error "Do not run this script as root directly"
        print_info "Run as a regular user with sudo privileges:"
        print_info "  ./workspace-setup.sh"
        return 1
    fi
    return 0
}

# Check sudo privileges
check_sudo() {
    if ! sudo -v &>/dev/null; then
        print_error "This script requires sudo privileges"
        print_info "Please ensure your user is in the sudo group:"
        print_info "  sudo usermod -aG sudo $ACTUAL_USER"
        return 1
    fi
    print_status "Sudo privileges confirmed"
    return 0
}

# Check disk space (require 15GB free)
check_disk_space() {
    local required_gb=15
    local available_kb=$(df / 2>/dev/null | awk 'NR==2 {print $4}')
    local available_gb=$((available_kb / 1024 / 1024))

    if [ "$available_gb" -lt "$required_gb" ]; then
        print_error "Insufficient disk space: ${available_gb}GB available, ${required_gb}GB required"
        print_info "Free up space or expand your disk before continuing"
        return 1
    fi
    print_status "Disk space check passed: ${available_gb}GB available"
    return 0
}

# Check network connectivity
check_network() {
    local test_hosts=("archive.ubuntu.com" "download.docker.com" "github.com")
    local failed=false

    for host in "${test_hosts[@]}"; do
        if ! ping -c 1 -W 3 "$host" &>/dev/null; then
            print_error "Cannot reach $host"
            failed=true
        fi
    done

    if [ "$failed" = true ]; then
        print_error "Network connectivity issues detected"
        print_info "Please check your internet connection"
        return 1
    fi
    print_status "Network connectivity verified"
    return 0
}

# Check for desktop environment (IDEs need display)
check_desktop_environment() {
    if [ -z "$DISPLAY" ] && [ -z "$WAYLAND_DISPLAY" ]; then
        print_info "No display detected - GUI applications may not launch properly"
        print_info "This script is designed for Ubuntu Desktop, not Server"
    else
        print_status "Desktop environment detected"
    fi
    return 0
}

# Wait for APT lock to be released
wait_for_apt_lock() {
    local max_wait=60
    local waited=0

    while fuser /var/lib/dpkg/lock-frontend >/dev/null 2>&1 || \
          fuser /var/lib/apt/lists/lock >/dev/null 2>&1; do
        if [ $waited -ge $max_wait ]; then
            print_error "APT lock held for too long"
            print_info "Please close other package managers (Software Center, apt, etc.)"
            return 1
        fi
        if [ $waited -eq 0 ]; then
            print_info "Waiting for other package managers to finish..."
        fi
        sleep 5
        ((waited+=5))
    done
    return 0
}

# Check Ubuntu version
check_ubuntu_version() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        if [ "$ID" != "ubuntu" ]; then
            print_error "This script is designed for Ubuntu (detected: $ID)"
            print_info "Continuing anyway, but some steps may fail..."
        elif [ "$VERSION_ID" != "22.04" ]; then
            print_info "This script is designed for Ubuntu 22.04 (detected: $VERSION_ID)"
            print_info "Continuing anyway, but some steps may need adjustment..."
        else
            print_status "Ubuntu 22.04 detected"
        fi
    else
        print_error "Cannot determine OS version"
        print_info "Continuing anyway, but some steps may fail..."
    fi
    return 0
}

# Run all pre-flight checks
run_preflight_checks() {
    print_section "Pre-flight Checks"

    local failed=false

    check_not_root || failed=true
    check_sudo || failed=true
    check_disk_space || failed=true
    check_network || failed=true
    check_desktop_environment
    check_ubuntu_version
    wait_for_apt_lock || failed=true

    if [ "$failed" = true ]; then
        echo ""
        print_error "Pre-flight checks failed. Please resolve the issues above."
        exit 1
    fi

    echo ""
    print_status "All pre-flight checks passed"
}

# ============================================================================
# SECTION 6: SYSTEM PREREQUISITES
# ============================================================================

install_prerequisites() {
    print_section "System Prerequisites"

    local packages="ca-certificates curl gnupg lsb-release apt-transport-https"
    packages="$packages software-properties-common unzip wget python3-pip jq"

    if [ "$INSTALL_DNSMASQ" = true ]; then
        packages="$packages dnsmasq"
    fi

    if is_dry_run; then
        print_dry_run_header "PREREQ" "System Prerequisites"
        print_dry_run_action "Would run: apt update"
        print_dry_run_action "Would install: $packages"
        return
    fi

    print_info "Updating system and installing prerequisites..."
    if sudo apt update && sudo apt install -y $packages; then
        print_status "Prerequisites installed"
    else
        add_failure "Failed to install system prerequisites"
    fi
}

# ============================================================================
# SECTION 7: IDE INSTALLATIONS
# ============================================================================

install_vscode() {
    print_section "Visual Studio Code"

    if is_dry_run; then
        print_dry_run_header "VSCODE" "Visual Studio Code"
        if command -v code &> /dev/null; then
            print_dry_run_status "Already installed: $(code --version 2>/dev/null | head -n1)"
        else
            print_dry_run_missing "Not installed"
            print_dry_run_action "Would add Microsoft GPG key"
            print_dry_run_action "Would add Microsoft VS Code repository"
            print_dry_run_action "Would install: code"
        fi
        return
    fi

    print_info "Installing Visual Studio Code..."

    # Idempotency check
    if command -v code &> /dev/null; then
        print_info "VS Code already installed: $(code --version | head -n1)"
        return
    fi

    # Download and add Microsoft GPG key
    if wget -qO- https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor > /tmp/packages.microsoft.gpg; then
        sudo install -D -o root -g root -m 644 /tmp/packages.microsoft.gpg /etc/apt/keyrings/packages.microsoft.gpg
        rm /tmp/packages.microsoft.gpg

        # Add repository
        echo "deb [arch=amd64,arm64,armhf signed-by=/etc/apt/keyrings/packages.microsoft.gpg] https://packages.microsoft.com/repos/code stable main" | \
            sudo tee /etc/apt/sources.list.d/vscode.list > /dev/null

        # Install
        if sudo apt update && sudo apt install -y code; then
            print_status "VS Code installed: $(code --version | head -n1)"
        else
            add_failure "Failed to install VS Code"
        fi
    else
        add_failure "Failed to add Microsoft GPG key for VS Code"
    fi
}

install_intellij() {
    print_section "IntelliJ IDEA ($INTELLIJ_EDITION)"

    local snap_package="intellij-idea-${INTELLIJ_EDITION}"

    if is_dry_run; then
        print_dry_run_header "INTELLIJ" "IntelliJ IDEA ($INTELLIJ_EDITION)"
        if snap list 2>/dev/null | grep -q "intellij-idea"; then
            print_dry_run_status "Already installed"
        else
            print_dry_run_missing "Not installed"
            print_dry_run_action "Would install via snap: $snap_package --classic"
        fi
        return
    fi

    print_info "Installing IntelliJ IDEA ($INTELLIJ_EDITION)..."

    # Idempotency check
    if snap list 2>/dev/null | grep -q "intellij-idea"; then
        print_info "IntelliJ IDEA already installed"
        return
    fi

    if sudo snap install "$snap_package" --classic; then
        print_status "IntelliJ IDEA ($INTELLIJ_EDITION) installed"
    else
        add_failure "Failed to install IntelliJ IDEA"
    fi
}

install_pycharm() {
    print_section "PyCharm ($PYCHARM_EDITION)"

    local snap_package="pycharm-${PYCHARM_EDITION}"

    if is_dry_run; then
        print_dry_run_header "PYCHARM" "PyCharm ($PYCHARM_EDITION)"
        if snap list 2>/dev/null | grep -q "pycharm"; then
            print_dry_run_status "Already installed"
        else
            print_dry_run_missing "Not installed"
            print_dry_run_action "Would install via snap: $snap_package --classic"
        fi
        return
    fi

    print_info "Installing PyCharm ($PYCHARM_EDITION)..."

    # Idempotency check
    if snap list 2>/dev/null | grep -q "pycharm"; then
        print_info "PyCharm already installed"
        return
    fi

    if sudo snap install "$snap_package" --classic; then
        print_status "PyCharm ($PYCHARM_EDITION) installed"
    else
        add_failure "Failed to install PyCharm"
    fi
}

# ============================================================================
# SECTION 8: BROWSER INSTALLATION
# ============================================================================

install_chrome() {
    print_section "Google Chrome"

    if is_dry_run; then
        print_dry_run_header "CHROME" "Google Chrome"
        if command -v google-chrome &> /dev/null; then
            print_dry_run_status "Already installed: $(google-chrome --version 2>/dev/null)"
        else
            print_dry_run_missing "Not installed"
            print_dry_run_action "Would add Google GPG key"
            print_dry_run_action "Would add Google Chrome repository"
            print_dry_run_action "Would install: google-chrome-stable"
        fi
        return
    fi

    print_info "Installing Google Chrome..."

    # Idempotency check
    if command -v google-chrome &> /dev/null; then
        print_info "Chrome already installed: $(google-chrome --version)"
        return
    fi

    # Download and add Google GPG key
    if wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | sudo gpg --dearmor -o /etc/apt/keyrings/google-chrome.gpg; then
        # Add repository
        echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main" | \
            sudo tee /etc/apt/sources.list.d/google-chrome.list > /dev/null

        # Install
        if sudo apt update && sudo apt install -y google-chrome-stable; then
            print_status "Chrome installed: $(google-chrome --version)"
        else
            add_failure "Failed to install Chrome"
        fi
    else
        add_failure "Failed to add Google GPG key for Chrome"
    fi
}

# ============================================================================
# SECTION 9: CONTAINER & CLOUD TOOLS
# ============================================================================

install_docker() {
    print_section "Docker"

    if is_dry_run; then
        print_dry_run_header "DOCKER" "Docker"
        if command -v docker &> /dev/null; then
            print_dry_run_status "Already installed: $(docker --version 2>/dev/null)"
        else
            print_dry_run_missing "Not installed"
            print_dry_run_action "Would add Docker GPG key"
            print_dry_run_action "Would add Docker repository"
            print_dry_run_action "Would install: docker-ce, docker-ce-cli, containerd.io, docker-buildx-plugin, docker-compose-plugin"
        fi
        print_dry_run_action "Would add user '$ACTUAL_USER' to docker group"
        print_dry_run_action "Would enable: docker.service"
        return
    fi

    print_info "Installing Docker..."

    local docker_installed=false

    # Idempotency check
    if command -v docker &> /dev/null; then
        print_info "Docker already installed: $(docker --version)"
        docker_installed=true
    else
        # Add Docker GPG key
        sudo install -m 0755 -d /etc/apt/keyrings
        if curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg; then
            sudo chmod a+r /etc/apt/keyrings/docker.gpg

            # Add repository
            echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | \
                sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

            # Install Docker
            if sudo apt update && sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin; then
                print_status "Docker installed: $(docker --version)"
                docker_installed=true
            else
                add_failure "Failed to install Docker packages"
            fi
        else
            add_failure "Failed to add Docker GPG key"
        fi
    fi

    # Configure docker group for sudo-less access
    if [ "$docker_installed" = true ]; then
        # Create docker group if it doesn't exist
        if ! getent group docker > /dev/null 2>&1; then
            sudo groupadd docker
            print_info "Created docker group"
        fi

        # Add user to docker group
        if ! groups "$ACTUAL_USER" | grep -q docker; then
            if sudo usermod -aG docker "$ACTUAL_USER"; then
                print_status "User $ACTUAL_USER added to docker group"

                # Add bashrc hook to auto-activate docker group in new shells
                if ! grep -q "Docker group activation" "$ACTUAL_HOME/.bashrc" 2>/dev/null; then
                    cat >> "$ACTUAL_HOME/.bashrc" << EOF

# Docker group activation (added by workspace-setup.sh)
# Auto-activates docker group until next login - can be removed after reboot
if command -v docker &>/dev/null && groups 2>/dev/null | grep -qv "\bdocker\b" && getent group docker | grep -q "\b${ACTUAL_USER}\b"; then
    exec sg docker newgrp "\$(id -gn)"
fi
EOF
                    print_status "Added docker group activation hook to ~/.bashrc"
                fi

                # Restart script with docker group active if not already activated
                if [ "$DOCKER_GROUP_ACTIVATED" != "true" ] && ! groups | grep -q '\bdocker\b'; then
                    print_info "Restarting script to activate docker group..."
                    export DOCKER_GROUP_ACTIVATED=true
                    exec sg docker -c "bash \"$0\" $ORIGINAL_ARGS"
                fi
            else
                add_failure "Failed to add user $ACTUAL_USER to docker group"
            fi
        else
            print_info "User $ACTUAL_USER already in docker group"
        fi

        # Start and enable Docker service
        if sudo systemctl start docker && sudo systemctl enable docker; then
            print_status "Docker service started and enabled"
        else
            add_failure "Failed to start/enable Docker service"
        fi
    fi
}

install_terraform() {
    print_section "Terraform"

    if is_dry_run; then
        print_dry_run_header "TERRAFORM" "Terraform"
        if command -v terraform &> /dev/null; then
            print_dry_run_status "Already installed: $(terraform version 2>/dev/null | head -n1)"
        else
            print_dry_run_missing "Not installed"
            print_dry_run_action "Would add HashiCorp GPG key"
            print_dry_run_action "Would add HashiCorp repository"
            print_dry_run_action "Would install: terraform"
        fi
        return
    fi

    print_info "Installing Terraform..."

    # Idempotency check
    if command -v terraform &> /dev/null; then
        print_info "Terraform already installed: $(terraform version | head -n1)"
        return
    fi

    # Add HashiCorp GPG key
    if wget -O- https://apt.releases.hashicorp.com/gpg | sudo gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg; then
        # Add repository
        echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" | \
            sudo tee /etc/apt/sources.list.d/hashicorp.list > /dev/null

        # Install
        if sudo apt update && sudo apt install -y terraform; then
            print_status "Terraform installed: $(terraform version | head -n1)"
        else
            add_failure "Failed to install Terraform"
        fi
    else
        add_failure "Failed to add HashiCorp GPG key"
    fi
}

install_awscli() {
    print_section "AWS CLI v2"

    if is_dry_run; then
        print_dry_run_header "AWSCLI" "AWS CLI v2"
        if command -v aws &> /dev/null && aws --version 2>/dev/null | grep -q "aws-cli/2"; then
            print_dry_run_status "Already installed: $(aws --version 2>/dev/null)"
        else
            print_dry_run_missing "Not installed (or v1)"
            print_dry_run_action "Would download: awscli-exe-linux-x86_64.zip"
            print_dry_run_action "Would install: AWS CLI v2"
        fi
        return
    fi

    print_info "Installing AWS CLI v2..."

    # Idempotency check (must be v2)
    if command -v aws &> /dev/null && aws --version | grep -q "aws-cli/2"; then
        print_info "AWS CLI v2 already installed: $(aws --version)"
        return
    fi

    # Download and install
    local tmp_dir=$(mktemp -d)
    cd "$tmp_dir"

    if curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"; then
        if unzip -q awscliv2.zip && sudo ./aws/install --update; then
            print_status "AWS CLI v2 installed: $(aws --version)"
        else
            add_failure "Failed to install AWS CLI v2"
        fi
    else
        add_failure "Failed to download AWS CLI v2"
    fi

    cd - > /dev/null
    rm -rf "$tmp_dir"
}

# ============================================================================
# SECTION 10: LOCALSTACK ECOSYSTEM
# ============================================================================

install_localstack() {
    print_section "LocalStack CLI"

    if is_dry_run; then
        print_dry_run_header "LOCALSTACK" "LocalStack CLI"
        if command -v localstack &> /dev/null; then
            print_dry_run_status "Already installed: $(localstack --version 2>/dev/null)"
        else
            print_dry_run_missing "Not installed"
            print_dry_run_action "Would download: v${LOCALSTACK_VERSION}"
            print_dry_run_action "Would install to: /usr/local/bin/localstack"
        fi
        print_dry_run_action "Would create: /etc/systemd/system/localstack.service"
        print_dry_run_action "Would enable: localstack.service"
        return
    fi

    print_info "Installing LocalStack CLI..."

    # Idempotency check
    if command -v localstack &> /dev/null; then
        print_info "LocalStack already installed: $(localstack --version)"
    else
        local tmp_dir=$(mktemp -d)
        cd "$tmp_dir"

        local url="https://github.com/localstack/localstack-cli/releases/download/v${LOCALSTACK_VERSION}/localstack-cli-${LOCALSTACK_VERSION}-linux-amd64-onefile.tar.gz"

        print_info "Downloading LocalStack CLI v${LOCALSTACK_VERSION}..."
        if curl -fsSLo localstack-cli.tar.gz "$url"; then
            if tar -xzf localstack-cli.tar.gz && sudo mv localstack /usr/local/bin/ && sudo chmod +x /usr/local/bin/localstack; then
                print_status "LocalStack CLI installed: $(localstack --version)"
            else
                add_failure "Failed to extract/install LocalStack CLI"
            fi
        else
            add_failure "Failed to download LocalStack CLI"
        fi

        cd - > /dev/null
        rm -rf "$tmp_dir"
    fi

    # Configure LocalStack systemd service
    configure_localstack_service
}

configure_localstack_service() {
    print_info "Configuring LocalStack systemd service..."

    if sudo tee /etc/systemd/system/localstack.service > /dev/null <<EOF
[Unit]
Description=LocalStack - Local AWS Cloud Stack
After=docker.service
Requires=docker.service

[Service]
Type=simple
User=$ACTUAL_USER
Group=docker
Environment="PATH=/usr/local/bin:/usr/bin:/bin"
Environment="HOME=$ACTUAL_HOME"
ExecStart=/usr/local/bin/localstack start
ExecStop=/usr/local/bin/localstack stop
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
    then
        if ! sudo systemctl daemon-reload; then
            add_failure "Failed to reload systemd daemon"
            return
        fi

        if ! sudo systemctl enable localstack.service; then
            add_failure "Failed to enable LocalStack service"
            return
        fi

        if ! sudo systemctl start localstack.service; then
            add_failure "Failed to start LocalStack service"
            return
        fi

        print_status "LocalStack service started and enabled (starts on boot)"
    else
        add_failure "Failed to create LocalStack systemd service"
    fi
}

install_tflocal() {
    print_section "tflocal (terraform-local)"

    if is_dry_run; then
        print_dry_run_header "TFLOCAL" "tflocal (terraform-local)"
        if command -v tflocal &> /dev/null || [ -f "$ACTUAL_HOME/.local/bin/tflocal" ]; then
            print_dry_run_status "Already installed"
        else
            print_dry_run_missing "Not installed"
            print_dry_run_action "Would install: terraform-local (via pip3)"
            print_dry_run_action "Would update PATH in ~/.bashrc"
        fi
        return
    fi

    print_info "Installing tflocal..."

    # Idempotency check
    if command -v tflocal &> /dev/null || [ -f "$ACTUAL_HOME/.local/bin/tflocal" ]; then
        print_info "tflocal already installed"
        return
    fi

    if pip3 install --user terraform-local; then
        # Add ~/.local/bin to PATH if not already there
        if [[ ":$PATH:" != *":$ACTUAL_HOME/.local/bin:"* ]]; then
            echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$ACTUAL_HOME/.bashrc"
            export PATH="$ACTUAL_HOME/.local/bin:$PATH"
            print_info "Added ~/.local/bin to PATH in ~/.bashrc"
        fi
        print_status "tflocal installed"
    else
        add_failure "Failed to install tflocal"
    fi
}

install_awslocal() {
    print_section "awslocal (awscli-local)"

    if is_dry_run; then
        print_dry_run_header "AWSLOCAL" "awslocal (awscli-local)"
        if command -v awslocal &> /dev/null || [ -f "$ACTUAL_HOME/.local/bin/awslocal" ]; then
            print_dry_run_status "Already installed"
        else
            print_dry_run_missing "Not installed"
            print_dry_run_action "Would install: awscli-local (via pip3)"
        fi
        return
    fi

    print_info "Installing awslocal..."

    # Idempotency check
    if command -v awslocal &> /dev/null || [ -f "$ACTUAL_HOME/.local/bin/awslocal" ]; then
        print_info "awslocal already installed"
        return
    fi

    if pip3 install --user awscli-local; then
        print_status "awslocal installed"
    else
        add_failure "Failed to install awslocal"
    fi
}

# ============================================================================
# SECTION 11: DATABASE TOOLS
# ============================================================================

install_mongodb() {
    print_section "MongoDB"

    if is_dry_run; then
        print_dry_run_header "MONGODB" "MongoDB"
        if command -v mongod &> /dev/null; then
            print_dry_run_status "Already installed: $(mongod --version 2>/dev/null | grep 'db version' | head -n1)"
        else
            print_dry_run_missing "Not installed"
            print_dry_run_action "Would add MongoDB GPG key"
            print_dry_run_action "Would add MongoDB ${MONGODB_VERSION} repository"
            print_dry_run_action "Would install: mongodb-org"
        fi
        print_dry_run_action "Would enable: mongod.service"
        return
    fi

    print_info "Installing MongoDB..."

    # Idempotency check
    if command -v mongod &> /dev/null; then
        print_info "MongoDB already installed: $(mongod --version | grep 'db version')"

        # Ensure service is running
        if ! sudo systemctl is-active --quiet mongod; then
            print_info "Starting MongoDB service..."
            sudo systemctl start mongod && sudo systemctl enable mongod
        fi
        return
    fi

    # Add MongoDB GPG key
    if curl -fsSL https://www.mongodb.org/static/pgp/server-${MONGODB_VERSION}.asc | \
       sudo gpg -o /usr/share/keyrings/mongodb-server-${MONGODB_VERSION}.gpg --dearmor; then

        # Add repository
        echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-${MONGODB_VERSION}.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/${MONGODB_VERSION} multiverse" | \
            sudo tee /etc/apt/sources.list.d/mongodb-org-${MONGODB_VERSION}.list > /dev/null

        # Install
        if sudo apt update && sudo apt install -y mongodb-org; then
            print_status "MongoDB installed: $(mongod --version | grep 'db version')"

            # Start and enable service
            if sudo systemctl start mongod && sudo systemctl enable mongod; then
                print_status "MongoDB service started and enabled"
                print_info "MongoDB is accessible at: mongodb://localhost:27017"
            else
                add_failure "Failed to start/enable MongoDB service"
            fi
        else
            add_failure "Failed to install MongoDB"
        fi
    else
        add_failure "Failed to add MongoDB GPG key"
    fi
}

configure_mongodb_bind() {
    print_section "MongoDB Network Configuration"

    local config_file="/etc/mongod.conf"

    if is_dry_run; then
        print_dry_run_header "MONGODB-NET" "MongoDB Network Configuration"
        if [ -f "$config_file" ]; then
            print_dry_run_status "Config file exists: $config_file"
        else
            print_dry_run_skip "Config file not found (MongoDB not installed?)"
        fi
        print_dry_run_action "Would backup: ${config_file}.backup"
        print_dry_run_action "Would update bindIp from 127.0.0.1 to 0.0.0.0"
        print_dry_run_action "Would restart: mongod.service"
        return
    fi

    print_info "Configuring MongoDB to bind to 0.0.0.0..."

    # Check if config file exists
    if [ ! -f "$config_file" ]; then
        print_info "MongoDB config file not found - skipping bind configuration"
        return
    fi

    # Backup the original config
    if [ ! -f "${config_file}.backup" ]; then
        if sudo cp "$config_file" "${config_file}.backup"; then
            print_status "Backed up MongoDB config to ${config_file}.backup"
        else
            add_failure "Failed to backup MongoDB config"
            return
        fi
    else
        print_info "Backup already exists: ${config_file}.backup"
    fi

    # Update bindIp from 127.0.0.1 to 0.0.0.0
    if sudo sed -i 's/bindIp: 127\.0\.0\.1/bindIp: 0.0.0.0/' "$config_file"; then
        print_status "Updated MongoDB bindIp to 0.0.0.0"

        # Restart MongoDB to apply changes
        if sudo systemctl restart mongod; then
            print_status "MongoDB service restarted with new configuration"
            print_info "MongoDB is now accessible from all network interfaces"
            print_info "WARNING: Ensure firewall rules are configured appropriately"
        else
            add_failure "Failed to restart MongoDB after config change"
        fi
    else
        add_failure "Failed to update MongoDB bindIp configuration"
    fi
}

install_mongodb_compass() {
    print_section "MongoDB Compass"

    if is_dry_run; then
        print_dry_run_header "COMPASS" "MongoDB Compass"
        if dpkg -l 2>/dev/null | grep -q mongodb-compass; then
            print_dry_run_status "Already installed"
        else
            print_dry_run_missing "Not installed"
            print_dry_run_action "Would download: mongodb-compass_${COMPASS_VERSION}_amd64.deb"
            print_dry_run_action "Would install: MongoDB Compass"
        fi
        return
    fi

    print_info "Installing MongoDB Compass..."

    # Idempotency check
    if dpkg -l 2>/dev/null | grep -q mongodb-compass; then
        print_info "MongoDB Compass already installed"
        return
    fi

    local tmp_dir=$(mktemp -d)
    cd "$tmp_dir"

    local compass_url="https://downloads.mongodb.com/compass/mongodb-compass_${COMPASS_VERSION}_amd64.deb"

    if wget -q "$compass_url" -O mongodb-compass.deb; then
        if sudo apt install -y ./mongodb-compass.deb; then
            print_status "MongoDB Compass installed"
            print_info "Connect to MongoDB with: mongodb://localhost:27017"
        else
            add_failure "Failed to install MongoDB Compass"
        fi
    else
        add_failure "Failed to download MongoDB Compass"
    fi

    cd - > /dev/null
    rm -rf "$tmp_dir"
}

# ============================================================================
# SECTION 12: RUNTIMES
# ============================================================================

install_nodejs() {
    print_section "Node.js 22"

    if is_dry_run; then
        print_dry_run_header "NODEJS" "Node.js 22"
        if command -v node &> /dev/null && node --version 2>/dev/null | grep -q "^v22\."; then
            print_dry_run_status "Already installed: $(node --version 2>/dev/null)"
            if command -v npm &> /dev/null; then
                print_dry_run_status "npm: $(npm --version 2>/dev/null)"
            fi
        else
            print_dry_run_missing "Not installed (or wrong version)"
            print_dry_run_action "Would add NodeSource repository"
            print_dry_run_action "Would install: nodejs 22.x"
        fi
        return
    fi

    print_info "Installing Node.js 22..."

    # Idempotency check (must be v22)
    if command -v node &> /dev/null && node --version | grep -q "^v22\."; then
        print_info "Node.js 22 already installed: $(node --version)"
        return
    fi

    # Add NodeSource repository
    if curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -; then
        # Try to install with force-overwrite to handle conflicts
        if ! sudo apt install -y nodejs -o Dpkg::Options::="--force-overwrite"; then
            print_info "Removing conflicting packages..."
            sudo apt remove -y libnode-dev libnode72 nodejs-doc 2>/dev/null
            sudo apt autoremove -y

            if ! sudo apt install -y nodejs; then
                add_failure "Failed to install Node.js"
                return
            fi
        fi

        print_status "Node.js installed: $(node --version)"
        if command -v npm &> /dev/null; then
            print_status "npm installed: $(npm --version)"
        fi
    else
        add_failure "Failed to add NodeSource repository"
    fi
}

install_python314() {
    print_section "Python 3.14"

    if is_dry_run; then
        print_dry_run_header "PYTHON" "Python 3.14"
        if command -v python3.14 &> /dev/null; then
            print_dry_run_status "Already installed: $(python3.14 --version 2>/dev/null)"
        else
            print_dry_run_missing "Not installed"
            print_dry_run_action "Would add PPA: ppa:deadsnakes/ppa"
            print_dry_run_action "Would install: python3.14, python3.14-venv, python3.14-dev"
        fi
        return
    fi

    print_info "Installing Python 3.14..."

    # Idempotency check
    if command -v python3.14 &> /dev/null; then
        print_info "Python 3.14 already installed: $(python3.14 --version)"
        return
    fi

    # Add deadsnakes PPA
    if sudo add-apt-repository -y ppa:deadsnakes/ppa; then
        if sudo apt update && sudo apt install -y python3.14 python3.14-venv python3.14-dev; then
            print_status "Python 3.14 installed: $(python3.14 --version)"
        else
            add_failure "Failed to install Python 3.14"
        fi
    else
        add_failure "Failed to add deadsnakes PPA"
    fi
}

# ============================================================================
# SECTION 13: DNSMASQ CONFIGURATION (OPTIONAL)
# ============================================================================

configure_dnsmasq() {
    if [ "$INSTALL_DNSMASQ" != true ]; then
        return
    fi

    print_section "dnsmasq Configuration"

    if is_dry_run; then
        print_dry_run_header "DNSMASQ" "dnsmasq for LocalStack DNS"
        if command -v dnsmasq &> /dev/null; then
            print_dry_run_status "Already installed: $(dnsmasq --version 2>&1 | head -n1)"
        else
            print_dry_run_missing "Not installed"
        fi
        print_dry_run_action "Would configure dnsmasq for LocalStack DNS"
        print_dry_run_action "Would create: /etc/dnsmasq.d/localstack.conf"
        print_dry_run_action "Would handle port 53 conflict with systemd-resolved if needed"
        print_dry_run_action "Would enable: dnsmasq.service"
        return
    fi

    print_info "Configuring dnsmasq for LocalStack DNS..."

    # Check if port 53 is in use (likely by systemd-resolved)
    local port_53_in_use=false
    if sudo lsof -i :53 -sTCP:LISTEN -t >/dev/null 2>&1 || sudo netstat -tuln 2>/dev/null | grep -q ":53 "; then
        port_53_in_use=true
        print_info "Port 53 is in use"
    fi

    # Detect systemd-resolved conflict
    local resolved_conflict=false
    if systemctl is-active --quiet systemd-resolved && [ "$port_53_in_use" = true ]; then
        resolved_conflict=true
        print_info "Detected systemd-resolved running on port 53"
    fi

    if [ "$resolved_conflict" = true ]; then
        print_info "Configuring systemd-resolved to release port 53..."

        sudo mkdir -p /etc/systemd/resolved.conf.d

        if sudo tee /etc/systemd/resolved.conf.d/localstack.conf > /dev/null <<'EOF'
[Resolve]
DNSStubListener=no
DNS=8.8.8.8 8.8.4.4
Domains=~.
EOF
        then
            if sudo systemctl restart systemd-resolved; then
                print_status "systemd-resolved reconfigured"
                sleep 2
            else
                add_failure "Failed to restart systemd-resolved"
                return
            fi
        else
            add_failure "Failed to configure systemd-resolved"
            return
        fi
    fi

    # Configure dnsmasq
    if [ -f /etc/dnsmasq.conf ]; then
        sudo cp /etc/dnsmasq.conf /etc/dnsmasq.conf.backup
        print_info "Backed up original dnsmasq.conf"
    fi

    if sudo tee /etc/dnsmasq.d/localstack.conf > /dev/null <<'EOF'
# LocalStack DNS configuration
address=/localhost.localstack.cloud/127.0.0.1

# Upstream DNS servers
server=8.8.8.8
server=8.8.4.4

# Don't read /etc/resolv.conf
no-resolv

# Never forward plain names
domain-needed

# Never forward non-routed addresses
bogus-priv

# Listen on localhost only
listen-address=127.0.0.1
bind-interfaces

# Cache settings
cache-size=1000
EOF
    then
        if sudo systemctl restart dnsmasq && sudo systemctl enable dnsmasq; then
            if sudo systemctl is-active --quiet dnsmasq; then
                print_status "dnsmasq configured and running"
                print_info "*.localhost.localstack.cloud now resolves to 127.0.0.1"
            else
                add_failure "dnsmasq failed to start (check: sudo journalctl -u dnsmasq -n 50)"
            fi
        else
            add_failure "Failed to restart/enable dnsmasq"
        fi
    else
        add_failure "Failed to configure dnsmasq"
    fi
}

# ============================================================================
# SECTION 14: VERIFICATION
# ============================================================================

run_verification() {
    print_section "Installation Verification"

    if is_dry_run; then
        print_info "Skipping verification in dry-run mode"
        return
    fi

    echo ""
    echo "Checking installed tools:"
    echo ""

    # IDEs and Browser
    verify_tool "VS Code" "code --version" "head -n1"
    verify_snap "IntelliJ IDEA" "intellij-idea"
    verify_snap "PyCharm" "pycharm"
    verify_tool "Google Chrome" "google-chrome --version"

    # Container & Cloud
    verify_tool "Docker" "docker --version"
    verify_tool "Terraform" "terraform version" "head -n1"
    verify_tool "AWS CLI" "aws --version"

    # LocalStack
    verify_tool "LocalStack" "localstack --version"
    verify_tool_path "tflocal" "$ACTUAL_HOME/.local/bin/tflocal"
    verify_tool_path "awslocal" "$ACTUAL_HOME/.local/bin/awslocal"

    # Database
    verify_tool "MongoDB" "mongod --version" "grep 'db version'"
    verify_dpkg "MongoDB Compass" "mongodb-compass"

    # Runtimes
    verify_tool "Node.js" "node --version"
    verify_tool "npm" "npm --version"
    verify_tool "Python 3.14" "python3.14 --version"

    # Utilities
    verify_tool "jq" "jq --version"

    # Optional
    if [ "$INSTALL_DNSMASQ" = true ]; then
        verify_tool "dnsmasq" "dnsmasq --version" "head -n1"
    fi

    echo ""
    echo "Checking services:"
    echo ""

    verify_service "docker"
    verify_service "mongod"
    verify_service_enabled "localstack"

    if [ "$INSTALL_DNSMASQ" = true ]; then
        verify_service "dnsmasq"
    fi
}

verify_tool() {
    local name="$1"
    local cmd="$2"
    local filter="${3:-cat}"

    if eval "$cmd" &>/dev/null; then
        local version=$(eval "$cmd" 2>/dev/null | eval "$filter")
        echo -e "  ${GREEN}✓${NC} $name: $version"
    else
        echo -e "  ${RED}✗${NC} $name: NOT INSTALLED"
    fi
}

verify_snap() {
    local name="$1"
    local pattern="$2"

    if snap list 2>/dev/null | grep -q "$pattern"; then
        echo -e "  ${GREEN}✓${NC} $name: installed (snap)"
    else
        echo -e "  ${RED}✗${NC} $name: NOT INSTALLED"
    fi
}

verify_dpkg() {
    local name="$1"
    local pattern="$2"

    if dpkg -l 2>/dev/null | grep -q "$pattern"; then
        echo -e "  ${GREEN}✓${NC} $name: installed"
    else
        echo -e "  ${RED}✗${NC} $name: NOT INSTALLED"
    fi
}

verify_tool_path() {
    local name="$1"
    local path="$2"

    if command -v "$name" &>/dev/null || [ -f "$path" ]; then
        echo -e "  ${GREEN}✓${NC} $name: installed"
    else
        echo -e "  ${RED}✗${NC} $name: NOT INSTALLED"
    fi
}

verify_service() {
    local service="$1"

    if sudo systemctl is-active --quiet "$service"; then
        echo -e "  ${GREEN}✓${NC} $service: running"
    else
        echo -e "  ${YELLOW}○${NC} $service: not running"
    fi
}

verify_service_enabled() {
    local service="$1"

    if sudo systemctl is-enabled --quiet "$service" 2>/dev/null; then
        echo -e "  ${GREEN}✓${NC} $service: enabled (starts on boot)"
    else
        echo -e "  ${YELLOW}○${NC} $service: not enabled"
    fi
}

# ============================================================================
# SECTION 15: HEALTH CHECK SCRIPT GENERATION
# ============================================================================

generate_health_check_script() {
    if is_dry_run; then
        return
    fi

    local script_dir="$ACTUAL_HOME/.local/bin"
    local script_path="$script_dir/workspace-health-check"

    mkdir -p "$script_dir"

    cat > "$script_path" << 'HEALTH_EOF'
#!/bin/bash
# Workspace Health Check Script
# Run this anytime to verify your development environment

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo ""
echo "Developer Workstation Health Check"
echo "==================================="
echo ""

echo "Services:"
systemctl is-active --quiet docker && echo -e "  ${GREEN}✓${NC} Docker: running" || echo -e "  ${RED}✗${NC} Docker: not running"
systemctl is-active --quiet mongod && echo -e "  ${GREEN}✓${NC} MongoDB: running" || echo -e "  ${RED}✗${NC} MongoDB: not running"
curl -s http://localhost:4566/_localstack/health &>/dev/null && echo -e "  ${GREEN}✓${NC} LocalStack: running" || echo -e "  ${YELLOW}○${NC} LocalStack: not running"

echo ""
echo "Tool Versions:"
command -v node &>/dev/null && echo "  Node.js: $(node --version)"
command -v python3.14 &>/dev/null && echo "  Python: $(python3.14 --version 2>&1)"
command -v docker &>/dev/null && echo "  Docker: $(docker --version)"
command -v terraform &>/dev/null && echo "  Terraform: $(terraform version | head -n1)"
command -v aws &>/dev/null && echo "  AWS CLI: $(aws --version 2>&1)"
command -v localstack &>/dev/null && echo "  LocalStack: $(localstack --version 2>&1)"
command -v jq &>/dev/null && echo "  jq: $(jq --version 2>&1)"

echo ""
echo "Docker Access:"
if docker ps &>/dev/null; then
    echo -e "  ${GREEN}✓${NC} Docker works without sudo"
else
    echo -e "  ${YELLOW}○${NC} Docker requires sudo (try logging out and back in)"
fi

echo ""
HEALTH_EOF

    chmod +x "$script_path"

    # Ensure ~/.local/bin is in PATH
    if [[ ":$PATH:" != *":$script_dir:"* ]]; then
        if ! grep -q 'export PATH="$HOME/.local/bin:$PATH"' "$ACTUAL_HOME/.bashrc"; then
            echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$ACTUAL_HOME/.bashrc"
        fi
    fi

    print_status "Health check script created: $script_path"
    print_info "Run 'workspace-health-check' anytime to verify your setup"
}

# ============================================================================
# SECTION 16: SUMMARY AND NEW USER TIPS
# ============================================================================

print_summary() {
    print_section "Installation Summary"

    if is_dry_run; then
        echo ""
        echo -e "${YELLOW}DRY RUN COMPLETE${NC} - No changes were made"
        echo ""
        echo "Run without -n flag to perform the actual installation:"
        echo "  ./workspace-setup.sh"
        echo ""
        return
    fi

    echo ""
    if [ ${#FAILURES[@]} -eq 0 ]; then
        echo -e "${GREEN}Installation complete - ALL COMPONENTS SUCCESSFUL!${NC}"
    else
        echo -e "${RED}Installation complete with ${#FAILURES[@]} failure(s)${NC}"
    fi
    echo ""

    # List failures if any
    if [ ${#FAILURES[@]} -gt 0 ]; then
        echo "FAILURES:"
        for failure in "${FAILURES[@]}"; do
            echo -e "  ${RED}✗${NC} $failure"
        done
        echo ""
    fi

    # Important next steps
    echo -e "${YELLOW}NEXT STEPS:${NC}"
    echo ""
    echo "Congrats! You are done setting up your machine for this workshop!"
    echo ""
    echo "If you encountered any errors: Please report the errors to your"
    echo "workshop instructor now or run this script again"
    echo ""
    echo "Once you are done capturing the connection details below feel free"
    echo "to close this terminal window and start your IDE of choice."
    echo ""
    echo "VS Code, PyCharm, and IntelliJ are all available from the apps menu"
    echo "(the icon with 9 dots in the bottom of your screen)"
    echo ""
    echo ""


    # Connection info
    echo "CONNECTION INFO:"
    echo "  • MongoDB: mongodb://localhost:27017"
    echo "  • LocalStack: http://localhost:4566"
    echo ""
}

print_new_user_tips() {
    if is_dry_run; then
        return
    fi

    print_section "Tips for New Ubuntu Users"

    echo "USEFUL KEYBOARD SHORTCUTS:"
    echo "  • Show all apps: Super key (Windows key or CMD key)"
    echo "  • Switch windows: Alt+Tab"
    echo "  • Close window: Alt+F4"
    echo ""
    echo "WHERE TO GET HELP:"
    echo "  • Ubuntu docs: https://help.ubuntu.com/"
    echo "  • Ask Ubuntu: https://askubuntu.com/"
    echo "  • Docker docs: https://docs.docker.com/"
    echo "  • LocalStack docs: https://docs.localstack.cloud/"
    echo ""
}

# ============================================================================
# MAIN EXECUTION
# ============================================================================

main() {
    echo ""
    echo "============================================"
    echo "Ubuntu 22.04 Developer Workstation Setup"
    echo "============================================"
    echo ""

    if is_dry_run; then
        echo -e "${YELLOW}DRY RUN MODE${NC} - No changes will be made"
        echo ""
    fi

    echo "User: $ACTUAL_USER"
    echo "Home: $ACTUAL_HOME"
    echo "IntelliJ Edition: $INTELLIJ_EDITION"
    echo "PyCharm Edition: $PYCHARM_EDITION"
    echo "Install dnsmasq: $INSTALL_DNSMASQ"
    echo ""

    # Setup logging (skip for dry run)
    if ! is_dry_run; then
        setup_logging
        rotate_logs
    fi

    # Pre-flight checks
    run_preflight_checks

    # Install everything
    install_prerequisites
    install_vscode
    install_intellij
    install_pycharm
    install_chrome
    install_docker
    install_terraform
    install_awscli
    install_localstack
    install_tflocal
    install_awslocal
    install_mongodb
    configure_mongodb_bind
    install_mongodb_compass
    install_nodejs
    install_python314
    configure_dnsmasq

    # Verification and summary
    run_verification
    generate_health_check_script
    print_summary
    # print_new_user_tips

    # Exit with appropriate code
    if [ ${#FAILURES[@]} -gt 0 ]; then
        exit 1
    else
        exit 0
    fi
}

# Run main function
main
