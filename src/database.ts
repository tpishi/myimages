'use strict';

import fs = require('fs');
import path = require('path');
import * as sqlite3 from 'sqlite3';

const MAX_FILES_PER_DIRECTORY = 32768;

export interface FileInfo {
  fullPath:string;
  mtime:number;
}

export interface ImageItem extends FileInfo {
  imageTime:number;
  hash?:string;
  exifTime?:number;
}

export interface FilterOptions {
  descend:boolean;
  offset:number;
  limit:number;
}

export interface Database {
  open(dbpath:string):Promise<void>;
  insertOrUpdateItem(info:FileInfo, exifTime?:number):Promise<number>;
  getItems(options:FilterOptions):Promise<Array<ImageItem>>;
  getItem(id:number):Promise<ImageItem>;
  updateItem(item:ImageItem):Promise<number>;
  getThumbnailPath(id:number):string;
}

abstract class DatabaseImpl implements Database {
  protected _dbpath:string;
  abstract open(dbpath:string):Promise<void>;
  abstract getItems(options:FilterOptions):Promise<Array<ImageItem>>;
  abstract getItem(id:number):Promise<ImageItem>;
  abstract updateItem(item:ImageItem):Promise<number>;
  protected abstract insertItem(value:ImageItem):Promise<number>;
  protected abstract findId(item:ImageItem):Promise<number>;
  createItem(info:FileInfo):Promise<ImageItem> {
    return new Promise((resolve, reject) => {
      resolve({
        fullPath: info.fullPath,
        mtime: info.mtime,
      });
    });
  }
  insertOrUpdateItem(info:FileInfo, exifTime?:number):Promise<number> {
    let imageItem:ImageItem;
    return this
      .createItem(info)
      .then((item) => {
        imageItem = item;
        return this.findId(item);
      })
      .then((imageId) => {
        if (typeof exifTime !== 'undefined') {
          imageItem.exifTime = exifTime;
        }
        if (imageId === -1) {
          return this.insertItem(imageItem);
        } else {
          return this.updateItem(imageItem);
        }
      });
  }
  protected getIdFromThumbnailPath(thumbnailPath:string):number {
    const parent = parseInt(thumbnailPath.slice(0, 4), 16);
    const name = parseInt(thumbnailPath.slice(5, 9), 16);
    const imageId = parent*MAX_FILES_PER_DIRECTORY + name;
    //console.log(`getIdFromThumbnailPath:${thumbnailPath},${id}`);
    return imageId;
  }
  getThumbnailPath(imageId:number):string {
    const parent = ('0000' + Math.floor(imageId / MAX_FILES_PER_DIRECTORY).toString(16)).slice(-4);
    const name = ('0000' + (imageId % MAX_FILES_PER_DIRECTORY).toString(16)).slice(-4);
    return parent + path.sep + name + '.webp';
  }
}

export class SQLiteDatabase extends DatabaseImpl {
  private _db;

  private run(sql:string, args?:any):Promise<any> {
    return new Promise<any>((resolve, reject) => {
      this._db.run(sql, args, function (err) {
        if (err) {
          console.log(`run:${err}`);
          reject(err);
          return;
        }
        const obj = this;
        resolve(obj);
      });
    });
  }
  private get(sql:string, args?:any):Promise<any> {
    return new Promise<any>((resolve, reject) => {
      this._db.get(sql, args, (err, row) => {
        if (err) {
          console.log(`get:${err}`);
          reject(err);
          return;
        }
        resolve(row);
      });
    })
  }
  private all(sql:string, args?:any):Promise<Array<any>> {
    return new Promise<Array<any>>((resolve, reject) => {
      this._db.all(sql, args, (err,rows) => {
        if (err) {
          console.log(`all:${err}`);
          reject(err);
          return;
        }
        resolve(rows);
      });
    });
  }

  open(dbpath:string):Promise<void> {
    this._db = new sqlite3.Database(dbpath);
    return this
      .run('PRAGMA foreign_keys=1')
      .then(() => {
        const array:Array<Promise<any>> = [
          this.run('CREATE TABLE IF NOT EXISTS images (imageId INTEGER PRIMARY KEY, fullPath TEXT UNIQUE, mtime INTEGER, exifTime INTEGER NULL, hash TEXT NULL)'),
          this.run('CREATE TABLE IF NOT EXISTS tags (tagId INTEGER PRIMARY KEY, tagName TEXT UNIQUE)'),
          this.run('CREATE TABLE IF NOT EXISTS imageTags (imageTagId INTEGER PRIMARY KEY, imageId INTEGER, tagId INTEGER)'),
        ];
        return Promise.all(array);
      });
  }
  findId(item:ImageItem):Promise<number> {
    const SQL = 'SELECT imageId FROM images WHERE fullPath = ?';
    return this.get(SQL, [item.fullPath]).then((row) => {
      return (row) ? row['imageId']: -1;
    });
  }

  updateItem(item:ImageItem):Promise<number> {
    let sql:string = 'UPDATE images SET mtime = $mtime';
    const args:any = {
      $mtime: item.mtime,
    };
    if (Number.isInteger(item.exifTime)) {
      sql += ', exifTime = $exifTime';
      args.$exifTime = item.exifTime;
    } else {
      sql += ', exifTime = NULL';
    }
    if (item.hash) {
      sql += ' , hash = $hash';
      args.$hash = item.hash;
    } else {
      sql += ' , hash = NULL';
    }
    sql += ' WHERE fullPath = $fullPath';
    args.$fullPath = item.fullPath;
    //console.log('SQL:' + sql);
    //console.log('args:' + JSON.stringify(args));
    return this
      .run(sql, args)
      .then(() => {
        return this.findId(item);
      });
  }
  insertItem(item:ImageItem):Promise<number> {
    let sql, args;
    if (typeof item.exifTime !== 'undefined') {
      sql = 'INSERT INTO images (fullPath, mtime, exifTime) values ( $fullPath, $mtime, $exifTime )';
      args = {
        $fullPath: item.fullPath,
        $mtime: item.mtime,
        $exifTime: item.exifTime
      };
    } else {
      sql = 'INSERT INTO images (fullPath, mtime) values ( $fullPath, $mtime )';
      args = {
        $fullPath: item.fullPath,
        $mtime: item.mtime
      };
    }
    return this
      .run(sql, args)
      .then(() => {
        return this.findId(item);
      });
  }
  getItems(options:FilterOptions):Promise<Array<ImageItem>> {
    console.log(`getItems(${JSON.stringify(options)})`);
    const SELECT = 'SELECT *, CASE WHEN exifTime IS NOT NULL THEN exifTime ELSE mtime END AS imageTime FROM images';
    const ORDERBY = 'ORDER BY imageTime ' + ((options.descend) ? 'DESC': 'ASC');
    const LIMITOFFSET = 'LIMIT ? OFFSET ?';
    const SQL = `${SELECT} ${ORDERBY} ${LIMITOFFSET}`;
    return this.all(SQL, [options.limit, options.offset]);
  }
  getItem(imageId:number):Promise<ImageItem> {
    const SELECT = 'SELECT *, CASE WHEN exifTime IS NOT NULL THEN exifTime ELSE mtime END AS imageTime FROM images';
    const WHERE = ' WHERE imageId= ?';
    return this.get(`${SELECT} ${WHERE}`, [imageId]);
  }
}