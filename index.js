'use strict'

const browserify = require('browserify')
const intoStream = require('into-stream')
const through2 = require('through2')
const watchify = require('watchify')
const gutil = require('gulp-util')

/**
 * Return a vinyl transform stream.
 *
 * @param  {object|function} [opts]
 * @param  {function} [callback]
 * @return {streams.Transform}
 */
function bro(opts, callback) {
  opts = parseArguments(opts, callback)
  return transform(opts)
}

module.exports = bro

/* -------------------------------------------------------------------------- */

/**
 * Return a vinyl transform stream.
 *
 * @param  {object} opts
 * @return {streams.Transform}
 */
function transform(opts) {
  return through2.obj(function(file, encoding, next) {
    const bundler = createBundler(opts, file)
    const bundle = createBundle(bundler, opts, this, file, next)

    if (opts.watch) {
      bundler.on('update', bundle)
      bundler.on('log', log)
    }

    bundle()
  })
}

/**
 * Return a new browserify bundler.
 *
 * @param  {object} opts
 * @param  {vinyl} file
 * @return {Browserify}
 */
function createBundler(opts, file) {
  const entries = file.isNull() ? file.path : intoStream(file.contents)
  const basedir = 'string' !== typeof entries ? file.base : undefined

  let bundler = browserify({ entries, basedir })
  if (opts.watch) {
    bundler = watchify(bundler)
  }

  return bundler
}

/**
 * Return a function that bundles the given file.
 *
 * @param  {Browserify} bundler
 * @param  {object} opts
 * @param  {stream.Transform} transform
 * @param  {vinyl} file
 * @param  {function} next
 * @return {function}
 */
function createBundle(bundler, opts, transform, file, next) {
  return function() {
    let contents = new Buffer('')

    bundler.bundle()
      .on('data', data => { contents = Buffer.concat([contents, data]) })
      .on('error', createErrorHandler(opts, transform))
      .on('end', () => {
        file.contents = contents

        if (opts.callback) {
          const bundleStream = through2.obj()
          opts.callback(bundleStream)
          bundleStream.push(file)
          bundleStream.push(null)
        }
        else {
          next(null, file)
        }
      })
  }
}

/**
 * Return a new error handler.
 *
 * @param  {object} opts
 * @param  {stream.Transform} transform
 * @return {function}
 */
function createErrorHandler(opts, transform) {
  return err => {
    if (!opts.error || 'log' === opts.error) {
      const message = gutil.colors.red(err.name) + '\n' + err.toString()
        .replace(/(ParseError.*)/, gutil.colors.red('$1'))
      log(message)
    }
    else if ('emit' === opts.error) {
      transform.emit('error', err)
    }
    else if ('function' === typeof opts.error) {
      opts.error(err)
    }

    transform.emit('end')

    if (opts.callback) {
      opts.callback(through2())
    }
  }
}

/* -------------------------------------------------------------------------- */

/**
 * Parse options, arguments juggling
 *
 * @param  {object} opts
 * @param  {function} callback
 * @return {object}
 */
function parseArguments(opts, callback) {
  if ('function' === typeof opts) {
    callback = opts
    opts = {}
  }

  opts = opts || {}
  opts.callback = callback

  return opts
}

/**
 * Format and log the given message.
 *
 * @param {string} message
 */
function log(message) {
  gutil.log(`[${gutil.colors.cyan('bro')}] ${message}`)
}
