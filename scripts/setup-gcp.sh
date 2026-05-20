#!/bin/bash
set -e

# ============================================
# Google Cloud Run - Setup Script
# ============================================
# Usage: ./scripts/setup-gcp.sh
# ============================================

echo "🔧 Google Cloud Run Setup"
echo "========================="

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
  echo "❌ gcloud CLI not found. Install it first:"
  echo "   https://cloud.google.com/sdk/docs/install"
  exit 1
fi

# Check if logged in
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" &> /dev/null; then
  echo "🔑 Please login to Google Cloud..."
  gcloud auth login
fi

# Get project ID
PROJECT_ID=$(gcloud config get-value project 2>/dev/null)
if [ -z "$PROJECT_ID" ]; then
  echo "📋 No project configured. Please set your project:"
  echo "   gcloud config set project <your-project-id>"
  exit 1
fi

echo "✅ Project: $PROJECT_ID"

# Enable required APIs
echo "📦 Enabling required APIs..."
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudscheduler.googleapis.com \
  secretmanager.googleapis.com \
  cloudbuild.googleapis.com

# Create Artifact Registry
echo "📦 Creating Artifact Registry..."
gcloud artifacts repositories create anime-scraper \
  --repository-format=docker \
  --location=us-central1 \
  --description="Anime scraper engine images" 2>/dev/null || echo "   Registry already exists"

# Create secrets (placeholder values - user must update)
echo "🔐 Creating secrets in Secret Manager..."
echo "   ⚠️  These are placeholder values. Update them with your real credentials."

create_secret() {
  local name=$1
  local value=$2
  if gcloud secrets describe "$name" --project="$PROJECT_ID" &>/dev/null; then
    echo "   ✅ Secret '$name' already exists"
  else
    echo -n "$value" | gcloud secrets create "$name" --data-file=- --project="$PROJECT_ID"
    echo "   ✅ Secret '$name' created"
  fi
}

create_secret "supabase-url" "https://your-project.supabase.co"
create_secret "supabase-service-role-key" "your-service-role-key"
create_secret "manual-run-token" "your-manual-run-token"
create_secret "r2-account-id" "your-r2-account-id"
create_secret "r2-access-key-id" "your-r2-access-key-id"
create_secret "r2-secret-access-key" "your-r2-secret-access-key"
create_secret "google-cse-api-key" "your-google-cse-api-key"
create_secret "google-cse-cx" "your-google-cse-cx"

# Grant Cloud Build access to secrets
echo "🔑 Granting Cloud Build access to secrets..."
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${PROJECT_ID}@cloudbuild.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

echo ""
echo "✅ Setup complete!"
echo ""
echo "📝 Next steps:"
echo "   1. Update secret values with your real credentials:"
echo "      echo -n 'real-value' | gcloud secrets versions add <secret-name> --data-file=-"
echo "   2. Connect your repo in Cloud Console:"
echo "      Cloud Run → Create Service → Continuously deploy from source"
echo "   3. Or deploy manually:"
echo "      gcloud builds submit --config=cloudbuild.yaml"
