'use strict';

var PluginError = require('gulp-util').PluginError;
var Transform   = require('stream').Transform;
var isEqual     = require('lodash.isequal');

var compareOrder = require('./compare-order');

const Resource = require('./resource');

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

    const injects = [() => files.slice()];
    if (options.inject && Array.isArray(options.inject)) {
      injects.push.apply(injects, options.inject);
    } else if (options.inject) {
      injects.push(options.inject);
    }

    const storedResources = [];
    const resourceGroup = {};
    const filepaths = {};

    const proceedFiles = files => {
      let resources = files.map(file => new Resource(file, options));
      if (!options.draft) {
        resources = resources.filter(resource => !resource.draft);
      }

      resources.forEach(resource => resource._file.data = resource);

      // check duplicates, resource._file.path
      resources.forEach(resource => {
        if (resource.filepath in filepaths) {
          throw new PluginError('gulp-minisite', [
            'creating two files into the same path: ' + resource.filepath,
            'file 1: ' + filepaths[resource.filepath]._srcRelative,
            'file 2: ' + resource._srcRelative,
          ].join('\n'));
        }
        filepaths[resource.filepath] = resource;
        resource._file.path = resource.filepath
      });

      const documents = resources
        .filter(resource => resource.document);

      documents.forEach(resource => {
        // references
        global[resource.locale].references[resource.resourceId] = resource;

        // collections
        if (!resource.index) {
          if (!global[resource.locale].collections[resource.collectionId]) {
            global[resource.locale].collections[resource.collectionId] = [];
          }
          global[resource.locale].collections[resource.collectionId].push(resource);
        }

        // pages
        global[resource.locale].pages.push(resource);
      });

      documents.forEach(resource => {
        // resource.locales
        if (!resourceGroup[resource.resourceId]) {
          resourceGroup[resource.resourceId] = {};
        }
        resourceGroup[resource.resourceId][resource.locale] = resource;
        resource.locales = resourceGroup[resource.resourceId];

        // resource.collection
        if (!global[resource.locale].collections[resource.resourceId]) {
          global[resource.locale].collections[resource.resourceId] = [];
        }
        resource.collection = global[resource.locale].collections[resource.resourceId];
      });

      locales.forEach(locale => {
        for (const collectionId in global[locale].collections) {
          // collections sort, resource.prev, resource.next
          global[locale].collections[collectionId]
            .sort(compareOrder)
            .reduce((prev, curr) => {
              curr.prev = prev;
              curr.next = null;
              if (prev) prev.next = curr;
              return curr;
            }, null);
        }
      });

      storedResources.push.apply(storedResources, resources);
    };

    injects
      .reduce((promise, inject) => {
        return promise.then(() => inject(global, options)).then(proceedFiles);
      }, Promise.resolve())
      .then(() => {
        storedResources
          .filter(resource => resource.document)
          .forEach(resource => {
            if (!resource.template) {
              resource._file.contents = new Buffer(resource.body, 'utf8');
              return;
            }

            const context = {
              page:        resource,
              site:        global[resource.locale].site,
              pages:       global[resource.locale].pages,
              collections: global[resource.locale].collections,
              references:  global[resource.locale].references,
              global:      global,
            };
            const contents = options.templateEngine(resource.template, context);
            resource._file.contents = new Buffer(contents, 'utf8');
          });

        storedResources
          .map(resource => resource._file)
          .forEach(stream.push.bind(stream));

        done();
      })
      .catch(e => {
        done(new PluginError('gulp-minisite', e.message));
      });

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
