var PluginError = require('gulp-util').PluginError;
var assign      = require('lodash.assign');
var fm          = require('front-matter');
var isEqual     = require('lodash.isequal');
var path        = require('path');
var through     = require('through2');
var yaml        = require('js-yaml');

var parse = require('./parse');

module.exports = function(options) {

  options = assign({
    defaultLocale:  null,
    locales:        null,
    site:           null,
    templateEngine: require('./engines/nunjucks')(),
    draft:          false,
    dataExtensions: ['yml', 'yaml', 'json'],
  }, options);

  // ===
  // ===

  var vinyls = [];

  // transform
  // =========

  var transform = function(vinyl, _, done) {
    if (vinyl.isNull()) {
      return done(null, vinyl);
    }
    if (vinyl.isStream()) {
      return done(new PluginError('gulp-minisite', 'Streaming not supported'));
    }

    vinyls.push(vinyl);
    return done();
  };

  // flush
  // =====

  var flush = function(done) {
    if (!vinyls.length) {
      return done();
    }

    // common data
    // -----------

    vinyls = vinyls
      .map(function(vinyl) {
        var data = vinyl.data = parse(vinyl.relative, {locales: options.locales});

        // locale
        data.locale || (data.locale = options.defaultLocale);

        // document
        if (options.dataExtensions && ~options.dataExtensions.indexOf(data.extname)) {
          data.document = 'data';
        } else if (fm.test(vinyl.contents.toString())) {
          data.document = 'text';
        } else {
          data.document = false;
        }

        // filepaths
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

        // filepath
        data.filepath = path.join.apply(path, data.filepaths);

        // filepath
        vinyl.path = path.join(vinyl.base, data.filepath);

        return vinyl;
      })
      .filter(function(vinyl) { return !vinyl.data.draft || options.draft });

    // check error
    // -----------

    vinyls
      .reduce(function(paths, vinyl) {
        if (vinyl.path in paths) {
          done(new PluginError('gulp-minisite', [
            'creating two files into the same path: ' + vinyl.path,
            'file 1: ' + paths[vinyl.path].data.source,
            'file 2: ' + vinyl.data.source,
          ].join('\n')));
        }
        paths[vinyl.path] = vinyl;
        return paths;
      }, {});

    // document data
    // -------------

    var docs = vinyls.filter(function(vinyl) { return vinyl.data.document });

    docs
      .map(function(vinyl) {
        var data = vinyl.data;

        // resourceId
        data.resourceId = data.dirnames.concat(data.index ? [] : [data.slug]).join('/');

        // collectionId
        data.collectionId = data.dirnames.join('/');

        // paths
        data.paths = data.filepaths.slice(0, -1);
        data.paths.unshift('/');

        // path
        data.path = path.join.apply(path, data.paths);

        // locales
        data.locales = {};

        // data & body
        if (data.document === 'data') {
          data.data = yaml.safeLoad(vinyl.contents.toString());
          (data.data === undefined) && (data.data = {});
          data.body = '';
        } else if (data.document === 'text') {
          var fmData = fm(vinyl.contents.toString());
          data.data  = fmData.attributes;
          data.body  = fmData.body;
        }

        return data;
      })
      .forEach(function(data, i, dataList) {
        dataList
          .filter(function(d) { return d.resourceId === data.resourceId })
          .forEach(function(d) { data.locales[d.locale] = d });
      });

    // site
    // ----

    var site;
    if (
      options.locales &&
      options.locales.length &&
      isEqual(
        Object.keys(options.site || {})
          .filter(function(x) { return x }).sort(),
        (options.locales || []).slice().sort()
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

    // pages
    // -----

    var pages = docs
      .reduce(function(pages, vinyl) {
        var locale = vinyl.data.locale || '';
        pages[locale] || (pages[locale] = []);
        pages[locale].push(vinyl.data);
        return pages;
      }, {});

    // document collections
    // --------------------

    var sortees = [];
    var collections = docs
      .filter(function(vinyl) { return !vinyl.data.index })
      .reduce(function(collections, vinyl) {
        var locale = vinyl.data.locale || '';
        var id     = vinyl.data.collectionId;
        collections[locale]     || (collections[locale] = {});
        collections[locale][id] || sortees.push(collections[locale][id] = []);
        collections[locale][id].push(vinyl.data);
        return collections;
      }, {});

    // sort collections

    sortees.forEach(function(collection) {
      collection.sort(function(a, b) {
        var aOrder = a.order;
        var bOrder = b.order;

        if (aOrder !== undefined && bOrder !== undefined) {
          if (aOrder < bOrder) { return -1 }
          if (aOrder > bOrder) { return 1 }
        } else if (aOrder !== undefined) {
          return 1;
        } else if (bOrder !== undefined) {
          return -1;
        }

        var aSlug = a.slug;
        var bSlug = b.slug;

        if (aSlug < bSlug) { return -1 }
        if (aSlug > bSlug) { return 1 }

        return 0;
      });
    });

    // indexes to have collections

    docs
      .filter(function(vinyl) { return vinyl.data.index })
      .forEach(function(vinyl) {
        var locale = vinyl.data.locale || '';
        var id     = vinyl.data.collectionId;
        if (collections[locale] && collections[locale][id]) {
          vinyl.data.collection = collections[locale][id];
        } else {
          vinyl.data.collection = [];
        }
      });

    // references
    // ----------

    var references = docs
      .reduce(function(references, vinyl) {
        var locale = vinyl.data.locale || '';
        var id     = vinyl.data.resourceId;
        references[locale] || (references[locale] = {});
        references[locale][id] = vinyl.data;
        return references;
      }, {});

    // shallow attribute access
    // ------------------------

    docs
      .forEach(function(vinyl) {
        for (var key in vinyl.data.data) {
          if (key in vinyl.data) {
            continue;
          }
          vinyl.data[key] = vinyl.data.data[key];
        }
      });

    // document rendering
    // ------------------

    docs
      .forEach(function(vinyl) {
        if (vinyl.data.template) {
          var locale   = vinyl.data.locale || '';
          var tmplName = vinyl.data.template;
          var tmplData = {
            site:        site[locale],
            page:        vinyl.data,
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
          vinyl.contents = new Buffer(options.templateEngine(tmplName, tmplData), 'utf8');
        } else {
          vinyl.contents = new Buffer(vinyl.data.body, 'utf8');
        }
      });

    // pipe
    // ----

    vinyls
      .forEach(this.push.bind(this));

    // done
    // ----

    return done();
  };

  // through
  // =======

  return through.obj(transform, flush);
};
