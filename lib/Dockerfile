FROM quay.io/qasimtech/mega-md:latest

WORKDIR /root/jam-md

COPY package.json package-lock.json ./

RUN npm install

COPY . .

EXPOSE 5000

CMD ["npm", "run", "start:optimized"]
