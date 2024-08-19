/*!
 * serve-static
 * Copyright(c) 2010 Sencha Inc.
 * Copyright(c) 2011 TJ Holowaychuk
 * Copyright(c) 2014-2016 Douglas Christopher Wilson
 * MIT Licensed
 */

'use strict';

/**
 * Module dependencies.
 * @private
 */

const encodeUrl = require('encodeurl');
const escapeHtml = require('escape-html');
const parseUrl = require('parseurl');
const resolve = require('path').resolve;
const send = require('send');
const url = require('url');

/**
 * Module exports.
 * @public
 */

module.exports = serveStatic;

/**
 * @param {string} root
 * @param {object} [options]
 * @return {function}
 * @public
 */

function serveStatic (root, options) {
  if (!root) {
    throw new TypeError('root path required');
  }

  if (typeof root !== 'string') {
    throw new TypeError('root path must be a string');
  }

  // copy options object
  const opts = Object.create(options || null);

  // fall-though
  const fallthrough = opts.fallthrough !== false;

  // default redirect
  const redirect = opts.redirect !== false;

  // headers listener
  const setHeaders = opts.setHeaders;

  if (setHeaders && typeof setHeaders !== 'function') {
    throw new TypeError('option setHeaders must be function');
  }

  // setup options for send
  opts.maxage = opts.maxage || opts.maxAge || 0;
  opts.root = resolve(root);

  // construct directory listener
  const onDirectory = redirect
    ? createRedirectDirectoryListener()
    : createNotFoundDirectoryListener();

  return function serveStatic (req, res, next) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      if (fallthrough) {
        return next();
      }

      // method not allowed
      res.statusCode = 405;
      res.setHeader('Allow', 'GET, HEAD');
      res.setHeader('Content-Length', '0');
      res.end();
      return;
    }

    let forwardError = !fallthrough;
    const originalUrl = parseUrl.original(req);
    let path = parseUrl(req).pathname;

    // make sure redirect occurs at mount
    if (path === '/' && originalUrl.pathname.substr(-1) !== '/') {
      path = '';
    }

    // create send stream
    const stream = send(req, path, opts);

    // add directory handler
    stream.on('directory', onDirectory);

    // add headers listener
    if (setHeaders) {
      stream.on('headers', setHeaders);
    }

    // add file listener for fallthrough
    if (fallthrough) {
      stream.on('file', function onFile () {
        // once file is determined, always forward error
        forwardError = true;
      });
    }

    // forward errors
    stream.on('error', function error (err) {
      if (forwardError || !(err.statusCode < 500)) {
        next(err);
        return;
      }

      next();
    });

    // pipe
    stream.pipe(res);
  };
}

/**
 * Collapse all leading slashes into a single slash
 * @private
 */
function collapseLeadingSlashes (str) {
  let i;
  for (i = 0; i < str.length; i++) {
    if (str.charCodeAt(i) !== 0x2f /* / */) {
      break;
    }
  }

  return i > 1
    ? '/' + str.substr(i)
    : str;
}

/**
 * Create a minimal HTML document.
 *
 * @param {string} title
 * @param {string} body
 * @private
 */

function createHtmlDocument (title, body) {
  return '<!DOCTYPE html>\n' +
    '<html lang="en">\n' +
    '<head>\n' +
    '<meta charset="utf-8">\n' +
    '<title>' + title + '</title>\n' +
    '</head>\n' +
    '<body>\n' +
    '<pre>' + body + '</pre>\n' +
    '</body>\n' +
    '</html>\n';
}

/**
 * Create a directory listener that just 404s.
 * @private
 */

function createNotFoundDirectoryListener () {
  return function notFound () {
    this.error(404);
  };
}

/**
 * Create a directory listener that performs a redirect.
 * @private
 */

function createRedirectDirectoryListener () {
  return function redirect (res) {
    if (this.hasTrailingSlash()) {
      this.error(404);
      return;
    }

    // get original URL
    const originalUrl = parseUrl.original(this.req);

    // append trailing slash
    originalUrl.path = null;
    originalUrl.pathname = collapseLeadingSlashes(originalUrl.pathname + '/');

    // reformat the URL
    const loc = encodeUrl(url.format(originalUrl));
    const doc = createHtmlDocument('Redirecting', 'Redirecting to <a href="' + escapeHtml(loc) + '">' +
      escapeHtml(loc) + '</a>');

    // send redirect response
    res.statusCode = 301;
    res.setHeader('Content-Type', 'text/html; charset=UTF-8');
    res.setHeader('Content-Length', Buffer.byteLength(doc));
    res.setHeader('Content-Security-Policy', "default-src 'none'");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Location', loc);
    res.end(doc);
  };
}
