'use strict';

var PluginError = require('gulp-util').PluginError;
var Transform   = require('stream').Transform;
var fm          = require('front-matter');
var isEqual     = require('lodash.isequal');
var path        = require('path');
var yaml        = require('js-yaml');

var compareOrder = require('./compare-order');
var parse        = require('./parse');

module.exports = function(options) {

  options = Object.assign({
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

  var locales = [''].concat(options.locales || []);

  var multilocaleSite = (
    locales.length > 1 &&
    isEqual(
      Object.keys(options.site || {}).filter(function(x) { return x }).sort(),
      options.locales.slice().sort()
    )
  );

  var global = {};
  locales.forEach(function(locale) {
    global[locale] = {
      pages:       [],
      collections: {},
      references:  {},
      site:        multilocaleSite ? options.site[locale] : options.site,
    };
  });

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
      global[locale].references[data.resourceId] = data;
      // data.locales
      resourceGroup[data.resourceId] || (resourceGroup[data.resourceId] = {});
      resourceGroup[data.resourceId][locale] = data;
      data.locales = resourceGroup[data.resourceId];

      // data.collectionId
      data.collectionId = data.dirnames.join('/');
      // collections
      if (!data.index) {
        global[locale].collections[data.collectionId] || (global[locale].collections[data.collectionId] = []);
        global[locale].collections[data.collectionId].push(data);
        global[locale].collections[data.collectionId].sort(compareOrder)
          .reduce(function(prev, curr) {
            curr.prev = prev;
            curr.next = null;
            if (!prev) return curr;
            return prev.next = curr;
          }, null);
      }
      // data.collection
      global[locale].collections[data.resourceId] || (global[locale].collections[data.resourceId] = []);
      data.collection = global[locale].collections[data.resourceId];

      // data.paths
      data.paths = data.filepaths.slice(0, -1);
      data.paths.unshift('/');

      // data.path
      data.path = path.join.apply(path, data.paths);

      // pages
      global[locale].pages.push(data);

      // data & body
      if (data.document === 'data') {
        try {
          data.data = yaml.safeLoad(file.contents.toString());
        } catch (e) {
          throw new PluginError('gulp-minisite', e.message);
        }
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

    const injects = [() => files.slice()];
    if (options.inject && Array.isArray(options.inject)) {
      injects.push.apply(injects, options.inject);
    } else if (options.inject) {
      injects.push(options.inject);
    }

    const proceedFiles = files => {
      files = files.map(initFile).filter(v => !v.data.draft || options.draft);
      files.forEach(checkDuplicates);
      const docs = files.filter(v => v.data.document);
      docs.forEach(initDoc);
      storedFiles = storedFiles.concat(files);
      storedDocs  = storedDocs.concat(docs);
    };

    injects
      .reduce((promise, inject) => {
        return promise.then(() => inject(global, options)).then(proceedFiles);
      }, Promise.resolve())
      .then(() => {
        for (var file of storedDocs) {
          if (file.data.template) {
            var locale   = file.data.locale || '';
            var tmplName = file.data.template;
            var tmplData = {
              page:        file.data,
              site:        global[locale].site,
              pages:       global[locale].pages,
              collections: global[locale].collections,
              references:  global[locale].references,
              global:      global,
            };
            try {
              file.contents = new Buffer(options.templateEngine(tmplName, tmplData), 'utf8');
            } catch (e) {
              return done(new PluginError('gulp-minisite', e.message));
            }
          } else {
            file.contents = new Buffer(file.data.body, 'utf8');
          }
        }
        storedFiles.forEach(stream.push.bind(stream));
        done();
      })
      .catch(done);

  };

  // stream
  // ======

  var stream = new Transform({
    objectMode: true,
    transform: transform,
    flush: flush,
  });
  return stream;
};
