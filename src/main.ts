'use strict';

import fs = require('fs');
import crypto = require('crypto');
import http = require('http');
import path = require('path');
import url = require('url');

import * as sharp from 'sharp';
import * as exif from 'fast-exif';
import * as bodyParser from 'body-parser';
import * as express from 'express';
import * as fsp from './fsp';
import * as db from './database';

function listImageFiles(name:string):Promise<Array<db.FileInfo>> {
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
          fullPath: name,
          mtime: stats.mtime.getTime(),
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
    const hash = crypto.createHash('sha1');
    hash.on('readable', () => {
      const data:any = hash.read();
      if (data) {
        resolve(data.toString('hex'));
      }
    });
    const stream = fs.createReadStream(file);
    stream.pipe(hash);
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
  database:db.Database;
  constructor(myImagesRoot:string, name:string) {
    this.myImagesRoot = myImagesRoot;
    this.name = name;
    if (name.endsWith(path.sep)) {
      this.name = name.slice(0, -1);
    }
    this.prepared = 0;
    this.total = 0;
    //this.database = new db.JSONDatabase();
    this.database = new db.SQLiteDatabase();//.open(`${this.myImagesRoot}.images/database.sqlite3`);
  }
  init():Promise<void> {
    //const test = new db.SQLiteDatabase().open(`${this.myImagesRoot}.images/database.sqlite3`);
    //test.addDirItem();
    //return this.database.open(`${this.myImagesRoot}.images/database.json`);
    return this.database.open(`${this.myImagesRoot}.images/database.sqlite3`);
  }
  scan() {
    listImageFiles(this.name).then(async (files) => {
      this.total = files.length;
      this.prepared = 0;
      const ids = [];
      // Here, forEach cannot be used.
      for (let fileObj of files) {
        const exifTime = await getPhotoTime(fileObj.fullPath);
        let localTime;
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
          localTime = dd.getTime();
        }
        //console.log(`${fileObj.fullPath}`);
        const id = await this.database.insertOrUpdateItem(fileObj, localTime);
        ids.push(id);
        this.prepared++;
        if ((this.prepared % 10) === 0) {
          console.log(`${this.prepared}/${this.total}`);
        }
      }
      for (let id of ids) {
        const value = await this.database.getItem(id);
        value.hash = await calcHash(value.fullPath);
        await this.database.updateItem(value);
        try {
          await this.getThumbnail(id, 400);
        } catch (err) {
          console.log(`await failed:${id} continue`);
        }
      }
      console.log(`${this.prepared}/${this.total}`);
    }).catch((err) => {
      console.log(err);
    });
  }
  createThumbnail(id:number, width:number):Promise<Buffer> {
    return new Promise(async (resolve, reject) => {
      const item = await this.database.getItem(id);
      sharp(item.fullPath)
        .resize(width)
        .toBuffer()
        .then((data) => {
          resolve(data);
        })
        .catch((err) => {
          console.log(`createThumbnail:err:${id}:${item.fullPath}:${err}`);
          reject(err);
        });
    });
  }
  getThumbnail(id:number, width:number):Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const image = this.myImagesRoot + '.images/' + this.database.getThumbnailPath(id);
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
            .createThumbnail(id, width)
            .then((data) => {
              //console.log('image:' + image + ':saved');
              fs.writeFileSync(image, data);
              resolve(data);
            })
            .catch((err) => {
              console.log(`key:${id}:${err}`);
              reject(err);
            });
        });
      });
    });
  }
}

function main(myImagesRoot:string, name:string) {
  let scanner:ImageScanner = new ImageScanner(myImagesRoot, name);
  scanner.init().then(() => {
    const app = express();
    app.listen(8080);
    app.use(bodyParser.urlencoded({
      extended: true
    }));
    app.use(bodyParser.json());
    app.get('/cache/summary', (request, response) => {
      response.json({
        preparedImages: scanner.prepared,
        totalImages: scanner.total,
      });
    });
    app.post('/cache/images', (request, response) => {
      console.log('request.body:' + JSON.stringify(request.body));
      const filterOptions:db.FilterOptions = {
        descend: (request.body.order === '-1'),
        offset: request.body.from,
        limit: request.body.maxImages,
      };
      scanner.database.getItems(filterOptions).then((array) => {
        console.log(`getItems():${JSON.stringify(array)}`);
        response.json(array);
      }).catch((err) => {
        response.status(404).send(`${err}`);
      });
    });
    app.use('/cache/check', (request, response) => {
      const parsedUrl = url.parse(request.url);
      const id = parseInt(decodeURIComponent(parsedUrl.pathname.substr(1)));
      //console.log(`getThumbnail:${id}`);
      scanner.getThumbnail(id, 400)
            .then((data) => {
              response.send('');
            })
            .catch((err) => {
              response.status(404).send(`${err}`);
            });
    });
    app.use('/raw', (request, response) => {
      const parsedUrl = url.parse(request.url);
      const id = parseInt(decodeURIComponent(parsedUrl.pathname.substr(1)).slice(0,-4));
      scanner.database.getItem(id).then((item) => {
        const fullPath = item.fullPath;
        fs.createReadStream(fullPath).pipe(response);
      }).catch((err) => {
        response.status(404).send(`${err}`);
      });
    });
    app.use('/cache', (request, response) => {
      const parsedUrl = url.parse(request.url);
      const id = parseInt(decodeURIComponent(parsedUrl.pathname.substr(1)));
      console.log(`getThumbnail:${id}`);
      scanner.getThumbnail(id, 400)
            .then((data) => {
              response.send(data);
            })
            .catch((err) => {
              response.status(404).send(`${err}`);
            });
    });
    app.use(express.static('websrc'));
    scanner.scan();
  });
}

const myImagesRoot:string = process.argv[1].replace('lib/main.js', '');
const imageroot:string = path.resolve(process.argv[2]);
fsp.stat(`${myImagesRoot}.images`)
  .then((stat) => {
    if (stat.isDirectory()) {
      main(myImagesRoot, imageroot);
      return;
    }
    console.log(`${myImagesRoot}.images already exist`);
    process.exit(1);
  })
  .catch((err) => {
    fsp.mkdir(`${myImagesRoot}.images`)
      .then(() => {
        main(myImagesRoot, imageroot);
      })
      .catch((err) => {
        if (err && err.code === 'EEXIST') {
          main(myImagesRoot, imageroot);
          return;
        }
        console.log(`${myImagesRoot}.images already exist`);
        process.exit(1);
      });
  });
