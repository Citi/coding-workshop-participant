#!/usr/bin/env bash

# ===============================================
# Ubuntu 22.04 Developer Workstation Setup Script
# ===============================================

set +e

# ============================================================================
# CONFIGURATION
# ============================================================================

PYENV_VERSION="3.13"
JAVA_VERSION="21"
NODEJS_VERSION="22"
LOCALSTACK_VERSION="2026.6.0"
JUPYTER_PORT="${JUPYTER_PORT:-8888}"
POSTGRES_VERSION="16"
POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_PASS="${POSTGRES_PASS:-postgres123}"
MONGODB_VERSION="7.0"
COMPASS_VERSION="1.43.0"
MONGO_USER="${MONGO_USER:-mongo}"
MONGO_PASS="${MONGO_PASS:-mongo123}"
SPARK_VERSION="4.1.2"
TRINO_VERSION="476"

# Retry configuration
MAX_RETRIES=3
RETRY_DELAY=5

# Command-line arguments
DRY_RUN=false
INSTALL_DNSMASQ=false
INTELLIJ_EDITION="community"
PYCHARM_EDITION="community"
DOCKER_GROUP_ACTIVATED=${DOCKER_GROUP_ACTIVATED:-false}

# Track failures
declare -a FAILURES=()

# Get actual user
ACTUAL_USER="${SUDO_USER:-$(whoami)}"
ACTUAL_HOME=$(eval echo ~$ACTUAL_USER)

# Logging
LOG_DIR="$ACTUAL_HOME/.local/share/workspace-setup"
LOG_FILE="$LOG_DIR/setup-$(date +%Y%m%d-%H%M%S).log"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

print_status() { echo -e "${GREEN}[✓]${NC} $1"; }
print_error() { echo -e "${RED}[✗]${NC} $1"; }
print_info() { echo -e "${YELLOW}[i]${NC} $1"; }
print_section() {
    echo ""
    echo -e "${BLUE}============================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}============================================${NC}"
}

add_failure() {
    FAILURES+=("$1")
    print_error "$1"
}

is_dry_run() { [ "$DRY_RUN" = true ]; }

# Check if command exists
command_exists() {
    command -v "$1" &> /dev/null
}

# Check if file exists and is executable
is_executable() {
    [ -f "$1" ] && [ -x "$1" ]
}

# Retry function with exponential backoff
retry_command() {
    local max_attempts="$1"
    shift
    local cmd="$@"
    local attempt=1

    while [ $attempt -le $max_attempts ]; do
        if eval "$cmd"; then
            return 0
        fi

        if [ $attempt -lt $max_attempts ]; then
            local wait_time=$((RETRY_DELAY * attempt))
            print_info "Attempt $attempt failed. Retrying in ${wait_time}s..."
            sleep $wait_time
        fi
        ((attempt++))
    done

    return 1
}

# Wait for APT lock
wait_for_apt_lock() {
    local max_wait=60
    local waited=0

    while fuser /var/lib/dpkg/lock-frontend >/dev/null 2>&1 || \
          fuser /var/lib/apt/lists/lock >/dev/null 2>&1; do
        if [ $waited -ge $max_wait ]; then
            print_error "APT lock held for too long"
            return 1
        fi
        if [ $waited -eq 0 ]; then
            print_info "Waiting for package manager..."
        fi
        sleep 5
        ((waited+=5))
    done
    return 0
}

# Safe apt install with retries
safe_apt_install() {
    wait_for_apt_lock || return 1
    retry_command $MAX_RETRIES sudo apt install -y "$@"
}

# Check if package is installed
is_package_installed() {
    dpkg -l "$1" 2>/dev/null | grep -q "^ii"
}

# Check if snap package is installed
is_snap_installed() {
    snap list 2>/dev/null | grep -q "^$1"
}

# Setup logging
setup_logging() {
    mkdir -p "$LOG_DIR"
    exec > >(tee -a "$LOG_FILE") 2>&1
    print_info "Logging to: $LOG_FILE"

    # Rotate old logs (keep last 5)
    ls -t "$LOG_DIR"/setup-*.log 2>/dev/null | tail -n +6 | xargs -r rm
}

# ============================================================================
# INSTALLATION FUNCTIONS
# ============================================================================

install_prerequisites() {
    print_section "System Prerequisites"

    if is_dry_run; then
        print_info "[DRY RUN] Would install: ca-certificates curl python3-pip gnupg lsb-release apt-transport-https software-properties-common unzip wget jq"
        return
    fi

    local packages="ca-certificates curl python3-pip gnupg lsb-release apt-transport-https software-properties-common unzip wget jq"
    [ "$INSTALL_DNSMASQ" = true ] && packages="$packages dnsmasq"

    print_info "Updating system and installing prerequisites..."
    if retry_command $MAX_RETRIES "sudo apt update && sudo apt install -y $packages"; then
        print_status "Prerequisites installed"
    else
        add_failure "Failed to install system prerequisites"
    fi
}

