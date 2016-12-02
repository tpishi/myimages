'use strict';

import fs = require('fs');
import crypto = require('crypto');
import http = require('http');
import path = require('path');

function readdir(dir:string):Promise<Array<string>> {
  return new Promise((resolve, reject) => {
    fs.readdir(dir, async (err, files) => {
      if (err) {
        reject(err);
        return;
      }
      const promises = [];
      files.forEach((file) => {
        promises.push(stat(dir + path.sep + file));
      });
      const paths:Array<string[]> = await Promise.all(promises);
      const all = [];
      paths.forEach((result) => {
        Array.prototype.push.apply(all, result);
      });
      resolve(all);
    });
  });
}

function stat(name:string):Promise<Array<string>> {
  return new Promise((resolve, reject) => {
    fs.stat(name, async (err, stats) => {
      if (err) {
        reject(err);
        return;
      }
      if (stats.isDirectory()) {
        resolve(await readdir(name));
      } else if (name.endsWith('.jpg') ||
                 name.endsWith('.JPG') ||
                 name.endsWith('.jpeg') ||
                 name.endsWith('.JPEG')) {
        resolve([name]);
      } else {
        resolve([]);
      }
    });
  });
}

function calcHash(file:string):Promise<string> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      const hash = crypto.createHash('sha1');
      const data = fs.readFileSync(file);
      hash.update(data);
      resolve(hash.digest().toString('hex'));
    }, 0);
  });
}

class ImageScanner {
  name:string;
  prepared:number;
  total:number;
  images:any;
  duplicated:string[];
  constructor(name:string) {
    this.name = name;
    if (name.endsWith(path.sep)) {
      this.name = name.slice(0, -1);
    }
    this.prepared = 0;
    this.total = 0;
    this.images = {};
    this.duplicated = [];
  }
  scan() {
    stat(this.name).then(async (files) => {
      this.total = files.length;
      this.prepared = 0;
      // Here, forEach cannot be used.
      for (let file of files) {
        const hash:string = await calcHash(file);
        if (!(hash in this.images)) {
          this.images[hash] = [];
        } else {
          if (this.duplicated.indexOf(hash) === -1) {
            this.duplicated.push(hash);
          }
        }
        this.images[hash].push(file);
        this.prepared++;
      }
    });
  }
}

function main(webroot:string, name:string) {
  let scanner:ImageScanner = new ImageScanner(name);
  scanner.scan();
  http.createServer((request, response) => {
    if (request.url === '/') {
      request.url = '/index.html';
    }
    if (request.url.startsWith('/cache/')) {
      const json:any = {};
      if (request.url === '/cache/summary') {
        json.preparedImages = scanner.prepared;
        json.totalImages =  scanner.total;
      }
      response.write(JSON.stringify(json));
      response.end();
      return;
    }
    const file = webroot + request.url;
    fs.stat(file, (err, stats) => {
      if (err) {
        console.log(`${file} not found`);
        response.statusCode = 404;
        response.end();
        return;
      }
      console.log(`${file} found`);
      response.write(fs.readFileSync(file));
      response.end();
    });
  }).listen(8080);
}

const webroot:string = process.argv[1].replace('lib/main.js', '') + 'websrc';
let imageroot:string = process.argv[2];
main(webroot, process.argv[2]);
