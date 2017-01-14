/**
 * @module storjjs/uploader
 * @license LGPL-3.0
 */
'use strict';
var fileReaderStream = require('filereader-stream')
var concat = require('concat-stream')

// We use request for making HTTP requests to the bridge
var request = require('request');

// We use assert to test user-provided data against our expectations
var assert = require('assert');

// Client will emit events
var EventEmitter = require('events').EventEmitter;

// We use util to make Client extend EventEmitter
var util = require('util');

/**
 * Interface for uploading files to Storj Network
 * @constructor
 * @license LGPL-3.0
 * @see https://github.com/storj/storj.js
 * @param {Object} [opts] - Object to specify upload properties
 * @param {String} [opts.bridge=https://api.storj.io] - API base url
 * @param {String} [opts.protocol=http] - Protocol for downloading shards
 * @param {String} [opts.keypass] - Password for unlocking keyring.
 * @param {Number} [opts.env.concurrency] - shard upload concurrency.
 * @param {Number} [opts.env.fileconcurrency] - File upload concurrency.
 * @param {String} [opts.bucket] - Bucket files are uploaded to.
 * @param {String} [opts.filepath] - Path of files being uploaded (optional).
 * @implements {EventEmitter}
 */
function Uploader(opts) {

  // Be nice to our users. If they don't use `new`, do it for them.
  if(!(this instanceof Uploader)) {
    return new Uploader(opts);
  }

  // Scrub our incomming opts and configure our upload's properties
  this.opts = opts || {};
  assert(typeof opts === 'object', 'Uploader options must be an object');
  this._bridge = opts.bridge || Uploader.Defaults.bridge;
  this._protocol = opts.protocol || Uploader.Defaults.protocol;
  this._bucketId = opts.bucketId;
  this._request = request;
  assert(typeof this._bridge === 'string', 'Bridge url must be a string');
  assert(typeof this._protocol === 'string', 'Protocol must be a string');

  // Done setting up our uploader!
  return this;
}

/**
 * Default values for new uploader
 * @private
 */
Uploader.Defaults = {
  bridge: 'https://api.storj.io',
  protocol: 'http'
};


// Make Uploader extend the EventEmitter class
util.inherits(Uploader, EventEmitter);

/**
 * Emitttd when a download begins and a file becomes available. The file may
 * not be fully downloaded yet.
 * @event Client#file
 * @type {File}
 */

/**
 * Emitted when the client encounters an error that isn't caught by another
 * handler
 * @event Client#error
 * @type {error}
 */

/**
 * Add a new file to be downloaded by the client
 * @param {Object} opts - Information about the file to be downloaded
 * @param {String} opts.bucketId - Id of the bucket the file is in
 * @param {String} opts.fileId - If of the file to download
 * @param {Function} [opts.store] - Custom chunk store (must follow the
 * [abstract-chunk-store](https://www.npmjs.com/package/abstract-chunk-store)
 * API). In the browser, the default is memory-chunk-store, on the server it
 * is fs-chunk-store.
 * @param {String} [opts.type] - Mimetype of the file, may be required to render
 * @param {Function} [onFile] - Called when the file has started downloading
 */
Uploader.prototype.add = function add(files) {
  console.log(files)
  console.log(this._bucketId)
  var first = files[0]
  console.log(first)
  var stream = new fileReaderStream(first)

  stream.pipe(concat(function(contents) {
    // contents is the contents of the entire file
    console.log('file streamed')
    console.log(contents)
  }))

};

Uploader.prototype.getInfo = function getInfo(cb) {
  var self = this;
  request.get({
    url: `${self._bridge}/`,
    json: true,
    body: {}
  }, function (e, res, body) {
    // Ensure body is defined before trying to read its properties
    body = body || {};
    return cb(e, body);
  });

};


module.exports = Uploader;