install_python() {
    local version="$1"
    local binary_name="python$version"

    print_section "Python $version"

    if is_dry_run; then
        command_exists "$binary_name" && print_status "Already installed" || print_info "Would install $binary_name"
        return
    fi

    # Idempotency check
    if command_exists "$binary_name"; then
        print_info "Python $version already installed: $("$binary_name" --version)"
        return
    fi

    print_info "Installing Python $version..."

    # Ensure software-properties-common is installed
    safe_apt_install software-properties-common || { add_failure "Failed to install software-properties-common"; return; }

    sleep 2

    # Clean up any malformed PPA sources
    sudo rm -f /etc/apt/sources.list.d/deadsnakes* 2>/dev/null || true

    # Add deadsnakes PPA (with fallback to manual method)
    if ! sudo add-apt-repository -y ppa:deadsnakes/ppa 2>/dev/null; then
        print_info "Using manual PPA method..."
        local ubuntu_codename=$(lsb_release -cs)
        sudo rm -f /etc/apt/sources.list.d/deadsnakes.list 2>/dev/null
        echo "deb https://ppa.launchpadcontent.net/deadsnakes/ppa/ubuntu $ubuntu_codename main" | sudo tee /etc/apt/sources.list.d/deadsnakes.list > /dev/null
        sudo apt-key adv --keyserver keyserver.ubuntu.com --recv-keys F23C5A6CF475977595C89F51BA6932366A755776 2>/dev/null || true
    fi

    # Update and install
    if sudo apt update && safe_apt_install "$binary_name" "$binary_name-venv" "$binary_name-dev"; then
        print_status "Python $version installed: $("$binary_name" --version)"

        # Ensure pip is working
        if ! "$binary_name" -m pip --version &>/dev/null; then
            print_info "Installing pip for $binary_name..."
            wget -q https://bootstrap.pypa.io/get-pip.py -O /tmp/get-pip.py 2>/dev/null || true
            if [ -f /tmp/get-pip.py ]; then
                "$binary_name" /tmp/get-pip.py --user 2>/dev/null || true
                rm -f /tmp/get-pip.py
            fi
        fi

        # Install setuptools and wheel for Python 3.12+
        if "$binary_name" -m pip --version &>/dev/null; then
            "$binary_name" -m pip install --user --upgrade setuptools wheel 2>/dev/null || true
            print_status "pip is available for $binary_name"
        fi
    else
        add_failure "Failed to install Python $version"
    fi
}

configure_python() {
    local default_version="${1:-$PYENV_VERSION}"
    local default_binary="python${default_version}"

    print_section "Python Configuration (default: $default_version)"

    if is_dry_run; then
        print_info "[DRY RUN] Would set $default_binary as python and python3"
        return
    fi

    if ! command_exists "$default_binary"; then
        add_failure "Python $default_version not found"
        return
    fi

    print_info "Configuring Python $default_version as default..."

    # Remove existing alternatives
    sudo update-alternatives --remove-all python 2>/dev/null || true
    sudo update-alternatives --remove-all python3 2>/dev/null || true

    # Set up alternatives
    if sudo update-alternatives --install /usr/bin/python python /usr/bin/"$default_binary" 100 && \
       sudo update-alternatives --set python /usr/bin/"$default_binary" 2>/dev/null && \
       sudo update-alternatives --install /usr/bin/python3 python3 /usr/bin/"$default_binary" 100 && \
       sudo update-alternatives --set python3 /usr/bin/"$default_binary" 2>/dev/null; then
        print_status "Set 'python' and 'python3' -> $default_binary"
    else
        add_failure "Failed to set up python alternatives"
        return
    fi

    # Fix command-not-found apt_pkg issue
    if [ -f /usr/lib/cnf-update-db ]; then
        print_info "Fixing command-not-found compatibility..."
        sudo rm -f /etc/apt/apt.conf.d/50command-not-found 2>/dev/null || true
        sudo apt install -y --reinstall python3-apt 2>/dev/null || true
        sudo apt install -y --reinstall command-not-found 2>/dev/null || true
        print_status "Fixed command-not-found compatibility"
    fi

    print_status "Python $default_version configured"
    print_info "Current: $(python --version 2>&1)"
}

install_nodejs() {
    print_section "Node.js $NODEJS_VERSION"

    if is_dry_run; then
        command_exists node && node --version | grep -q "^v$NODEJS_VERSION\." && print_status "Already installed" || print_info "Would install Node.js $NODEJS_VERSION"
        return
    fi

    if command_exists node && node --version | grep -q "^v$NODEJS_VERSION\."; then
        print_info "Node.js $NODEJS_VERSION already installed: $(node --version)"
        return
    fi

    print_info "Installing Node.js $NODEJS_VERSION..."
    if curl -fsSL https://deb.nodesource.com/setup_$NODEJS_VERSION.x | sudo -E bash - && \
       safe_apt_install nodejs -o Dpkg::Options::="--force-overwrite"; then
        print_status "Node.js installed: $(node --version)"
    else
        add_failure "Failed to install Node.js"
    fi
}

install_vscode() {
    print_section "Visual Studio Code"

    if is_dry_run; then
        command_exists code && print_status "Already installed" || print_info "Would install VS Code"
        return
    fi

    if command_exists code; then
        print_info "VS Code already installed: $(code --version | head -n1)"
        return
    fi

    print_info "Installing Visual Studio Code..."
    if wget -qO- https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor --yes > /tmp/packages.microsoft.gpg && \
       sudo install -D -o root -g root -m 644 /tmp/packages.microsoft.gpg /etc/apt/keyrings/packages.microsoft.gpg && \
       rm /tmp/packages.microsoft.gpg && \
       echo "deb [arch=amd64,arm64,armhf signed-by=/etc/apt/keyrings/packages.microsoft.gpg] https://packages.microsoft.com/repos/code stable main" | \
           sudo tee /etc/apt/sources.list.d/vscode.list > /dev/null && \
       sudo apt update && safe_apt_install code; then
        print_status "VS Code installed: $(code --version | head -n1)"
    else
        add_failure "Failed to install VS Code"
    fi
}

install_intellij() {
    print_section "IntelliJ IDEA ($INTELLIJ_EDITION)"

    if is_dry_run; then
        is_snap_installed "intellij-idea" && print_status "Already installed" || print_info "Would install IntelliJ IDEA $INTELLIJ_EDITION"
        return
    fi

    if is_snap_installed "intellij-idea"; then
        print_info "IntelliJ IDEA already installed"
        return
    fi

    print_info "Installing IntelliJ IDEA ($INTELLIJ_EDITION)..."
    local snap_package="intellij-idea-${INTELLIJ_EDITION}"

    if sudo snap install "$snap_package" --classic; then
        print_status "IntelliJ IDEA ($INTELLIJ_EDITION) installed"
    else
        add_failure "Failed to install IntelliJ IDEA"
    fi
}

install_pycharm() {
    print_section "PyCharm ($PYCHARM_EDITION)"

    if is_dry_run; then
        is_snap_installed "pycharm" && print_status "Already installed" || print_info "Would install PyCharm $PYCHARM_EDITION"
        return
    fi

    if is_snap_installed "pycharm"; then
        print_info "PyCharm already installed"
        return
    fi

    print_info "Installing PyCharm ($PYCHARM_EDITION)..."
    local snap_package="pycharm-${PYCHARM_EDITION}"

    if sudo snap install "$snap_package" --classic; then
        print_status "PyCharm ($PYCHARM_EDITION) installed"
    else
        add_failure "Failed to install PyCharm"
    fi
}

