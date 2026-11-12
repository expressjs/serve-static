var assert = require('assert')
var http = require('http')
var path = require('path')
var request = require('supertest')
var serveStatic = require('..')

var fixtures = path.join(__dirname, '/fixtures')

describe('when redirecting a directory path containing dot segments', function () {
  var server
  before(function () {
    server = createServer()
  })

  it('should redirect /users/. to /users/', function (done) {
    request(server)
      .get('/users/.')
      .expect('Location', '/users/')
      .expect(301, done)
  })

  it('should redirect /users/.. to /', function (done) {
    request(server)
      .get('/users/..')
      .expect('Location', '/')
      .expect(301, done)
  })

  it('should redirect /./users to /users/', function (done) {
    request(server)
      .get('/./users')
      .expect('Location', '/users/')
      .expect(301, done)
  })

  it('should redirect /users/../users to /users/', function (done) {
    request(server)
      .get('/users/../users')
      .expect('Location', '/users/')
      .expect(301, done)
  })

  it('should keep a duplicate-leading-slash location relative', function (done) {
    request(server)
      .get('//users')
      .expect('Location', '/users/')
      .expect(301, done)
  })

  it('should redirect percent-encoded dot segments like literal ones', function (done) {
    request(server)
      .get('/users/%2e%2e')
      .expect('Location', '/')
      .expect(301, done)
  })

  it('should redirect uppercase and mixed percent-encoded dot segments', function (done) {
    request(server)
      .get('/users/.%2E')
      .expect('Location', '/')
      .expect(301, done)
  })

  it('should not treat a segment containing encoded dots as a dot segment', function (done) {
    request(server)
      .get('/users/a%2eb')
      .expect(404, done)
  })

  it('should keep existing redirect behaviour for directory names with dots', function (done) {
    request(server)
      .get('/users/.')
      .expect(function (res) {
        assert.ok(res.headers.location.charAt(0) === '/', 'location is path-absolute')
        assert.ok(res.headers.location.charAt(1) !== '/', 'location is not protocol-relative')
      })
      .expect(301, done)
  })
})

function createServer (dir, opts, fn) {
  dir = dir || fixtures

  var _serve = serveStatic(dir, opts)

  return http.createServer(function (req, res) {
    fn && fn(req, res)
    _serve(req, res, function (err) {
      res.statusCode = err ? (err.status || 500) : 404
      res.end(err ? err.stack : 'sorry!')
    })
  })
}
