'use strict';

import fs = require('fs');
import fsp = require('./fsp');
import crypto = require('crypto');
import http = require('http');
import path = require('path');
import url = require('url');
import sharp = require('sharp');

function listImageFiles(name:string):Promise<Array<string>> {
  return new Promise((resolve, reject) => {
    fsp.stat(name).then(async (stats) => {
      if (stats.isDirectory()) {
        // if directory
        const dir = name;
        fsp.readdir(dir).then(async (files) => {
          // get all files
          const promises = [];
          files.forEach((file) => {
            // list it again
            promises.push(listImageFiles(dir + path.sep + file));
          });
          const paths:Array<string[]> = await Promise.all(promises);
          const all = [];
          paths.forEach((result) => {
            Array.prototype.push.apply(all, result);
          });
          resolve(all);
        }).catch((err) => {
          reject(err);
        });
      } else if (name.endsWith('.jpg') ||
                 name.endsWith('.JPG') ||
                 name.endsWith('.jpeg') ||
                 name.endsWith('.JPEG')) {
        resolve([name]);
      } else {
        resolve([]);
      }
    }).catch((err) => {
      reject(err);
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
    this.load();
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
  load() {
    try {
      const buffer = fs.readFileSync(`${this.myImagesRoot}.images/database.json`);
      const obj = JSON.parse(buffer.toString('utf-8'));
      this.dirMap = new Map<string, string>(obj.dirMap);
      this.reverseDirMap = new Map<string, string>();
      for (let key of this.dirMap.keys()) {
        this.reverseDirMap.set(this.dirMap.get(key), key);
      }
      this.imagesByName = new Map<string, any>(obj.imagesByName);
    } catch (err) {
      this.dirMap = new Map();
      this.reverseDirMap = new Map();
      this.imagesByName = new Map();
    }
  }
  save() {
    const obj = {
      dirMap: [...this.dirMap],
      imagesByName: [...this.imagesByName],
    };
    fs.writeFileSync(`${this.myImagesRoot}.images/database.json`, JSON.stringify(obj));
    //console.log(`saved:dirMap:${obj.dirMap.length}:+imagesByName:${obj.imagesByName.length}`);
  }
  scan() {
    listImageFiles(this.name).then(async (files) => {
      this.total = files.length;
      this.prepared = 0;
      // Here, forEach cannot be used.
      for (let file of files) {
        const obj = path.parse(file);
        const shrinkDir = this.getShrinkDir(obj.dir);
        const key = shrinkDir + path.sep + obj.name + '.webp';
        const imageData:any = {};
        imageData.fullPath = file;
        imageData.hash = await calcHash(file);
        this.imagesByName.set(key, imageData);
        this.prepared++;
        if ((this.prepared % 10) === 0) {
          this.save();
        }
      }
      this.save();
    }).catch((err) => {
      console.log(err);
    });
  }
  getThumbnail(key:string):Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const image = this.myImagesRoot + '.images/' + key;
      fs.stat(image, (err, stats) => {
        if (!err) {
          //console.log('image:found:' + image);
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
            .resize(640)
            .toBuffer()
            .then((data) => {
              //console.log('data.length:' + data.length);
              //console.log('image:' + image + ':saved');
              fs.writeFileSync(image, data);
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
    const parsedUrl = url.parse(request.url); 
    if (parsedUrl.pathname === '/') {
      parsedUrl.pathname = '/index.html';
    }
    if (parsedUrl.pathname.startsWith('/cache/')) {
      const json:any = {};
      if (parsedUrl.pathname === '/cache/summary') {
        json.preparedImages = scanner.prepared;
        json.totalImages =  scanner.total;
        response.write(JSON.stringify(json));
        response.end();
        return;
      }
      if (parsedUrl.pathname === '/cache/images') {
        response.write(JSON.stringify([...scanner.imagesByName]));
        response.end();
        return;
      }
      const key = decodeURIComponent(parsedUrl.pathname.slice('/cache/'.length));
      console.log(`getThumbnail:${key}`);
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
    const file = myImagesRoot + 'websrc' + parsedUrl.pathname;
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