install_docker() {
    print_section "Docker"

    if is_dry_run; then
        command_exists docker && print_status "Already installed" || print_info "Would install Docker"
        return
    fi

    if command_exists docker; then
        print_info "Docker already installed: $(docker --version)"

        # Ensure service is running and enabled
        if ! sudo systemctl is-active --quiet docker; then
            print_info "Starting Docker service..."
            sudo systemctl start docker && sudo systemctl enable docker
        fi

        # Ensure docker socket exists
        if [ ! -S /var/run/docker.sock ]; then
            print_info "Docker socket not found, restarting Docker..."
            sudo systemctl restart docker
            sleep 2
        fi

        # Fix socket permissions for immediate access
        if [ -S /var/run/docker.sock ]; then
            sudo chmod 666 /var/run/docker.sock
            print_status "Docker socket permissions updated for immediate access"
        fi

        # Add user to docker group if not already
        if ! groups "$ACTUAL_USER" | grep -q docker; then
            print_info "Adding user $ACTUAL_USER to docker group..."
            sudo usermod -aG docker "$ACTUAL_USER"
            print_info "Docker group added (requires logout/login for permanent access)"
        fi

        return
    fi

    print_info "Installing Docker..."

    # Remove old Docker packages if they exist
    sudo apt remove -y docker docker-engine docker.io containerd runc 2>/dev/null || true

    # Install prerequisites
    if ! safe_apt_install ca-certificates curl gnupg lsb-release; then
        add_failure "Failed to install Docker prerequisites"
        return
    fi

    # Add Docker's official GPG key
    sudo install -m 0755 -d /etc/apt/keyrings
    if ! curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
         sudo gpg --dearmor --yes -o /etc/apt/keyrings/docker.gpg; then
        add_failure "Failed to add Docker GPG key"
        return
    fi
    sudo chmod a+r /etc/apt/keyrings/docker.gpg

    # Add Docker repository
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | \
        sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

    # Install Docker Engine
    if sudo apt update && safe_apt_install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin; then
        print_status "Docker installed: $(docker --version)"

        # Start and enable Docker service
        if sudo systemctl start docker && sudo systemctl enable docker; then
            print_status "Docker service started and enabled"
        else
            add_failure "Failed to start Docker service"
            return
        fi

        # Wait for socket to be created
        sleep 2

        # Verify docker socket exists and set permissions for immediate access
        if [ -S /var/run/docker.sock ]; then
            sudo chmod 666 /var/run/docker.sock
            print_status "Docker socket created at /var/run/docker.sock with open permissions"
        else
            print_error "Docker socket not found at /var/run/docker.sock"
        fi

        # Add user to docker group
        if sudo usermod -aG docker "$ACTUAL_USER"; then
            print_status "User $ACTUAL_USER added to docker group"
            print_info "Docker is ready to use immediately"
            print_info "For permanent group access, log out and back in or run: newgrp docker"
        else
            add_failure "Failed to add user to docker group"
        fi

        # Test Docker installation (should work immediately with socket permissions)
        if docker run --rm hello-world &>/dev/null; then
            print_status "Docker test successful - ready to use!"
        elif sudo docker run --rm hello-world &>/dev/null; then
            print_status "Docker test successful (with sudo)"
        else
            print_info "Docker installed but test failed"
        fi
    else
        add_failure "Failed to install Docker"
    fi
}

install_java_openjdk() {
    print_section "Java OpenJDK $JAVA_VERSION"

    if is_dry_run; then
        command_exists java && java -version 2>&1 | grep -q "$JAVA_VERSION" && print_status "Already installed" || print_info "Would install OpenJDK $JAVA_VERSION"
        return
    fi

    if command_exists java && java -version 2>&1 | grep -q "$JAVA_VERSION"; then
        print_info "Java OpenJDK $JAVA_VERSION already installed: $(java -version 2>&1 | head -n1)"
        return
    fi

    print_info "Installing Java OpenJDK $JAVA_VERSION..."
    if safe_apt_install openjdk-$JAVA_VERSION-jdk-headless; then
        print_status "Java OpenJDK $JAVA_VERSION installed: $(java -version 2>&1 | head -n1)"

        # Set JAVA_HOME if not already set
        if ! grep -q "export JAVA_HOME=" "$ACTUAL_HOME/.bashrc" 2>/dev/null; then
            echo 'export JAVA_HOME=/usr/lib/jvm/java-$JAVA_VERSION-openjdk-amd64' >> "$ACTUAL_HOME/.bashrc"
            export JAVA_HOME=/usr/lib/jvm/java-$JAVA_VERSION-openjdk-amd64
            print_info "Set JAVA_HOME in ~/.bashrc"
        fi
    else
        add_failure "Failed to install Java OpenJDK $JAVA_VERSION"
    fi
}

install_postgres() {
    print_section "PostgreSQL $POSTGRES_VERSION"

    if is_dry_run; then
        command_exists psql && psql --version 2>/dev/null | grep -q "$POSTGRES_VERSION" && print_status "Already installed" || print_info "Would install PostgreSQL $POSTGRES_VERSION"
        return
    fi

    if command_exists psql && psql --version 2>/dev/null | grep -q "$POSTGRES_VERSION"; then
        print_info "PostgreSQL $POSTGRES_VERSION already installed: $(psql --version)"

        # Ensure service is running
        if ! sudo systemctl is-active --quiet postgresql; then
            sudo systemctl start postgresql && sudo systemctl enable postgresql
        fi
        return
    fi

    print_info "Installing PostgreSQL $POSTGRES_VERSION..."

    # Add PostgreSQL APT repository
    if curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | \
       sudo gpg --dearmor --yes -o /usr/share/keyrings/postgresql-keyring.gpg && \
       echo "deb [arch=amd64 signed-by=/usr/share/keyrings/postgresql-keyring.gpg] http://apt.postgresql.org/pub/repos/apt jammy-pgdg main" | \
           sudo tee /etc/apt/sources.list.d/pgdg.list > /dev/null && \
       sudo apt update && safe_apt_install "postgresql-${POSTGRES_VERSION}" "postgresql-client-${POSTGRES_VERSION}"; then
        print_status "PostgreSQL $POSTGRES_VERSION installed: $(psql --version)"

        # Start and enable service
        if sudo systemctl start postgresql && sudo systemctl enable postgresql; then
            print_status "PostgreSQL service started and enabled"
            print_info "PostgreSQL accessible at: localhost:5432"
        else
            add_failure "Failed to start PostgreSQL service"
        fi
    else
        add_failure "Failed to install PostgreSQL"
    fi
}

