# Stage 1: Builder - Install dependencies and build TypeScript
FROM public.ecr.aws/lambda/nodejs:20 AS builder

WORKDIR /build

# Copy package files
COPY package*.json ./

# Install all dependencies
RUN npm ci

# Copy TypeScript configuration and source code
COPY tsconfig.json ./
COPY index.ts ./
COPY handler.ts ./
COPY src ./src

# Build TypeScript code
RUN npm run build

# Install only production dependencies in a clean directory
RUN npm ci --omit=dev

# Stage 2: Runtime - Create final lightweight image
FROM public.ecr.aws/lambda/nodejs:20

# Set working directory
WORKDIR ${LAMBDA_TASK_ROOT}

# Copy package files for reference
COPY package*.json ./

# Copy production dependencies from builder
COPY --from=builder /build/node_modules ./node_modules

# Copy built JavaScript files from dist folder
COPY --from=builder /build/dist ./

# Set the Lambda handler
CMD [ "index.handler" ]
