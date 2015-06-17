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

var escapeHtml = require('escape-html');
var parseurl = require('parseurl');
var resolve = require('path').resolve;
var send = require('send');
var url = require('url');

/**
 * Module exports.
 * @public
 */

module.exports = serveStatic
module.exports.mime = send.mime

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

  // default redirect
  var redirect = opts.redirect !== false

  // headers listener
  var setHeaders = opts.setHeaders
  opts.setHeaders = undefined

  if (setHeaders && typeof setHeaders !== 'function') {
    throw new TypeError('option setHeaders must be function')
  }

  // setup options for send
  opts.maxage = opts.maxage || opts.maxAge || 0
  opts.root = resolve(root)

  return function serveStatic(req, res, next) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return next()
    }

    var originalUrl = parseurl.original(req)
    var path = parseurl(req).pathname
    var hasTrailingSlash = originalUrl.pathname[originalUrl.pathname.length - 1] === '/'

    if (path === '/' && !hasTrailingSlash) {
      // make sure redirect occurs at mount
      path = ''
    }

    // create send stream
    var stream = send(req, path, opts)

    if (redirect) {
      // redirect relative to originalUrl
      stream.on('directory', function redirect() {
        if (hasTrailingSlash) {
          return next()
        }

        // append trailing slash
        originalUrl.path = null
        originalUrl.pathname = collapseLeadingSlashes(originalUrl.pathname + '/')

        // reformat the URL
        var loc = url.format(originalUrl)
        var msg = 'Redirecting to <a href="' + escapeHtml(loc) + '">' + escapeHtml(loc) + '</a>\n'

        // send redirect response
        res.statusCode = 303
        res.setHeader('Content-Type', 'text/html; charset=UTF-8')
        res.setHeader('Content-Length', Buffer.byteLength(msg))
        res.setHeader('X-Content-Type-Options', 'nosniff')
        res.setHeader('Location', loc)
        res.end(msg)
      })
    } else {
      // forward to next middleware on directory
      stream.on('directory', next)
    }

    // add headers listener
    if (setHeaders) {
      stream.on('headers', setHeaders)
    }

    // forward non-404 errors
    stream.on('error', function error(err) {
      next(err.status === 404 ? null : err)
    })

    // pipe
    stream.pipe(res)
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
