'use strict';

const fm   = require('front-matter');
const path = require('path');
const yaml = require('js-yaml');

module.exports = class Resource {

  // file: Vinyl
  // options: object
  // options.locales: [...string]?
  // options.defaultLocale: string?
  // options.dataExtensions: [...string]?
  constructor(file, options) {
    this._file    = file;
    this._options = options || (options = {});

    this._srcRelative = file.relative;

    // example:
    // - 'yml'
    // - 'json'
    // - 'jpg'
    const srcExtname = path.extname(file.relative).slice(1);

    // example:
    // - 'foo'
    // - 'foo.en'
    // - '#001.foo.en'
    // - '_#001.foo.en'
    const srcBasename = path.basename(file.relative, path.extname(file.relative));

    // example:
    // - []
    // - ['foo']
    // - ['foo', 'bar']
    // - ['foo', 'bar', '_baz']
    const srcDirnames = path.dirname(file.relative).split(path.sep).filter(x => x !== '.');

    const matches = srcBasename.match(/^_?(?:#([^.]*)\.)?(.+?)(?:\.([^.]+))?$/);
    const order   = matches[1];
    const slug    = matches[2];
    const locale  = matches[3];

    // # draft
    //
    this.draft = srcDirnames.concat([srcBasename]).some(x => x.startsWith('_'));

    // # order
    //
    // example:
    // - null
    // - '001'
    // - '2017-01-01'
    this.order = order || null;

    // # slug, locale
    //
    if (options.locales && ~options.locales.indexOf(locale)) {

      // example:
      // - 'foo'
      this.slug = slug;

      // example:
      // - 'en'
      this.locale = locale;
    } else {

      // example:
      // - 'foo.en'
      this.slug = slug + (locale ? `.${locale}` : '');

      // example:
      // - null
      // - 'ja'
      this.locale = options.defaultLocale || '';
    }

    // # document
    //
    if (options.dataExtensions && ~options.dataExtensions.indexOf(srcExtname)) {
      this.document = true;
    } else {
      this.document = false;
    }

    // # index
    //
    if (this.document) {
      this.index = this.slug === 'index';
    } else {
      this.index = false;
    }

    // # dirnames
    //
    // example:
    // - []
    // - ['foo']
    // - ['foo', 'baz']
    // - ['foo', 'bar', 'baz']
    // - ['en', 'foo', 'bar', 'baz']
    this.dirnames = [];
    if (this.locale && this.locale !== options.defaultLocale) {
      this.dirnames.push(this.locale);
    }
    this.dirnames.push.apply(this.dirnames, srcDirnames.map(x => x.replace(/^_/g, '')));
    if (this.document && !this.index) {
      this.dirnames.push(this.slug);
    }

    // # path
    //
    if (this.document) {
      // example:
      // - '/'
      // - '/foo'
      // - '/foo/bar'
      // - '/foo/bar/baz'
      // - '/en/foo/bar/baz'
      this.path = path.join.apply(path, ['/'].concat(this.dirnames));
    } else {
      // example:
      // - '/foo.html'
      // - '/foo/bar.json'
      // - '/foo/bar/baz.jpg'
      // - '/en/foo/bar/baz.mp3'
      this.path = path.join.apply(path, ['/'].concat(this.dirnames, [`${this.slug}.${srcExtname}`]));
    }

    // # filepath
    //
    if (this.document) {
      // example:
      // - '/root/user/project/index.html'
      // - '/root/user/project/foo/index.html'
      // - '/root/user/project/foo/bar/index.html'
      // - '/root/user/project/foo/bar/baz/index.html'
      // - '/root/user/project/en/foo/bar/baz/index.html'
      this.filepath = path.join.apply(path, [file.base].concat(this.dirnames, ['index.html']));
    } else {
      // example:
      // - '/root/user/project/foo.html'
      // - '/root/user/project/foo/bar.json'
      // - '/root/user/project/foo/bar/baz.jpg'
      // - '/root/user/project/en/foo/bar/baz.jpg'
      this.filepath = path.join.apply(path, [file.base].concat(this.dirnames, [`${this.slug}.${srcExtname}`]));
    }

    // # resourceId
    //
    if (this.document && this.index) {
      // example:
      // - ''
      // - 'foo'
      // - 'foo/bar'
      // - 'foo/bar/baz'
      this.resourceId = srcDirnames.join('/');
    } else if (this.document && !this.index) {
      // example:
      // - 'foo'
      // - 'foo/bar'
      // - 'foo/bar/baz'
      this.resourceId = srcDirnames.concat([this.slug]).join('/');
    } else {
      // example:
      // - 'foo.html'
      // - 'foo/bar.json'
      // - 'foo/bar/baz.jpg'
      this.resourceId = srcDirnames.concat([`${this.slug}.${srcExtname}`]).join('/');
    }

    // # collectionId
    //
    // example:
    // - ''
    // - 'foo'
    // - 'foo/bar'
    // - 'foo/bar/baz'
    this.collectionId = srcDirnames.join('/');

    // # data, body
    //
    if (this.document) {
      const contents = file.contents.toString();
      if (fm.test(contents)) {
        const fmData = fm(contents);
        this.data = fmData.attributes;
        this.body = fmData.body;
      } else {
        this.data = yaml.safeLoad(contents);
        this.body = '';
      }
    } else {
      this.data = null;
      this.body = null;
    }

    // # locales (reserved)
    //
    // example:
    // - {'': <Resource>}
    // - {en: <Resource>, ja: <Resource>}
    this.locales = null;

    // # collection (reserved)
    //
    // example:
    // - []
    // - [<Resource>, <Resource>, <Resource>]
    this.collection = null;

    // # next, prev (reserved)
    //
    // example:
    // - null
    // - <Resource>
    this.next = null;
    this.prev = null;

    // # data assignment
    //
    if (this.data) {
      for (let key in this.data) {
        if (key in this) {
          console.warn(`${file.relative}: A property named “${key}” is not assigned to page object because the name is already reserved.`);
          continue;
        }
        this[key] = this.data[key];
      }
    }

  }

  toString(simple) {
    if (simple) {
      return `<Resource ${this._srcRelative}>`;
    }
    const reduceArray = (array, value) => {
      if (value === null) {
        array.push(value);
      } else if (value instanceof Resource) {
        array.push(value.toString(true));
      } else if (Array.isArray(value)) {
        array.push(value.reduce(reduceArray, []));
      } else if (typeof value === 'object') {
        array.push(Object.keys(value).map(k => [k, value[k]]).reduce(reduceObject, {}));
      } else {
        array.push(value);
      }
      return array;
    };
    const reduceObject = (object, pair) => {
      const key = pair[0];
      const value = pair[1];
      if (value === null) {
        object[key] = value;
      } else if (value instanceof Resource) {
        object[key] = value.toString(true);
      } else if (Array.isArray(value)) {
        object[key] = value.reduce(reduceArray, []);
      } else if (typeof value === 'object') {
        object[key] = Object.keys(value).map(k => [k, value[k]]).reduce(reduceObject, {});
      } else {
        object[key] = value;
      }
      return object;
    };
    const object = Object.keys(this)
      .filter(k => !k.startsWith('_'))
      .map(k => [k, this[k]])
      .reduce(reduceObject, {});
    return `<Resource ${this._srcRelative} ${JSON.stringify(object, null, 2)}>`;
  }

}
