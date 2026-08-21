# Stage 1: Builder - Install dependencies
FROM public.ecr.aws/lambda/nodejs:20 AS builder

WORKDIR /build

# Copy package files
COPY package*.json ./

# Install only production dependencies
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

# Set the Lambda handler
CMD [ "handler.handler" ]
