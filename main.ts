'use strict';

import fs = require('fs');
import crypto = require('crypto');
import http = require('http');
import Rx = require('rxjs/Rx');

function dir(path:string):Promise<Array<string>> {
  return new Promise((resolve, reject) => {
    fs.readdir(path, async (err, files) => {
      if (err) {
        reject(err);
        return;
      }
      const promises = [];
      files.forEach((file) => {
        promises.push(stat(path + '/' + file));
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

function stat(path:string):Promise<Array<string>> {
  return new Promise((resolve, reject) => {
    fs.stat(path, async (err, stats) => {
      if (err) {
        reject(err);
        return;
      }
      if (stats.isDirectory()) {
        const paths = await dir(path);
        resolve(paths);
      } else if (path.endsWith('.jpg') ||
                 path.endsWith('.JPG') ||
                 path.endsWith('.jpeg') ||
                 path.endsWith('.JPEG')) {
        resolve([path]);
      } else {
        resolve([]);
      }
    });
  });
}

async function calcHash(path) {
  return new Promise((resolve, reject) => {
    console.log('path:' + path);
    const hash = crypto.createHash('sha1');
    const data = fs.readFileSync(path);
    hash.update(data);
    const result = hash.digest().toString('hex');
    console.log('result:' + result);
    resolve(result);
  });
}

function wait(idle) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      resolve();
    }, idle);
  });
}

let processing:number = 0;
let total:number = 0;
stat(process.argv[2]).then((files) => {
  total = files.length;
  const observer = Rx.Observable.create(async (obs) => {
    // TODO: まだここがダメ。
    let index = 0;
    for (index = 0; index < total; index++) {
      let hash = await calcHash(files[index]);
      console.log('hash:' + hash);
      await wait(100);
      console.log('wait finish');
      obs.next({
        path: files[index],
        hash: hash
      });
      if (index === total - 1) {
        obs.complete();
      }
    }
    return () => {
      console.log('disposed');
    };
  });
  observer.subscribe((x) => {
    processing++;
    console.log('x:' + x + ':' + processing);
  }, (err) => {
    console.log('error');
  }, () => {
    console.log('complete');
  });
});

http.createServer((request, response) => {
  console.log('request');
  response.write('hello:' + processing + '/' + total);
  response.end();
}).listen(8080);
