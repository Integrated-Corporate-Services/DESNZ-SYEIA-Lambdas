FROM public.ecr.aws/lambda/nodejs:20 AS builder

WORKDIR /build

COPY package*.json ./

RUN npm ci

COPY tsconfig.json ./
COPY index.ts ./
COPY handler.ts ./
COPY src ./src

RUN npm run build

RUN npm ci --omit=dev

FROM public.ecr.aws/lambda/nodejs:20

WORKDIR ${LAMBDA_TASK_ROOT}

COPY package*.json ./

COPY --from=builder /build/node_modules ./node_modules

COPY --from=builder /build/*.js ./
COPY --from=builder /build/src ./src

CMD [ "index.handler" ]
