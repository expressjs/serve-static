/*!
 * serve-static
 * Copyright(c) 2010 Sencha Inc.
 * Copyright(c) 2011 TJ Holowaychuk
 * Copyright(c) 2014-2015 Douglas Christopher Wilson
 * MIT Licensed
 */

'use strict'

/**
 * Module dependencies.
 * @private
 */

var escapeHtml = require('escape-html')
var parseUrl = require('parseurl')
var path = require('path')
var send = require('send')
var url = require('url')
var find = require('find')
var mime = send.mime

/**
 * Module exports.
 * @public
 */

module.exports = serveStatic
module.exports.mime = mime

/**
 * @param {string} root
 * @param {object} [options]
 * @return {function}
 * @public
 */

function serveStatic(root, options) {
  if (!root) {
    throw new TypeError('root path required')
  }

  if (typeof root !== 'string') {
    throw new TypeError('root path must be a string')
  }

  // copy options object
  var opts = Object.create(options || null)

  // fall-though
  var fallthrough = opts.fallthrough !== false

  // default redirect
  var redirect = opts.redirect !== false

  // look for gzipped assets
  var serveGzip = opts.serveGzip === true

  // headers listener
  var setHeaders = opts.setHeaders

  if (setHeaders && typeof setHeaders !== 'function') {
    throw new TypeError('option setHeaders must be function')
  }

  // setup options for send
  opts.maxage = opts.maxage || opts.maxAge || 0
  opts.root = path.resolve(root)

  // construct directory listener
  var onDirectory = redirect
    ? createRedirectDirectoryListener()
    : createNotFoundDirectoryListener()

  // cache files in mounted directory
  var gzipCache
  if (serveGzip) {
    gzipCache = createCache(root)
  }

  return function serveStatic(req, res, next) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      if (fallthrough) {
        return next()
      }

      // method not allowed
      res.statusCode = 405
      res.setHeader('Allow', 'GET, HEAD')
      res.setHeader('Content-Length', '0')
      res.end()
      return
    }

    var originalUrl = parseUrl.original(req)
    var originalPath = parseUrl(req).pathname

    // make sure redirect occurs at mount
    if (originalPath === '/' && originalUrl.pathname.substr(-1) !== '/') {
      originalPath = ''
    }

    // options passed to stream
    var streamOptions = {
      opts: opts,
      fallthrough: fallthrough,
      setHeaders: setHeaders,
      onDirectory: onDirectory,
      path: originalPath
    }

    // static gzip serving disabled
    var fallbackStream = streamFile.bind(this, req, res, next, streamOptions)
    if (!serveGzip) {
      return fallbackStream()
    }

    // gzip encoding not supported by client
    var acceptEncoding = req.headers['accept-encoding'] || ''
    if (acceptEncoding.indexOf('gzip') === -1) {
      return fallbackStream()
    }

    // static gzip file not found
    var gzipPath = originalPath + '.gz'
    if (!gzipCache[path.join(root, gzipPath)]) {
      return fallbackStream()
    }

    // set gzip specific headers
    setGzipHeaders(res, streamOptions.path)

    // stream gzipped file
    streamOptions.path = gzipPath
    return streamFile.call(this, req, res, next, streamOptions)
  }
}

/**
 * Collapse all leading slashes into a single slash
 * @private
 */
function collapseLeadingSlashes(str) {
  for (var i = 0; i < str.length; i++) {
    if (str[i] !== '/') {
      break
    }
  }

  return i > 1
    ? '/' + str.substr(i)
    : str
}

/**
 * Create a directory listener that just 404s.
 * @private
 */

function createNotFoundDirectoryListener() {
  return function notFound() {
    this.error(404)
  }
}

/**
 * Create a directory listener that performs a redirect.
 * @private
 */

function createRedirectDirectoryListener() {
  return function redirect() {
    if (this.hasTrailingSlash()) {
      this.error(404)
      return
    }

    // get original URL
    var originalUrl = parseUrl.original(this.req)

    // append trailing slash
    originalUrl.path = null
    originalUrl.pathname = collapseLeadingSlashes(originalUrl.pathname + '/')

    // reformat the URL
    var loc = url.format(originalUrl)
    var msg = 'Redirecting to <a href="' + escapeHtml(loc) + '">' + escapeHtml(loc) + '</a>\n'
    var res = this.res

    // send redirect response
    res.statusCode = 303
    res.setHeader('Content-Type', 'text/html; charset=UTF-8')
    res.setHeader('Content-Length', Buffer.byteLength(msg))
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Location', loc)
    res.end(msg)
  }
}

/**
 * Modifies the response header for gzipped assets
 * @private
 */

function setGzipHeaders(res, path) {
  var type = mime.lookup(path)
  var charset = mime.charsets.lookup(type)

  res.setHeader('Content-Type', type + (charset ? '; charset=' + charset : ''))
  res.setHeader('Content-Encoding', 'gzip')
  res.setHeader('Vary', 'Accept-Encoding')
}

/**
 * Searches root folder on init for gzipped assets
 * @private
 */

function createCache(root) {
  var cache = Object.create(null)

  find.fileSync(/\.gz$/, root).forEach(function(file) {
    cache[file] = true
  })

  return cache
}

/**
 * Streams a single static file to the client
 * @private
 */

function streamFile(req, res, next, params) {
  // create send stream
  var stream = send(req, params.path, params.opts)
  var forwardError = !params.fallthrough

  // add directory handler
  stream.on('directory', params.onDirectory)

  // add headers listener
  if (params.setHeaders) {
    stream.on('headers', params.setHeaders)
  }

  // add file listener for fallthrough
  if (params.fallthrough) {
    stream.on('file', function onFile() {
      // once file is determined, always forward error
      forwardError = true
    })
  }

  // forward errors
  stream.on('error', function error(err) {
    if (forwardError || !(err.statusCode < 500)) {
      next(err)
      return
    }

    next()
  })

  // pipe
  stream.pipe(res)
}