configure_postgres_auth() {
    print_section "PostgreSQL Authentication"

    if is_dry_run; then
        print_info "[DRY RUN] Would set password for PostgreSQL user: ${POSTGRES_USER}"
        return
    fi

    if ! command_exists psql; then
        print_info "PostgreSQL not installed, skipping auth configuration"
        return
    fi

    print_info "Configuring PostgreSQL authentication..."

    # Set password for the postgres superuser
    if sudo -u postgres psql -c "ALTER USER ${POSTGRES_USER} WITH PASSWORD '${POSTGRES_PASS}';" 2>/dev/null; then
        print_status "PostgreSQL password set for user '${POSTGRES_USER}'"
        print_info "Connect with: psql -U ${POSTGRES_USER} -h localhost -W"
    else
        add_failure "Failed to set PostgreSQL password"
    fi
}

install_pgadmin() {
    print_section "pgAdmin"

    if is_dry_run; then
        is_package_installed "pgadmin4" && print_status "Already installed" || print_info "Would install pgAdmin"
        return
    fi

    if is_package_installed "pgadmin4"; then
        local version=$(dpkg -l pgadmin4 2>/dev/null | grep '^ii' | awk '{print $3}')
        print_info "pgAdmin already installed: ${version:-version unknown}"
        return
    fi

    print_info "Installing pgAdmin..."

    # Add pgAdmin repository
    if curl -fsSL https://www.pgadmin.org/static/packages_pgadmin_org.pub | \
       sudo gpg --dearmor --yes -o /usr/share/keyrings/pgadmin-keyring.gpg && \
       echo "deb [arch=amd64 signed-by=/usr/share/keyrings/pgadmin-keyring.gpg] https://ftp.postgresql.org/pub/pgadmin/pgadmin4/apt/jammy pgadmin4 main" | \
           sudo tee /etc/apt/sources.list.d/pgadmin4.list > /dev/null && \
       sudo apt update && safe_apt_install pgadmin4-desktop; then
        local version=$(dpkg -l pgadmin4 2>/dev/null | grep '^ii' | awk '{print $3}')
        print_status "pgAdmin installed: ${version:-version unknown}"
        print_info "Launch pgAdmin from the application menu"
    else
        add_failure "Failed to install pgAdmin"
    fi
}

install_mongodb() {
    print_section "MongoDB $MONGODB_VERSION"

    if is_dry_run; then
        command_exists mongod && print_status "Already installed" || print_info "Would install MongoDB $MONGODB_VERSION"
        return
    fi

    if command_exists mongod; then
        print_info "MongoDB already installed: $(mongod --version | grep 'db version')"

        # Ensure service is running
        if ! sudo systemctl is-active --quiet mongod; then
            sudo systemctl start mongod && sudo systemctl enable mongod
        fi
        return
    fi

    print_info "Installing MongoDB $MONGODB_VERSION..."

    # Add MongoDB GPG key and repository
    if curl -fsSL https://www.mongodb.org/static/pgp/server-${MONGODB_VERSION}.asc | \
       sudo gpg --dearmor --yes -o /usr/share/keyrings/mongodb-keyring.gpg && \
       echo "deb [arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-keyring.gpg] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/${MONGODB_VERSION} multiverse" | \
           sudo tee /etc/apt/sources.list.d/mongodb-org-${MONGODB_VERSION}.list > /dev/null && \
       sudo apt update && safe_apt_install mongodb-org; then
        print_status "MongoDB installed: $(mongod --version | grep 'db version')"

        # Start and enable service
        if sudo systemctl start mongod && sudo systemctl enable mongod; then
            print_status "MongoDB service started and enabled"
            print_info "MongoDB accessible at: mongodb://localhost:27017"
        else
            add_failure "Failed to start MongoDB service"
        fi
    else
        add_failure "Failed to install MongoDB"
    fi
}

configure_mongodb_bind() {
    print_section "MongoDB Network Configuration"

    local config_file="/etc/mongod.conf"

    if is_dry_run; then
        print_info "[DRY RUN] Would update MongoDB bindIp to 0.0.0.0"
        return
    fi

    if ! command_exists mongod || [ ! -f "$config_file" ]; then
        print_info "MongoDB not installed, skipping bind configuration"
        return
    fi

    print_info "Configuring MongoDB to bind to 0.0.0.0..."

    # Backup config if not already backed up
    if [ ! -f "${config_file}.backup" ]; then
        sudo cp "$config_file" "${config_file}.backup"
        print_status "Backed up MongoDB config"
    fi

    # Update bindIp
    if sudo sed -i 's/bindIp: 127\.0\.0\.1/bindIp: 0.0.0.0/' "$config_file"; then
        print_status "Updated MongoDB bindIp to 0.0.0.0"

        # Restart MongoDB
        if sudo systemctl restart mongod; then
            print_status "MongoDB restarted with new configuration"
            print_info "MongoDB now accessible from all network interfaces"
        else
            add_failure "Failed to restart MongoDB"
        fi
    else
        add_failure "Failed to update MongoDB bindIp"
    fi
}

