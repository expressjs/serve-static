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
    var requestedPathName = parseUrl(req).pathname

    // make sure redirect occurs at mount
    if (requestedPathName === '/' && originalUrl.pathname.substr(-1) !== '/') {
      requestedPathName = ''
    }

    // options passed to stream
    var streamOptions = {
      opts: opts,
      fallthrough: fallthrough,
      setHeaders: setHeaders,
      onDirectory: onDirectory,
      path: requestedPathName
    }

    // stream the uncompressed version of a requested file
    function sendStream(options) {
      return streamFile.call(this, req, res, next, options)
    }

    // gzip globally disabled
    if (!serveGzip) {
      return sendStream(streamOptions)
    }

    // path is a directory passthrough, this is a lightweight check for file extension
    // the server will not serve gzipped versions of files without extensions
    if (requestedPathName.indexOf('.') === -1) {
      return sendStream(streamOptions)
    }

    // gzip encoding not supported by client
    if (!isGzipAcceptedRequest(req)) {
      return sendStream(streamOptions)
    }

    // static gzip file not found
    var gzipPath = decodeURIComponent(requestedPathName) + '.gz'
    if (!gzipCache[path.join(root, gzipPath)]) {
      return sendStream(streamOptions)
    }

    // set gzip specific headers
    streamOptions.setHeaders = setGzipHeaders

    // stream gzipped file
    streamOptions.path = gzipPath
    return sendStream(streamOptions)
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
 * Determines client gzip support via the Accept-Encoding request header.
 * @see {@link https://www.w3.org/Protocols/rfc2616/rfc2616-sec14.html#sec14.3}
 * @private
 */

function isGzipAcceptedRequest(req) {
  var acceptEncodingHeader = req.headers['accept-encoding'] || ''

  // Header empty, not supported
  if (!acceptEncodingHeader) {
    return false
  }

  // Header accepts all encodings
  if (acceptEncodingHeader === '*') {
    return true
  }

  // The wildcard switch will be considered if a wildcard is set in a list
  // and gzip is not explicitly set.
  var wildcardEncodingEnabled = false

  // Split comma-delimited encodings list
  var encodingsList = acceptEncodingHeader.split(',')
  for (var i = 0; i < encodingsList.length; i++) {

    // Split by ";" for optional quality value weight
    // https://www.w3.org/Protocols/rfc2616/rfc2616-sec3.html#sec3.9
    var encoding = encodingsList[i].split(';')
    var encodingName = encoding[0]
    var isWildCard = encodingName === '*'

    // Currently we only care about gzip or a wildcard
    if (encodingName === 'gzip' || isWildCard) {
      var encodingQV = encoding[1] && encoding[1].split('=')
      var encodingWeight = encodingQV && encodingQV[1] ? parseFloat(encodingQV[1], 10) : 1.0
      var encodingSupported = encodingWeight > 0.0

      // Explicitly set gzip
      if (!isWildCard) {
        return encodingSupported
      }

      // Wildcard switch changed
      wildcardEncodingEnabled = encodingSupported
    }
  }

  // We never explictly found gzip, use the wildcard state
  return wildcardEncodingEnabled
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
  res.setHeader('Vary', res.getHeader('Vary') || 'Accept-Encoding')
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
