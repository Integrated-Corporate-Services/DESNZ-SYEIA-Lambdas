FROM public.ecr.aws/lambda/nodejs:20 AS builder

WORKDIR /build

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY tsconfig.json tsconfig.build.json ./
COPY src/handler.ts ./src/handler.ts
RUN npm run build

FROM public.ecr.aws/lambda/nodejs:20

WORKDIR ${LAMBDA_TASK_ROOT}

COPY --from=builder /build/dist/handler.js ./handler.js

CMD ["handler.handler"]