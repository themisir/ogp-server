#!/usr/bin/env node
const ogpServer = require("./index");
const port = parseInt(process.env.PORT || 8080);
const path = require("path");

ogpServer({
  cache: {
    file: path.join(__dirname, "ogpserver.cache"),
    autocommit: 60000
  },
  listen: port
});
