FROM node:24-alpine AS builder

WORKDIR /app

RUN npm install