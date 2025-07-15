FROM node:22-bullseye-slim

WORKDIR /opt/app
COPY ./package.json /opt/app/
RUN npm install
COPY . /opt/app

CMD ["node", "tilt/app/elector.js"]