configure_mongodb_auth() {
    print_section "MongoDB Authentication"

    local config_file="/etc/mongod.conf"

    if is_dry_run; then
        print_info "[DRY RUN] Would create MongoDB admin user and enable authentication"
        return
    fi

    if ! command_exists mongosh || [ ! -f "$config_file" ]; then
        print_info "MongoDB not installed, skipping auth configuration"
        return
    fi

    # Check if auth already enabled
    if sudo grep -q "authorization: enabled" "$config_file" 2>/dev/null; then
        print_info "MongoDB authentication already enabled"
        return
    fi

    print_info "Configuring MongoDB authentication..."

    # Wait for MongoDB to be ready
    sleep 2

    # Create admin user
    if mongosh --quiet --eval "
        db = db.getSiblingDB('admin');
        if (db.getUser('${MONGO_USER}') === null) {
            db.createUser({
                user: '${MONGO_USER}',
                pwd: '${MONGO_PASS}',
                roles: [{ role: 'root', db: 'admin' }]
            });
            print('created');
        } else {
            print('exists');
        }
    " 2>/dev/null | grep -qE "created|exists"; then
        print_status "MongoDB admin user '${MONGO_USER}' configured"
    else
        add_failure "Failed to create MongoDB admin user"
        return
    fi

    # Enable authorization
    if sudo grep -q "^security:" "$config_file"; then
        sudo sed -i '/^security:/a\  authorization: enabled' "$config_file"
    else
        echo -e "\nsecurity:\n  authorization: enabled" | sudo tee -a "$config_file" > /dev/null
    fi

    # Restart MongoDB
    if sudo systemctl restart mongod; then
        print_status "MongoDB authentication enabled"
        print_info "Connect with: mongosh -u ${MONGO_USER} -p --authenticationDatabase admin"
    else
        add_failure "Failed to restart MongoDB"
    fi
}

install_mongodb_compass() {
    print_section "MongoDB Compass"

    if is_dry_run; then
        is_package_installed "mongodb-compass" && print_status "Already installed" || print_info "Would install MongoDB Compass"
        return
    fi

    if is_package_installed "mongodb-compass"; then
        print_info "MongoDB Compass already installed"
        return
    fi

    print_info "Installing MongoDB Compass..."

    local tmp_dir=$(mktemp -d)
    cd "$tmp_dir"

    local compass_url="https://downloads.mongodb.com/compass/mongodb-compass_${COMPASS_VERSION}_amd64.deb"

    if wget -q "$compass_url" -O mongodb-compass.deb && \
       safe_apt_install ./mongodb-compass.deb; then
        print_status "MongoDB Compass installed"
        print_info "Connect to MongoDB with: mongodb://localhost:27017"
    else
        add_failure "Failed to install MongoDB Compass"
    fi

    cd - > /dev/null
    rm -rf "$tmp_dir"
}

install_apache_spark() {
    print_section "Apache Spark $SPARK_VERSION"

    local spark_home="$ACTUAL_HOME/.local/spark"

    if is_dry_run; then
        [ -d "$spark_home" ] && is_executable "$spark_home/bin/spark-submit" && print_status "Already installed" || print_info "Would install Apache Spark $SPARK_VERSION"
        return
    fi

    # Idempotency check
    if [ -d "$spark_home" ] && is_executable "$spark_home/bin/spark-submit"; then
        print_info "Apache Spark already installed at: $spark_home"
        if "$spark_home/bin/spark-submit" --version &>/dev/null; then
            print_status "Apache Spark $SPARK_VERSION is installed and working"
        fi
        return
    fi

    print_info "Installing Apache Spark $SPARK_VERSION..."

    local spark_filename="spark-${SPARK_VERSION}-bin-hadoop3.tgz"
    local -a spark_mirrors=(
        "https://archive.apache.org/dist/spark/spark-${SPARK_VERSION}/$spark_filename"
        "https://dlcdn.apache.org/spark/spark-${SPARK_VERSION}/$spark_filename"
    )

    mkdir -p "$ACTUAL_HOME/.local"
    local tmp_dir=$(mktemp -d)
    cd "$tmp_dir"

    local download_success=false
    for mirror_url in "${spark_mirrors[@]}"; do
        print_info "Trying mirror: $mirror_url"
        if wget -q --timeout=30 "$mirror_url" -O spark.tgz 2>/dev/null && tar -tzf spark.tgz >/dev/null 2>&1; then
            download_success=true
            break
        fi
    done

    if [ "$download_success" = true ] && tar -xzf spark.tgz && [ -d "spark-${SPARK_VERSION}-bin-hadoop3" ]; then
        rm -rf "$spark_home"
        mv "spark-${SPARK_VERSION}-bin-hadoop3" "$spark_home"
        print_status "Apache Spark extracted to: $spark_home"

        # Add to PATH
        if ! grep -q "export SPARK_HOME=" "$ACTUAL_HOME/.bashrc" 2>/dev/null; then
            cat >> "$ACTUAL_HOME/.bashrc" << 'EOF'

# Apache Spark configuration
export SPARK_HOME=$HOME/.local/spark
export PATH="$SPARK_HOME/bin:$PATH"
EOF
            print_status "Added SPARK_HOME to PATH in ~/.bashrc"
        fi
    else
        add_failure "Failed to download/install Apache Spark"
        print_info "Spark is optional and can be installed manually later"
    fi

    cd - > /dev/null
    rm -rf "$tmp_dir"
}

