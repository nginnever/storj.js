'use strict';

var KeyPair = require('storj-lib/lib/crypto-tools/keypair');

module.exports = function bucket (self) {
  const _internal = function(cb) {

  }

  const createBucket = function(name, opts, cb) {
    if(typeof opts === 'function') {
      cb = opts;
      opts = null;
    }

    // Require key auth
    if(!self._key) {
      self._key = new KeyPair();
      //return cb(new Error('Must generate a key!'));
    }

    self._client.createBucket({
      pubkeys: [
        self._key.getPublicKey()
      ],
      name
    }, function(e, meta) {
      if(e) {
        return cb(e);
      }
      return cb(null, {
        id: meta.id
      });
    });
  };

  const getBucket = function(id, cb) {
    self._client.getBucketById(id, function(e, resp) {
      if(e) {
        return cb(e);
      }
      self._client.listFilesInBucket(id, function(e, files) {
        if(e) {
          return cb(e);
        }

        resp.files = files
        return cb(null, resp);
      });
    });
  };

  const getBuckets = function(cb) {
    self._client.getBuckets(function(e, resp) {
      if(e) {
        return cb(e);
      }

      return cb(null, resp.map((v) => ({ id: v.id, name: v.name}) ));
    });
  };

  const deleteBucket = function(id, cb) {
    self._client.destroyBucketById(id, cb);
  };

  /**
    * makes a specific storage bucket public, uploading bucket key to bridge
    * @param
  */

  const makePublic = function(id, env, cb) {
    if(typeof env === 'function') {
      cb = env;
      env = {};
    }
    var publicPush = env.push ? true : false;
    var publicPull = env.pull ? true : false;

    publicPull = true
    publicPush = true
    var _finish = function(permissions, bucketKey) {
      self._client.updateBucketById(id, {
        publicPermissions: permissions,
        encryptionKey: bucketKey
      }, function(err, bucket) {
        if (err) {
          return log('error', err.message);
        }
        var updatedPull = bucket.publicPermissions.includes('PULL');
        var updatedPush = bucket.publicPermissions.includes('PUSH');
        var key = bucket.encryptionKey.length === 0 ? null : bucket.encryptionKey;
        cb(null, [bucket.id, bucket.name, updatedPull, updatedPush, key])
      });
    };

    var permissions = [];
    if (publicPull) {
      permissions.push('PULL');
    }
    if (publicPush) {
      permissions.push('PUSH');
    }

    if (permissions.length === 0) {
      return _finish([], '');
    }

    //generate randpm key until keyring is implemented
    var key = new KeyPair();
    _finish(permissions, key.getPrivateKey());

  }

  return { createBucket, getBucket, getBuckets, deleteBucket, makePublic };
}
