const http = require("http");
const og = require("open-graph");
const fs = require("fs");

class KeyValueStore {
  constructor(file) {
    this._file = file;
    this._data = {};
    this._changed = false;

    fs.exists(file, exists => {
      if (exists) {
        fs.readFile(file, { encoding: "utf8" }, (err, data) => {
          if (err) console.error(err);
          else {
            try {
              let json = JSON.parse(data);
              this._data = json || {};
            } catch (e) {
              console.error(e);
            }
          }
        });
      }
    });
  }
  get(key) {
    return this._data[key];
  }
  put(key, value) {
    if (!value) return;

    this._data[key] = value;
    this._changed = true;
  }
  commit() {
    if (!this._changed) return;
    this._changed = false;

    fs.writeFile(
      this._file,
      JSON.stringify(this._data),
      err => err && console.error(err)
    );
  }
  autocommit(ms = 60000) {
    if (this._ac) return;
    this._ac = setInterval(() => this.commit(), ms);
    return {
      stop: () => {
        clearInterval(this._ac);
        this._ac = null;
      }
    };
  }
}

class NoCacheKeyValueStore extends KeyValueStore {
  constructor() {}
  get() {}
  put() {}
}

function parseUrl(url) {
  let parts = (url || "")
    .toString()
    .split("#")[0]
    .split("?");
  let res = {
    path: parts[0],
    query: {}
  };
  (parts[1] || "").split("&").forEach(param => {
    let s = param.split("=");
    res.query[s[0]] = s[1] ? decodeURIComponent(s[1]) : "";
  });
  return res;
}

module.exports = (
  args = {
    cache: { file: "", autocommit: 60000 },
    listen: 8080
  }
) => {
  let cache;

  if (args.cache) {
    if ("get" in args.cache && "put" in args.cache) {
      cache = args.cache;
    } else {
      cache = new KeyValueStore(args.cache.file);

      if (args.cache.autocommit) {
        cache.autocommit(args.cache.autocommit);
      }
    }
  } else {
    cache = new NoCacheKeyValueStore();
  }

  let server = http.createServer(async (req, res) => {
    let url = parseUrl(req.url);

    if (url.path == "/ping") {
      res.writeHead(200, "OK");
      res.write("i am alive");
      res.end();
      return;
    }

    if (url.path == "/image" && url.query.domain) {
      let destUrl = parseUrl(url.query.domain).path;
      let image = cache.get(destUrl);

      function respond() {
        if (image) {
          let array = typeof image === "object" && Array.isArray(image);

          if (!image && url.query.fallback) {
            image = url.query.fallback;
          }

          if (url.query["format"] == "json") {
            res.writeHead(200, "OK");
            res.write(
              JSON.stringify({
                images: array ? image : [image]
              })
            );
          } else {
            res.writeHead(301, "Redirect", {
              Location: array ? image[0] : image
            });
          }
        } else {
          res.writeHead(404, "Not Found");
        }
        res.end();
      }

      if (!image) {
        og(destUrl, (err, data) => {
          if (err) console.error(err);
          else {
            image = data.image && data.image.url;
            cache.put(destUrl, image);
          }
          respond();
        });
      } else {
        respond();
      }
      return;
    }

    res.writeHead(404);
    res.end();
  });

  if (args.listen) {
    server.listen(args.listen, () =>
      console.log("Server listening at http://localhost:" + args.listen)
    );
  }

  return server;
};
