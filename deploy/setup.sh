#!/bin/bash
# Server setup script for Ubuntu ARM64 (Oracle Cloud Always Free)
# Run once on a fresh Ubuntu 22.04 instance:
#   bash setup.sh

set -e

echo "==> Updating system packages"
sudo apt-get update && sudo apt-get upgrade -y

echo "==> Installing Docker"
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Allow current user to run docker without sudo
sudo usermod -aG docker "$USER"
echo "==> Docker installed"

echo "==> Configuring firewall"
if command -v ufw &>/dev/null; then
  sudo ufw allow 80/tcp
  sudo ufw allow 22/tcp
  sudo ufw --force enable
else
  sudo apt-get install -y ufw
  sudo ufw allow 80/tcp
  sudo ufw allow 22/tcp
  sudo ufw --force enable
fi
echo "NOTE: Also add an Ingress Rule for TCP port 80 in your Oracle Cloud Security List"

echo "==> Cloning repository"
git clone https://github.com/iwanmunro/mcrs-revision-tool.git app
cd app

echo ""
echo "==> Creating .env file"
read -rp "Set app password (what users will log in with): " APP_PASSWORD
SECRET_KEY=$(openssl rand -hex 32)

cat > .env <<EOF
APP_PASSWORD=${APP_PASSWORD}
SECRET_KEY=${SECRET_KEY}
OLLAMA_MODEL=llama3.2:latest
OLLAMA_NUM_CTX=3072
RETRIEVAL_TOP_K=3
EOF

echo "==> Starting containers (this will pull images \u2014 may take a few minutes)"
# Need a new shell for the docker group to take effect
sudo docker compose up -d

echo "==> Pulling LLM model into Ollama (this downloads ~2GB \u2014 be patient)"
sudo docker exec mrcs_ollama ollama pull llama3.2:latest

echo ""
echo "====================================================="
echo " Setup complete!"
echo " App is running at http://$(curl -s ifconfig.me)"
echo "====================================================="
