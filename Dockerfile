FROM node:14.15.1-buster
WORKDIR /app

COPY package*.json ./

RUN apt-get update -y && apt-get install ffmpeg -y
RUN apt-get install festival -y
RUN npm install

COPY . .

CMD ["npm", "start"]