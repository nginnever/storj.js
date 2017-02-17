/**
  * @module storj/get-file
  * @license LGPL-3.0
  */

'use strict';

var calculateFileId = require('storj-lib/lib/utils.js').calculateFileId;
var KeyIV = require('storj-lib/lib/crypto-tools/deterministic-key-iv.js');
var DecryptStream = require('storj-lib/lib/crypto-tools/decrypt-stream.js');
var KeyPair = require('storj-lib/lib/crypto-tools/keypair.js');
var concat = require('concat-stream')

module.exports = function(self) {
  // TODO: implement
  /**
    * Conveinence function for emitting an error. If there is a registered
    * listener on the File, then we will emit there, otherwise we will attempt to
    * emit on the client. If there is not a client, we throw the error. Client may
    * throw an unhandled error event exception if no listeners are registered.
    * @private
   */

  var initDecryption = function(cb) {
    var key = KeyIV.getDeterministicKey(self._key.getPrivateKey(), self._file);
    var secret = new KeyIV(key, self._file);
    var decrypter = new DecryptStream(secret);
    self._muxer.pipe(decrypter);
    self._muxer.on('error', self.emit.bind(self, 'error'));
    var concatStream = concat(gotPicture)
    decrypter.pipe(concatStream)

    function gotPicture(img) {
      if(cb){
        return cb(null, img);
      }
      return img;
    } 
  }

  var _error = function (e) {
    // if(this.listenerCount('error') > 0) {
    //   return this.emit('error', e);
    // }
    // if(self._client) {
    //   return self._client.emit('error', e);
    // }
    throw e;
  };

  /*
   * Get a file stream by bucketId and fileId
   * @param bucketId
   * @param fileId
  */
  return function(bucketId, fileId, cb){
    // First grab the the token for downloading the file
    self.createFileToken(bucketId, function(e, body) {
      if(body.encryptionKey === '' && self._key === undefined) {
        if(cb) {
          return cb(new Error('You must supply a decryption key for private buckets.'), null);
        };
        throw new Error('You must supply a decryption key for private buckets.');
      };

      if(body.encryptionKey !== '') {
        self._key = new KeyPair(body.encryptionKey);
      };

      self._file = fileId;
      self._bucketId = bucketId;
      if(e) { return _error(e); }
      self._token = body.token;
      self._id = body.id;
      self._mimetype = body.mimetype;
      // If successful, try to resolve the file pointers
      self.getFilePointers(function(e, pointers) {
        if(e) { return _error(e); }
        // We now have a reference to every piece of our file, let's assemble it!
        self.resolveFileFromPointers(pointers, {}, function (e, muxer) {
          if(e) { return _error(e); }
          self._muxer = muxer;
          self.emit('ready');
          initDecryption(cb);
        });
      });
    });
  }
}
