# Use AWS Lambda Node.js 20 base image
FROM public.ecr.aws/lambda/nodejs:20

# Set working directory
WORKDIR ${LAMBDA_TASK_ROOT}

# Copy package files
COPY package*.json ./

# Install all dependencies (skip prepare script since source files aren't copied yet)
RUN npm ci --ignore-scripts

# Copy TypeScript configuration
COPY tsconfig.json ./

# Copy source code
COPY index.ts ./
COPY handler.ts ./
COPY src ./src

# Build TypeScript code
RUN npm run build

# Remove dev dependencies to reduce image size
RUN npm prune --production

# Set the Lambda handler
CMD [ "index.handler" ]
