var File   = require('gulp-util').File;
var array  = require('stream-array');
var assert = require('stream-assert');
var expect = require('chai').expect;
var yaml   = require('js-yaml');

var minisite = require('../src');

var create = function(filename, attr, body) {
  var contents = [];

  if (attr && body !== undefined) {
    contents.push('---', yaml.safeDump(attr), '---', body);
  } else if (attr) {
    contents.push(yaml.safeDump(attr));
  } else if (body !== undefined) {
    contents.push(body);
  }
  var content = contents.join('\n');

  return new File({
    cwd:      '/root/',
    base:     '/root/base',
    path:     '/root/base/' + filename,
    contents: new Buffer(content),
  });
};

var createEngine = function(tmpl) {
  var nunjucks = require('nunjucks');
  nunjucks.configure({noCache: true});
  return function(_, tmplData) {
    return nunjucks.renderString(tmpl, tmplData);
  };
};

describe('gulp-minisite', function() {
  describe('minisite()', function() {

    it('should output HTML', function(done) {
      array([create('hello.md', {}, '')])
        .pipe(minisite())
        .pipe(assert.length(1))
        .pipe(assert.first(function(file) {
          expect(file.path).to.equal('/root/base/hello/index.html');
        }))
        .pipe(assert.end(done));
    });

    it('should not output draft', function(done) {
      array([create('_hello.md', {}, '')])
        .pipe(minisite())
        .pipe(assert.length(0))
        .pipe(assert.end(done));
    });

    it('should output draft if options.draft is true', function(done) {
      array([create('_hello.md', {}, '')])
        .pipe(minisite({draft: true}))
        .pipe(assert.length(1))
        .pipe(assert.end(done));
    });

    it('should strip underscore of draft', function(done) {
      array([create('_hello.md', {}, '')])
        .pipe(minisite({draft: true}))
        .pipe(assert.length(1))
        .pipe(assert.first(function(file) {
          expect(file.path).to.equal('/root/base/hello/index.html');
        }))
        .pipe(assert.end(done));
    })

    it('should take file as draft if any parent directory starts with underscore', function(done) {
      array([create('path/_to/hello.md', {}, '')])
        .pipe(minisite())
        .pipe(assert.length(0))
        .pipe(assert.end(done));
    });

    it('should rearrange file path by locale', function(done) {
      array([create('hello.ja.md', {}, '')])
        .pipe(minisite({locales: ['ja'], defaultLocale: null}))
        .pipe(assert.length(1))
        .pipe(assert.first(function(file) {
          expect(file.path).to.equal('/root/base/ja/hello/index.html');
        }))
        .pipe(assert.end(done));
    });

    it('should understand default locale', function(done) {
      array([create('hello.ja.md', {}, '')])
        .pipe(minisite({locales: ['ja'], defaultLocale: 'ja'}))
        .pipe(assert.length(1))
        .pipe(assert.first(function(file) {
          expect(file.path).to.equal('/root/base/hello/index.html');
        }))
        .pipe(assert.end(done));
    });

    it('should strip order part of filename', function(done) {
      array([create('#01.hello.md', {}, '')])
        .pipe(minisite())
        .pipe(assert.length(1))
        .pipe(assert.first(function(file) {
          expect(file.path).to.equal('/root/base/hello/index.html');
        }))
        .pipe(assert.end(done));
    });

    it('should not transform from file into HTML if it has no attributes', function(done) {
      array([create('hello.md', null, '')])
        .pipe(minisite())
        .pipe(assert.length(1))
        .pipe(assert.first(function(file) {
          expect(file.path).to.equal('/root/base/hello.md');
        }))
        .pipe(assert.end(done));
    });

    it('should rearrange file path by locale even if it has no attributes', function(done) {
      array([create('hello.ja.md', null, '')])
        .pipe(minisite({locales: ['ja'], defaultLocale: null}))
        .pipe(assert.length(1))
        .pipe(assert.first(function(file) {
          expect(file.path).to.equal('/root/base/ja/hello.md');
        }))
        .pipe(assert.end(done));
    });

    it('should strip front matter', function(done) {
      array([create('hello.md', {title: 'hello'}, 'body')])
        .pipe(minisite())
        .pipe(assert.length(1))
        .pipe(assert.first(function(file) {
          expect(file.contents.toString().trim()).to.equal('body');
        }))
        .pipe(assert.end(done));
    });

    it('should proceed multiple files', function(done) {
      array([
        create('hello.md', {}, ''),
        create('world.md', {}, ''),
      ])
        .pipe(minisite())
        .pipe(assert.length(2))
        .pipe(assert.first(function(file) {
          expect(file.path).to.equal('/root/base/hello/index.html');
        }))
        .pipe(assert.second(function(file) {
          expect(file.path).to.equal('/root/base/world/index.html');
        }))
        .pipe(assert.end(done));
    });

    it('should throw PluginError if two files have the same file path', function(done) {
      var PluginError = require('gulp-util').PluginError;

      array([
        create('#01.hello.md', {}, ''),
        create('#02.hello.md', {}, ''),
      ])
        .pipe(minisite())
        .on('error', function(e) {
          expect(e).to.be.an.instanceof(PluginError);
          expect(e.message).to.have.string('same path');
          done();
        });
    });

    it('should accept YAML as document', function(done) {
      array([create('hello.yaml', {
        title: 'Hello',
        description: 'Hello World',
      })])
        .pipe(minisite())
        .pipe(assert.length(1))
        .pipe(assert.first(function(file) {
          expect(file.path).to.equal('/root/base/hello/index.html');
          expect(file.data.title).to.equal('Hello');
          expect(file.data.description).to.equal('Hello World');
        }))
        .pipe(assert.end(done));
    });

    it('should accept JSON as document', function(done) {
      array([create('hello.json', null, '{"title":"Hello","description":"Hello World"}')])
        .pipe(minisite())
        .pipe(assert.length(1))
        .pipe(assert.first(function(file) {
          expect(file.path).to.equal('/root/base/hello/index.html');
          expect(file.data.title).to.equal('Hello');
          expect(file.data.description).to.equal('Hello World');
        }))
        .pipe(assert.end(done));
    });

    it('should accept empty YAML', function(done) {
      array([create('hello.yaml', null, '')])
        .pipe(minisite())
        .pipe(assert.length(1))
        .pipe(assert.first(function(file) {
          expect(file.path).to.equal('/root/base/hello/index.html');
          expect(file.data).to.not.be.undefined;
        }))
        .pipe(assert.end(done));
    });

    it('should not treat YAML as document if dataExtensions option is null', function(done) {
      array([create('hello.yaml', {
        title: 'Hello',
        description: 'Hello World',
      })])
        .pipe(minisite({dataExtensions: null}))
        .pipe(assert.length(1))
        .pipe(assert.first(function(file) {
          expect(file.data.document).to.be.false;
          var attr = yaml.safeLoad(file.contents.toString());
          expect(attr.title).to.equal('Hello');
          expect(attr.description).to.equal('Hello World');
        }))
        .pipe(assert.end(done));

    });

    it('should have consistent resource id', function(done) {
      array([
        create('foo.md', {}, ''),
        create('bar/baz.md', {}, ''),
      ])
        .pipe(minisite())
        .pipe(assert.length(2))
        .pipe(assert.first(function(file) {
          expect(file.data.resourceId).to.equal('foo');
        }))
        .pipe(assert.second(function(file) {
          expect(file.data.resourceId).to.equal('bar/baz');
        }))
        .pipe(assert.end(done));
    });

    it('should have the same resource id if only a locale differs', function(done) {
      array([
        create('foo.md', {}, ''),
        create('bar/baz.md', {}, ''),
        create('foo.ja.md', {}, ''),
      ])
        .pipe(minisite({locales: ['en', 'ja'], defaultLocale: 'en'}))
        .pipe(assert.length(3))
        .pipe(assert.first(function(file) {
          expect(file.data.resourceId).to.equal('foo');
        }))
        .pipe(assert.second(function(file) {
          expect(file.data.resourceId).to.equal('bar/baz');
        }))
        .pipe(assert.nth(3, function(file) {
          expect(file.data.resourceId).to.equal('foo');
        }))
        .pipe(assert.end(done));
    });

    it('should render HTML with template engine (default)', function(done) {
      array([create('hello.yaml', {
        template: 'root.html',
        title: 'Hello',
        description: 'World',
      })])
        .pipe(minisite({
          templateEngine: require('../src/engines/nunjucks')({path: 'test/template'}),
        }))
        .pipe(assert.length(1))
        .pipe(assert.first(function(file) {
          expect(file.contents.toString().trim()).to.equal('Hello - World');
        }))
        .pipe(assert.end(done));
    });

    it('should render HTML with template engine (for test)', function(done) {
      array([create('hello.yaml', {
        template: true,
        title: 'Hello',
        description: 'World',
      })])
        .pipe(minisite({
          templateEngine: createEngine('{{ page.title }} - {{ page.description }}'),
        }))
        .pipe(assert.length(1))
        .pipe(assert.first(function(file) {
          expect(file.contents.toString().trim()).to.equal('Hello - World');
        }))
        .pipe(assert.end(done));
    });

    it('should be able to refer by resource id', function(done) {
      array([
        create('foo.md', {template: true, title: 'FOO'}, ''),
        create('bar/baz.md', {title: 'BAZ'}, ''),
      ])
        .pipe(minisite({templateEngine: function(_, tmplData) {
          expect(tmplData.references['foo'].title).to.equal('FOO');
          expect(tmplData.references['bar/baz'].title).to.equal('BAZ');
          return tmplData.page.title;
        }}))
        .pipe(assert.length(2))
        .pipe(assert.first(function(file) {
          expect(file.contents.toString()).to.equal('FOO');
        }))
        .pipe(assert.end(done));
    });

    it('should be able to refer by locale and resource id', function(done) {
      array([
        create('foo.md', {template: true, title: 'FOO'}, ''),
        create('bar/baz.md', {title: 'BAZ'}, ''),
        create('foo.ja.md', {title: 'FOO J'}, ''),
        create('bar/baz.ja.md', {title: 'BAZ J'}, ''),
      ])
        .pipe(minisite({
          locales: ['en', 'ja'],
          defaultLocale: 'en',
          templateEngine: function(_, tmplData) {
            expect(tmplData.references.en['foo'].title).to.equal('FOO');
            expect(tmplData.references.en['bar/baz'].title).to.equal('BAZ');
            expect(tmplData.references.ja['foo'].title).to.equal('FOO J');
            expect(tmplData.references.ja['bar/baz'].title).to.equal('BAZ J');
            return tmplData.page.title;
          },
        }))
        .pipe(assert.length(4))
        .pipe(assert.first(function(file) {
          expect(file.contents.toString()).to.equal('FOO');
        }))
        .pipe(assert.end(done));
    });

    it('should be able to collect page data by collection id', function(done) {
      array([
        create('items/#1.foo.yaml', {title: 'FOO', template: true}),
        create('items/#2.bar.yaml', {title: 'BAR'}),
        create('items/#3.baz.yaml', {title: 'BAZ'}),
      ])
        .pipe(minisite({templateEngine: function(_, tmplData) {
          expect(tmplData.collections['items']).to.have.length(3);
          expect(tmplData.collections['items'][0].title).to.equal('FOO');
          expect(tmplData.collections['items'][1].title).to.equal('BAR');
          expect(tmplData.collections['items'][2].title).to.equal('BAZ');
          return tmplData.page.title;
        }}))
        .pipe(assert.length(3))
        .pipe(assert.first(function(file) {
          expect(file.contents.toString()).to.equal('FOO');
        }))
        .pipe(assert.end(done));
    });

    it('should be able to collect page data by locale and collection id', function(done) {
      array([
        create('items/#1.foo.yaml', {title: 'FOO', template: true}),
        create('items/#2.bar.yaml', {title: 'BAR'}),
        create('items/#3.baz.yaml', {title: 'BAZ'}),
        create('items/#1.foo.ja.yaml', {title: 'FOO J'}),
        create('items/#2.bar.ja.yaml', {title: 'BAR J'}),
        create('items/#3.baz.ja.yaml', {title: 'BAZ J'}),
      ])
        .pipe(minisite({
          locales: ['en', 'ja'],
          defaultLocale: 'en',
          templateEngine: function(_, tmplData) {
            expect(tmplData.collections.en['items']).to.have.length(3);
            expect(tmplData.collections.en['items'][0].title).to.equal('FOO');
            expect(tmplData.collections.en['items'][1].title).to.equal('BAR');
            expect(tmplData.collections.en['items'][2].title).to.equal('BAZ');
            expect(tmplData.collections.ja['items']).to.have.length(3);
            expect(tmplData.collections.ja['items'][0].title).to.equal('FOO J');
            expect(tmplData.collections.ja['items'][1].title).to.equal('BAR J');
            expect(tmplData.collections.ja['items'][2].title).to.equal('BAZ J');
            return tmplData.page.title;
          },
        }))
        .pipe(assert.length(6))
        .pipe(assert.first(function(file) {
          expect(file.contents.toString()).to.equal('FOO');
        }))
        .pipe(assert.end(done));
    });

    it('should make index to have its collection', function(done) {
      array([
        create('items/index.yaml', {}),
        create('items/#1.foo.yaml', {title: 'FOO'}),
        create('items/#2.bar.yaml', {title: 'BAR'}),
        create('items/#3.baz.yaml', {title: 'BAZ'}),
      ])
        .pipe(minisite())
        .pipe(assert.length(4))
        .pipe(assert.first(function(file) {
          expect(file.data.collection).to.be.an('array');
          expect(file.data.collection).to.have.length(3);
          expect(file.data.collection[0].title).to.equal('FOO');
          expect(file.data.collection[1].title).to.equal('BAR');
          expect(file.data.collection[2].title).to.equal('BAZ');
        }))
        .pipe(assert.end(done));
    });

    it('should make index to have its collection (multiple locale)', function(done) {
      array([
        create('items/index.yaml', {}),
        create('items/#1.foo.yaml', {title: 'FOO'}),
        create('items/#2.bar.yaml', {title: 'BAR'}),
        create('items/#3.baz.yaml', {title: 'BAZ'}),
        create('items/index.ja.yaml', {}),
        create('items/#1.foo.ja.yaml', {title: 'FOO J'}),
        create('items/#2.bar.ja.yaml', {title: 'BAR J'}),
        create('items/#3.baz.ja.yaml', {title: 'BAZ J'}),
      ])
        .pipe(minisite({
          locales: ['en', 'ja'],
          defaultLocale: 'en',
        }))
        .pipe(assert.length(8))
        .pipe(assert.first(function(file) {
          expect(file.data.collection).to.be.an('array');
          expect(file.data.collection).to.have.length(3);
          expect(file.data.collection[0].title).to.equal('FOO');
          expect(file.data.collection[1].title).to.equal('BAR');
          expect(file.data.collection[2].title).to.equal('BAZ');
        }))
        .pipe(assert.nth(4, function(file) {
          expect(file.data.collection).to.be.an('array');
          expect(file.data.collection).to.have.length(3);
          expect(file.data.collection[0].title).to.equal('FOO J');
          expect(file.data.collection[1].title).to.equal('BAR J');
          expect(file.data.collection[2].title).to.equal('BAZ J');
        }))
        .pipe(assert.end(done));
    });

    it('should have all pages in template data', function(done) {
      array([
        create('foo.yaml', {title: 'FOO', template: true}),
        create('bar.yaml', {title: 'BAR'}),
        create('items/index.yaml', {}),
        create('items/baz.yaml', {title: 'BAZ'}),
        create('items/qux.yaml', {title: 'QUX'}),
      ])
        .pipe(minisite({templateEngine: function(_, tmplData) {
          expect(tmplData.pages).to.have.length(5);
          return tmplData.page.title;
        }}))
        .pipe(assert.length(5))
        .pipe(assert.first(function(file) {
          expect(file.contents.toString()).to.equal('FOO');
        }))
        .pipe(assert.end(done));
    });

    it('should have all pages in template data (multiple locale)', function(done) {
      array([
        create('foo.yaml', {title: 'FOO', template: true}),
        create('bar.yaml', {title: 'BAR'}),
        create('items/index.yaml', {}),
        create('items/baz.yaml', {title: 'BAZ'}),
        create('items/qux.yaml', {title: 'QUX'}),
        create('foo.ja.yaml', {title: 'FOO J'}),
        create('bar.ja.yaml', {title: 'BAR J'}),
        create('items/index.ja.yaml', {}),
        create('items/baz.ja.yaml', {title: 'BAZ J'}),
        create('items/qux.ja.yaml', {title: 'QUX J'}),
      ])
        .pipe(minisite({
          locales: ['en', 'ja'],
          defaultLocale: 'en',
          templateEngine: function(_, tmplData) {
            expect(tmplData.pages.en).to.have.length(5);
            expect(tmplData.pages.ja).to.have.length(5);
            return tmplData.page.title;
          },
        }))
        .pipe(assert.length(10))
        .pipe(assert.first(function(file) {
          expect(file.contents.toString()).to.equal('FOO');
        }))
        .pipe(assert.end(done));
    });

    it('should have shallow attribute access', function(done) {
      array([create('hello.yaml', {title: 'Hello', myData: 'World'})])
        .pipe(minisite())
        .pipe(assert.length(1))
        .pipe(assert.first(function(file) {
          expect(file.data.title).to.equal('Hello');
          expect(file.data.myData).to.equal('World');
        }))
        .pipe(assert.end(done));
    });

  });
});
