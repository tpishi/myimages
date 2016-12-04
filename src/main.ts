'use strict';

import fs = require('fs');
import crypto = require('crypto');
import http = require('http');
import path = require('path');
import sharp = require('sharp');

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
  myImagesRoot:string;
  imagesByName:Map<string, any>;
  dirMap:Map<string, string>;
  reverseDirMap:Map<string, string>;
  constructor(myImagesRoot:string, name:string) {
    this.myImagesRoot = myImagesRoot;
    this.name = name;
    if (name.endsWith(path.sep)) {
      this.name = name.slice(0, -1);
    }
    this.prepared = 0;
    this.total = 0;
    this.dirMap = new Map();
    this.reverseDirMap = new Map();
    this.imagesByName = new Map();
  }
  getShrinkDir(dir:string):string {
    if (!this.dirMap.has(dir)) {
      let loop = true;
      let suggestion;
      while (loop) {
        loop = false;
        suggestion = ('0000000' + (Math.floor(Math.random() * 0x7fffffff).toString(16))).slice(-8);
        if (this.reverseDirMap.has(suggestion)) {
          loop = true;
        }
      }
      this.dirMap.set(dir, suggestion);
      this.reverseDirMap.set(suggestion, dir);
      //console.log(`added:${dir}:${this.dirMap.get(dir)}`);
    }
    return this.dirMap.get(dir);
  }
  scan() {
    stat(this.name).then(async (files) => {
      this.total = files.length;
      this.prepared = 0;
      // Here, forEach cannot be used.
      for (let file of files) {
        const obj = path.parse(file);
        const shrinkDir = this.getShrinkDir(obj.dir);
        const key = shrinkDir + path.sep + obj.name + '.webp';
        if (this.imagesByName.has(key)) {
          console.log(`warning: ${key} has duplicated??`);
        }
        const imageData:any = {};
        imageData.fullPath = file;
        imageData.hash = await calcHash(file);
        //console.log(`set:${key}:imageData:${JSON.stringify(imageData)}`);
        this.imagesByName.set(key, imageData);
        this.prepared++;
      }
    });
  }
  getThumbnail(key:string):Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const image = this.myImagesRoot + '.images/' + key;
      fs.stat(image, (err, stats) => {
        if (!err) {
          resolve(fs.readFileSync(image));
          return;
        }
        const pathobj = path.parse(image);
        fs.mkdir(pathobj.dir, (err) => {
          if (err && err.code !== 'EEXIST') {
            console.log('mkdir fails');
            reject(err);
            return;
          }
          const fullPath = this.imagesByName.get(key).fullPath;
          sharp(fullPath)
            .resize(320)
            .toBuffer()
            .then((data) => {
              console.log('data.length:' + data.length);
              resolve(data);
            })
            .catch((err) => {
              reject(err);
            });
        });
      });
    });
  }
}

function main(myImagesRoot:string, name:string) {
  let scanner:ImageScanner = new ImageScanner(myImagesRoot, name);
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
        response.write(JSON.stringify(json));
        response.end();
        return;
      }
      if (request.url === '/cache/images') {
        response.write(JSON.stringify([...scanner.imagesByName]));
        response.end();
        return;
      }
      const key = decodeURIComponent(request.url.slice('/cache/'.length));
      scanner.getThumbnail(key)
             .then((data) => {
               response.write(data);
               response.end();
             })
             .catch((err) => {
               console.log(`getThumbnail:${err}`);
               response.statusCode = 404;
               response.end();
             });
      return;
    }
    const file = myImagesRoot + 'websrc' + request.url;
    fs.stat(file, (err, stats) => {
      if (err) {
        console.log(`${file} not found`);
        response.statusCode = 404;
        response.end();
        return;
      }
      response.write(fs.readFileSync(file));
      response.end();
    });
  }).listen(8080);
}

const myImagesRoot:string = process.argv[1].replace('lib/main.js', '');
const imageroot:string = path.resolve(process.argv[2]);
main(myImagesRoot, imageroot);