install_apache_trino() {
    print_section "Apache Trino $TRINO_VERSION"

    local trino_home="$ACTUAL_HOME/.local/trino"
    local trino_cli_path="$ACTUAL_HOME/.local/bin/trino"

    if is_dry_run; then
        [ -d "$trino_home" ] && [ -f "$trino_cli_path" ] && print_status "Already installed" || print_info "Would install Apache Trino $TRINO_VERSION"
        return
    fi

    # Idempotency checks
    local trino_server_installed=false
    local trino_cli_installed=false

    if [ -d "$trino_home" ] && [ -f "$trino_home/bin/launcher" ]; then
        print_info "Trino Server already installed at: $trino_home"
        trino_server_installed=true
    fi

    if is_executable "$trino_cli_path"; then
        print_info "Trino CLI already installed at: $trino_cli_path"
        trino_cli_installed=true
    fi

    if [ "$trino_server_installed" = true ] && [ "$trino_cli_installed" = true ]; then
        print_status "Apache Trino $TRINO_VERSION is fully installed"
        return
    fi

    mkdir -p "$ACTUAL_HOME/.local"
    mkdir -p "$ACTUAL_HOME/.local/bin"
    local trino_data_dir="$ACTUAL_HOME/.local/trino-data"
    mkdir -p "$trino_data_dir"

    # Install Server if not installed
    if [ "$trino_server_installed" = false ]; then
        print_info "Installing Trino Server..."
        local tmp_dir=$(mktemp -d)
        cd "$tmp_dir"

        local trino_download_url="https://repo1.maven.org/maven2/io/trino/trino-server/${TRINO_VERSION}/trino-server-${TRINO_VERSION}.tar.gz"

        if wget -q "$trino_download_url" -O trino-server.tar.gz && \
           tar -xzf trino-server.tar.gz && [ -d "trino-server-${TRINO_VERSION}" ]; then
            rm -rf "$trino_home"
            mv "trino-server-${TRINO_VERSION}" "$trino_home"
            print_status "Trino Server extracted to: $trino_home"

            # Create configuration
            mkdir -p "$trino_home/etc"
            cat > "$trino_home/etc/config.properties" << EOF
coordinator=true
node-scheduler.include-coordinator=true
http-server.http.port=8080
query.max-memory=512MB
discovery-server.enabled=true
discovery.uri=http://localhost:8080
EOF

            cat > "$trino_home/etc/node.properties" << EOF
node.environment=production
node.data_dir=$trino_data_dir
EOF
            print_status "Trino configuration created"
        else
            add_failure "Failed to install Trino Server"
        fi

        cd - > /dev/null
        rm -rf "$tmp_dir"
    fi

    # Install CLI if not installed
    if [ "$trino_cli_installed" = false ]; then
        print_info "Installing Trino CLI..."
        local trino_cli_url="https://repo1.maven.org/maven2/io/trino/trino-cli/${TRINO_VERSION}/trino-cli-${TRINO_VERSION}-executable.jar"

        if wget -q "$trino_cli_url" -O "$trino_cli_path" && chmod +x "$trino_cli_path"; then
            print_status "Trino CLI installed at: $trino_cli_path"
        else
            add_failure "Failed to install Trino CLI"
        fi
    fi

    # Add to PATH
    if ! grep -q 'export PATH="$HOME/.local/bin:$PATH"' "$ACTUAL_HOME/.bashrc" 2>/dev/null; then
        echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$ACTUAL_HOME/.bashrc"
    fi
}

configure_sshd() {
    print_section "SSH Server Configuration"

    if is_dry_run; then
        print_info "[DRY RUN] Would ensure SSH server is installed and configured for password authentication"
        return
    fi

    local sshd_config="/etc/ssh/sshd_config"
    local config_changed=false

    # Ensure openssh-server is installed
    if ! command_exists sshd; then
        print_info "Installing openssh-server..."
        if safe_apt_install openssh-server; then
            print_status "openssh-server installed"
            config_changed=true
        else
            add_failure "Failed to install openssh-server"
            return
        fi
    else
        print_info "openssh-server already installed"
    fi

    # Backup original configuration only once
    if [ -f "$sshd_config" ] && [ ! -f "${sshd_config}.backup-original" ]; then
        sudo cp "$sshd_config" "${sshd_config}.backup-original"
        print_status "Backed up original SSH configuration"
    fi

    # Check if configuration already has the required settings
    local pw_auth_correct=$(sudo grep -q "^PasswordAuthentication yes$" "$sshd_config" && echo "true" || echo "false")
    local pam_correct=$(sudo grep -q "^UsePAM yes$" "$sshd_config" && echo "true" || echo "false")
    local pubkey_correct=$(sudo grep -q "^PubkeyAuthentication yes$" "$sshd_config" && echo "true" || echo "false")

    # If all settings are already correct, no changes needed
    if [ "$pw_auth_correct" = "true" ] && [ "$pam_correct" = "true" ] && [ "$pubkey_correct" = "true" ]; then
        print_info "SSH configuration already properly configured"

        # Verify service is running and enabled
        if ! sudo systemctl is-active --quiet sshd 2>/dev/null && ! sudo systemctl is-active --quiet ssh 2>/dev/null; then
            print_info "Starting SSH service..."
            if sudo systemctl start sshd 2>/dev/null || sudo systemctl start ssh 2>/dev/null; then
                print_status "SSH service started"
            else
                add_failure "Failed to start SSH service"
                return
            fi
        fi

        # Verify service is enabled
        if ! sudo systemctl is-enabled sshd 2>/dev/null && ! sudo systemctl is-enabled ssh 2>/dev/null; then
            if sudo systemctl enable sshd 2>/dev/null || sudo systemctl enable ssh 2>/dev/null; then
                print_status "SSH service enabled to start on boot"
            fi
        fi

        print_status "SSH server is properly configured for password-based connections"
        return
    fi

    print_info "Configuring SSH for password authentication..."

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
        print_status "SSH configuration updated"
    else
        print_info "SSH configuration already correct"
    fi

    # Test SSH configuration
    if ! sudo sshd -t 2>/dev/null; then
        print_error "SSH configuration syntax check failed"
        print_info "Restoring from backup..."
        sudo cp "$temp_backup" "$sshd_config"
        rm -f "$temp_backup"
        add_failure "Failed to configure SSH - configuration restored"
        return
    fi

    rm -f "$temp_backup"

    # Restart SSH service only if configuration was changed
    if [ "$config_changed" = "true" ]; then
        print_info "Restarting SSH service..."
        if sudo systemctl restart sshd 2>/dev/null || sudo systemctl restart ssh 2>/dev/null; then
            print_status "SSH service restarted with new configuration"
        else
            add_failure "Failed to restart SSH service"
            return
        fi
    else
        # Ensure service is running
        if ! sudo systemctl is-active --quiet sshd 2>/dev/null && ! sudo systemctl is-active --quiet ssh 2>/dev/null; then
            print_info "Starting SSH service..."
            if sudo systemctl start sshd 2>/dev/null || sudo systemctl start ssh 2>/dev/null; then
                print_status "SSH service started"
            else
                add_failure "Failed to start SSH service"
                return
            fi
        fi
    fi

    # Enable SSH service on boot
    if ! sudo systemctl is-enabled sshd 2>/dev/null && ! sudo systemctl is-enabled ssh 2>/dev/null; then
        if sudo systemctl enable sshd 2>/dev/null || sudo systemctl enable ssh 2>/dev/null; then
            print_status "SSH service enabled to start on boot"
        fi
    fi

    # Display connection information
    print_info "SSH Configuration Summary:"
    print_info "  - Password authentication: ENABLED"
    print_info "  - Public key authentication: ENABLED"
    print_info "  - Service status: $(sudo systemctl is-active sshd ssh 2>/dev/null | head -n1)"
    print_info "  - SSH port: 22 (default)"

    # Get IP addresses
    local ip_addresses=$(hostname -I 2>/dev/null | tr ' ' '\n' | grep -E '^[0-9]+\.' | head -3 | tr '\n' ' ')
    if [ -n "$ip_addresses" ]; then
        print_info "  - Connect with: ssh ${ACTUAL_USER}@<IP_ADDRESS>"
        print_info "  - Available IPs: $ip_addresses"
    fi

    print_status "SSH server is ready for password-based connections"
}

