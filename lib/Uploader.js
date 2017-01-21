/**
 * @module storjjs/uploader
 * @license LGPL-3.0
 */
'use strict';

var fileReaderStream = require('filereader-stream')
var concat = require('concat-stream')
var storjUtils = require('storj-lib/lib/utils.js')
var sha256 = require('js-sha256')
var KeyIV = require('storj-lib/lib/crypto-tools/deterministic-key-iv.js');
var EncryptStream = require('storj-lib/lib/crypto-tools/encrypt-stream.js')
var path = require('path')

// We use request for making HTTP requests to the bridge
var request = require('request');

// We use assert to test user-provided data against our expectations
var assert = require('assert');

// Client will emit events
var EventEmitter = require('events').EventEmitter;

// We use util to make Client extend EventEmitter
var util = require('util');

// We use memory-chunk-store as the default chunk store since it works in all
// environments
var memoryChunkStore = require('memory-chunk-store');

// chunkStoreStream allows us to stream data into and out of a chunk store
var chunkStoreStream = require('chunk-store-stream');

// We use the BridgeClient for reconstructing a file given a set of pointers
var BridgeClient = require('storj-lib/lib/bridge-client');


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
  this._bridgeAuth = opts.bridgeAuth || Uploader.Defaults.bridgeAuth;
  this._chunkStore = opts.store || memoryChunkStore;
  this.fileMeta = [];
  assert(typeof this._bridge === 'string', 'Bridge url must be a string');
  assert(typeof this._protocol === 'string', 'Protocol must be a string');
  
  this._bridgeClient = new BridgeClient(this._bridge, {
    basicAuth: {
      email: 'ginneversource@gmail.com',
      password: 'test'
    }
  });

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
Uploader.prototype.add = function add(files, filepath) {
  this._filepath = filepath || '/'
  var first = files[0]
  this._fileSize = first.size
  var stream = new fileReaderStream(first)

  this._createFileToken((e, body) => {
    console.log('PUSH token received')
    console.log(body)
    console.log(this._bucketId)
    console.log(first.name)
    this._token = body

    var fileId = storjUtils.calculateFileId(this._bucketId, first.name)
    console.log('file id: ' + fileId)
    console.log('encryption key: ' + this._token.encryptionKey)

    // generate file key based on public encryptionKey
    var fileKey = KeyIV.getDeterministicKey(this._token.encryptionKey, fileId);
    console.log('filekey generated' + fileKey)
    var secret = KeyIV(fileKey, fileId);
    var tmpDir = '/'
    var tmpCleanup = function(){}

    this.fileMeta[this._filepath] = {
      filename: first.name,
      tmpDir: '/',
      tmppath: path.join(tmpDir, first.name + '.crypt'),
      tmpCleanup: tmpCleanup,
      secret: secret,
      encrypter: new EncryptStream(secret)
    };

    this._store = new this._chunkStore(this._fileSize);
    var storeStream = new chunkStoreStream.write(this._store, this._fileSize);

    stream.pipe(this.fileMeta[this._filepath].encrypter).pipe(storeStream)
    stream.on('error', this.emit.bind(this, 'error'))
    var self = this
    stream.on('end', function () {
      self.emit('ready');

      self._storeFileInBucket('/', (err, res) => {
        console.log(err)
        console.log(res)
      })
    });

  })
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

/**
 * Fetch a token for this File from the bridge.
 * @private
 */
Uploader.prototype._createFileToken = function (cb) {
  var self = this;
  //var test = request.post('http://localhost:8080/buckets/77845a36aadcb966fc76d5da/tokens/').auth('ginneversource@gmail.com', 'bushido420', false);
  //console.log(test)
  request.post({
    url: `${self._bridge}/buckets/${self._bucketId}/tokens`,
    json: true,
    body: {
      operation: 'PUSH'
    },
    auth: {
      user: 'ginneversource@gmail.com',
      pass: sha256('test')
    }
  }, function (e, res, body) {
    // Ensure body is defined before trying to read its properties
    body = body || {};
    return cb(e, body);
  });
};

Uploader.prototype._initStore = function() {
  var self = this;
  self._store = new self._chunkStore(self._fileSize);
  var stream = new chunkStoreStream.write(self._store, self._fileSize);
  self._muxer.pipe(decrypter).pipe(stream);
  self._muxer.on('error', self.emit.bind(self, 'error'));
  stream.on('error', self.emit.bind(self, 'error'));
  self._muxer.on('end', function () {
    delete self._muxer;
    self.emit('done');
  });
};

/**
 * Get the contents of the file as a Buffer
 * @param {File~getBufferCallback} cb
 */
Uploader.prototype.getBuffer = function getBuffer(cb) {
  this._store.get(0, cb);
};

Uploader.prototype._storeFileInBucket = function(filepath, cb) {
  var self = this;
  var filename = self.fileMeta[filepath].filename;
  var token = self._token;
  self.getBuffer((err, buff) => {
    self._bridgeClient.storeFileInBucket(
      self._bucketId,
      token.token,
      buff,
      this._store,
      function(err, file) {
        if (err) {
          console.log(err);
          cb(err, filepath);
          return;
        }

        console.log('Encryption key NOT saved to keyring.');
        console.log('File successfully stored in bucket.');
        console.log('info Name: ' + file.filename + 'Type: ' + file.mimetype + 'Size: ' + file.size + 'ID: ' +file.id);

        self.uploadedCount++;

        console.log('files uploaded' + self.uploadedCount +self.fileCount);
        cb(null, filepath);

        // if (self.uploadedCount === self.fileCount) {
        //   log( 'info', 'Done.');
        //   cb(null, filepath);
        // }

        //self.nextFileCallback[filepath]();

      }
    );

  })
};


module.exports = Uploader;
