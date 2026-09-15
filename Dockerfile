# ==========================================
# 1. BUILDER STAGE
# ==========================================
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files & tsconfig
COPY package*.json ./
COPY tsconfig*.json ./

# Install semua dependencies (termasuk devDependencies untuk build)
RUN npm ci

# Copy source code & prisma schema
COPY . .

# Generate Prisma Client (Akan masuk ke folder /app/generated/prisma)
RUN npx prisma generate

# Build TypeScript (Akan meng-compile src/ dan generated/ ke dalam folder dist/)
RUN npm run build


# ==========================================
# 2. RUNTIME STAGE
# ==========================================
FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production

# Copy package files
COPY package*.json ./

# Install HANYA production dependencies
RUN npm ci --omit=dev

# Install prisma CLI secara global agar bisa dipakai untuk pre-deploy migrate
RUN npm install -g prisma

# Copy file konfigurasi prisma terbaru
COPY prisma ./prisma
COPY prisma.config.ts ./

# Copy hasil build dari stage builder
# Di dalamnya sudah lengkap: dist/src (kode backend) dan dist/generated (kode prisma)
COPY --from=builder /app/dist ./dist

EXPOSE 3000

# Migrasi selalu jalan; seed hanya saat RUN_SEED=true (deploy pertama),
# supaya restart/redeploy tidak mengeksekusi seed berulang kali.
CMD ["sh", "-c", "npx prisma migrate deploy && if [ \"$RUN_SEED\" = \"true\" ]; then npx prisma db seed; fi && node dist/src/main.js"]