configure_dnsmasq() {
    print_section "dnsmasq Configuration"

    if [ "$INSTALL_DNSMASQ" != true ]; then
        print_info "dnsmasq installation not requested (use -d flag)"
        return
    fi

    if is_dry_run; then
        print_info "[DRY RUN] Would configure dnsmasq for LocalStack DNS"
        return
    fi

    if ! command_exists dnsmasq; then
        print_info "dnsmasq not installed, skipping configuration"
        return
    fi

    print_info "Configuring dnsmasq for LocalStack..."

    # Create dnsmasq configuration for LocalStack
    local dnsmasq_conf="/etc/dnsmasq.d/localstack.conf"

    if [ ! -f "$dnsmasq_conf" ]; then
        sudo tee "$dnsmasq_conf" > /dev/null << EOF
# LocalStack DNS configuration
address=/.localhost.localstack.cloud/127.0.0.1
server=8.8.8.8
EOF
        print_status "Created LocalStack dnsmasq configuration"
    else
        print_info "dnsmasq configuration already exists"
    fi

    # Restart dnsmasq
    if sudo systemctl restart dnsmasq && sudo systemctl enable dnsmasq; then
        print_status "dnsmasq configured and restarted"
    else
        add_failure "Failed to configure dnsmasq"
    fi
}

install_terraform() {
    print_section "Terraform"

    if is_dry_run; then
        command_exists terraform && print_status "Already installed" || print_info "Would install Terraform"
        return
    fi

    if command_exists terraform; then
        print_info "Terraform already installed: $(terraform version | head -n1)"
        return
    fi

    print_info "Installing Terraform..."

    # Add HashiCorp GPG key and repository
    if wget -O- https://apt.releases.hashicorp.com/gpg | sudo gpg --dearmor --yes -o /usr/share/keyrings/hashicorp-archive-keyring.gpg && \
       echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" | \
           sudo tee /etc/apt/sources.list.d/hashicorp.list > /dev/null && \
       sudo apt update && safe_apt_install terraform; then
        print_status "Terraform installed: $(terraform version | head -n1)"
    else
        add_failure "Failed to install Terraform"
    fi
}

install_awscli() {
    print_section "AWS CLI v2"

    if is_dry_run; then
        command_exists aws && aws --version 2>&1 | grep -q "aws-cli/2" && print_status "Already installed" || print_info "Would install AWS CLI v2"
        return
    fi

    # Check if AWS CLI v2 is already installed and working
    if command_exists aws && aws --version 2>/dev/null | grep -q "aws-cli/2"; then
        print_info "AWS CLI v2 already installed: $(aws --version)"
        return
    fi

    # Remove old AWS CLI v1 package if it exists (incompatible with Python 3.13+)
    if is_package_installed "awscli"; then
        print_info "Removing incompatible AWS CLI v1 package..."
        if sudo apt remove -y awscli 2>/dev/null; then
            print_status "AWS CLI v1 package removed"
        fi
    fi

    print_info "Installing AWS CLI v2..."

    local tmp_dir=$(mktemp -d)
    cd "$tmp_dir"

    if curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip" && \
       unzip -q awscliv2.zip && \
       sudo ./aws/install --update; then
        print_status "AWS CLI v2 installed: $(aws --version)"
    else
        add_failure "Failed to install AWS CLI v2"
    fi

    cd - > /dev/null
    rm -rf "$tmp_dir"
}

install_localstack() {
    print_section "LocalStack $LOCALSTACK_VERSION"

    local localstack_bin="$ACTUAL_HOME/.local/bin/localstack"

    if is_dry_run; then
        [ -x "$localstack_bin" ] && print_status "Already installed" || print_info "Would install LocalStack $LOCALSTACK_VERSION"
        return
    fi

    if [ -x "$localstack_bin" ]; then
        print_info "LocalStack already installed: $("$localstack_bin" --version 2>/dev/null || echo "$LOCALSTACK_VERSION")"
        return
    fi

    print_info "Installing LocalStack $LOCALSTACK_VERSION..."

    # Ensure ~/.local/bin exists and is in PATH
    mkdir -p "$ACTUAL_HOME/.local/bin"
    export PATH="$ACTUAL_HOME/.local/bin:$PATH"

    # Install via pip
    if python3 -m pip install --user "localstack==${LOCALSTACK_VERSION}"; then
        if [ -x "$localstack_bin" ]; then
            print_status "LocalStack installed: $("$localstack_bin" --version 2>/dev/null || echo "$LOCALSTACK_VERSION")"
        else
            print_status "LocalStack installed: $LOCALSTACK_VERSION"
        fi

        # Ensure ~/.local/bin is in PATH for future sessions
        if ! grep -q 'export PATH="$HOME/.local/bin:$PATH"' "$ACTUAL_HOME/.bashrc" 2>/dev/null; then
            echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$ACTUAL_HOME/.bashrc"
        fi

        print_info "LocalStack accessible at: http://localhost:4566"
    else
        add_failure "Failed to install LocalStack"
    fi
}

