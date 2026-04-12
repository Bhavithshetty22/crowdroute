FROM node:20-alpine
WORKDIR /app
COPY . .
RUN cp .env env.txt
RUN npm install -g serve
CMD serve -s . -l tcp://0.0.0.0:$PORT
