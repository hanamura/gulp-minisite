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
      try {
        tmpDocs.forEach(initDoc);
      } catch (e) {
        return done(e);
      }

      storedFiles = storedFiles.concat(tmpFiles);
      tmpFiles    = [];
      storedDocs  = storedDocs.concat(tmpDocs);
      tmpDocs     = [];

      if (injects.length) {
        tmpFiles = (injects.shift())(global, options);
      }
    }

    // document rendering
    // ------------------

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

    // pipe
    // ----

    storedFiles.forEach(stream.push, stream);

    // done
    // ----

    return done();
  };

  // through
  // =======

  var stream = through.obj(transform, flush);
  return stream;
};
