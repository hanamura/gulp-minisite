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
        .pipe(minisite({dataDocument: ['yaml']}))
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
        .pipe(minisite({dataDocument: ['json']}))
        .pipe(assert.length(1))
        .pipe(assert.first(function(file) {
          expect(file.path).to.equal('/root/base/hello/index.html');
          expect(file.data.title).to.equal('Hello');
          expect(file.data.description).to.equal('Hello World');
        }))
        .pipe(assert.end(done));
    });

  });
});
