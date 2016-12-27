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
  protected _dirMap:Map<string,string>;
  protected _reverseDirMap:Map<string,string>;
  protected _allItems:Map<string,ImageItem>;
  abstract open(dbpath:string):Promise<void>;
  abstract commit():Promise<void>;
  getThumbnailDirectory(realDirectory:string):Promise<string> {
    return new Promise<string>((resolve, reject) => {
      if (!this._dirMap.has(realDirectory)) {
        let loop = true;
        let suggestion;
        while (loop) {
          loop = false;
          suggestion = ('0000000' + (Math.floor(Math.random() * 0x7fffffff).toString(16))).slice(-8);
          if (this._reverseDirMap.has(suggestion)) {
            loop = true;
          }
        }
        this._dirMap.set(realDirectory, suggestion);
        this._reverseDirMap.set(suggestion, realDirectory);
      }
      resolve(this._dirMap.get(realDirectory));
    });
  }
  createItem(info:FileInfo):ImageItem {
    const obj = path.parse(info.fullPath);
    const shrinkDir = this.getThumbnailDirectory(obj.dir);
    const key = shrinkDir + path.sep + obj.name + '.webp';
    return {
      fullPath: info.fullPath,
      mtime: info.mtime,
    };
  }
  insertItem(info:FileInfo, localTime?:number):Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const imageItem:ImageItem = this.createItem(info);
      this.getKey(imageItem).then((key) => {
        if (typeof localTime !== 'undefined') {
          imageItem.localTime = localTime;
        }
        this.putItem(key, imageItem);
        resolve(key);
      });
    });
  }
  updateHash(key:string, hash:string):Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const item:ImageItem = this._allItems.get(key);
      item.hash = hash;
      resolve();
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
  putItem(key:string, value:ImageItem) {
    this._allItems.set(key, value);
  }
}

export class JSONDatabase extends DatabaseImpl {
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
}

const t1 = "create table if not exists directory (id integer primary key, original text, thumbnail text)";
const t2 = "create table if not exists info (id integer primary key, directoryid integer, mtime integer, localTime integer null, hash text null)";

export class SQLiteDatabase extends DatabaseImpl {
  private _db;
  private existsTable(tablename:string):Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      this._db.get("select count(*) from sqlite_master where type='table' and name=$name",
        { $name: tablename },
        (err, res) => {
          if (err) {
            console.log(err);
            reject(err);
            return;
          }
          resolve(res['count(*)'] === 1);
        });
    });
  }

  open(dbpath:string):Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this._db = new sqlite3.Database(dbpath);
      this._db.run(t1);
      this._db.run(t2);
      resolve();
    });
  }

  insertItem(info:FileInfo, localTime?:number):Promise<string> {
    return new Promise<string>((resolve, reject) => {


    });
  }
  updateHash(key:string, hash:string):Promise<void> {
    return new Promise<void>((resolve, reject) => {

    });
  }

  commit():Promise<void> {
    return new Promise<void>((resolve, reject) => {
      resolve();
    });
  }
}