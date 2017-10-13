'use strict';

const fm   = require('front-matter');
const path = require('path');
const yaml = require('js-yaml');

module.exports = class Resource {

  // file: Vinyl
  // options: object
  // options.locales: [...string]?
  // options.defaultLocale: string?
  // options.documentTypes: [...string]?
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
    const srcBasename = path.basename(file.relative, path.extname(file.relative));

    // example:
    // - []
    // - ['foo']
    // - ['foo', 'bar']
    const srcDirnames = path.dirname(file.relative).split(path.sep).filter(x => x !== '.');

    const matches = srcBasename.match(/^(\.)?(?:#([^.]*)\.)?(.+?)(?:\.([^.]+))?$/);
    const hidden  = !!matches[1];
    const order   = matches[2];
    const slug    = matches[3];
    const locale  = matches[4];

    // # hidden
    //
    // example:
    // - true
    // - false
    this.hidden = hidden;

    // # order
    //
    // example:
    // - null
    // - '001'
    // - '2017-01-01'
    this.order = order || null;

    // # slug, locale
    //
    if (options.locales && options.locales.includes(locale)) {

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
    if (options.documentTypes && options.documentTypes.includes(srcExtname)) {
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
    this.dirnames.push(...srcDirnames);
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
      this.path = path.join('/', ...this.dirnames);
    } else {
      // example:
      // - '/foo.html'
      // - '/foo/bar.json'
      // - '/foo/bar/baz.jpg'
      // - '/en/foo/bar/baz.mp3'
      this.path = path.join('/', ...this.dirnames, `${this.slug}.${srcExtname}`);
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
      this.filepath = path.join(file.base, ...this.dirnames, 'index.html');
    } else {
      // example:
      // - '/root/user/project/foo.html'
      // - '/root/user/project/foo/bar.json'
      // - '/root/user/project/foo/bar/baz.jpg'
      // - '/root/user/project/en/foo/bar/baz.jpg'
      this.filepath = path.join(file.base, ...this.dirnames, `${this.slug}.${srcExtname}`);
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
        const {attributes, body} = fm(contents);
        this.data = attributes;
        this.body = body;
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

    const json = JSON.stringify(Object.assign({}, this), (key, value) => {
      if (key.startsWith('_')) {
        return undefined;
      }
      if (value instanceof Resource) {
        return value.toString(true);
      }
      return value;
    }, 2);
    return `<Resource ${this._srcRelative} ${json}>`
  }

}
