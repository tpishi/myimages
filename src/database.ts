'use strict';

import fs = require('fs');
import path = require('path');
import * as sqlite3 from 'sqlite3';

export interface FileInfo {
  fullPath:string;
  mtime:number;
}

export interface ImageItem extends FileInfo {
  hash?:string;
  localTime?:number;
}

export interface Database {
  open(dbpath:string):Promise<void>;
  insertItem(info:FileInfo, localTime?:number):Promise<string>;
  updateHash(key:string, hash:string):Promise<void>;
  getItems():Promise<any>;
  getItem(key:string):Promise<ImageItem>;
  commit():Promise<void>;
}

abstract class DatabaseImpl implements Database {
  protected _dbpath:string;
  abstract open(dbpath:string):Promise<void>;
  abstract commit():Promise<void>;
  abstract updateHash(key:string, hash:string):Promise<void>;
  abstract getItems():Promise<Map<string,ImageItem>>;
  abstract getItem(key:string):Promise<ImageItem>;
  protected abstract getDirItem(dir:string):Promise<string>;
  protected abstract existsThumbnailDir(thumbnail:string):Promise<boolean>;
  protected abstract addDirItem(original:string, thumbnail:string):Promise<void>;
  protected abstract putItem(key:string, value:ImageItem):Promise<void>;
  private getThumbnailDirectory(realDirectory:string):Promise<string> {
    return new Promise<string>((resolve, reject) => {
      this.getDirItem(realDirectory).then(async (thumbnail) => {
        if (thumbnail === null) {
          let loop = true;
          let suggestion;
          while (loop) {
            loop = false;
            suggestion = ('0000000' + (Math.floor(Math.random() * 0x7fffffff).toString(16))).slice(-8);
            loop = await this.existsThumbnailDir(suggestion);
          }
          this.addDirItem(realDirectory, suggestion).then(() => {
            resolve(suggestion);
          });
        } else {
          resolve(thumbnail);
        }
      });
    });
  }
  createItem(info:FileInfo):Promise<ImageItem> {
    return new Promise((resolve, reject) => {
      const obj = path.parse(info.fullPath);
      this.getThumbnailDirectory(obj.dir).then((shrinkDir) => {
        const key = shrinkDir + path.sep + obj.name + '.webp';
        resolve({
          fullPath: info.fullPath,
          mtime: info.mtime,
        });
      });
    });
  }
  insertItem(info:FileInfo, localTime?:number):Promise<string> {
    return new Promise<string>(async (resolve, reject) => {
      const imageItem:ImageItem = await this.createItem(info);
      this.getKey(imageItem).then((key) => {
        if (typeof localTime !== 'undefined') {
          imageItem.localTime = localTime;
        }
        this.putItem(key, imageItem).then(() => {
          resolve(key);
        });
      });
    });
  }
  getKey(item:ImageItem):Promise<string> {
    return new Promise((resolve, reject) => {
      const obj = path.parse(item.fullPath);
      this.getThumbnailDirectory(obj.dir).then((thumbnailDir) => {
        resolve(thumbnailDir + path.sep + obj.name + '.webp');
      });
    });
  }
}

export class JSONDatabase extends DatabaseImpl {
  protected _dirMap:Map<string,string>;
  protected _reverseDirMap:Map<string,string>;
  protected _allItems:Map<string,ImageItem>;
  open(dbpath:string):Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this._dbpath = dbpath;
      try {
        const buffer = fs.readFileSync(this._dbpath);
        const obj = JSON.parse(buffer.toString('utf-8'));
        this._dirMap = new Map<string, string>(obj._dirMap);
        this._reverseDirMap = new Map<string, string>();
        for (let key of this._dirMap.keys()) {
          this._reverseDirMap.set(this._dirMap.get(key), key);
        }
        this._allItems = new Map<string, any>(obj._allItems);
      } catch (err) {
        this._dirMap = new Map();
        this._reverseDirMap = new Map();
        this._allItems = new Map();
      }
      resolve();
    });
  }
  existsThumbnailDir(thumbnail:string):Promise<boolean> {
    return new Promise((resolve, reject) => {
      resolve(this._reverseDirMap.has(thumbnail));
    });
  }
  getDirItem(dir):Promise<string> {
    return new Promise((resolve, reject) => {
      resolve(this._dirMap.has(dir) ? this._dirMap.get(dir): null);
    });
  }
  addDirItem(original, thumbnail):Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this._dirMap.set(original, thumbnail);
      this._reverseDirMap.set(thumbnail, original);
      resolve();
    });
  }
  commit():Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const obj = {
        _dirMap: [...this._dirMap],
        _allItems: [...this._allItems],
      };
      fs.writeFileSync(this._dbpath, JSON.stringify(obj));
      resolve();
    });
  }
  putItem(key:string, value:ImageItem):Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this._allItems.set(key, value);
      resolve();
    });
  }
  updateHash(key:string, hash:string):Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const item:ImageItem = this._allItems.get(key);
      item.hash = hash;
      resolve();
    });
  }
  getItems():Promise<Map<string,ImageItem>> {
    return new Promise<Map<string,ImageItem>>((resolve, reject) => {
      resolve(this._allItems);
    });
  }
  getItem(key:string):Promise<ImageItem> {
    return new Promise<ImageItem>((resolve, reject) => {
      resolve(this._allItems.get(key));
    });
  }
}

