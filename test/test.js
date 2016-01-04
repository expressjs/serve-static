
var assert = require('assert');
var http = require('http');
var path = require('path');
var request = require('supertest');
var serveStatic = require('..');

var fixtures = __dirname + '/fixtures';
var relative = path.relative(process.cwd(), fixtures);

var skipRelative = ~relative.indexOf('..') || path.resolve(relative) === relative;

describe('serveStatic()', function(){
  describe('basic operations', function(){
    var server;
    before(function () {
      server = createServer();
    });

    it('should require root path', function(){
      assert.throws(serveStatic.bind(), /root path required/);
    });

    it('should require root path to be string', function(){
      assert.throws(serveStatic.bind(null, 42), /root path.*string/);
    });

    it('should serve static files', function(done){
      request(server)
      .get('/todo.txt')
      .expect(200, '- groceries', done);
    });

    it('should support nesting', function(done){
      request(server)
      .get('/users/tobi.txt')
      .expect(200, 'ferret', done);
    });

    it('should set Content-Type', function(done){
      request(server)
      .get('/todo.txt')
      .expect('Content-Type', 'text/plain; charset=UTF-8')
      .expect(200, done);
    });

    it('should set Last-Modified', function(done){
      request(server)
      .get('/todo.txt')
      .expect('Last-Modified', /\d{2} \w{3} \d{4}/)
      .expect(200, done)
    })

    it('should default max-age=0', function(done){
      request(server)
      .get('/todo.txt')
      .expect('Cache-Control', 'public, max-age=0')
      .expect(200, done);
    });

    it('should support urlencoded pathnames', function(done){
      request(server)
      .get('/foo%20bar')
      .expect(200, 'baz', done);
    });

    it('should not choke on auth-looking URL', function(done){
      request(server)
      .get('//todo@txt')
      .expect(404, done);
    });

    it('should support index.html', function(done){
      request(server)
      .get('/users/')
      .expect(200)
      .expect('Content-Type', /html/)
      .expect('<p>tobi, loki, jane</p>', done);
    });

    it('should support ../', function(done){
      request(server)
      .get('/users/../todo.txt')
      .expect(200, '- groceries', done);
    });

    it('should support HEAD', function(done){
      request(server)
      .head('/todo.txt')
      .expect(200, '', done);
    });

    it('should skip POST requests', function(done){
      request(server)
      .post('/todo.txt')
      .expect(404, 'sorry!', done);
    });

    it('should support conditional requests', function(done){
      request(server)
      .get('/todo.txt')
      .end(function(err, res){
        if (err) throw err;
        request(server)
        .get('/todo.txt')
        .set('If-None-Match', res.headers.etag)
        .expect(304, done);
      });
    });

    it('should serve zero-length files', function (done) {
      request(server)
      .get('/empty.txt')
      .expect(200, '', done)
    })

    it('should ignore hidden files', function(done){
      request(server)
      .get('/.hidden')
      .expect(404, done);
    });
  });

  (skipRelative ? describe.skip : describe)('current dir', function(){
    var server;
    before(function () {
      server = createServer('.');
    });

    it('should be served with "."', function(done){
      var dest = relative.split(path.sep).join('/');
      request(server)
      .get('/' + dest + '/todo.txt')
      .expect(200, '- groceries', done);
    })
  })

  describe('extensions', function () {
    it('should be not be enabled by default', function (done) {
      var server = createServer(fixtures);

      request(server)
      .get('/todo')
      .expect(404, done);
    })

    it('should be configurable', function (done) {
      var server = createServer(fixtures, {'extensions': 'txt'});

      request(server)
      .get('/todo')
      .expect(200, '- groceries', done);
    })

    it('should support disabling extensions', function (done) {
      var server = createServer(fixtures, {'extensions': false});

      request(server)
      .get('/todo')
      .expect(404, done);
    })

    it('should support fallbacks', function (done) {
      var server = createServer(fixtures, {'extensions': ['htm', 'html', 'txt']});

      request(server)
      .get('/todo')
      .expect(200, '<li>groceries</li>', done);
    })

    it('should 404 if nothing found', function (done) {
      var server = createServer(fixtures, {'extensions': ['htm', 'html', 'txt']});

      request(server)
      .get('/bob')
      .expect(404, done)
    })
  })

  describe('fallthrough', function () {
    it('should default to true', function (done) {
      request(createServer())
      .get('/does-not-exist')
      .expect(404, 'sorry!', done)
    })

    describe('when true', function () {
      before(function () {
        this.server = createServer(fixtures, {'fallthrough': true})
      })

      it('should fall-through when OPTIONS request', function (done) {
        request(this.server)
        .options('/todo.txt')
        .expect(404, 'sorry!', done)
      })

      it('should fall-through when URL malformed', function (done) {
        request(this.server)
        .get('/%')
        .expect(404, 'sorry!', done)
      })

      it('should fall-through when traversing past root', function (done) {
        request(this.server)
        .get('/users/../../todo.txt')
        .expect(404, 'sorry!', done)
      })

      it('should fall-through when URL too long', function (done) {
        request(this.server)
        .get('/' + Array(8192).join('foobar'))
        .expect(404, 'sorry!', done)
      })

      describe('with redirect: true', function () {
        before(function () {
          this.server = createServer(fixtures, {'fallthrough': true, 'redirect': true})
        })

        it('should fall-through when directory', function (done) {
          request(this.server)
          .get('/pets/')
          .expect(404, 'sorry!', done)
        })

        it('should redirect when directory without slash', function (done) {
          request(this.server)
          .get('/pets')
          .expect(303, /Redirecting/, done)
        })
      })

      describe('with redirect: false', function () {
        before(function () {
          this.server = createServer(fixtures, {'fallthrough': true, 'redirect': false})
        })

        it('should fall-through when directory', function (done) {
          request(this.server)
          .get('/pets/')
          .expect(404, 'sorry!', done)
        })

        it('should fall-through when directory without slash', function (done) {
          request(this.server)
          .get('/pets')
          .expect(404, 'sorry!', done)
        })
      })
    })

    describe('when false', function () {
      before(function () {
        this.server = createServer(fixtures, {'fallthrough': false})
      })

      it('should 405 when OPTIONS request', function (done) {
        request(this.server)
        .options('/todo.txt')
        .expect('Allow', 'GET, HEAD')
        .expect(405, done)
      })

      it('should 400 when URL malformed', function (done) {
        request(this.server)
        .get('/%')
        .expect(400, /BadRequestError/, done)
      })

      it('should 403 when traversing past root', function (done) {
        request(this.server)
        .get('/users/../../todo.txt')
        .expect(403, /ForbiddenError/, done)
      })

      it('should 404 when URL too long', function (done) {
        request(this.server)
        .get('/' + Array(8192).join('foobar'))
        .expect(404, /ENAMETOOLONG/, done)
      })

      describe('with redirect: true', function () {
        before(function () {
          this.server = createServer(fixtures, {'fallthrough': false, 'redirect': true})
        })

        it('should 404 when directory', function (done) {
          request(this.server)
          .get('/pets/')
          .expect(404, /NotFoundError|ENOENT/, done)
        })

        it('should redirect when directory without slash', function (done) {
          request(this.server)
          .get('/pets')
          .expect(303, /Redirecting/, done)
        })
      })

      describe('with redirect: false', function () {
        before(function () {
          this.server = createServer(fixtures, {'fallthrough': false, 'redirect': false})
        })

        it('should 404 when directory', function (done) {
          request(this.server)
          .get('/pets/')
          .expect(404, /NotFoundError|ENOENT/, done)
        })

        it('should 404 when directory without slash', function (done) {
          request(this.server)
          .get('/pets')
          .expect(404, /NotFoundError|ENOENT/, done)
        })
      })
    })
  })

  describe('hidden files', function(){
    var server;
    before(function () {
      server = createServer(fixtures, {'dotfiles': 'allow'});
    });

    it('should be served when dotfiles: "allow" is given', function(done){
      request(server)
      .get('/.hidden')
      .expect(200, 'I am hidden', done);
    })
  })

  describe('lastModified', function(){
    describe('when false', function () {
      it('should not include Last-Modifed', function (done) {
        request(createServer(fixtures, {'lastModified': false}))
        .get('/nums')
        .expect(shouldNotHaveHeader('Last-Modified'))
        .expect(200, '123456789', done)
      })
    })

    describe('when true', function () {
      it('should include Last-Modifed', function (done) {
        request(createServer(fixtures, {'lastModified': true}))
        .get('/nums')
        .expect('Last-Modified',  /^\w{3}, \d+ \w+ \d+ \d+:\d+:\d+ \w+$/)
        .expect(200, '123456789', done)
      })
    })
  })

  describe('maxAge', function(){
    it('should accept string', function(done){
      request(createServer(fixtures, {'maxAge': '30d'}))
      .get('/todo.txt')
      .expect('cache-control', 'public, max-age=' + 60*60*24*30)
      .expect(200, done)
    })

    it('should be reasonable when infinite', function(done){
      request(createServer(fixtures, {'maxAge': Infinity}))
      .get('/todo.txt')
      .expect('cache-control', 'public, max-age=' + 60*60*24*365)
      .expect(200, done)
    });
  });

  describe('redirect', function () {
    var server;
    before(function () {
      server = createServer(fixtures)
    })

    it('should redirect directories', function(done){
      request(server)
      .get('/users')
      .expect('Location', '/users/')
      .expect(303, done)
    })

    it('should include HTML link', function(done){
      request(server)
      .get('/users')
      .expect('Location', '/users/')
      .expect(303, /<a href="\/users\/">/, done)
    })

    it('should redirect directories with query string', function (done) {
      request(server)
      .get('/users?name=john')
      .expect('Location', '/users/?name=john')
      .expect(303, done)
    })

    it('should not redirect to protocol-relative locations', function (done) {
      request(server)
      .get('//users')
      .expect('Location', '/users/')
      .expect(303, done)
    })

    it('should not redirect incorrectly', function (done) {
      request(server)
      .get('/')
      .expect(404, done)
    })

    describe('when false', function () {
      var server;
      before(function () {
        server = createServer(fixtures, {'redirect': false})
      })

      it('should disable redirect', function (done) {
        request(server)
        .get('/users')
        .expect(404, done)
      })
    })
  })

  describe('setHeaders', function () {
    it('should reject non-functions', function () {
      assert.throws(serveStatic.bind(null, fixtures, {'setHeaders': 3}), /setHeaders.*function/)
    })

    it('should get called when sending file', function(done){
      var server = createServer(fixtures, {'setHeaders': function (res) {
        res.setHeader('x-custom', 'set')
      }})

      request(server)
      .get('/nums')
      .expect('x-custom', 'set')
      .expect(200, done)
    })

    it('should not get called on 404', function(done){
      var server = createServer(fixtures, {'setHeaders': function (res) {
        res.setHeader('x-custom', 'set')
      }})

      request(server)
      .get('/bogus')
      .expect(shouldNotHaveHeader('x-custom'))
      .expect(404, done)
    })

    it('should not get called on redirect', function(done){
      var server = createServer(fixtures, {'setHeaders': function (res) {
        res.setHeader('x-custom', 'set')
      }})

      request(server)
      .get('/users')
      .expect(shouldNotHaveHeader('x-custom'))
      .expect(303, done)
    })
  })

  describe('when traversing past root', function () {
    before(function () {
      this.server = createServer(fixtures, {'fallthrough': false})
    })

    it('should catch urlencoded ../', function (done) {
      request(this.server)
      .get('/users/%2e%2e/%2e%2e/todo.txt')
      .expect(403, done)
    })

    it('should not allow root path disclosure', function (done) {
      request(this.server)
      .get('/users/../../fixtures/todo.txt')
      .expect(403, done)
    })
  })

  describe('Range', function(){
    var server;
    before(function () {
      server = createServer();
    });

    it('should support byte ranges', function(done){
      request(server)
      .get('/nums')
      .set('Range', 'bytes=0-4')
      .expect('12345', done);
    });

    it('should be inclusive', function(done){
      request(server)
      .get('/nums')
      .set('Range', 'bytes=0-0')
      .expect('1', done);
    });

    it('should set Content-Range', function(done){
      request(server)
      .get('/nums')
      .set('Range', 'bytes=2-5')
      .expect('Content-Range', 'bytes 2-5/9', done);
    });

    it('should support -n', function(done){
      request(server)
      .get('/nums')
      .set('Range', 'bytes=-3')
      .expect('789', done);
    });

    it('should support n-', function(done){
      request(server)
      .get('/nums')
      .set('Range', 'bytes=3-')
      .expect('456789', done);
    });

    it('should respond with 206 "Partial Content"', function(done){
      request(server)
      .get('/nums')
      .set('Range', 'bytes=0-4')
      .expect(206, done);
    });

    it('should set Content-Length to the # of octets transferred', function(done){
      request(server)
      .get('/nums')
      .set('Range', 'bytes=2-3')
      .expect('Content-Length', '2')
      .expect(206, '34', done);
    });

    describe('when last-byte-pos of the range is greater than current length', function(){
      it('is taken to be equal to one less than the current length', function(done){
        request(server)
        .get('/nums')
        .set('Range', 'bytes=2-50')
        .expect('Content-Range', 'bytes 2-8/9', done)
      });

      it('should adapt the Content-Length accordingly', function(done){
        request(server)
        .get('/nums')
        .set('Range', 'bytes=2-50')
        .expect('Content-Length', '7')
        .expect(206, done);
      });
    });

    describe('when the first- byte-pos of the range is greater than the current length', function(){
      it('should respond with 416', function(done){
        request(server)
        .get('/nums')
        .set('Range', 'bytes=9-50')
        .expect(416, done);
      });

      it('should include a Content-Range field with a byte-range- resp-spec of "*" and an instance-length specifying the current length', function(done){
        request(server)
        .get('/nums')
        .set('Range', 'bytes=9-50')
        .expect('Content-Range', 'bytes */9')
        .expect(416, done);
      });
    });

    describe('when syntactically invalid', function(){
      it('should respond with 200 and the entire contents', function(done){
        request(server)
        .get('/nums')
        .set('Range', 'asdf')
        .expect('123456789', done);
      });
    });
  });

  describe('when index at mount point', function(){
    var server;
    before(function () {
      server = createServer(fixtures + '/users', null, function (req) {
        req.originalUrl = req.url;
        req.url = '/' + req.url.split('/').slice(2).join('/');
      });
    });

    it('should redirect correctly', function (done) {
      request(server)
      .get('/users')
      .expect('Location', '/users/')
      .expect(303, done);
    });
  });

  describe('when mounted', function(){
    var server;
    before(function () {
      server = createServer(fixtures, null, function (req) {
        req.originalUrl = req.url;
        req.url = '/' + req.url.split('/').slice(3).join('/');
      });
    });

    it('should redirect relative to the originalUrl', function(done){
      request(server)
      .get('/static/users')
      .expect('Location', '/static/users/')
      .expect(303, done);
    });

    it('should not choke on auth-looking URL', function(done){
      request(server)
      .get('//todo@txt')
      .expect('Location', '/todo@txt/')
      .expect(303, done);
    });
  });

  describe('when responding non-2xx or 304', function(){
    var server;
    before(function () {
      var n = 0;
      server = createServer(fixtures, null, function (req, res) {
        if (n++) res.statusCode = 500;
      });
    });

    it('should respond as-is', function(done){
      request(server)
      .get('/todo.txt')
      .expect(200)
      .end(function(err, res){
        if (err) throw err;
        request(server)
        .get('/todo.txt')
        .set('If-None-Match', res.headers.etag)
        .expect(500, '- groceries', done);
      });
    });
  });

  describe('when index file serving disabled', function(){
    var server;
    before(function () {
      server = createServer(fixtures, {'index': false}, function (req) {
        // mimic express/connect mount
        req.originalUrl = req.url;
        req.url = '/' + req.url.split('/').slice(2).join('/');
      });
    });

    it('should next() on directory', function (done) {
      request(server)
      .get('/static/users/')
      .expect(404, 'sorry!', done);
    });

    it('should redirect to trailing slash', function (done) {
      request(server)
      .get('/static/users')
      .expect('Location', '/static/users/')
      .expect(303, done);
    });

    it('should next() on mount point', function (done) {
      request(server)
      .get('/static/')
      .expect(404, 'sorry!', done);
    });

    it('should redirect to trailing slash mount point', function (done) {
      request(server)
      .get('/static')
      .expect('Location', '/static/')
      .expect(303, done);
    });
  });
});

function createServer(dir, opts, fn) {
  dir = dir || fixtures;

  var _serve = serveStatic(dir, opts);

  return http.createServer(function (req, res) {
    fn && fn(req, res);
    _serve(req, res, function (err) {
      res.statusCode = err ? (err.status || 500) : 404;
      res.end(err ? err.stack : 'sorry!');
    });
  });
}

function shouldNotHaveHeader(header) {
  return function (res) {
    assert.ok(!(header.toLowerCase() in res.headers), 'should not have header ' + header)
  }
}
