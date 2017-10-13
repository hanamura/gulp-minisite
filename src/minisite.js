'use strict';

const File        = require('gulp-util').File;
const PluginError = require('gulp-util').PluginError;
const Transform   = require('stream').Transform;
const isEqual     = require('lodash.isequal');

const Resource     = require('./resource');
const assign       = require('./assign');
const compareOrder = require('./compare-order');

const PLUGIN_NAME = 'gulp-minisite';

module.exports = options => {

  options = Object.assign({
    defaultLocale: null,
    locales:       null,
    site:          null,
    render:        require('../engines/nunjucks')(),
    documentTypes: ['yml', 'yaml', 'json'],
    inject:        null,
    model:         Resource,
  }, options);

  // template data
  // =============

  const locales = [''].concat(options.locales || []);

  const multilocaleSite = (
    locales.length > 1 &&
    isEqual(
      Object.keys(options.site || {}).filter(x => x).sort(),
      options.locales.slice().sort()
    )
  );

  const global = {};
  locales.forEach(locale => {
    global[locale] = {
      pages:       [],
      collections: {},
      references:  {},
      site:        multilocaleSite ? options.site[locale] : options.site,
    };
  });

  // ===
  // ===

  const files = [];

  // transform
  // =========

  const transform = (file, _, done) => {
    if (file.isNull()) {
      return done(null, file);
    }
    if (file.isStream()) {
      return done(new PluginError(PLUGIN_NAME, 'Streaming not supported'));
    }

    files.push(file);
    return done();
  };

  // flush
  // =====

  const flush = done => {
    if (!files.length) {
      return done();
    }

    const injects = [() => files.slice()];
    if (options.inject && Array.isArray(options.inject)) {
      injects.push(...options.inject);
    } else if (options.inject) {
      injects.push(options.inject);
    }

    const storedResources = [];
    const resourceGroup = {};
    const filepaths = {};

    const proceedResources = resources => {
      resources.forEach(resource => resource._file.data = resource);

      // check duplicates, resource._file.path
      resources.forEach(resource => {
        if (resource.filepath in filepaths) {
          throw new Error([
            `creating two files into the same path: ${resource.filepath}`,
            `file 1: ${filepaths[resource.filepath]._srcRelative}`,
            `file 2: ${resource._srcRelative}`,
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

      storedResources.push(...resources);
    };

    injects
      .reduce((promise, inject) => {
        return promise
          .then(() => inject(global, options))
          .then(files => {
            files = Array.isArray(files) ? files : [files];

            files = files.map(file => {
              if (file instanceof File) return file;
              if (typeof file !== 'object') throw new Error('Invalid file');

              if (typeof file.contents === 'string') {
                file.contents = new Buffer(file.contents, 'utf8');
              }
              return new File(file);
            });

            const model = options.model;
            if (typeof model === 'function' && model.prototype instanceof Resource || model === Resource) {
              return files.map(file => new model(file, options));
            } else if (typeof model === 'function') {
              return Promise.all(files.map(file => Promise.resolve(model(file, options))));
            } else if (typeof model === 'object') {
              return files
                .map(file => new Resource(file, options))
                .map(resource => assign(resource, model));
            } else {
              return Promise.reject(new Error('Invalid model'));
            }
          })
          .then(proceedResources);
      }, Promise.resolve())
      .then(() => {
        const promises = storedResources
          .filter(resource => {
            if (!resource.document) {
              return true;
            }
            if (!resource.hidden) {
              return true;
            }
            return false;
          })
          .map(resource => {
            if (!resource.document) {
              return Promise.resolve(resource);
            }
            const context = {
              page:        resource,
              site:        global[resource.locale].site,
              pages:       global[resource.locale].pages,
              collections: global[resource.locale].collections,
              references:  global[resource.locale].references,
              global:      global,
            };
            return Promise.resolve()
              .then(() => options.render(context))
              .then(contents => {
                resource._file.contents = new Buffer(contents, 'utf8');
                return resource;
              });
          });

        return Promise.all(promises);
      })
      .then(resources => {
        resources.forEach(resource => stream.push(resource._file));
        done();
      })
      .catch(e => {
        done(new PluginError(PLUGIN_NAME, e.message));
      });

  };

  // stream
  // ======

  const stream = new Transform({
    objectMode: true,
    transform: transform,
    flush: flush,
  });
  return stream;
};

module.exports.Resource = Resource;
module.exports.engines = {};
module.exports.engines.nunjucks = require('../engines/nunjucks');
