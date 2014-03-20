
process.env.NODE_ENV = 'test';

var connect = require('connect');
var http = require('http');
var request = require('supertest');
var serveStatic = require('..');

var fixtures = __dirname + '/fixtures';

describe('serveStatic()', function(){
  describe('basic operations', function(){
    var server;
    before(function () {
      server = createServer();
    });
    after(function (done) {
      server.close(done);
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

    it('should redirect directories with query string', function (done) {
      request(server)
      .get('/users?name=john')
      .expect('Location', '/users/?name=john', done);
    });

    it('should redirect directories', function(done){
      request(server)
      .get('/users')
      .expect(303, done);
    });

    it('should not redirect incorrectly', function (done) {
      request(server)
      .get('/')
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

    it('should ignore hidden files', function(done){
      request(server)
      .get('/.hidden')
      .expect(404, done);
    });

    it('should set max-age=0 by default', function(done){
      request(server)
      .get('/todo.txt')
      .expect('cache-control', 'public, max-age=0')
      .expect(200, done)
    });
  });

  describe('hidden files', function(){
    var server;
    before(function () {
      server = createServer(fixtures, {'hidden': true});
    });
    after(function (done) {
      server.close(done);
    });

    it('should be served when hidden: true is given', function(done){
      request(server)
      .get('/.hidden')
      .expect(200, 'I am hidden', done);
    })
  })

  describe('maxAge', function(){
    var server;
    before(function () {
      server = createServer(fixtures, {'maxAge': Infinity});
    });
    after(function (done) {
      server.close(done);
    });

    it('should be reasonable when infinite', function(done){
      request(server)
      .get('/todo.txt')
      .expect('cache-control', 'public, max-age=' + 60*60*24*365)
      .expect(200, done)
    });
  });

  describe('when traversing passed root', function(){
    var server;
    before(function () {
      server = createServer();
    });
    after(function (done) {
      server.close(done);
    });

    it('should respond with 403 Forbidden', function(done){
      request(server)
      .get('/users/../../todo.txt')
      .expect(403, done);
    })

    it('should catch urlencoded ../', function(done){
      request(server)
      .get('/users/%2e%2e/%2e%2e/todo.txt')
      .expect(403, done);
    });
  });

  describe('on ENOENT', function(){
    var server;
    before(function () {
      server = createServer();
    });
    after(function (done) {
      server.close(done);
    });

    it('should next()', function(done){
      request(server)
      .get('/does-not-exist')
      .expect(404, 'sorry!', done);
    });
  });

  describe('Range', function(){
    var server;
    before(function () {
      server = createServer();
    });
    after(function (done) {
      server.close(done);
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
        .expect('Content-Range', 'bytes */9', done)
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

  describe('with a malformed URL', function(){
    var server;
    before(function () {
      server = createServer();
    });
    after(function (done) {
      server.close(done);
    });

    it('should respond with 400', function(done){
      request(server)
      .get('/%')
      .expect(400, done);
    });
  });

  describe('on ENAMETOOLONG', function(){
    var server;
    before(function () {
      server = createServer();
    });
    after(function (done) {
      server.close(done);
    });

    it('should next()', function(done){
      var path = Array(100).join('foobar');

      request(server)
      .get('/' + path)
      .expect(404, done);
    });
  });

  describe('on ENOTDIR', function(){
    var server;
    before(function () {
      server = createServer();
    });
    after(function (done) {
      server.close(done);
    });

    it('should next()', function(done) {
      request(server)
      .get('/todo.txt/a.php')
      .expect(404, done);
    });
  });

  describe('when index at mount point', function(){
    var server;
    before(function () {
      var app = connect();
      app.use('/users', serveStatic('test/fixtures/users'));
      server = app.listen();
    });
    after(function (done) {
      server.close(done);
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
      var app = connect();
      app.use('/static', serveStatic(fixtures));
      server = app.listen();
    });
    after(function (done) {
      server.close(done);
    });

    it('should redirect relative to the originalUrl', function(done){
      request(server)
      .get('/static/users')
      .expect('Location', '/static/users/')
      .expect(303, done);
    });
  });

  describe('when responding non-2xx or 304', function(){
    var server;
    before(function () {
      var app = connect();
      var n = 0;

      app.use(function(req, res, next){
        switch (n++) {
          case 0: return next();
          case 1: res.statusCode = 500; return next();
        }
      });

      app.use(serveStatic(fixtures));

      server = app.listen();
    });
    after(function (done) {
      server.close(done);
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

  describe('raw http server', function(){
    var server;
    before(function () {
      var middleware = serveStatic(fixtures);
      server = http.createServer(function (req, res) {
        middleware(req, res, function (err) {
          res.statusCode = err ? 500 : 404;
          res.end(err ? err.stack : '');
        });
      });
    });
    after(function (done) {
      server.close(done);
    });

    it('should work on raw node.js http servers', function(done){
      request(server)
      .get('/todo.txt')
      .expect(200, '- groceries', done);
    });
  });
});

function createServer(dir, opts) {
  var app = connect();
  dir = dir || fixtures;
  app.use(serveStatic(dir, opts));
  app.use(function(req, res){
    res.statusCode = 404;
    res.end('sorry!');
  });
  return app.listen();
}
