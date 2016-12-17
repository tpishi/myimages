'use strict';

import fs = require('fs');
import fsp = require('./fsp');
import crypto = require('crypto');
import http = require('http');
import path = require('path');
import url = require('url');
import sharp = require('sharp');
import exif = require('fast-exif');

import * as express from 'express';

function listImageFiles(name:string):Promise<Array<any>> {
  return new Promise((resolve, reject) => {
    const parsed = path.parse(name);
    if (parsed.base.startsWith('.')) {
      console.log('ignored name:' + name);
      resolve([]);
      return;
    }
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
        resolve([{
          name: name,
          mtime: stats.mtime,
        }]);
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

function getPhotoTimeFromExif(file:string, exifData:any):any {
  const ret:any = {};
  if ('exif' in exifData) {
    if ('TimeZoneOffset' in exifData.exif) {
      console.log(`TimeZoneOffset:${exifData.exif.TimeZoneOffset}`);
      ret.TimeZoneOffst = exifData.exif.TimeZoneOffset;
    }
    //console.log('' + JSON.stringify(exifData));
    if ('DateTimeDigitized' in exifData.exif) {
      ret.DateTimeDigitized = exifData.exif.DateTimeDigitized;
    }
    if ('DateTimeOriginal' in exifData.exif) {
      ret.DateTimeOriginal = exifData.exif.DateTimeOriginal;
    }
    if ('DateTime' in exifData.exif) {
      ret.DateTime = exifData.exif.DateTime;
    }
  }
  if ('gps' in exifData) {
    //console.log('gps:' + JSON.stringify(exifData.gps));
    const d = new Date();
    if ('GPSDateStamp' in exifData.gps) {
      ret.GPSDateStamp = exifData.gps.GPSDateStamp;
      const ymd = ret.GPSDateStamp.split(':');
      const yy = parseInt(ymd[0]);
      const mm = parseInt(ymd[1]);
      const dd = parseInt(ymd[2]);
      d.setUTCFullYear(yy);
      d.setUTCMonth(mm);
      d.setUTCDate(dd);
    }
    if ('GPSTimeStamp' in exifData.gps) {
      ret.GPSTimeStamp = exifData.gps.GPSTimeStamp;
      const hms = ret.GPSTimeStamp;
      const hh = hms[0];
      const mm = hms[1];
      const ss = hms[2];
      d.setUTCHours(hh);
      d.setUTCMinutes(mm);
      d.setUTCSeconds(ss);
      d.setUTCMilliseconds(0);
    }
    ret.calcDateTime = d;
  }
  return ret;
}

function getPhotoTime(file:string):Promise<any> {
  return new Promise((resolve, reject) => {
    const empty:any = {};
    exif.read(file)
        .then((exifData) => {
          if (exifData === null) {
            exif.read(file, true)
                .then((exifData) => {
                  if (exifData === null) {
                    //console.log(`${file}:exifData === null`);
                    resolve(empty);
                    return;
                  }
                  resolve(getPhotoTimeFromExif(file, exifData));
                })
                .catch((err) => {
                  console.log(`${file}:${err}`);
                  resolve(empty);
                })
            return;
          }
          resolve(getPhotoTimeFromExif(file, exifData));
        })
        .catch((err) => {
          console.log(`${file}:${err}`);
          resolve(empty);
        });
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
      for (let fileObj of files) {
        const obj = path.parse(fileObj.name);
        const shrinkDir = this.getShrinkDir(obj.dir);
        const key = shrinkDir + path.sep + obj.name + '.webp';
        const imageData:any = {};
        imageData.fullPath = fileObj.name;
        imageData.mtime = fileObj.mtime.getTime();
        imageData.hash = await calcHash(fileObj.name);
        const exifTime = await getPhotoTime(fileObj.name);
        if ('DateTimeOriginal' in exifTime) {
          const src = exifTime.DateTimeOriginal;
          const dd = new Date();
          dd.setFullYear(src.getUTCFullYear());
          dd.setMonth(src.getUTCMonth());
          dd.setDate(src.getUTCDate());
          dd.setHours(src.getUTCHours());
          dd.setMinutes(src.getUTCMinutes());
          dd.setSeconds(src.getUTCSeconds());
          dd.setMilliseconds(src.getUTCMilliseconds());
          imageData.localTime = dd.getTime();
        }
        this.imagesByName.set(key, imageData);
        this.prepared++;
        if ((this.prepared % 10) === 0) {
          console.log(`${this.prepared}/${this.total}`);
          this.save();
        }
      }
      console.log(`${this.prepared}/${this.total}`);
      this.save();
    }).catch((err) => {
      console.log(err);
    });
  }
  getRawImage(key:string):Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const fullPath = this.imagesByName.get(key).fullPath;
      fs.readFile(fullPath, (err, data) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(data);
      });
    });
  }
  createThumbnail(key:string, width:number):Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const fullPath = this.imagesByName.get(key).fullPath;
      sharp(fullPath)
        .resize(width)
        .toBuffer()
        .then((data) => {
          resolve(data);
        })
        .catch((err) => {
          reject(err);
        });
    });
  }
  getThumbnail(key:string, width:number):Promise<Buffer> {
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
          this
            .createThumbnail(key, width)
            .then((data) => {
              console.log('image:' + image + ':saved');
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
  const app = express();
  app.listen(8080);
  app.get('/cache/summary', (request, response) => {
    response.json({
      preparedImages: scanner.prepared,
      totalImages: scanner.total,
    });
  });
  app.get('/cache/images', (request, response) => {
    const array = [...scanner.imagesByName];
    array.sort((a, b) => {
      const aTime = (a[1].localTime) ? a[1].localTime: a[1].mtime;
      const bTime = (b[1].localTime) ? b[1].localTime: b[1].mtime;
      return bTime - aTime;
    });
    response.json(array);
  });
  app.use('/cache/check', (request, response) => {
    const parsedUrl = url.parse(request.url);
    const key = decodeURIComponent(parsedUrl.pathname.substr(1));
    console.log(`getThumbnail:${key}`);
    scanner.getThumbnail(key, 200)
           .then((data) => {
             response.send('');
           })
           .catch((err) => {
             response.status(404).send(`${err}`);
           });
  });
  app.use('/raw', (request, response) => {
    const parsedUrl = url.parse(request.url);
    const key = decodeURIComponent(parsedUrl.pathname.substr(1)).slice(0,-4);
    console.log(`getRawImage:${key}`);
    scanner.getRawImage(key)
           .then((data) => {
             response.send(data);
           })
           .catch((err) => {
             response.status(404).send(`${err}`);
           });
  });
  app.use('/cache', (request, response) => {
    const parsedUrl = url.parse(request.url);
    const key = decodeURIComponent(parsedUrl.pathname.substr(1));
    console.log(`getThumbnail:${key}`);
    scanner.getThumbnail(key, 200)
           .then((data) => {
             response.send(data);
           })
           .catch((err) => {
             response.status(404).send(`${err}`);
           });
  });
  app.use(express.static('websrc'));
  scanner.scan();
}

const myImagesRoot:string = process.argv[1].replace('lib/main.js', '');
const imageroot:string = path.resolve(process.argv[2]);

main(myImagesRoot, imageroot);
