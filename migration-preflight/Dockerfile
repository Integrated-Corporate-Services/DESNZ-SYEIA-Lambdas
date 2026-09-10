FROM public.ecr.aws/lambda/nodejs:20 AS builder

WORKDIR /build

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

FROM public.ecr.aws/lambda/nodejs:20 AS dependencies

WORKDIR /build

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

FROM public.ecr.aws/lambda/nodejs:20

WORKDIR ${LAMBDA_TASK_ROOT}

COPY --from=dependencies /build/node_modules ./node_modules
COPY --from=builder /build/dist ./dist

CMD ["dist/handler.handler"]