install_jupyter_notebook() {
    print_section "Jupyter Notebook"

    if is_dry_run; then
        command_exists jupyter && print_status "Already installed" || print_info "Would install Jupyter"
        return
    fi

    if command_exists jupyter && jupyter --version &>/dev/null 2>&1; then
        print_info "Jupyter already installed: $(jupyter --version 2>/dev/null | head -n1)"
        return
    fi

    print_info "Installing Jupyter Notebook..."

    # Ensure pip is working for python3
    if ! python3 -m pip --version &>/dev/null 2>&1; then
        print_info "Installing pip for python3..."
        wget -q https://bootstrap.pypa.io/get-pip.py -O /tmp/get-pip-jupyter.py 2>/dev/null
        if [ -f /tmp/get-pip-jupyter.py ]; then
            python3 /tmp/get-pip-jupyter.py --user --force-reinstall 2>&1 | grep -v "WARNING" || true
            rm -f /tmp/get-pip-jupyter.py
        fi
    fi

    # Upgrade pip and install packages
    python3 -m pip install --user --upgrade pip setuptools wheel 2>&1 | grep -v "WARNING" || true

    if python3 -m pip install --user jupyter notebook jupyterlab pandas numpy matplotlib scikit-learn scipy plotly 2>&1 | grep -E "Successfully installed|Requirement already satisfied"; then
        print_status "Jupyter Notebook installed"
        mkdir -p "$ACTUAL_HOME/.jupyter"

        # Ensure ~/.local/bin is in PATH
        if ! grep -q 'export PATH="$HOME/.local/bin:$PATH"' "$ACTUAL_HOME/.bashrc" 2>/dev/null; then
            echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$ACTUAL_HOME/.bashrc"
        fi
    else
        add_failure "Failed to install Jupyter"
    fi
}

# ============================================================================
# MAIN EXECUTION
# ============================================================================

show_help() {
    cat << 'HELP'
Ubuntu 22.04 Developer Workstation Setup

Usage: ./setup-environment.sh [OPTIONS]

Options:
  -n                       Dry run
  -d                       Install dnsmasq
  -h, --help               Show help
  --intellij-ultimate      Install IntelliJ Ultimate
  --pycharm-professional   Install PyCharm Professional
HELP
}

# Parse arguments
ORIGINAL_ARGS="$*"
while [[ $# -gt 0 ]]; do
    case $1 in
        -n) DRY_RUN=true; shift ;;
        -d) INSTALL_DNSMASQ=true; shift ;;
        -h|--help) show_help; exit 0 ;;
        --intellij-ultimate) INTELLIJ_EDITION="ultimate"; shift ;;
        --pycharm-professional) PYCHARM_EDITION="professional"; shift ;;
        *) echo "Unknown option: $1"; show_help; exit 1 ;;
    esac
done

main() {
    print_section "Ubuntu 22.04 Developer Workstation Setup"

    is_dry_run && echo -e "${YELLOW}DRY RUN MODE${NC}\n"

    echo "User: $ACTUAL_USER"
    echo "Home: $ACTUAL_HOME"
    echo ""

    ! is_dry_run && setup_logging

    # Install system prerequisites and Python
    install_prerequisites
    install_python "3.11"
    install_python "3.12"
    install_python "3.13"
    install_python "3.14"
    configure_python "$PYENV_VERSION"

    # Install IDEs and development tools
    install_nodejs
    install_java_openjdk
    install_vscode
    install_intellij
    install_pycharm
    install_docker

    # Install databases
    install_postgres
    configure_postgres_auth
    install_pgadmin
    install_mongodb
    configure_mongodb_bind
    configure_mongodb_auth
    install_mongodb_compass

    # Install cloud tools
    install_terraform
    install_awscli
    install_localstack

    # Install data science tools
    install_jupyter_notebook
    install_apache_spark
    install_apache_trino

    # Configure services
    configure_sshd
    configure_dnsmasq

    # Summary
    print_section "INSTALATION SUMMARY"
    echo ""

    if [ ${#FAILURES[@]} -eq 0 ]; then
        echo -e "${GREEN}Installation complete - ALL COMPONENTS SUCCESSFUL!${NC}"
    else
        echo -e "${RED}Installation complete with ${#FAILURES[@]} failure(s)${NC}"
        for failure in "${FAILURES[@]}"; do
            echo -e "  ${RED}✗${NC} $failure"
        done
    fi

    echo ""
    echo "CONNECTION INFO"
    command_exists psql && echo -e "  ${GREEN}✓${NC} PostgreSQL: postgresql://localhost:5432 (user: $POSTGRES_USER)"
    command_exists mongod && echo -e "  ${GREEN}✓${NC} MongoDB: mongodb://localhost:27017 (user: $MONGO_USER)"
    if command_exists docker; then
        if sudo systemctl is-active --quiet docker && sudo docker info &>/dev/null; then
            echo -e "  ${GREEN}✓${NC} Docker: running and responsive"
        else
            echo -e "  ${RED}✗${NC} Docker: installed but not running (run: sudo systemctl start docker)"
        fi
    fi
    [ -x "$ACTUAL_HOME/.local/bin/localstack" ] && echo -e "  ${GREEN}✓${NC} LocalStack: http://localhost:4566"
    command_exists jupyter && echo -e "  ${GREEN}✓${NC} Jupyter: localhost:$JUPYTER_PORT"
    [ -d "$ACTUAL_HOME/.local/spark" ] && echo -e "  ${GREEN}✓${NC} Spark: $ACTUAL_HOME/.local/spark"
    [ -f "$ACTUAL_HOME/.local/bin/trino" ] && echo -e "  ${GREEN}✓${NC} Trino: $ACTUAL_HOME/.local/bin/trino"
    echo ""

    if ! is_dry_run; then
        print_info "Note: Run 'source ~/.bashrc' or start a new terminal to update PATH"
        if ! groups | grep -q docker; then
            print_info "Note: Docker group changes require logout/login to take effect"
            print_info "      Until then, use 'sudo docker' or run: newgrp docker"
        fi
    fi

    if [ ${#FAILURES[@]} -gt 0 ]; then
        exit 1
    fi
}

main
