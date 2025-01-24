#!/bin/bash

# Requires AWS CLI and jq
# Usage: ./setup-cloudflare-aws.sh <security-group-id> <region>

set -e  # Exit on any error

if [ -z "$1" ] || [ -z "$2" ]; then
  echo "Usage: $0 <security-group-id> <region>"
  echo "Example: $0 sg-xxxxxxxx us-east-1"
  exit 1
fi

SG_ID=$1
REGION=$2

echo "Fetching Cloudflare IP ranges..."

# Fetch Cloudflare IPs
IPV4_RANGES=$(curl -s https://www.cloudflare.com/ips-v4)
# Note: IPv6 not supported in EC2 security groups for inbound rules
# IPV6_RANGES=$(curl -s https://www.cloudflare.com/ips-v6)

echo "Removing existing HTTP rules..."

# Remove existing HTTP rules (optional)
aws ec2 revoke-security-group-ingress \
  --group-id $SG_ID \
  --protocol tcp \
  --port 80 \
  --cidr 0.0.0.0/0 \
  --region $REGION

echo "Adding Cloudflare IPv4 ranges..."

# Add Cloudflare IPv4 ranges
for ip in $IPV4_RANGES; do
  echo "Adding $ip..."
  aws ec2 authorize-security-group-ingress \
    --group-id $SG_ID \
    --protocol tcp \
    --port 80 \
    --cidr $ip \
    --region $REGION \
    --description "Cloudflare IPv4 range"
done

echo "Cloudflare IPv4 ranges added to security group $SG_ID in region $REGION"
echo "Note: IPv6 ranges are not supported in EC2 security groups for inbound rules"