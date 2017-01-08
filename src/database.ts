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

export interface TagInfo {
  tagName:string;
  numberOfImages:number;
}

export interface FilterOptions {
  descend:boolean;
  offset:number;
  limit:number;
  tags:Array<string>;
}

export interface Database {
  open(dbpath:string):Promise<void>;
  insertOrUpdateItem(info:FileInfo, exifTime?:number):Promise<number>;
  getItems(options:FilterOptions):Promise<Array<ImageItem>>;
  getItem(id:number):Promise<ImageItem>;
  updateItem(item:ImageItem):Promise<void>;
  getThumbnailPath(id:number):string;
  getTags():Promise<Array<TagInfo>>;
}

abstract class DatabaseImpl implements Database {
  protected _dbpath:string;
  abstract open(dbpath:string):Promise<void>;
  abstract getItems(options:FilterOptions):Promise<Array<ImageItem>>;
  abstract getItem(id:number):Promise<ImageItem>;
  abstract updateItem(item:ImageItem):Promise<void>;
  abstract getTags():Promise<Array<TagInfo>>;
  protected abstract insertItem(value:ImageItem):Promise<void>;
  protected abstract findImageId(item:ImageItem):Promise<number>;
  protected abstract removeSystemTags(item:ImageItem):Promise<void>;
  protected abstract addSystemTags(imageId:number):Promise<void>;
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
        return this.findImageId(item);
      })
      .then((id) => {
        if (typeof exifTime !== 'undefined') {
          imageItem.exifTime = exifTime;
        }
        if (id === -1) {
          return this.insertItem(imageItem);
        } else {
          return this.updateItem(imageItem);
        }
      })
      .then(() => {
        return this.findImageId(imageItem);
      })
      .then((imageId) => {
        return this.addSystemTags(imageId);
      })
      .then(() => {
        return this.findImageId(imageItem);
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
  findImageId(item:ImageItem):Promise<number> {
    const SQL = 'SELECT imageId FROM images WHERE fullPath = ?';
    return this.get(SQL, [item.fullPath]).then((row) => {
      return (row) ? row['imageId']: -1;
    });
  }

  updateItem(item:ImageItem):Promise<void> {
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
    return this.run(sql, args);
  }
  insertItem(item:ImageItem):Promise<void> {
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
    return this.run(sql, args);
  }
  getItems(options:FilterOptions):Promise<Array<ImageItem>> {
    console.log(`getItems(${JSON.stringify(options)})`);
    const SELECT = 'SELECT *, CASE WHEN exifTime IS NOT NULL THEN exifTime ELSE mtime END AS imageTime'
      + ' FROM imageTags'
      + ' JOIN images ON imageTags.imageId=images.imageId'
      + ' JOIN tags ON imageTags.tagId=tags.tagId';
    const WHERE =  ' WHERE tagName=?'
    const GROUPBY = ' GROUP BY imageTags.imageId';
    const ORDERBY = 'ORDER BY imageTime ' + ((options.descend) ? 'DESC': 'ASC');
    const LIMITOFFSET = 'LIMIT ? OFFSET ?';
    if (typeof options.tags !== 'undefined') {
      if (options.tags.length > 0) {
        const SQL = `${SELECT} ${WHERE} ${GROUPBY} ${ORDERBY} ${LIMITOFFSET}`;
        console.log(`${SQL}, ${options.tags[0]}`);
        return this.all(SQL, [options.tags[0], options.limit, options.offset]);
      }
    }
    const SQL = `${SELECT} ${GROUPBY} ${ORDERBY} ${LIMITOFFSET}`;
    return this.all(SQL, [options.limit, options.offset]);
  }
  getItem(imageId:number):Promise<ImageItem> {
    const SELECT = 'SELECT *, CASE WHEN exifTime IS NOT NULL THEN exifTime ELSE mtime END AS imageTime FROM images';
    const WHERE = ' WHERE imageId= ?';
    return this.get(`${SELECT} ${WHERE}`, [imageId]);
  }
  removeSystemTags(imageItem:ImageItem):Promise<void> {
    return this
      .findImageId(imageItem)
      .then((imageId) => {
      });
  }
  addSystemTags(imageId:number):Promise<void> {
    //console.log(`addSystemFiles`);
    let id;
    return this
      .getItem(imageId)
      .then((item) => {
        //console.log(`imageId:${imageId}, ${new Date(item.imageTime).getFullYear()}`);
        return this.addSystemTag(imageId, `S:${new Date(item.imageTime).getFullYear()}`);
      })
      .then(() => {
        return /*this.addImageTag()*/;
      });
  }
  addSystemTag(imageId:number, tag:string):Promise<number> {
    let tagId;
    return this
      .get('SELECT tagId FROM tags WHERE tagName = ?', [tag])
      .then((row) => {
        if (row) {
          return row.tagId;
        } else {
          return this
            .run('INSERT INTO tags (tagName) VALUES ( ? )', [tag])
            .then((obj) => {
              return obj.lastID;
            });
        }
      })
      .then((id) => {
        tagId = id;
        return this.get('SELECT * FROM imageTags WHERE imageId = ? AND tagId = ?', [imageId, tagId])
      })
      .then((row) => {
        if (row) {
          //console.log(`ROW:ALREADY EXIST`);
          return row.imageTagId;
        } else {
          //console.log(`imageId, tagId:${imageId}, ${tagId}`);
          return this
            .run('INSERT INTO imageTags (imageId, tagId) VALUES ( ? , ? )', [imageId, tagId])
            .then((obj) => {
              return obj.lastId;
            });
        }
      });
  }
  getTags():Promise<Array<TagInfo>> {
    const SQL = 'SELECT tags.tagName AS tagName, COUNT(*) AS numberOfImages FROM imageTags JOIN tags ON imageTags.tagId=tags.tagId GROUP BY imageTags.tagId';
    return this.all(SQL);
  }
}