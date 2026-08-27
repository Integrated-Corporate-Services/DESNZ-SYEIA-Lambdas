# Stage 1: Builder - Install dependencies and compile the src/ TypeScript
FROM public.ecr.aws/lambda/nodejs:20 AS builder

WORKDIR /build

# Copy package files
COPY package*.json ./

# Full install (typescript is a devDependency, needed to build src/)
RUN npm ci

# Compile src/**/*.ts to dist/src (ENABLE_SQS_DELIVERY feature logic)
COPY tsconfig.json ./
COPY util ./util
COPY src ./src
RUN npm run build

# Prune to production-only deps for the runtime image
RUN npm ci --omit=dev

# Stage 2: Runtime - Create final lightweight image
FROM public.ecr.aws/lambda/nodejs:20

# Set working directory
WORKDIR ${LAMBDA_TASK_ROOT}

# Copy package files
COPY package*.json ./

# Copy production dependencies from builder
COPY --from=builder /build/node_modules ./node_modules

# Copy application code (JavaScript files)
COPY *.js ./
COPY deliver ./deliver
COPY transform ./transform
COPY util ./util

# Copy compiled SQS delivery logic (ENABLE_SQS_DELIVERY=true path).
# outboxService.js imports from ./dist/src/index.js, and that compiled code's
# own relative imports resolve to ./dist/util/*.js (a compiled copy of the
# util/*.js this src/ code reused at build time) - copy the whole dist/ tree
# so both stay consistent, matching the local dev build layout.
COPY --from=builder /build/dist ./dist

# Set the Lambda handler
CMD [ "handler.handler" ]
