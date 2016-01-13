'use strict';

var PluginError = require('gulp-util').PluginError;
var assign      = require('lodash.assign');
var fm          = require('front-matter');
var isEqual     = require('lodash.isequal');
var path        = require('path');
var through     = require('through2');
var yaml        = require('js-yaml');

var compareOrder = require('./compare-order');
var parse        = require('./parse');

module.exports = function(options) {

  options = assign({
    defaultLocale:  null,
    locales:        null,
    site:           null,
    templateEngine: require('./engines/nunjucks')(),
    draft:          false,
    dataExtensions: ['yml', 'yaml', 'json'],
    inject:         null,
  }, options);

  // template data
  // =============

  var pages       = {};
  var collections = {};
  var references  = {};
  [''].concat(options.locales || []).forEach(function(locale) {
    pages[locale]       = [];
    collections[locale] = {};
    references[locale]  = {};
  });

  var site;
  if (
    options.locales &&
    options.locales.length &&
    isEqual(
      Object.keys(options.site || {})
        .filter(function(x) { return x }).sort(),
      options.locales.slice().sort()
    )
  ) {
    site = options.site;
  } else {
    site = (options.locales || [])
      .reduce(function(site, locale) {
        site[locale] = options.site;
        return site;
      }, {'': options.site});
  }

  // init file
  // =========

  var initFile = function(file) {
    var data = file.data = parse(file.relative, {locales: options.locales});

    // data.locale
    data.locale || (data.locale = options.defaultLocale);

    // data.document
    if (~(options.dataExtensions || []).indexOf(data.extname)) {
      data.document = 'data';
    } else if (fm.test(file.contents.toString())) {
      data.document = 'text';
    } else {
      data.document = false;
    }

    // data.filepaths
    data.filepaths = [];
    data.filepaths.push(data.locale === options.defaultLocale ? null : data.locale);
    data.filepaths.push.apply(data.filepaths, data.dirnames);
    if (data.document) {
      data.filepaths.push(data.index ? null : data.slug);
      data.filepaths.push('index.html');
    } else {
      data.filepaths.push(data.slug + '.' + data.extname);
    }
    data.filepaths = data.filepaths.filter(function(x) { return x });

    // data.filepath
    data.filepath = path.join.apply(path, data.filepaths);

    // file.path
    file.path = path.join(file.base, data.filepath);

    return file;
  };

  // check duplicates
  // ================

  var checkDuplicates = (function() {
    var paths = {};
    return function(file) {
      if (file.path in paths) {
        throw new PluginError('gulp-minisite', [
          'creating two files into the same path: ' + file.path,
          'file 1: ' + paths[file.path].relative,
          'file 2: ' + file.relative,
        ].join('\n'));
      }
      paths[file.path] = file;
    };
  })();

  // init doc
  // ========

  var initDoc = (function() {
    var resourceGroup = {};

    return function(file) {
      var data   = file.data;
      var locale = data.locale || '';

      // data.resourceId
      data.resourceId = data.dirnames.concat(data.index ? [] : [data.slug]).join('/');
      // references
      references[locale][data.resourceId] = data;
      // data.locales
      resourceGroup[data.resourceId] || (resourceGroup[data.resourceId] = {});
      resourceGroup[data.resourceId][locale] = data;
      data.locales = resourceGroup[data.resourceId];

      // data.collectionId
      data.collectionId = data.dirnames.join('/');
      // collections
      if (!data.index) {
        collections[locale][data.collectionId] || (collections[locale][data.collectionId] = []);
        collections[locale][data.collectionId].push(data);
        collections[locale][data.collectionId].sort(compareOrder);
      }
      // data.collection
      collections[locale][data.resourceId] || (collections[locale][data.resourceId] = []);
      data.collection = collections[locale][data.resourceId];

      // data.paths
      data.paths = data.filepaths.slice(0, -1);
      data.paths.unshift('/');

      // data.path
      data.path = path.join.apply(path, data.paths);

      // pages
      pages[locale].push(data);

      // data & body
      if (data.document === 'data') {
        data.data = yaml.safeLoad(file.contents.toString());
        (data.data === undefined) && (data.data = {});
        data.body = '';
      } else if (data.document === 'text') {
        var fmData = fm(file.contents.toString());
        data.data  = fmData.attributes;
        data.body  = fmData.body;
      }
      // shallow attribute access
      for (var key in data.data) {
        if (key in data) {
          continue;
        }
        data[key] = data.data[key];
      }
    };
  })();

  // ===
  // ===

  var files = [];

  // transform
  // =========

  var transform = function(file, _, done) {
    if (file.isNull()) {
      return done(null, file);
    }
    if (file.isStream()) {
      return done(new PluginError('gulp-minisite', 'Streaming not supported'));
    }

    files.push(file);
    return done();
  };

  // flush
  // =====

  var flush = function(done) {
    if (!files.length) {
      return done();
    }

    var storedFiles = [];
    var storedDocs  = [];
    var tmpFiles = files.slice();
    var tmpDocs;

    var injects = options.inject ? (Array.isArray(options.inject) ? options.inject : [options.inject]) : [];
    var injectedFiles;

    while (injects.length || tmpFiles.length) {
      tmpFiles = tmpFiles
        .map(initFile)
        .filter(function(v) { return !v.data.draft || options.draft });

      try {
        tmpFiles.forEach(checkDuplicates);
      } catch (e) {
        return done(e);
      }

      tmpDocs = tmpFiles.filter(function(v) { return v.data.document });
      tmpDocs.forEach(initDoc);

      storedFiles = storedFiles.concat(tmpFiles);
      tmpFiles    = [];
      storedDocs  = storedDocs.concat(tmpDocs);
      tmpDocs     = [];

      if (injects.length) {
        tmpFiles = (injects.shift())({
          site:        site,
          pages:       pages,
          collections: collections,
          references:  references,
        }, options);
      }
    }

    // document rendering
    // ------------------

    storedDocs
      .forEach(function(file) {
        if (file.data.template) {
          var locale   = file.data.locale || '';
          var tmplName = file.data.template;
          var tmplData = {
            site:        site[locale],
            page:        file.data,
            pages:       pages[locale],
            collections: collections[locale],
            references:  references[locale],
            global:      {
              site:        site,
              pages:       pages,
              collections: collections,
              references:  references,
            },
          };
          file.contents = new Buffer(options.templateEngine(tmplName, tmplData), 'utf8');
        } else {
          file.contents = new Buffer(file.data.body, 'utf8');
        }
      });

    // pipe
    // ----

    storedFiles.forEach(this.push, this);

    // done
    // ----

    return done();
  };

  // through
  // =======

  return through.obj(transform, flush);
};