export class SQLiteDatabase extends DatabaseImpl {
  private _db;
  open(dbpath:string):Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this._db = new sqlite3.Database(dbpath);
      const SQL_INFO = 'CREATE TABLE IF NOT EXISTS info (id INTEGER PRIMARY KEY, thumbnailpath TEXT, fullPath TEXT, mtime INTEGER, localTime INTEGER NULL, hash TEXT NULL)';
      this._db.run(SQL_INFO, (err) => {
        if (err) {
          reject(err);
          return;
        }
        const SQL_DIR = 'CREATE TABLE IF NOT EXISTS directory (id INTEGER PRIMARY KEY, original TEXT, thumbnail TEXT)';
        this._db.run(SQL_DIR, (err) => {
          if (err) {
            reject(err);
            return;
          }
          resolve();
        });
      });
    });
  }
  existsThumbnailDir(thumbnail:string):Promise<boolean> {
    return new Promise((resolve, reject) => {
      const SQL = 'SELECT COUNT(*) FROM directory WHERE thumbnail = ?';
      this._db.get(SQL, [thumbnail], (err,row) => {
        if (err) {
          reject(err);
          return;
        }
        console.log(JSON.stringify(row));
        resolve(row['COUNT(*)'] !== 0);
      });
    });
  }
  getDirItem(dir):Promise<string> {
    //console.log('getDirItem:' + dir);
    return new Promise((resolve, reject) => {
      const SQL = 'SELECT * FROM directory WHERE original = ?';
      this._db.get(SQL, [dir], (err,row) => {
        if (err) {
          reject(err);
          return;
        }
        let thumbnail = null;
        if (row) {
          thumbnail = row.thumbnail;
        }
        resolve(thumbnail);
      });
    });
  }
  addDirItem(original, thumbnail):Promise<void> {
    console.log(`addDirItem:${original}, ${thumbnail}`);
    return new Promise<void>((resolve, reject) => {
      const SQL = 'INSERT INTO directory (original, thumbnail) values ( $original, $thumbnail )';
      this._db.run(SQL,
                   {$original: original, $thumbnail: thumbnail},
                   (err) => {
                     if (err) {
                       reject(err);
                       return;
                     }
                     resolve();
                   });
    });
  }

  updateHash(key:string, hash:string):Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const SQL = 'UPDATE info SET hash = $hash WHERE thumbnailpath = $thumbnailPath';
      this._db.run(SQL, {$hash:hash, $thumbnailPath:key}, (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      })
    });
  }

  commit():Promise<void> {
    return new Promise<void>((resolve, reject) => {
      resolve();
    });
  }
  putItem(key:string, item:ImageItem):Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let sql, args;
      if (typeof item.localTime !== 'undefined') {
        sql = 'INSERT INTO info (thumbnailPath, fullPath, mtime, localTime) values ( $thumbnailPath, $fullPath, $mtime, $localTime )';
        args = {
          $thumbnailPath: key,
          $fullPath: item.fullPath,
          $mtime: item.mtime,
          $localTime: item.localTime
        };
      } else {
        sql = 'INSERT INTO info (thumbnailPath, fullPath, mtime) values ( $thumbnailPath, $fullPath, $mtime )';
        args = {
          $thumbnailPath: key,
          $fullPath: item.fullPath,
          $mtime: item.mtime
        };
      }
      this._db.run(sql,
                   args,
                   (err) => {
                     if (err) {
                       reject(err);
                       return;
                     }
                     resolve();
                   });
    });
  }
  getItems():Promise<Map<string,ImageItem>> {
    return new Promise<Map<string,ImageItem>>((resolve, reject) => {
      console.log('getItems()');
      const SQL = 'SELECT * FROM info';
      this._db.all(SQL, (err,rows) => {
        if (err) {
          console.log('reject:' + err);
          reject(err);
          return;
        }
        console.log(JSON.stringify(rows));
        const map = new Map();
        rows.forEach((item) => {
          map.set(item.thumbnailpath, item);
        });
        console.log('getItems:' + JSON.stringify(map));
        //process.exit(1);
        resolve(map);
      });
    });
  }
  getItem(key:string):Promise<ImageItem> {
    return new Promise<ImageItem>((resolve, reject) => {
      const SQL = 'SELECT * FROM info WHERE thumbnailpath = ?';
      this._db.get(SQL, [key], (err,row) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(row);
      });
    });
  }
}